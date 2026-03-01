const { getTmdbMetaDetails } = require('../clients/tmdb');
const { getKitsuMetaDetails } = require('../clients/kitsu');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');

/**
 * Gestisce la richiesta di metadati dettagliati quando l'utente clicca su un titolo
 */
async function metaHandler(args, userConfig) {
    try {
        const { type, id } = args;

        if (!userConfig) throw new Error("Configurazione utente mancante");

        const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
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
            // Per richieste con tmdb: ID, manteniamo l'IMDB ID risolto per compatibilità streaming
            // toStremioMetaItem preferisce già gli IMDB ID quando external_ids è disponibile
            if (id.startsWith('tmdb:') && meta.id && meta.id.startsWith('tt')) {
                // meta.id contiene l'IMDB ID risolto, teniamolo per Torrentio & co.
                // defaultVideoId va impostato solo per i film (per le serie si usa la lista episodi)
                if (meta.behaviorHints && type === 'movie') {
                    meta.behaviorHints.defaultVideoId = meta.id;
                }
            } else {
                // Per kitsu: e altri ID, forziamo l'ID originale
                meta.id = id;
            }
            return { meta };
        }

        return { meta: null };

    } catch (err) {
        console.error("Errore Meta Handler:", err.message);
        return { meta: null };
    }
}

module.exports = { metaHandler };
