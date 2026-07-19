const TmdbDumpStore = require('./tmdbDumpStore');
const TmdbDumpClient = require('./tmdbDumpClient');

const apiKey = process.env.TMDB_API_KEY;

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

let daemonRunning = false;

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Cold Start: scarica tutti gli ID dal Daily Export e fetcha i metadati completi.
 * Il cursor non salva gli ID (sono ~87K), ma solo l'indice di progresso.
 * In caso di restart, ri-scarica il Daily Export (è gratuito e veloce) e
 * riprende dal punto in cui si era fermato grazie all'indice salvato.
 */
async function coldStart(store, client) {
    dumpStatus.phase = 'cold-start';
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
        dumpStatus.currentTask = `Downloading Daily Export for ${mediaType}`;
        console.log(`[TmdbDump] ${dumpStatus.currentTask}`);
        const allIds = await client.downloadDailyExport(mediaType);
        
        // Determina da dove riprendere
        let startIndex = 0;
        if (cursor.mediaType === mediaType && typeof cursor.index === 'number') {
            startIndex = cursor.index;
        }
        
        const idsToFetch = allIds.slice(startIndex);
        dumpStatus.total = allIds.length;
        dumpStatus.progress = startIndex;

        console.log(`[TmdbDump] Cold Start for ${mediaType}: resuming at ${startIndex}/${allIds.length} (${idsToFetch.length} remaining)`);
        
        let batch = [];

        for (let i = 0; i < idsToFetch.length; i++) {
            if (!daemonRunning) {
                console.log('[TmdbDump] Daemon interrupted. Saving cursor...');
                break;
            }

            const id = idsToFetch[i];
            const actualIndex = startIndex + i;
            dumpStatus.progress = actualIndex;
            dumpStatus.currentTask = `Fetching ${mediaType} ${id} (${actualIndex + 1}/${allIds.length})`;

            const row = mediaType === 'movies' 
                ? await client.fetchMovie(id) 
                : await client.fetchTv(id);

            if (row) {
                batch.push(row);
            }

            // Flush ogni 500 iterazioni
            if (batch.length >= 500 || i === idsToFetch.length - 1) {
                if (batch.length > 0) {
                    store.appendBatch(batch, mediaType);
                    batch = [];
                }
                
                // Salva cursor leggero (senza gli ID, solo l'indice)
                cursor = { 
                    mediaType, 
                    index: actualIndex + 1, 
                    completed: cursor.completed || {} 
                };
                store.saveCursor(cursor);
                
                const percent = ((cursor.index / allIds.length) * 100).toFixed(1);
                console.log(`[TmdbDump] [${mediaType.toUpperCase()}] Progress: ${cursor.index}/${allIds.length} (${percent}%)`);
            }

            // Rate limiting: ~3.5 req/sec
            await sleep(285);
        }
        
        // Segna questo media type come completato
        if (!cursor.completed) cursor.completed = {};
        cursor.completed[mediaType] = true;
        cursor.mediaType = mediaType;
        cursor.index = allIds.length;
        store.saveCursor(cursor);

        const finalCount = await store.countLines(mediaType);
        dumpStatus.stats[mediaType] = finalCount;
        console.log(`[TmdbDump] Cold Start for ${mediaType} COMPLETED. Total records: ${finalCount}`);
    }

    dumpStatus.lastSync = new Date().toISOString();
    console.log('[TmdbDump] Cold Start FULLY COMPLETED.');
}

async function dailySync(store, client) {
    dumpStatus.phase = 'daily-sync';
    console.log('[TmdbDump] Starting Daily Sync...');

    const mediaTypes = ['movies', 'tv'];
    
    for (const mediaType of mediaTypes) {
        dumpStatus.currentTask = `Fetching Changes for ${mediaType}`;
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
        
        // Scarica Daily Export per filtrare nuovi ID per popolarità
        dumpStatus.currentTask = `Downloading Daily Export for ${mediaType}`;
        const popularIds = await client.downloadDailyExport(mediaType);
        const popularSet = new Set(popularIds);

        const idsToFetch = [];
        for (const id of changedIds) {
            if (localIds.has(id) || popularSet.has(id)) {
                idsToFetch.push(id);
            }
        }

        console.log(`[TmdbDump] ${idsToFetch.length} relevant changes to fetch for ${mediaType}`);
        dumpStatus.total = idsToFetch.length;
        dumpStatus.progress = 0;

        const toUpsert = [];
        const toDelete = [];

        for (let i = 0; i < idsToFetch.length; i++) {
            if (!daemonRunning) break;
            
            const id = idsToFetch[i];
            dumpStatus.progress = i + 1;
            dumpStatus.currentTask = `Syncing ${mediaType} ${id} (${i+1}/${idsToFetch.length})`;

            try {
                const row = mediaType === 'movies' 
                    ? await client.fetchMovie(id) 
                    : await client.fetchTv(id);
                    
                if (row) {
                    toUpsert.push(row);
                } else if (localIds.has(id)) {
                    // Era nel DB ma ora è 404 o sotto soglia → rimuovi
                    toDelete.push(id);
                }
            } catch (err) {
                console.error(`[TmdbDump] Failed to sync ${id}:`, err.message);
            }

            await sleep(285); // Rate limit
        }

        // Applica le modifiche al file JSONL
        dumpStatus.currentTask = `Writing changes to disk for ${mediaType}`;
        console.log(`[TmdbDump] Disk Apply: ${toUpsert.length} upserts, ${toDelete.length} deletes for ${mediaType}`);
        
        if (toUpsert.length > 0) await store.upsert(toUpsert, mediaType);
        if (toDelete.length > 0) await store.deleteIds(toDelete, mediaType);

        const finalCount = await store.countLines(mediaType);
        dumpStatus.stats[mediaType] = finalCount;
    }

    console.log('[TmdbDump] Daily Sync COMPLETED.');
    dumpStatus.lastSync = new Date().toISOString();
}

async function runTmdbDumpDaemon() {
    if (daemonRunning) return;
    
    if (!apiKey) {
        console.warn('[TmdbDump] Missing TMDB_API_KEY. Daemon will not start.');
        dumpStatus.error = 'Missing TMDB_API_KEY';
        return;
    }

    daemonRunning = true;
    dumpStatus.isRunning = true;
    dumpStatus.error = null;

    try {
        const store = new TmdbDumpStore();
        const client = new TmdbDumpClient(apiKey);

        const cursor = store.loadCursor();
        const moviesExist = store.storeExists('movies');
        const tvExist = store.storeExists('tv');
        const allCompleted = cursor?.completed?.movies && cursor?.completed?.tv;

        if (!moviesExist || !tvExist || !allCompleted) {
            await coldStart(store, client);
        } else {
            await dailySync(store, client);
        }
        
        dumpStatus.phase = 'idle';
        dumpStatus.currentTask = 'Waiting for next sync...';
        console.log('[TmdbDump] Waiting 6 hours for next sync cycle...');
        
        // Attesa interrompibile (controlla ogni minuto se il daemon è stato stoppato)
        let waited = 0;
        const SIX_HOURS = 6 * 60 * 60 * 1000;
        while (waited < SIX_HOURS && daemonRunning) {
            await sleep(60000);
            waited += 60000;
        }
    } catch (e) {
        console.error('[TmdbDump] Fatal error:', e);
        dumpStatus.error = e.message;
        dumpStatus.phase = 'error';
        // Dopo errore fatale, aspetta 5 minuti prima di riprovare
        await sleep(5 * 60 * 1000);
    } finally {
        daemonRunning = false;
        dumpStatus.isRunning = false;
        // Loop perpetuo come il CacheWarmer
        setTimeout(() => runTmdbDumpDaemon(), 5000);
    }
}

module.exports = { 
    runTmdbDumpDaemon, 
    getDumpStatus: () => ({ ...dumpStatus })
};
