const Trakt = require('trakt.tv');

// Configura il client Trakt base
const getTraktClient = (userToken = null) => {
    const options = {
        client_id: process.env.TRAKT_CLIENT_ID,
        client_secret: process.env.TRAKT_CLIENT_SECRET,
        debug: false
    };

    const trakt = new Trakt(options);

    // Se l'utente ha fornito un token nella pagina di config UUID, iniettalo
    if (userToken) {
        trakt.import_token(userToken).then(newTokens => {
            // Token importato
        });
    }

    return trakt;
};

// Funzione base per trasformare item Trakt in Stremio Meta Preview.
// ATTENZIONE: Trakt fornisce IDs (tmdb, imdb) ma pochissimi metadati visuali (no poster).
// Nel proxy di produzione, una volta presi gli IDs da trakt bisognerebbe passare da TMDB per arricchirli.
// Per brevità in questo proof-of-concept ritorniamo l'oggetto base Stremio.
function toStremioMetaItem(traktItem) {
    if (!traktItem) return null;

    // traktItem = { movie: {...} } or { show: {...} }
    const isMovie = !!traktItem.movie;
    const item = traktItem.movie || traktItem.show;

    if (!item || !item.ids) return null;

    // Favorisce TMDB o IMDB per il meta handler successivo
    const id = item.ids.tmdb ? `tmdb:${item.ids.tmdb}` : `tt${item.ids.imdb}`;

    return {
        id,
        type: isMovie ? 'movie' : 'series',
        name: item.title,
        releaseInfo: item.year ? item.year.toString() : '',
        description: item.overview || "Nessuna sinossi disponibile da Trakt (Richiede arricchimento TMDB)",
        // I Poster solitamente in Trakt non ci sono tramite API base, usiamo placeholders o delegare a tmdb nel catalog handler.
        poster: `https://via.placeholder.com/300x450?text=${encodeURIComponent(item.title)}`,
        posterShape: 'regular'
    };
}

async function fetchTraktCatalog(endpoint, skip = 0, userToken = null) {
    try {
        const trakt = getTraktClient(userToken);
        const page = Math.floor(skip / 10) + 1; // Trakt default pagination limit, es 10.

        let results = [];

        if (endpoint === 'trending_movies') {
            results = await trakt.movies.trending({ page, limit: 20 });
        } else if (endpoint === 'trending_shows') {
            results = await trakt.shows.trending({ page, limit: 20 });
        } else if (endpoint === 'recommendations_movies' && userToken) {
            results = await trakt.recommendations.movies({ limit: 20 });
        }

        return results.map(r => toStremioMetaItem(r)).filter(i => i !== null);

    } catch (err) {
        console.error("Errore Trakt Catalog:", err.message);
        return [];
    }
}

module.exports = { fetchTraktCatalog };
