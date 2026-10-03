#!/usr/bin/env node

/**
 * bench_learned_names.js — quanta latenza aggiunge la ricerca nell'archivio dei nomi appresi.
 *
 * Il numero che conta e' uno solo: **quanto costa in piu' a ogni ricerca** la terza fonte
 * (i nomi appresi), rispetto a una ricerca che non la consulta. Il banco prova due casi:
 *   - il **percorso comune**: ricerca con molti risultati gia' (la tabella viene comunque
 *     interrogata, e magari non trova nulla di nuovo);
 *   - la ricerca con **zero risultati**: il caso in cui la tabella e' l'unica che puo' salvare
 *     la risposta, e quindi l'uno in cui il ritardo pesa di piu' per l'utente.
 *
 * Misura su un archivio di prova (nessun dato di produzione toccato) a varie dimensioni,
 * cosi' si vede se il costo cresce con le righe.
 *
 * Uso:  node scripts/bench_learned_names.js [--rows 500,5000,20000]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { LearnedNamesStore, normalizeText, titleTokens, MAX_ROWS } = require('../src/db/learnedNames');

/** Parole italiane: rendono i token della ricerca uguali a quelli che salva la tabella. */
const PAROLE = ['citta', 'degli', 'spiriti', 'notte', 'ombra', 'giardino', 'segreto', 'vento', 'fuoco', 'pietra'];

/** `n` nomi imparati plausibili, con id e anno distinti. */
function righe(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const a = PAROLE[i % PAROLE.length];
        const b = PAROLE[(i * 7 + 3) % PAROLE.length];
        const titolo = `Titolo Appreso ${a} ${b} ${i}`;
        out.push({
            tmdbId: 100000 + i,
            type: 'movie',
            titleIt: titolo,
            originalTitle: `Original Learned Title ${i}`,
            year: String(1960 + (i % 60))
        });
    }
    return out;
}

/** Media, minimo e massimo su N esecuzioni (ms). */
function misura(fn, volte = 200) {
    const tempi = [];
    for (let i = 0; i < volte; i++) {
        const t0 = process.hrtime.bigint();
        fn(i);
        const t1 = process.hrtime.bigint();
        tempi.push(Number(t1 - t0) / 1e6);
    }
    const media = tempi.reduce((a, b) => a + b, 0) / tempi.length;
    return {
        avg: Number(media.toFixed(3)),
        min: Number(Math.min(...tempi).toFixed(3)),
        max: Number(Math.max(...tempi).toFixed(3))
    };
}

function riga(etichetta, m, extra = '') {
    console.log(`  ${etichetta.padEnd(46)} media ${String(m.avg).padStart(7)} ms   min ${String(m.min).padStart(7)}   max ${String(m.max).padStart(7)}  ${extra}`);
}

async function main() {
    const argRows = process.argv.includes('--rows')
        ? process.argv[process.argv.indexOf('--rows') + 1]
        : null;
    const dimensioni = (argRows ? argRows.split(',').map(Number) : [500, 5000, MAX_ROWS]);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-learned-bench-'));
    console.log(`[bench] Archivio di prova: ${dir}`);
    console.log(`[bench] Tetto di crescita della tabella in produzione: ${MAX_ROWS} righe\n`);

    try {
        for (const n of dimensioni) {
            const dbPath = path.join(dir, `learned_${n}.db`);
            const store = new LearnedNamesStore({ dbPath });
            const voci = righe(n);
            for (let i = 0; i < voci.length; i += 5000) {
                store.write(voci.slice(i, i + 5000));
            }
            const righeInTabella = store.count();
            // In WAL i dati stanno anche nei file `-wal`: si sommano per non mentire sulla dimensione.
            const peso = ['learned_names.db', `learned_${n}.db-wal`, `learned_${n}.db-shm`]
                .map(f => path.join(dir, f))
                .filter(f => fs.existsSync(f))
                .reduce((tot, f) => tot + fs.statSync(f).size, 0);

            console.log(`Tabella con ${righeInTabella} nomi imparati (${(peso / 1024).toFixed(0)} KB su disco, WAL compreso)`);

            // Percorso comune: la ricerca ha gia' trovato tanto, la tabella aggiunge in coda.
            const tokensComune = titleTokens('la citta degli spiriti');
            store.search(tokensComune, { type: 'movie', limit: 5 });
            riga('percorso comune (con risultati, warm)', misura(() => store.search(tokensComune, { type: 'movie', limit: 5 })));

            // Zero risultati: la ricerca non trova niente e la tabella restituisce [].
            const tokensZero = titleTokens('xyzzy foil ary');
            store.search(tokensZero, { type: 'movie', limit: 5 });
            riga('zero risultati (warm)', misura(() => store.search(tokensZero, { type: 'movie', limit: 5 })), '[]');

            // Testo corto, il caso piu' frequente.
            const tokensBreve = titleTokens('spiriti');
            store.search(tokensBreve, { type: 'movie', limit: 5 });
            riga('parola singola (warm)', misura(() => store.search(tokensBreve, { type: 'movie', limit: 5 })));

            // La normalizzazione del testo cercato: costa anche senza archivio.
            riga('normalizzazione del testo (nessun archivio)', misura(() => normalizeText('la citta degli spiriti')));

            // Prima ricerca dopo l'apertura: quanto costa il file che si apre.
            const freddo = new LearnedNamesStore({ dbPath });
            const t0 = process.hrtime.bigint();
            freddo.search(tokensComune, { type: 'movie', limit: 5 });
            const t1 = process.hrtime.bigint();
            console.log(`  ${'prima ricerca in assoluto (apre il file)'.padEnd(46)} ${(Number(t1 - t0) / 1e6).toFixed(3)} ms`);
            freddo.close();

            // Cosa costa l'altra faccia della medaglia: imparare i nomi di **una pagina** (20
            // titoli). Lo fa l'arricchimento in background, quindi non e' nella risposta, ma
            // occupa il ciclo di eventi: va saputo.
            const pagina = [];
            for (let i = 0; i < 20; i++) {
                pagina.push({
                    tmdbId: 900000 + n * 100 + i,
                    type: 'movie',
                    titleIt: `Titolo Pagina ${i} ${n}`,
                    originalTitle: `Original Page ${i} ${n}`,
                    year: '2001'
                });
            }
            store.write(pagina);   // scaldamento (crea tabella/WAL)
            riga('scrittura di una pagina di 20 nomi', misura(() => {
                pagina[0].tmdbId += 100;   // id nuovo: la scrittura non viene ignorata
                store.write(pagina);
            }, 100), 'fuori dalla risposta');

            store.close();
            console.log('');
        }

        // Il costo quando l'archivio **non esiste**: cioe' il caso di oggi, e quello di un
        //'installazione' che non ha ancora imparato niente.
        const assente = new LearnedNamesStore({ dbPath: path.join(dir, 'non-esiste.db') });
        const t0 = process.hrtime.bigint();
        assente.search(titleTokens('la citta degli spiriti'), { type: 'movie', limit: 5 });
        const t1 = process.hrtime.bigint();
        console.log(`Archivio assente: ${(Number(t1 - t0) / 1e6).toFixed(4)} ms (un semplice controllo che il file esista)`);
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch (_err) { /* il SO tiene il file */ }
    }
}

if (require.main === module) {
    main().then(() => process.exit(0)).catch(err => {
        console.error('[bench] Errore:', err);
        process.exit(1);
    });
}

module.exports = { main, righe, misura };
