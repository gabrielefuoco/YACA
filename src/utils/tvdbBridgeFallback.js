const axios = require('axios');

// LEGACY FALLBACK — Candidato per rimozione futura
// Utilizza le API di TMDB per ottenere l'ID TVDB e poi interroga Kitsu.
// Fallback lento e inaffidabile, usato solo se animeMappingStore fallisce.

async function tvdbBridgeFallback(tmdbId, tmdbSeason, tmdbEpisode, tmdbApiKey) {
    const apiKey = tmdbApiKey || process.env.TMDB_API_KEY;
    if (!apiKey) return null;

    try {
        const extRes = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids`, {
            params: { api_key: apiKey }
        });
        const tvdbId = extRes.data.tvdb_id;

        if (!tvdbId) return null;

        let kitsuId = null;

        const mapRes = await axios.get(`https://kitsu.io/api/edge/mappings`, {
            params: {
                'filter[externalSite]': 'thetvdb',
                'filter[externalId]': tvdbId,
                'include': 'item'
            }
        });

        if (mapRes.data && mapRes.data.data && mapRes.data.data.length > 0) {
            kitsuId = mapRes.data.data[0].relationships?.item?.data?.id;
        } else {
            const fallbackSites = ['thetvdb/series', 'thetvdb/season'];
            for (const site of fallbackSites) {
                const fbRes = await axios.get(`https://kitsu.io/api/edge/mappings`, {
                    params: {
                        'filter[externalSite]': site,
                        'filter[externalId]': tvdbId,
                        'include': 'item'
                    }
                });
                if (fbRes.data && fbRes.data.data && fbRes.data.data.length > 0) {
                    kitsuId = fbRes.data.data[0].relationships?.item?.data?.id;
                    if (kitsuId) break;
                }
            }
        }

        if (kitsuId) {
            // Non essendo in grado di calcolare l'offset preciso tramite Kitsu Mappings,
            // restituiamo un tentativo euristico (valido per la maggior parte delle stagioni 1)
            return {
                success: true,
                kitsuId,
                kitsuEpisode: tmdbEpisode
            };
        }

    } catch (err) {
        console.error(`[TVDB Fallback] Errore API per TMDB ${tmdbId}:`, err.message);
    }
    
    return { success: false, error: 'TVDB Fallback Fallito' };
}

module.exports = {
    tvdbBridgeFallback
};
