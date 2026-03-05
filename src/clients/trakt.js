const { createAxiosInstance } = require('../utils/httpClient');
const axios = require('axios');
const UserConfig = require('../models/UserConfig');
const { updateStremioAddonCollection } = require('../utils/stremioAddonSync');

const traktClient = createAxiosInstance('https://api.trakt.tv', {
    headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID
    }
});

/**
 * Rigenera i token Trakt usando il refresh_token.
 * @param {string} refreshToken - Il refresh_token corrente
 * @returns {Promise<{access_token: string, refresh_token: string}|null>} I nuovi token, o null se fallito
 */
async function refreshTraktTokens(refreshToken) {
    const clientId = process.env.TRAKT_CLIENT_ID;
    const clientSecret = process.env.TRAKT_CLIENT_SECRET;
    if (!clientId || !clientSecret || !refreshToken) return null;

    try {
        const res = await axios.post('https://api.trakt.tv/oauth/token', {
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
            grant_type: 'refresh_token'
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });

        if (res.data && res.data.access_token && res.data.refresh_token) {
            return { access_token: res.data.access_token, refresh_token: res.data.refresh_token };
        }
        return null;
    } catch (err) {
        console.error('Trakt token refresh failed:', err.response?.data || err.message);
        return null;
    }
}

/**
 * Aggiorna i token Trakt nel database MongoDB dell'utente.
 * @param {string} userId - ID univoco dell'utente
 * @param {string} newAccessToken - Il nuovo access token Trakt
 * @param {string} newRefreshToken - Il nuovo refresh token Trakt
 * @returns {Promise<boolean>} Vero se aggiornato correttamente
 */
async function syncTraktTokensToDb(userId, newAccessToken, newRefreshToken) {
    if (!userId) return false;

    try {
        const User = require('../db/models/User');
        await User.findOneAndUpdate(
            { userId },
            {
                $set: {
                    'apiKeys.trakt': newAccessToken,
                    'apiKeys.traktRefreshToken': newRefreshToken
                }
            }
        );
        console.log(`Trakt auto-refresh: token aggiornati nel DB per l'utente ${userId}.`);
        return true;
    } catch (err) {
        console.error(`Trakt auto-refresh: errore salvataggio nel DB per ${userId}:`, err.message);
        return false;
    }
}

/**
 * Trasforma l'item Trakt nel formato Meta Stremio e recupera Poster/Sfondo da TMDB se necessario.
 * @param {Object} traktItem - L'item raw da Trakt
 * @param {string} [tmdbApiKey] - Chiave TMDB dell'utente per l'arricchimento immagini
 */
async function enhanceTraktItem(traktItem, tmdbApiKey) {
    if (!traktItem) return null;

    // A seconda dell'endpoint, la struttura cambia. Esempio watchlist:
    // { "type": "movie", "movie": { "title": "Batman", "year": 2022, "ids": {"tmdb": 414906} } }
    const isMovie = traktItem.type === 'movie' || !!traktItem.movie;
    const type = isMovie ? 'movie' : 'series';
    const item = traktItem.movie || traktItem.show || traktItem;

    if (!item || !item.ids) return null;

    const tmdbId = item.ids.tmdb;
    const imdbId = item.ids.imdb;

    // L'ID preferito per la compatibilità con addon di streaming è l'IMDB ID (tt*)
    // Per Torrentio è FONDAMENTALE usare l'IMDB ID (ttXXXX) se disponibile!
    if (!tmdbId && !imdbId) return null;
    const stremioId = imdbId || (tmdbId ? `tmdb:${tmdbId}` : null);

    const baseMeta = {
        id: stremioId,
        type: type,
        name: item.title || 'Titolo sconosciuto',
        releaseInfo: item.year ? item.year.toString() : '',
        description: item.overview || "Metadati completi al click",
        posterShape: 'poster'
    };

    // Aggiunge il rating dell'utente se presente (da endpoint ratings)
    if (traktItem.rating) {
        baseMeta.imdbRating = traktItem.rating.toFixed(1);
    }

    // Arricchimento immagini via TMDB - usa la chiave dell'utente (fallback a env globale)
    const enrichKey = tmdbApiKey || process.env.TMDB_API_KEY;
    if (tmdbId && enrichKey) {
        try {
            const tmdbenrich = await axios.get(`https://api.themoviedb.org/3/${isMovie ? 'movie' : 'tv'}/${tmdbId}`, {
                params: { api_key: enrichKey, language: 'it-IT' },
                timeout: 5000
            });
            if (tmdbenrich.data.poster_path) {
                baseMeta.poster = `https://image.tmdb.org/t/p/w500${tmdbenrich.data.poster_path}`;
            }
            if (tmdbenrich.data.backdrop_path) {
                const bgUrl = `https://image.tmdb.org/t/p/original${tmdbenrich.data.backdrop_path}`;
                baseMeta.background = bgUrl;
                // Add blurred background hint for clients that support it
                const host = process.env.HOST_URL || 'http://localhost:7000';
                baseMeta.behaviorHints = { ...baseMeta.behaviorHints, backgroundBlur: `${host}/blur?url=${encodeURIComponent(bgUrl)}` };
            }
            // Fallback linguistico: se overview Trakt assente, usa TMDB italiano
            if (!baseMeta.description || baseMeta.description === "Metadati completi al click") {
                if (tmdbenrich.data.overview) {
                    baseMeta.description = tmdbenrich.data.overview;
                }
            }
        } catch (_e) { /* Ignora l'arricchimento se fallisce per rate limit */ }
    }

    if (!baseMeta.poster) {
        baseMeta.poster = `https://via.placeholder.com/300x450/1c1c24/8a5aeb?text=${encodeURIComponent(baseMeta.name)}`;
    }

    return baseMeta;
}

/**
 * Esegue la chiamata API Trakt per un endpoint specifico.
 * @param {string} endpoint - Tipo di catalogo Trakt
 * @param {number} page - Numero di pagina
 * @param {string} [traktToken] - Token OAuth Trakt
 * @returns {Promise<Array>} Risultati raw da Trakt
 */
async function executeTraktRequest(endpoint, page, traktToken) {
    let results = [];

    // === ENDPOINT PUBBLICI (Non richiedono username) ===
    if (endpoint === 'trending_movies') {
        const res = await traktClient.get('/movies/trending', { params: { page, limit: 20 } });
        results = res.data;
    }
    else if (endpoint === 'trending_shows') {
        const res = await traktClient.get('/shows/trending', { params: { page, limit: 20 } });
        results = res.data;
    }
    else if (endpoint === 'popular_movies') {
        const res = await traktClient.get('/movies/popular', { params: { page, limit: 20 } });
        results = res.data.map(m => ({ type: 'movie', movie: m }));
    }
    else if (endpoint === 'popular_shows') {
        const res = await traktClient.get('/shows/popular', { params: { page, limit: 20 } });
        results = res.data.map(s => ({ type: 'show', show: s }));
    }

    // === ENDPOINT UTENTE (Richiedono OAuth Token) ===
    const authConfig = traktToken ? { headers: { 'Authorization': `Bearer ${traktToken}` } } : {};

    if (endpoint === 'watchlist_movies' && traktToken) {
        const res = await traktClient.get(`/users/me/watchlist/movies`, { ...authConfig, params: { sort: 'added', limit: 20, page } });
        results = res.data;
    }
    else if (endpoint === 'watchlist_shows' && traktToken) {
        const res = await traktClient.get(`/users/me/watchlist/shows`, { ...authConfig, params: { sort: 'added', limit: 20, page } });
        results = res.data;
    }
    else if (endpoint === 'history_movies' && traktToken) {
        const res = await traktClient.get(`/users/me/history/movies`, { ...authConfig, params: { limit: 20, page } });
        results = res.data;
    }
    else if (endpoint === 'history_shows' && traktToken) {
        const res = await traktClient.get(`/users/me/history/shows`, { ...authConfig, params: { limit: 20, page } });
        results = res.data;
    }
    else if (endpoint === 'ratings_movies' && traktToken) {
        const res = await traktClient.get(`/users/me/ratings/movies`, { ...authConfig, params: { limit: 20, page } });
        results = res.data;
    }
    else if (endpoint === 'ratings_shows' && traktToken) {
        const res = await traktClient.get(`/users/me/ratings/shows`, { ...authConfig, params: { limit: 20, page } });
        results = res.data;
    }
    else if (endpoint === 'recommendations_movies' && traktToken) {
        const res = await traktClient.get(`/recommendations/movies`, { ...authConfig, params: { limit: 20, page } });
        results = res.data.map(m => ({ type: 'movie', movie: m }));
    }
    else if (endpoint === 'recommendations_shows' && traktToken) {
        const res = await traktClient.get(`/recommendations/shows`, { ...authConfig, params: { limit: 20, page } });
        results = res.data.map(s => ({ type: 'show', show: s }));
    }
    else if (endpoint === 'favorites_movies' && traktToken) {
        const res = await traktClient.get(`/users/me/favorites/movies`, { ...authConfig, params: { limit: 20, page } });
        results = res.data.map(m => ({ type: 'movie', movie: m }));
    }
    else if (endpoint === 'favorites_shows' && traktToken) {
        const res = await traktClient.get(`/users/me/favorites/shows`, { ...authConfig, params: { limit: 20, page } });
        results = res.data.map(s => ({ type: 'show', show: s }));
    }
    else if (endpoint === 'favorites' && traktToken) {
        const res = await traktClient.get(`/users/me/lists/favorites/items`, { ...authConfig, params: { limit: 20, page } });
        results = res.data;
    }

    return results;
}

/**
 * Recupera i cataloghi Trakt in base al Trakt Token OAuth o agli endpoint pubblici.
 * Supporta auto-refresh del token: se riceve 401, rigenera i token e aggiorna Stremio.
 * @param {string} endpoint - Tipo di catalogo Trakt da caricare
 * @param {number} skip - Offset per la paginazione Stremio
 * @param {string} [traktToken] - Token OAuth Trakt dell'utente
 * @param {string} [tmdbApiKey] - Chiave TMDB dell'utente per arricchire i poster
 * @param {object} [refreshContext] - Contesto per il refresh automatico
 * @param {object} [refreshContext.userConfig] - Configurazione utente decodificata
 * @param {string} [refreshContext.hostUrl] - URL base del server
 */
async function fetchTraktCatalog(endpoint, skip = 0, traktToken = null, tmdbApiKey = null, refreshContext = null) {
    if (!process.env.TRAKT_CLIENT_ID) {
        console.error("Missing TRAKT_CLIENT_ID in environment variables");
        return [];
    }

    const page = Math.floor(skip / 20) + 1;

    try {
        const results = await executeTraktRequest(endpoint, page, traktToken);
        return await deduplicateAndEnrich(results, tmdbApiKey);
    } catch (err) {
        const status = err.response?.status;

        // === AUTO-REFRESH: se 401 e abbiamo il contesto per il refresh ===
        if (status === 401 && refreshContext?.userConfig?.apiKeys?.traktRefreshToken) {
            console.log(`Trakt: token scaduto per ${endpoint}, tentativo di auto-refresh...`);
            const newTokens = await refreshTraktTokens(refreshContext.userConfig.apiKeys.traktRefreshToken);

            if (newTokens) {
                // Sincronizza i nuovi token su MongoDB se l'utente è stateful
                if (refreshContext?.userConfig?.userId) {
                    syncTraktTokensToDb(
                        refreshContext.userConfig.userId,
                        newTokens.access_token,
                        newTokens.refresh_token
                    ).catch(dbErr => console.error(`Trakt auto-refresh DB error (${endpoint}):`, dbErr.message));
                }

                // Riprova la richiesta con il nuovo token
                try {
                    const retryResults = await executeTraktRequest(endpoint, page, newTokens.access_token);
                    return await deduplicateAndEnrich(retryResults, tmdbApiKey);
                } catch (retryErr) {
                    console.error(`Trakt: retry fallito dopo refresh (${endpoint}):`, retryErr.response?.data || retryErr.message);
                    return [];
                }
            } else {
                console.error(`Trakt: auto-refresh fallito per ${endpoint}.`);
                return [];
            }
        }

        // Gestione errori standard
        if (status === 404) {
            console.error(`Trakt: endpoint non trovato (${endpoint})`);
        } else if (status === 401 || status === 403) {
            console.error(`Trakt: accesso negato (${endpoint}). Token scaduto o non valido.`);
        } else {
            console.error(`Errore Trakt Catalog (${endpoint}):`, err.response?.data || err.message);
        }
        return [];
    }
}

/**
 * Deduplica e arricchisce i risultati Trakt con dati TMDB.
 */
async function deduplicateAndEnrich(results, tmdbApiKey) {
    const seenIds = new Set();
    const dedupedResults = results.filter(r => {
        const item = r.movie || r.show || r;
        const id = item?.ids?.tmdb || item?.ids?.imdb;
        if (!id || seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
    });

    const enrichedItems = await Promise.all(dedupedResults.map(r => enhanceTraktItem(r, tmdbApiKey)));
    return enrichedItems.filter(i => i !== null);
}

/**
 * Sincronizza i rating su Trakt.
 * @param {string} token - OAuth Token
 * @param {Array} ratings - Array di oggetti rating [{rating: 10, movie: {ids: {imdb: "..."}}}]
 */
async function syncTraktRatings(token, ratings) {
    if (!token || !ratings.length) return;
    try {
        await traktClient.post('/sync/ratings', ratings, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log(`[TraktClient] Pushed ${ratings.length} ratings to Trakt.`);
    } catch (err) {
        console.error('[TraktClient] Error syncing ratings:', err.response?.data || err.message);
    }
}

/**
 * Sincronizza la cronologia su Trakt.
 * @param {string} token - OAuth Token
 * @param {Array} history - Array di oggetti history [{movie: {ids: {imdb: "..."}}}]
 */
async function syncTraktHistory(token, history) {
    if (!token || !history.length) return;
    try {
        await traktClient.post('/sync/history', history, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log(`[TraktClient] Pushed ${history.length} history items to Trakt.`);
    } catch (err) {
        console.error('[TraktClient] Error syncing history:', err.response?.data || err.message);
    }
}

module.exports = {
    fetchTraktCatalog,
    refreshTraktTokens,
    syncTraktTokensToDb,
    syncTraktRatings,
    syncTraktHistory
};
