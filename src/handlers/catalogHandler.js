const { createTmdbClient } = require('../clients/tmdb');
const { getCacheConfig } = require('../cache/CacheManager');
const { catalogRequestCache } = require('../cache/cacheInstances');
const { getPresets } = require('../data/presets');
const { generateRequestHash } = require('../utils/requestHash');
const { EPISODE_CATALOG_IDS } = require('../catalog/constants');

const { routeCatalogRequest } = require('../catalog/CatalogRouter');
const { filterWatchedItems } = require('../catalog/processors/FilterWatched');
const { hydrateEpisodeBadgesFromCache } = require('../catalog/processors/MetadataHydrator');
const { formatStremioCatalog } = require('../catalog/formatters/StremioFormatter');

/**
 * Funzione principale (Orchestrator) che riceve la richiesta da Stremio ed elabora il catalogo.
 * Utilizza il pattern Strategy deferendo a CatalogRouter, Processors e Formatters.
 */
async function catalogHandler(args, userConfig, hostUrl) {
    const { id, type, extra, filters: directFilters } = args;
    const skip = extra?.skip || 0;
    
    // Resolve active profile settings directly from userConfig (instead of phantom SettingsManager)
    const activeProfileSettings = userConfig?.profiles?.find((p) => p.id === userConfig.activeProfileId)?.settings || {};
    
    // TMDB Client Initialization
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    if (!tmdbApiKey) {
        throw new Error("Manca la TMDB API KEY nella configurazione.");
    }
    const tmdbClient = createTmdbClient(tmdbApiKey);
    const { cacheOptions: tmdbFetchOptions } = getCacheConfig(userConfig.ttl);
    
    // Increment BADGE_CATALOG_VERSION whenever badge logic changes to bust SWR cache
    const BADGE_CATALOG_VERSION = 7;

    // Check Full CACHE Request
    const requestCacheKey = generateRequestHash(id, { 
        type, 
        extra, 
        directFilters, 
        user: userConfig.userId, 
        profile: userConfig.activeProfileId, 
        kidsMode: activeProfileSettings.kidsMode,
        configVersion: userConfig.configVersion || userConfig.config?.configVersion,
        badgeV: BADGE_CATALOG_VERSION
    }, skip, type);
    
    let catalogMeta = null;
    let baseId = id;
    if (id && id.startsWith('yaca_preset_')) {
        baseId = id.replace('yaca_preset_', '');
    }

    if (id !== 'yaca-profiles' && baseId !== 'yaca_search_history') {
        const presets = getPresets();
        catalogMeta = presets.find(p => p.id === baseId || p.id === id);

        if (!catalogMeta && userConfig) {
            const activeProfile = userConfig.profiles?.find(p => p.id === userConfig.activeProfileId);
            if (activeProfile && activeProfile.catalogs) {
                catalogMeta = activeProfile.catalogs.find(c => c.id === id);
            }
        }
    }

    // managed SWR: Fetch or Revalidate
    const { ttl } = getCacheConfig(userConfig.ttl);
    
    const fetchCatalog = async () => {
        try {
            // Aggiungo hostUrl ad extra per essere passato ai provider se serve (es. Trakt)
            const routerArgs = { ...args, extra: { ...extra, hostUrl } };

            // 1. ROUTING: Determina il catalogo grezzo passando attraverso il Router
            let results = await routeCatalogRequest(routerArgs, userConfig, tmdbClient, tmdbApiKey, activeProfileSettings, tmdbFetchOptions, catalogMeta);
            
            if (!results || results.length === 0) {
                return { metas: [] };
            }

            // 2. FILTRAGGIO POST-FETCH: Nasconde tipo sbagliato
            if (type === 'movie' || type === 'series') {
                results = results.filter(i => {
                    if (i.media_type) {
                        const expectedType = type === 'series' ? 'tv' : 'movie';
                        return i.media_type === expectedType || i.media_type === 'person';
                    }
                    return true;
                });
            }

            // 2.5 FILTRAGGIO POST-FETCH: Modalità Bambini Fallback
            if (activeProfileSettings?.kidsMode) {
                results = results.filter(i => {
                    const genres = i.genre_ids || (i.genres ? i.genres.map(g => g.id) : []);
                    // Exclude Horror (27), Thriller (53), Crime (80)
                    if (genres.some(id => [27, 53, 80].includes(id))) return false;
                    return true;
                });
            }

            // 3. POST-PROCESSING: Filtri utente
            let finalResults = results;
            if (!extra?.search && id !== 'yaca-profiles' && baseId !== 'yaca_search_history') {
                finalResults = await filterWatchedItems(
                    finalResults, 
                    userConfig
                );
            }
            
            // 3.5 TRADUTTORE MAGICO (TMDB -> Kitsu per Anime)
            // Hydration MUST happen BEFORE Kitsu translation while IDs are still tmdb:
            const shouldBadge = type === 'series' && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId));
            if (shouldBadge) {
                await hydrateEpisodeBadgesFromCache(finalResults, tmdbApiKey);
            }
            const { translateAnimeIdsToKitsu } = require('../utils/TmdbToKitsuMapper');
            finalResults = await translateAnimeIdsToKitsu(finalResults, tmdbApiKey);

            // After translation: hydrate Kitsu episodes for items that still lack videos
            // (covers preset_new_anime and other Kitsu-translated catalogs from AiDiscoveryProvider)
            if (shouldBadge) {
                const { fetchKitsuEpisodes } = require('../clients/kitsu');
                const { rateLimitedMap } = require('../utils/rateLimiter');
                const { MAX_BADGE_CACHE_HYDRATION_ITEMS } = require('../catalog/constants');
                await rateLimitedMap(
                    finalResults.slice(0, MAX_BADGE_CACHE_HYDRATION_ITEMS).filter(item => {
                        const itemId = String(item?.id || '');
                        return itemId.startsWith('kitsu:') && (!Array.isArray(item.videos) || item.videos.length === 0);
                    }),
                    async (item) => {
                        const kitsuId = String(item.id).replace('kitsu:', '');
                        if (!kitsuId) return;
                        const episodes = await fetchKitsuEpisodes(kitsuId);
                        if (episodes && episodes.length > 0) item.videos = episodes;
                    },
                    { batchSize: 3, delayMs: 100 }
                );
            }

            // 3.8 SIMULCAST SORTING (se applicabile)
            // Se il catalogo ha query basate su date di airing (es. Simulcast), ordiniamo per episodio più recente
            const hasAirDateFilter = catalogMeta?.queries?.some(q => q['air_date.gte'] || q['air_date.lte']) || false;
            if (hasAirDateFilter && type === 'series' && finalResults && finalResults.length > 0) {
                const nowStr = new Date().toISOString().split('T')[0];
                const nowMs = Date.now();
                
                finalResults.forEach(item => {
                    let latestDateStr = null;
                    
                    // 1. Prova da TMDB raw metadata
                    if (item.rawTMDB) {
                        const nextEp = item.rawTMDB.next_episode_to_air;
                        const lastEp = item.rawTMDB.last_episode_to_air;
                        
                        if (nextEp && nextEp.air_date && nextEp.air_date <= nowStr) {
                            latestDateStr = nextEp.air_date;
                        } else if (lastEp && lastEp.air_date && lastEp.air_date <= nowStr) {
                            latestDateStr = lastEp.air_date;
                        }
                    }
                    
                    // 2. Fallback su episodes (Kitsu o TMDB cache)
                    if (!latestDateStr && Array.isArray(item.videos) && item.videos.length > 0) {
                        const airedEpisodes = item.videos.filter(v => v.released && new Date(v.released).getTime() <= nowMs);
                        if (airedEpisodes.length > 0) {
                            airedEpisodes.sort((a, b) => new Date(b.released) - new Date(a.released));
                            latestDateStr = airedEpisodes[0].released.substring(0, 10);
                        }
                    }
                    
                    item._latestAirDate = latestDateStr;
                });
                
                finalResults.sort((a, b) => {
                    if (a._latestAirDate && b._latestAirDate) {
                        return b._latestAirDate.localeCompare(a._latestAirDate);
                    }
                    if (a._latestAirDate) return -1;
                    if (b._latestAirDate) return 1;
                    return 0; // maintain original relative order
                });
            }

            // 3.9 ITA BADGE LOOKUP (Da StreamBadge)
            const StreamBadge = require('../db/models/StreamBadge');
            const itemIds = finalResults.map(item => {
                const id = String(item.id);
                if (id.startsWith('tmdb:') || id.startsWith('kitsu:') || id.startsWith('anilist:')) {
                    const parts = id.split(':');
                    return `${parts[0]}:${parts[1]}`;
                }
                return id;
            });

            if (itemIds.length > 0) {
                try {
                    const badges = await StreamBadge.find({ baseId: { $in: itemIds }, hasIta: true }).lean();
                    const itaBaseIds = new Set(badges.map(b => b.baseId));
                    finalResults.forEach(item => {
                        const id = String(item.id);
                        let baseId = id;
                        if (id.startsWith('tmdb:') || id.startsWith('kitsu:') || id.startsWith('anilist:')) {
                            const parts = id.split(':');
                            baseId = `${parts[0]}:${parts[1]}`;
                        }
                        if (itaBaseIds.has(baseId)) {
                            item._itaBadge = true;
                        }
                    });
                } catch (badgeErr) {
                    console.error('[Catalog] Error looking up StreamBadges:', badgeErr.message);
                }
            }

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

            return formattedData;
        } catch (e) {
            console.error(`[CATALOG] Error in catalog generation pipeline:`, e);
            throw e;
        }
    };

    // SWR handling
    if (extra?.search || id === 'yaca-profiles' || baseId === 'yaca_search_history') {
        return await fetchCatalog();
    }

    if (extra?.warmupMode) {
        const cachedStatus = await catalogRequestCache.getWithStatus(requestCacheKey);
        if (cachedStatus.status === 'fresh') {
            return cachedStatus.value;
        } else {
            const freshData = await fetchCatalog();
            await catalogRequestCache.set(requestCacheKey, freshData, ttl);
            return freshData;
        }
    }

    return await catalogRequestCache.getOrFetch(requestCacheKey, fetchCatalog, ttl);
}

module.exports = { catalogHandler };
