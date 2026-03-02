const axios = require("axios");
const { getTmdbMetaDetails } = require("../clients/tmdb");
const LRUCache = require("./LRUCache");

const ratingsCache = new LRUCache({ max: 5000, ttl: 1000 * 60 * 60 * 6 }); // 6-hour TTL

/**
 * Recupera gli item di una lista MDBList usando l'API pubblica o la chiave API.
 */
async function fetchMDBListItems(listId, apiKey, language, page = 1) {
    const offset = (page * 20) - 20;
    try {
        // API MDBList: https://api.mdblist.com/lists/{listId}/items
        let url = `https://api.mdblist.com/lists/${listId}/items?language=${language}&limit=20&offset=${offset}&append_to_response=genre,poster`;
        if (apiKey) url += `&apikey=${apiKey}`;

        const response = await axios.get(url);
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
 * Analizza e formatta gli item MDBList recuperando metadati estesi da TMDB in lotti (rate-limited).
 */
async function parseMDBListItems(items, type, tmdbApiKey, _language) {
    const filteredItemsByType = items
        .filter(item => {
            if (type === "series") return item.mediatype === "show";
            if (type === "movie") return item.mediatype === "movie";
            return false;
        })
        .map(item => ({
            // MDBList returns tmdbid if present, sometimes just id.
            id: item.tmdbid ? `tmdb:${item.tmdbid}` : `tmdb:${item.id}`,
            type: type
        }));

    const metas = [];

    // Semplice esecuzione sequenziale per i dettagli TMDB (per evitare un rate-limiter complesso per ora)
    for (const item of filteredItemsByType) {
        try {
            const result = await getTmdbMetaDetails(tmdbApiKey, item.id, item.type);
            if (result) metas.push(result);
        } catch (err) {
            console.error(`Error fetching TMDB meta for MDBList item ${item.id}:`, err.message);
        }
    }

    return metas;
}

/**
 * Recupera i voti di Rotten Tomatoes e Metacritic da MDBList per un dato IMDB ID.
 * Restituisce null se non disponibili o in caso di errore.
 */
async function fetchMdblistRatings(imdbId, mdblistApiKey) {
    if (!imdbId || !imdbId.startsWith('tt')) return null;

    const cacheKey = `ratings:${imdbId}`;
    if (ratingsCache.has(cacheKey)) return ratingsCache.get(cacheKey);

    try {
        let url = `https://api.mdblist.com/?i=${imdbId}`;
        if (mdblistApiKey) url += `&apikey=${mdblistApiKey}`;

        const response = await axios.get(url, { timeout: 5000 });
        const ratingsData = response.data?.ratings;
        if (!Array.isArray(ratingsData)) return null;

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

        ratingsCache.set(cacheKey, result);
        return result;
    } catch (_e) {
        return null;
    }
}

module.exports = { fetchMDBListItems, parseMDBListItems, fetchMdblistRatings };
