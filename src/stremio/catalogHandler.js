/**
 * src/stremio/catalogHandler.js
 *
 * Serving del catalogo Stremio (Ticket 41 - Fetta 2 e 3).
 * Orchestra le richieste di catalogo coordinando i moduli di dominio:
 * - src/catalog: definizioni, filtri, router, formattazione
 * - src/anime: stato anime, conformità e badge airing
 * - src/meta: allineamento id film
 * - src/indice: interrogazione e risoluzione id
 * - src/pool: composizione delle righe hero (invocata ad un unico punto tramite il router)
 */

const { createTmdbClient } = require('../clients/tmdb');
const cache = require('../cache');
const { getCacheConfig } = require('../cache/CacheManager');
const { getPresets } = require('../catalog/presets');
const { EPISODE_CATALOG_IDS } = require('../catalog/constants');

const { routeCatalogRequest } = require('../catalog/CatalogRouter');
const { hydrateEpisodeBadgesFromCache } = require('../stremio/processors/MetadataHydrator');
const { formatStremioCatalog } = require('../stremio/formatters/StremioFormatter');
const {
    normalizeAnimeMarker,
    isAiringStateCatalog,
    isItemAnime
} = require('../anime');
const { isCatalogConformant, isAlwaysVisible } = require('../catalog/catalogKind');
const { applyKidsMode } = require('../catalog/kidsModeFilters');
const {
    BADGE_CATALOG_VERSION,
    canonicalCatalogDefinition,
    resolveCatalogDefinition,
    buildCatalogDesc,
    buildCatalogCacheKey,
    getPresetIds
} = require('../catalog/catalogDefinition');
const { applyCatalogSpecialOrdering } = require('../catalog/catalogSorting');
const { isDailyWindowCatalog } = require('../catalog/registry');
const { applyPostCacheBadges } = require('./badges');
const { allineaIdFilm } = require('../meta');

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

    // GUARDIA SELETTORI DI TIPO:
    // Se il catalogo richiesto è un suggerimento non conforme ai selettori del profilo attivo -> { metas: [] }
    const targetCatalog = catalogMeta || { id, type };
    if (!isCatalogConformant(targetCatalog, activeProfileSettings?.typeSelectors)) {
        return { metas: [] };
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
        activeProfileSettings
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

            // 1. ROUTING: Determina il catalogo grezzo passando attraverso il Router (punto unico di invocazione)
            let results = await routeCatalogRequest(routerArgs, userConfig, tmdbClient, tmdbApiKey, activeProfileSettings, tmdbFetchOptions, catalogMeta);

            // Boundary unico per i cataloghi: prima di selettori, kids e badge
            // ogni item espone un boolean, calcolato dal resolver condiviso.
            results = (results || []).map(item => {
                normalizeAnimeMarker(item);
                return item;
            });

            if (!results || results.length === 0) {
                return { metas: [] };
            }

            // 2. FILTRAGGIO POST-FETCH: Nasconde tipo sbagliato
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

            // 2.5 FILTRAGGIO POST-FETCH: guardia unica per genere + keyword.
            if (activeProfileSettings?.kidsMode) {
                results = applyKidsMode(results);
            }

            // 2.6 FILTRAGGIO POST-FETCH: Filtro Contenuti Anime (Ticket 13 / Spec 06 Sezione 6)
            // Perimetro: cataloghi di suggerimento (preset utente, 8 hero, custom/merged).
            // Le ricerche e la libreria personale (3 watchlist) non vengono filtrate.
            const animeSelector = activeProfileSettings?.typeSelectors?.anime;
            const isSubjectCatalog = !isAlwaysVisible(id) && !isAlwaysVisible(baseId) && !extra?.search;
            if (isSubjectCatalog && (animeSelector === 'exclude' || animeSelector === 'only')) {
                results = results.filter(item => {
                    const isAnime = isItemAnime(item);
                    if (animeSelector === 'exclude') {
                        return !isAnime;
                    }
                    if (animeSelector === 'only') {
                        return isAnime;
                    }
                    return true;
                });
            }

            const isAnimeCatalog = Boolean(
                catalogMeta?.isAnime ||
                targetCatalog?.isAnime ||
                catalogMeta?.filters?.isAnime ||
                directFilters?.isAnime ||
                directFilters?.filters?.isAnime
            );
            if (isAnimeCatalog) {
                results = results.filter(item => isItemAnime(item));
            }

            // DEDUPLICAZIONE DI SICUREZZA
            const seenIds = new Set();
            const deduplicatedResults = [];
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

            let finalResults = deduplicatedResults;

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
    let responseData;
    if (extra?.search || baseId === 'yaca_search_history') {
        responseData = await fetchCatalog();
    } else if (extra?.warmupMode) {
        responseData = await cache.leggi(catalogDesc, fetchCatalog);
    } else {
        responseData = await cache.leggi(catalogDesc, fetchCatalog);
    }

    if (builds === 0) {
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
