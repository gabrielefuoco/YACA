const fs = require('fs');
const path = require('path');
const TmdbDumpStore = require('./tmdbDumpStore');
const TmdbDumpClient = require('./tmdbDumpClient');
const { loadTrackedAiringIds, isTrackedAiringId } = require('./tmdbIngestPolicy');
const { chiaveGlobale } = require('../../src/configurazione');

const apiKey = chiaveGlobale('tmdb');

// Stato globale esposto per l'admin endpoint
const dumpStatus = {
    isRunning: false,
    phase: 'idle', // 'cold-start', 'daily-sync', 'idle', 'error'
    currentTask: '',
    progress: 0,
    total: 0,
    lastSync: null,
    stats: { movies: 0, tv: 0 },
    error: null
};

let lastPersistTime = 0;
function updateStatus(store, patch = {}, forcePersist = false) {
    Object.assign(dumpStatus, patch);
    const now = Date.now();
    if (store && (forcePersist || now - lastPersistTime >= 3000)) {
        lastPersistTime = now;
        try {
            store.saveStatus(dumpStatus);
        } catch (err) {
            console.error('[TmdbDump] Errore salvataggio status:', err.message);
        }
    }
}

let daemonRunning = false;
let isFirstRun = true;

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function isParquetFresh(store, indice) {
    const moviesJsonlExists = store.storeExists('movies');
    const tvJsonlExists = store.storeExists('tv');

    if (!moviesJsonlExists && !tvJsonlExists) {
        return true;
    }

    // Lo stato degli artefatti lo riferisce l'indice: qui non si leggono percorsi interni.
    const parquet = indice.parquetStats();
    const moviesParquetExists = parquet.movies.exists;
    const tvParquetExists = parquet.tv.exists;

    if (moviesJsonlExists) {
        if (!moviesParquetExists) return false;
        try {
            const jsonlStat = fs.statSync(store._getFilePath('movies'));
            const parquetStat = { mtimeMs: parquet.movies.mtimeMs };
            if (parquetStat.mtimeMs < jsonlStat.mtimeMs) return false;
        } catch (_) {
            return false;
        }
    }

    if (tvJsonlExists) {
        if (!tvParquetExists) return false;
        try {
            const jsonlStat = fs.statSync(store._getFilePath('tv'));
            const parquetStat = { mtimeMs: parquet.tv.mtimeMs };
            if (parquetStat.mtimeMs < jsonlStat.mtimeMs) return false;
        } catch (_) {
            return false;
        }
    }

    return true;
}

async function buildTier2Index() {
    try {
        const { buildTier2 } = require('../../src/indice/tier2');
        console.log('[TmdbDump] Ricostruzione indice Tier 2 e SQLite FTS5 su disco...');
        const res = await buildTier2();
        console.log(`[TmdbDump] Indice Tier 2 completato: ${res.count} record in ${res.durationSeconds}s`);
    } catch (tier2Err) {
        console.error('[TmdbDump] Errore durante la build Tier 2 FTS5:', tier2Err.message);
    }
}

async function convertAndReloadDuckDb(store) {
    updateStatus(store, { currentTask: 'Converting Parquet and Reloading DuckDB...' }, true);
    console.log('[TmdbDump] Esecuzione conversione in Parquet...');
    try {
        const { spawn } = require('child_process');
        await new Promise((resolve, reject) => {
            const script = path.join(__dirname, '..', '..', 'scripts', 'convert_to_parquet.js');
            const proc = spawn('node', [script], { stdio: 'inherit' });
            proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Code ${code}`)));
        });

        console.log('[TmdbDump] Ricostruzione DuckDB da Parquet...');
        const indice = require('../../src/indice');
        await indice.close();
        await indice.init({ forceRebuild: true });
        console.log('[TmdbDump] DuckDB pronto su database persistente.');
        await indice.close(); // Chiusura immediata: il job batch/daemon standalone non trattiene il DB in RAM

        // Tier 2: indice export TMDB + FTS5 su disco (ticket #40)
        await buildTier2Index();
    } catch (convertErr) {
        console.error('[TmdbDump] Errore durante la conversione Parquet / Reload DuckDB:', convertErr);
        updateStatus(store, { error: convertErr.message }, true);
    }
}

/**
 * Cold Start: scarica tutti gli ID dal Daily Export e fetcha i metadati completi.
 * Il cursor non salva gli ID (sono ~87K), ma solo l'indice di progresso.
 * In caso di restart, ri-scarica il Daily Export (è gratuito e veloce) e
 * riprende dal punto in cui si era fermato grazie all'indice salvato.
 */
async function coldStart(store, client) {
    updateStatus(store, { phase: 'cold-start', currentTask: 'Starting Cold Start...' }, true);
    console.log('[TmdbDump] Starting Cold Start...');

    const mediaTypes = ['movies', 'tv'];
    let cursor = store.loadCursor() || {};

    for (const mediaType of mediaTypes) {
        // Se questo media type è già stato completato in un run precedente, skippa
        if (cursor.completed && cursor.completed[mediaType]) {
            console.log(`[TmdbDump] ${mediaType} already completed in a previous run. Skipping.`);
            continue;
        }

        // Scarica il Daily Export (sempre, ~2s per file compresso)
        updateStatus(store, { currentTask: `Downloading Daily Export for ${mediaType}` }, true);
        console.log(`[TmdbDump] ${dumpStatus.currentTask}`);
        const allIds = await client.downloadDailyExport(mediaType);
        
        // Determina da dove riprendere
        let startIndex = 0;
        if (cursor.mediaType === mediaType && typeof cursor.index === 'number') {
            startIndex = cursor.index;
        }
        
        const idsToFetch = allIds.slice(startIndex);
        updateStatus(store, { total: allIds.length, progress: startIndex }, true);

        console.log(`[TmdbDump] Cold Start for ${mediaType}: resuming at ${startIndex}/${allIds.length} (${idsToFetch.length} remaining)`);
        
        const trackedIds = await loadTrackedAiringIds();
        let batch = [];

        // Concorrenza del cold start: il dump è ~530k titoli e una richiesta alla volta
        // significa ~3 giorni. Con N richieste in volo il tempo si divide quasi per N.
        // Configurabile da .env (TMDB_DUMP_CONCURRENCY / TMDB_DUMP_DELAY_MS).
        const CONCURRENCY = Math.max(1, Number(process.env.TMDB_DUMP_CONCURRENCY) || 8);
        const DELAY_MS = Math.max(0, Number(process.env.TMDB_DUMP_DELAY_MS) || 285);
        const CHUNK = 500; // stessa granularità di flush/cursor di prima
        console.log(`[TmdbDump] Concorrenza: ${CONCURRENCY} richieste in volo, pausa ${DELAY_MS}ms per gruppo`);

        for (let chunkStart = 0; chunkStart < idsToFetch.length; chunkStart += CHUNK) {
            if (!daemonRunning) {
                console.log('[TmdbDump] Daemon interrupted. Saving cursor...');
                break;
            }

            const chunk = idsToFetch.slice(chunkStart, chunkStart + CHUNK);
            let doneInChunk = 0;

            for (let j = 0; j < chunk.length; j += CONCURRENCY) {
                if (!daemonRunning) break;

                const slice = chunk.slice(j, j + CONCURRENCY);
                const actualIndex = startIndex + chunkStart + j;
                updateStatus(store, {
                    currentTask: `Fetching ${mediaType} ${slice[0]}…${slice[slice.length - 1]} (${actualIndex + 1}/${allIds.length})`,
                    progress: actualIndex
                });

                const rows = await Promise.all(slice.map(id =>
                    mediaType === 'movies' ? client.fetchMovie(id, { trackedIds }) : client.fetchTv(id, { trackedIds })
                ));
                for (const row of rows) {
                    if (row) batch.push(row);
                }
                doneInChunk += slice.length;

                // Rate limiting: pausa per gruppo, non per singola richiesta
                if (DELAY_MS > 0) await sleep(DELAY_MS);
            }

            // Flush e cursor: la granularità è il chunk, così il resume resta esatto
            if (batch.length > 0) {
                store.appendBatch(batch, mediaType);
                batch = [];
            }

            cursor = {
                mediaType,
                index: startIndex + chunkStart + doneInChunk,
                completed: cursor.completed || {}
            };
            store.saveCursor(cursor);
            updateStatus(store, { progress: cursor.index }, true);

            const percent = ((cursor.index / allIds.length) * 100).toFixed(1);
            console.log(`[TmdbDump] [${mediaType.toUpperCase()}] Progress: ${cursor.index}/${allIds.length} (${percent}%)`);

            // Conversione parziale in background ogni 5000 item
            if (cursor.index % 5000 === 0 && cursor.index > 0) {
                console.log(`[TmdbDump] Triggering intermediate Parquet conversion at ${cursor.index}...`);
                // Non usiamo await così non fermiamo il download
                convertAndReloadDuckDb(store).catch(e => console.error(e));
            }

            if (!daemonRunning) {
                console.log('[TmdbDump] Daemon interrupted. Saving cursor...');
                break;
            }
        }
        
        // Segna questo media type come completato
        if (!cursor.completed) cursor.completed = {};
        cursor.completed[mediaType] = true;
        cursor.mediaType = mediaType;
        cursor.index = allIds.length;
        store.saveCursor(cursor);

        const finalCount = await store.countLines(mediaType);
        updateStatus(store, { stats: { ...dumpStatus.stats, [mediaType]: finalCount } }, true);
        console.log(`[TmdbDump] Cold Start for ${mediaType} COMPLETED. Total records: ${finalCount}`);
    }

    updateStatus(store, { lastSync: new Date().toISOString() }, true);
    console.log('[TmdbDump] Cold Start FULLY COMPLETED.');
}

async function dailySync(store, client) {
    updateStatus(store, { phase: 'daily-sync', currentTask: 'Starting Daily Sync...' }, true);
    console.log('[TmdbDump] Starting Daily Sync...');

    const mediaTypes = ['movies', 'tv'];
    
    for (const mediaType of mediaTypes) {
        updateStatus(store, { currentTask: `Fetching Changes for ${mediaType}` }, true);
        const changedIds = new Set();
        
        // Pagina API Changes
        let page = 1;
        let totalPages = 1;
        const tmdbType = mediaType === 'movies' ? 'movie' : 'tv';

        while (page <= totalPages) {
            const data = await client.fetchChanges(tmdbType, page);
            for (const res of (data.results || [])) {
                changedIds.add(res.id);
            }
            totalPages = Math.min(data.total_pages || 1, 50);
            page++;
            await sleep(285); // Rate limit anche per le pagine changes
        }

        console.log(`[TmdbDump] Found ${changedIds.size} changed IDs for ${mediaType}`);

        // Cross-reference con il DB locale (solo colonna ID)
        const localIds = await store.loadIds(mediaType);
        const trackedIds = await loadTrackedAiringIds();
        
        // Scarica Daily Export per filtrare nuovi ID per popolarità
        updateStatus(store, { currentTask: `Downloading Daily Export for ${mediaType}` }, true);
        const popularIds = await client.downloadDailyExport(mediaType);
        const popularSet = new Set(popularIds);

        const idsToFetch = [];
        for (const id of changedIds) {
            if (localIds.has(id) || popularSet.has(id) || isTrackedAiringId(id, trackedIds)) {
                idsToFetch.push(id);
            }
        }

        console.log(`[TmdbDump] ${idsToFetch.length} relevant changes to fetch for ${mediaType}`);
        updateStatus(store, { total: idsToFetch.length, progress: 0 }, true);

        const toUpsert = [];
        const toDelete = [];

        for (let i = 0; i < idsToFetch.length; i++) {
            if (!daemonRunning) break;
            
            const id = idsToFetch[i];
            updateStatus(store, {
                progress: i + 1,
                currentTask: `Syncing ${mediaType} ${id} (${i+1}/${idsToFetch.length})`
            });

            try {
                const row = mediaType === 'movies' 
                    ? await client.fetchMovie(id, { trackedIds }) 
                    : await client.fetchTv(id, { trackedIds });
                    
                if (row) {
                    toUpsert.push(row);
                } else if (localIds.has(id)) {
                    // Era nel DB ma ora è 404 o sotto soglia → rimuovi SOLO se non è tracciato da anime_airing_state
                    if (!isTrackedAiringId(id, trackedIds)) {
                        toDelete.push(id);
                    }
                }
            } catch (err) {
                console.error(`[TmdbDump] Failed to sync ${id}:`, err.message);
            }

            await sleep(285); // Rate limit
        }

        // Applica le modifiche al file JSONL
        updateStatus(store, { currentTask: `Writing changes to disk for ${mediaType}` }, true);
        console.log(`[TmdbDump] Disk Apply: ${toUpsert.length} upserts, ${toDelete.length} deletes for ${mediaType}`);
        
        if (toUpsert.length > 0) await store.upsert(toUpsert, mediaType);
        if (toDelete.length > 0) await store.deleteIds(toDelete, mediaType);

        const finalCount = await store.countLines(mediaType);
        updateStatus(store, { stats: { ...dumpStatus.stats, [mediaType]: finalCount } }, true);
    }

    console.log('[TmdbDump] Daily Sync COMPLETED. Triggering Parquet rebuild...');
    try {
        await convertAndReloadDuckDb(store);
    } catch (err) {
        console.error('[TmdbDump] Error rebuilding Parquet after Daily Sync:', err);
    }
    updateStatus(store, { lastSync: new Date().toISOString() }, true);
}

function stopDaemon() {
    daemonRunning = false;
    dumpStatus.isRunning = false;
    try {
        const store = new TmdbDumpStore();
        updateStatus(store, { isRunning: false, currentTask: 'Daemon fermato' }, true);
    } catch (_) {}
}

async function runTmdbDumpDaemon(options = {}) {
    const once = Boolean(options.once);
    const intervalMs = options.intervalMs || (60 * 60 * 1000); // 1 ora di default

    if (daemonRunning) return;
    
    const store = new TmdbDumpStore();

    if (!apiKey) {
        console.error('[TmdbDump] TMDB_API_KEY non definita in .env. Il demone non partirà.');
        updateStatus(store, { error: 'Missing TMDB_API_KEY', phase: 'error', isRunning: false }, true);
        return;
    }

    daemonRunning = true;
    updateStatus(store, { isRunning: true, error: null, phase: 'starting' }, true);

    try {
        const client = new TmdbDumpClient(apiKey);
        const indice = require('../../src/indice');
        
        // Conversione al boot: se i parquet esistono e sono freschi, salta convert_to_parquet.js
        if (isFirstRun) {
            const parquetFresh = isParquetFresh(store, indice);
            if (!parquetFresh && (store.storeExists('movies') || store.storeExists('tv'))) {
                console.log('[TmdbDump] Pre-existing JSONL detected. Parquet missing or stale: running boot conversion...');
                await convertAndReloadDuckDb(store);
            } else {
                if (parquetFresh && (store.storeExists('movies') || store.storeExists('tv'))) {
                    console.log('[TmdbDump] Parquet già presenti e aggiornati rispetto ai JSONL. Conversione al boot saltata.');
                }
                if (!indice.isInitialized) {
                    await indice.init();
                    await indice.close();
                }
                console.log('[TmdbDump] DuckDB pronto su database persistente.');

                // Tier 2: controlla se titles_fts5.db esiste già
                const tier2DbFile = path.join(store.basePath, 'titles_fts5.db');
                if (!fs.existsSync(tier2DbFile)) {
                    console.log('[TmdbDump] titles_fts5.db non presente su disco. Costruzione Tier 2 al boot...');
                    await buildTier2Index();
                } else {
                    console.log('[TmdbDump] titles_fts5.db già presente sul volume. Ricostruzione Tier 2 al boot saltata.');
                }
            }
        }
        isFirstRun = false;

        const cursor = store.loadCursor();
        const moviesExist = store.storeExists('movies');
        const tvExist = store.storeExists('tv');
        const allCompleted = cursor?.completed?.movies && cursor?.completed?.tv;

        if (!moviesExist || !tvExist || !allCompleted) {
            await coldStart(store, client);
        } else {
            await dailySync(store, client);
        }
        
        // Conversione DuckDB e Hot-Reload (Eseguito sempre alla fine del sync)
        await convertAndReloadDuckDb(store);
        
        updateStatus(store, {
            phase: 'idle',
            currentTask: 'Waiting for next sync...',
            isRunning: !once,
            lastSync: new Date().toISOString()
        }, true);

        if (once) {
            console.log('[TmdbDump] Giro batch completato con successo (--once). Uscita.');
            daemonRunning = false;
            return;
        }

        console.log(`[TmdbDump] Waiting ${Math.round(intervalMs / 60000)} minutes for next sync cycle...`);
        
        // Attesa interrompibile con heartbeat ogni 60s
        let waited = 0;
        while (waited < intervalMs && daemonRunning) {
            await sleep(60000);
            waited += 60000;
            if (daemonRunning) {
                updateStatus(store, { isRunning: true }, true);
            }
        }
    } catch (e) {
        console.error('[TmdbDump] Fatal error:', e);
        updateStatus(store, { error: e.message, phase: 'error', isRunning: false }, true);
        if (once) {
            daemonRunning = false;
            throw e;
        }
        // Dopo errore fatale, aspetta 5 minuti prima di riprovare
        await sleep(5 * 60 * 1000);
    } finally {
        if (!once && daemonRunning) {
            setTimeout(() => runTmdbDumpDaemon(options), 5000);
        } else {
            daemonRunning = false;
            updateStatus(store, { isRunning: false }, true);
        }
    }
}

// Supporto CLI autonomo: node services/tmdb-daemon/tmdbDumpDaemon.js [--once|--status|--health-check]
if (require.main === module) {
    const args = process.argv.slice(2);
    const once = args.includes('--once');
    const status = args.includes('--status');
    const healthCheck = args.includes('--health-check');

    const store = new TmdbDumpStore();

    if (status) {
        console.log(JSON.stringify(store.loadStatus(), null, 2));
        process.exit(0);
    }

    if (healthCheck) {
        const s = store.loadStatus();
        if (s.isStale || s.phase === 'error') {
            console.error(`[TmdbDump HealthCheck] UNHEALTHY: phase=${s.phase}, isStale=${s.isStale}, reason=${s.staleReason}`);
            process.exit(1);
        }
        console.log(`[TmdbDump HealthCheck] OK: phase=${s.phase}, lastSync=${s.lastSync}`);
        process.exit(0);
    }

    process.on('SIGTERM', () => {
        console.log('[TmdbDump] SIGTERM ricevuto. Arresto ordinato...');
        stopDaemon();
        process.exit(0);
    });
    process.on('SIGINT', () => {
        console.log('[TmdbDump] SIGINT ricevuto. Arresto ordinato...');
        stopDaemon();
        process.exit(0);
    });

    runTmdbDumpDaemon({ once }).catch((err) => {
        console.error('[TmdbDump Daemon] Fatal Error:', err);
        process.exit(1);
    });
}

module.exports = { 
    runTmdbDumpDaemon,
    stopDaemon,
    getDumpStatus: () => (new TmdbDumpStore()).loadStatus()
};
