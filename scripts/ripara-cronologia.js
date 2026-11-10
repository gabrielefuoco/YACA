#!/usr/bin/env node
/**
 * Corregge i dati di visione della cronologia, senza togliere voci.
 *
 * IL DANNO. `episodesWatched` cresceva di uno a ogni sincronizzazione invece che per
 * visione (valori come 401796), e `lastWatchedAt` veniva messo a `new Date()` quando la
 * sorgente non dichiarava una data: titoli «visti oggi» che nessuno aveva guardato oggi.
 *
 * COSA FA. Per ogni titolo in `global`:
 *   1. cerca la data vera nella libreria Stremio (`userlibraryitems.state.lastWatched`,
 *      incrociata per nome e anno, perché la libreria non conserva il tmdbId);
 *   2. se la libreria non la conserva, usa la data che Trakt aveva già scritto;
 *   3. se nessuna delle due esiste, la data si toglie: l'età resta ignota invece di
 *      diventare «oggi».
 *   4. `episodesWatched` diventa il conteggio dichiarato da Stremio (`state.timesWatched`)
 *      quando è maggiore di zero, altrimenti 1 — cioè «almeno una visione».
 *
 * Le voci non si eliminano: cambiano i numeri e le date.
 *
 * USO
 *   node scripts/ripara-cronologia.js            → prova
 *   node scripts/ripara-cronologia.js --conferma → applica
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const normalizza = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Nomi con cui un titolo può comparire in libreria. */
const ALIAS = {
    94664: ['mushoku tensei jobless reincarnation'],
    4556: ['scrubs medici ai primi ferri'],
    295778: ['scrubs']
};

/**
 * La data vera di visione, dalla libreria Stremio.
 *
 * La libreria non conserva il tmdbId (`mapped: false`), quindi si incrocia per nome:
 * corrispondenza esatta, oppure contenimento verificato dall'anno. Quando un titolo
 * compare più volte vince la visione più recente.
 */
function dataDaLibreria(titolo, libreria) {
    const chiavi = [normalizza(titolo.nome), ...(ALIAS[titolo.tmdbId] || [])].filter(Boolean);
    const candidati = libreria.filter(item => {
        const nome = normalizza(item.name);
        if (!nome) return false;
        const nomeCombacia = chiavi.some(k => nome === k || nome.includes(k) || k.includes(nome));
        if (!nomeCombacia) return false;
        // L'anno decide i casi ambigui: «Scrubs» (2026) non è «Scrubs - Medici ai primi
        // ferri» (2001). Senza questo controllo una serie prendeva la data di un remake.
        if (titolo.anno && item.year) {
            const scarto = Math.abs(Number(item.year) - Number(titolo.anno));
            if (Number.isFinite(scarto) && scarto > 1) return false;
        }
        return true;
    });
    let migliore = null;
    for (const c of candidati) {
        const quando = c.state?.lastWatched ? new Date(c.state.lastWatched) : null;
        if (!quando || Number.isNaN(quando.getTime())) continue;
        if (!migliore || quando > migliore.quando) {
            migliore = {
                quando,
                conteggio: Number(c.state?.timesWatched) || 0,
                nome: c.name,
                anno: c.year || null
            };
        }
    }
    return migliore;
}

async function main() {
    const conferma = process.argv.includes('--conferma');
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI assente: impossibile procedere.');
        process.exit(1);
    }

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const cronologia = db.collection('watchhistories');

    const documenti = await cronologia.find({ context: 'global' }).toArray();
    const libreria = await db.collection('userlibraryitems')
        .find({ removed: { $ne: true } }, { projection: { name: 1, year: 1, state: 1 } })
        .toArray();
    console.log(`documenti da correggere: ${documenti.length} | elementi in libreria: ${libreria.length}\n`);

    // I documenti di cronologia non conservano il titolo: serve per incrociare la libreria.
    const { getDuckDbMetaDetails } = require('../src/indice/duckDbProvider');
    const nomiPerTmdb = new Map();
    const nomeDi = async (tmdbId, tipo) => {
        const chiave = `${tmdbId}:${tipo}`;
        if (nomiPerTmdb.has(chiave)) return nomiPerTmdb.get(chiave);
        let voce = { nome: '', anno: null };
        try {
            const meta = await getDuckDbMetaDetails(tmdbId, tipo === 'tv' ? 'series' : 'movie');
            const anno = Number(meta?.year || String(meta?.releaseInfo || meta?.release_date || '').slice(0, 4));
            voce = {
                nome: meta?.name || meta?.title || meta?.titolo || '',
                anno: Number.isFinite(anno) && anno > 1900 ? anno : null
            };
        } catch (_e) { voce = { nome: '', anno: null }; }
        nomiPerTmdb.set(chiave, voce);
        return voce;
    };

    const piano = [];
    for (const doc of documenti) {
        const segnali = Array.isArray(doc.signals) ? doc.signals : [];
        const { nome, anno } = await nomeDi(doc.tmdbId, doc.type);

        // 1. data Trakt già registrata (è vera: porta la data dell'episodio)
        const dateTrakt = segnali
            .filter(s => s?.source === 'trakt' && s.at)
            .map(s => new Date(s.at))
            .filter(d => !Number.isNaN(d.getTime()));
        const ultimaTrakt = dateTrakt.length > 0
            ? new Date(Math.max(...dateTrakt.map(d => d.getTime())))
            : null;

        // 2. data vera dalla libreria Stremio (per i segnali Stremio, che non ne avevano una)
        const daLibreria = dataDaLibreria({ tmdbId: doc.tmdbId, nome, anno }, libreria);

        // Fra due date vere vince la più recente: è l'ultima visione, non la prima.
        const candidate = [daLibreria?.quando, ultimaTrakt].filter(Boolean);
        const dataScelta = candidate.length > 0
            ? new Date(Math.max(...candidate.map(d => d.getTime())))
            : null;
        const fonte = !dataScelta
            ? 'nessuna'
            : (daLibreria?.quando && dataScelta.getTime() === daLibreria.quando.getTime()
                ? `libreria ("${daLibreria.nome}")`
                : 'trakt');
        const conteggio = Math.max(1, daLibreria?.conteggio || 0);

        // 3. i segnali Stremio non portano più una data inventata: o quella vera, o niente
        const segnaliNuovi = segnali.map(s => {
            if (s?.source === 'trakt') return s;
            const { at, ...resto } = s || {};
            return dataScelta ? { ...resto, at: dataScelta } : resto;
        });

        piano.push({
            _id: doc._id,
            tmdbId: doc.tmdbId,
            tipo: doc.type,
            nome,
            prima: {
                visioni: Number(doc.episodesWatched) || 0,
                data: doc.lastWatchedAt ? new Date(doc.lastWatchedAt).toISOString().slice(0, 10) : null
            },
            dopo: {
                visioni: conteggio,
                data: dataScelta ? dataScelta.toISOString().slice(0, 10) : null
            },
            fonte,
            aggiornamento: {
                $set: {
                    episodesWatched: conteggio,
                    signals: segnaliNuovi,
                    ...(dataScelta ? { lastWatchedAt: dataScelta } : {})
                },
                ...(dataScelta ? {} : { $unset: { lastWatchedAt: '' } })
            }
        });
    }

    piano.sort((a, b) => a.prima.visioni - b.prima.visioni);
    console.log('tmdb   | visioni        | data                | fonte');
    console.log('-------+----------------+---------------------+---------------------');
    for (const p of piano) {
        const visioni = `${String(p.prima.visioni).padStart(6)} → ${String(p.dopo.visioni).padEnd(3)}`;
        const data = `${p.prima.data || '—'} → ${p.dopo.data || 'ignota'}`;
        console.log(`${String(p.tmdbId).padEnd(6)} | ${visioni} | ${data.padEnd(19)} | ${p.fonte} ${p.nome ? `· ${p.nome}` : ''}`);
    }

    const cambia = piano.filter(p =>
        p.prima.visioni !== p.dopo.visioni ||
        (p.prima.data || null) !== (p.dopo.data || null)
    ).length;
    console.log(`\ndocumenti che cambiano: ${cambia} / ${piano.length}`);
    console.log(`date vere recuperate: ${piano.filter(p => p.dopo.data).length}`);
    console.log(`date che restano ignote: ${piano.filter(p => !p.dopo.data).length}`);

    if (!conferma) {
        console.log('\nPROVA. Non è stato scritto niente. Rilancia con --conferma per applicare.');
        await mongoose.disconnect();
        return;
    }

    let applicate = 0;
    for (const p of piano) {
        const esito = await cronologia.updateOne({ _id: p._id }, p.aggiornamento);
        applicate += esito.modifiedCount || 0;
    }
    console.log(`\nAPPLICATO: ${applicate} documenti corretti.`);
    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error('Errore durante la correzione:', err.message);
    try { await mongoose.disconnect(); } catch (_e) { /* niente */ }
    process.exit(1);
});
