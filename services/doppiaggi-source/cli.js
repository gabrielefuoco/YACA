#!/usr/bin/env node
/**
 * cli.js
 * CLI per il servizio doppiaggi-source di YACA.
 * Scraping di antoniogenna.net/doppiaggio/ e matching con il catalogo YACA.
 *
 * Uso:
 *   node cli.js --dry-run
 *   node cli.js --health-check
 *   node cli.js --cache-dir <dir>
 *   node cli.js --help
 */

const fs = require('fs');
const path = require('path');
const { fetchAllIndices } = require('./src/indici');
const { parseIndexPage } = require('./src/parse');
const { loadCatalogFromJsonl, matchCatalog } = require('./src/match');
const { writeAnnotations, DEFAULT_FILENAME } = require('./src/writer');

const DEFAULT_CACHE_DIR = path.resolve(__dirname, '.cache');
const DEFAULT_TMP_DIR = path.resolve(__dirname, '..', '..', '.scratch', 'doppiaggio-ita', 'tmp');
const DEFAULT_MOVIES_PATH = path.resolve(__dirname, '..', '..', '.cache', 'tmdb', 'master_movies.jsonl');
const DEFAULT_TV_PATH = path.resolve(__dirname, '..', '..', '.cache', 'tmdb', 'master_tv.jsonl');
const HEARTBEAT_FILE = 'last-run.json';
const MAX_HEALTH_AGE_MS = 24 * 60 * 60 * 1000; // 24 ore

function parseArgs(args) {
    const opts = {
        dryRun: false,
        healthCheck: false,
        cacheDir: DEFAULT_CACHE_DIR,
        fallbackDirs: [DEFAULT_TMP_DIR],
        moviesPath: DEFAULT_MOVIES_PATH,
        tvPath: DEFAULT_TV_PATH,
        outputPath: null,
        limitCatalog: null,
        forceRefresh: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--dry-run') {
            opts.dryRun = true;
        } else if (arg === '--health-check') {
            opts.healthCheck = true;
        } else if (arg === '--force-refresh') {
            opts.forceRefresh = true;
        } else if (arg === '--cache-dir' && i + 1 < args.length) {
            opts.cacheDir = path.resolve(args[++i]);
        } else if (arg === '--movies-path' && i + 1 < args.length) {
            opts.moviesPath = path.resolve(args[++i]);
        } else if (arg === '--tv-path' && i + 1 < args.length) {
            opts.tvPath = path.resolve(args[++i]);
        } else if (arg === '--output' && i + 1 < args.length) {
            opts.outputPath = path.resolve(args[++i]);
        } else if (arg === '--limit-catalog' && i + 1 < args.length) {
            const lim = parseInt(args[++i], 10);
            if (!isNaN(lim) && lim > 0) opts.limitCatalog = lim;
        } else if (arg === '--help' || arg === '-h') {
            opts.help = true;
        }
    }

    return opts;
}

function printHelp() {
    console.log(`
YACA Doppiaggi Source Service
=============================
Scraper indici Antonio Genna ("Il Mondo dei Doppiatori") e matcher con catalogo YACA.

Uso:
  node cli.js [opzioni]

Opzioni:
  --dry-run             Esegue parsing e match senza scrivere annotazioni su disco
  --health-check        Verifica il battito di salute (exit 0 se < 24h, exit 1 altrimenti)
  --force-refresh       Ignora la cache locale e scarica le pagine di rete
  --cache-dir <dir>     Cartella cache delle pagine HTML (default: services/doppiaggi-source/.cache)
  --movies-path <file>  Percorso file master_movies.jsonl
  --tv-path <file>      Percorso file master_tv.jsonl
  --output <file>       Percorso file di output annotazioni (preview)
  --limit-catalog <n>   Tetto massimo di titoli catalogo da caricare (per debug rapido)
  --help, -h            Mostra questa guida

Esempi:
  node cli.js --dry-run
  node cli.js --health-check
`);
}

function writeHeartbeat(cacheDir, stats) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const file = path.join(cacheDir, HEARTBEAT_FILE);
    const data = {
        timestamp: new Date().toISOString(),
        stats
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function checkHealth(cacheDir) {
    const file = path.join(cacheDir, HEARTBEAT_FILE);
    if (!fs.existsSync(file)) {
        return { ok: false, message: 'Nessun battito registrato (file last-run.json mancante).' };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const ageMs = Date.now() - new Date(raw.timestamp).getTime();
        const ageHours = (ageMs / (1000 * 60 * 60)).toFixed(1);
        if (ageMs < MAX_HEALTH_AGE_MS) {
            return {
                ok: true,
                message: `Battito di salute regolare: ultimo giro eseguito ${ageHours}h fa (${raw.timestamp}).`
            };
        }
        return {
            ok: false,
            message: `Battito scaduto: ultimo giro eseguito ${ageHours}h fa (superiore a 24h).`
        };
    } catch (err) {
        return { ok: false, message: `Errore lettura battito: ${err.message}` };
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));

    if (opts.help) {
        printHelp();
        process.exit(0);
    }

    if (opts.healthCheck) {
        const health = checkHealth(opts.cacheDir);
        if (health.ok) {
            console.log(`[HealthCheck] ${health.message}`);
            process.exit(0);
        } else {
            console.error(`[HealthCheck] ${health.message}`);
            process.exit(1);
        }
    }

    console.log('===============================================================');
    console.log('YACA DOPPIAGGI SOURCE - Scraper indici & Matcher catalogo');
    console.log(`Modalità: ${opts.dryRun ? 'DRY-RUN (nessuna scrittura)' : 'NORMALE'}`);
    console.log('===============================================================\n');

    const startTime = Date.now();

    // 1. Download / caricamento indici
    console.log('[Indici] Recupero pagine d\'indice (4 zone utili)...');
    const indexPages = await fetchAllIndices({
        cacheDir: opts.cacheDir,
        fallbackDirs: opts.fallbackDirs,
        forceRefresh: opts.forceRefresh,
        onProgress: ({ page, index, total, fromCache }) => {
            if (index === 1 || index % 20 === 0 || index === total) {
                console.log(`  [Indici] [${index}/${total}] ${page} ${fromCache ? '(da cache)' : '(scaricato)'}`);
            }
        }
    });

    if (indexPages.length === 0) {
        console.error('[Indici] Errore critico: Nessuna pagina d\'indice disponibile.');
        process.exit(1);
    }

    // 2. Parsing dei titoli
    console.log('\n[Parse] Estrazione titoli e normalizzazione...');
    const agMapByHref = new Map();
    for (const page of indexPages) {
        const entries = parseIndexPage(page.html, page.page);
        for (const entry of entries) {
            if (!agMapByHref.has(entry.href)) {
                agMapByHref.set(entry.href, entry);
            }
        }
    }

    const agEntries = Array.from(agMapByHref.values());
    console.log(`[Parse] Schede uniche estratte: ${agEntries.length} su ${indexPages.length} pagine analizzate.`);

    // 3. Caricamento catalogo YACA
    console.log('\n[Catalogo] Caricamento catalogo YACA (master_movies + master_tv)...');
    const catalogRecords = await loadCatalogFromJsonl(opts.moviesPath, opts.tvPath, opts.limitCatalog);
    console.log(`[Catalogo] Record caricati: ${catalogRecords.length} (film: ${catalogRecords.filter((r) => r.type === 'movie').length}, serie: ${catalogRecords.filter((r) => r.type === 'series').length})`);

    if (catalogRecords.length === 0) {
        console.warn('[Catalogo] Avviso: Nessun record caricato dal catalogo. Verifica i percorsi specificati.');
    }

    // 4. Riconciliazione (Scala di match)
    console.log('\n[Match] Esecuzione scala di match...');
    const matchResult = matchCatalog(catalogRecords, agEntries);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // Stampa report completo e numeri richiesti
    console.log('\n===============================================================');
    console.log('RIASSUNTO ESECUZIONE E NUMERI DI MATCH');
    console.log('===============================================================');
    console.log(`Tempo totale impiegato: ${elapsed}s`);
    console.log(`Pagine d'indice caricate: ${indexPages.length}`);
    console.log(`Voci AG estratte (schede uniche): ${agEntries.length}`);
    console.log('---------------------------------------------------------------');
    console.log('STATISTICHE SULLE VOCI ANTONIO GENNA:');
    console.log(`  - Matched univoche (true):  ${matchResult.agStats.matchedTrue} (${((matchResult.agStats.matchedTrue / agEntries.length) * 100).toFixed(1)}%)`);
    console.log(`  - Omonimi irrisolti (null): ${matchResult.agStats.ambiguousNull} (${((matchResult.agStats.ambiguousNull / agEntries.length) * 100).toFixed(1)}%)`);
    console.log(`  - Non trovate nel DB:       ${matchResult.agStats.unmatchedZero} (${((matchResult.agStats.unmatchedZero / agEntries.length) * 100).toFixed(1)}%)`);
    console.log('---------------------------------------------------------------');
    console.log('STATISTICHE SUI RECORD DEL CATALOGO:');
    console.log(`  - Totale record catalogo:   ${matchResult.catalogStats.total}`);
    console.log(`  - true  (doppiati certi):   ${matchResult.catalogStats.trueCount} (${matchResult.catalogStats.total ? ((matchResult.catalogStats.trueCount / matchResult.catalogStats.total) * 100).toFixed(1) : 0}%)`);
    console.log(`  - null  (indecisione omon.): ${matchResult.catalogStats.nullCount} (${matchResult.catalogStats.total ? ((matchResult.catalogStats.nullCount / matchResult.catalogStats.total) * 100).toFixed(1) : 0}%)`);
    console.log(`  - false (non toccati):      ${matchResult.catalogStats.falseCount} (${matchResult.catalogStats.total ? ((matchResult.catalogStats.falseCount / matchResult.catalogStats.total) * 100).toFixed(1) : 0}%)`);
    console.log('===============================================================\n');

    // 5. Scrittura annotazioni: NDJSON accanto al parquet/dump (il parquet tipato lo fa il core)
    const outputPath = opts.outputPath || path.join(path.dirname(opts.moviesPath), DEFAULT_FILENAME);
    const writeResult = await writeAnnotations(matchResult.annotations, {
        dryRun: opts.dryRun,
        outputPath,
        source: 'antoniogenna.net/doppiaggio'
    });

    if (writeResult.written) {
        console.log(`[Writer] Annotazioni salvate in: ${writeResult.path}`);
        console.log(`[Writer]   ${writeResult.counts.rows} righe (true ${writeResult.counts.true} · null ${writeResult.counts.null}) · meta: ${writeResult.metaPath}`);
    } else if (writeResult.reason === 'guard') {
        const drop = (100 - (writeResult.counts.true / writeResult.previous.counts.true) * 100).toFixed(1);
        console.error('[Writer] GUARDIA: le voci vere sono calate a ' + writeResult.counts.true +
            ' da ' + writeResult.previous.counts.true + ' (-' + drop + '%). ' +
            'Il file precedente NON è stato sovrascritto. Indagare prima di forzare.');
        process.exitCode = 2;
    } else {
        console.log(`[Writer] Modalità dry-run: nessun file scritto (${writeResult.counts.rows} righe che sarebbero scritte: true ${writeResult.counts.true} · null ${writeResult.counts.null}).`);
    }

    // Registra battito di salute
    writeHeartbeat(opts.cacheDir, {
        catalogStats: matchResult.catalogStats,
        agStats: matchResult.agStats,
        elapsedSeconds: elapsed
    });
    console.log('[HealthCheck] Battito di salute registrato.');

    return matchResult;
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[Cli] Errore irreversibile:', err);
        process.exit(1);
    });
}

module.exports = {
    parseArgs,
    main
};
