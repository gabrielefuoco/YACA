#!/usr/bin/env node

/**
 * backfill-airing-anime.js
 *
 * Script riutilizzabile per il backfill dei titoli simulcast anime mancanti dal DB locale DuckDB.
 * Bypass il filtro < 10 voti per i titoli tracciati da anime_airing_state.
 *
 * Utilizzo:
 *   node scripts/backfill-airing-anime.js [opzioni]
 *
 * Opzioni:
 *   --ids=1,2,3        Elenco separato da virgole di TMDB ID da backfillare
 *   --from-file=FILE    File contenente gli ID (JSON array o un ID per riga)
 *   --all               Scansiona tutti i record di anime_airing_state anziché solo i titoli simulcast recenti
 *   --dry-run           Simulazione: mostra trovati e mancanti senza fetch né scritture
 *   --limit=N           Limita l'elaborazione a max N ID mancanti
 *   --delay=MS          Pausa tra richieste TMDB in millisecondi (default: 285)
 *   --data-dir=DIR      Directory dati cache TMDB (default: .cache/tmdb o /data/tmdb)
 *   -h, --help          Mostra questo messaggio di aiuto
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const duckdb = require('duckdb');

const TmdbDumpStore = require('../src/utils/tmdbDumpStore');
const TmdbDumpClient = require('../src/utils/tmdbDumpClient');
const animeAiringState = require('../src/data/animeAiringState');
const { convert } = require('./convert_to_parquet');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCliArgs(argv = process.argv.slice(2)) {
    const options = {
        ids: null,
        fromFile: null,
        all: false,
        dryRun: false,
        limit: null,
        delayMs: 285,
        dataDir: null
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '-h' || arg === '--help') {
            options.help = true;
        } else if (arg.startsWith('--ids=')) {
            options.ids = arg.slice(6).split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
        } else if (arg === '--ids' && argv[i + 1]) {
            options.ids = argv[++i].split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
        } else if (arg.startsWith('--from-file=')) {
            options.fromFile = arg.slice(12);
        } else if (arg === '--from-file' && argv[i + 1]) {
            options.fromFile = argv[++i];
        } else if (arg === '--all') {
            options.all = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg.startsWith('--limit=')) {
            options.limit = parseInt(arg.slice(8), 10);
        } else if (arg === '--limit' && argv[i + 1]) {
            options.limit = parseInt(argv[++i], 10);
        } else if (arg.startsWith('--delay=')) {
            options.delayMs = parseInt(arg.slice(8), 10);
        } else if (arg === '--delay' && argv[i + 1]) {
            options.delayMs = parseInt(argv[++i], 10);
        } else if (arg.startsWith('--data-dir=')) {
            options.dataDir = path.resolve(arg.slice(11));
        } else if (arg === '--data-dir' && argv[i + 1]) {
            options.dataDir = path.resolve(argv[++i]);
        }
    }

    return options;
}

function readIdsFromFile(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`File non trovato: ${resolved}`);
    }
    const content = fs.readFileSync(resolved, 'utf8').trim();
    if (content.startsWith('[')) {
        const parsed = JSON.parse(content);
        return parsed.map((v) => Number(typeof v === 'object' ? v.id || v.tmdbId : v)).filter((n) => Number.isFinite(n) && n > 0);
    }
    return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => Number(line))
        .filter((n) => Number.isFinite(n) && n > 0);
}

async function resolveTrackedIds(options) {
    if (Array.isArray(options.ids) && options.ids.length > 0) {
        console.log(`[Backfill] Uso ${options.ids.length} ID specificati da CLI.`);
        return options.ids;
    }

    if (options.fromFile) {
        const fileIds = readIdsFromFile(options.fromFile);
        console.log(`[Backfill] Uso ${fileIds.length} ID letti da file (${options.fromFile}).`);
        return fileIds;
    }

    // Lettura da MongoDB Atlas: anime_airing_state
    const isConnected = mongoose.connection && mongoose.connection.readyState === 1;
    if (!isConnected) {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI non definita in .env e nessun --ids o --from-file specificato.');
        }
        console.log('[Backfill] Connessione a MongoDB Atlas...');
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
        console.log('[Backfill] MongoDB connesso.');
    }

    const snapshot = await animeAiringState.getSnapshot();
    if (!snapshot || !Array.isArray(snapshot.docs) || snapshot.docs.length === 0) {
        throw new Error('Impossibile ottenere documenti validi da anime_airing_state.');
    }

    if (options.all) {
        const allIds = Array.from(new Set(
            snapshot.docs
                .map((d) => Number(d.tmdbId))
                .filter((n) => Number.isFinite(n) && n > 0)
        ));
        console.log(`[Backfill] Modalità --all: trovati ${allIds.length} ID tracciati in anime_airing_state.`);
        return allIds;
    }

    // Modalità default: anime simulcast in corso / attivi
    // Unione delle serie con novità nella finestra mobile e di quelle con aggiornamento recente (ultime 48h)
    const noveltyEntries = animeAiringState.getNoveltyEntries(snapshot);
    const activeIdsSet = new Set();

    for (const entry of noveltyEntries) {
        const num = Number(entry.tmdbId || (entry.doc && entry.doc.tmdbId));
        if (Number.isFinite(num) && num > 0) activeIdsSet.add(num);
    }

    const recentThreshold = Date.now() - 48 * 3600 * 1000;
    for (const doc of snapshot.docs) {
        if (doc.updatedAt && doc.updatedAt >= recentThreshold) {
            const num = Number(doc.tmdbId);
            if (Number.isFinite(num) && num > 0) activeIdsSet.add(num);
        }
    }

    const resolved = Array.from(activeIdsSet);
    console.log(`[Backfill] Trovati ${resolved.length} ID anime simulcast attivi in anime_airing_state.`);
    return resolved;
}

function findExistingIdsInParquet(basePath, candidateIds) {
    if (!candidateIds || candidateIds.length === 0) return new Set();

    const tvParquet = path.join(basePath, 'tv.parquet');
    const moviesParquet = path.join(basePath, 'movies.parquet');

    const existingSet = new Set();
    const db = new duckdb.Database(':memory:');
    const con = db.connect();

    return new Promise((resolve) => {
        const checkParquet = (filePath, next) => {
            if (!fs.existsSync(filePath)) return next();
            const sqlPath = filePath.replace(/\\/g, '/');
            const inList = candidateIds.join(',');
            const sql = `SELECT CAST(id AS INTEGER) AS id FROM read_parquet('${sqlPath}') WHERE id IN (${inList})`;
            con.all(sql, (err, rows) => {
                if (!err && Array.isArray(rows)) {
                    for (const r of rows) {
                        const id = Number(r.id);
                        if (Number.isFinite(id)) existingSet.add(id);
                    }
                }
                next();
            });
        };

        checkParquet(tvParquet, () => {
            checkParquet(moviesParquet, () => {
                con.close(() => db.close(() => resolve(existingSet)));
            });
        });
    });
}

async function ensureJsonlFromParquet(store, mediaType) {
    const jsonlPath = store._getFilePath(mediaType);
    const parquetPath = path.join(store.basePath, `${mediaType}.parquet`);

    if (!fs.existsSync(jsonlPath) && fs.existsSync(parquetPath)) {
        console.log(`[Backfill] Inizializzazione di ${path.basename(jsonlPath)} dal parquet pre-esistente...`);
        const db = new duckdb.Database(':memory:');
        const con = db.connect();
        await new Promise((resolve, reject) => {
            const sqlPath = jsonlPath.replace(/\\/g, '/');
            const sqlParquet = parquetPath.replace(/\\/g, '/');
            con.all(`COPY (SELECT * FROM read_parquet('${sqlParquet}')) TO '${sqlPath}' (FORMAT JSON)`, (err) => {
                con.close(() => db.close(() => {
                    if (err) reject(err);
                    else resolve();
                }));
            });
        });
        console.log(`[Backfill] ${path.basename(jsonlPath)} inizializzato.`);
    }
}

async function main() {
    const options = parseCliArgs();

    if (options.help) {
        console.log(`Uso: node scripts/backfill-airing-anime.js [opzioni]
Opzioni:
  --ids=1,2,3        Elenco separato da virgole di TMDB ID da backfillare
  --from-file=FILE    File contenente gli ID (JSON array o un ID per riga)
  --all               Scansiona tutti i record di anime_airing_state anziché solo i titoli simulcast recenti
  --dry-run           Simulazione: mostra trovati e mancanti senza fetch né scritture
  --limit=N           Limita l'elaborazione a max N ID mancanti
  --delay=MS          Pausa tra richieste TMDB in millisecondi (default: 285)
  --data-dir=DIR      Directory dati cache TMDB (default: .cache/tmdb o /data/tmdb)
  -h, --help          Mostra questo messaggio di aiuto`);
        return;
    }

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey && !options.dryRun) {
        throw new Error('TMDB_API_KEY mancante nel file .env');
    }

    const store = new TmdbDumpStore();
    if (options.dataDir) {
        store.basePath = options.dataDir;
        if (!fs.existsSync(store.basePath)) {
            fs.mkdirSync(store.basePath, { recursive: true });
        }
    }
    console.log(`[Backfill] Directory dati: ${store.basePath}`);

    const trackedIds = await resolveTrackedIds(options);
    const trovati = trackedIds.length;

    console.log(`[Backfill] Verifica presenza di ${trovati} ID nel DB locale DuckDB...`);
    const existingIdsSet = await findExistingIdsInParquet(store.basePath, trackedIds);
    console.log(`[Backfill] Presenti in locale: ${existingIdsSet.size}`);

    let missingIds = trackedIds.filter((id) => !existingIdsSet.has(id));
    const assenti = missingIds.length;
    console.log(`[Backfill] Assenti dal DB locale: ${assenti}`);

    if (assenti === 0) {
        console.log('[Backfill] Nessun ID mancante da importare. Il DB locale è già allineato.');
        const result = { trovati, assenti: 0, fetchati: 0, scritti: 0, scartati: 0 };
        console.log(`[Backfill] Riepilogo: Trovati: ${result.trovati}, Assenti: ${result.assenti}, Fetchati: ${result.fetchati}, Scritti: ${result.scritti}, Scartati: ${result.scartati}`);
        return result;
    }

    console.log(`[Backfill] Elenco ID assenti (${assenti}): ${missingIds.join(', ')}`);

    if (options.dryRun) {
        console.log('[Backfill] Modalità --dry-run: nessuna modifica effettuata.');
        const result = { trovati, assenti, fetchati: 0, scritti: 0, scartati: 0 };
        console.log(`[Backfill] Riepilogo: Trovati: ${result.trovati}, Assenti: ${result.assenti}, Fetchati: ${result.fetchati}, Scritti: ${result.scritti}, Scartati: ${result.scartati}`);
        return result;
    }

    if (options.limit && options.limit > 0 && options.limit < missingIds.length) {
        console.log(`[Backfill] Applico limite --limit=${options.limit}`);
        missingIds = missingIds.slice(0, options.limit);
    }

    const client = new TmdbDumpClient(apiKey);
    const tvRows = [];
    const movieRows = [];
    let scartati = 0;

    for (let i = 0; i < missingIds.length; i++) {
        const id = missingIds[i];
        console.log(`[Backfill] [${i + 1}/${missingIds.length}] Fetch TMDB per ID ${id}...`);

        // Proviamo prima come serie TV (i simulcast sono quasi sempre serie TV)
        let row = await client.fetchTv(id, { bypassVoteFloor: true });
        let mediaType = 'tv';

        if (!row) {
            // Se non trovato come TV, tentiamo come film
            row = await client.fetchMovie(id, { bypassVoteFloor: true });
            mediaType = 'movies';
        }

        if (row) {
            console.log(`[Backfill] ✅ Recuperato (${mediaType}): "${row.name || row.title}" (voti: ${row.vote_count}, popolarità: ${row.popularity})`);
            if (mediaType === 'tv') tvRows.push(row);
            else movieRows.push(row);
        } else {
            console.warn(`[Backfill] ⚠️ ID ${id} non trovato su TMDB (404 o errore API)`);
            scartati++;
        }

        if (i < missingIds.length - 1 && options.delayMs > 0) {
            await sleep(options.delayMs);
        }
    }

    const fetchati = tvRows.length + movieRows.length;
    console.log(`[Backfill] Fetch completato: ${fetchati} record scaricati, ${scartati} scartati.`);

    let scritti = 0;
    if (tvRows.length > 0) {
        await ensureJsonlFromParquet(store, 'tv');
        console.log(`[Backfill] Upsert di ${tvRows.length} record in master_tv.jsonl...`);
        await store.upsert(tvRows, 'tv');
        scritti += tvRows.length;
    }

    if (movieRows.length > 0) {
        await ensureJsonlFromParquet(store, 'movies');
        console.log(`[Backfill] Upsert di ${movieRows.length} record in master_movies.jsonl...`);
        await store.upsert(movieRows, 'movies');
        scritti += movieRows.length;
    }

    if (scritti > 0) {
        console.log('[Backfill] Ricompilazione Parquet con convert_to_parquet...');
        const types = [];
        if (tvRows.length > 0) types.push('tv');
        if (movieRows.length > 0) types.push('movies');

        const convResult = await convert({ dataDir: store.basePath, types });
        if (!convResult.success) {
            throw new Error('Conversione Parquet fallita.');
        }

        // Ricaricamento DuckDB in-memory se inizializzato
        try {
            const duckDbStore = require('../src/db/duckDbStore');
            if (duckDbStore && duckDbStore.isInitialized) {
                console.log('[Backfill] Ricaricamento modulo DuckDB in RAM...');
                duckDbStore.close();
                duckDbStore.isInitialized = false;
                await duckDbStore.init();
                console.log('[Backfill] DuckDB ricaricato con successo.');
            }
        } catch (_reloadErr) {
            // Ignoriamo errori di reload se DuckDB non era aperto nel processo
        }
    }

    const summary = { trovati, assenti, fetchati, scritti, scartati };
    console.log(`[Backfill] Riepilogo: Trovati: ${summary.trovati}, Assenti: ${summary.assenti}, Fetchati: ${summary.fetchati}, Scritti: ${summary.scritti}, Scartati: ${summary.scartati}`);
    return summary;
}

if (require.main === module) {
    main()
        .then(() => {
            if (mongoose.connection && mongoose.connection.readyState !== 0) {
                mongoose.disconnect().catch(() => {});
            }
            process.exit(0);
        })
        .catch((err) => {
            console.error('[Backfill] ❌ Errore fatale:', err.message);
            if (mongoose.connection && mongoose.connection.readyState !== 0) {
                mongoose.disconnect().catch(() => {});
            }
            process.exit(1);
        });
}

module.exports = {
    main,
    parseCliArgs,
    readIdsFromFile,
    resolveTrackedIds,
    findExistingIdsInParquet
};
