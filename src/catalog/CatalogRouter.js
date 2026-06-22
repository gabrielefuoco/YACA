const { getTraktCatalog } = require('./providers/TraktProvider');
const { getKitsuCatalog } = require('./providers/KitsuProvider');
const { getTmdbDiscoverCatalog, executeStandardSearch } = require('./providers/TmdbProvider');
const { getEngineHybridCatalog, getHybridPopularCatalog, TASTE_BASED_IDS } = require('./providers/HybridProvider');
const { executeCombinedSearch, executeUniversalPipeline } = require('./providers/AiDiscoveryProvider');
const { normalizeToUniversalSchema } = require('../utils/resultMerger');
const { normalizeContentId } = require('../utils/contentId');
const { getPresets } = require('../data/presets');

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
        return await getEngineHybridCatalog(baseId, type, skip, userConfig, tmdbApiKey, activeProfileSettings);
    }
    if (baseId === 'yaca_hybrid_popular_movies' || baseId === 'yaca_hybrid_popular_series') {
        return await getHybridPopularCatalog(baseId, type, skip, userConfig, tmdbClient, tmdbApiKey, tmdbFetchOptions, activeProfileSettings);
    }

    // SCENARIO 3: TRAKT
    if (baseId.startsWith('trakt_')) {
        return await getTraktCatalog(baseId, skip, userConfig, tmdbApiKey, extra.hostUrl);
    }

    // SCENARIO 4: KITSU (ANIME)
    if (id === 'yaca_anime_trending' || id === 'yaca_anime_ova' || id === 'yaca_anime_ona' || id === 'yaca_anime_specials') {
        return await getKitsuCatalog(id, skip, extra.shouldBadge);
    }
    


    // SCENARIO 5: UNIVERSAL PIPELINE (AI/PRESETS Custom)
    if (catalogMeta || directFilters) {
        const universalCatalog = normalizeToUniversalSchema(catalogMeta, directFilters);
        
        if (universalCatalog._isMerge) {
            const raw = universalCatalog._rawFilters;
            const mergedFrom = raw.merge?.sources || raw.merge?.catalogs || raw.mergedFrom || [];
            if (mergedFrom.length > 0) {
                const activeProfile = userConfig.profiles?.find(p => p.id === userConfig.activeProfileId);
                const customCatalogs = activeProfile?.existingCatalogs || activeProfile?.catalogs || [];
                const allPresets = getPresets();
                const sourceFilters = raw.merge?.sourceFilters || [];
                const mergedQueries = [];
                for (let i = 0; i < mergedFrom.length; i++) {
                    const srcId = mergedFrom[i];
                    let srcCat = customCatalogs.find(c => c.id === srcId);
                    if (!srcCat) {
                        srcCat = allPresets.find(p => p.id === srcId);
                    }
                    if (srcCat && srcCat.queries) {
                        mergedQueries.push(...srcCat.queries);
                    } else if (srcCat && srcCat.filters) {
                        mergedQueries.push({ strategy: 'discovery', ...srcCat.filters });
                    } else if (sourceFilters[i]) {
                        mergedQueries.push({ strategy: 'discovery', ...sourceFilters[i] });
                    }
                }
                universalCatalog.queries = mergedQueries.length > 0 ? mergedQueries : [{}];
            } else {
                universalCatalog.queries = [{}];
            }
        }

        if (sortBy && universalCatalog.queries) {
            for (const q of universalCatalog.queries) {
                q.sort_by = sortBy;
            }
        }

        const noFallback = extra.noFallback || false;
        return await executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, type, skip, { ...activeProfileSettings, noFallback, shouldBadge: extra.shouldBadge }, tmdbFetchOptions);
    }

    return [];
}

module.exports = { routeCatalogRequest };
