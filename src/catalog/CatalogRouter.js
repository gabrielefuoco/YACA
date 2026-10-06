const { getTraktCatalog } = require('./providers/TraktProvider');


const { getEngineHybridCatalog, TASTE_BASED_IDS } = require('./providers/HybridProvider');
const { executeCombinedSearch, executeUniversalPipeline } = require('./providers/AiDiscoveryProvider');
const { getAiringStateCatalog } = require('./providers/AiringStateProvider');
const DuckDbProvider = require('./providers/DuckDbProvider');
const { getDuckDbCatalogFromFilters, mapSortBy, buildPresetFromFilters } = DuckDbProvider;
const { normalizeToUniversalSchema } = require('../utils/resultMerger');
const { getPresets } = require('../data/presets');
const { getWatchlistCatalog } = require('./providers/WatchlistProvider');
const { searchTier2, searchLearnedTitles, mergeLocalWithTier2, LEARNED_PAGE_SIZE } = require('./tier2Search');
const { enrichTier2Items } = require('./tier2Enrich');

const PRESET_PAGE_SIZE = 20;

async function routeCatalogRequest(args, userConfig, tmdbClient, tmdbApiKey, activeProfileSettings, tmdbFetchOptions, catalogMeta) {
    const { id, type, extra, filters: directFilters } = args;
    const skip = extra.skip || 0;
    const search = extra.search || null;
    const sortBy = extra.sortBy || null;

    const baseId = (id || '').startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : (id || '');
    let effectiveMeta = catalogMeta;
    if (!effectiveMeta && baseId.startsWith('preset_')) {
        const presets = getPresets();
        effectiveMeta = presets.find(p => p.id === baseId || p.id === id);
    }

    // SCENARIO 1: RICERCA VIVA TESTUALE
    if (search) {
        if (baseId === 'yaca_search_standard') {
            const localItems = await getDuckDbCatalogFromFilters(
                { _search: search },
                type,
                skip,
                PRESET_PAGE_SIZE,
                activeProfileSettings
            );
            // La coda lunga: l'indice FTS5 del Tier 2 risponde con gli stessi 1,45M titoli che
            // l'export di TMDB porta e il catalogo locale no. Se l'indice manca, `searchTier2`
            // restituisce [] e la risposta è quella di sempre (soli locali).
            const tier2Items = searchTier2(search, { type, limit: PRESET_PAGE_SIZE });
            const merged = mergeLocalWithTier2(localItems, tier2Items);
            // I nomi appresi: i titoli del Tier 2 gia' mostrati una volta, che da allora
            // si possono cercare anche per il loro nome italiano. Vanno in **coda** e senza
            // duplicare (mergeLocalWithTier2 tiene gli id gia' usciti), quindi non spostano
            // nulla di quanto e' gia' stato trovato. Con la tabella vuota non cambia niente.
            const learnedItems = await searchLearnedTitles(search, { type, limit: LEARNED_PAGE_SIZE });
            // I titoli del Tier 2 escono grezzi (solo id, titolo originale, popolarita'): qui
            // vengono riempiti riusando il percorso TMDB gia' in uso, con concorrenza e budget
            // di tempo. Se il budget scade restano grezzi e si completano alla richiesta dopo.
            // Vale anche per i nomi appresi: la cache dei dettagli e' calda per definitione.
            return await enrichTier2Items(mergeLocalWithTier2(merged, learnedItems), { apiKey: tmdbApiKey });
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
    if (effectiveMeta?.where) {
        let presetToRun = effectiveMeta;
        if (sortBy) {
            const { applySortWithTieBreakers } = require('./catalogSorting');
            presetToRun = { ...effectiveMeta, orderBy: applySortWithTieBreakers(effectiveMeta, sortBy, effectiveMeta.type || type) };
        }
        const isPresetCatalog = baseId.startsWith('preset_') || String(effectiveMeta?.id || '').startsWith('preset_');
        return await DuckDbProvider.getDuckDbCatalogFromPreset(presetToRun, skip, isPresetCatalog ? PRESET_PAGE_SIZE : 100, {
            kidsMode: Boolean(activeProfileSettings?.kidsMode)
        });
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

module.exports = { routeCatalogRequest, PRESET_PAGE_SIZE };
