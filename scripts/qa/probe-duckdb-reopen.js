#!/usr/bin/env node
/**
 * scripts/qa/probe-duckdb-reopen.js
 *
 * Sonda QA per la verifica della riapertura automatica DuckDB dopo lo scambio atomico (Ticket 59).
 * Dimostra:
 *   (a) L'app apre il database persistente iniziale e legge una riga riconoscibile (riga A).
 *   (b) Il daemon compila un nuovo database su staging (.new) con una riga diversa (riga B) ed effettua lo swap atomico.
 *   (c) L'app, senza riavviare il processo, alla query successiva rileva il cambio di identità del file,
 *       chiude il vecchio handle e riapre il database fresco, vedendo la riga B ed emettendo il log:
 *       "[DuckDB Store] Database scambiato: riaperto".
 *   (d) Dimostrazione di veridicità: se la riapertura è disattivata (flag --disable-reopen), la sonda
 *       fallisce dimostrando che l'app rimarrebbe bloccata a servire il vecchio inode stantio.
 *
 * Utilizzo:
 *   node scripts/qa/probe-duckdb-reopen.js                  -> SUCCESSO
 *   node scripts/qa/probe-duckdb-reopen.js --disable-reopen -> FALLIMENTO DIMOSTRATIVO (exit code 1)
 */

const fs = require('fs');
const path = require('path');
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
    store.checkIntervalMs = 0; // Throttle azzerato per la sonda QA
    return store;
}

async function runProbe() {
    const disableReopen = process.argv.includes('--disable-reopen');

    console.log('=======================================================');
    console.log('[SONDA QA] Riapertura Automatica DuckDB Dopo Scambio (Ticket 59)');
    console.log(`Modalità: ${disableReopen ? 'DIMOSTRAZIONE FALLIMENTO (Riapertura Disattivata)' : 'VERIFICA NORMALE (Riapertura Attiva)'}`);
    console.log('=======================================================');

    const probeDir = path.resolve(__dirname, '../../.cache/tmdb_probe_reopen_' + Date.now());
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

    let appStore = null;
    let appIndice = null;
    let oldInodeShadow = null;

    try {
        // -----------------------------------------------------------------
        // (a) Setup iniziale: il daemon crea il DB iniziale con la riga A (100001)
        // -----------------------------------------------------------------
        console.log('\n--- (a) Creazione DB iniziale da parte del daemon con Riga A (100001) ---');
        const daemonStore1 = createIsolatedStore(probeDir);
        const daemonIndice1 = new IndiceModule({ duckDb: daemonStore1 });

        await daemonIndice1.init({ forceRebuild: true, staging: true });
        await daemonStore1._exec(daemonStore1.con, "INSERT INTO anime_mappings VALUES (100001, 'movie'); CHECKPOINT;");
        await daemonIndice1.close();
        await daemonIndice1.swapDatabase();
        oldInodeShadow = path.join(probeDir, 'catalog.duckdb.old_inode');
        fs.copyFileSync(daemonStore1.getTargetDbPath(), oldInodeShadow);
        console.log('[Probe] Database iniziale creato su target con riga 100001.');

        // -----------------------------------------------------------------
        // (b) L'app apre il database persistente e legge la riga A
        // -----------------------------------------------------------------
        console.log('\n--- (b) L\'App apre il database persistente e verifica la riga iniziale ---');
        appStore = createIsolatedStore(probeDir);
        appIndice = new IndiceModule({ duckDb: appStore });

        await appIndice.init();

        const initialRows = await appIndice.queryRaw("SELECT tmdb_id, tipo FROM anime_mappings WHERE tmdb_id = 100001;");
        if (!initialRows || initialRows.length !== 1 || Number(initialRows[0].tmdb_id) !== 100001) {
            throw new Error(`L'App non ha trovato la riga iniziale 100001: trovate ${JSON.stringify(initialRows)}`);
        }
        console.log(`[Probe] App inizializzata: riga iniziale 100001 letta correttamente (mtime: ${appStore.fileIdentity?.mtimeMs}, size: ${appStore.fileIdentity?.size}).`);

        // -----------------------------------------------------------------
        // (c) Il daemon compila su staging (.new) con la riga B (100002) e scambia
        // -----------------------------------------------------------------
        console.log('\n--- (c) Daemon compila nuovo catalogo su staging (.new) con Riga B (100002) e scambia ---');
        const daemonStore2 = createIsolatedStore(probeDir);
        const daemonIndice2 = new IndiceModule({ duckDb: daemonStore2 });

        await daemonIndice2.init({ forceRebuild: true, staging: true });
        // Nel nuovo catalogo c'è solo la riga 100002 (la 100001 non c'è più)
        await daemonStore2._exec(daemonStore2.con, "INSERT INTO anime_mappings VALUES (100002, 'movie'); CHECKPOINT;");
        await daemonIndice2.close();
        console.log('[Probe] Daemon ha terminato la build su staging (.new).');

        // Su Windows DuckDB tiene un lock a livello filesystem NT che rifiuterebbe la sovrascrittura
        // dello swap atomico MoveFileEx finché il percorso target è associato al processo.
        // Cloniamo la copia ombra sul vecchio inode per simulare fedelmente l'handle disconnesso POSIX:
        if (process.platform === 'win32') {
            const shadowDb = await appStore._openDb(oldInodeShadow);
            const shadowCon = shadowDb.connect();
            await appStore._closeCon(appStore.con);
            await appStore._closeDb(appStore.db);
            appStore.db = shadowDb;
            appStore.con = shadowCon;
            // L'app resta inizializzata su targetDbPath, ma il suo handle attivo punta al vecchio database
        }

        // Swap atomico eseguito dal daemon
        await daemonIndice2.swapDatabase(daemonStore2.getStagingDbPath(), daemonStore2.getTargetDbPath());
        console.log('[Probe] Daemon ha completato lo swap atomico: targetDbPath contiene ora il nuovo catalogo.');

        // Se siamo in modalità dimostrazione fallimento, disabilitiamo la riapertura nell'app
        if (disableReopen) {
            appStore.disableAutoReopen = true;
            console.log('[Probe] Riapertura automatica app DISABILITATA per testare il fallimento.');
        }

        // -----------------------------------------------------------------
        // (d) Query successiva dal lato app SENZA riavviare il processo
        // -----------------------------------------------------------------
        console.log('\n--- (d) Esecuzione query dal lato App senza riavviare il processo ---');
        capturedLogs.length = 0;

        const newRows = await appIndice.queryRaw("SELECT tmdb_id, tipo FROM anime_mappings WHERE tmdb_id = 100002;");
        const oldRows = await appIndice.queryRaw("SELECT tmdb_id, tipo FROM anime_mappings WHERE tmdb_id = 100001;");

        const sawNewRow = Array.isArray(newRows) && newRows.length === 1 && Number(newRows[0].tmdb_id) === 100002;
        const sawOldRow = Array.isArray(oldRows) && oldRows.length > 0;
        const sawReopenLog = capturedLogs.some(l => l.text.includes('[DuckDB Store] Database scambiato: riaperto'));

        if (disableReopen) {
            // In modalità fallimento dimostrativo: l'app NON deve vedere la riga nuova
            if (sawNewRow || sawReopenLog) {
                throw new Error('[ANOMALIA] La riapertura era disabilitata ma l\'app ha comunque visto la riga nuova!');
            }
            console.log('\n[Probe] Risultato con riapertura disattivata:');
            console.log(`  - Riga nuova (100002) vista: ${sawNewRow ? 'SÌ' : 'NO (previsto: continua a leggere il vecchio inode)'}`);
            console.log(`  - Riga vecchia (100001) ancora presente: ${sawOldRow ? 'SÌ' : 'NO'}`);
            console.log(`  - Log di riapertura emesso: ${sawReopenLog ? 'SÌ' : 'NO'}`);
            console.log('\n=======================================================');
            console.log('Esito Sonda: FALLIMENTO DIMOSTRATIVO ACCERTATO — senza riapertura l\'app resta stantia.');
            console.log('=======================================================');
            process.exit(1);
        }

        // In modalità normale: l'app DEVE riaprire e vedere la riga nuova
        console.log('\n[Probe] Risultati con riapertura automatica attiva:');
        console.log(`  - Log riapertura intercettato: ${sawReopenLog ? 'SÌ' : 'NO'}`);
        console.log(`  - Riga nuova (100002) trovata: ${sawNewRow ? 'SÌ' : 'NO'}`);
        console.log(`  - Riga vecchia (100001) rimossa: ${!sawOldRow ? 'SÌ' : 'NO'}`);

        if (!sawReopenLog) {
            throw new Error('Manca il log obbligatorio "[DuckDB Store] Database scambiato: riaperto"!');
        }
        if (!sawNewRow) {
            throw new Error('L\'App non ha visto la riga nuova 100002 dopo lo swap atomico!');
        }
        if (sawOldRow) {
            throw new Error('L\'App vede ancora la riga vecchia 100001 nonostante lo swap!');
        }

        await appIndice.close();

        console.log('\n=======================================================');
        console.log('Esito Sonda: SUCCESSO — l\'app riapre dopo lo scambio e serve dati freschi.');
        console.log('=======================================================');

    } finally {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;

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

runProbe()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\n[Probe] ERRORE durante l\'esecuzione della sonda:', err.message);
        process.exit(1);
    });
