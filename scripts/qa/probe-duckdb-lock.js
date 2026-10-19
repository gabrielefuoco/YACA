#!/usr/bin/env node
/**
 * scripts/qa/probe-duckdb-lock.js
 *
 * Sonda QA per la verifica del lock DuckDB e dello scambio atomico (Ticket 54).
 * Dimostra:
 *   (a) La build del daemon avviene su un file temporaneo di staging (.new) senza toccare il target.
 *   (b) Lo scambio atomico (swapDatabase) sostituisce il file in modo istantaneo.
 *   (c) L'apertura dal lato "app" riapre il database persistente senza "Conflicting lock"
 *       e senza ricorrere alla ricostruzione da zero.
 *   (d) La rete di sicurezza (retry limitato) gestisce eventuali contese transitorie.
 *
 * Utilizzo:
 *   node scripts/qa/probe-duckdb-lock.js
 */

const fs = require('fs');
const path = require('path');
const duckdb = require('duckdb');
const duckDbStore = require('../../src/indice/duckDbStore');
const { IndiceModule } = require('../../src/indice');

function createIsolatedStore(probeDir) {
    const store = new duckDbStore.constructor();
    store.basePath = probeDir;
    store.targetDbPath = path.join(probeDir, 'catalog.duckdb');
    store.stagingDbPath = path.join(probeDir, 'catalog.duckdb.new');
    store.dbPath = store.targetDbPath;
    store.moviesParquetPath = path.join(probeDir, 'movies.parquet');
    store.tvParquetPath = path.join(probeDir, 'tv.parquet');
    store.masterMoviesJsonlPath = path.join(probeDir, 'master_movies.jsonl');
    store.masterTvJsonlPath = path.join(probeDir, 'master_tv.jsonl');
    return store;
}

async function runProbe() {
    console.log('=======================================================');
    console.log('[SONDA QA] Misura e Verifica Lock DuckDB & Swap Atomico (Ticket 54)');
    console.log('=======================================================');

    const probeDir = path.resolve(__dirname, '../../.cache/tmdb_probe_lock_' + Date.now());
    fs.mkdirSync(probeDir, { recursive: true });

    const capturedLogs = [];
    const origWarn = console.warn;
    const origLog = console.log;

    console.warn = (...args) => {
        capturedLogs.push({ level: 'warn', text: args.join(' ') });
        origWarn(...args);
    };
    console.log = (...args) => {
        capturedLogs.push({ level: 'log', text: args.join(' ') });
        origLog(...args);
    };

    try {
        // -----------------------------------------------------------------
        // (a) Costruzione DB temporaneo su staging (.new)
        // -----------------------------------------------------------------
        console.log('\n--- (a) Build del database temporaneo su staging (.new) ---');
        const daemonStore = createIsolatedStore(probeDir);
        const daemonIndice = new IndiceModule({ duckDb: daemonStore });

        console.log('[Probe] Daemon avvia build su staging (staging: true)...');
        await daemonIndice.init({ forceRebuild: true, staging: true });

        const stagingPath = daemonStore.getStagingDbPath();
        const targetPath = daemonStore.getTargetDbPath();

        if (!fs.existsSync(stagingPath)) {
            throw new Error(`File di staging non creato: ${stagingPath}`);
        }
        if (fs.existsSync(targetPath)) {
            throw new Error(`Il file target ${targetPath} non doveva esistere prima dello swap!`);
        }
        console.log(`[Probe] File staging verificato: ${stagingPath} (dimensione: ${fs.statSync(stagingPath).size} bytes)`);
        console.log(`[Probe] File target non esiste ancora: OK`);

        // Chiusura handle prima dello swap (stesso pattern di tmdbDumpDaemon.js)
        await daemonIndice.close();
        console.log('[Probe] Handle daemon chiuso su staging prima dello swap: OK');

        // -----------------------------------------------------------------
        // (b) Scambio atomico (swapDatabase)
        // -----------------------------------------------------------------
        console.log('\n--- (b) Scambio atomico (.new -> target) ---');
        await daemonIndice.swapDatabase();

        if (fs.existsSync(stagingPath)) {
            throw new Error(`File di staging ancora presente dopo lo swap: ${stagingPath}`);
        }
        if (!fs.existsSync(targetPath)) {
            throw new Error(`File target non presente dopo lo swap: ${targetPath}`);
        }
        console.log(`[Probe] Swap atomico completato con successo: target presente (${fs.statSync(targetPath).size} bytes), staging rimosso: OK`);

        // -----------------------------------------------------------------
        // (c) Apertura DB dal lato "app" e verifica assenza Conflicting lock
        // -----------------------------------------------------------------
        console.log('\n--- (c) Apertura del DB dal lato "App" ---');
        const appStore = createIsolatedStore(probeDir);
        const appIndice = new IndiceModule({ duckDb: appStore });

        capturedLogs.length = 0;
        await appIndice.init();

        const hasLockConflict = capturedLogs.some(l => 
            l.text.toLowerCase().includes('conflicting lock') ||
            l.text.toLowerCase().includes('could not set lock') ||
            l.text.toLowerCase().includes('file is already open')
        );
        const hasRebuildFromZero = capturedLogs.some(l => 
            l.text.includes('Ricostruzione da zero')
        );

        if (hasLockConflict) {
            throw new Error('Rilevato Conflicting lock durante l\'apertura del DB dal lato App!');
        }
        if (hasRebuildFromZero) {
            throw new Error('L\'App ha ricostruito da zero invece di riaprire il database persistente!');
        }
        if (!appIndice.isInitialized) {
            throw new Error('L\'App non risulta inizializzata dopo init()!');
        }

        const tablesCheck = await appIndice.queryRaw("SELECT table_name FROM duckdb_tables WHERE schema_name = 'main';");
        const animeCheck = await appIndice.queryRaw('SELECT count(*) as n FROM anime_mappings;');

        console.log(`[Probe] App ha aperto il database persistente con successo:`);
        console.log(`  - duckdb_tables query eseguita (tabelle: ${tablesCheck.map(t => t.table_name).join(', ')})`);
        console.log(`  - anime_mappings count query eseguita (risultato: ${animeCheck[0]?.n})`);
        console.log(`  - Nessun 'Conflicting lock' rilevato: OK`);
        console.log(`  - Nessuna 'Ricostruzione da zero' rilevata: OK`);

        await appIndice.close();

        // -----------------------------------------------------------------
        // (d) Rete di sicurezza: verifica recupero retry su lock conteso
        // -----------------------------------------------------------------
        console.log('\n--- (d) Verifica rete di sicurezza (bounded retry su lock transitorio) ---');
        // Creiamo una directory isolata per il test di retry per totale pulizia
        const retryDir = path.resolve(__dirname, '../../.cache/tmdb_probe_retry_' + Date.now());
        fs.mkdirSync(retryDir, { recursive: true });

        const setupStore = createIsolatedStore(retryDir);
        await setupStore.init({ forceRebuild: true });
        await setupStore.close();

        // Trattieni un lock esclusivo grezzo per 100ms
        const rawDbPath = path.join(retryDir, 'catalog.duckdb');
        const lockHolderDb = new duckdb.Database(rawDbPath);
        const lockHolderCon = lockHolderDb.connect();

        setTimeout(() => {
            try {
                lockHolderCon.close(() => {
                    lockHolderDb.close(() => {
                        console.log('[Probe] Lock esclusivo transitorio rilasciato.');
                    });
                });
            } catch (_) {}
        }, 100);

        capturedLogs.length = 0;
        const retryStore = createIsolatedStore(retryDir);
        const retryIndice = new IndiceModule({ duckDb: retryStore });

        await retryIndice.init({ maxRetries: 4, retryDelayMs: 200 });

        const sawLockContention = capturedLogs.some(l => 
            l.text.includes('Lock conteso su') && l.text.includes('Attesa di')
        );
        const recoveredPersistent = capturedLogs.some(l => 
            l.text.includes('Database persistente valido riaperto con successo')
        );
        const avoidedRebuild = !capturedLogs.some(l => 
            l.text.includes('Ricostruzione da zero')
        );

        console.log(`[Probe] Avviso lock conteso intercettato dal retry: ${sawLockContention ? 'SÌ' : 'NO'}`);
        console.log(`[Probe] Database persistente riaperto con successo dopo retry: ${recoveredPersistent ? 'SÌ' : 'NO'}`);
        console.log(`[Probe] Evitata ricostruzione forzata da zero: ${avoidedRebuild ? 'SÌ' : 'NO'}`);

        if (!sawLockContention || !recoveredPersistent || !avoidedRebuild) {
            throw new Error('Il paracadute retry non ha recuperato correttamente il lock conteso!');
        }

        await retryIndice.close();

        console.log('\n=======================================================');
        console.log('Esito Sonda: SUCCESSO — nessun Conflicting lock, il DB si apre.');
        console.log('=======================================================');

    } finally {
        console.warn = origWarn;
        console.log = origLog;
    }
}

runProbe()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n[Probe] ERRORE durante l\'esecuzione della sonda:', err);
        process.exit(1);
    });
