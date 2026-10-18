/**
 * src/library/traktFetchers.js
 *
 * Estrazione dei fatti Trakt (cronologia, voti) con supporto refresh proattivo/reattivo (Ticket 41 - Fetta 1).
 * Spostato da src/engines/hybrid/dataFetchers.js nel modulo src/library ("la libreria possiede i fatti").
 */

const { traktClient } = require('../clients/trakt');

/**
 * Fetcher generico Trakt con gestione errori e auto-refresh token.
 *
 * @param {string} endpoint Endpoint Trakt da interrogare
 * @param {string} traktToken Access token Trakt
 * @param {number} limit Numero massimo di elementi
 * @param {object|null} userObj Configurazione utente con token di refresh
 * @returns {Promise<{ items: Array, available: boolean, reason: string }>}
 */
async function safeTraktFetchDetailed(endpoint, traktToken, limit = 40, userObj = null) {
    if (!traktToken || !process.env.TRAKT_CLIENT_ID) {
        return { items: [], available: false, reason: 'credentials' };
    }

    if (userObj?.traktStatus?.status === 'requires_reauth') {
        return { items: [], available: false, reason: 'unauthorized' };
    }

    // Refresh proattivo: se apiKeys.traktExpiresAt è entro ~1 ora, rinnova prima della chiamata
    const PROACTIVE_REFRESH_WINDOW_MS = 60 * 60 * 1000;
    const expiresAt = userObj?.apiKeys?.traktExpiresAt;
    if (expiresAt && userObj?.apiKeys?.traktRefreshToken && userObj?.userId) {
        const expTime = new Date(expiresAt).getTime();
        if (!isNaN(expTime) && (expTime - Date.now() <= PROACTIVE_REFRESH_WINDOW_MS)) {
            console.log(`[safeTraktFetch] Token Trakt in scadenza entro 1h (${new Date(expiresAt).toISOString()}). Avvio refresh proattivo...`);
            const { smartTraktRefresh } = require('../clients/trakt');
            try {
                const newTokens = await smartTraktRefresh(userObj.userId, userObj.apiKeys.traktRefreshToken);
                if (newTokens && newTokens.access_token) {
                    traktToken = newTokens.access_token;
                    userObj.apiKeys.trakt = newTokens.access_token;
                    userObj.apiKeys.traktRefreshToken = newTokens.refresh_token;
                    if (newTokens.expires_at) {
                        userObj.apiKeys.traktExpiresAt = newTokens.expires_at;
                    }
                    console.log(`[safeTraktFetch] Refresh proattivo completato con successo.`);
                }
            } catch (proactiveErr) {
                console.error(`[safeTraktFetch] Refresh proattivo fallito:`, proactiveErr.message);
            }
        }
    }

    const execute = async (token) => {
        const res = await traktClient.get(endpoint, {
            headers: {
                'trakt-api-version': '2',
                'trakt-api-key': process.env.TRAKT_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            },
            params: { limit, page: 1 },
            timeout: 10000
        });
        return res.data || [];
    };

    const toResult = data => {
        const items = Array.isArray(data) ? data : [];
        return {
            items,
            available: items.length > 0,
            reason: items.length > 0 ? 'ok' : 'empty'
        };
    };

    try {
        return toResult(await execute(traktToken));
    } catch (err) {
        console.error(`[safeTraktFetch] Error for ${endpoint}: status=${err.response?.status}, msg=${err.message}, hasUserObj=${!!userObj}, hasRefreshToken=${!!userObj?.apiKeys?.traktRefreshToken}`);
        const status = err.response?.status;
        if ((status === 401 || status === 403) && userObj?.apiKeys?.traktRefreshToken) {
            console.log(`[safeTraktFetch] Token expired or forbidden (${status}) for ${endpoint}. Attempting refresh...`);
            const { smartTraktRefresh } = require('../clients/trakt');

            try {
                const newTokens = await smartTraktRefresh(userObj.userId, userObj.apiKeys.traktRefreshToken);
                if (newTokens && newTokens.access_token) {
                    userObj.apiKeys.trakt = newTokens.access_token;
                    userObj.apiKeys.traktRefreshToken = newTokens.refresh_token;
                    if (newTokens.expires_at) {
                        userObj.apiKeys.traktExpiresAt = newTokens.expires_at;
                    }

                    console.log(`[safeTraktFetch] Token refreshed successfully. Retrying ${endpoint}...`);
                    return toResult(await execute(newTokens.access_token));
                }
            } catch (refreshErr) {
                console.error(`[safeTraktFetch] Refresh failed:`, refreshErr.message);
            }
            return { items: [], available: false, reason: status === 403 ? 'forbidden' : 'unauthorized' };
        }
        return { items: [], available: false, reason: status === 403 ? 'forbidden' : 'error' };
    }
}

async function safeTraktFetch(endpoint, traktToken, limit = 40, userObj = null) {
    const result = await safeTraktFetchDetailed(endpoint, traktToken, limit, userObj);
    return result.items;
}

async function fetchRecentHistory(traktToken, mediaType, limit = 10, userObj = null) {
    return safeTraktFetch(`/users/me/history/${mediaType}`, traktToken, limit, userObj);
}

async function fetchRecentRatings(traktToken, mediaType, limit = 40, userObj = null) {
    return safeTraktFetch(`/users/me/ratings/${mediaType}`, traktToken, limit, userObj);
}

module.exports = {
    safeTraktFetchDetailed,
    safeTraktFetch,
    fetchRecentHistory,
    fetchRecentRatings
};
