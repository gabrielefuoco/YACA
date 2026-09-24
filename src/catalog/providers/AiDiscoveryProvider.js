const { getTmdbIdByName, createTmdbClient } = require('../../clients/tmdb');
const { routeLiveStremioSearch } = require('../../ai/router');
const { getProfileDnaFilters } = require('../../utils/helpers');
const { interleaveMultipleResults, applyConsensusScoring } = require('../../utils/resultMerger');
const { getDuckDbCatalogFromFilters } = require('./DuckDbProvider');
const { normalizeAiDiscoveryQueries } = require('./AiQueryNormalizer');
const TasteProfile = require('../../models/TasteProfile');
const ProfileScorer = require('../../profile/ProfileScorer');
const { hydrateResultsFromLocalDetailsCache } = require('../processors/MetadataHydrator');
const { G } = require('../../data/filters');

function getTmdbVoteScore(item) {
    const rawVote = item?.rawTMDB?.vote_average ?? item?.vote_average ?? item?.imdbRating;
    const vote = Number.parseFloat(rawVote);
    return Number.isFinite(vote) ? vote : 0;
}

const { computeTopGenres, computeTopKeywords } = require('../../engines/hybridRecommendations');

function applyAiQualityFilters(query) {
    if (query.strategy === 'discovery') {
        if (query.include_adult === undefined) query.include_adult = false;
        if (query['vote_count.gte'] === undefined) query['vote_count.gte'] = 75; // taglia via i b-movie fake amatoriali e porno low budget
        if (query.original_language === undefined) query.original_language = 'en|it|es|fr|de|ja|ko'; // whitelist lingue principali + anime/kdrama
    }
    return query;
}

const LOOKAHEAD_PAGES = 3;
const PAGE_SIZE = 20;

function getKeywordFallbackSequence(originalKeyword, fallbackArray = []) {
    const sequence = [];
    
    if (originalKeyword && typeof originalKeyword === 'string') {
        const isOr = originalKeyword.includes('|');
        const separator = isOr ? '|' : ',';
        const keys = originalKeyword.split(/[|,]/).map(k => k.trim()).filter(Boolean);
        
        if (keys.length > 1) {
            for (let i = keys.length - 1; i >= 1; i--) {
                sequence.push(keys.slice(0, i).join(separator));
            }
        }
    }

    if (Array.isArray(fallbackArray)) {
        for (const kw of fallbackArray) {
            if (kw && typeof kw === 'string') {
                sequence.push(kw.trim());
            }
        }
    }

    sequence.push(null);

    return sequence;
}

async function executeComplexStrategy(filters, tmdbClient, tmdbApiKey, type, skip, settings = {}, cacheOptions = {}) {
    const searchType = type === 'series' ? 'tv' : 'movie';

    if (filters.strategy === "similar" && filters.similar_to) {
        const targetId = await getTmdbIdByName(tmdbApiKey, searchType, filters.similar_to);
        if (targetId) {
            return await getDuckDbCatalogFromFilters({ similar_to: targetId }, type, skip, PAGE_SIZE, settings);
        }
        return [];
    }
    if (filters.strategy === "multi_search" || filters.strategy === "lexical_search") {
        return await getDuckDbCatalogFromFilters({ text_search: filters.text_search || filters.keyword }, type, skip, PAGE_SIZE, settings);
    }
    if (filters.strategy === "manual_list") {
        let tmdbIds = [];
        if (Array.isArray(filters.items)) {
            tmdbIds = filters.items.map(item => typeof item === 'object' && item !== null ? (item.tmdbId || item.id) : item).filter(Boolean);
        } else if (Array.isArray(filters.tmdbIds)) {
            tmdbIds = filters.tmdbIds;
        } else if (filters.with_id || filters.params?.with_id) {
            tmdbIds = [filters.with_id || filters.params.with_id];
        }
        if (tmdbIds.length === 0) return [];
        return await getDuckDbCatalogFromFilters({ tmdbIds, uniqueById: filters.uniqueById }, type, skip, PAGE_SIZE, settings);
    }
    // Usa DuckDB per tutti i cataloghi discovery nativi (inclusi preset e hybrid fallback)
    return await getDuckDbCatalogFromFilters(filters, type, skip, PAGE_SIZE, settings);
}

function collectManualListItems(queries) {
    const items = [];
    for (const query of queries) {
        if (Array.isArray(query.items)) items.push(...query.items);
        else if (Array.isArray(query.tmdbIds)) items.push(...query.tmdbIds);
        else {
            const id = query.with_id || query.params?.with_id;
            if (id) items.push(id);
        }
    }
    return items;
}

function getPagesToFetchForQuery(query, requestedPages) {
    if (query.strategy !== 'manual_list') return requestedPages;

    let itemCount = null;
    if (Array.isArray(query.items)) itemCount = query.items.length;
    else if (Array.isArray(query.tmdbIds)) itemCount = query.tmdbIds.length;
    else if (query.with_id || query.params?.with_id) itemCount = 1;

    if (itemCount === null) return requestedPages;
    return Math.max(1, Math.min(requestedPages, Math.ceil(itemCount / PAGE_SIZE)));
}

// Fase 2: Processa qualsiasi catalogo tramite array "queries" (LookAhead, Consensus)
async function executeUniversalPipeline(universalCatalog, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions) {
    const { presentation_strategy } = universalCatalog;
    const queries = universalCatalog.queries || [];

    if (queries.length === 0) return [];

    // I Matchmaker legacy salvano una query manual_list per fonte. Un solo ID
    // genera un piano DuckDB leggero: per le liste compatibili un batch IN evita
    // decine di query full-table e rende skip un vero offset SQL.
    const canBatchManualList = queries.length > 1 &&
        presentation_strategy !== 'interleave' &&
        queries.every(query => query.strategy === 'manual_list');
    if (canBatchManualList) {
        const items = collectManualListItems(queries);
        if (items.length > 0) {
            return await executeComplexStrategy(
                { strategy: 'manual_list', items, uniqueById: true },
                tmdbClient,
                tmdbApiKey,
                type,
                skip,
                settings,
                cacheOptions
            );
        }
    }

    let finalResults;

    if (queries.length === 1) {
        let query = { ...queries[0] };
        if (!query.strategy) query.strategy = 'discovery';
        query = applyAiQualityFilters(query);

        let primaryResults = await executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions);

        const withGenres = Array.isArray(query.with_genres)
            ? query.with_genres.map(String)
            : String(query.with_genres ?? '').split(/[|,]/);
        // Universally relax keywords if primaryResults are empty to prevent 0 items bugs
        if (!settings?.noFallback && (!primaryResults || primaryResults.length === 0) && (query.with_keywords || query.keyword)) {
            const fallbackKeywords = getKeywordFallbackSequence(query.keyword || query.with_keywords, query.fallback_keywords);
            let relaxedResults = [];
            for (const fallbackKw of fallbackKeywords) {
                const relaxedQuery = { ...query };
                if (fallbackKw === null) {
                    delete relaxedQuery.with_keywords;
                    delete relaxedQuery.keyword;
                } else {
                    relaxedQuery.keyword = fallbackKw;
                    delete relaxedQuery.with_keywords;
                }
                relaxedResults = await executeComplexStrategy(relaxedQuery, tmdbClient, tmdbApiKey, type, skip, settings, cacheOptions);
                if (relaxedResults && relaxedResults.length > 0) {
                    break;
                }
            }
            primaryResults = relaxedResults.map(item => ({ ...item, _sourceKeyword: query.keyword || queries[0]?.keyword, _sourceGenres: query.with_genres || queries[0]?.with_genres }));
        } else if (primaryResults) {
            primaryResults = primaryResults.map(item => ({ ...item, _sourceKeyword: query.keyword || queries[0]?.keyword, _sourceGenres: query.with_genres || queries[0]?.with_genres }));
        }

        finalResults = primaryResults || [];
    } else {
        const totalNeeded = skip + PAGE_SIZE;
        const pagesToFetch = Math.max(LOOKAHEAD_PAGES, Math.ceil(totalNeeded / PAGE_SIZE));

        const queryResults = await Promise.all(
            queries.map(async (queryDef) => {
                let query = { ...queryDef };
                if (!query.strategy) query.strategy = 'discovery';
                query = applyAiQualityFilters(query);

                const pagePromises = [];
                const queryPagesToFetch = getPagesToFetchForQuery(query, pagesToFetch);
                for (let p = 0; p < queryPagesToFetch; p++) {
                    const pageSkip = p * PAGE_SIZE;
                    pagePromises.push(
                        executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, pageSkip, settings, cacheOptions)
                    );
                }
                let pageResults = await Promise.all(pagePromises);
                let flatResults = pageResults.flat().map(item => ({ ...item, _sourceKeyword: query.keyword || queryDef.keyword, _sourceGenres: query.with_genres || queryDef.with_genres }));
                
                // Fallback morbido se le keyword di Mistral sono allucinate o inesistenti
                if (!settings?.noFallback && flatResults.length === 0 && (query.with_keywords || query.keyword)) {
                    const fallbackKeywords = getKeywordFallbackSequence(query.keyword || query.with_keywords, query.fallback_keywords);
                    let relaxedResults = [];
                    for (const fallbackKw of fallbackKeywords) {
                        const relaxedQuery = { ...query };
                        if (fallbackKw === null) {
                            delete relaxedQuery.with_keywords;
                            delete relaxedQuery.keyword;
                        } else {
                            relaxedQuery.keyword = fallbackKw;
                            delete relaxedQuery.with_keywords;
                        }
                        
                        const relaxedPromises = [];
                        for (let p = 0; p < pagesToFetch; p++) {
                            const pageSkip = p * PAGE_SIZE;
                            relaxedPromises.push(executeComplexStrategy(relaxedQuery, tmdbClient, tmdbApiKey, type, pageSkip, settings, cacheOptions));
                        }
                        const pageResults = await Promise.all(relaxedPromises);
                        relaxedResults = pageResults.flat();
                        if (relaxedResults && relaxedResults.length > 0) {
                            relaxedResults = relaxedResults.map(item => ({ ...item, _sourceKeyword: fallbackKw || queryDef.keyword, _sourceGenres: query.with_genres || queryDef.with_genres }));
                            break;
                        }
                    }
                    flatResults = relaxedResults;
                }

                return flatResults;
            })
        );

        if (presentation_strategy === 'interleave') {
            finalResults = interleaveMultipleResults(queryResults, PAGE_SIZE, skip);
        } else {
            const finalItems = applyConsensusScoring(queryResults);
            
            finalItems.sort((a, b) => {
                const bonusDiff = (b.consensusBonus || 0) - (a.consensusBonus || 0);
                if (bonusDiff !== 0) return bonusDiff;
                return (b.popularity || 0) - (a.popularity || 0);
            });

            finalResults = finalItems.slice(skip, skip + PAGE_SIZE);
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
    const alignedTopGenres = [...new Set(topGenres.flatMap(genre => {
        const id = Number(genre);
        return Number.isFinite(id) ? [id, ...G.getEquivalentGenreIds(id)] : [];
    }))];

    // Le keyword del profilo sono un fallback di personalizzazione, non un
    // sostituto del tema esplicito chiesto dall'utente. Se la discovery ha già
    // una keyword/cast risolto, accodare i ID del profilo con OR trasformerebbe
    // "superhero" in qualunque film del DNA e ricreerebbe il catalogo generico.
    const hasExplicitNameFilter = Boolean(enriched._keywordNames || enriched.with_keywords || enriched.with_cast);
    if (topKeywords.length > 0 && !hasExplicitNameFilter) {
        enriched.with_keywords = topKeywords.join('|');
    }

    if (alignedTopGenres.length > 0) {
        if (enriched.with_genres) {
            const separator = enriched.with_genres.includes(',') ? ',' : '|';
            const existingGenres = enriched.with_genres.split(separator).map(s => s.trim()).filter(Boolean);
            enriched.with_genres = [...new Set([...existingGenres, ...alignedTopGenres])].join(separator);
        } else {
            enriched.with_genres = alignedTopGenres.join('|');
        }
    }

    return enriched;
}

// Esegue Deep AI Search, consensus ranking e profilazione
async function executeCombinedSearch(search, userConfig, type, skip, activeProfileSettings, cacheOptions) {
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    const mistralKey = userConfig.apiKeys?.mistral || process.env.MISTRAL_API_KEY;
    const tmdbClient = createTmdbClient(tmdbApiKey);
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
    let usingLexicalFallback = false;
    try {
        if (mistralKey) {
            const routing = await routeLiveStremioSearch(search, mistralKey);
            
            if (routing?.filters?.strategy === 'static_list') {
                const titles = routing.filters.static_items || [];
                const titlePromises = titles.map(title =>
                    getDuckDbCatalogFromFilters({ text_search: title }, type, 0, 1, activeProfileSettings)
                );
                const titleResults = await Promise.all(titlePromises);
                return titleResults.flat().filter(Boolean);
            }

            const rawQueries = Array.isArray(routing?.filters?.queries) ? routing.filters.queries : [];
            plannedQueries = rawQueries.filter(query => !query?.target || query.target === 'tmdb' || query.target === 'kitsu');
        }
    } catch (e) {
        console.error("Errore AI Search (Mistral down):", e.message);
    }

    // Boundary unico dello schema planner → schema DuckDB. La risoluzione dei
    // nomi può scartare una discovery irrisolvibile; in quel caso non deve
    // degenerare silenziosamente nel catalogo popolare generico.
    if (plannedQueries.length > 0) {
        plannedQueries = await normalizeAiDiscoveryQueries(plannedQueries, { type, tmdbClient });
    }

    if (plannedQueries.length === 0) {
        // Senza un piano Mistral (o senza nomi risolvibili) non fingiamo una
        // ricerca semantica: il fallback dichiara esplicitamente una ricerca
        // lessicale stretta sui titoli. Il provider applica BM25, copertura di
        // tutti i termini e boost esatto.
        usingLexicalFallback = true;
        plannedQueries = [{ strategy: 'lexical_search', text_search: search, target: 'tmdb' }];
        console.info(`[AiDiscoveryProvider] Router AI non disponibile o query non risolvibile: fallback lessicale stretto per "${search}".`);
    }

    const enrichedQueries = usingLexicalFallback
        ? plannedQueries
        : await Promise.all(
            plannedQueries.map(query => injectProfilePreferences(query, userId, profileId))
        );
    const queryResults = await Promise.all(
        enrichedQueries.map(query =>
            executeComplexStrategy(query, tmdbClient, tmdbApiKey, type, skip, activeProfileSettings, cacheOptions)
        )
    );

    const finalItems = applyConsensusScoring(queryResults);
    await hydrateResultsFromLocalDetailsCache(finalItems, tmdbApiKey, type);

    if (usingLexicalFallback) {
        // executeComplexStrategy ha già applicato skip e limite: non riordinare
        // per voto/profilo, altrimenti il fallback nasconderebbe la rilevanza BM25.
        return finalItems;
    }

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
    executeUniversalPipeline,
    executeCombinedSearch
};
