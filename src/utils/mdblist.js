const { createAxiosInstance } = require('../utils/httpClient');
const { rateLimitedMapFiltered } = require('../utils/rateLimiter');
const CacheManager = require("../cache/CacheManager");

const mdblistClient = createAxiosInstance('https://api.mdblist.com');

const ratingsCache = new CacheManager('mdblist_ratings', {
    ramMax: 500,
    ramTtlMs: 1000 * 60 * 60 * 6, // 6h RAM
    mongoTtlMs: 1000 * 60 * 60 * 24, // 24h MongoDB
    swrMs: 1000 * 60 * 60 // 1h SWR window
});

/**
 * Recupera gli item di una lista MDBList usando l'API pubblica o la chiave API.
 */
async function fetchMDBListItems(listId, apiKey, language, page = 1) {
    const offset = (page * 20) - 20;
    try {
        let url = `/lists/${listId}/items?language=${language}&limit=20&offset=${offset}&append_to_response=genre,poster`;
        if (apiKey) url += `&apikey=${apiKey}`;

        const response = await mdblistClient.get(url);
        return [
            ...(response.data.movies || []),
            ...(response.data.shows || [])
        ];
    } catch (err) {
        console.error("Error retrieving MDBList items:", err.message);
        return [];
    }
}

/**
 * Analizza e formatta gli item MDBList in Light Mode.
 * Non chiama getTmdbMetaDetails per evitare il collo di bottiglia N+1.
 * Restituisce: id, type, name, poster, description, releaseInfo, imdbRating, genre_ids.
 */
async function parseMDBListItems(items, type, _tmdbApiKey, _language) {
    return items
        .filter(item => {
            if (type === "series") return item.mediatype === "show";
            if (type === "movie") return item.mediatype === "movie";
            return false;
        })
        .map(item => ({
            id: item.imdbid ? item.imdbid : (item.tmdbid ? `tmdb:${item.tmdbid}` : `tmdb:${item.id}`),
            type: type,
            name: item.title || 'Titolo sconosciuto',
            poster: item.poster ? `https://image.tmdb.org/t/p/w342${item.poster}` : null,
            posterShape: 'poster',
            description: item.description || item.plot || '',
            releaseInfo: item.year ? item.year.toString() : '',
            imdbRating: item.imdbrating ? parseFloat(item.imdbrating).toFixed(1) : undefined,
            genre_ids: item.genre_ids || []
        }));
}

/**
 * Recupera i voti di Rotten Tomatoes e Metacritic da MDBList per un dato IMDB ID.
 */
async function fetchMdblistRatings(imdbId, mdblistApiKey) {
    if (!imdbId || !imdbId.startsWith('tt')) return null;

    const cacheKey = `ratings:${imdbId}`;
    const { value: cached, status: cacheStatus } = await ratingsCache.getWithStatus(cacheKey);
    if (cacheStatus === 'fresh') return cached;

    // If stale, return cached data and trigger background revalidation
    if (cacheStatus === 'stale') {
        // Fire-and-forget background revalidation
        (async () => {
            try {
                let url = `/?i=${imdbId}`;
                if (mdblistApiKey) url += `&apikey=${mdblistApiKey}`;
                const response = await mdblistClient.get(url, { timeout: 5000 });
                const data = response.data;
                if (!data || !data.ratings) {
                    await ratingsCache.set(cacheKey, null);
                    return;
                }
                const ratingsData = data.ratings;
                const find = (source) => ratingsData.find(r => r.source === source);
                const rtCritic = find('tomatoes');
                const rtAudience = find('tomatoesaudience');
                const metacritic = find('metacritic');
                const imdbRating = find('imdb');
                const result = {
                    imdb: imdbRating?.value !== null && imdbRating?.value !== undefined ? parseFloat(imdbRating.value).toFixed(1) : null,
                    rtCritic: rtCritic?.value !== null && rtCritic?.value !== undefined ? Math.round(rtCritic.value) : null,
                    rtAudience: rtAudience?.value !== null && rtAudience?.value !== undefined ? Math.round(rtAudience.value) : null,
                    metacritic: metacritic?.value !== null && metacritic?.value !== undefined ? Math.round(metacritic.value) : null
                };
                await ratingsCache.set(cacheKey, result);
            } catch (_e) { /* silent background revalidation */ }
        })();
        return cached;
    }

    try {
        let url = `/?i=${imdbId}`;
        if (mdblistApiKey) url += `&apikey=${mdblistApiKey}`;

        const response = await mdblistClient.get(url, { timeout: 5000 });
        const data = response.data;
        if (!data || !data.ratings) {
            // Cache negative results to avoid repeated lookups for titles without ratings
            await ratingsCache.set(cacheKey, null);
            return null;
        }

        const ratingsData = data.ratings;
        const find = (source) => ratingsData.find(r => r.source === source);
        const rtCritic = find('tomatoes');
        const rtAudience = find('tomatoesaudience');
        const metacritic = find('metacritic');
        const imdb = find('imdb');

        const result = {
            imdb: imdb?.value !== null && imdb?.value !== undefined ? parseFloat(imdb.value).toFixed(1) : null,
            rtCritic: rtCritic?.value !== null && rtCritic?.value !== undefined ? Math.round(rtCritic.value) : null,
            rtAudience: rtAudience?.value !== null && rtAudience?.value !== undefined ? Math.round(rtAudience.value) : null,
            metacritic: metacritic?.value !== null && metacritic?.value !== undefined ? Math.round(metacritic.value) : null
        };

        await ratingsCache.set(cacheKey, result);
        return result;
    } catch (_e) {
        return null;
    }
}

module.exports = { fetchMDBListItems, parseMDBListItems, fetchMdblistRatings };
