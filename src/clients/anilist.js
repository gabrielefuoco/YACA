const { createAxiosClient } = require('../utils/axiosClient');
const { logError } = require('../utils/logger');

// Estraiamo sleep per usarlo nei retry
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const CacheManager = require('../cache/CacheManager');

const anilistCatalogCache = new CacheManager('anilist_catalog', { ramMax: 50, ramTtlMs: 1000 * 60 * 60, mongoTtlMs: 7 * 24 * 60 * 60 * 1000, swrMs: 1000 * 60 * 60 });

// GraphQL Queries
const CATALOG_QUERY = `
query ($page: Int, $perPage: Int, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int, $format: MediaFormat, $format_in: [MediaFormat], $genre: String, $genre_in: [String], $tag_in: [String], $search: String, $status: MediaStatus, $averageScore_greater: Int, $averageScore_lesser: Int, $startDate_greater: FuzzyDateInt, $startDate_lesser: FuzzyDateInt) {
    Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: $sort, season: $season, seasonYear: $seasonYear, format: $format, format_in: $format_in, genre: $genre, genre_in: $genre_in, tag_in: $tag_in, search: $search, status: $status, averageScore_greater: $averageScore_greater, averageScore_lesser: $averageScore_lesser, startDate_greater: $startDate_greater, startDate_lesser: $startDate_lesser, isAdult: false) {
            id
            idMal
            title { romaji english native }
            coverImage { extraLarge large }
            description(asHtml: false)
            format
            status
            genres
            episodes
            duration
            averageScore
            nextAiringEpisode { episode airingAt }
        }
    }
}`;

function getAnilistClient() {
    return createAxiosClient('https://graphql.anilist.co', {
        timeout: 15000
    });
}

// Esegue una richiesta GraphQL ad Anilist con Retry (Exponential Backoff su 429)
async function executeGraphQL(query, variables, retries = 3) {
    const payload = { query, variables };
    const client = getAnilistClient();
    
    for (let i = 0; i < retries; i++) {
        try {
            const res = await client.post('', payload);
            return res.data;
        } catch (error) {
            if (error.response?.status === 429 && i < retries - 1) {
                let retryAfter = error.response.headers['retry-after'] 
                    ? parseInt(error.response.headers['retry-after']) * 1000 
                    : 0;
                
                // Fallback to exponential backoff if retry-after is 0 or NaN
                if (isNaN(retryAfter) || retryAfter <= 0) {
                    retryAfter = Math.pow(2, i) * 1000;
                }
                
                console.warn(`[AniList] Rate limit (429) hit. Retrying in ${retryAfter}ms (Attempt ${i + 1}/${retries})...`);
                await sleep(retryAfter);
            } else {
                logError('Anilist', `GraphQL Request Failed: ${error.message}`, { variables, status: error.response?.status, data: error.response?.data });
                throw error;
            }
        }
    }
}

/**
 * Recupera un catalogo AniList
 */
async function fetchAnilistCatalog(catalogId, skip = 0) {
    const limit = 20; // Abbassato da 50 a 20 per evitare timeout su Stremio
    const page = Math.floor(skip / limit) + 1;
    const cacheKey = `anilist_catalog_${catalogId}_${page}`;
    
    const variables = { page, perPage: limit };

    if (catalogId === 'anilist-trending' || catalogId === 'yaca_anime_trending') {
        variables.sort = ['TRENDING_DESC'];
    } else if (catalogId === 'anilist-popular') {
        variables.sort = ['POPULARITY_DESC'];
    } else if (catalogId === 'anilist-simulcast') {
        variables.sort = ['POPULARITY_DESC'];
        variables.status = 'RELEASING';
    } else if (catalogId === 'anilist-movies') {
        variables.sort = ['POPULARITY_DESC'];
        variables.format = 'MOVIE';
    } else if (catalogId.startsWith('anilist-genre-')) {
        variables.sort = ['POPULARITY_DESC'];
        variables.genre = catalogId.replace('anilist-genre-', '').replace('_', ' ');
    } else if (catalogId === 'anilist-ova' || catalogId === 'yaca_anime_ova') {
        variables.sort = ['POPULARITY_DESC'];
        variables.format = 'OVA';
    } else if (catalogId === 'anilist-ona' || catalogId === 'yaca_anime_ona') {
        variables.sort = ['POPULARITY_DESC'];
        variables.format = 'ONA';
    } else if (catalogId === 'anilist-specials' || catalogId === 'yaca_anime_specials') {
        variables.sort = ['POPULARITY_DESC'];
        variables.format = 'SPECIAL';
    }

    return anilistCatalogCache.getOrFetch(cacheKey, async () => {
        try {
            const res = await executeGraphQL(CATALOG_QUERY, variables);
            return res.data?.Page?.media || [];
        } catch (e) {
            console.error('Errore fetchAnilistCatalog:', e.message);
            throw e;
        }
    });
}

module.exports = {
    fetchAnilistCatalog
};
