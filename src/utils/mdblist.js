const axios = require("axios");
const { getTmdbMetaDetails } = require("../clients/tmdb");

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
async function parseMDBListItems(items, type, tmdbApiKey, language) {
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

module.exports = { fetchMDBListItems, parseMDBListItems };
