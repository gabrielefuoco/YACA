#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { buildTier2, Tier2SearchClient, getTier2Stats, defaultDataDir } = require('../src/db/tier2Index');

function parseArgs(argv = process.argv.slice(2)) {
    const args = {
        dataDir: null,
        dbFile: null,
        parquetFile: null,
        sourceParquet: null,
        benchmark: false
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--data-dir' && argv[i + 1]) {
            args.dataDir = path.resolve(argv[++i]);
        } else if (arg === '--db-file' && argv[i + 1]) {
            args.dbFile = path.resolve(argv[++i]);
        } else if (arg === '--parquet-file' && argv[i + 1]) {
            args.parquetFile = path.resolve(argv[++i]);
        } else if (arg === '--source-parquet' && argv[i + 1]) {
            args.sourceParquet = path.resolve(argv[++i]);
        } else if (arg === '--benchmark') {
            args.benchmark = true;
        } else if (arg === '-h' || arg === '--help') {
            printHelp();
            process.exit(0);
        }
    }

    if (!args.dataDir) {
        args.dataDir = defaultDataDir();
    }

    return args;
}

function printHelp() {
    console.log(`
Uso: node scripts/build_tier2_fts5.js [opzioni]

Opzioni:
  --data-dir <percorso>       Directory dei dati (default: .cache/tmdb o /data/tmdb)
  --db-file <percorso>        Percorso del file SQLite FTS5 (default: <data-dir>/titles_fts5.db)
  --parquet-file <percorso>   Percorso del parquet Tier 2 (default: <data-dir>/tier2_titles.parquet)
  --source-parquet <percorso> Sorgente parquet custom (es. dataset 1.46M benchmark)
  --benchmark                 Esegue benchmark query di latenza e memoria dopo la build
  -h, --help                  Mostra questa guida
`);
}

function measureProcessMemoryMb() {
    const mem = process.memoryUsage();
    return {
        rss: Number((mem.rss / (1024 * 1024)).toFixed(2)),
        heapUsed: Number((mem.heapUsed / (1024 * 1024)).toFixed(2))
    };
}

async function runBenchmark(dbFile) {
    console.log('\n=== BENCHMARK QUERY FTS5 SU DISCO ===');
    const client = new Tier2SearchClient({ dbPath: dbFile, readOnly: true });
    if (!client.init()) {
        console.error('Impossibile aprire DB FTS5 per benchmark');
        return;
    }

    const testQueries = [
        { label: "Termine singolo comune ('spider')", query: 'spider' },
        { label: "Due termini ('batman begins')", query: 'batman begins' },
        { label: "Termine specifico anime ('conan')", query: 'conan' },
        { label: "Termine con punteggiatura ('resident evil: apocalypse')", query: 'resident evil: apocalypse' },
        { label: "Frase con carattere speciale ('fast & furious')", query: 'fast & furious' }
    ];

    const results = [];

    for (const { label, query } of testQueries) {
        // Warmup
        client.search(query, { limit: 20 });

        const runs = 20;
        const times = [];
        let rowCount = 0;

        for (let i = 0; i < runs; i++) {
            const start = process.hrtime.bigint();
            const rows = client.search(query, { limit: 20 });
            const end = process.hrtime.bigint();
            times.push(Number(end - start) / 1e6);
            rowCount = rows.length;
        }

        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);

        console.log(`[${label}] -> avg: ${avg.toFixed(2)} ms (min: ${min.toFixed(2)} ms, max: ${max.toFixed(2)} ms, rows: ${rowCount})`);
        results.push({ label, query, avg, min, max, rowCount });
    }

    client.close();
    return results;
}

async function main() {
    const args = parseArgs();

    console.log('=== BUILD TIER 2: INDICE EXPORT TMDB + FTS5 SU DISCO ===');
    console.log(`Data Dir:     ${args.dataDir}`);
    if (args.sourceParquet) {
        console.log(`Source:       ${args.sourceParquet} (custom parquet)`);
    }

    const memBefore = measureProcessMemoryMb();
    console.log(`Process RSS iniziale: ${memBefore.rss} MB`);

    const result = await buildTier2({
        dataDir: args.dataDir,
        dbFile: args.dbFile,
        parquetFile: args.parquetFile,
        sourceParquet: args.sourceParquet
    });

    const memAfter = measureProcessMemoryMb();

    console.log('\n--- RISULTATO BUILD ---');
    console.log(`✅ Righe indicizzate:  ${result.count.toLocaleString('it-IT')}`);
    console.log(`✅ Parquet Tier 2:     ${result.parquetFile} (${result.parquetSizeMb} MB)`);
    console.log(`✅ SQLite FTS5:        ${result.dbFile} (${result.dbSizeMb} MB)`);
    console.log(`✅ Tempo di build:     ${result.durationSeconds} s (${result.durationMs} ms)`);
    console.log(`✅ Process RSS finale:  ${memAfter.rss} MB (Delta: ${(memAfter.rss - memBefore.rss).toFixed(2)} MB)`);

    // Esegui benchmark latenza query
    const benchResults = await runBenchmark(result.dbFile);

    const overallAvg = benchResults.reduce((sum, r) => sum + r.avg, 0) / benchResults.length;
    console.log(`\nLatenza media query FTS5 complessiva: ${overallAvg.toFixed(2)} ms`);

    return result;
}

if (require.main === module) {
    main().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('\n❌ Errore fatale build Tier 2:', err);
        process.exit(1);
    });
}

module.exports = { main, parseArgs };
