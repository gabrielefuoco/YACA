// src/pool/index.js

/**
 * MODULO POOL DI YACA (Ticket 12 & Ticket 46).
 *
 * Incapsula l'intera logica di composizione e gestione del pool dei cataloghi hero:
 * - Porta unica di accesso per il feed (getHeroPool).
 * - HERO_PRIORITY e righe additive (SLUG_ADDITIVI) consumati da src/catalog/registry.js.
 * - Le 4 strategie storiche (trueBlend, seed_network, hiddenGems, trakt_filtered) sono rimosse;
 *   il motore del gusto è interamente il servizio del grafo (mondi, passo_fuori, uscite_nuove, nicchia_di_qualita).
 * - Assegnazione disgiunta / claimedIds per eventuali strategie esclusive.
 * - Cache di gruppo e dedup delle build concorrenti (HERO_CACHE_KEY_VERSION = 'v17').
 */

const cache = require('../cache');
const { hybridRecommendationsCache, shelvesCache } = require('../cache/cacheInstances');
const { SCAFFALI_PER_MODALITA, buildShelfCacheKey } = require('../cache/shelfKey');
const { normalizeContentId } = require('../catalog/contentId');
const { getHeroPoolSpec, getHeroRuoli } = require('../catalog/registry');
const { applicaDecadimento } = require('./impressioni');
const { fetchProfileContext, selectedPresetsDi } = require('../profile');
const {
    modiAbilitati,
    leggiModoAttivo,
    derivaLeve,
    selettoriDaLeve,
    opzioniGrafoDi
} = require('../profile/modo');

const { heroPriority: HERO_PRIORITY, slugAdditivi: SLUG_ADDITIVI } = getHeroPoolSpec();
const { graphClient } = require('../clients');
const { resolveAnimePolicy, isAnimeContent } = require('../anime');
const { SEED_RECENTI_QUANTI } = require('../library');

// Ticket 13: il payload delle righe hero ora porta anche classici, ultime visioni, punti d'incontro e
// i tre slot dei micro-cluster: la cache delle righe deve invalidarsi una volta.
// Ticket 14: il payload porta anche i `seedIds` (i titoli che l'utente conosce, per non farli scendere):
// una voce scritta prima non li ha, e senza di loro il decadimento toccherebbe anche i titoli visti.
const HERO_CACHE_KEY_VERSION = 'v17';

// Flag architetturale: i cataloghi serviti dipendono esclusivamente dagli scaffali del grafo.
// Il mapping dei 10 ruoli editoriali storici resta dormiente dietro questo flag per compatibilità con i test storici.
const ENABLE_LEGACY_EDITORIAL_ROLES = false;

// Invariante (Ticket V45): la cache degli scaffali dinamici mantiene al più una voce
// per (profilo, medium). La scrittura di un medium preserva sempre l'altro.
const cachedProfileShelves = new Map();

function normalizeShelfMedium(medium, catalogId = null) {
    if (medium) {
        const m = String(medium).toLowerCase();
        if (m === 'series' || m === 'tv') return 'series';
        if (m === 'movie' || m === 'film') return 'movie';
    }
    if (catalogId && typeof catalogId === 'string') {
        if (catalogId.endsWith('_series') || catalogId.endsWith('_tv')) return 'series';
        if (catalogId.endsWith('_movie') || catalogId.endsWith('_film')) return 'movie';
    }
    return 'movie';
}

function setCachedProfileShelves(key, shelves, explicitMedium = null) {
    if (!key) return;
    const strKey = String(key);
    let mediumMap = cachedProfileShelves.get(strKey);
    if (!mediumMap || !(mediumMap instanceof Map)) {
        mediumMap = new Map();
        cachedProfileShelves.set(strKey, mediumMap);
    }

    if (!Array.isArray(shelves)) {
        if (explicitMedium) {
            mediumMap.delete(normalizeShelfMedium(explicitMedium));
        } else {
            cachedProfileShelves.delete(strKey);
        }
        return;
    }

    if (explicitMedium) {
        const med = normalizeShelfMedium(explicitMedium);
        mediumMap.set(med, shelves);
        return;
    }

    if (shelves.length === 0) {
        return;
    }

    const byMedium = new Map();
    for (const shelf of shelves) {
        const med = normalizeShelfMedium(shelf?.medium, shelf?.catalog_id || shelf?.id);
        if (!byMedium.has(med)) byMedium.set(med, []);
        byMedium.get(med).push(shelf);
    }

    for (const [med, grouped] of byMedium.entries()) {
        mediumMap.set(med, grouped);
    }
}

function getCachedProfileShelves(key, medium = null) {
    if (!key) return null;
    const strKey = String(key);
    const mediumMap = cachedProfileShelves.get(strKey);
    if (!mediumMap || !(mediumMap instanceof Map)) return null;

    if (medium) {
        const med = normalizeShelfMedium(medium);
        const list = mediumMap.get(med);
        return Array.isArray(list) ? list : null;
    }

    const movie = mediumMap.get('movie') || [];
    const series = mediumMap.get('series') || [];
    const merged = [...movie, ...series];
    return merged.length > 0 ? merged : null;
}

function clearCachedProfileShelves(key = null) {
    if (key) {
        cachedProfileShelves.delete(String(key));
    } else {
        cachedProfileShelves.clear();
    }
}

function isMockFunction(fn) {
    return typeof fn === 'function' && Boolean(fn._isMockFunction || fn.mock);
}

// I RUOLI DEL GRAFO E IL LORO CATALOGO (Ticket 13): la tabella vive nel registro (`getHeroRuoli`),
// qui si legge e basta. Una riga calcolata e poi buttata via era il difetto (i `mondo_*` sparivano
// senza un log): ora ogni ruolo non servito finisce in `senza catalogo (dichiarate)`.
const { hero: RUOLI_HERO, micro: RUOLI_MICRO, ponte: RUOLI_PONTE } = getHeroRuoli();
const RUOLI_SERVITI = new Set([
    ...RUOLI_HERO.map((r) => r.ruolo),
    ...RUOLI_MICRO,
    ...RUOLI_PONTE
]);

const HERO_CACHE_SCHEMA_VERSION = 8;
const HERO_MIN_FALLBACK_ITEMS = 10;
const HERO_MAX_ITEMS_PER_CATALOG = 100;
const activeHeroGroupBuilds = new Map();

/**
 * I RUOLI CHE IL PROFILO HA DAVVERO ACCESI (Ticket 22).
 * Una riga senza catalogo servito non deve partecipare al waterfall: non pesca e non ruba titoli alle
 * righe che Stremio mostra. `null` = «nessuna selezione» = tutte le righe (il §9.1 puro).
 *
 * @param {{userConfig?: object, context?: string, mediaType?: string}} params
 * @returns {string[]|null}
 */

function getHeroCatalogId(slug, mediaType) {
    return `yaca_${slug}_${mediaType === 'movie' ? 'movies' : 'series'}`;
}

/**
 * Con `MODI_ABILITATI` acceso le leve del pool sono quelle della modalità attiva
 * (`derivaLeve`), non più i selettori salvati nel profilo. Con il flag spento
 * restituisce `null` e i chiamanti usano la catena storica.
 *
 * @param {object|null} userConfig
 * @returns {{modo: string, leve: object, selettori: object, kids: boolean}|null}
 */
function modoDelPool(userConfig) {
    if (!modiAbilitati()) return null;
    const modo = leggiModoAttivo(userConfig);
    const leve = derivaLeve(modo);
    return { modo, leve, selettori: selettoriDaLeve(leve), kids: leve.kids };
}

/**
 * I cursori del pool: con il flag acceso l'account è la fonte, ma un valore
 * esplicito (anteprima in dashboard) resta sovrano.
 */
function slidersDelPool({ userConfig = null, sliders = null, slider = null } = {}) {
    const espliciti = slider || sliders || null;
    if (espliciti) return espliciti;
    if (modiAbilitati()) return opzioniGrafoDi(userConfig);
    return undefined;
}

function buildSharedHeroCacheKey({ userId, context, mediaType, kidsMode, typeSelectors, graphVersions, slider, sliders, modo }) {
    const versions = graphVersions !== undefined ? graphVersions : graphClient.getGraphHealthVersionsCached();
    const sl = sliders || slider;
    const { chiave } = cache.deriva({
        nome: 'heroes',
        versione: HERO_CACHE_KEY_VERSION,
        dipendenze: {
            varia: {
                utente: userId,
                profilo: context,
                media: mediaType,
                kids: kidsMode,
                selettori: typeSelectors,
                // Due modalità non devono condividere le righe (stessa ragione della
                // chiave degli scaffali). Inserito solo con il flag acceso.
                ...(modo ? { modo } : {}),
                ...(sl ? { slider: sl } : {})
            },
            invalida: {
                artefatto: versions?.artefatto,
                ricetta: versions?.ricetta
            }
        }
    });
    return chiave;
}

function getRecommendationId(item) {
    const rawId = item && typeof item === 'object' ? item.id : item;
    const id = normalizeContentId(rawId ?? '');
    if (!id || ['undefined', 'null', 'nan'].includes(id.toLowerCase())) return '';
    return id;
}

function ensurePoolItem(item, mediaType) {
    const isObj = typeof item === 'object' && item !== null;
    const rawId = isObj ? (item.id || item.tmdbId) : item;
    const cleanId = normalizeContentId(rawId);
    const tmdbId = Number(cleanId);
    const defaultType = mediaType === 'movie' ? 'movie' : 'series';
    const defaultMediaType = mediaType === 'movie' ? 'movie' : 'tv';
    if (isObj) {
        return {
            ...item,
            id: item.id && String(item.id).startsWith('tmdb:') ? item.id : `tmdb:${cleanId}`,
            tmdbId: Number.isFinite(item.tmdbId) ? item.tmdbId : (Number.isFinite(tmdbId) ? tmdbId : cleanId),
            type: item.type || defaultType,
            media_type: item.media_type || (item.type === 'series' ? 'tv' : defaultMediaType),
            toString() { return this.id; }
        };
    }
    return {
        id: `tmdb:${cleanId}`,
        tmdbId: Number.isFinite(tmdbId) ? tmdbId : cleanId,
        type: defaultType,
        media_type: defaultMediaType,
        toString() { return this.id; }
    };
}

/**
 * Assegna in modo esclusivo i candidati degli hero secondo priorità.
 */
function assignHeroPools(poolsByCatalog, mediaType, maxItemsPerCatalog = HERO_MAX_ITEMS_PER_CATALOG) {
    const assigned = {};
    const claimedIds = new Set();

    for (const slug of HERO_PRIORITY) {
        const catalogId = getHeroCatalogId(slug, mediaType);
        const pool = Array.isArray(poolsByCatalog?.[catalogId]) ? poolsByCatalog[catalogId] : [];
        const catalogIds = [];
        for (const item of pool) {
            const id = getRecommendationId(item);
            if (!id || claimedIds.has(id)) continue;
            claimedIds.add(id);
            catalogIds.push(ensurePoolItem(item, mediaType));
            if (catalogIds.length >= maxItemsPerCatalog) break;
        }
        assigned[catalogId] = catalogIds;
    }

    return assigned;
}

function isSharedHeroCacheEntry(entry, mediaType) {
    if (!entry || entry.schemaVersion !== HERO_CACHE_SCHEMA_VERSION || entry.mediaType !== mediaType || !entry.catalogs) return false;
    if (!['movie', 'series'].includes(mediaType)) return false;
    // Ticket 14: i `seedIds` sono parte del contratto (servono a non far scendere i titoli visti).
    if (!Array.isArray(entry.seedIds)) return false;

    // Con gli scaffali dinamici (catalog_id = yaca_<tmdbId>_<medium>), i cataloghi serviti dipendono
    // dai cluster del profilo e non più dalla lista fissa di 10 ruoli di HERO_PRIORITY.
    if (typeof entry.catalogs !== 'object' || entry.catalogs === null) return false;
    for (const pool of Object.values(entry.catalogs)) {
        if (!Array.isArray(pool)) return false;
    }
    return true;
}

/**
 * Converte i seed (Map o entries) nel formato per il servizio del grafo.
 * Filtra per politica anime e assegna il tipo di segnale (loved, liked, watched, library).
 *
 * Scelta architetturale Ticket 02: il pool NON manda il peso numerico esplicito
 * (non invia `peso: w`) affinché PESO_TIPO nel motore Python non venga sovrascritto
 * e tornino ad applicarsi la curva delle serie 1 + 2*(plays/NEP) e i tetti dei film.
 *
 * @param {Map<number|string, number>|Array<[number|string, number]>} seeds
 * @param {Object} [options]
 * @param {Map<string, string>} [options.tipi] - id -> tipo del seme (Ticket 17: il tipo e' un dato)
 * @param {string} [options.medium='movie'] - 'movie' o 'series'/'tv'
 * @param {string} [options.animePolicy='neutral'] - 'exclude' | 'only' | 'neutral'
 * @param {Map<string, number>} [options.ultimaVisione] - id -> timestamp ms dell'ultima visione (Ticket 07)
 * @param {number} [options.quantiRecenti=SEED_RECENTI_QUANTI] - quanti marcati `recente`, fra i semi INVITATI
 * @param {Map<string, number>|Object} [options.plays] - id -> numero di plays/episodi visti
 * @returns {Array<{tmdbId: number, medium: string, tipo: string, plays: number, eta_giorni: number, recente?: boolean}>}
 */
function convertiSemiPerGrafo(seeds, { medium = 'movie', animePolicy = 'neutral', ultimaVisione = null, quantiRecenti = SEED_RECENTI_QUANTI, tipi = null, plays = null } = {}) {
    const med = medium === 'series' || medium === 'tv' ? 'series' : 'movie';
    const tipoSeed = med === 'movie' ? 'movie' : 'tv';
    const isAnimeSeed = (id) => isAnimeContent({ tmdbId: Number(id), tipo: tipoSeed });

    const rawSeeds = seeds instanceof Map
        ? [...seeds.entries()]
        : (Array.isArray(seeds) ? seeds : Object.entries(seeds || {}));

    const filteredSeeds = rawSeeds.filter(([id]) => {
        if (animePolicy === 'exclude') return !isAnimeSeed(id);
        // Ticket 11: tutta la storia entra fra i semi, anche con animePolicy === 'only'
        return true;
    });

    // TICKET 17: il tipo NON si deduce piu' dal peso. Le vecchie soglie (`w >= 4 -> loved`) erano la
    // causa per cui il ticket 02 doveva smettere di mandare il peso: era il numero a decidere il tipo,
    // e PESO_TIPO nel motore non contava niente. Ora il tipo arriva da `semiDi`; se per un id manca si
    // DICHIARA (un warn con il conteggio) e si usa il default piu' debole, mai una soglia.
    const tipiNoti = tipi instanceof Map ? tipi : new Map(Object.entries(tipi || {}));
    const TIPI_AMMESSI = new Set(['loved', 'liked', 'watched', 'library']);
    let senzaTipo = 0;
    const now = Date.now();
    const output = filteredSeeds.map(([id], idx) => {
        const tmdbId = Number(id);
        let tipo = 'watched';
        const dichiarato = tipiNoti.get(String(id)) ?? tipiNoti.get(id);
        if (TIPI_AMMESSI.has(dichiarato)) {
            tipo = dichiarato;
        } else {
            senzaTipo += 1;
        }
        const seedPlays = Number(plays?.get?.(String(tmdbId)) ?? plays?.get?.(tmdbId) ?? plays?.[String(tmdbId)] ?? 1);
        const ts = Number(ultimaVisione && typeof ultimaVisione.get === 'function' ? ultimaVisione.get(String(tmdbId)) : NaN);
        const eta_giorni = Number.isFinite(ts) && ts > 0 ? Number(Math.max(0, (now - ts) / 86400000).toFixed(2)) : idx;

        return {
            tmdbId,
            medium: med,
            tipo,
            plays: Number.isFinite(seedPlays) && seedPlays >= 0 ? seedPlays : 1,
            eta_giorni
        };
    });

    const candidatiRecenti = output
        .map((item) => ({ item, ts: Number(ultimaVisione && typeof ultimaVisione.get === 'function' ? ultimaVisione.get(String(item.tmdbId)) : NaN) }))
        .filter(({ ts }) => Number.isFinite(ts) && ts > 0)
        .sort((a, b) => (b.ts - a.ts) || String(a.item.tmdbId).localeCompare(String(b.item.tmdbId)));
    const recentiIds = new Set(candidatiRecenti.slice(0, quantiRecenti || 0).map(({ item }) => String(item.tmdbId)));
    for (const item of output) {
        if (recentiIds.has(String(item.tmdbId))) item.recente = true;
    }
    if (senzaTipo > 0) {
        console.warn(`[Semi] ${senzaTipo}/${filteredSeeds.length} semi senza tipo dichiarato: ` +
            'restano "watched" (nessuna deduzione dal peso, Ticket 17)');
    }
    return output;
}

/**
 * Definizione a lista delle strategie nel modulo pool.
 * Le quattro strategie storiche sono state rimosse (Ticket 46).
 * Il grafo genera le 10 righe additive (Ticket 13): mondi, passo_fuori, uscite_nuove,
 * nicchia_di_qualita, classici, ultime_visioni, punti_incontro, micro_cluster_1..3.
 */
const HERO_STRATEGIES = [
    {
        name: 'graph_rows',
        slug: 'graph_rows',
        additive: true,
        // =========================================================================
        // GANCI DEL GRAFO (Ticket 08 & Ticket 46: servizio Python persistente via HTTP)
        // =========================================================================
        run: async (ctx, { assigned, rawTraktResult, sharedState }) => {
            const med = ctx.mediaType === 'movie' ? 'movie' : 'series';

            try {
                const { semiDi } = require('../library');
                const { seeds, tipi, ultimaVisione, plays } = await semiDi({
                    userId: ctx.userId,
                    context: ctx.context,
                    mediaType: ctx.mediaType,
                    user: ctx.userConfig
                });
                const tipoSeed = med === 'movie' ? 'movie' : 'tv';
                // Un solo posto per la politica anime del profilo (la usano i semi e i filtri a monte).
                // Con i modi accesi le leve arrivano da `derivaLeve(modo)` (ctx.leve). Se il pool
                // leggesse i selettori del profilo, chiederebbe al grafo una politica diversa da
                // quella del resolver: chiave di cache diversa, scaffali diversi, e i cataloghi
                // che Esplora elenca resterebbero senza titoli.
                const levePool = ctx.leve || null;
                const animePolicy = (levePool?.anime && levePool.anime !== 'neutral')
                    ? levePool.anime
                    : (ctx.animePolicy
                        || ctx.effectiveSelectors?.anime
                        || ctx.typeSelectors?.anime
                        || ctx.userConfig?.activeProfileSettings?.typeSelectors?.anime
                        || ctx.userConfig?.typeSelectors?.anime);
                const kidsPool = levePool ? Boolean(levePool.kids) : Boolean(ctx.kidsMode);

                const isAnimeSeed = (id) => isAnimeContent({ tmdbId: Number(id), tipo: tipoSeed });
                const semi = convertiSemiPerGrafo(seeds, { medium: med, animePolicy, ultimaVisione, tipi, plays });
                const visti = new Set(semi.map((s) => s.tmdbId));
                let traktCount = 0;
                if (rawTraktResult?.traktAvailable) {
                    for (const voce of (rawTraktResult.ids || [])) {
                        const id = Number(typeof voce === 'object' && voce !== null ? voce.id : voce);
                        if (!Number.isFinite(id) || visti.has(id)) continue;
                        if (animePolicy === 'exclude' && isAnimeSeed(id)) continue;
                        // Ticket 11: i semi Trakt non vengono potati per animePolicy === 'only'
                        visti.add(id);
                        // I semi Trakt non hanno una data nel payload di oggi: entrano fra i semi, mai fra i recenti.
                        // Nessuna data per i semi Trakt: l'età si omette, non si inventa con l'indice.
                        semi.push({ tmdbId: id, medium: med, tipo: 'liked', plays: 1 });
                        traktCount++;
                    }
                }

                if (semi.length === 0) {
                    // Nessun seme (cold start): nessun catalogo generato.
                    if (sharedState) sharedState.shelves = [];
                    for (const { slug } of RUOLI_HERO) assigned[getHeroCatalogId(slug, ctx.mediaType)] = [];
                    for (const slug of RUOLI_MICRO) assigned[getHeroCatalogId(slug, ctx.mediaType)] = [];
                    assigned[getHeroCatalogId('punti_incontro', ctx.mediaType)] = [];
                    console.log(`[Scaffali] ${ctx.mediaType}: nessun seme disponibile (cold start)`);
                    return;
                }

                // I semi sono i titoli che l'utente conosce: il decadimento non tocca questi (Ticket 14).
                if (sharedState) sharedState.seedIds = semi.map((x) => String(x.tmdbId));
                const opzioni = ctx.sliders
                    || ctx.slider
                    || ctx.userConfig?.activeProfileSettings?.sliders
                    || ctx.userConfig?.activeProfileSettings?.slider
                    || ctx.userConfig?.context?.sliders
                    || ctx.userConfig?.context?.slider
                    || ctx.userConfig?.activeProfileSettings?.graphOptions
                    || ctx.userConfig?.graphOptions
                    || undefined;
                const cap = ctx.cap || 60;

                const itemsDi = (lista) => (lista?.titoli || []).map((t) => ensurePoolItem({
                    id: t.key || `tmdb:${t.tmdbId}`,
                    tmdbId: Number(t.tmdbId),
                    type: (t.medium === 'movie' || lista.medium === 'movie') ? 'movie' : 'series',
                    media_type: (t.medium === 'movie' || lista.medium === 'movie') ? 'movie' : 'tv',
                    punteggio: t.punteggio
                }, ctx.mediaType));

                // -------------------------------------------------------------------------
                // NUOVO MOTORE V45: SCAFFALI DINAMICI (POST /scaffali)
                // -------------------------------------------------------------------------
                // Ticket 12: la politica anime e il kids-mode vanno applicati dal motore PRIMA del taglio
                const filtri = {
                    anime: (animePolicy === 'only' || animePolicy === 'exclude') ? animePolicy : null,
                    kids: kidsPool
                };
                const opzioniScaffali = {
                    ...(opzioni || {}),
                    ...(filtri.anime || filtri.kids ? { filtri } : {}),
                    ...(filtri.kids ? { kids: true } : {})
                };
                const semiPerScaffali = semi.map(({ recente, ...rest }) => rest);
                if (!ENABLE_LEGACY_EDITORIAL_ROLES && typeof graphClient.scaffali === 'function') {
                    let resScaffali = null;
                    // La risposta costa ~4 s e dipende solo da semi, cursori, cap e versione del
                    // grafo: la si tiene in cache (RAM + Redis) invece di ricalcolarla a ogni
                    // costruzione del pool. Chiave in `cache/shelfKey.js`.
                    const chiaveScaffali = buildShelfCacheKey({
                        semi: semiPerScaffali,
                        medium: med,
                        opzioni: opzioniScaffali,
                        cap,
                        n: SCAFFALI_PER_MODALITA,
                        // La modalità entra nella chiave con il flag acceso: due modi
                        // non devono scambiarsi le righe (spec §9).
                        modo: ctx.modo,
                        // Se il client non espone le versioni (mock, client vecchio) la chiave resta
                        // valida ma senza l'impronta del grafo: il TTL breve copre quel caso.
                        versioni: typeof graphClient.getGraphHealthVersionsCached === 'function'
                            ? graphClient.getGraphHealthVersionsCached()
                            : undefined
                    });
                    try {
                        resScaffali = await shelvesCache.getOrFetch(chiaveScaffali, () => graphClient.scaffali(semiPerScaffali, {
                            medium: med,
                            opzioni: opzioniScaffali,
                            cap,
                            // Più righe per modalità: con i modi che filtrano per medium, 8 bastavano
                            // a lasciare una sola manciata di scaffali servibili.
                            n: SCAFFALI_PER_MODALITA
                        }));
                    } catch (scaffaliErr) {
                        if (!isMockFunction(graphClient.raccomanda)) {
                            throw scaffaliErr;
                        }
                    }

                    if (resScaffali && Array.isArray(resScaffali.scaffali)) {
                        const scaffali = resScaffali.scaffali;
                        for (const shelf of scaffali) {
                            if (shelf.catalog_id) {
                                assigned[shelf.catalog_id] = itemsDi(shelf);
                            }
                        }
                        const shelfSummary = scaffali.map(s => ({
                            catalog_id: s.catalog_id,
                            nome: s.nome,
                            nome_fonte: s.nome_fonte,
                            confidenza: s.confidenza,
                            medium: s.medium || ctx.mediaType,
                            slot: s.slot,
                            anime: Boolean(s.anime),
                            semi_rappresentativi: s.semi_rappresentativi,
                            semi_membri: s.semi_membri
                        }));
                        if (sharedState) {
                            sharedState.shelves = shelfSummary;
                        }
                        // La modalità fa parte della chiave: le cinque modalità condividono lo
                        // stesso userId, e senza questo una rileggeva gli scaffali dell'altra.
                        const chiaveCache = require('../cache/shelfKey').chiaveCacheScaffali;
                        if (ctx.context) setCachedProfileShelves(chiaveCache(ctx.context, ctx.userConfig), shelfSummary, ctx.mediaType);
                        if (ctx.userId) setCachedProfileShelves(chiaveCache(ctx.userId, ctx.userConfig), shelfSummary, ctx.mediaType);
                        console.log(`[Scaffali] ${ctx.mediaType}: serviti ${scaffali.length} scaffali dinamici dal grafo`);
                        return;
                    }

                    // Il servizio ha risposto ma senza scaffali: è un guasto, non un risultato vuoto.
                    // Prima si cadeva in una pipeline editoriale che nessuno dichiarava; ora lo si dice.
                    if (sharedState) {
                        sharedState.graphCallFailed = true;
                        sharedState.shelves = [];
                    }
                    console.warn(`[Scaffali] ${ctx.mediaType}: il servizio ha risposto senza scaffali`);
                }

            } catch (e) {
                // Il grafo non ha risposto: nessuno scaffale, e lo si dichiara.
                if (sharedState) {
                    sharedState.graphCallFailed = true;
                    sharedState.shelves = [];
                }
                console.warn(`[Scaffali] motore non raggiungibile: ${e?.message || e}`);
            }
        }
    }
];

/**
 * Esegue in sicurezza un builder del pool (Ticket 41 - parità con il fallback).
 * Se la strategia solleva un errore non gestito, lo cattura per evitare
 * che l'intero pool fallisca, permettendo al sistema di degradare con grazia.
 */
async function runPoolBuilder(strat, ctx, args) {
    try {
        await strat.run(ctx, args);
    } catch (err) {
        console.error(`[HeroPool] Strategy builder '${strat?.name || strat?.slug || 'unknown'}' threw:`, err?.message || err);
        if (args?.sharedState) {
            args.sharedState.graphCallFailed = true;
        }
    }
}

/**
 * Costruisce una sola volta tutti i pool e poi applica l'assegnazione disgiunta.
 */
async function buildSharedHeroCatalogs({ userId, context, mediaType, traktToken, tmdbApiKey, kidsMode, userConfig, typeSelectors, slider, sliders }) {
    const { profile, user } = await fetchProfileContext(userId, context).catch(() => ({}));
    // Con `MODI_ABILITATI` acceso le leve sono quelle della modalità attiva: i
    // selettori e il kids-mode del profilo non sono più input (ticket 01).
    // Stessa fonte della chiave in `getHeroPool` (`userConfig`): chiave e
    // contenuto non possono divergere.
    const modoPool = modoDelPool(userConfig);
    const effectiveSelectors = modoPool
        ? modoPool.selettori
        : ((context && typeof context === 'object' && context.selettoriEffettivi)
            ? context.selettoriEffettivi
            : (typeSelectors || (context && typeof context === 'object' && context.typeSelectors) || {}));
    const animePolicy = effectiveSelectors?.anime || 'neutral';
    const isTightContext = (animePolicy === 'only' || effectiveSelectors?.anime === 'only');
    const heroCandidateLimit = isTightContext ? 250 : 160;
    const kidsModeEffettivo = modoPool ? modoPool.kids : kidsMode;

    const resolvedSliders = modoPool
        ? slidersDelPool({ userConfig, sliders, slider })
        : (slider
            || sliders
            || userConfig?.activeProfileSettings?.sliders
            || userConfig?.activeProfileSettings?.slider
            || userConfig?.context?.sliders
            || userConfig?.context?.slider
            || userConfig?.profiles?.find(p => p.id === (context || userConfig.activeProfileId))?.settings?.sliders
            || userConfig?.profiles?.find(p => p.id === (context || userConfig.activeProfileId))?.settings?.slider
            || user?.profiles?.find(p => p.id === context)?.settings?.sliders
            || user?.profiles?.find(p => p.id === context)?.settings?.slider
            || profile?.settings?.sliders
            || profile?.settings?.slider
            || undefined);

    const ctx = {
        userId,
        context,
        mediaType,
        traktToken,
        tmdbApiKey,
        kidsMode: kidsModeEffettivo,
        userConfig,
        effectiveSelectors,
        animePolicy,
        heroCandidateLimit,
        sliders: resolvedSliders,
        slider: resolvedSliders,
        tasteProfile: profile || null,
        profile: profile || null,
        ...(modoPool ? { modo: modoPool.modo, leve: modoPool.leve } : {})
    };

    const pools = {};
    for (const slug of HERO_PRIORITY) {
        pools[getHeroCatalogId(slug, mediaType)] = [];
    }

    const assigned = assignHeroPools(pools, mediaType);

    const sharedState = { graphCallFailed: false, shelves: [] };
    const additiveStrategies = HERO_STRATEGIES.filter(s => s.additive);
    for (const strat of additiveStrategies) {
        await runPoolBuilder(strat, ctx, { assigned, rawTraktResult: { traktAvailable: false, ids: [] }, sharedState });
    }

    return {
        schemaVersion: HERO_CACHE_SCHEMA_VERSION,
        mediaType,
        catalogs: assigned,
        shelves: sharedState.shelves || [],
        seedIds: sharedState.seedIds || [],
        graphCallFailed: !!sharedState.graphCallFailed,
        trakt: {
            available: false,
            traktAvailable: false,
            traktSourcedCount: 0,
            fallbackTopUpCount: 0,
            isDegradedFallback: false,
            fallbackUsed: false,
            hiddenForInsufficientFallback: false
        }
    };
}

function toHeroDesc(args, keyOrDesc) {
    if (keyOrDesc && typeof keyOrDesc === 'object' && keyOrDesc.nome) {
        return keyOrDesc;
    }
    const sl = args?.sliders
        || args?.slider
        || (modiAbilitati() ? slidersDelPool({ userConfig: args?.userConfig }) : null)
        || args?.userConfig?.activeProfileSettings?.sliders
        || args?.userConfig?.activeProfileSettings?.slider;
    const shelvesList = args?.shelves || args?.scaffali || (args?.context ? getCachedProfileShelves(args.context) : null) || (args?.userId ? getCachedProfileShelves(args.userId) : null);
    return {
        nome: 'heroes',
        versione: HERO_CACHE_KEY_VERSION,
        dipendenze: {
            varia: {
                utente: args?.userId,
                profilo: args?.context,
                media: args?.mediaType,
                kids: args?.kidsMode,
                selettori: args?.typeSelectors,
                ...(args?.modo ? { modo: args.modo } : {}),
                ...(sl ? { slider: sl } : {})
            },
            invalida: {
                artefatto: args?.graphVersions?.artefatto,
                ricetta: args?.graphVersions?.ricetta,
                ...(Array.isArray(shelvesList) && shelvesList.length > 0 ? { shelves: shelvesList } : {})
            }
        },
        ttl: 7 * 24 * 60 * 60 * 1000
    };
}

async function buildAndCacheSharedHeroCatalogs(args, keyOrDesc) {
    const heroDesc = toHeroDesc(args, keyOrDesc);
    const { chiave } = cache.deriva(heroDesc);
    if (activeHeroGroupBuilds.has(chiave)) return activeHeroGroupBuilds.get(chiave);

    const promise = (async () => {
        const group = await buildSharedHeroCatalogs(args);
        // E5: un guasto transitorio (timeout, 503, connessione rifiutata) non deve avvelenare
        // la cache di 7 giorni. Memorizziamo con TTL breve di 60 s.
        const descToWrite = {
            ...heroDesc,
            ttl: group && group.graphCallFailed ? (60 * 1000) : (7 * 24 * 60 * 60 * 1000)
        };
        await cache.scrivi(descToWrite, group);
        return group;
    })();
    activeHeroGroupBuilds.set(chiave, promise);

    try {
        return await promise;
    } finally {
        if (activeHeroGroupBuilds.get(chiave) === promise) activeHeroGroupBuilds.delete(chiave);
    }
}

async function getSharedHeroCatalogs(args, keyOrDesc) {
    const heroDesc = toHeroDesc(args, keyOrDesc);
    const { value, status } = await cache.leggi(heroDesc);
    if (isSharedHeroCacheEntry(value, args.mediaType)) {
        if (status === 'stale') {
            buildAndCacheSharedHeroCatalogs(args, heroDesc)
                .catch(error => console.error('[Hero-SWR] Error:', error?.message || error));
        }
        return value;
    }
    // Una voce presente ma non valida (schema vecchio, o catalogs incompleti) si rigenera: e' uno
    // scarto, quindi si DICHIARA (il ticket vieta gli scarti silenziosi).
    if (value) {
        console.log(`[Hero-Cache] voce non valida per ${args.mediaType} (schema o catalogs): rigenero le righe`);
    }
    return buildAndCacheSharedHeroCatalogs(args, heroDesc);
}

/**
 * LA PORTA UNICA DEL MODULO POOL.
 * Riceve il contesto e restituisce l'assegnato {[catalogId]: items}.
 * Firma:
 * getHeroPool({ userId, context, mediaType, kidsMode, typeSelectors, traktToken, tmdbApiKey, userConfig, slider, sliders })
 * -> Promise<Object> dove result[catalogId] = Array<Item>
 */
async function getHeroPool(params) {
    const {
        userId,
        context = 'global',
        mediaType = 'movie',
        kidsMode = false,
        typeSelectors = null,
        traktToken = null,
        tmdbApiKey = null,
        userConfig = null,
        slider = null,
        sliders = null
    } = params;

    // Con `MODI_ABILITATI` acceso le leve (medium, anime, kids) vengono da
    // `derivaLeve(modo)`, non dai selettori del profilo.
    const modoPool = modoDelPool(userConfig);

    const resolvedSliders = modoPool
        ? slidersDelPool({ userConfig, sliders, slider })
        : (slider
            || sliders
            || userConfig?.activeProfileSettings?.sliders
            || userConfig?.activeProfileSettings?.slider
            || userConfig?.context?.sliders
            || userConfig?.context?.slider
            || userConfig?.profiles?.find(p => p.id === (context || userConfig?.activeProfileId))?.settings?.sliders
            || userConfig?.profiles?.find(p => p.id === (context || userConfig?.activeProfileId))?.settings?.slider
            || undefined);

    const graphVersions = await graphClient.getGraphHealthVersions();
    // Ticket 22: le righe accese per questo profilo entrano nella chiave (il motore deduce solo fra
    // quelle) e viaggiano fino alla chiamata del motore.
    const heroDesc = toHeroDesc({
        userId,
        context,
        mediaType,
        kidsMode: modoPool ? modoPool.kids : kidsMode,
        typeSelectors: modoPool ? modoPool.selettori : typeSelectors,
        graphVersions,
        sliders: resolvedSliders,
        slider: resolvedSliders,
        ...(modoPool ? { modo: modoPool.modo } : {})
    });
    const sharedGroup = await getSharedHeroCatalogs({
        userId,
        context,
        mediaType,
        traktToken,
        tmdbApiKey,
        kidsMode: modoPool ? modoPool.kids : kidsMode,
        userConfig,
        typeSelectors: modoPool ? modoPool.selettori : typeSelectors,
        graphVersions,
        sliders: resolvedSliders,
        slider: resolvedSliders,
    }, heroDesc);

    const assignedCache = sharedGroup?.catalogs || {};
    // Ticket 14: le impressioni si leggono a ogni richiesta (una query), dopo la cache delle righe.
    const { assigned, statistiche: statImpressioni } = await applicaDecadimento({
        userId,
        profileId: context,
        assigned: assignedCache,
        visti: sharedGroup?.seedIds || []
    });
    // Si logga quando il decadimento, il reset o l'alpha hanno mosso qualcosa: `spostamenti` conta anche
    // i movimenti dovuti all'alpha del giorno, quindi la riga non dice «decaduti», dice cosa e' cambiato.
    if (statImpressioni.titoli > 0 || statImpressioni.riposati > 0 || statImpressioni.spostamenti > 0) {
        const nonOrdinate = statImpressioni.righeNonOrdinate > 0
            ? ` · ${statImpressioni.righeNonOrdinate} righe NON riordinate (titoli senza punteggio)`
            : '';
        console.log(`[Impressioni] ${mediaType}: ${statImpressioni.titoli} titoli scesi in ` +
            `${statImpressioni.cataloghi} righe, ${statImpressioni.riposati} tornati al punteggio pieno ` +
            `(media ${statImpressioni.giorniMedi} giorni in home), ` +
            `${statImpressioni.spostamenti} cambi di posizione (decadimento + alpha)${nonOrdinate}`);
    }
    return {
        ...assigned,
        catalogs: assigned,
        shelves: sharedGroup?.shelves || [],
        trakt: sharedGroup?.trakt,
        schemaVersion: sharedGroup?.schemaVersion,
        mediaType: sharedGroup?.mediaType
    };
}

module.exports = {
    getHeroPool,
    buildSharedHeroCatalogs,
    buildSharedHeroCacheKey,
    getRecommendationId,
    getHeroCatalogId,
    getCachedProfileShelves,
    setCachedProfileShelves,
    clearCachedProfileShelves,
    modoDelPool,
    slidersDelPool,
    HERO_CACHE_KEY_VERSION,
    HERO_CACHE_SCHEMA_VERSION,
    HERO_PRIORITY,
    HERO_STRATEGIES,
    runPoolBuilder,
    convertiSemiPerGrafo,
    graphClient,
    get composer() {
        return require('./composer');
    }
};
