const { createAxiosClient } = require('../utils/axiosClient');
const { createAxiosInstance } = require('../utils/httpClient');
const CacheManager = require('../cache/CacheManager');

const anilistCatalogCache = new CacheManager('anilist_catalog', { ramMax: 50, ramTtlMs: 1000 * 60 * 60, mongoTtlMs: 7 * 24 * 60 * 60 * 1000, swrMs: 1000 * 60 * 60 });
const anilistMetaCache = new CacheManager('anilist_meta', { ramMax: 200, ramTtlMs: 1000 * 60 * 60 * 24, mongoTtlMs: 14 * 24 * 60 * 60 * 1000, swrMs: 1000 * 60 * 60 * 24 });

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

const META_QUERY = `
query ($id: Int) {
    Media(id: $id, type: ANIME) {
        id
        idMal
        title { romaji english native }
        coverImage { extraLarge large }
        bannerImage
        description(asHtml: false)
        format
        status
        genres
        episodes
        averageScore
        nextAiringEpisode { episode airingAt }
    }
}`;

function getAnilistClient() {
    return createAxiosInstance('https://graphql.anilist.co', {
        timeout: 15000
    });
}

// Esegue una richiesta GraphQL ad Anilist
async function executeGraphQL(query, variables) {
    const payload = { query, variables };
    const client = getAnilistClient();
    const res = await client.post('', payload);
    return res.data;
}

/**
 * Mappa i Media AniList nel formato Catalog meta di Stremio
 */
function mapAnilistToMeta(m, overrideId) {
    let title = m.title.romaji || m.title.english || m.title.native || 'Sconosciuto';
    let type = (m.format === 'MOVIE' || m.format === 'SPECIAL' || m.format === 'OVA') ? 'movie' : 'series';
    
    // Calcoliamo la descrizione base
    let desc = m.description || '';
    if (m.nextAiringEpisode) {
        desc = `[Airing Ep ${m.nextAiringEpisode.episode}]\n\n${desc}`;
    }

    let year = '';
    
    return {
        id: overrideId || `anilist:${m.id}`,
        malId: m.idMal,
        type: type,
        name: title,
        poster: m.coverImage?.extraLarge || m.coverImage?.large,
        background: m.bannerImage || m.coverImage?.extraLarge,
        description: desc,
        genres: m.genres || [],
        releaseInfo: year,
        imdbRating: m.averageScore ? (m.averageScore / 10).toFixed(1) : undefined,
        _nextAiringEpisode: m.nextAiringEpisode
    };
}

/**
 * Recupera un catalogo AniList e lo mappa
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

async function getAnilistMeta(anilistId) {
    const cacheKey = `anilist_meta_${anilistId}`;
    const cached = await anilistMetaCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await executeGraphQL(META_QUERY, { id: parseInt(anilistId, 10) });
        const media = res.data?.Media;
        if (media) {
            await anilistMetaCache.set(cacheKey, media);
        }
        return media;
    } catch (e) {
        console.error(`Errore getAnilistMeta per ${anilistId}:`, e.message);
        return null;
    }
}

async function getAnilistCatalogFromFilters(filters, type, skip) {
    const limit = 20;
    const page = Math.floor(skip / limit) + 1;
    const variables = { page, perPage: limit, sort: ['POPULARITY_DESC'] };

    // Search
    if (filters.text_search || filters.keyword) {
        variables.search = filters.text_search || filters.keyword;
        variables.sort = ['SEARCH_MATCH'];
    }

    // Genres and Tags (TMDB keywords / preset keywords)
    if (filters._keywordNames) {
        const keywords = filters._keywordNames
            .split(/[|,]/)
            .map(c => c.trim())
            .filter(Boolean);
            
        const ANILIST_GENRES = new Set([
            'action', 'adventure', 'comedy', 'drama', 'ecchi', 'fantasy', 'horror', 
            'mahou shoujo', 'mecha', 'music', 'mystery', 'psychological', 'romance', 
            'sci-fi', 'slice of life', 'sports', 'supernatural', 'thriller'
        ]);

        const genres = [];
        const tags = [];
        for (const kw of keywords) {
            if (ANILIST_GENRES.has(kw.toLowerCase())) {
                genres.push(kw);
            } else {
                tags.push(kw);
            }
        }

        if (genres.length > 0) {
            variables.genre_in = genres;
        }
        if (tags.length > 0) {
            variables.tag_in = tags;
        }
    }

    // Format
    if (type === 'movie') {
        variables.format_in = ['MOVIE', 'SPECIAL'];
    } else if (type === 'series') {
        variables.format_in = ['TV', 'TV_SHORT', 'OVA', 'ONA'];
    }

    // Dates
    const gteDate = filters['first_air_date.gte'] || filters['primary_release_date.gte'];
    const lteDate = filters['first_air_date.lte'] || filters['primary_release_date.lte'];

    if (gteDate) {
        // gteDate is YYYY-MM-DD
        const year = parseInt(gteDate.substring(0, 4));
        const month = parseInt(gteDate.substring(5, 7)) || 1;
        const day = parseInt(gteDate.substring(8, 10)) || 1;
        variables.startDate_greater = year * 10000 + month * 100 + day;
    }
    
    if (lteDate) {
        const year = parseInt(lteDate.substring(0, 4));
        const month = parseInt(lteDate.substring(5, 7)) || 12;
        const day = parseInt(lteDate.substring(8, 10)) || 31;
        variables.startDate_lesser = year * 10000 + month * 100 + day;
    }

    // se non ci sono date, e non è ricerca, escludiamo il futuro (seasonYear <= currentYear)
    if (!gteDate && !lteDate && !variables.search) {
        variables.startDate_lesser = (new Date().getFullYear() + 1) * 10000;
    }

    // Vote Average
    const voteMin = filters.voteMin !== undefined && filters.voteMin !== null ? filters.voteMin : (filters['vote_average.gte'] !== undefined ? filters['vote_average.gte'] : null);
    const voteMax = filters.voteMax !== undefined && filters.voteMax !== null ? filters.voteMax : (filters['vote_average.lte'] !== undefined ? filters['vote_average.lte'] : null);
    
    if (voteMin !== null) variables.averageScore_greater = Math.round(Number(voteMin) * 10);
    if (voteMax !== null) variables.averageScore_lesser = Math.round(Number(voteMax) * 10);

    // Sort
    if (filters.sort_by) {
        const sortBy = filters.sort_by;
        if (sortBy === 'popularity.desc') variables.sort = ['POPULARITY_DESC'];
        else if (sortBy === 'popularity.asc') variables.sort = ['POPULARITY'];
        else if (sortBy === 'vote_average.desc') variables.sort = ['SCORE_DESC'];
        else if (sortBy === 'vote_average.asc') variables.sort = ['SCORE'];
        else if (sortBy === 'release_date.desc' || sortBy === 'first_air_date.desc') variables.sort = ['START_DATE_DESC'];
        else if (sortBy === 'release_date.asc' || sortBy === 'first_air_date.asc') variables.sort = ['START_DATE'];
    }

    // console.log("Anilist Variables:", variables);

    try {
        const res = await executeGraphQL(CATALOG_QUERY, variables);
        return res.data?.Page?.media || [];
    } catch (e) {
        console.error('Errore getAnilistCatalogFromFilters:', e.message);
        return [];
    }
}

module.exports = {
    fetchAnilistCatalog
};
