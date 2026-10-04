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

const { AnimeUnityClient, HOME_WINDOW_DAYS } = require('./src/animeunity');
const { IdentityResolver } = require('./src/identity');
const {
    buildAiringStateDocument,
    cleanTitle,
    toIsoDate,
    summarizeHomeItems,
    buildHomeReleases,
    buildHomeStateDocument
} = require('./src/aggregate');
const { AiringStateStore } = require('./src/store');
const { SeriesDiscoveryManager } = require('./src/discovery');

const DEFAULT_MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/yaca';
const REFRESH_AIRING_MS = 3 * 60 * 60 * 1000;      // ~3 ore per serie in corso
// LE DUE CADENZE DELLA HOME (04/10/2026, richiesta dell'utente):
//  - ogni 15 minuti la PRIMA pagina (30 item): l'incrementale;
//  - una volta al giorno il giro completo delle pagine finché la più vecchia esce dalle due
//    settimane: il completo.
// La prima pagina copre ~27 ore di uscite (misurato il 04/10/2026: 14:16 di ieri → 17:20 di
// oggi), quindi un check ogni 15 minuti NON PUÒ perdere un episodio: ce ne vogliono ~100 di
// margine. Non è una scommessa, è una divisione. Il giro completo ripara comunque ogni mattina.
const HOME_INCREMENTAL_MS = 15 * 60 * 1000;
const HOME_FULL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 300;                         // ~300 serie come budget per giro (ticket 20)
const DEFAULT_DUB_LIMIT = 2000; // la passata doppiati non usa il budget della scansione: l'archivio ha ~1520 titoli

function parseArgs(args) {
    const opts = {
        dryRun: false,
        once: false,
        series: null,
        mongoUri: DEFAULT_MONGO_URI,
        limit: DEFAULT_LIMIT,
        dubLimit: DEFAULT_DUB_LIMIT,
        healthCheck: false,
        refreshList: false,
        refreshFallbacks: false,
        buildDubList: false,
        checkHome: false,
        home: false,
        homeFull: false,
        homeWindowDays: HOME_WINDOW_DAYS,
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
        } else if (arg === '--dub-limit' && i + 1 < args.length) {
            const parsedDubLimit = parseInt(args[i + 1], 10);
            if (!isNaN(parsedDubLimit) && parsedDubLimit > 0) {
                opts.dubLimit = parsedDubLimit;
                i++;
            }
        } else if (arg === '--limit' && i + 1 < args.length) {
            const parsedLimit = parseInt(args[++i], 10);
            if (!isNaN(parsedLimit) && parsedLimit > 0) {
                opts.limit = parsedLimit;
            }
        } else if (arg === '--health-check') {
            opts.healthCheck = true;
        } else if (arg === '--refresh-list') {
            opts.refreshList = true;
        } else if (arg === '--refresh-fallbacks') {
            opts.refreshFallbacks = true;
        } else if (arg === '--build-dub-list') {
            opts.buildDubList = true;
        } else if (arg === '--check-home') {
            opts.checkHome = true;
        } else if (arg === '--home') {
            opts.home = true;
        } else if (arg === '--home-full') {
            opts.homeFull = true;
        } else if (arg === '--home-window') {
            const parsedWindow = parseInt(args[++i], 10);
            if (!isNaN(parsedWindow) && parsedWindow > 0) opts.homeWindowDays = parsedWindow;
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
  --dub-limit <n>       Tetto massimo di serie per la passata doppiati (default: 2000)
  --health-check        Verifica il battito di salute (exit 0 se < 12h, exit 1 altrimenti)
  --refresh-list        Forza la riscoperta della lista serie in corso ignorando la cache di 24h
  --refresh-fallbacks   Forza la riscansione dei fallback TMDB ignorando la cache locale
  --build-dub-list      Costruisce o forza la lista dei doppiati da AnimeUnity ed elabora i dati episodici
  --check-home          Esegue il controllo quotidiano dalla home page di AnimeUnity per nuovi titoli doppiati
  --home                Passata INCREMENTALE della home: la prima pagina (le ultime uscite). È il giro da 15 minuti
  --home-full           Passata COMPLETA della home: tutte le pagine fino a coprire le due settimane. È il giro giornaliero
  --home-window <n>     Finestra della passata home in giorni (default: ${HOME_WINDOW_DAYS})
  --mongo-uri <uri>     URI MongoDB (default: env MONGODB_URI o mongodb://localhost:27017/yaca)
  --help, -h            Mostra questo messaggio di aiuto

Esempi:
  node cli.js --dry-run
  node cli.js --build-dub-list --limit 60 --dry-run
  node cli.js --check-home --dry-run
  node cli.js --home --dry-run
  node cli.js --home-full --dry-run
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
                orderIndex: tmdbGroups.size,
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

// Ampiezza della finestra finale usata quando l'episodio esatto non torna
// (i conteggi della lista possono essere sfasati rispetto all'API).
const AIRED_AT_WINDOW = 5;

/**
 * Data dell'ultimo episodio disponibile per un record della lista (sub o ITA).
 * Tentativi in ordine: episodio esatto (`real_episodes_count`), conteggio di
 * lista (`episodes_count`), finestra finale, conteggio reale letto dall'API
 * (`episodes_count` della risposta). Non lancia mai: ritorna null se non
 * recuperabile, così un ciclo non si blocca.
 */
async function resolveAiredAt(record, animeClient, options = {}) {
    if (!record || !animeClient || typeof animeClient.getEpisodes !== 'function') return null;

    const title = options.title || record.title || '';
    const kind = options.kind || 'sub';
    const defaultDub = options.defaultDub === undefined ? 0 : options.defaultDub;
    const dub = record.dub !== undefined && record.dub !== null ? Number(record.dub) : defaultDub;
    const label = `${kind} "${title}" (id: ${record.id})`;

    const counts = [];
    for (const value of [record.real_episodes_count, record.episodes_count]) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0 && !counts.includes(n)) counts.push(n);
    }

    if (counts.length === 0) {
        console.warn(`[AnimeSource] Conteggio episodi assente per ${label}: airedAt non recuperabile`);
        return null;
    }

    const attempts = [];
    for (const n of counts) {
        attempts.push({ start: n, end: n });
        if (n > 1) attempts.push({ start: Math.max(1, n - AIRED_AT_WINDOW + 1), end: n });
    }

    let probed = false;
    for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        try {
            const data = await animeClient.getEpisodes(record.id, dub, { startRange: attempt.start, endRange: attempt.end });
            const dated = (data && Array.isArray(data.episodes) ? data.episodes : []).filter(ep => ep && ep.created_at);
            if (dated.length > 0) {
                const latest = dated.reduce((best, ep) => (toIsoDate(ep.created_at) > toIsoDate(best.created_at) ? ep : best));
                return toIsoDate(latest.created_at);
            }

            // Coda vuota: il conteggio della lista è sfasato, l'API ce ne dice uno diverso.
            const apiCount = data ? Number(data.episodes_count) : NaN;
            if (!probed && Number.isFinite(apiCount) && apiCount > 0 && !counts.includes(apiCount)) {
                probed = true;
                attempts.push({ start: apiCount, end: apiCount });
                if (apiCount > 1) attempts.push({ start: Math.max(1, apiCount - AIRED_AT_WINDOW + 1), end: apiCount });
                console.warn(`[AnimeSource] Conteggio lista sfasato per ${label}: l'API riporta ${apiCount} episodi, riprovo`);
            }
        } catch (err) {
            console.warn(`[AnimeSource] Recupero airedAt fallito per ${label} (range ${attempt.start}-${attempt.end}): ${err.message}`);
        }
    }

    console.warn(`[AnimeSource] airedAt non recuperabile per ${label} (conteggi provati: ${counts.join(', ')})`);
    return null;
}

async function processTmdbGroup(group, animeClient, options = {}) {
    const seasons = [];
    const findSub = options.findSubCounterpart !== false;

    for (const seasonEntry of group.seasonsMap.values()) {
        // Se manca il record sub e abbiamo il record doppiato, cerchiamo la controparte sub
        if (!seasonEntry.subRecord && seasonEntry.dubRecord && findSub) {
            try {
                const subRec = await animeClient.findSubCounterpart(seasonEntry.dubRecord);
                if (subRec) {
                    seasonEntry.subRecord = subRec;
                }
            } catch (err) {
                console.warn(`[AnimeSource] Ricerca sub counterpart fallita per "${group.title}": ${err.message}`);
            }
        }

        // Recupero data di uscita (airedAt) delle varianti sub e ITA
        if (seasonEntry.subRecord) {
            seasonEntry.subRecord.airedAt = await resolveAiredAt(seasonEntry.subRecord, animeClient, {
                title: group.title,
                kind: 'sub',
                defaultDub: 0
            });
        }

        if (seasonEntry.dubRecord) {
            seasonEntry.dubRecord.airedAt = await resolveAiredAt(seasonEntry.dubRecord, animeClient, {
                title: group.title,
                kind: 'dub',
                defaultDub: 1
            });
        }

        seasons.push({
            season: seasonEntry.season,
            subRecord: seasonEntry.subRecord,
            dubRecord: seasonEntry.dubRecord,
            identity: seasonEntry.identity
        });
    }

    return buildAiringStateDocument({
        seasons,
        orderIndex: group.orderIndex,
        listSeenAt: options.listSeenAt || null
    });
}

/**
 * Raggruppa le righe `homeReleases` per TMDB ID: le varianti AnimeUnity di uno stesso titolo
 * (record sub e record doppiato, stagioni diverse) cadono sullo stesso TMDB e diventano un
 * solo documento con due canali.
 *
 * L'identità è l'unico lavoro che questo disegno non evita: senza TMDB non c'è dove scrivere
 * il documento, e il titolo non può diventare card. Chi non si risolve viene contato e
 * stampato: è l'unica differenza ammessa fra "la home dice" e "il catalogo contiene".
 *
 * @param {Array<{animeId: number, dub: 0|1, episode: number, airedAt: string}>} rows
 * @param {Map<number, Object>} animeById Anime della home per id
 * @param {Object} identityResolver
 * @returns {{groups: Array<Object>, unresolved: Array<Object>}}
 */
function groupHomeRowsByTmdb(rows, animeById, identityResolver) {
    const groups = new Map();
    const unresolved = [];

    for (const row of Array.isArray(rows) ? rows : []) {
        const anime = animeById.get(Number(row.animeId)) || null;
        const identity = identityResolver.resolve({
            anilistId: anime ? anime.anilist_id : null,
            malId: anime ? anime.mal_id : null
        });

        const rawTitle = (anime && (anime.title || anime.title_eng || anime.title_it || anime.slug)) || `Anime #${row.animeId}`;
        if (!identity || !identity.tmdbId) {
            unresolved.push({ ...row, title: rawTitle });
            continue;
        }

        const key = String(identity.tmdbId);
        if (!groups.has(key)) {
            groups.set(key, {
                tmdbId: key,
                title: cleanTitle(rawTitle),
                kitsuId: identity.kitsuId || null,
                anilistId: identity.anilistId || null,
                malId: identity.malId || null,
                season: identity.season || 1,
                status: (anime && anime.status) || null,
                rows: []
            });
        }
        const group = groups.get(key);
        if (!group.title) group.title = cleanTitle(rawTitle);
        group.rows.push(row);
    }

    return { groups: Array.from(groups.values()), unresolved };
}

/**
 * La mappa `animeId -> anime` della home: la stessa identità AnimeUnity può comparire in
 * item diversi, e la sua scheda è la stessa. Serve a risolvere l'identità senza ricomporla.
 */
function collectHomeAnimes(items) {
    const animeById = new Map();
    for (const item of Array.isArray(items) ? items : []) {
        const anime = item && item.anime;
        const id = anime ? Number(anime.id) : NaN;
        if (!Number.isFinite(id) || id <= 0) continue;
        if (!animeById.has(id)) animeById.set(id, anime);
    }
    return animeById;
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

    const runDubbedPass = async ({ limit, forceRefresh = false } = {}) => {
        const startTime = Date.now();
        console.log('\n======================================================');
        console.log(`[AnimeSource] PASSATA ARCHIVIO DOPPIATI (una tantum)`);
        console.log(`[AnimeSource] Budget limite: ${limit} serie...`);
        console.log('======================================================\n');

        const discovery = await discoveryManager.getDubbedSeries({
            client: animeClient,
            limit: limit || 1600,
            forceRefresh
        });

        const records = discovery.records;
        if (!records || records.length === 0) {
            console.warn('[AnimeSource] Nessun record doppiato trovato o disponibile.');
            return { count: 0, groupsCount: 0, elapsedMs: Date.now() - startTime };
        }

        console.log(`[AnimeSource] Totale doppiati scoperti: ${records.length} ${discovery.fromCache ? '(da cache locale)' : '(da archivio AnimeUnity)'}`);
        console.log(`[AnimeSource] Prime 5 voci doppiate:`);
        for (let i = 0; i < Math.min(5, records.length); i++) {
            const r = records[i];
            const title = r.title || r.title_eng || r.title_it || r.slug || 'N/A';
            console.log(`  ${i + 1}. "${title}" | ID: ${r.id} | DUB: ${r.dub} | AniList: ${r.anilist_id} | MAL: ${r.mal_id} | Status: ${r.status}`);
        }

        await identityResolver.enrichWithFallbacks(records, { dryRun: opts.dryRun, refreshFallbacks: opts.refreshFallbacks });
        const groups = groupRecordsByTmdb(records, identityResolver);
        console.log(`\n[AnimeSource] Record doppiati raggruppati in ${groups.length} titoli TMDB unificati.`);

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            console.log(`[AnimeSource] [${i + 1}/${groups.length}] Elaborazione doppiato TMDB ${group.tmdbId} ("${group.title}")...`);
            const doc = await processTmdbGroup(group, animeClient, { findSubCounterpart: true });
            if (!doc) continue;

            if (opts.dryRun || !store) {
                console.log(`\n--- DOCUMENTO DOPPIATO PRODOTTO (DRY-RUN) [${i + 1}/${groups.length}] ---`);
                console.log(JSON.stringify(doc, null, 2));
                console.log('-----------------------------------------------------------\n');
            } else {
                const result = await store.upsert(doc);
                console.log(`[AnimeSource] Documento doppiato aggiornato su DB: _id=${doc._id} ("${doc.title}") [matched: ${result.matchedCount}]`);
            }
        }

        const elapsedMs = Date.now() - startTime;
        const avgPerGroup = groups.length > 0 ? (elapsedMs / groups.length).toFixed(0) : 0;
        const projectedTotalMs = groups.length > 0 ? (elapsedMs / groups.length) * 1520 : 0;
        const projectedMinutes = (projectedTotalMs / 60000).toFixed(1);

        console.log('\n======================================================');
        console.log(`[AnimeSource] RIEPILOGO PASSATA DOPPIATI`);
        console.log(`[AnimeSource] Record elaborati: ${records.length} (${groups.length} gruppi TMDB)`);
        console.log(`[AnimeSource] Tempo totale impiegato: ${(elapsedMs / 1000).toFixed(2)}s (${avgPerGroup}ms per titolo)`);
        console.log(`[AnimeSource] Estrapolazione per 1520 serie: ~${projectedMinutes} minuti`);
        console.log('======================================================\n');

        discoveryManager.writeHeartbeat();
        return { count: records.length, groupsCount: groups.length, elapsedMs };
    };

    /**
     * LA PASSATA HOME: la fonte del catalogo "Simulcast (Nuovi Episodi)".
     *
     * `full: false` (incrementale, ogni 15 minuti) legge la prima pagina: le uscite degli
     * ultimi ~27 ore. `full: true` (giornaliero) cammina le pagine finché la più vecchia
     * esce dalle due settimane.
     *
     * Cosa scrive: per ogni anime in finestra, l'episodio più recente sub e doppiato, con la
     * sua data, nel campo `homeReleases` del documento. Nient'altro del documento viene
     * toccato (vedi `buildHomeStateDocument`): tutto il resto resta al ciclo dell'archivio.
     */
    const runHomePass = async ({ full = false, announce = true } = {}) => {
        const startedAt = Date.now();
        const windowDays = opts.homeWindowDays;
        if (announce) {
            console.log(`\n======================================================`);
            console.log(`[AnimeSource] PASSATA HOME ${full ? 'COMPLETA (giro paginato)' : 'INCREMENTALE (prima pagina)'}`);
            console.log(`[AnimeSource] Finestra: ${windowDays} giorni`);
            console.log(`======================================================\n`);
        }

        const letti = full
            ? (await animeClient.getHomeReleases({ windowDays })).items
            : await animeClient.getLatestReleasesFromHome();

        const items = Array.isArray(letti) ? letti : [];
        if (items.length === 0) {
            console.warn(`[AnimeSource] Passata home ${full ? 'completa' : 'incrementale'}: nessun item letto. Nessuna scrittura.`);
            return { read: 0, written: 0, unresolved: [], items: [], stoppedBy: full ? 'unreachable' : 'first_page_only' };
        }

        const rows = summarizeHomeItems(items, { windowDays });
        const animeById = collectHomeAnimes(items);
        console.log(`[AnimeSource] Home: ${items.length} item letti, ${animeById.size} anime distinti, ${rows.length} episodi negli ultimi ${windowDays} giorni.`);

        if (rows.length === 0) {
            console.warn('[AnimeSource] Nessun episodio in finestra: la lista non si tocca.');
            return { read: items.length, written: 0, unresolved: [], items };
        }

        // Identità: stesse regole del ciclo dell'archivio (mapping ufficiale, override,
        // ponte TVDB, fallback per titolo). Un anime senza identità non ha documento.
        const resolutionRecords = Array.from(animeById.values()).map((anime) => ({
            id: anime.id,
            dub: anime.dub,
            title: anime.title,
            title_eng: anime.title_eng,
            title_it: anime.title_it,
            slug: anime.slug,
            date: anime.date,
            status: anime.status,
            anilist_id: anime.anilist_id,
            mal_id: anime.mal_id
        }));
        await identityResolver.enrichWithFallbacks(resolutionRecords, {
            dryRun: opts.dryRun,
            refreshFallbacks: opts.refreshFallbacks
        });

        const { groups, unresolved } = groupHomeRowsByTmdb(rows, animeById, identityResolver);
        const checkedAt = new Date().toISOString();
        let written = 0;

        for (const group of groups) {
            const doc = buildHomeStateDocument({
                tmdbId: group.tmdbId,
                kitsuId: group.kitsuId,
                anilistId: group.anilistId,
                malId: group.malId,
                title: group.title,
                status: group.status,
                homeReleases: buildHomeReleases(group.rows, { checkedAt }),
                now: checkedAt
            });
            if (!doc) continue;

            if (opts.dryRun || !store) {
                console.log(`\n--- DOCUMENTO HOME (DRY-RUN) TMDB ${doc._id} (${doc.title}) ---`);
                console.log(JSON.stringify(doc, null, 2));
                console.log('---------------------------------------------------------\n');
                written++;
                continue;
            }
            const result = await store.upsert(doc);
            console.log(`[AnimeSource] Home → TMDB ${doc._id} "${doc.title}" [sub ${doc.homeReleases.sub ? `EP ${doc.homeReleases.sub.episode}` : '—'}${doc.homeReleases.dub ? `, dub ITA ${doc.homeReleases.dub.episode}` : ''}] [matched: ${result.matchedCount}]`);
            written++;
        }

        for (const row of unresolved) {
            console.warn(`[AnimeSource] Home: "${row.title}" (anime ${row.animeId}) non risolto in TMDB: niente documento, quindi niente card. È l'unica differenza ammessa fra la fonte e il catalogo.`);
        }

        discoveryManager.writeHomeHeartbeat();
        if (full) discoveryManager.writeHomeFullHeartbeat();

        console.log(`[AnimeSource] Passata home ${full ? 'completa' : 'incrementale'} conclusa: ${written} titoli scritti, ${unresolved.length} non risolti, ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
        return { read: items.length, written, unresolved, items };
    };

    const runDailyHomeCheck = async (homeItems = null) => {
        console.log('\n======================================================');
        console.log(`[AnimeSource] CONTROLLO QUOTIDIANO HOME PAGE`);
        console.log('======================================================\n');

        const homeResult = await discoveryManager.checkDailyHomeUpdates({ client: animeClient, homeItems });

        console.log(`[AnimeSource] Rilasci doppiati rilevati in home: ${homeResult.dubbedReleases?.length || 0}`);
        console.log(`[AnimeSource] Nuovi titoli doppiati inediti: ${homeResult.newDubbedRecords?.length || 0} (totale noto: ${homeResult.totalKnown})`);

        if (homeResult.newDubbedRecords && homeResult.newDubbedRecords.length > 0) {
            for (const r of homeResult.newDubbedRecords) {
                console.log(`  -> Nuovo doppiato scoperto: "${r.title || r.title_eng}" (id: ${r.id}, dub: ${r.dub}, anilist: ${r.anilist_id})`);
            }

            await identityResolver.enrichWithFallbacks(homeResult.newDubbedRecords, { dryRun: opts.dryRun, refreshFallbacks: opts.refreshFallbacks });
            const newGroups = groupRecordsByTmdb(homeResult.newDubbedRecords, identityResolver);
            console.log(`\n[AnimeSource] Elaborazione di ${newGroups.length} nuovi titoli TMDB dalla home...`);
            for (let i = 0; i < newGroups.length; i++) {
                const group = newGroups[i];
                console.log(`[AnimeSource] [Home ${i + 1}/${newGroups.length}] Elaborazione TMDB ${group.tmdbId} ("${group.title}")...`);
                const doc = await processTmdbGroup(group, animeClient, { findSubCounterpart: true });
                if (!doc) continue;

                if (opts.dryRun || !store) {
                    console.log(`\n--- DOCUMENTO NUOVO DOPPIATO HOME (DRY-RUN) [${i + 1}/${newGroups.length}] ---`);
                    console.log(JSON.stringify(doc, null, 2));
                    console.log('--------------------------------------------------------------\n');
                } else {
                    const result = await store.upsert(doc);
                    console.log(`[AnimeSource] Documento aggiornato su DB: _id=${doc._id} ("${doc.title}") [matched: ${result.matchedCount}]`);
                }
            }
        } else {
            console.log('[AnimeSource] Nessun nuovo titolo doppiato inedito nella home page.');
        }

        return homeResult;
    };

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
            await identityResolver.enrichWithFallbacks(records, { dryRun: opts.dryRun, refreshFallbacks: opts.refreshFallbacks });
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

        await identityResolver.enrichWithFallbacks(records, { dryRun: opts.dryRun, refreshFallbacks: opts.refreshFallbacks });
        const groups = groupRecordsByTmdb(records, identityResolver);
        console.log(`[AnimeSource] Record raggruppati in ${groups.length} titoli TMDB unificati.`);

        const scanSeenAt = new Date().toISOString();
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            console.log(`[AnimeSource] [${i + 1}/${groups.length}] Elaborazione TMDB ${group.tmdbId} ("${group.title}")...`);
            const doc = await processTmdbGroup(group, animeClient, { listSeenAt: scanSeenAt });
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

    // Gestione comandi dedicati ed esecuzioni
    if (opts.series) {
        await runScan();
        if (store) await store.close();
        console.log('[AnimeSource] Elaborazione terminata.');
        process.exit(0);
    }

    if (opts.buildDubList) {
        await runDubbedPass({ limit: opts.dubLimit, forceRefresh: true });
        if (store) await store.close();
        console.log('[AnimeSource] Passata doppiati completata.');
        process.exit(0);
    }

    if (opts.checkHome) {
        await runDailyHomeCheck();
        if (store) await store.close();
        console.log('[AnimeSource] Controllo home completato.');
        process.exit(0);
    }

    if (opts.home || opts.homeFull) {
        await runHomePass({ full: !!opts.homeFull });
        if (store) await store.close();
        console.log(`[AnimeSource] Passata home ${opts.homeFull ? 'completa' : 'incrementale'} completata.`);
        process.exit(0);
    }

    // LA HOME PARTE PRIMA DI TUTTO (ticket 52). È la fonte del catalogo novità: al riavvio del
    // container la lista deve essere quella di adesso, non quella di tre ore fa, e la scansione
    // dell'archivio (che chiama `/info_api` per ogni serie) mette via minuti. Il giro completo
    // parte subito solo se l'ultimo risale a più di 24 ore: è quello che copre le due settimane.
    let lastFullAt = discoveryManager.lastHomeFullRunAt();
    let lastFullHomeItems = null;
    let lastHomeCheckTime = Date.now();
    const giraHomeCompletaSeTocca = async () => {
        const esito = await runHomePass({ full: true });
        lastFullHomeItems = esito && Array.isArray(esito.items) ? esito.items : null;
        lastFullAt = Date.now();
        return esito;
    };
    if (!opts.dryRun && !opts.once) {
        try {
            await runHomePass({ full: false, announce: true });
            if (!lastFullAt || (Date.now() - lastFullAt) >= HOME_FULL_MS) {
                await giraHomeCompletaSeTocca();
                // Il controllo dei doppiati riusa gli item appena letti: una richiesta in meno.
                await runDailyHomeCheck(lastFullHomeItems);
                lastHomeCheckTime = Date.now();
            }
        } catch (err) {
            console.error(`[AnimeSource] Passata home in avvio fallita: ${err.message}`);
        }
    }

    // Esecuzione normale scansione serie in corso (prima: è quella che scrive il battito di
    // salute, così il container diventa healthy in pochi minuti)
    await runScan();

    if (opts.dryRun || opts.once) {
        if (store) await store.close();
        console.log('[AnimeSource] Elaborazione terminata.');
        process.exit(0);
    }

    // Rilevamento automatico se la lista doppiati non esiste ancora in cache (.cache/dubbed-series.json).
    // Va DOPO la scansione: è una passata una tantum da ~30 minuti e non deve ritardare
    // né il catalogo novità né il primo battito di salute.
    if (!discoveryManager.hasDubbedList()) {
        console.log('[AnimeSource] Elenco doppiati non trovato in cache (.cache/dubbed-series.json). Rilevato primo avvio: avvio passata doppiati...');
        await runDubbedPass({ limit: opts.dubLimit, forceRefresh: false });
    }

    // Modalità continua (in container/daemon)
    console.log(`[AnimeSource] Entrato in modalità continua (home: prima pagina ogni ${Math.round(HOME_INCREMENTAL_MS / 60000)} minuti, giro completo ogni ${Math.round(HOME_FULL_MS / 3600000)}h; scansione "In corso" ogni ${Math.round(REFRESH_AIRING_MS / 3600000)}h). Premi Ctrl+C per uscire.`);
    const interval = setInterval(async () => {
        try {
            console.log('[AnimeSource] Esecuzione scansione periodica...');
            await runScan();

            // Controllo quotidiano home (ogni ~24h)
            if (Date.now() - lastHomeCheckTime >= 24 * 60 * 60 * 1000) {
                await runDailyHomeCheck();
                lastHomeCheckTime = Date.now();
            }
        } catch (e) {
            console.error('[AnimeSource] Errore durante la scansione periodica:', e.message);
        }
    }, REFRESH_AIRING_MS);

    // L'incrementale: la prima pagina della home ogni 15 minuti. Vanta per la freschezza,
    // non per la completezza (a coprire le due settimane ci pensa il giro completo).
    const homeInterval = setInterval(async () => {
        try {
            await runHomePass({ full: false, announce: false });
        } catch (e) {
            console.error(`[AnimeSource] Passata home incrementale fallita: ${e.message}`);
        }
    }, HOME_INCREMENTAL_MS);

    // Il completo: una volta al giorno (o al primo giro dopo un giorno senza passata).
    const homeFullInterval = setInterval(async () => {
        try {
            if (Date.now() - lastFullAt < HOME_FULL_MS) return;
            await giraHomeCompletaSeTocca();
            await runDailyHomeCheck(lastFullHomeItems);
            lastHomeCheckTime = Date.now();
        } catch (e) {
            console.error(`[AnimeSource] Passata home completa fallita: ${e.message}`);
        }
    }, HOME_INCREMENTAL_MS);

    const cleanup = async () => {
        console.log('\n[AnimeSource] Arresto in corso...');
        clearInterval(interval);
        clearInterval(homeInterval);
        clearInterval(homeFullInterval);
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
    groupHomeRowsByTmdb,
    collectHomeAnimes,
    processTmdbGroup,
    parseArgs,
    HOME_INCREMENTAL_MS,
    HOME_FULL_MS
};
