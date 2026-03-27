const { fetchTmdbCatalog, createTmdbClient, getTmdbIdByName } = require('../../clients/tmdb');
const { filterWatchedItems } = require('../processors/FilterWatched');
const { rateLimitedMap } = require('../../utils/rateLimiter');
const { STREAMING_PROVIDERS } = require('../constants');

function resolveGenreIds(genreIdsArray, type) {
    if (!genreIdsArray || genreIdsArray.length === 0) return '';
    if (type === 'movie') return genreIdsArray.join('|');

    const MOVIE_TO_TV_MAP = {
        28: 10759, 12: 10759, 16: 16, 35: 35, 80: 80, 99: 99, 18: 18,
        10751: 10751, 14: 10765, 36: 10768, 27: 10765, 10402: 18,
        9648: 9648, 10749: 18, 878: 10765, 53: 80, 10752: 10768, 37: 37
    };

    const mapped = genreIdsArray.map(id => MOVIE_TO_TV_MAP[id]).filter(id => id !== undefined);
    return [...new Set(mapped)].join('|');
}

async function buildDiscoveryParams(filters, tmdbApiKey, type, baseSettings = {}) {
    const tmdbParams = {
        ...filters,
        sort_by: filters.sort_by || 'popularity.desc',
        'vote_count.gte': filters['vote_count.gte'],
        'vote_average.gte': filters['vote_average.gte'],
        'vote_count.lte': filters['vote_count.lte'],
        'vote_average.lte': filters['vote_average.lte'],
        'popularity.lte': filters['popularity.lte'],
        language: filters.language || 'it-IT'
    };

    if (filters.original_language) {
        tmdbParams.with_original_language = filters.original_language;
    }

    delete tmdbParams.strategy;
    delete tmdbParams.similar_to;
    delete tmdbParams.text_search;
    delete tmdbParams.people_list;
    delete tmdbParams.keyword;
    delete tmdbParams.company_name;
    delete tmdbParams.genre_ids;
    delete tmdbParams.year_from;
    delete tmdbParams.year_to;
    delete tmdbParams.runtime_lte;
    delete tmdbParams.runtime_gte;
    delete tmdbParams.watch_provider;
    delete tmdbParams.original_language;
    delete tmdbParams.target;

    if (tmdbParams.with_genres !== undefined && tmdbParams.with_genres !== null) {
        const normalizedGenres = Array.isArray(tmdbParams.with_genres)
            ? tmdbParams.with_genres.map(String)
            : String(tmdbParams.with_genres).split(/[|,]/).map(g => g.trim()).filter(Boolean);
        if (normalizedGenres.length > 0) tmdbParams.with_genres = [...new Set(normalizedGenres)].join('|');
    }

    if (tmdbParams.with_keywords !== undefined && tmdbParams.with_keywords !== null) {
        const kwStr = String(tmdbParams.with_keywords);
        const kwIsOr = kwStr.includes('|');
        const kwSeparator = kwIsOr ? '|' : ',';
        const normalizedKeywords = Array.isArray(tmdbParams.with_keywords)
            ? tmdbParams.with_keywords.map(String)
            : kwStr.split(kwIsOr ? '|' : ',').map(k => k.trim()).filter(Boolean);
        if (normalizedKeywords.length > 0) tmdbParams.with_keywords = [...new Set(normalizedKeywords)].join(kwSeparator);
    }

    if (filters.genre_ids?.length) {
        const finalGenres = resolveGenreIds(filters.genre_ids, type);
        if (finalGenres) tmdbParams.with_genres = finalGenres;
    }

    if (filters.year_from) {
        const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
        tmdbParams[`${dateField}.gte`] = `${filters.year_from}-01-01`;
        if (filters.year_to) tmdbParams[`${dateField}.lte`] = `${filters.year_to}-12-31`;
    }

    if (filters.runtime_lte && type === 'movie') tmdbParams['with_runtime.lte'] = filters.runtime_lte;
    if (filters.runtime_gte && type === 'movie') tmdbParams['with_runtime.gte'] = filters.runtime_gte;

    const asyncTasks = [];

    if (filters.people_list && filters.people_list.length > 0) {
        asyncTasks.push(
            Promise.allSettled(filters.people_list.map(name => getTmdbIdByName(tmdbApiKey, 'person', name)))
                .then(results => {
                    const valid = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
                    if (valid.length > 0) tmdbParams.with_people = valid.join(',');
                })
        );
    }

    if (filters.keyword && filters.keyword !== 'kdrama') {
        let sanitizedKeyword = filters.keyword;
        if (sanitizedKeyword.includes('|') && sanitizedKeyword.includes(',')) {
            sanitizedKeyword = sanitizedKeyword.replace(/,/g, '|');
        }

        const isOr = sanitizedKeyword.includes('|');
        const separator = isOr ? '|' : ',';
        const keywords = sanitizedKeyword.split(separator).map(k => k.trim()).filter(Boolean);
        
        asyncTasks.push(
            Promise.allSettled(keywords.map(k => getTmdbIdByName(tmdbApiKey, 'keyword', k)))
                .then(results => {
                    const valid = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
                    if (valid.length > 0) tmdbParams.with_keywords = valid.join(separator);
                })
        );
    }

    if (filters.company_name) {
        asyncTasks.push(
            getTmdbIdByName(tmdbApiKey, 'company', filters.company_name)
                .then(cid => { if (cid) tmdbParams.with_companies = cid; })
        );
    }

    await Promise.all(asyncTasks);

    if (filters.watch_provider) {
        const pid = STREAMING_PROVIDERS[filters.watch_provider.toLowerCase()];
        if (pid) {
            tmdbParams.with_watch_providers = pid;
            tmdbParams.watch_region = 'IT';
        }
    }

    return tmdbParams;
}

// Scenario 1: Ricerca testuale
async function executeStandardSearch(search, userConfig, type, skip, tmdbFetchOptions) {
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    const tmdbClient = createTmdbClient(tmdbApiKey);
    const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
    return fetchTmdbCatalog(tmdbClient, endpoint, skip, { query: search }, type, tmdbFetchOptions);
}

// Scenario 2: Cataloghi Esplorativi Standard
async function getTmdbDiscoverCatalog(id, type, skip, userConfig, tmdbClient, activeProfileSettings, tmdbFetchOptions, sortBy) {
    const isMovie = type === 'movie';
    const endpoint = isMovie ? '/discover/movie' : '/discover/tv';
    const contentType = isMovie ? 'movie' : 'series';

    let currentSkip = skip;
    let combinedResults = [];

    const params = {
        sort_by: sortBy || 'popularity.desc',
        'vote_average.gte': activeProfileSettings.minVoteAverage,
        'vote_count.gte': activeProfileSettings.minVoteCount
    };

    const parallelPages = (userConfig?.config?.hideWatched) ? 3 : 1;
    const pagesResults = await rateLimitedMap(
        Array.from({ length: parallelPages }, (_, i) => i),
        (i) => fetchTmdbCatalog(tmdbClient, endpoint, currentSkip + (i * 20), params, contentType, tmdbFetchOptions),
        { batchSize: 3, delayMs: 50 }
    );
    
    for (let pageResults of pagesResults) {
        pageResults = await filterWatchedItems(pageResults, userConfig);
        combinedResults.push(...pageResults);
        if (combinedResults.length >= 20) break;
    }

    return combinedResults.slice(0, 40);
}

function getTmdbVoteScore(item) {
    const rawVote = item?.rawTMDB?.vote_average ?? item?.vote_average ?? item?.imdbRating;
    const vote = Number.parseFloat(rawVote);
    return Number.isFinite(vote) ? vote : 0;
}

module.exports = {
    buildDiscoveryParams,
    resolveGenreIds,
    executeStandardSearch,
    getTmdbDiscoverCatalog,
    getTmdbVoteScore
};
