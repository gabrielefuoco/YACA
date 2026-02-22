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
    const title = attrs.titles?.en || attrs.titles?.en_jp || attrs.canonicalTitle || 'Titolo sconosciuto';
    const year = attrs.startDate ? attrs.startDate.split('-')[0] : '';

    return {
        id,
        type: 'series',
        name: title,
        poster: attrs.posterImage ? attrs.posterImage.original : null,
        background: attrs.coverImage ? attrs.coverImage.original : null,
        posterShape: 'poster',
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
 * Recupera l'elenco degli episodi per un Anime e li formatta per Stremio
 */
async function fetchKitsuEpisodes(kitsuId) {
    try {
        const res = await kitsuClient.get(`/anime/${kitsuId}/episodes`, {
            params: { 'page[limit]': 200 } // Kitsu usually has max 20, up to 200 episodes. Pagination might be needed for very long anime, simplified here.
        });

        if (!res.data || !res.data.data) return [];

        return res.data.data.map(ep => {
            const attrs = ep.attributes;
            return {
                id: `kitsu:${kitsuId}:${attrs.number}`,
                title: attrs.titles?.en || attrs.titles?.en_jp || `Episodio ${attrs.number}`,
                released: attrs.airdate ? new Date(attrs.airdate).toISOString() : null,
                season: 1, // Kitsu uses seasons differently, usually mapping to season 1 for Stremio series
                episode: attrs.number,
                overview: attrs.synopsis || '',
                thumbnail: attrs.thumbnail ? attrs.thumbnail.original : null
            };
        });
    } catch (e) {
        console.error("Errore fetchKitsuEpisodes:", e.message);
        return [];
    }
}

/**
 * Fetch Meta completo (utile per MetaHandler di Stremio)
 */
async function getKitsuMetaDetails(id) {
    const kitsuId = id.replace('kitsu:', '').trim();

    // Validate kitsuId is a number
    if (!/^\d+$/.test(kitsuId)) {
        console.error(`ID Kitsu non valido: ${kitsuId}`);
        return null;
    }

    try {
        const res = await kitsuClient.get(`/anime/${kitsuId}`);
        const item = res.data.data;
        const meta = toStremioMetaItem(item);

        if (meta && item.attributes) {
            meta.genres = [];
            if (item.attributes.youtubeVideoId) {
                meta.trailers = [{ source: item.attributes.youtubeVideoId, type: 'Trailer' }];
            }
            if (item.attributes.subtype !== 'movie') {
                meta.videos = await fetchKitsuEpisodes(kitsuId);
                meta.type = 'series'; // Force Stremio to render it as a series to show the episodes grid
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
