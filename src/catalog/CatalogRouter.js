const { getTraktCatalog } = require('./providers/TraktProvider');


const { getEngineHybridCatalog, TASTE_BASED_IDS } = require('./providers/HybridProvider');
const { executeCombinedSearch, executeUniversalPipeline } = require('./providers/AiDiscoveryProvider');
const { getAiringStateCatalog } = require('./providers/AiringStateProvider');
const { getDuckDbCatalogFromFilters, getDuckDbCatalogFromPreset, mapSortBy, buildPresetFromFilters } = require('./providers/DuckDbProvider');
const { normalizeToUniversalSchema } = require('../utils/resultMerger');
const { getPresets } = require('../data/presets');
const { getWatchlistCatalog } = require('./providers/WatchlistProvider');

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
            return await getDuckDbCatalogFromFilters({ _search: search }, type, skip, 100, activeProfileSettings);
        }
        // Il fallback o la ricerca AI profonda rimangono sulla vecchia pipeline
        return await executeCombinedSearch(search, userConfig, type, skip, activeProfileSettings, tmdbFetchOptions);
    }

    // SCENARIO 2.5: HYBRID RECOMMENDATIONS (Taste-based)
    if (TASTE_BASED_IDS.has(baseId)) {
        return await getEngineHybridCatalog(baseId, type, skip, userConfig, tmdbApiKey, activeProfileSettings);
    }

    // SCENARIO 3: TRAKT
    if (baseId.startsWith('trakt_')) {
        return await getTraktCatalog(baseId, skip, userConfig, tmdbApiKey, extra.hostUrl);
    }

    // SCENARIO 4: YACA WATCHLIST (Library Sync)
    if (id === 'yaca_watchlist_movies' || id === 'yaca_watchlist_series' || id === 'yaca_watchlist_anime') {
        return await getWatchlistCatalog(id, type, skip, userConfig, activeProfileSettings);
    }

    // SCENARIO 4.5: ANIME NOVITÀ (stato esterno `anime_airing_state`, finestra 14 giorni).
    // `anilist_simulcast` resta accettato come marker legacy: le configurazioni già installate
    // hanno quel valore salvato in profilo, l'id del preset non cambia.
    if (baseId === 'preset_anime_simulcast' || catalogMeta?._provider === 'airing_state' || catalogMeta?._provider === 'anilist_simulcast') {
        return await getAiringStateCatalog(skip);
    }

    // SCENARIO 5: SQL NATIVO (Nuova architettura DuckDB diretta)
    if (catalogMeta?.where) {
        let presetToRun = catalogMeta;
        if (sortBy) {
            const { mapSortBy } = require('./providers/DuckDbProvider');
            presetToRun = { ...catalogMeta, orderBy: mapSortBy(sortBy, catalogMeta.type || type) };
        }
        return await getDuckDbCatalogFromPreset(presetToRun, skip);
    }

    // SCENARIO 6: UNIVERSAL PIPELINE (AI/PRESETS Custom legacy)
    if (catalogMeta || directFilters) {
        const universalCatalog = normalizeToUniversalSchema(catalogMeta, directFilters);
        
        if (universalCatalog._isMerge) {
            const raw = universalCatalog._rawFilters;
            const mergedFrom = raw.merge?.sources || raw.merge?.catalogs || raw.mergedFrom || [];
            if (mergedFrom.length > 0) {
                const activeProfile = userConfig.profiles?.find(p => p.id === userConfig.activeProfileId);
                const profileCatalogs = activeProfile?.existingCatalogs || activeProfile?.catalogs || [];
                const userCustomCatalogs = userConfig.customCatalogs || [];
                const allPresets = getPresets();
                const sourceFilters = raw.merge?.sourceFilters || [];
                const mergedQueries = [];
                for (let i = 0; i < mergedFrom.length; i++) {
                    const srcId = mergedFrom[i];
                    let srcCat = profileCatalogs.find(c => c.id === srcId);
                    if (!srcCat) {
                        srcCat = userCustomCatalogs.find(c => c.id === srcId);
                    }
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
        return await executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, type, skip, { ...activeProfileSettings, noFallback }, tmdbFetchOptions);
    }

    return [];
}

module.exports = { routeCatalogRequest };
