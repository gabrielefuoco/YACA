const { fetchTmdbCatalog, createTmdbClient, getTmdbIdByName } = require('../../clients/tmdb');
const { executePaginatedFetch } = require('./paginationHelper');
const { rateLimitedMap } = require('../../utils/rateLimiter');
const { STREAMING_PROVIDERS } = require('../constants');

function resolveGenreIds(genreIdsArray, type) {
    if (!genreIdsArray || genreIdsArray.length === 0) return [];
    if (type === 'movie') return genreIdsArray;

    const MOVIE_TO_TV_MAP = {
        28: 10759, 12: 10759, 16: 16, 35: 35, 80: 80, 99: 99, 18: 18,
        10751: 10751, 14: 10765, 36: 10768, 27: 9648, 10402: 18,
        9648: 9648, 10749: 18, 878: 10765, 53: 80, 10752: 10768, 37: 37
    };

    const validTvGenres = new Set(Object.values(MOVIE_TO_TV_MAP));
    const mapped = genreIdsArray.map(id => {
        const numId = Number(id);
        if (validTvGenres.has(numId)) return id;
        return MOVIE_TO_TV_MAP[id] || id;
    });
    
    return [...new Set(mapped)];
}

async function buildDiscoveryParams(filters, tmdbApiKey, type, baseSettings = {}) {
    const {
        strategy, similar_to, text_search, people_list, keyword, 
        company_name, genre_ids, year_from, year_to, runtime_lte, 
        runtime_gte, watch_provider, original_language, target,
        sort_by, language,
        ...tmdbParams
    } = filters;

    tmdbParams.sort_by = sort_by || 'popularity.desc';
    tmdbParams.language = language || 'it-IT';

    if (original_language) {
        tmdbParams.with_original_language = original_language;
    }

    // Consolida logica generi (priorità a genre_ids se presenti, e mappa per TV preservando l'operatore)
    let originalOperator = ',';
    if (tmdbParams.with_genres && typeof tmdbParams.with_genres === 'string') {
        originalOperator = tmdbParams.with_genres.includes('|') ? '|' : ',';
    }

    let genres = [];
    let hasHorrorForTv = false;
    if (tmdbParams.with_genres) {
        const rawGenres = Array.isArray(tmdbParams.with_genres)
            ? tmdbParams.with_genres.map(String)
            : String(tmdbParams.with_genres).split(/[|,]/).map(g => g.trim()).filter(Boolean);
        
        if (type === 'series' && rawGenres.includes('27')) hasHorrorForTv = true;
        genres.push(...resolveGenreIds(rawGenres, type));
    }
    if (genre_ids?.length) {
        if (type === 'series' && genre_ids.map(String).includes('27')) hasHorrorForTv = true;
        genres.push(...resolveGenreIds(genre_ids, type));
    }
    if (genres.length > 0) {
        tmdbParams.with_genres = [...new Set(genres)].join(originalOperator);
    }
    
    // TMDB non ha un genere Horror (27) per le serie TV. Per non perdere il focus, aggiungiamo la keyword "horror" (315058)
    if (hasHorrorForTv) {
        if (tmdbParams.with_keywords) {
            tmdbParams.with_keywords += ',315058';
        } else {
            tmdbParams.with_keywords = '315058';
        }
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

    const params = {
        sort_by: sortBy || 'popularity.desc',
        'vote_average.gte': activeProfileSettings.minVoteAverage,
        'vote_count.gte': activeProfileSettings.minVoteCount
    };

    const results = await executePaginatedFetch(
        (currentSkip) => fetchTmdbCatalog(tmdbClient, endpoint, currentSkip, params, contentType, tmdbFetchOptions),
        skip,
        20,
        userConfig,
        { batchSize: 3, delayMs: 50 }
    );

    return results;
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
