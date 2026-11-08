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
const { buildShelfCacheKey } = require('../cache/shelfKey');
const { normalizeContentId } = require('../catalog/contentId');
const { getHeroPoolSpec, getHeroRuoli } = require('../catalog/registry');
const { applicaDecadimento } = require('./impressioni');
const { fetchProfileContext, selectedPresetsDi } = require('../profile');

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

const cachedProfileShelves = new Map();

function setCachedProfileShelves(key, shelves) {
    if (!key) return;
    if (!Array.isArray(shelves)) {
        cachedProfileShelves.set(String(key), shelves);
        return;
    }
    const strKey = String(key);
    const existing = cachedProfileShelves.get(strKey);
    if (!Array.isArray(existing) || existing.length === 0) {
        cachedProfileShelves.set(strKey, shelves);
        return;
    }
    const newMedia = new Set(shelves.map(s => s.medium));
    // Se shelves contiene già sia movie che series (es. dal resolver), sovrascrive tutto
    if (newMedia.has('movie') && (newMedia.has('series') || newMedia.has('tv'))) {
        cachedProfileShelves.set(strKey, shelves);
        return;
    }
    // Altrimenti (es. chiamato dal pool per un solo medium), preserva l'altro medium
    const preserved = existing.filter(s => !newMedia.has(s.medium));
    const merged = [...preserved, ...shelves];
    cachedProfileShelves.set(strKey, merged);
}

function getCachedProfileShelves(key) {
    if (!key) return null;
    return cachedProfileShelves.get(String(key)) || null;
}

function clearCachedProfileShelves() {
    cachedProfileShelves.clear();
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
function righeServiteDelProfilo({ userConfig, context, mediaType = 'movie' } = {}) {
    const profili = Array.isArray(userConfig?.profiles) ? userConfig.profiles : [];
    const idProfilo = (context && typeof context === 'string') ? context : userConfig?.activeProfileId;
    const profilo = profili.find((p) => p.id === idProfilo);
    const presets = selectedPresetsDi(profilo);
    if (!Array.isArray(presets) || presets.length === 0) return null;

    const ruoli = new Set();
    for (const { ruolo, slug } of RUOLI_HERO) {
        if (presets.includes(getHeroCatalogId(slug, mediaType))) ruoli.add(ruolo);
    }
    for (const slug of RUOLI_MICRO) {
        if (presets.includes(getHeroCatalogId(slug, mediaType))) ruoli.add(slug);
    }
    if (presets.includes(getHeroCatalogId('punti_incontro', mediaType))) {
        for (const ruolo of RUOLI_PONTE) ruoli.add(ruolo);
    }
    // Nessuna riga di QUESTO medium accesa: non c'e' niente da proteggere, si torna al §9.1 (`null`),
    // non a un insieme vuoto (che direbbe «nessuna riga partecipa» e sarebbe un'altra cosa).
    return ruoli.size > 0 ? [...ruoli] : null;
}

function getHeroCatalogId(slug, mediaType) {
    return `yaca_${slug}_${mediaType === 'movie' ? 'movies' : 'series'}`;
}

function buildSharedHeroCacheKey({ userId, context, mediaType, kidsMode, typeSelectors, graphVersions, slider, sliders, righeServite }) {
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
                ...(sl ? { slider: sl } : {}),
                // Ticket 22: il motore deduce solo fra le righe servite, quindi la risposta dipende da
                // questo insieme. Senza, il profilo A erediterebbe le righe del profilo B.
                ...(Array.isArray(righeServite) && righeServite.length > 0
                    ? { righeServite: [...righeServite].sort() }
                    : {})
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
            const suffisso = ctx.mediaType === 'movie' ? 'movies' : 'series';
            const catMondi = `yaca_mondi_${suffisso}`;
            const catPasso = `yaca_passo_fuori_${suffisso}`;
            const catUscite = `yaca_uscite_nuove_${suffisso}`;
            const catNicchia = `yaca_nicchia_di_qualita_${suffisso}`;

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
                const animePolicy = ctx.animePolicy
                    || ctx.effectiveSelectors?.anime
                    || ctx.typeSelectors?.anime
                    || ctx.userConfig?.activeProfileSettings?.typeSelectors?.anime
                    || ctx.userConfig?.typeSelectors?.anime;

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
                        semi.push({ tmdbId: id, medium: med, tipo: 'liked', plays: 1, eta_giorni: semi.length });
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
                    kids: Boolean(ctx.kidsMode)
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
                            cap
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
                            medium: s.medium,
                            slot: s.slot,
                            anime: Boolean(s.anime),
                            semi_rappresentativi: s.semi_rappresentativi,
                            semi_membri: s.semi_membri
                        }));
                        if (sharedState) {
                            sharedState.shelves = shelfSummary;
                        }
                        if (ctx.context) setCachedProfileShelves(ctx.context, shelfSummary);
                        if (ctx.userId) setCachedProfileShelves(ctx.userId, shelfSummary);
                        console.log(`[Scaffali] ${ctx.mediaType}: serviti ${scaffali.length} scaffali dinamici dal grafo`);
                        return;
                    }
                }

                // -------------------------------------------------------------------------
                // CODICE LEGACY DORMIENTE: 10 RUOLI EDITORIALI (POST /raccomanda)
                // -------------------------------------------------------------------------
                // Ticket 22: il waterfall del motore deduce solo fra le righe che qualcuno mostra.
                const servite = ctx.righeServite !== undefined
                    ? ctx.righeServite
                    : righeServiteDelProfilo({ userConfig: ctx.userConfig, context: ctx.context, mediaType: med });
                // Ticket 12: la politica anime e il kids-mode vanno applicati dal motore PRIMA del taglio
                // (a valle si butta via la pagina: se i primi 20 sono 15 non idonei, la riga ne serve 5).
                // `opzioni` resta `undefined` quando non c'e' niente da aggiungere: se lo si manda vuoto,
                // i default del motore non valgono piu' (Ticket 41 lo fissa, ed e' giusto).
                const extra = {
                    ...(servite ? { righe_servite: servite } : {}),
                    ...(filtri.anime || filtri.kids ? { filtri } : {}),
                    ...(filtri.kids ? { kids: true } : {})
                };
                const opzioniMotore = Object.keys(extra).length > 0 ? { ...(opzioni || {}), ...extra } : opzioni;
                const resGraph = await graphClient.raccomanda({
                    semi,
                    medium: med,
                    opzioni: opzioniMotore,
                    cap
                });

                const liste = resGraph?.liste || [];
                const perRuolo = new Map(liste.map((l) => [l.ruolo, l]));
                const catalogo = (slug) => getHeroCatalogId(slug, ctx.mediaType);

                for (const { ruolo, slug } of RUOLI_HERO) {
                    assigned[catalogo(slug)] = itemsDi(perRuolo.get(ruolo));
                }
                for (const slug of RUOLI_MICRO) {
                    // Se il motore non produce quel filone, lo slot resta vuoto (non sparisce).
                    assigned[catalogo(slug)] = itemsDi(perRuolo.get(slug));
                }
                // Un solo catalogo per i ponti: si uniscono le coppie in ordine, senza doppioni.
                const vistiPonte = new Set();
                const ponte = [];
                for (const ruolo of RUOLI_PONTE) {
                    for (const t of (perRuolo.get(ruolo)?.titoli || [])) {
                        const id = `tmdb:${t.tmdbId}`;
                        if (vistiPonte.has(id)) continue;
                        vistiPonte.add(id);
                        ponte.push(t);
                    }
                }
                assigned[catalogo('punti_incontro')] = itemsDi({ titoli: ponte });

                const nMondi = (assigned[catalogo('mondi')] || []).length;
                const nPasso = (assigned[catalogo('passo_fuori')] || []).length;
                const nUscite = (assigned[catalogo('uscite_nuove')] || []).length;
                const nNicchia = (assigned[catalogo('nicchia_di_qualita')] || []).length;
                const nClassici = (assigned[catalogo('classici')] || []).length;
                const nUltime = (assigned[catalogo('ultime_visioni')] || []).length;
                const nPonte = (assigned[catalogo('punti_incontro')] || []).length;
                const nMicro = Object.fromEntries(
                    RUOLI_MICRO.map((slug) => [slug.replace(/^micro_cluster_/, ''), (assigned[catalogo(slug)] || []).length])
                );
                const nonServiti = {};
                for (const li of liste) {
                    if (RUOLI_SERVITI.has(li.ruolo)) continue;
                    const ruolo = String(li.ruolo ?? 'senza-ruolo');
                    const famiglia = ruolo.replace(/_\d+$/, '');
                    const voce = nonServiti[famiglia] || { righe: 0, titoli: 0 };
                    voce.righe += 1;
                    voce.titoli += (li.titoli || []).length;
                    nonServiti[famiglia] = voce;
                }

                console.log(`[Mondi] ${ctx.mediaType}: seed da archivio ${semi.length - traktCount}, da Trakt ${traktCount}` +
                    ` · mondi ${nMondi} · passo fuori ${nPasso} · uscite ${nUscite} · nicchia ${nNicchia}` +
                    ` · classici ${nClassici} · ultime ${nUltime} · ponte ${nPonte} · micro ${JSON.stringify(nMicro)}`);
                if (Object.keys(nonServiti).length > 0) {
                    console.log(`[Mondi] righe del grafo senza catalogo (dichiarate): ${JSON.stringify(nonServiti)}`);
                }
                if (semi.length > 0 && nMondi === 0 && nPasso === 0 && nUscite === 0 && nNicchia === 0) {
                    console.warn(`[Mondi] ATTENZIONE: ${semi.length} seed e ZERO titoli in tutte le righe ` +
                        `(${ctx.mediaType}). O il grafo non conosce quei titoli, o l'id non si risolve a valle.`);
                }
            } catch (e) {
                // Un guasto a meta' strada non deve lasciare righe a meta': si azzerano TUTTE le dieci.
                const cat = (slug) => getHeroCatalogId(slug, ctx.mediaType);
                for (const { slug } of RUOLI_HERO) assigned[cat(slug)] = [];
                for (const slug of RUOLI_MICRO) assigned[cat(slug)] = [];
                assigned[cat('punti_incontro')] = [];
                assigned[catMondi] = assigned[catMondi] || [];
                assigned[catPasso] = assigned[catPasso] || [];
                assigned[catUscite] = assigned[catUscite] || [];
                assigned[catNicchia] = assigned[catNicchia] || [];
                if (sharedState) {
                    sharedState.graphCallFailed = true;
                    sharedState.shelves = [];
                }
                console.warn(`[Mondi] motore non raggiungibile: ${e?.message || e}`);
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
async function buildSharedHeroCatalogs({ userId, context, mediaType, traktToken, tmdbApiKey, kidsMode, userConfig, typeSelectors, slider, sliders, righeServite = null }) {
    const { profile, user } = await fetchProfileContext(userId, context).catch(() => ({}));
    const effectiveSelectors = (context && typeof context === 'object' && context.selettoriEffettivi)
        ? context.selettoriEffettivi
        : (typeSelectors || (context && typeof context === 'object' && context.typeSelectors) || {});
    const animePolicy = effectiveSelectors?.anime || 'neutral';
    const isTightContext = (animePolicy === 'only' || effectiveSelectors?.anime === 'only');
    const heroCandidateLimit = isTightContext ? 250 : 160;

    const resolvedSliders = slider
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
        || undefined;

    const ctx = {
        userId,
        context,
        mediaType,
        traktToken,
        tmdbApiKey,
        kidsMode,
        userConfig,
        effectiveSelectors,
        animePolicy,
        heroCandidateLimit,
        sliders: resolvedSliders,
        slider: resolvedSliders,
        tasteProfile: profile || null,
        profile: profile || null,
        righeServite
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
    const sl = args?.sliders || args?.slider || args?.userConfig?.activeProfileSettings?.sliders || args?.userConfig?.activeProfileSettings?.slider;
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
                ...(sl ? { slider: sl } : {}),
                ...(Array.isArray(args?.righeServite) && args.righeServite.length > 0
                    ? { righeServite: [...args.righeServite].sort() }
                    : {})
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

    const resolvedSliders = slider
        || sliders
        || userConfig?.activeProfileSettings?.sliders
        || userConfig?.activeProfileSettings?.slider
        || userConfig?.context?.sliders
        || userConfig?.context?.slider
        || userConfig?.profiles?.find(p => p.id === (context || userConfig?.activeProfileId))?.settings?.sliders
        || userConfig?.profiles?.find(p => p.id === (context || userConfig?.activeProfileId))?.settings?.slider
        || undefined;

    const graphVersions = await graphClient.getGraphHealthVersions();
    // Ticket 22: le righe accese per questo profilo entrano nella chiave (il motore deduce solo fra
    // quelle) e viaggiano fino alla chiamata del motore.
    const righeServite = righeServiteDelProfilo({ userConfig, context, mediaType });
    const heroDesc = toHeroDesc({
        userId,
        context,
        mediaType,
        kidsMode,
        typeSelectors,
        graphVersions,
        sliders: resolvedSliders,
        slider: resolvedSliders,
        righeServite
    });
    const sharedGroup = await getSharedHeroCatalogs({
        userId,
        context,
        mediaType,
        traktToken,
        tmdbApiKey,
        kidsMode,
        userConfig,
        typeSelectors,
        graphVersions,
        sliders: resolvedSliders,
        slider: resolvedSliders,
        righeServite
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
    const catMondi = `yaca_mondi_${mediaType === 'movie' ? 'movies' : 'series'}`;
    const catPasso = `yaca_passo_fuori_${mediaType === 'movie' ? 'movies' : 'series'}`;
    const catUscite = `yaca_uscite_nuove_${mediaType === 'movie' ? 'movies' : 'series'}`;
    const catNicchia = `yaca_nicchia_di_qualita_${mediaType === 'movie' ? 'movies' : 'series'}`;
    const nMondi = (assigned[catMondi] || []).length;
    const nPasso = (assigned[catPasso] || []).length;
    const nUscite = (assigned[catUscite] || []).length;
    const nNicchia = (assigned[catNicchia] || []).length;
    console.log(`[Mondi] ${mediaType}: pool mondi ${nMondi} · passo fuori ${nPasso} · uscite ${nUscite} · nicchia ${nNicchia}`);

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
    righeServiteDelProfilo,
    getHeroCatalogId,
    getCachedProfileShelves,
    setCachedProfileShelves,
    clearCachedProfileShelves,
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
