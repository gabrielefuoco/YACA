const { createTmdbClient } = require('../clients/tmdb');
const { getCacheConfig } = require('../cache/CacheManager');
const { catalogRequestCache } = require('../cache/cacheInstances');
const { getPresets } = require('../data/presets');
const { generateRequestHash } = require('../utils/requestHash');

const { routeCatalogRequest } = require('../catalog/CatalogRouter');
const { filterWatchedItems } = require('../catalog/processors/FilterWatched');
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
    
    // Check Full CACHE Request
    const requestCacheKey = generateRequestHash(id, { 
        type, 
        extra, 
        directFilters, 
        user: userConfig.userId, 
        profile: userConfig.activeProfileId, 
        kidsMode: activeProfileSettings.kidsMode,
        configVersion: userConfig.configVersion || userConfig.config?.configVersion
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
            const { translateAnimeIdsToKitsu } = require('../utils/TmdbToKitsuMapper');
            finalResults = await translateAnimeIdsToKitsu(finalResults);

            // 4. FORMATTAZIONE (STREMIO)
            const isLandscape = activeProfileSettings.isLandscapeEnabled || catalogMeta?.isLandscape || false;
            const formattedData = formatStremioCatalog(
                finalResults,
                baseId,
                type,
                userConfig,
                isLandscape
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

    return await catalogRequestCache.getOrFetch(requestCacheKey, fetchCatalog, ttl);
}

module.exports = { catalogHandler };
