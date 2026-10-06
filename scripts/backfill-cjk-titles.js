#!/usr/bin/env node

/**
 * backfill-cjk-titles.js
 *
 * Script una-tantum per il backfill dei titoli compromessi in caratteri giapponesi/CJK (Ticket 14).
 * Interroga TMDB con `append_to_response=translations`, estrae `name_en`/`title_en`
 * e riallinea il campo mostrato secondo la policy IT -> EN -> JA.
 *
 * Utilizzo:
 *   node scripts/backfill-cjk-titles.js [opzioni]
 *
 * Opzioni:
 *   --visible-only     (Consigliato) Limita il backfill ai soli titoli visibili all'utente
 *                      (Serie con popolarità >= 5, Film con vote_count >= 50 o popolarità >= 5).
 *                      Perimetro: ~694 titoli (~3.3 minuti).
 *   --all              Elabora tutti i titoli compromessi con CJK (~2.561 titoli, ~12.2 minuti).
 *   --type=tv|movies   Limita l'elaborazione a sole serie TV o soli Film (default: all).
 *   --limit=N          Elabora al massimo N titoli.
 *   --delay=MS         Pausa tra chiamate TMDB in ms (default: 285ms, cadenza del daemon).
 *   --dry-run          Simula l'esecuzione: calcola ID, costi e tempi senza chiamate di rete né scritture.
 *   --data-dir=DIR     Directory dei dati (default: .cache/tmdb o /data/tmdb).
 *   -h, --help         Mostra questo messaggio.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');

const TmdbDumpStore = require('../src/utils/tmdbDumpStore');
const TmdbDumpClient = require('../src/utils/tmdbDumpClient');
const { convert } = require('./convert_to_parquet');

const CJK = '[ぁ-ヿ一-鿿]';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCliArgs(argv = process.argv.slice(2)) {
    const options = {
        visibleOnly: true, // Default: bacino visibile consigliato dai fatti del ticket 14
        type: 'all',
        limit: null,
        delayMs: 285,
        dryRun: false,
        dataDir: null,
        help: false
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '-h' || arg === '--help') {
            options.help = true;
        } else if (arg === '--all') {
            options.visibleOnly = false;
        } else if (arg === '--visible-only') {
            options.visibleOnly = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg.startsWith('--type=')) {
            options.type = arg.slice(7).toLowerCase();
        } else if (arg.startsWith('--limit=')) {
            options.limit = parseInt(arg.slice(8), 10);
        } else if (arg.startsWith('--delay=')) {
            options.delayMs = parseInt(arg.slice(8), 10);
        } else if (arg.startsWith('--data-dir=')) {
            options.dataDir = path.resolve(arg.slice(11));
        }
    }

    return options;
}

function resolveDataDir(customDir) {
    if (customDir) return path.resolve(customDir);
    if (process.env.TMDB_DUMP_DIR && fs.existsSync(process.env.TMDB_DUMP_DIR)) {
        return path.resolve(process.env.TMDB_DUMP_DIR);
    }
    const localCache = path.resolve(__dirname, '../.cache/tmdb');
    if (fs.existsSync(localCache)) return localCache;
    return path.resolve(__dirname, '../.scratch/brainstorm/data');
}

async function findCompromisedIds(dataDir, mediaType, visibleOnly) {
    const parquetFile = path.join(dataDir, `${mediaType}.parquet`);
    if (!fs.existsSync(parquetFile)) {
        console.warn(`[Backfill] File ${parquetFile} non trovato.`);
        return [];
    }

    const db = new duckdb.Database(':memory:');
    const con = db.connect();
    const q = (sql) => new Promise((res, rej) => con.all(sql, (e, r) => e ? rej(e) : res(r)));

    try {
        const sqlPath = parquetFile.replace(/\\/g, '/');
        const titleField = mediaType === 'movies' ? 'title' : 'name';
        let filter = `original_language = 'ja' AND regexp_matches(${titleField}, '${CJK}')`;

        if (visibleOnly) {
            if (mediaType === 'tv') {
                filter += ` AND popularity >= 5`;
            } else {
                filter += ` AND (vote_count >= 50 OR popularity >= 5)`;
            }
        }

        const rows = await q(`SELECT id, ${titleField} AS title, popularity, vote_count FROM read_parquet('${sqlPath}') WHERE ${filter} ORDER BY popularity DESC`);
        return rows.map(r => ({
            id: Number(r.id),
            title: r.title,
            popularity: Number(r.popularity || 0),
            vote_count: Number(r.vote_count || 0)
        }));
    } finally {
        con.close();
        db.close();
    }
}

async function runBackfill() {
    const options = parseCliArgs();

    if (options.help) {
        console.log(`Uso: node scripts/backfill-cjk-titles.js [opzioni]
  --visible-only     Limita ai soli titoli visibili (pop >= 5 / vc >= 50) [default]
  --all              Elabora tutti i titoli CJK compromessi
  --type=tv|movies   Limita a sole serie o soli film
  --limit=N          Max N titoli
  --delay=MS         Pausa tra chiamate TMDB in ms (default: 285)
  --dry-run          Simulazione senza chiamate TMDB né scritture
  --data-dir=DIR     Percorso cartella parquet/jsonl`);
        return;
    }

    const dataDir = resolveDataDir(options.dataDir);
    console.log(`[Backfill] Modalità: ${options.visibleOnly ? 'SOLO TITOLI VISIBILI (consigliato)' : 'TUTTI I TITOLI CJK'}`);
    console.log(`[Backfill] Directory dati: ${dataDir}`);
    console.log(`[Backfill] Dry Run: ${options.dryRun ? 'SÌ' : 'NO'}`);

    const tvItems = (options.type === 'all' || options.type === 'tv')
        ? await findCompromisedIds(dataDir, 'tv', options.visibleOnly)
        : [];
    const movieItems = (options.type === 'all' || options.type === 'movies')
        ? await findCompromisedIds(dataDir, 'movies', options.visibleOnly)
        : [];

    let totalToProcess = tvItems.length + movieItems.length;
    if (options.limit && options.limit > 0 && options.limit < totalToProcess) {
        totalToProcess = options.limit;
    }

    const delaySeconds = (options.delayMs || 285) / 1000;
    const estimatedSeconds = Math.round(totalToProcess * delaySeconds);
    const estimatedMinutes = (estimatedSeconds / 60).toFixed(1);

    console.log('\n=== STIMA COSTO E TEMPI BACKFILL ===');
    console.log(`  Serie TV da sanare: ${tvItems.length}`);
    console.log(`  Film da sanare:     ${movieItems.length}`);
    console.log(`  Totale titoli:      ${tvItems.length + movieItems.length}`);
    if (options.limit) console.log(`  Limite applicato:   ${options.limit}`);
    console.log(`  Chiamate TMDB:      ${totalToProcess} chiamate API (1 per titolo via append_to_response=translations)`);
    console.log(`  Costo monetario:    0 € (API TMDB gratuita, entro i limiti di 40 req/10s)`);
    console.log(`  Tempo stimato:      ~${estimatedMinutes} minuti (~${estimatedSeconds}s a ${options.delayMs}ms/req)`);

    if (options.dryRun) {
        console.log('\n[Backfill] Esecuzione in modalità --dry-run: nessuna chiamata effettuata.');
        if (tvItems.length > 0) {
            console.log(`\nEsempio prime 5 serie TV da sanare:`);
            tvItems.slice(0, 5).forEach(t => console.log(`  [TV ${t.id}] "${t.title}" (pop: ${t.popularity}, voti: ${t.vote_count})`));
        }
        if (movieItems.length > 0) {
            console.log(`\nEsempio primi 5 film da sanare:`);
            movieItems.slice(0, 5).forEach(m => console.log(`  [Movie ${m.id}] "${m.title}" (pop: ${m.popularity}, voti: ${m.vote_count})`));
        }
        return { success: true, dryRun: true, totalToProcess, estimatedMinutes };
    }

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        throw new Error('TMDB_API_KEY non definita in .env. Impossibile procedere con il fetch TMDB.');
    }

    const client = new TmdbDumpClient(apiKey);
    const store = new TmdbDumpStore();
    store.basePath = dataDir;

    let processed = 0;
    const tvRows = [];
    const movieRows = [];

    // 1. Process TV
    for (const item of tvItems) {
        if (options.limit && processed >= options.limit) break;
        console.log(`[Backfill] [${processed + 1}/${totalToProcess}] Fetch TV ${item.id} ("${item.title}")...`);
        const row = await client.fetchTv(item.id, { bypassVoteFloor: true });
        if (row) {
            console.log(`  -> Corretto in: "${row.name}" (EN: "${row.name_en}")`);
            tvRows.push(row);
        } else {
            console.warn(`  -> Non trovato o errore per TV ${item.id}`);
        }
        processed++;
        if (options.delayMs > 0) await sleep(options.delayMs);
    }

    // 2. Process Movies
    for (const item of movieItems) {
        if (options.limit && processed >= options.limit) break;
        console.log(`[Backfill] [${processed + 1}/${totalToProcess}] Fetch Movie ${item.id} ("${item.title}")...`);
        const row = await client.fetchMovie(item.id, { bypassVoteFloor: true });
        if (row) {
            console.log(`  -> Corretto in: "${row.title}" (EN: "${row.title_en}")`);
            movieRows.push(row);
        } else {
            console.warn(`  -> Non trovato o errore per Movie ${item.id}`);
        }
        processed++;
        if (options.delayMs > 0) await sleep(options.delayMs);
    }

    // 3. Upsert JSONL
    if (tvRows.length > 0) {
        console.log(`[Backfill] Upsert di ${tvRows.length} record in master_tv.jsonl...`);
        await store.upsert(tvRows, 'tv');
    }
    if (movieRows.length > 0) {
        console.log(`[Backfill] Upsert di ${movieRows.length} record in master_movies.jsonl...`);
        await store.upsert(movieRows, 'movies');
    }

    // 4. Ricompilazione Parquet
    const typesToConvert = [];
    if (tvRows.length > 0) typesToConvert.push('tv');
    if (movieRows.length > 0) typesToConvert.push('movies');

    if (typesToConvert.length > 0) {
        console.log(`[Backfill] Ricompilazione Parquet per: ${typesToConvert.join(', ')}...`);
        await convert({ dataDir, types: typesToConvert });
        console.log('[Backfill] Parquet rigenerati con successo.');
    }

    console.log(`[Backfill] Completato con successo: ${processed} titoli elaborati.`);
    return { success: true, processed };
}

if (require.main === module) {
    runBackfill().catch(err => {
        console.error('[Backfill] Errore:', err);
        process.exitCode = 1;
    });
}

module.exports = { runBackfill, findCompromisedIds };
