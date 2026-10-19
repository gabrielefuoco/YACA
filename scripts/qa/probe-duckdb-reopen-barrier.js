#!/usr/bin/env node
/**
 * scripts/qa/probe-duckdb-reopen-barrier.js
 *
 * Sonda QA per la verifica della barriera atomica di riapertura DuckDB (Ticket 60).
 * Dimostra:
 *   (1) reopenPromise copre l'INTERO ciclo: sia la riapertura del file (_reopenDueToSwap)
 *       sia il ripopolamento post-riapertura (updateAnimeMapping per anime_mappings e buildDfCache).
 *   (2) Una sola barriera: chi attende reopenPromise trova il database PRONTO e interamente
 *       popolato, mai esposto a metà.
 *   (3) Una query concorrente lanciata DURANTE la riapertura attende il termine dell'intero
 *       ripopolamento e non vede mai la tabella anime_mappings incompleta o a zero.
 *   (4) Se la barriera viene azzerata prematuramente prima del ripopolamento (difetto o
 *       flag --disable-fix / --early-release), la sonda intercetta la lettura sporca
 *       e fallisce dimostrativamente con codice di uscita 1.
 *
 * Utilizzo:
 *   node scripts/qa/probe-duckdb-reopen-barrier.js               -> SUCCESSO (exit code 0)
 *   node scripts/qa/probe-duckdb-reopen-barrier.js --disable-fix -> FALLIMENTO DIMOSTRATIVO (exit code 1)
 */

const fs = require('fs');
const path = require('path');
const duckDbStore = require('../../src/indice/duckDbStore');
const { IndiceModule } = require('../../src/indice');
const { animeMappingStore } = require('../../src/anime');

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
    store.checkIntervalMs = 0; // Throttle azzerato per la sonda QA
    return store;
}

async function runBarrierProbe() {
    const disableFix = process.argv.includes('--disable-fix') || process.argv.includes('--early-release');

    console.log('=======================================================');
    console.log('[SONDA QA] Barriera Completa Riapertura DuckDB (Ticket 60)');
    console.log(`Modalità: ${disableFix ? 'DIMOSTRAZIONE FALLIMENTO (Barriera Prematura / Difetto Attivo)' : 'VERIFICA NORMALE (Barriera Completa Attiva)'}`);
    console.log('=======================================================');

    const probeDir = path.resolve(__dirname, '../../.cache/tmdb_probe_barrier_' + Date.now());
    fs.mkdirSync(probeDir, { recursive: true });

    const capturedLogs = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = (...args) => {
        capturedLogs.push({ level: 'log', text: args.join(' ') });
        origLog(...args);
    };
    console.warn = (...args) => {
        capturedLogs.push({ level: 'warn', text: args.join(' ') });
        origWarn(...args);
    };
    console.error = (...args) => {
        capturedLogs.push({ level: 'error', text: args.join(' ') });
        origError(...args);
    };

    // Backup e iniezione anime mappings di test (2000 record per creare un carico realistico)
    const origMovieIds = animeMappingStore.animeTmdbIdsMovie;
    const origShowIds = animeMappingStore.animeTmdbIdsShow;

    const TEST_CERTIFIED_IDS = Array.from({ length: 2000 }, (_, i) => 990001 + i);
    animeMappingStore.animeTmdbIdsMovie = new Set(TEST_CERTIFIED_IDS.slice(0, 1500));
    animeMappingStore.animeTmdbIdsShow = new Set(TEST_CERTIFIED_IDS.slice(1500));

    let appStore = null;
    let appIndice = null;
    let oldInodeShadow = null;

    try {
        // -----------------------------------------------------------------
        // (a) Setup iniziale: il daemon crea il DB iniziale su target
        // -----------------------------------------------------------------
        console.log('\n--- (a) Creazione DB iniziale da parte del daemon ---');
        const daemonStore1 = createIsolatedStore(probeDir);
        const daemonIndice1 = new IndiceModule({ duckDb: daemonStore1 });

        await daemonIndice1.init({ forceRebuild: true, staging: true });
        await daemonIndice1.close();
        await daemonIndice1.swapDatabase();
        oldInodeShadow = path.join(probeDir, 'catalog.duckdb.old_inode');
        fs.copyFileSync(daemonStore1.getTargetDbPath(), oldInodeShadow);
        console.log('[Probe] Database iniziale creato su target.');

        // -----------------------------------------------------------------
        // (b) L'app si avvia, apre il DB e popola anime_mappings iniziale
        // -----------------------------------------------------------------
        console.log('\n--- (b) L\'App si avvia e verifica anime_mappings iniziale ---');
        appStore = createIsolatedStore(probeDir);
        if (disableFix) {
            appStore._simulateEarlyRelease = true;
            console.log('[Probe] Simulazione rilascio prematuro barriera ATTIVATA (--disable-fix).');
        }
        appIndice = new IndiceModule({ duckDb: appStore });
        await appIndice.init();

        const initialRows = await appIndice.queryRaw(
            "SELECT count(*) AS n FROM anime_mappings WHERE tmdb_id >= 990001 AND tmdb_id <= 992000;"
        );
        const initialCount = Number(initialRows?.[0]?.n || 0);
        if (initialCount !== TEST_CERTIFIED_IDS.length) {
            throw new Error(`Inizializzazione fallita: attesi ${TEST_CERTIFIED_IDS.length} record in anime_mappings, trovati ${initialCount}`);
        }
        console.log(`[Probe] App inizializzata: ${initialCount}/${TEST_CERTIFIED_IDS.length} anime certificati presenti in anime_mappings.`);

        // -----------------------------------------------------------------
        // (c) Il daemon compila un nuovo database (.new) e fa lo swap atomico
        // -----------------------------------------------------------------
        console.log('\n--- (c) Daemon compila nuovo catalogo su staging (.new) e scambia atomico ---');
        const daemonStore2 = createIsolatedStore(probeDir);
        const daemonIndice2 = new IndiceModule({ duckDb: daemonStore2 });

        await daemonIndice2.init({ forceRebuild: true, staging: true });
        // Nel nuovo file compilato dal daemon sul disco, la tabella anime_mappings è pulita:
        // il ripopolamento con gli id certificati dell'app avviene solo tramite updateAnimeMapping post-reopen.
        await daemonStore2._exec(daemonStore2.con, "DELETE FROM anime_mappings; CHECKPOINT;");
        await daemonIndice2.close();

        // Su Windows cloniamo la copia ombra sul vecchio inode per simulare handle disconnesso POSIX
        if (process.platform === 'win32') {
            const shadowDb = await appStore._openDb(oldInodeShadow);
            const shadowCon = shadowDb.connect();
            await appStore._closeCon(appStore.con);
            await appStore._closeDb(appStore.db);
            appStore.db = shadowDb;
            appStore.con = shadowCon;
        }

        // Swap atomico del daemon
        await daemonIndice2.swapDatabase(daemonStore2.getStagingDbPath(), daemonStore2.getTargetDbPath());
        console.log('[Probe] Swap atomico completato: il nuovo file su targetDbPath attende la riapertura dell\'app.');

        // -----------------------------------------------------------------
        // (d) Gara di concorrenza: Query 1 attiva la riapertura, Query 2 e 3 leggono durante
        // -----------------------------------------------------------------
        console.log('\n--- (d) Esecuzione concorrente: Query 1 riapre, Query 2 e 3 leggono DURANTE la riapertura ---');
        capturedLogs.length = 0;

        // Query 1: intercetta lo swap e attiva ensureFreshHandle -> _reopenDueToSwap + repopulatePostReopen
        const p1 = appIndice.queryRaw("SELECT count(*) AS n FROM movies;");

        // Query 2: parte CONCORRENTEMENTE all'avvio della riapertura
        const p2 = appIndice.queryRaw(
            "SELECT count(*) AS n FROM anime_mappings WHERE tmdb_id IN (990001, 990002, 990003, 991501, 991502);"
        );

        // Query 3: parte durante la finestra di ripopolamento (dopo 5ms) per verificare l'invarianza nel tempo
        const p3 = new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    const res = await appIndice.queryRaw(
                        "SELECT count(*) AS n FROM anime_mappings WHERE tmdb_id >= 990001 AND tmdb_id <= 992000;"
                    );
                    resolve(res);
                } catch (e) {
                    reject(e);
                }
            }, 5);
        });

        // Query 4: legge un singolo record certificato per confermare integrità e colonne
        const p4 = appIndice.queryRaw(
            "SELECT tmdb_id, tipo FROM anime_mappings WHERE tmdb_id = 990001;"
        );

        const [res1, res2, res3, res4] = await Promise.all([p1, p2, p3, p4]);

        const sampleCount = Number(res2?.[0]?.n ?? -1);
        const totalCountSeen = Number(res3?.[0]?.n ?? -1);
        const singleRowSeen = Array.isArray(res4) && res4.length === 1 && Number(res4[0].tmdb_id) === 990001;
        const sawReopenLog = capturedLogs.some(l => l.text.includes('[DuckDB Store] Database scambiato: riaperto'));

        console.log(`[Probe] Esito esecuzione concorrente:`);
        console.log(`  - Log riapertura intercettato: ${sawReopenLog ? 'SÌ' : 'NO'}`);
        console.log(`  - Campione visto da query simultanea (Q2): ${sampleCount}/5`);
        console.log(`  - Totale visto da query a metà finestra (Q3): ${totalCountSeen}/${TEST_CERTIFIED_IDS.length}`);
        console.log(`  - Riga certificata 990001 trovata con tipo corretto: ${singleRowSeen ? 'SÌ' : 'NO'}`);

        if (disableFix) {
            // In modalità difetto dimostrativo: almeno una delle query concorrenti DEVE aver visto la tabella incompleta o a zero
            const isCorrupted = sampleCount < 5 || totalCountSeen < TEST_CERTIFIED_IDS.length || !singleRowSeen;
            if (!isCorrupted) {
                throw new Error('[ANOMALIA] La barriera era disabilitata ma le query concorrenti hanno comunque visto tutti i dati!');
            }
            console.log('\n=======================================================');
            console.log('Esito Sonda: FALLIMENTO DIMOSTRATIVO ACCERTATO — senza barriera completa, le query concorrenti vedono dati incompleti.');
            console.log(`Conteggi riscontrati durante il difetto: Q2=${sampleCount}/5, Q3=${totalCountSeen}/${TEST_CERTIFIED_IDS.length}`);
            console.log('=======================================================');
            process.exit(1);
        }

        // In modalità normale (con fix): le query concorrenti DEVONO attendere e vedere la totalità dei dati
        if (!sawReopenLog) {
            throw new Error('Manca il log obbligatorio di riapertura database!');
        }
        if (sampleCount !== 5) {
            throw new Error(
                `DIFETTO RILEVATO: Query simultanea ha visto anime_mappings incompleta (${sampleCount}/5)!`
            );
        }
        if (totalCountSeen !== TEST_CERTIFIED_IDS.length) {
            throw new Error(
                `DIFETTO RILEVATO: Query a metà finestra ha visto anime_mappings incompleta (${totalCountSeen}/${TEST_CERTIFIED_IDS.length})!`
            );
        }
        if (!singleRowSeen) {
            throw new Error('Query concorrente non ha trovato il record certificato 990001!');
        }

        await appIndice.close();

        console.log('\n=======================================================');
        console.log('Esito Sonda: SUCCESSO — la barriera copre riapertura E ripopolamento: nessuna tabella a metà.');
        console.log('=======================================================');

    } finally {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;

        // Ripristino store originale anime
        animeMappingStore.animeTmdbIdsMovie = origMovieIds;
        animeMappingStore.animeTmdbIdsShow = origShowIds;

        if (oldInodeShadow && fs.existsSync(oldInodeShadow)) {
            try { fs.unlinkSync(oldInodeShadow); } catch (_) {}
        }
        try {
            if (fs.existsSync(probeDir)) {
                fs.rmSync(probeDir, { recursive: true, force: true });
            }
        } catch (_) {}
    }
}

runBarrierProbe()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n[Probe] ERRORE durante l\'esecuzione della sonda:', err.message);
        process.exit(1);
    });
