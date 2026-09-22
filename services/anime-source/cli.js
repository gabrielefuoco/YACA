#!/usr/bin/env node
/**
 * cli.js
 * CLI per il servizio anime-source di YACA.
 * 
 * Uso:
 *   node cli.js --dry-run
 *   node cli.js --dry-run --series Dandadan
 *   node cli.js --once
 *   node cli.js --health-check
 *   node cli.js --limit 50
 *   node cli.js
 */

const { AnimeUnityClient } = require('./src/animeunity');
const { IdentityResolver } = require('./src/identity');
const { buildAiringStateDocument, cleanTitle } = require('./src/aggregate');
const { AiringStateStore } = require('./src/store');
const { SeriesDiscoveryManager } = require('./src/discovery');

const DEFAULT_MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/yaca';
const REFRESH_AIRING_MS = 3 * 60 * 60 * 1000;      // ~3 ore per serie in corso
const DEFAULT_LIMIT = 300;                         // ~300 serie come budget per giro (ticket 20)

function parseArgs(args) {
    const opts = {
        dryRun: false,
        once: false,
        series: null,
        mongoUri: DEFAULT_MONGO_URI,
        limit: DEFAULT_LIMIT,
        healthCheck: false,
        refreshList: false,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--dry-run') {
            opts.dryRun = true;
        } else if (arg === '--once') {
            opts.once = true;
        } else if (arg === '--series' && i + 1 < args.length) {
            opts.series = args[++i];
        } else if (arg === '--mongo-uri' && i + 1 < args.length) {
            opts.mongoUri = args[++i];
        } else if (arg === '--limit' && i + 1 < args.length) {
            const parsedLimit = parseInt(args[++i], 10);
            if (!isNaN(parsedLimit) && parsedLimit > 0) {
                opts.limit = parsedLimit;
            }
        } else if (arg === '--health-check') {
            opts.healthCheck = true;
        } else if (arg === '--refresh-list') {
            opts.refreshList = true;
        } else if (arg === '--help' || arg === '-h') {
            opts.help = true;
        }
    }

    return opts;
}

function printHelp() {
    console.log(`
YACA Anime Source Service
=========================
Uso:
  node cli.js [opzioni]

Opzioni:
  --dry-run             Esegue il fetch e stampa a console i documenti JSON senza scrivere su DB
  --once                Esegue una sola scansione ed esce
  --series <titolo>     Debug: cerca ed elabora solo la serie specificata (esce subito)
  --limit <n>           Tetto massimo di serie per giro (default: 300)
  --health-check        Verifica il battito di salute (exit 0 se < 12h, exit 1 altrimenti)
  --refresh-list        Forza la riscoperta della lista da AnimeUnity ignorando la cache di 24h
  --mongo-uri <uri>     URI MongoDB (default: env MONGODB_URI o mongodb://localhost:27017/yaca)
  --help, -h            Mostra questo messaggio di aiuto

Esempi:
  node cli.js --dry-run
  node cli.js --health-check
  node cli.js --dry-run --series Dandadan
  node cli.js --once --limit 50
  node cli.js --mongo-uri mongodb://127.0.0.1:27017/yaca
`);
}

/**
 * Raggruppa i record grezzi dell'archivio AnimeUnity per TMDB ID (e stagione)
 * associando sub (dub: 0) e doppiato (dub: 1) di tutte le stagioni della serie.
 */
function groupRecordsByTmdb(records, identityResolver) {
    const tmdbGroups = new Map();

    for (const rec of records) {
        const anilistId = rec.anilist_id;
        const malId = rec.mal_id;
        const identity = identityResolver.resolve({ anilistId, malId });

        const rawTitle = rec.title || rec.title_eng || rec.title_it || rec.slug || `Anime #${rec.id}`;

        if (!identity || !identity.tmdbId) {
            console.warn(`[AnimeSource] Record "${rawTitle}" (id ${rec.id}) non risolto in TMDB ID. Record saltato.`);
            continue;
        }

        const tmdbId = String(identity.tmdbId);
        if (!tmdbGroups.has(tmdbId)) {
            tmdbGroups.set(tmdbId, {
                tmdbId,
                title: cleanTitle(rawTitle),
                seasonsMap: new Map()
            });
        }

        const group = tmdbGroups.get(tmdbId);
        if (!group.title && rawTitle) {
            group.title = cleanTitle(rawTitle);
        }

        const seasonNum = Number(identity.season) || 1;

        if (!group.seasonsMap.has(seasonNum)) {
            group.seasonsMap.set(seasonNum, {
                season: seasonNum,
                subRecord: null,
                dubRecord: null,
                identity
            });
        }

        const seasonEntry = group.seasonsMap.get(seasonNum);
        if (Number(rec.dub) === 1) {
            seasonEntry.dubRecord = rec;
        } else {
            seasonEntry.subRecord = rec;
        }
    }

    return Array.from(tmdbGroups.values());
}

async function processTmdbGroup(group, animeClient) {
    const seasons = [];

    for (const seasonEntry of group.seasonsMap.values()) {
        let subEpisodes = [];
        if (seasonEntry.subRecord) {
            const endRange = seasonEntry.subRecord.episodes_count ? Math.max(Number(seasonEntry.subRecord.episodes_count), 12) : 100;
            const subData = await animeClient.getEpisodes(seasonEntry.subRecord.id, 0, { startRange: 1, endRange });
            if (subData && Array.isArray(subData.episodes)) {
                subEpisodes = subData.episodes;
            }
        }

        let dubEpisodes = [];
        if (seasonEntry.dubRecord) {
            const endRange = seasonEntry.dubRecord.episodes_count ? Math.max(Number(seasonEntry.dubRecord.episodes_count), 12) : 100;
            const dubData = await animeClient.getEpisodes(seasonEntry.dubRecord.id, 1, { startRange: 1, endRange });
            if (dubData && Array.isArray(dubData.episodes)) {
                dubEpisodes = dubData.episodes;
            }
        }

        seasons.push({
            season: seasonEntry.season,
            subRecord: seasonEntry.subRecord,
            subEpisodes,
            dubRecord: seasonEntry.dubRecord,
            dubEpisodes,
            identity: seasonEntry.identity
        });
    }

    return buildAiringStateDocument({ seasons });
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));

    if (opts.help) {
        printHelp();
        process.exit(0);
    }

    const discoveryManager = new SeriesDiscoveryManager();

    // Gestione --health-check (nessun server HTTP, nessuna connessione Mongo o dumping dump)
    if (opts.healthCheck) {
        const health = discoveryManager.checkHealth();
        if (health.ok) {
            console.log(`[HealthCheck] ${health.message}`);
            process.exit(0);
        } else {
            console.error(`[HealthCheck] ${health.message}`);
            process.exit(1);
        }
    }

    console.log('[AnimeSource] Avvio servizio sorgente anime...');
    const animeClient = new AnimeUnityClient();
    const identityResolver = new IdentityResolver();

    await identityResolver.init();

    let store = null;
    if (!opts.dryRun) {
        try {
            console.log(`[AnimeSource] Connessione a MongoDB (${opts.mongoUri})...`);
            store = await AiringStateStore.connect(opts.mongoUri);
            console.log('[AnimeSource] Connesso a MongoDB.');
        } catch (err) {
            console.error(`[AnimeSource] Impossibile connettersi a MongoDB: ${err.message}`);
            if (!opts.series) {
                process.exit(1);
            }
            console.warn('[AnimeSource] Continuo senza persistenza (fallback tipo dry-run per serie manuale).');
        }
    }

    const runScan = async () => {
        if (opts.series) {
            // Modalità debug: singola serie richiesta
            console.log(`[AnimeSource] Ricerca manuale in archivio per: "${opts.series}"...`);
            const records = await animeClient.searchArchive(opts.series);
            if (!records || records.length === 0) {
                console.log(`[AnimeSource] Nessun risultato trovato in archivio per "${opts.series}".`);
                return;
            }

            console.log(`[AnimeSource] Trovati ${records.length} record per "${opts.series}". Raggruppamento per TMDB ID...`);
            const groups = groupRecordsByTmdb(records, identityResolver);

            const targetLower = opts.series.trim().toLowerCase();
            const exactMatches = groups.filter(g => g.title.toLowerCase() === targetLower);
            const targetGroups = exactMatches.length > 0 ? exactMatches : groups;

            for (const group of targetGroups) {
                const doc = await processTmdbGroup(group, animeClient);
                if (!doc) continue;

                if (opts.dryRun || !store) {
                    console.log('\n--- DOCUMENTO PRODOTTO (DRY-RUN) ---');
                    console.log(JSON.stringify(doc, null, 2));
                    console.log('-------------------------------------\n');
                } else {
                    const result = await store.upsert(doc);
                    console.log(`[AnimeSource] Documento aggiornato su DB: _id=${doc._id} ("${doc.title}") [matched: ${result.matchedCount}]`);
                }
            }

            discoveryManager.writeHeartbeat();
            console.log('[AnimeSource] Battito di salute registrato.');
            return;
        }

        // Modalità discovery autonoma: serie in corso su AnimeUnity
        console.log(`[AnimeSource] Discovery serie in corso (budget massimo: ${opts.limit})...`);
        const discovery = await discoveryManager.getTrackedSeries({
            client: animeClient,
            limit: opts.limit,
            forceRefresh: opts.refreshList
        });

        const records = discovery.records;
        if (!records || records.length === 0) {
            console.warn('[AnimeSource] Nessuna serie in corso trovata o disponibile.');
            return;
        }

        // Stampa evidenza della discovery
        console.log('\n======================================================');
        console.log(`[AnimeSource] DISCOVERY SERIE IN CORSO`);
        console.log(`[AnimeSource] Totale serie scoperte: ${records.length} ${discovery.fromCache ? `(da cache locale, età: ${discovery.ageHours || '?'}h)` : '(da portale AnimeUnity)'}`);
        console.log(`[AnimeSource] Prime 5 voci scoperte:`);
        for (let i = 0; i < Math.min(5, records.length); i++) {
            const r = records[i];
            const title = r.title || r.title_eng || r.title_it || r.slug || 'N/A';
            console.log(`  ${i + 1}. "${title}" | ID: ${r.id} | DUB: ${r.dub} | Stagione: ${r.season || 'N/A'} | AniList: ${r.anilist_id} | MAL: ${r.mal_id}`);
        }
        console.log('======================================================\n');

        const groups = groupRecordsByTmdb(records, identityResolver);
        console.log(`[AnimeSource] Record raggruppati in ${groups.length} titoli TMDB unificati.`);

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            console.log(`[AnimeSource] [${i + 1}/${groups.length}] Elaborazione TMDB ${group.tmdbId} ("${group.title}")...`);
            const doc = await processTmdbGroup(group, animeClient);
            if (!doc) continue;

            if (opts.dryRun || !store) {
                console.log(`\n--- DOCUMENTO PRODOTTO (DRY-RUN) [${i + 1}/${groups.length}] ---`);
                console.log(JSON.stringify(doc, null, 2));
                console.log('---------------------------------------------------\n');
            } else {
                const result = await store.upsert(doc);
                console.log(`[AnimeSource] Documento aggiornato su DB: _id=${doc._id} ("${doc.title}") [matched: ${result.matchedCount}]`);
            }
        }

        discoveryManager.writeHeartbeat();
        console.log('[AnimeSource] Ciclo completato. Battito di salute registrato.');
    };

    await runScan();

    if (opts.dryRun || opts.once || opts.series) {
        if (store) await store.close();
        console.log('[AnimeSource] Elaborazione terminata.');
        process.exit(0);
    }

    // Modalità continua (in container/daemon)
    console.log(`[AnimeSource] Entrato in modalità continua (polling ~3h per serie in corso, ricostruzione lista ogni 24h). Premi Ctrl+C per uscire.`);

    const interval = setInterval(async () => {
        try {
            console.log('[AnimeSource] Esecuzione scansione periodica...');
            await runScan();
        } catch (e) {
            console.error('[AnimeSource] Errore durante la scansione periodica:', e.message);
        }
    }, REFRESH_AIRING_MS);

    const cleanup = async () => {
        console.log('\n[AnimeSource] Arresto in corso...');
        clearInterval(interval);
        if (store) await store.close();
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

if (require.main === module) {
    main().catch(err => {
        console.error('[AnimeSource] Errore critico:', err);
        process.exit(1);
    });
}

module.exports = {
    groupRecordsByTmdb,
    processTmdbGroup,
    parseArgs
};
