const { createTmdbClient } = require('../clients/tmdb');
const { getCacheConfig } = require('../cache/CacheManager');
const { catalogRequestCache, catalogFallbackCache } = require('../cache/cacheInstances');
const { applyFilterEffects } = require('../utils/helpers');
const { processAndTranslateCatalog } = require('../utils/resultMerger');
const { getSettings } = require('../profile/SettingsManager');
const TasteProfile = require('../models/TasteProfile');

const { routeCatalogRequest } = require('../catalog/CatalogRouter');
const { filterWatchedItems } = require('../catalog/processors/FilterWatched');
const { formatForStremio } = require('../catalog/formatters/StremioFormatter');

/**
 * Funzione principale (Orchestrator) che riceve la richiesta da Stremio ed elabora il catalogo.
 * Utilizza il pattern Strategy deferendo a CatalogRouter, Processors e Formatters.
 */
async function catalogHandler(args, userConfig, hostUrl) {
    const { id, type, extra, filters: directFilters } = args;
    const skip = extra?.skip || 0;
    
    const settings = await getSettings(userConfig.userId);
    const activeProfileSettings = settings?.activeProfile || {};
    
    // TMDB Client Initialization
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    if (!tmdbApiKey) {
        throw new Error("Manca la TMDB API KEY nella configurazione.");
    }
    const tmdbClient = createTmdbClient(tmdbApiKey);
    const { cacheOptions: tmdbFetchOptions } = getCacheConfig(userConfig.ttl);
    
    // Check Full CACHE Request
    const requestCacheKey = JSON.stringify({ id, type, extra, directFilters, user: userConfig.userId, profile: userConfig.activeProfileId });
    const cachedResponse = await catalogRequestCache.get(requestCacheKey);
    if (cachedResponse && !extra?.search) {
        console.log(`[CATALOG] Restituisco catalogo in cache CACHE-REQUEST (${id} skip=${skip})`);
        return cachedResponse;
    }
    
    let catalogMeta = null;
    let baseId = id;
    if (id && id.startsWith('yaca_preset_')) {
        baseId = id.replace('yaca_preset_', '');
    }

    if (id !== 'yaca-profiles' && baseId !== 'yaca_search_history') {
        const presets = require('../config/catalogPresets.json');
        catalogMeta = presets[baseId];
    }

    // Aggiungo hostUrl ad extra per essere passato ai provider se serve (es. Trakt)
    const routerArgs = { ...args, extra: { ...extra, hostUrl } };

    try {
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

        // 3. POST-PROCESSING: Filtri utente
        let finalResults = results;
        if (!extra?.search && id !== 'yaca-profiles' && baseId !== 'yaca_search_history') {
            finalResults = await filterWatchedItems(
                finalResults, 
                userConfig.userId, 
                activeProfileSettings, 
                catalogMeta || {}
            );
        }

        // 4. POST-PROCESSING: Traduzione e Arricchimento
        finalResults = await processAndTranslateCatalog(finalResults, tmdbClient, tmdbFetchOptions, tmdbApiKey);
        if (userConfig.settings?.filterEffects) {
            finalResults = applyFilterEffects(finalResults, userConfig.userId, activeProfileSettings);
        }
        
        // 5. FORMATTAZIONE (STREMIO)
        const metas = await formatForStremio(
            finalResults,
            type,
            userConfig,
            catalogMeta,
            activeProfileSettings,
            tmdbApiKey
        );

        const response = { metas };
        if (!extra?.search) {
            await catalogRequestCache.set(requestCacheKey, response, getCacheConfig(userConfig.ttl).ttl);
        }
        return response;
        
    } catch (e) {
        console.error("[CATALOG HANDLER ERROR] Errore nel caricamento catalogo:", e);
        return { metas: [] };
    }
}

module.exports = {
    catalogHandler
};
