const { getTraktCatalog } = require('./providers/TraktProvider');
const { getKitsuCatalog } = require('./providers/KitsuProvider');
const { getTmdbDiscoverCatalog, executeStandardSearch } = require('./providers/TmdbProvider');
const { getEngineHybridCatalog, getHybridPopularCatalog, TASTE_BASED_IDS } = require('./providers/HybridProvider');
const { executeCombinedSearch, executeUniversalPipeline } = require('./providers/AiDiscoveryProvider');
const { normalizeToUniversalSchema } = require('../utils/resultMerger');
const { normalizeContentId } = require('../utils/contentId');
const UserActivity = require('../models/UserActivity');

async function routeCatalogRequest(args, userConfig, tmdbClient, tmdbApiKey, activeProfileSettings, tmdbFetchOptions, catalogMeta) {
    const { id, type, extra, filters: directFilters } = args;
    const skip = extra.skip || 0;
    const search = extra.search || null;
    const sortBy = extra.sortBy || null;

    const baseId = (id || '').startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : (id || '');

    // SCENARIO -1: YACA PROFILES
    if (id === 'yaca-profiles') {
        if (!userConfig.profiles || userConfig.profiles.length === 0) {
            return [];
        }
        return userConfig.profiles.map(p => {
            const isActive = p.id === userConfig.activeProfileId;
            const displayName = isActive ? `✅ ${p.name}` : p.name;
            return {
                id: `yaca-profile-${p.id}`,
                type: args.type || 'other',
                name: displayName,
                poster: `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=random&color=fff&size=512`,
                description: isActive ? 'Profilo attualmente attivo' : 'Seleziona per impostare come Profilo Attivo',
                isSpecialProfile: true // Marker for formatter to skip TMDB formatting
            };
        });
    }

    // SCENARIO 0: CRONOLOGIA RICERCHE
    if (baseId === 'yaca_search_history') {
        const lastActivities = await UserActivity.find({
            userId: userConfig.userId,
            type: 'search'
        }).sort({ timestamp: -1 }).limit(3).lean();

        if (lastActivities.length > 0) {
            const searchTasks = lastActivities.map(act =>
                executeCombinedSearch(act.value, userConfig, type, 0, activeProfileSettings, tmdbFetchOptions)
            );
            const searchResults = await Promise.all(searchTasks);
            let results = searchResults.flat();

            const seen = new Set();
            results = results.filter(item => {
                const normalizedItemId = normalizeContentId(item.id);
                if (seen.has(normalizedItemId)) return false;
                seen.add(normalizedItemId);
                return true;
            });
            return results.slice(skip, skip + 20);
        }
        return [];
    }

    // SCENARIO 1: RICERCA VIVA TESTUALE
    if (search) {
        if (baseId === 'yaca_search_standard') {
            return await executeStandardSearch(search, userConfig, type, skip, tmdbFetchOptions);
        }
        return await executeCombinedSearch(search, userConfig, type, skip, activeProfileSettings, tmdbFetchOptions);
    }

    // SCENARIO 2: CATALOGHI TMDB STANDARD
    if (id === 'yaca_discover_movies' || id === 'yaca_discover_series') {
        return await getTmdbDiscoverCatalog(id, type, skip, userConfig, tmdbClient, activeProfileSettings, tmdbFetchOptions, sortBy);
    }

    // SCENARIO 2.5 e 2.6: HYBRID RECOMMENDATIONS
    if (TASTE_BASED_IDS.has(baseId)) {
        return await getEngineHybridCatalog(baseId, type, skip, userConfig, tmdbApiKey);
    }
    if (baseId === 'yaca_hybrid_popular_movies' || baseId === 'yaca_hybrid_popular_series') {
        return await getHybridPopularCatalog(baseId, type, skip, userConfig, tmdbClient, tmdbApiKey, tmdbFetchOptions);
    }

    // SCENARIO 3: TRAKT
    if (baseId.startsWith('trakt_')) {
        return await getTraktCatalog(baseId, skip, userConfig, tmdbApiKey, extra.hostUrl);
    }

    // SCENARIO 4: KITSU (ANIME)
    if (id === 'yaca_anime_trending' || id === 'yaca_anime_ova' || id === 'yaca_anime_ona' || id === 'yaca_anime_specials') {
        return await getKitsuCatalog(id, skip);
    }

    // SCENARIO 5: UNIVERSAL PIPELINE (AI/PRESETS Custom)
    if (catalogMeta || directFilters) {
        const universalCatalog = normalizeToUniversalSchema(catalogMeta, directFilters);
        if (sortBy && universalCatalog.queries) {
            for (const q of universalCatalog.queries) {
                q.sort_by = sortBy;
            }
        }

        const noFallback = extra.noFallback || false;
        let results = await executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, type, skip, { ...activeProfileSettings, noFallback }, tmdbFetchOptions);
        
        // Documentary fallback per Universal Pipeline
        const firstQuery = universalCatalog.queries?.[0] || {};
        const withGenres = Array.isArray(firstQuery.with_genres)
            ? firstQuery.with_genres.map(String)
            : String(firstQuery.with_genres ?? '').split(/[|,]/);

        if (!noFallback && (!results || results.length === 0) && withGenres.includes('99') && firstQuery.with_keywords) {
            const relaxedQuery = { ...firstQuery };
            delete relaxedQuery.with_keywords;
            const relaxedCatalog = { ...universalCatalog, queries: [relaxedQuery] };
            results = await executeUniversalPipeline(relaxedCatalog, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, tmdbFetchOptions);
        }
        return results;
    }

    return [];
}

module.exports = { routeCatalogRequest };
