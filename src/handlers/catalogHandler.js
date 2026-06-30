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
function getLatestEpisodeInfo(item) {
    if (!item) return null;
    
    // Check rawTMDB
    if (item.rawTMDB && (item.type === 'series' || item.type === 'anime')) {
        const nextEp = item.rawTMDB.next_episode_to_air;
        const lastEp = item.rawTMDB.last_episode_to_air;
        if (nextEp?.episode_number) {
            return { season: nextEp.season_number || 1, episode: nextEp.episode_number };
        }
        if (lastEp?.episode_number) {
            return { season: lastEp.season_number || 1, episode: lastEp.episode_number };
        }
    }
    
    // Check item.videos
    if (Array.isArray(item.videos) && item.videos.length > 0) {
        const now = new Date();
        const airedEpisodes = item.videos.filter(v => {
            if (!v.released) return true;
            return new Date(v.released) <= now;
        });
        if (airedEpisodes.length > 0) {
            airedEpisodes.sort((a, b) => {
                if (a.released && b.released) {
                    const dateDiff = new Date(b.released) - new Date(a.released);
                    if (dateDiff !== 0) return dateDiff;
                }
                return (b.episode || 0) - (a.episode || 0);
            });
            const latest = airedEpisodes[0];
            return { season: latest.season || 1, episode: latest.episode || 1 };
        }
    }
    
    return null;
}

async function applyPostCacheBadges(cachedData, userConfig, hostUrl, catalogMeta, type, baseId) {
    if (!cachedData || !Array.isArray(cachedData.metas) || cachedData.metas.length === 0) {
        return cachedData || { metas: [] };
    }

    // Clone metas to avoid modifying cached objects in place
    const metas = cachedData.metas.map(m => ({ ...m }));

    const itemIds = metas
        .map(item => {
            const id = String(item.id);
            if (id.startsWith('tmdb:') || id.startsWith('kitsu:') || id.startsWith('anilist:')) {
                const parts = id.split(':');
                return `${parts[0]}:${parts[1]}`;
            }
            return id;
        })
        .filter(id => id.startsWith('tmdb:') || id.startsWith('kitsu:') || id.startsWith('anilist:') || id.startsWith('tt'));

    if (itemIds.length > 0) {
        try {
            const StreamBadge = require('../db/models/StreamBadge');
            const allBadges = await StreamBadge.find({ baseId: { $in: itemIds } }).lean();
            
            const existingStremioIds = new Set(allBadges.map(b => b.stremioId));
            const PendingScan = require('../db/models/PendingScan');
            const queuePromises = [];
            
            metas.forEach(item => {
                const id = String(item.id);
                let bId = id;
                if (id.startsWith('tmdb:') || id.startsWith('kitsu:') || id.startsWith('anilist:')) {
                    const parts = id.split(':');
                    bId = `${parts[0]}:${parts[1]}`;
                }

                if (!bId.startsWith('tmdb:') && !bId.startsWith('kitsu:') && !bId.startsWith('anilist:') && !bId.startsWith('tt')) {
                    return;
                }

                const itemType = item.type === 'series' || item.type === 'anime' ? 'series' : 'movie';
                
                if (itemType === 'series') {
                    // Accoda Episodio 1 se non ha badge nel DB
                    const ep1Id = `${bId}:1:1`;
                    if (!existingStremioIds.has(ep1Id)) {
                        queuePromises.push(
                            PendingScan.findOneAndUpdate(
                                { baseId: ep1Id },
                                { baseId: ep1Id, type: 'series', status: 'pending' },
                                { upsert: true }
                            ).catch(err => console.error(`[PendingScan Queue] Error upserting ${ep1Id}:`, err.message))
                        );
                    }
                    
                    // Accoda Ultimo Episodio se non ha badge nel DB
                    const latestInfo = getLatestEpisodeInfo(item);
                    if (latestInfo) {
                        const latestId = `${bId}:${latestInfo.season}:${latestInfo.episode}`;
                        if (!existingStremioIds.has(latestId)) {
                            queuePromises.push(
                                PendingScan.findOneAndUpdate(
                                    { baseId: latestId },
                                    { baseId: latestId, type: 'series', status: 'pending' },
                                    { upsert: true }
                                ).catch(err => console.error(`[PendingScan Queue] Error upserting ${latestId}:`, err.message))
                            );
                        }
                    }
                } else {
                    // Accoda Film se non ha badge nel DB
                    if (!existingStremioIds.has(bId)) {
                        queuePromises.push(
                            PendingScan.findOneAndUpdate(
                                { baseId: bId },
                                { baseId: bId, type: 'movie', status: 'pending' },
                                { upsert: true }
                            ).catch(err => console.error(`[PendingScan Queue] Error upserting ${bId}:`, err.message))
                        );
                    }
                }
            });
            
            // Execute in background
            if (queuePromises.length > 0) {
                Promise.all(queuePromises).catch(() => {});
            }

            const { sanitizeCatalogMeta } = require('../catalog/formatters/StremioFormatter');
            const { EPISODE_CATALOG_IDS } = require('../catalog/constants');
            
            const activeProfileSettings = userConfig?.profiles?.find((p) => p.id === userConfig.activeProfileId)?.settings || {};
            const isLandscape = activeProfileSettings.isLandscapeEnabled || catalogMeta?.isLandscape || false;
            const sanitizeOptions = {
                shouldApplyEpisodeBadge: (type === 'series' || type === 'anime') && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId)),
                isLandscapeEnabled: isLandscape,
                userConfig,
                hostUrl
            };

            const getEpNum = (stremioId) => {
                const parts = stremioId.split(':');
                return parseInt(parts[parts.length - 1]) || 0;
            };

            const processedMetas = [];

            for (let i = 0; i < metas.length; i++) {
                const item = metas[i];
                const id = String(item.id);
                let bId = id;
                if (id.startsWith('tmdb:') || id.startsWith('kitsu:') || id.startsWith('anilist:')) {
                    const parts = id.split(':');
                    bId = `${parts[0]}:${parts[1]}`;
                }

                const itemBadges = allBadges.filter(b => b.baseId === bId);
                const itaBadges = itemBadges.filter(b => b.hasIta === true);
                const noItaBadges = itemBadges.filter(b => b.hasIta === false);

                if (itaBadges.length > 0) {
                    // Troviamo maxItaEp e maxNoItaEp per calcolare l'offset
                    const sortedIta = itaBadges.map(b => getEpNum(b.stremioId)).sort((a, b) => a - b);
                    const sortedNoIta = noItaBadges.map(b => getEpNum(b.stremioId)).sort((a, b) => a - b);

                    const maxIta = sortedIta[sortedIta.length - 1];
                    const maxNoIta = sortedNoIta.find(ep => ep > maxIta);

                    const hasOffset = maxNoIta && (maxNoIta > maxIta);

                    if (hasOffset && sanitizeOptions.shouldApplyEpisodeBadge && (item.type === 'series' || item.type === 'anime')) {
                        // 1. Elemento originale (Sub): badge ITA disattivato
                        const subItem = { ...item };
                        subItem._itaBadge = false;
                        if (sanitizeOptions.shouldApplyEpisodeBadge) {
                            processedMetas.push(sanitizeCatalogMeta(subItem, sanitizeOptions));
                        } else {
                            processedMetas.push(subItem);
                        }

                        // 2. Elemento clone (Dub): badge ITA attivato, forziamo stagione ed episodio
                        const dubItem = { ...item };
                        dubItem.id = `${item.id}_ita_offset`;
                        dubItem._itaBadge = true;

                        // Troviamo il badge specifico per recuperare stagione ed episodio originali
                        const maxItaBadge = itaBadges.find(b => getEpNum(b.stremioId) === maxIta);
                        let maxItaSeason = 1;
                        let maxItaEpisode = maxIta;
                        
                        if (maxItaBadge) {
                            const parts = maxItaBadge.stremioId.split(':');
                            if (maxItaBadge.stremioId.startsWith('tmdb:tv:')) {
                                maxItaSeason = parseInt(parts[3]) || 1;
                                maxItaEpisode = parseInt(parts[4]) || maxIta;
                            } else if (parts.length === 4) {
                                maxItaSeason = parseInt(parts[2]) || 1;
                                maxItaEpisode = parseInt(parts[3]) || maxIta;
                            }
                        }
                        
                        dubItem._forceSeason = maxItaSeason;
                        dubItem._forceEpisode = maxItaEpisode;

                        processedMetas.push(sanitizeCatalogMeta(dubItem, sanitizeOptions));
                    } else {
                        // Nessun offset: badge ITA standard
                        item._itaBadge = true;
                        processedMetas.push(sanitizeCatalogMeta(item, sanitizeOptions));
                    }
                } else {
                    // Nessun badge ITA
                    if (sanitizeOptions.shouldApplyEpisodeBadge) {
                        processedMetas.push(sanitizeCatalogMeta(item, sanitizeOptions));
                    } else {
                        processedMetas.push(item);
                    }
                }
            }

            return { metas: processedMetas };
        } catch (badgeErr) {
            console.error('[Catalog Post-Cache] Error applying stream badges:', badgeErr.message);
        }
    }

    return { metas };
}

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
    const BADGE_CATALOG_VERSION = 9;

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
            
            // 3.5 TRADUTTORE MAGICO (TMDB -> Kitsu/IMDb per Anime)
            // Hydration MUST happen BEFORE Kitsu translation while IDs are still tmdb:
            const shouldBadge = type === 'series' && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId));
            if (shouldBadge) {
                await hydrateEpisodeBadgesFromCache(finalResults, tmdbApiKey);
            }
            const { translateAnimeIdsToKitsu, translateAnimeIdsToImdb } = require('../utils/TmdbToKitsuMapper');
            const animeIdMode = activeProfileSettings?.animeIdMode || 'kitsu';

            if (animeIdMode === 'imdb') {
                // Prima converte i TMDB in Kitsu (se ci sono) in modo uniforme
                finalResults = await translateAnimeIdsToKitsu(finalResults, tmdbApiKey);
                // Poi converte tutti i Kitsu (sia quelli appena convertiti che quelli nativi di KitsuProvider) in IMDb
                finalResults = await translateAnimeIdsToImdb(finalResults, tmdbApiKey);
            } else {
                // Converte i TMDB in Kitsu, ignorando quelli che sono già Kitsu
                finalResults = await translateAnimeIdsToKitsu(finalResults, tmdbApiKey);
            }

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



            // De-duplicate finalResults by ID
            if (Array.isArray(finalResults) && finalResults.length > 0) {
                const seenIds = new Set();
                finalResults = finalResults.filter(item => {
                    const itemId = String(item.id || item.stremioId || '');
                    if (!itemId) return true;
                    if (seenIds.has(itemId)) {
                        return false;
                    }
                    seenIds.add(itemId);
                    return true;
                });
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
    let responseData;
    if (extra?.search || id === 'yaca-profiles' || baseId === 'yaca_search_history') {
        responseData = await fetchCatalog();
    } else if (extra?.warmupMode) {
        const cachedStatus = await catalogRequestCache.getWithStatus(requestCacheKey);
        if (cachedStatus.status === 'fresh') {
            responseData = cachedStatus.value;
        } else {
            const freshData = await fetchCatalog();
            await catalogRequestCache.set(requestCacheKey, freshData, ttl);
            responseData = freshData;
        }
    } else {
        responseData = await catalogRequestCache.getOrFetch(requestCacheKey, fetchCatalog, ttl);
    }

    return await applyPostCacheBadges(responseData, userConfig, hostUrl, catalogMeta, type, baseId);
}

module.exports = { catalogHandler };
