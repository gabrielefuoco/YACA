const axios = require('axios');
const { KITSU_ENDPOINT, ITEMS_PER_PAGE } = require('../config');

const kitsuClient = axios.create({
    baseURL: KITSU_ENDPOINT,
    timeout: 10000
});

/**
 * Trasforma il risultato raw di Kitsu nel formato Stremio Meta Preview.
 */
function toStremioMetaItem(kitsuItem) {
    if (!kitsuItem || !kitsuItem.attributes) return null;

    const attrs = kitsuItem.attributes;
    const id = `kitsu:${kitsuItem.id}`;

    // Kitsu fornisce vari titoli (en, en_jp, ja_jp). Scegliamo user-friendly.
    const title = attrs.titles.en || attrs.titles.en_jp || attrs.canonicalTitle;
    const year = attrs.startDate ? attrs.startDate.split('-')[0] : '';

    return {
        id,
        type: 'anime',
        name: title,
        poster: attrs.posterImage ? attrs.posterImage.original : null,
        background: attrs.coverImage ? attrs.coverImage.original : null,
        posterShape: 'regular',
        description: attrs.synopsis,
        releaseInfo: year,
        imdbRating: attrs.averageRating ? (parseFloat(attrs.averageRating) / 10).toFixed(1) : null
    };
}

/**
 * Fetch cataloghi Anime da Kitsu con Offset basato su skip.
 * Kitsu supporta direttamente l'offset, a differenza delle pagine di TMDB.
 */
async function fetchKitsuCatalog(endpoint, skip = 0, customParams = {}) {
    try {
        const params = {
            'page[limit]': ITEMS_PER_PAGE, // Kitsu Max is 20
            'page[offset]': skip,
            ...customParams
        };

        const res = await kitsuClient.get(endpoint, { params });

        let items = [];
        if (res.data && res.data.data) {
            items = res.data.data.map(toStremioMetaItem).filter(i => i !== null);
        }

        return items;
    } catch (err) {
        console.error(`Errore Kitsu Catalog (${endpoint}):`, err.message);
        return [];
    }
}

/**
 * Fetch Meta completo (utile per MetaHandler di Stremio)
 * Manca in questo boilerplate l'elenco degli episodi (si può fare un'altra query interna a 'anime_id/episodes')
 */
async function getKitsuMetaDetails(id) {
    const kitsuId = id.replace('kitsu:', '');
    try {
        const res = await kitsuClient.get(`/anime/${kitsuId}`);
        const item = res.data.data;
        const meta = toStremioMetaItem(item);

        if (meta && item.attributes) {
            meta.genres = []; // Richiede side-loading 'categories' in Kitsu, saltato per brevità
            if (item.attributes.youtubeVideoId) {
                meta.trailers = [{ source: item.attributes.youtubeVideoId, type: 'Trailer' }];
            }
        }
        return meta;
    } catch (err) {
        console.error("Errore Kitsu Meta:", err.message);
        return null;
    }
}

module.exports = {
    fetchKitsuCatalog,
    getKitsuMetaDetails
};
