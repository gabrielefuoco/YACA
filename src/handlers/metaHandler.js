const { getTmdbMetaDetails } = require('../clients/tmdb');
const { getKitsuMetaDetails } = require('../clients/kitsu');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');
const UserConfig = require('../models/UserConfig');

/**
 * Gestisce la richiesta di metadati dettagliati quando l'utente clicca su un titolo
 */
async function metaHandler(args, userUuid) {
    try {
        const { type, id } = args;

        const userConfig = await UserConfig.findOne({ uuid: userUuid });
        if (!userConfig) throw new Error("Utente non trovato");

        const tmdbApiKey = userConfig.apiKeys?.tmdb;
        if (!tmdbApiKey) throw new Error("TMDB API key mancante");
        let meta = null;

        // Caso 1: È un ID di Kitsu (Anime)
        if (id.startsWith('kitsu:')) {
            meta = await getKitsuMetaDetails(id);
        }

        // Caso 2: È un ID di TMDB (Film o Serie già mappati dai nostri cataloghi custom)
        else if (id.startsWith('tmdb:')) {
            meta = await getTmdbMetaDetails(tmdbApiKey, id, type);
        }

        // Caso 3: È un ID standard IMDB di Stremio (es. aprendo dalla home nativa)
        else if (id.startsWith('tt')) {
            // Dobbiamo tradurlo in TMDB
            const tmdbMap = await translateImdbToTmdb(id, tmdbApiKey);
            if (tmdbMap) {
                meta = await getTmdbMetaDetails(tmdbApiKey, tmdbMap.id, tmdbMap.type);
            }
        }

        if (meta) {
            // Forziamo l'ID a quello originariamente richiesto per compiacere l'SDK di Stremio
            meta.id = id;
            return { meta };
        }

        return { meta: null };

    } catch (err) {
        console.error("Errore Meta Handler:", err.message);
        return { meta: null };
    }
}

module.exports = { metaHandler };
