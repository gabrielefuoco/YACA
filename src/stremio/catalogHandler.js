/**
 * src/stremio/catalogHandler.js
 *
 * Serving del catalogo Stremio (Ticket 41 - Fetta 2 e 3).
 * Orchestra le richieste di catalogo coordinando i moduli di dominio:
 * - src/catalog: definizioni, filtri, router, formattazione
 * - src/anime: stato anime, conformità e badge airing
 * - src/stremio/meta: allineamento id film
 * - src/indice: interrogazione e risoluzione id
 * - src/pool: composizione delle righe hero (invocata ad un unico punto tramite il router)
 */

const { createTmdbClient } = require('../clients/tmdb');
const cache = require('../cache');
const { getCacheConfig } = require('../cache/CacheManager');
const { getPresets } = require('../catalog/presets');
const { EPISODE_CATALOG_IDS } = require('./constants');

const CatalogRouter = require('./CatalogRouter');
const { hydrateEpisodeBadgesFromCache } = require('../stremio/processors/MetadataHydrator');
const { formatStremioCatalog } = require('../stremio/formatters/StremioFormatter');
const {
    normalizeAnimeMarker,
    isAiringStateCatalog,
    isItemAnime
} = require('../anime');
const { isCatalogConformant, isAlwaysVisible } = require('../catalog/catalogKind');
const { applyKidsMode, isItemInappropriateForKids } = require('../catalog/kidsModeFilters');
const {
    BADGE_CATALOG_VERSION,
    canonicalCatalogDefinition,
    resolveCatalogDefinition,
    buildCatalogDesc,
    buildCatalogCacheKey,
    getPresetIds
} = require('../catalog/catalogDefinition');
const { applyCatalogSpecialOrdering } = require('../catalog/catalogSorting');
const { isDailyWindowCatalog, isHeroCatalogId } = require('../catalog/registry');
const { applyPostCacheBadges } = require('./badges');
const { allineaIdFilm } = require('./meta');

function logCatalogTiming({ id, catalog, cache, ms, titles }) {
    const count = Array.isArray(titles) ? titles.length : (Number(titles) || 0);
    console.log(`[CatalogTiming] id=${id} catalog=${catalog} cache=${cache} ms=${ms} titles=${count}`);
}

/**
 * Funzione principale (Orchestrator) che riceve la richiesta da Stremio ed elabora il catalogo.
 */
async function catalogHandler(args, userConfig, hostUrl) {
    const { id, type, extra, filters: directFilters } = args;
    const skip = extra?.skip || 0;
    
    // Resolve active profile settings directly from userConfig (prioritizing context if resolved at edge)
    const rawSettings = userConfig?.profiles?.find((p) => p.id === userConfig.activeProfileId)?.settings || {};
    const activeProfileSettings = userConfig?.context
        ? {
            ...rawSettings,
            typeSelectors: userConfig.context.selettoriEffettivi || rawSettings.typeSelectors,
            kidsMode: userConfig.context.kidsMode !== undefined ? userConfig.context.kidsMode : rawSettings.kidsMode,
            sliders: userConfig.context.sliders || userConfig.context.slider || rawSettings.sliders || rawSettings.slider
        }
        : {
            ...rawSettings,
            sliders: rawSettings.sliders || rawSettings.slider
        };
    
    // TMDB Client Initialization
    const { chiaveEffettiva } = require('../configurazione');
    const tmdbApiKey = chiaveEffettiva({ account: userConfig, servizio: 'tmdb' });
    if (!tmdbApiKey) {
        throw new Error("Manca la TMDB API KEY nella configurazione.");
    }
    const tmdbClient = createTmdbClient(tmdbApiKey);
    const { cacheOptions: tmdbFetchOptions } = getCacheConfig(userConfig.ttl);

    let baseId = id;
    if (id && id.startsWith('yaca_preset_')) {
        baseId = id.replace('yaca_preset_', '');
    }

    const catalogMeta = resolveCatalogDefinition(id, userConfig, baseId);

    // GUARDIA MODALITÀ (flag `MODI_ABILITATI`): in una modalità un catalogo fuori
    // medium/anime non esiste — `{ metas: [] }`, mai una riga vuota con contenuti
    // sbagliati. Con il flag spento `modoAttivo` è null e resta la guardia storica.
    const modoAttivo = userConfig?.context?.modo || null;
    if (modoAttivo) {
        const { derivaLeve, conformeAlModo } = require('../profile/modo');
        const leve = userConfig?.context?.leve || derivaLeve(modoAttivo);
        const daValutare = catalogMeta || { id, type };
        if (!conformeAlModo(daValutare, leve)) {
            return { metas: [] };
        }
    }

    // GUARDIA SELETTORI DI TIPO:
    // Se il catalogo richiesto è un suggerimento non conforme ai selettori del profilo attivo -> { metas: [] }
    const targetCatalog = catalogMeta || { id, type };
    if (!isCatalogConformant(targetCatalog, activeProfileSettings?.typeSelectors)) {
        return { metas: [] };
    }

    const isHero = isHeroCatalogId(id) || isHeroCatalogId(baseId);
    let graphVersions = undefined;
    if (isHero) {
        try {
            const { graphClient } = require('../clients');
            graphVersions = await graphClient.getGraphHealthVersions();
        } catch (_e) {
            graphVersions = null;
        }
    }

    // Check Full CACHE Request. La chiave nasce DOPO la risoluzione del catalogo,
    // perché la sua definizione è uno degli ingredienti.
    const catalogDesc = buildCatalogDesc({
        id,
        baseId,
        type,
        extra,
        directFilters,
        skip,
        catalogMeta,
        userConfig,
        activeProfileSettings,
        graphVersions
    });

    // managed SWR: Fetch or Revalidate
    const { ttl } = getCacheConfig(userConfig.ttl);

    let builds = 0;

    const fetchCatalog = async () => {
        builds += 1;
        const buildStartedAt = Date.now();
        let builtMetas = 0;
        try {
            const routerArgs = { ...args, extra: { ...extra, hostUrl } };

            const isKidsMode = Boolean(activeProfileSettings?.kidsMode);
            const animeSelector = activeProfileSettings?.typeSelectors?.anime;
            const isSubjectCatalog = !isAlwaysVisible(id) && !isAlwaysVisible(baseId) && !extra?.search;
            const isAnimeCatalog = Boolean(
                catalogMeta?.isAnime ||
                targetCatalog?.isAnime ||
                catalogMeta?.filters?.isAnime ||
                directFilters?.isAnime ||
                directFilters?.filters?.isAnime
            );
            const hasPostFetchFilter = isKidsMode || (isSubjectCatalog && (animeSelector === 'exclude' || animeSelector === 'only')) || isAnimeCatalog;

            function matchesFilters(item) {
                if (!item) return false;
                if (type === 'movie' || type === 'series') {
                    const medium = item.media_type || (item.type === 'series' ? 'tv' : item.type);
                    if (medium) {
                        const expectedType = type === 'series' ? 'tv' : 'movie';
                        const accettati = expectedType === 'tv' ? ['tv', 'series'] : ['movie'];
                        if (!accettati.includes(medium) && medium !== 'person') return false;
                    }
                }
                if (isKidsMode && isItemInappropriateForKids(item)) {
                    return false;
                }
                if (isSubjectCatalog && (animeSelector === 'exclude' || animeSelector === 'only')) {
                    const isAnime = isItemAnime(item);
                    if (animeSelector === 'exclude' && isAnime) return false;
                    if (animeSelector === 'only' && !isAnime) return false;
                }
                if (isAnimeCatalog && !isItemAnime(item)) {
                    return false;
                }
                return true;
            }

            const TARGET_PAGE_SIZE = 20;
            const MAX_PAGES = 5; // Paginazione delimitata (max 5 fetch / 100 elementi) per riempire la pagina
            const seenIds = new Set();
            const deduplicatedResults = [];

            if (!hasPostFetchFilter) {
                // Percorso deterministico invariato per richieste ordinarie (senza kids / selettori anime)
                let results = await CatalogRouter.routeCatalogRequest(routerArgs, userConfig, tmdbClient, tmdbApiKey, activeProfileSettings, tmdbFetchOptions, catalogMeta);
                results = (results || []).map(item => {
                    normalizeAnimeMarker(item);
                    return item;
                });
                if (type === 'movie' || type === 'series') {
                    results = results.filter(i => {
                        const medium = i.media_type || (i.type === 'series' ? 'tv' : i.type);
                        if (medium) {
                            const expectedType = type === 'series' ? 'tv' : 'movie';
                            const accettati = expectedType === 'tv' ? ['tv', 'series'] : ['movie'];
                            return accettati.includes(medium) || medium === 'person';
                        }
                        return true;
                    });
                }
                for (const item of results) {
                    const uniqueKey = item.id || (item.rawTMDB && item.rawTMDB.id);
                    if (uniqueKey) {
                        if (!seenIds.has(uniqueKey)) {
                            seenIds.add(uniqueKey);
                            deduplicatedResults.push(item);
                        }
                    } else {
                        deduplicatedResults.push(item);
                    }
                }
            } else {
                // I filtri agiscono PRIMA del taglio: paginazione a monte finché la pagina non è piena o la fonte è esausta
                let currentSkip = skip;
                let pagesFetched = 0;

                while (deduplicatedResults.length < TARGET_PAGE_SIZE && pagesFetched < MAX_PAGES) {
                    pagesFetched++;
                    const pageArgs = { ...args, extra: { ...extra, skip: currentSkip, hostUrl } };
                    let batch = await CatalogRouter.routeCatalogRequest(pageArgs, userConfig, tmdbClient, tmdbApiKey, activeProfileSettings, tmdbFetchOptions, catalogMeta);
                    if (!Array.isArray(batch) || batch.length === 0) break;

                    for (const rawItem of batch) {
                        normalizeAnimeMarker(rawItem);
                        if (matchesFilters(rawItem)) {
                            const uniqueKey = rawItem.id || (rawItem.rawTMDB && rawItem.rawTMDB.id);
                            if (uniqueKey) {
                                if (!seenIds.has(uniqueKey)) {
                                    seenIds.add(uniqueKey);
                                    deduplicatedResults.push(rawItem);
                                }
                            } else {
                                deduplicatedResults.push(rawItem);
                            }
                            if (deduplicatedResults.length >= TARGET_PAGE_SIZE) break;
                        }
                    }

                    if (deduplicatedResults.length >= TARGET_PAGE_SIZE) break;
                    if (batch.length < TARGET_PAGE_SIZE) break;
                    currentSkip += batch.length;
                }
            }

            if (deduplicatedResults.length === 0) {
                return { metas: [] };
            }

            let finalResults = deduplicatedResults.slice(0, TARGET_PAGE_SIZE);

            // 3. IDRATAZIONE BADGE EPISODI DALLA CACHE
            const shouldBadge = type === 'series' && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId));
            if (shouldBadge) {
                await hydrateEpisodeBadgesFromCache(finalResults, tmdbApiKey);
            }

            applyCatalogSpecialOrdering(finalResults, baseId);

            // 4. FORMATTAZIONE (STREMIO)
            const isLandscape = activeProfileSettings.isLandscapeEnabled || catalogMeta?.isLandscape || false;
            const formattedData = formatStremioCatalog(
                finalResults,
                baseId,
                type,
                userConfig,
                isLandscape,
                hostUrl,
                catalogMeta
            );

            builtMetas = formattedData?.metas?.length || 0;
            return formattedData;
        } catch (e) {
            console.error(`[CATALOG] Error in catalog generation pipeline:`, e);
            throw e;
        } finally {
            logCatalogTiming({
                id,
                catalog: baseId,
                cache: 'build',
                ms: Date.now() - buildStartedAt,
                titles: builtMetas
            });
        }
    };

    const isWatchlistCatalog = typeof id === 'string' && id.startsWith('yaca_watchlist');
    const isDailyWindow = isDailyWindowCatalog(id);
    const isAiringStateCatalogId = isAiringStateCatalog(baseId, catalogMeta);

    catalogDesc.ttl = cache.resolveCatalogTtl({
        baseTtl: ttl,
        isWatchlist: isWatchlistCatalog,
        isDailyWindow,
        isAiringState: isAiringStateCatalogId
    });

    const requestStartedAt = Date.now();
    // Se il grafo non ha risposto, la chiave di una riga hero sarebbe SENZA le sue versioni:
    // usarla — in lettura o in scrittura — riapre il baco del ticket 55, cioè una riga vecchia
    // servita per 14 giorni sotto una chiave che non sa distinguere le ricette. Un guasto
    // transitorio non si memorizza (decisione 14): si ricalcola, e si torna in cache da soli
    // appena il grafo risponde.
    const versioniGrafoIgnote = isHero && !(graphVersions && graphVersions.artefatto && graphVersions.ricetta);
    let responseData;
    if (extra?.search || baseId === 'yaca_search_history') {
        responseData = await fetchCatalog();
    } else if (versioniGrafoIgnote) {
        responseData = await fetchCatalog();
    } else if (extra?.warmupMode) {
        responseData = await cache.leggi(catalogDesc, fetchCatalog);
    } else {
        responseData = await cache.leggi(catalogDesc, fetchCatalog);
    }

    if (builds === 0 && !versioniGrafoIgnote) {
        logCatalogTiming({
            id,
            catalog: baseId,
            cache: 'hit',
            ms: Date.now() - requestStartedAt,
            titles: responseData?.metas?.length || 0
        });
    }

    if (!responseData) {
        return { metas: [] };
    }

    const conBadge = await applyPostCacheBadges(
        responseData,
        userConfig,
        hostUrl,
        catalogMeta,
        type,
        baseId
    );

    return allineaIdFilm(conBadge);
}

module.exports = {
    catalogHandler,
    BADGE_CATALOG_VERSION,
    buildCatalogCacheKey,
    allineaIdFilm,
    canonicalCatalogDefinition,
    resolveCatalogDefinition,
    applyPostCacheBadges
};
