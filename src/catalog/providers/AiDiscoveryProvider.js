const { fetchTmdbCatalog, getTmdbIdByName } = require('../../clients/tmdb');
const { routeLiveStremioSearch } = require('../../ai/router');
const { getProfileDnaFilters } = require('../../utils/helpers');
const { normalizeContentId } = require('../../utils/contentId');
const { interleaveMultipleResults, applyConsensusScoring } = require('../../utils/resultMerger');
const { catalogFallbackCache, simulcastDatesCache } = require('../../cache/cacheInstances');
const TasteProfile = require('../../models/TasteProfile');
const ProfileScorer = require('../../profile/ProfileScorer');
const { buildDiscoveryParams, getTmdbVoteScore } = require('./TmdbProvider');
const { hydrateResultsFromLocalDetailsCache } = require('../processors/MetadataHydrator');

const { computeTopGenres, computeTopKeywords } = require('../../engines/hybridRecommendations');

const LOOKAHEAD_PAGES = 3;
const PAGE_SIZE = 20;

async function executeComplexStrategy(filters, tmdbClient, tmdbApiKey, type, skip, settings = {}, cacheOptions = {}) {
    if (filters.provider === 'kitsu') {
        const { getKitsuCatalogFromFilters } = require('./KitsuProvider');
        return await getKitsuCatalogFromFilters(filters, type, skip);
    }

    let results = [];
    const searchType = type === 'series' ? 'tv' : 'movie';

    if (filters.strategy === "similar" && filters.similar_to) {
        const targetId = await getTmdbIdByName(tmdbApiKey, searchType, filters.similar_to);
        if (targetId) {
            results = await fetchTmdbCatalog(
                tmdbClient,
                `/${searchType}/${targetId}/recommendations`,
                skip,
                { language: 'it-IT' },
                type,
                cacheOptions
            );
        }
    }
    else if (filters.strategy === "multi_search") {
        const ep = type === 'movie' ? '/search/movie' : '/search/tv';
        results = await fetchTmdbCatalog(tmdbClient, ep, skip, { query: filters.text_search || filters.keyword }, type, cacheOptions);
    }
    else if (filters.strategy === "manual_list" && Array.isArray(filters.items)) {
        const { getTmdbMovieDetails } = require('../../clients/tmdb');
        const { rateLimitedMap } = require('../../utils/rateLimiter');
        
        const paginatedItems = filters.items.slice(skip, skip + PAGE_SIZE);
        
        const resolvedMetas = await rateLimitedMap(paginatedItems, async (item) => {
            const itemType = item.type === 'series' ? 'tv' : 'movie';
            const details = await getTmdbMovieDetails(tmdbApiKey, item.tmdbId, itemType);
            if (!details) return null;
            
            let name = details.title || details.name || 'Unknown';
            let poster = details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : null;
            let background = details.backdrop_path ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}` : null;
            
            if (details.images && Array.isArray(details.images.posters) && details.images.posters.length > 0) {
                poster = `https://image.tmdb.org/t/p/w342${details.images.posters[0].file_path}`;
            }
            if (details.images && Array.isArray(details.images.backdrops) && details.images.backdrops.length > 0) {
                background = `https://image.tmdb.org/t/p/w780${details.images.backdrops[0].file_path}`;
            }
            
            return {
                id: `tmdb:${item.tmdbId}`,
                type: item.type === 'series' ? 'series' : 'movie',
                name: name,
                poster: poster,
                background: background,
                releaseInfo: details.release_date || details.first_air_date ? (details.release_date || details.first_air_date).substring(0, 4) : null,
                imdbRating: details.vote_average ? String(details.vote_average.toFixed(1)) : null,
                genres: (details.genres || []).map(g => g.id),
                description: details.overview || null,
                rawTMDB: details
            };
        }, { batchSize: 10, delayMs: 0 });
        
        results = resolvedMetas.filter(Boolean);
    }
    else {
        const tmdbParams = await buildDiscoveryParams(filters, tmdbApiKey, type, settings);
        const endpoint = `/discover/${searchType}`;

        const paramsKey = JSON.stringify(tmdbParams);
        const fallbackFlag = !settings.noFallback ? await catalogFallbackCache.get(paramsKey) : null;


        if (fallbackFlag) {
            results = await fetchTmdbCatalog(tmdbClient, endpoint, skip, fallbackFlag.relaxedParams, type, cacheOptions);
        } else {
            results = await fetchTmdbCatalog(tmdbClient, endpoint, skip, tmdbParams, type, cacheOptions);

            if (results.length === 0 && !settings.noFallback) {
                let relaxedParams = { ...tmdbParams };
                let changed = false;

                if (relaxedParams['vote_count.gte'] > 5) {
                    relaxedParams['vote_count.gte'] = 5;
                    changed = true;
                } else if (relaxedParams['vote_count.gte'] > 0) {
                    relaxedParams['vote_count.gte'] = 0;
                    changed = true;
                }

                if (changed) {
                    console.log('--- fetchTmdbCatalog PARAMS ---', tmdbParams);
                    const extraResults = await fetchTmdbCatalog(tmdbClient, endpoint, skip, relaxedParams, type, cacheOptions);
                    const existingIds = new Set(results.map(r => normalizeContentId(r.id)));
                    for (const item of extraResults) {
                        const normalizedItemId = normalizeContentId(item.id);
                        if (!existingIds.has(normalizedItemId)) {
                            results.push(item);
                            existingIds.add(normalizedItemId);
                        }
                    }
                }

                if (changed) {
                    await catalogFallbackCache.set(paramsKey, { relaxedParams });
                }
            }
        }
    }

    return results;
}

// Fase 2: Processa qualsiasi catalogo tramite array "queries" (LookAhead, Consensus)
async function executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions) {
    const { presentation_strategy } = universalCatalog;
    const MAX_QUERIES = 10;
    const queries = (universalCatalog.queries || []).slice(0, MAX_QUERIES);

    if (queries.length === 0) return [];

    let finalResults = [];

    if (queries.length === 1) {
        const query = { ...queries[0] };
        if (!query.strategy) query.strategy = 'discovery';

        let primaryResults = await executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions);

        const withGenres = Array.isArray(query.with_genres)
            ? query.with_genres.map(String)
            : String(query.with_genres ?? '').split(/[|,]/);
        const isDocumentaryQuery = withGenres.includes('99');

        if (!settings?.noFallback && (!primaryResults || primaryResults.length === 0) && isDocumentaryQuery && query.with_keywords) {
            const relaxedQuery = { ...query };
            delete relaxedQuery.with_keywords;
            primaryResults = await executeComplexStrategy(relaxedQuery, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions);
        }

        finalResults = primaryResults || [];
    } else {
        const isFirstPage = skip === 0;
        let perQuerySkip;
        if (presentation_strategy === 'interleave') {
            perQuerySkip = Math.floor(skip / queries.length);
        } else {
            perQuerySkip = skip;
        }

        const queryResults = await Promise.all(
            queries.map(async (queryDef) => {
                const query = { ...queryDef };
                if (!query.strategy) query.strategy = 'discovery';

                const pagesToFetch = isFirstPage ? LOOKAHEAD_PAGES : 1;
                const pagePromises = [];
                for (let p = 0; p < pagesToFetch; p++) {
                    const pageSkip = perQuerySkip + (p * PAGE_SIZE);
                    pagePromises.push(
                        executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, pageSkip, settings, cacheOptions)
                    );
                }
                const pageResults = await Promise.all(pagePromises);
                return pageResults.flat();
            })
        );

        if (presentation_strategy === 'interleave') {
            finalResults = interleaveMultipleResults(queryResults, PAGE_SIZE);
        } else {
            const finalItems = applyConsensusScoring(queryResults);
            
            finalItems.sort((a, b) => {
                const bonusDiff = (b.consensusBonus || 0) - (a.consensusBonus || 0);
                if (bonusDiff !== 0) return bonusDiff;
                return (b.popularity || 0) - (a.popularity || 0);
            });

            finalResults = finalItems.slice(0, PAGE_SIZE);
        }
    }

    return finalResults;
}

// Automatic query injection from profile
async function injectProfilePreferences(filters, userId, profileId) {
    if (!userId) return filters;
    const profile = await TasteProfile.findOne({ owner: userId, context: profileId || 'global' });
    if (!profile) return filters;

    const enriched = { ...filters };
    
    // Use VSM-based top features (V_final) with legacy fallback
    const topKeywords = computeTopKeywords(profile, 3);
    const topGenres = computeTopGenres(profile, 2);

    if (topKeywords.length > 0) {
        const existingKws = enriched.with_keywords ? enriched.with_keywords.split(/[|,]/) : [];
        enriched.with_keywords = [...new Set([...existingKws, ...topKeywords])].join('|');
    }

    if (topGenres.length > 0) {
        const existingGenres = enriched.with_genres ? enriched.with_genres.split(/[|,]/) : [];
        enriched.with_genres = [...new Set([...existingGenres, ...topGenres])].join('|');
    }

    return enriched;
}

// Esegue Deep AI Search, consensus ranking e profilazione
async function executeCombinedSearch(search, userConfig, type, skip, activeProfileSettings, cacheOptions) {
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    const mistralKey = userConfig.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
    const tmdbClient = require('../../clients/tmdb').createTmdbClient(tmdbApiKey);
    const userId = userConfig.userId;
    const profileId = userConfig.activeProfileId;
    const activeContext = profileId || 'global';
    
    let profileDoc = null;
    let globalProfileDoc = null;
    if (userId) {
        [profileDoc, globalProfileDoc] = await Promise.all([
            TasteProfile.findOne({ owner: userId, context: activeContext }),
            activeContext === 'global' ? Promise.resolve(null) : TasteProfile.findOne({ owner: userId, context: 'global' })
        ]);
    }
    const dnaFilters = getProfileDnaFilters(userConfig, activeContext);

    let plannedQueries = [];
    try {
        if (mistralKey) {
            const routing = await routeLiveStremioSearch(search, mistralKey);
            
            if (routing?.filters?.strategy === 'static_list') {
                const { getTmdbIdByName, getTmdbMovieDetails } = require('../../clients/tmdb');
                const { rateLimitedMap } = require('../../utils/rateLimiter');
                const titles = routing.filters.static_items || [];
                const tmdbType = type === 'series' ? 'tv' : 'movie';

                const resolvedMetas = await rateLimitedMap(titles, async (title) => {
                    const tmdbId = await getTmdbIdByName(tmdbApiKey, tmdbType, title);
                    if (!tmdbId) return null;
                    const details = await getTmdbMovieDetails(tmdbApiKey, tmdbId, tmdbType);
                    if (!details) return null;

                    let name = details.title || details.name || 'Unknown';
                    let poster = details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : null;
                    let background = details.backdrop_path ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}` : null;

                    if (details.images && Array.isArray(details.images.posters) && details.images.posters.length > 0) {
                        poster = `https://image.tmdb.org/t/p/w342${details.images.posters[0].file_path}`;
                    }
                    if (details.images && Array.isArray(details.images.backdrops) && details.images.backdrops.length > 0) {
                        background = `https://image.tmdb.org/t/p/w780${details.images.backdrops[0].file_path}`;
                    }

                    return {
                        id: `tmdb:${tmdbId}`,
                        type: type === 'series' ? 'series' : 'movie',
                        name: name,
                        poster: poster,
                        background: background,
                        releaseInfo: details.release_date || details.first_air_date ? (details.release_date || details.first_air_date).substring(0, 4) : null,
                        imdbRating: details.vote_average ? String(details.vote_average.toFixed(1)) : null,
                        genres: (details.genres || []).map(g => g.id),
                        description: details.overview || null,
                        rawTMDB: details
                    };
                }, { batchSize: 5, delayMs: 0 });

                return resolvedMetas.filter(Boolean);
            }

            const rawQueries = Array.isArray(routing?.filters?.queries) ? routing.filters.queries : [];
            plannedQueries = rawQueries.filter(query => !query?.target || query.target === 'tmdb');
        }
    } catch (e) {
        console.error("Errore AI Search (Mistral down):", e.message);
    }

    if (plannedQueries.length === 0) {
        plannedQueries = [{ strategy: 'multi_search', text_search: search, target: 'tmdb' }];
    }

    const enrichedQueries = await Promise.all(
        plannedQueries.map(query => injectProfilePreferences(query, userId, profileId))
    );
    const queryResults = await Promise.all(
        enrichedQueries.map(query =>
            executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, cacheOptions)
        )
    );

    const finalItems = applyConsensusScoring(queryResults);
    await hydrateResultsFromLocalDetailsCache(finalItems, tmdbApiKey, type);

    for (const item of finalItems) {
        const consensusBonus = item.consensusCount > 1 ? (item.consensusCount ** 2) - 1 : 0;
        const tmdbVote = getTmdbVoteScore(item);
        if (profileDoc) {
            const affinity = ProfileScorer.calculateItemMatch(item.rawTMDB || item, profileDoc, {
                globalProfile: globalProfileDoc,
                dnaFilters
            });
            item.affinity = affinity;
            item.finalScore = tmdbVote + consensusBonus + affinity;
        } else {
            item.affinity = 0;
            item.finalScore = tmdbVote + consensusBonus;
        }
        item.consensusBonus = consensusBonus;
        delete item.queryIndexes;
    }

    finalItems.sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        if ((b.popularity || 0) !== (a.popularity || 0)) return (b.popularity || 0) - (a.popularity || 0);
        return (b.consensusCount || 0) - (a.consensusCount || 0);
    });

    return finalItems.slice(0, 20);
}


module.exports = {
    executeComplexStrategy,
    executeUniversalPipeline,
    executeCombinedSearch,
    injectProfilePreferences
};
