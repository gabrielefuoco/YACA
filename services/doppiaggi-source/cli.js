#!/usr/bin/env node
/**
 * cli.js
 * CLI per il servizio doppiaggi-source di YACA.
 * Scraping di antoniogenna.net/doppiaggio/, lettura anime_airing_state (AnimeUnity)
 * e matching/unione con il catalogo YACA.
 *
 * Uso:
 *   node cli.js --dry-run
 *   node cli.js --health-check
 *   node cli.js --cache-dir <dir>
 *   node cli.js --mongo-uri <uri>
 *   node cli.js --no-anime
 *   node cli.js --help
 */

const fs = require('fs');
const path = require('path');
const { fetchAllIndices } = require('./src/indici');
const { parseIndexPage } = require('./src/parse');
const { loadCatalogFromJsonl, matchCatalog } = require('./src/match');
const { toRows, splitId, writeAnnotations, DEFAULT_FILENAME } = require('./src/writer');
const { mergeAnnotationRows, inspectMerge, readAnnotationRows } = require('./src/annotations');
const { resolveResidualCards, getTmdbApiKey } = require('./src/resolver');
const { loadAnimeDubbedRows } = require('./src/anime');

const WORKSPACE_DIR = path.resolve(__dirname, '..', '..');
const MAIN_REPO_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'YACA');

function resolveFallbackFile(primary, fallback) {
    if (fs.existsSync(primary)) return primary;
    if (fs.existsSync(fallback)) return fallback;
    return primary;
}

const DEFAULT_MOVIES_PATH = resolveFallbackFile(
    path.resolve(WORKSPACE_DIR, '.cache', 'tmdb', 'master_movies.jsonl'),
    path.resolve(MAIN_REPO_DIR, '.cache', 'tmdb', 'master_movies.jsonl')
);
const DEFAULT_TV_PATH = resolveFallbackFile(
    path.resolve(WORKSPACE_DIR, '.cache', 'tmdb', 'master_tv.jsonl'),
    path.resolve(MAIN_REPO_DIR, '.cache', 'tmdb', 'master_tv.jsonl')
);
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '.cache');
const DEFAULT_TMP_DIR = resolveFallbackFile(
    path.resolve(WORKSPACE_DIR, '.scratch', 'doppiaggio-ita', 'tmp'),
    path.resolve(MAIN_REPO_DIR, '.scratch', 'doppiaggio-ita', 'tmp')
);
const DEFAULT_OUTPUT_PATH = path.join(path.dirname(DEFAULT_MOVIES_PATH), DEFAULT_FILENAME);const HEARTBEAT_FILE = 'last-run.json';
const MAX_HEALTH_AGE_MS = 24 * 60 * 60 * 1000; // 24 ore

function findMongoUri() {
    if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
    if (process.env.MONGO_URI) return process.env.MONGO_URI;

    const envPaths = [
        path.resolve(WORKSPACE_DIR, '.env'),
        path.resolve(MAIN_REPO_DIR, '.env')
    ];
    for (const ep of envPaths) {
        if (fs.existsSync(ep)) {
            try {
                const content = fs.readFileSync(ep, 'utf8');
                const m = content.match(/^MONGODB_URI=(.*)$/m) || content.match(/^MONGO_URI=(.*)$/m);
                if (m && m[1].trim()) return m[1].trim();
            } catch (_) {}
        }
    }
    return null;
}

function parseArgs(args) {
    const fallbackDirsList = [
        DEFAULT_TMP_DIR,
        path.resolve(MAIN_REPO_DIR, 'services', 'doppiaggi-source', '.cache'),
        path.resolve(MAIN_REPO_DIR, '.scratch', 'doppiaggio-ita', 'tmp')
    ].filter((d, idx, arr) => d && fs.existsSync(d) && arr.indexOf(d) === idx);

    const opts = {
        dryRun: false,
        healthCheck: false,
        resolveIds: false,
        limit: null,
        maxCalls: Infinity,
        tmdbCacheDir: null,
        delay: 120,
        cacheDir: DEFAULT_CACHE_DIR,
        fallbackDirs: fallbackDirsList,        moviesPath: DEFAULT_MOVIES_PATH,
        tvPath: DEFAULT_TV_PATH,
        outputPath: null,
        limitCatalog: null,
        forceRefresh: false,
        mongoUri: findMongoUri(),
        disableAnime: false,
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
        } else if (arg === '--resolve-ids') {
            opts.resolveIds = true;
        } else if (arg === '--limit' && i + 1 < args.length) {
            const lim = parseInt(args[++i], 10);
            if (!isNaN(lim) && lim > 0) opts.limit = lim;
        } else if (arg === '--max-calls' && i + 1 < args.length) {
            const mc = parseInt(args[++i], 10);
            if (!isNaN(mc) && mc >= 0) opts.maxCalls = mc;
        } else if (arg === '--tmdb-cache-dir' && i + 1 < args.length) {
            opts.tmdbCacheDir = path.resolve(args[++i]);
        } else if (arg === '--delay' && i + 1 < args.length) {
            const d = parseInt(args[++i], 10);
            if (!isNaN(d) && d >= 0) opts.delay = d;
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
        } else if (arg === '--mongo-uri' && i + 1 < args.length) {
            opts.mongoUri = args[++i];
        } else if (arg === '--no-anime' || arg === '--disable-anime') {
            opts.disableAnime = true;
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
Scraper indici Antonio Genna ("Il Mondo dei Doppiatori"), unione AnimeUnity
(anime_airing_state) e matcher con catalogo YACA.

Uso:
  node cli.js [opzioni]

Opzioni base:
  --dry-run             Esegue parsing, unione e match senza scrivere annotazioni su disco  --health-check        Verifica il battito di salute (exit 0 se < 24h, exit 1 altrimenti)
  --force-refresh       Ignora la cache locale e scarica le pagine di rete
  --cache-dir <dir>     Cartella cache delle pagine HTML (default: services/doppiaggi-source/.cache)
  --movies-path <file>  Percorso file master_movies.jsonl
  --tv-path <file>      Percorso file master_tv.jsonl
  --output <file>       Percorso file di output annotazioni
  --limit-catalog <n>   Tetto massimo di titoli catalogo da caricare (per debug rapido)
  --mongo-uri <uri>     URI MongoDB per la collezione anime_airing_state (default: env MONGODB_URI)
  --no-anime            Disattiva l'unione anime (produce unicamente le annotazioni Antonio Genna)
  --help, -h            Mostra questa guida

Opzioni risoluzione TMDB ID (--resolve-ids):
  --resolve-ids         Risolve le schede AG rimaste senza candidato tramite TMDB ID
  --limit <n>           Tetto massimo di schede residue da esaminare
  --max-calls <n>       Budget massimo chiamate API a TMDB (si ferma al raggiungimento)
  --tmdb-cache-dir <d>  Cartella cache risposte TMDB (default: <cache-dir>/tmdb-api)
  --delay <ms>          Ritardo tra chiamate di rete TMDB in ms (default: 120)

Esempi:
  node cli.js --dry-run
  node cli.js --health-check
  node cli.js --resolve-ids --limit 30
  node cli.js --resolve-ids --max-calls 60
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

async function main(customOpts = null) {
    const opts = customOpts || parseArgs(process.argv.slice(2));

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
    console.log('YACA DOPPIAGGI SOURCE - Scraper AG & Unione AnimeUnity');
    console.log(`Modalità: ${opts.dryRun ? 'DRY-RUN (nessuna scrittura)' : 'NORMALE'}`);
    console.log('===============================================================\n');

    const startTime = Date.now();

    // 1. Download / caricamento indici Antonio Genna
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

    // 2. Parsing dei titoli Antonio Genna
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

    // Set di id TV e Movie per la risoluzione precisa del tipo delle righe anime
    const tvIds = new Set();
    const movieIds = new Set();
    for (const r of catalogRecords) {
        const { t, id } = splitId(r.id, r.type, r.t);
        if (t === 'tv') tvIds.add(id);
        else if (t === 'movie') movieIds.add(id);
    }

    // 4. Riconciliazione (Scala di match) Antonio Genna
    console.log('\n[Match] Esecuzione scala di match Antonio Genna...');
    const matchResult = matchCatalog(catalogRecords, agEntries);
    const agRows = toRows(matchResult.annotations);

    // 5. Unione Anime (anime_airing_state da MongoDB)
    let animeRows = [];
    let animeDegraded = false;
    let animeDegradedReason = null;
    let mergeStats = null;

    if (opts.disableAnime) {
        console.log('\n[Anime] Unione AnimeUnity disattivata (--no-anime). Procedo con le sole voci AG.');
    } else {
        console.log('\n[Anime] Recupero anime doppiati da collezione MongoDB anime_airing_state...');
        const animeRes = await loadAnimeDubbedRows({
            mongoUri: opts.mongoUri,
            tvIds,
            movieIds
        });

        if (!animeRes.ok) {
            animeDegraded = true;
            animeDegradedReason = animeRes.error;
            console.warn(`[Anime] ATTENZIONE: Connessione MongoDB non riuscita (${animeRes.error}).`);
            console.warn('[Anime] Procedo in modalità degradata: il file conterrà solo le annotazioni Antonio Genna.');
        } else {
            animeRows = animeRes.rows;
            console.log(`[Anime] Trovati ${animeRows.length} anime doppiati da anime_airing_state.`);
        }
    }

    // 6. Fusione multi-fonte con precedenza true > null > assente
    let finalRows = agRows;
    if (animeRows.length > 0) {
        finalRows = mergeAnnotationRows(agRows, animeRows);
        mergeStats = inspectMerge(agRows, animeRows);
        console.log('\n[Anime] Unione AG ∪ AnimeUnity completata:');
        console.log(`  - Righe aggiunte (nuove da AnimeUnity): ${mergeStats.addedRows}`);
        console.log(`  - Righe promosse (da null AG a true):    ${mergeStats.promotedRows}`);
        console.log(`  - Righe già true in entrambe le fonti:  ${mergeStats.alreadyTrue}`);
        console.log(`  - Totale righe risultanti:              ${finalRows.length} (true: ${mergeStats.mergedTrue} · null: ${mergeStats.mergedNull})`);
    }

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
    console.log('STATISTICHE SUL CATALOGO (SOLO AG):');
    console.log(`  - Totale record catalogo:   ${matchResult.catalogStats.total}`);
    console.log(`  - true  (doppiati certi):   ${matchResult.catalogStats.trueCount}`);
    console.log(`  - null  (indecisione omon.): ${matchResult.catalogStats.nullCount}`);
    console.log(`  - false (non toccati):      ${matchResult.catalogStats.falseCount}`);
    if (mergeStats) {
        console.log('---------------------------------------------------------------');
        console.log('STATISTICHE FINALI CON UNIONE ANIMEUNITY:');
        console.log(`  - Righe totali annotate:    ${finalRows.length}`);
        console.log(`  - true totali:              ${mergeStats.mergedTrue} (+${mergeStats.addedRows + mergeStats.promotedRows} rispetto ad AG sola)`);
        console.log(`  - null totali:              ${mergeStats.mergedNull} (-${mergeStats.promotedRows} promosse a true)`);
    }
    console.log('===============================================================\n');

    // 5. Risoluzione TMDB ID (se richiesta tramite --resolve-ids)
    if (opts.resolveIds) {
        console.log('===============================================================');
        console.log('RISOLUZIONE SCHEDE RESIDUE PER TMDB ID');
        console.log('===============================================================');

        const residualCards = matchResult.agResults
            .filter((r) => r.reason === 'no_candidate_in_db')
            .map((r) => r.agEntry);

        console.log(`[ResolveIDs] Schede AG senza candidato nel catalogo (residuo): ${residualCards.length}`);

        const outputPath = opts.outputPath || DEFAULT_OUTPUT_PATH;
        let baseRows = [];
        if (fs.existsSync(outputPath)) {
            baseRows = await readAnnotationRows(outputPath);
            console.log(`[ResolveIDs] Caricate ${baseRows.length} annotazioni preesistenti da: ${outputPath}`);
        } else {
            const { toRows } = require('./src/writer');
            baseRows = toRows(matchResult.annotations);
            console.log(`[ResolveIDs] File annotazioni non trovato. Usate ${baseRows.length} annotazioni base del match catalogo.`);
        }

        const apiKey = getTmdbApiKey();
        if (!apiKey) {
            console.warn('[ResolveIDs] Avviso: Nessuna chiave TMDB_API_KEY trovata nell\'ambiente o nel file .env.');
        }

        const tmdbCacheDir = opts.tmdbCacheDir || path.join(opts.cacheDir, 'tmdb-api');
        const fallbackDirs = [
            path.join(DEFAULT_TMP_DIR, 'tmdb-api'),
            DEFAULT_TMP_DIR
        ];

        console.log(`[ResolveIDs] Avvio risoluzione (limit: ${opts.limit || 'tutti'}, maxCalls: ${opts.maxCalls === Infinity ? 'illimitato' : opts.maxCalls})...\n`);

        const resolveRes = await resolveResidualCards(residualCards, {
            limit: opts.limit,
            maxCalls: opts.maxCalls,
            cacheDir: tmdbCacheDir,
            fallbackDirs,
            apiKey,
            delayMs: opts.delay,
            onProgress: ({ index, total, card, result, confirmedCount, callsMade, cacheHits, budgetExceeded }) => {
                if (index === 1 || index % 50 === 0 || index === total || budgetExceeded) {
                    const statusStr = result.confirmed && result.hit
                        ? `CONFERMATO (${result.hit.type}:${result.hit.id} via ${result.hit.matchPath})`
                        : `NON confermato (${result.reason})`;
                    console.log(`  [ResolveIDs] [${index}/${total}] "${card.rawTitle}" -> ${statusStr} (tot confermati: ${confirmedCount}, chiamate: ${callsMade}, cache: ${cacheHits})`);
                }
            }
        });

        console.log('\n===============================================================');
        console.log('RIASSUNTO RISOLUZIONE RESIDUO PER TMDB ID');
        console.log('===============================================================');
        console.log(`Schede esaminate:                 ${resolveRes.totalExamined}`);
        console.log(`Identità provata (id confermati): ${resolveRes.confirmedCount} (${resolveRes.totalExamined ? ((resolveRes.confirmedCount / resolveRes.totalExamined) * 100).toFixed(1) : 0}%)`);
        console.log(`  - via titolo italiano:          ${resolveRes.byPath.titolo}`);
        console.log(`  - via titolo originale:         ${resolveRes.byPath.originale}`);
        console.log(`  - via titoli alternativi:       ${resolveRes.byPath.alternativo}`);
        console.log(`Non confermate / nessun match:    ${resolveRes.unconfirmedCount}`);
        console.log(`Chiamate API effettive a TMDB:    ${resolveRes.callsMade}`);
        console.log(`Risposte lette da cache su disco: ${resolveRes.cacheHits}`);
        console.log(`Budget chiamate raggiunto:        ${resolveRes.budgetExceeded ? 'SI (esecuzione interrotta al limite del budget)' : 'NO'}`);
        console.log('===============================================================\n');

        if (opts.dryRun) {
            console.log(`[Writer] Modalità dry-run: nessun file scritto (${resolveRes.resolvedRows.length} nuove righe risolte non salvate).`);
            return { matchResult, resolveResult: resolveRes };
        }

        if (resolveRes.budgetExceeded) {
            console.warn('[Writer] ATTENZIONE: Budget chiamate raggiunto prima di completare il residuo. Nessun file scritto per evitare un file incompleto spacciato per completo. Le chiamate effettuate sono conservate nella cache su disco per la prossima esecuzione.');
            return { matchResult, resolveResult: resolveRes };
        }

        // Unione delle nuove righe risolte con le annotazioni di base
        const finalRows = mergeAnnotationRows(baseRows, resolveRes.resolvedRows);
        const writeResult = await writeAnnotations(finalRows, {
            dryRun: false,
            outputPath,
            respectGuard: true,
            source: 'antoniogenna.net/doppiaggio+tmdb-resolved'
        });

        if (writeResult.written) {
            console.log(`[Writer] Annotazioni aggiornate con successo in: ${writeResult.path}`);
            console.log(`[Writer]   ${writeResult.counts.rows} righe totali (true ${writeResult.counts.true} · null ${writeResult.counts.null}) · meta: ${writeResult.metaPath}`);
        } else if (writeResult.reason === 'guard') {
            const drop = (100 - (writeResult.counts.true / writeResult.previous.counts.true) * 100).toFixed(1);
            console.error('[Writer] GUARDIA: le voci vere sono calate a ' + writeResult.counts.true +
                ' da ' + writeResult.previous.counts.true + ' (-' + drop + '%). ' +
                'Il file precedente NON è stato sovrascritto.');
            process.exitCode = 2;
        }

        return { matchResult, resolveResult: resolveRes, writeResult };
    }

    // 7. Scrittura annotazioni: NDJSON accanto al parquet/dump
    const outputPath = opts.outputPath || path.join(path.dirname(opts.moviesPath), DEFAULT_FILENAME);
    const sourceDesc = animeRows.length > 0
        ? 'antoniogenna.net/doppiaggio ∪ anime_airing_state'
        : 'antoniogenna.net/doppiaggio' + (animeDegraded ? ' (degradato: anime_airing_state assente)' : '');

    const writeResult = await writeAnnotations(finalRows, {
        dryRun: opts.dryRun,
        outputPath,
        source: sourceDesc
    });

    if (writeResult.written) {
        console.log(`[Writer] Annotazioni salvate in: ${writeResult.path}`);
        console.log(`[Writer]   ${writeResult.counts.rows} righe (true ${writeResult.counts.true} · null ${writeResult.counts.null}) · meta: ${writeResult.metaPath}`);
    } else if (writeResult.reason === 'guard') {
        const drop = (100 - (writeResult.counts.true / writeResult.previous.counts.true) * 100).toFixed(1);
        console.error('[Writer] GUARDIA: le voci vere sono calate a ' + writeResult.counts.true +
            ' da ' + writeResult.previous.counts.true + ' (-' + drop + '%). ' +
            'Il file precedente NON è stato sovrascritto. Indagare prima di forzare.');
        if (animeDegraded || opts.disableAnime) {
            console.error('[Writer] NOTA: Il calo potrebbe essere causato dall\'assenza dell\'unione anime in questo giro.');
        }
        process.exitCode = 2;
    } else {
        console.log(`[Writer] Modalità dry-run: nessun file scritto (${writeResult.counts.rows} righe che sarebbero scritte: true ${writeResult.counts.true} · null ${writeResult.counts.null}).`);
    }

    // Registra battito di salute
    writeHeartbeat(opts.cacheDir, {
        catalogStats: matchResult.catalogStats,
        agStats: matchResult.agStats,
        anime: {
            enabled: !opts.disableAnime,
            degraded: animeDegraded,
            degradedReason: animeDegradedReason,
            count: animeRows.length,
            mergeStats
        },
        counts: writeResult.counts,
        elapsedSeconds: elapsed
    });
    console.log('[HealthCheck] Battito di salute registrato.');

    return {
        matchResult,
        agRows,
        animeRows,
        finalRows,
        mergeStats,
        writeResult
    };
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
