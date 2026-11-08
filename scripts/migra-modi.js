#!/usr/bin/env node
/**
 * scripts/migra-modi.js
 *
 * Migrazione esplicita alla «tabula rasa» del ticket 01: i profili diventano le
 * cinque modalità dell'account. NON è un effetto collaterale della lettura: qui
 * si esegue solo a mano, con `--conferma`.
 *
 * Cosa fa, per ogni AddonConfig:
 *   1. materializza le cinque caselle (`generale`, `film`, `serie`, `anime`,
 *      `bambini`) senza toccare i profili esistenti, che restano nel documento;
 *   2. svuota i cataloghi attivi di TUTTE e cinque le modalità (`config.cataloghi`);
 *   3. azzera i cursori per profilo (`profiles[].settings.sliders`,
 *      `profiles[].sliders` e l'alias `slider`): i cursori sono d'account;
 *   4. fissa `config.activeModo` sul modo oggi rappresentato dal profilo attivo
 *      (il ponte `modoDaSelettori`), e `config.activeProfileId` sulla sua casella;
 *   5. toglie `config.manifestFingerprint` e alza `config.pendingStremioResync`:
 *      al prossimo avvio il reconciler bumpa `configVersion` e Stremio vede il
 *      nuovo manifest (ticket 04).
 *
 * NON tocca `customCatalogs` (ticket 01: restano dell'account).
 *
 * SICUREZZA:
 *   node scripts/migra-modi.js                      # solo stampa il piano
 *   node scripts/migra-modi.js --conferma           # esegue
 *   node scripts/migra-modi.js --conferma --uuid=<addonUuid>
 *   node scripts/migra-modi.js --conferma --userId=<userId>
 *
 * Nota: i cataloghi attivi non vengono mappati. È la scelta del ticket 01
 * (si perdono 77 attivazioni sull'account reale): nessuna logica di fusione.
 */

const path = require('path');
const fs = require('fs');

const envPath = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../YACA/.env'),
    path.resolve(__dirname, '../../../YACA/.env')
].find(p => fs.existsSync(p));

if (envPath) {
    require('dotenv').config({ path: envPath });
} else {
    require('dotenv').config();
}

const mongoose = require('mongoose');
const { connectMongo } = require('../src/infra/mongoConnect');
const AddonConfig = require('../src/models/AddonConfig');
const { MODI, materializzaModi, modoDaSelettori, normalizzaModo } = require('../src/profile/modo');
const { accountDi } = require('../src/configurazione');

function argomento(nome) {
    const prefisso = `--${nome}=`;
    const trovato = process.argv.find(a => a.startsWith(prefisso));
    return trovato ? trovato.slice(prefisso.length) : null;
}

const CONFERMA = process.argv.includes('--conferma');

function profiliPlani(profiles) {
    return (Array.isArray(profiles) ? profiles : []).map(profilo => {
        const piano = profilo && typeof profilo.toObject === 'function' ? profilo.toObject() : { ...(profilo || {}) };
        if (piano.id === undefined && piano._id !== undefined) piano.id = String(piano._id);
        delete piano._id;
        return piano;
    });
}

function cataloghiVuoti() {
    const vuoti = {};
    for (const modo of MODI) vuoti[modo] = [];
    return vuoti;
}

/**
 * Calcola in memoria il documento migrato. Pura: usata sia dal piano stampato
 * sia dalla scrittura, così ciò che si legge è ciò che si applica.
 */
function pianoMigrazione(documento) {
    const profiliPrima = profiliPlani(documento.profiles);
    const caselle = materializzaModi({ profiles: [...profiliPrima] });
    const profiliDopo = caselle.profiles.map(profilo => {
        const copia = { ...profilo };
        const settings = copia.settings && typeof copia.settings === 'object' ? { ...copia.settings } : {};
        delete settings.sliders;
        delete settings.slider;
        copia.settings = settings;
        delete copia.sliders;
        delete copia.slider;
        return copia;
    });

    const configPrima = documento.config && typeof documento.config === 'object' ? documento.config : {};
    const activeProfileIdPrima = configPrima.activeProfileId;
    const profiloAttivoPrima = profiliPrima.find(p => String(p.id) === String(activeProfileIdPrima)) || profiliPrima[0] || null;
    const modoAttivo = profiloAttivoPrima
        ? (normalizzaModo(profiloAttivoPrima.modo) || modoDaSelettori(profiloAttivoPrima.settings?.typeSelectors, profiloAttivoPrima.settings?.kidsMode))
        : 'generale';
    const modoValido = MODI.includes(modoAttivo) ? modoAttivo : 'generale';
    const casellaModo = profiliDopo.find(p => normalizzaModo(p.modo) === modoValido) || null;

    return {
        profiliPrima,
        profiliDopo,
        profiliNuovi: profiliDopo.length - profiliPrima.length,
        activeModo: modoValido,
        activeProfileId: casellaModo?.id || activeProfileIdPrima || 'global',
        cataloghiPrima: configPrima.cataloghi || {},
        cataloghiDopo: cataloghiVuoti()
    };
}

function riassuntoPiano(uuid, piano) {
    const contenuto = il => {
        const lista = il && typeof il === 'object' ? Object.values(il).flat() : [];
        return Array.isArray(lista) ? lista.length : 0;
    };
    return {
        uuid,
        caselleCreate: Math.max(0, piano.profiliNuovi),
        modalitaAttiva: piano.activeModo,
        profiloAttivo: piano.activeProfileId,
        cataloghiAttiviPrima: contenuto(piano.cataloghiPrima),
        cataloghiAttiviDopo: 0,
        // Il dato che conta: le attivazioni che vivono nei profili esistenti e che
        // questa migrazione scarta. Senza, il piano direbbe «0» e sembrerebbe innocuo.
        cataloghiNeiProfiliScartati: (piano.profiliPrima || [])
            .reduce((n, p) => n + (Array.isArray(p.catalogs) ? p.catalogs.length : 0), 0),
        profiliConCursoriDaAzzerare: piano.profiliPrima.filter(p =>
            p.sliders || p.slider || p.settings?.sliders || p.settings?.slider
        ).length,
        customCatalogs: 'invariati'
    };
}

async function migraModi() {
    const uuidFiltro = argomento('uuid');
    const userIdFiltro = argomento('userId');

    let query = {};
    if (uuidFiltro) {
        query = { uuid: uuidFiltro };
    } else if (userIdFiltro) {
        const account = await accountDi(userIdFiltro);
        if (!account?.addonUuid) throw new Error(`Nessun addonUuid per userId ${userIdFiltro}.`);
        query = { uuid: account.addonUuid };
    }

    const documenti = await AddonConfig.find(query).lean();
    const piani = documenti.map(documento => ({ documento, piano: pianoMigrazione(documento) }));

    console.log(`[MigrazioneModi] ${piani.length} document${piani.length === 1 ? 'o' : 'i'} esaminat${piani.length === 1 ? 'o' : 'i'}.`);
    for (const { documento, piano } of piani) {
        console.log('[MigrazioneModi] piano:', JSON.stringify(riassuntoPiano(documento.uuid, piano)));
    }

    if (!CONFERMA) {
        console.log('\n[MigrazioneModi] DRY-RUN: non ho scritto niente.');
        console.log('[MigrazioneModi] Per applicare davvero, rilancia con `--conferma`.');
        console.log('[MigrazioneModi] Scarta i profili esistenti: si perdono le attivazioni per profilo.');
        return { applicato: false, documenti: piani.length };
    }

    let aggiornati = 0;
    for (const { documento, piano } of piani) {
        // `$unset` dell'impronta: al prossimo giro del reconciler il manifest
        // cambia, `configVersion` bumpa e Stremio riceve la nuova collezione.
        await AddonConfig.updateOne(
            { uuid: documento.uuid },
            {
                $set: {
                    profiles: piano.profiliDopo,
                    'config.activeModo': piano.activeModo,
                    'config.activeProfileId': piano.activeProfileId,
                    'config.cataloghi': piano.cataloghiDopo,
                    'config.pendingStremioResync': true
                },
                $unset: { 'config.manifestFingerprint': '' }
            }
        );
        aggiornati += 1;
    }

    console.log(`[MigrazioneModi] Applicata su ${aggiornati} document${aggiornati === 1 ? 'o' : 'i'}.`);
    console.log('[MigrazioneModi] I cataloghi attivi vanno riattivati da Esplora. `customCatalogs` non è stato toccato.');
    return { applicato: true, documenti: aggiornati };
}

async function main() {
    let exitCode = 0;
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) throw new Error('MONGODB_URI mancante nelle variabili d\'ambiente.');
        await connectMongo(mongoUri);
        await migraModi();
        if (!CONFERMA) exitCode = 0;
    } catch (err) {
        console.error('[MigrazioneModi] Errore critico:', err.message);
        exitCode = 1;
    } finally {
        try {
            await mongoose.disconnect();
        } catch (_e) {}
        process.exit(exitCode);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    pianoMigrazione,
    migraModi,
    cataloghiVuoti
};
