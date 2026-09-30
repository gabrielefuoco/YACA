const { createAxiosClient } = require('../utils/axiosClient');
const { createTmdbClient } = require('./tmdb');
const { rateLimitedMapFiltered } = require('../utils/rateLimiter');


const traktClient = createAxiosClient('https://api.trakt.tv', {
    headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID
    }
});

// LOCK: Gestione dei refresh in corso per evitare race conditions (invalid_grant)
const ongoingRefreshes = new Map();

const tmdbEnrichClient = createTmdbClient(process.env.TMDB_API_KEY);

/**
 * Rigenera i token Trakt usando il refresh_token.
 *
 * NOTA CRITICA SUL REFRESH TOKEN TRAKT:
 * Il refresh token di Trakt è STRICT SINGLE-USE (monouso).
 * Ogni operazione di refresh genera una nuova coppia di token e invalida
 * immediatamente il refresh token precedente. Riusare un refresh token già
 * inviato o consumato comporta l'errore `invalid_grant: session not found`
 * e invalida l'intera sessione utente, richiedendo una nuova autorizzazione manuale.
 *
 * @param {string} refreshToken - Il refresh_token corrente
 * @returns {Promise<{access_token: string, refresh_token: string, expires_at?: Date}|null>} I nuovi token, o null se fallito
 */
async function refreshTraktTokens(refreshToken, options = {}) {
    const throwOnError = typeof options === 'boolean' ? options : !!options?.throwOnError;
    const clientId = process.env.TRAKT_CLIENT_ID;
    const clientSecret = process.env.TRAKT_CLIENT_SECRET;
    if (!clientId || !clientSecret || !refreshToken) return null;

    try {
        const res = await traktClient.post('/oauth/token', {
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
            grant_type: 'refresh_token'
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });

        if (res.data && res.data.access_token && res.data.refresh_token) {
            const tokenResult = {
                access_token: res.data.access_token,
                refresh_token: res.data.refresh_token
            };
            if (res.data.expires_in || res.data.created_at) {
                const createdAtSec = res.data.created_at || Math.floor(Date.now() / 1000);
                const expiresInSec = res.data.expires_in || 7776000;
                tokenResult.expires_at = new Date((createdAtSec + expiresInSec) * 1000);
            }
            return tokenResult;
        }
        return null;
    } catch (err) {
        console.error('Trakt token refresh failed:', err.response?.data || err.message);
        if (throwOnError) throw err;
        return null;
    }
}

/**
 * Scambia il device code o authorization code per ottenere i token Trakt e calcola traktExpiresAt.
 *
 * NOTA CRITICA: Il refresh token di Trakt è STRICT SINGLE-USE. Riusarlo invalida la sessione.
 *
 * @param {string} code - Il device_code o authorization code
 * @param {string} [userId] - ID opzionale utente per persistenza automatica
 * @returns {Promise<{access_token: string, refresh_token: string, expires_at: Date}|null>}
 */
async function exchangeTraktCode(code, userId = null) {
    const clientId = process.env.TRAKT_CLIENT_ID;
    const clientSecret = process.env.TRAKT_CLIENT_SECRET;
    if (!clientId || !clientSecret || !code) return null;

    try {
        const res = await traktClient.post('/oauth/device/token', {
            code,
            client_id: clientId,
            client_secret: clientSecret
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });

        if (res.data && res.data.access_token && res.data.refresh_token) {
            const createdAtSec = res.data.created_at || Math.floor(Date.now() / 1000);
            const expiresInSec = res.data.expires_in || 7776000;
            const expiresAt = new Date((createdAtSec + expiresInSec) * 1000);
            const tokenResult = {
                access_token: res.data.access_token,
                refresh_token: res.data.refresh_token,
                expires_at: expiresAt,
                expires_in: res.data.expires_in,
                created_at: res.data.created_at
            };
            if (userId) {
                await syncTraktTokensToDb(userId, tokenResult.access_token, tokenResult.refresh_token, expiresAt);
            }
            return tokenResult;
        }
        return null;
    } catch (err) {
        console.error('Trakt token exchange failed:', err.response?.data || err.message);
        return null;
    }
}

/**
 * Aggiorna i token Trakt nel database MongoDB dell'utente.
 *
 * NOTA CRITICA SUL REFRESH TOKEN TRAKT:
 * Il refresh token di Trakt è STRICT SINGLE-USE.
 * Ogni operazione di refresh invalida immediatamente il token precedente;
 * riusare un refresh token già consumato comporta l'errore `invalid_grant: session not found`
 * e invalida l'intera sessione utente, richiedendo una nuova autorizzazione manuale.
 *
 * @param {string} userId - ID univoco dell'utente
 * @param {string} newAccessToken - Il nuovo access token Trakt
 * @param {string} newRefreshToken - Il nuovo refresh token Trakt
 * @param {Date|string|number} [expiresAt] - Data o timestamp di scadenza del token (traktExpiresAt)
 * @returns {Promise<boolean>} Vero se aggiornato correttamente
 */
async function syncTraktTokensToDb(userId, newAccessToken, newRefreshToken, expiresAt) {
    if (!userId) return false;

    try {
        const UserAccount = require('../db/models/UserAccount');
        const updateSet = {
            'apiKeys.trakt': newAccessToken,
            'apiKeys.traktRefreshToken': newRefreshToken
        };
        if (expiresAt) {
            updateSet['apiKeys.traktExpiresAt'] = new Date(expiresAt);
        }
        await UserAccount.findOneAndUpdate(
            { userId },
            { $set: updateSet },
            { returnDocument: 'after' }
        );
        console.log(`Trakt auto-refresh: token aggiornati nel DB per l'utente ${userId}.`);
        return true;
    } catch (err) {
        console.error(`Trakt auto-refresh: errore salvataggio nel DB per ${userId}:`, err.message);
        return false;
    }
}

/**
 * Rigenera i token Trakt gestendo le race conditions (LOCK) se più richieste
 * falliscono simultaneamente. Restituisce i token e si assicura che il DB
 * venga aggiornato solo dal primo processo.
 *
 * GUARDIA ANTI-RIUSO (SINGLE-USE):
 * Il refresh token di Trakt è strict single-use. Se il refresh fallisce (errore, timeout),
 * il token non deve mai più essere ritentato: lo stato viene persistito in DB come
 * 'requires_reauth'.
 *
 * @param {string} userId - ID univoco dell'utente
 * @param {string} refreshToken - Il refresh_token corrente
 * @returns {Promise<{access_token: string, refresh_token: string, expires_at?: Date}|null>}
 */
async function smartTraktRefresh(userId, refreshToken) {
    if (!userId || !refreshToken) return null;

    let UserAccount;
    try {
        UserAccount = require('../db/models/UserAccount');
    } catch (_e) {}

    // 1. Controllo stato persistito in DB: se richiede già ri-autorizzazione, non tentare
    if (UserAccount && typeof UserAccount.findOne === 'function') {
        try {
            const query = UserAccount.findOne({ userId });
            const user = query && typeof query.lean === 'function'
                ? await query.lean()
                : await query;

            if (user?.traktStatus?.status === 'requires_reauth') {
                console.warn(`[Trakt (smart)] Sessione compromessa per ${userId}: richiede ri-autorizzazione manuale. Refresh annullato.`);
                return null;
            }

            // Lock distribuito/persistito in DB
            if (user?.traktStatus?.refreshInProgress) {
                const lockTime = user.traktStatus.refreshLockedAt ? new Date(user.traktStatus.refreshLockedAt).getTime() : 0;
                if (Date.now() - lockTime < 30000) {
                    console.log(`[Trakt (smart)] Refresh già in corso (DB lock) per l'utente ${userId}...`);
                    if (ongoingRefreshes.has(userId)) {
                        return await ongoingRefreshes.get(userId);
                    }
                    return null;
                }
            }
        } catch (_dbErr) {}
    }

    if (ongoingRefreshes.has(userId)) {
        console.log(`Trakt (smart): refresh già in corso in-process per l'utente ${userId}, attendo il risultato...`);
        return await ongoingRefreshes.get(userId);
    }

    // 2. Acquisisci lock persistito nel DB
    if (UserAccount && typeof UserAccount.updateOne === 'function') {
        try {
            await UserAccount.updateOne(
                { userId },
                { $set: { 'traktStatus.refreshInProgress': true, 'traktStatus.refreshLockedAt': new Date() } }
            );
        } catch (_lockErr) {}
    }

    console.log(`Trakt (smart): avvio procedura di refresh per ${userId}...`);
    const refreshPromise = (async () => {
        try {
            const newTokens = await refreshTraktTokens(refreshToken, { throwOnError: true });
            if (newTokens && newTokens.access_token) {
                await syncTraktTokensToDb(userId, newTokens.access_token, newTokens.refresh_token, newTokens.expires_at);
                if (UserAccount && typeof UserAccount.updateOne === 'function') {
                    try {
                        await UserAccount.updateOne(
                            { userId },
                            {
                                $set: {
                                    'traktStatus.status': 'ok',
                                    'traktStatus.refreshInProgress': false,
                                    'traktStatus.lastSuccess': new Date(),
                                    'traktStatus.lastError': null,
                                    'traktStatus.lastErrorAt': null
                                }
                            }
                        );
                    } catch (_stErr) {}
                }
                return newTokens;
            } else {
                // Il refresh token single-use è stato consumato o rigettato da Trakt (risposta senza token)
                console.warn(`[Trakt (smart)] Refresh fallito per ${userId}: risposta senza token validi. Imposto stato 'requires_reauth'.`);
                await markRequiresReauth(userId, UserAccount, 'Refresh fallito: risposta non valida. Richiede ri-autorizzazione.');
                return null;
            }
        } catch (err) {
            const { status, reason } = classifyRefreshError(err);
            if (status === 'degraded') {
                console.warn(`[Trakt (smart)] Errore di rete temporaneo durante refresh per ${userId} (${reason}). Imposto stato 'degraded'.`);
                await markDegraded(userId, UserAccount, reason);
            } else {
                console.warn(`[Trakt (smart)] Refresh fallito o timeout per ${userId} (${reason}). Imposto stato 'requires_reauth'.`);
                await markRequiresReauth(userId, UserAccount, reason);
            }
            return null;
        } finally {
            ongoingRefreshes.delete(userId);
        }
    })();

    ongoingRefreshes.set(userId, refreshPromise);
    return await refreshPromise;
}

/**
 * Classifica l'errore avvenuto durante il refresh del token Trakt.
 * Distingue tra:
 * - "Richiesta inviata, risposta persa" (timeout o errore server) -> 'requires_reauth' (token single-use potenzialmente consumato)
 * - "Richiesta mai partita" (ECONNREFUSED, ENOTFOUND, nessun err.request) -> 'degraded' (ritentabile)
 *
 * @param {Error|any} err
 * @returns {{status: 'requires_reauth'|'degraded', reason: string}}
 */
function classifyRefreshError(err) {
    if (!err) {
        return {
            status: 'requires_reauth',
            reason: 'Refresh fallito: errore sconosciuto durante il refresh.'
        };
    }

    const code = String(err.code || '');
    const msg = String(err.message || '');

    // 1. Timeout: la richiesta è partita ma la risposta non è mai arrivata (o è andata persa).
    // In questo caso il token single-use potrebbe essere stato consumato dal server Trakt.
    const isTimeout = code === 'ECONNABORTED' ||
                      code === 'ETIMEDOUT' ||
                      /timeout/i.test(msg);

    if (isTimeout) {
        return {
            status: 'requires_reauth',
            reason: `Refresh fallito: timeout durante il refresh (${msg || code}). Richiede ri-autorizzazione.`
        };
    }

    // 2. Richiesta mai inviata / connessione fallita prima di raggiungere Trakt:
    // DNS fallito (ENOTFOUND), connessione rifiutata (ECONNREFUSED), rete locale non raggiungibile,
    // oppure nessun err.request (errore nell'inizializzazione prima del socket).
    const isConnectionError = code === 'ECONNREFUSED' ||
                              code === 'ENOTFOUND' ||
                              code === 'ENETUNREACH' ||
                              code === 'EHOSTUNREACH' ||
                              code === 'EAI_AGAIN' ||
                              /ECONNREFUSED|ENOTFOUND|ENETUNREACH|EHOSTUNREACH/i.test(msg);

    const hasNoRequest = !err.request && !err.response;

    if (isConnectionError || hasNoRequest) {
        return {
            status: 'degraded',
            reason: `Errore di rete temporaneo (${msg || code || 'richiesta non inviata'}). Ritentabile.`
        };
    }

    // 3. Risposta ricevuta (err.response) con errore (es. 400 invalid_grant, 401, 403)
    // o altro errore post-invio: token consumato o rigettato da Trakt -> requires_reauth
    const detail = err.response?.data?.error || err.response?.data || msg || code || 'richiesta respinta';
    return {
        status: 'requires_reauth',
        reason: `Refresh fallito (${detail}). Richiede ri-autorizzazione.`
    };
}

async function updateTraktStatus(userId, UserAccount, status, errorMsg) {
    if (!UserAccount) return;
    const update = {
        'traktStatus.status': status,
        'traktStatus.refreshInProgress': false,
        'traktStatus.lastError': errorMsg,
        'traktStatus.lastErrorAt': new Date()
    };
    try {
        if (typeof UserAccount.updateOne === 'function') {
            await UserAccount.updateOne({ userId }, { $set: update });
        } else if (typeof UserAccount.findOneAndUpdate === 'function') {
            await UserAccount.findOneAndUpdate({ userId }, { $set: update });
        }
    } catch (_err) {}
}

async function markRequiresReauth(userId, UserAccount, errorMsg) {
    return updateTraktStatus(userId, UserAccount, 'requires_reauth', errorMsg);
}

async function markDegraded(userId, UserAccount, errorMsg) {
    return updateTraktStatus(userId, UserAccount, 'degraded', errorMsg);
}

/**
 * Heartbeat diagnostico per verificare lo stato della connessione Trakt.
 * Esegue GET /sync/last_activities e aggiorna traktStatus in DB.
 *
 * @param {string} userId - ID univoco dell'utente
 * @param {string} [token] - Token OAuth opzionale
 * @returns {Promise<{connected: boolean, status: string, lastChecked: Date, lastSuccess?: Date, lastError?: string, data?: any}>}
 */
async function checkTraktHeartbeat(userId, token = null) {
    let UserAccount;
    try {
        UserAccount = require('../db/models/UserAccount');
    } catch (_e) {}

    let user = null;
    if (UserAccount && typeof UserAccount.findOne === 'function') {
        try {
            const query = UserAccount.findOne({ userId });
            user = query && typeof query.lean === 'function'
                ? await query.lean()
                : await query;
        } catch (_e) {}
    }

    const traktToken = token || user?.apiKeys?.trakt;
    if (!traktToken) {
        const result = { connected: false, status: 'not_configured', lastChecked: new Date() };
        if (UserAccount) {
            const update = { 'traktStatus.status': 'not_configured', 'traktStatus.lastChecked': new Date() };
            if (typeof UserAccount.updateOne === 'function') await UserAccount.updateOne({ userId }, { $set: update });
            else if (typeof UserAccount.findOneAndUpdate === 'function') await UserAccount.findOneAndUpdate({ userId }, { $set: update });
        }
        return result;
    }

    try {
        const res = await traktClient.get('/sync/last_activities', {
            headers: {
                'Authorization': `Bearer ${traktToken}`,
                'trakt-api-version': '2',
                'trakt-api-key': process.env.TRAKT_CLIENT_ID
            },
            timeout: 8000
        });

        const now = new Date();
        const update = {
            'traktStatus.status': 'ok',
            'traktStatus.lastChecked': now,
            'traktStatus.lastSuccess': now,
            'traktStatus.lastError': null,
            'traktStatus.lastErrorAt': null
        };
        if (UserAccount) {
            if (typeof UserAccount.updateOne === 'function') await UserAccount.updateOne({ userId }, { $set: update });
            else if (typeof UserAccount.findOneAndUpdate === 'function') await UserAccount.findOneAndUpdate({ userId }, { $set: update });
        }

        return {
            connected: true,
            status: 'ok',
            lastChecked: now,
            lastSuccess: now,
            data: res.data
        };
    } catch (err) {
        const now = new Date();
        const statusCode = err.response?.status;
        const isAuthError = (statusCode === 401 || statusCode === 403);
        const newStatus = isAuthError ? 'requires_reauth' : 'degraded';
        const errorMsg = err.response?.data?.error || err.message || 'Errore sincronizzazione Trakt';

        console.warn(`[Trakt Heartbeat] Degrado rilevato per utente ${userId}: status=${statusCode}, err=${errorMsg}`);

        const update = {
            'traktStatus.status': newStatus,
            'traktStatus.lastChecked': now,
            'traktStatus.lastError': errorMsg,
            'traktStatus.lastErrorAt': now
        };
        if (UserAccount) {
            if (typeof UserAccount.updateOne === 'function') await UserAccount.updateOne({ userId }, { $set: update });
            else if (typeof UserAccount.findOneAndUpdate === 'function') await UserAccount.findOneAndUpdate({ userId }, { $set: update });
        }

        return {
            connected: true,
            status: newStatus,
            lastChecked: now,
            lastError: errorMsg,
            lastErrorAt: now
        };
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
            const tmdbenrich = await tmdbEnrichClient.get(`/${isMovie ? 'movie' : 'tv'}/${tmdbId}`, {
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
                baseMeta.behaviorHints = { ...baseMeta.behaviorHints, backgroundBlur: `https://wsrv.nl/?url=${encodeURIComponent(bgUrl)}&blur=20` };
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
    if (endpoint === 'popular_movies') {
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

    // === PROACTIVE REFRESH: se traktExpiresAt <= 1h ===
    const PROACTIVE_WINDOW_MS = 60 * 60 * 1000;
    const expiresAt = refreshContext?.userConfig?.apiKeys?.traktExpiresAt;
    const refreshToken = refreshContext?.userConfig?.apiKeys?.traktRefreshToken;
    const userId = refreshContext?.userConfig?.userId;
    if (expiresAt && refreshToken && userId) {
        const expMs = new Date(expiresAt).getTime();
        if (!isNaN(expMs) && (expMs - Date.now() <= PROACTIVE_WINDOW_MS)) {
            console.log(`Trakt: token in scadenza entro 1h (${new Date(expiresAt).toISOString()}), refresh proattivo...`);
            try {
                const newTokens = await smartTraktRefresh(userId, refreshToken);
                if (newTokens?.access_token) {
                    traktToken = newTokens.access_token;
                    refreshContext.userConfig.apiKeys.trakt = newTokens.access_token;
                    refreshContext.userConfig.apiKeys.traktRefreshToken = newTokens.refresh_token;
                    if (newTokens.expires_at) {
                        refreshContext.userConfig.apiKeys.traktExpiresAt = newTokens.expires_at;
                    }
                }
            } catch (_err) {}
        }
    }

    try {
        const results = await executeTraktRequest(endpoint, page, traktToken);
        return await deduplicateAndEnrich(results, tmdbApiKey);
    } catch (err) {
        const status = err.response?.status;

        // === AUTO-REFRESH: se 401 o 403 e abbiamo il contesto per il refresh ===
        if ((status === 401 || status === 403) && refreshContext?.userConfig?.apiKeys?.traktRefreshToken) {
            const userId = refreshContext.userConfig.userId;
            
            try {
                const newTokens = await smartTraktRefresh(userId, refreshContext.userConfig.apiKeys.traktRefreshToken);

                if (newTokens && newTokens.access_token) {
                    console.log(`Trakt: auto-refresh/lock risolto per ${endpoint}. Riprovo la richiesta.`);
                    // Riprova la richiesta con il nuovo token
                    try {
                        const retryResults = await executeTraktRequest(endpoint, page, newTokens.access_token);
                        return await deduplicateAndEnrich(retryResults, tmdbApiKey);
                    } catch (retryErr) {
                        console.error(`Trakt: retry fallito dopo refresh (${endpoint}):`, retryErr.response?.data || retryErr.message);
                        return [];
                    }
                } else {
                    console.error(`Trakt: impossibile ottenere nuovi token per ${endpoint}.`);
                    return [];
                }
            } catch (refreshErr) {
                console.error(`Trakt: errore durante auto-refresh per ${endpoint}:`, refreshErr.message);
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

    // Use rate-limited batching to avoid TMDB 429 rate limits
    const enrichedItems = await rateLimitedMapFiltered(dedupedResults, r => enhanceTraktItem(r, tmdbApiKey), { batchSize: 5, delayMs: 200 });
    return enrichedItems;
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



module.exports = {
    fetchTraktCatalog,
    refreshTraktTokens,
    syncTraktTokensToDb,
    syncTraktRatings,
    traktClient,
    smartTraktRefresh,
    exchangeTraktCode,
    checkTraktHeartbeat,
    classifyRefreshError,
    markRequiresReauth,
    markDegraded
};
