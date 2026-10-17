/**
 * Auth API Routes — JWT-based authentication with HttpOnly cookies.
 * 
 * Two-Table Split Architecture:
 *   - UserAccount: Stores auth credentials and API keys
 *   - AddonConfig: Stores profiles and public Stremio config
 * 
 * Endpoints:
 *   POST /api/auth/login  — Authenticates via Stremio, returns JWT cookie
 *   GET  /api/auth/me     — Returns current session user info
 *   POST /api/auth/logout — Clears session cookie
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const COOKIE_NAME = 'yaca_session';
const { stremioClient } = require('../../stremio');
const { traktClient } = require('../../clients/trakt');
const UserConfig = require('../../models/UserConfig');
const UserAccount = require('../../models/UserAccount');
const AddonConfig = require('../../models/AddonConfig');
const { nanoid } = require('nanoid');
const { risolviProfiloAttivo } = require('../../profile');

const JWT_EXPIRY = '7d';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms — must match JWT_EXPIRY

/**
 * Builds the Set-Cookie options for the session cookie.
 */
function buildCookieOptions(httpOnly) {
    // Force secure=true and sameSite='none' to support cross-origin iframes
    // and Stremio Web Dashboard requests.
    return {
        httpOnly,
        secure: true,
        sameSite: 'none',
        maxAge: COOKIE_MAX_AGE_MS,
        path: '/'
    };
}

function getCookieOptions() {
    return buildCookieOptions(true);
}



let fallbackSecret = null;
function getJwtSecret() {
    let secret = process.env.JWT_SECRET;
    if (!secret) {
        if (!fallbackSecret) {
            console.warn('[Auth] ATTENZIONE: JWT_SECRET non configurato nel .env! Verrà usato un secret generato casualmente, il che significa che le sessioni scadranno al riavvio del server.');
            fallbackSecret = crypto.randomBytes(32).toString('hex');
        }
        secret = fallbackSecret;
    }
    return secret;
}

/**
 * Signs a JWT token containing user identity.
 */
function signToken(payload) {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRY });
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 * 
 * Authenticates via Stremio API, finds/creates user in DB, and sets JWT cookie.
 * Uses Two-Table Split: reads account from UserAccount, profiles from AddonConfig.
 */
async function loginHandler(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email e password obbligatorie.' });
    }

    try {
        // 1. Authenticate with Stremio
        const stremioRes = await stremioClient.post('/api/login', { email, password }, { timeout: 10000 });
        const data = stremioRes.data;

        if (!data?.result?.authKey) {
            return res.json({
                success: false,
                error: data?.result?.error || 'Credenziali non valide.'
            });
        }

        const authKey = data.result.authKey;
        const resolvedEmail = data.result.user?.email || email;

        // 2. Find or create user in DB (UserAccount table)
        let existingAccount = await UserAccount.findOne({ 
            $or: [
                { email: resolvedEmail },
                { 'apiKeys.stremio': authKey }
            ]
        });

        let userId;
        const isReturningUser = Boolean(existingAccount);

        if (existingAccount) {
            userId = existingAccount.userId;
        } else {
            userId = nanoid(10);
        }

        // Save/update via Two-Table saveUser (handles both UserAccount + AddonConfig)
        await UserConfig.saveUser({
            userId,
            email: resolvedEmail,
            apiKeys: { stremio: authKey }
        });

        // Re-read the account to get the addonUuid
        const account = await UserAccount.findOne({ userId }).lean();

        // 3. Read profiles from AddonConfig (NOT from UserAccount!)
        let addonConfig = null;
        if (account?.addonUuid) {
            addonConfig = await AddonConfig.findOne({ uuid: account.addonUuid }).lean();
            if (!addonConfig) {
                // Cold start safety: create empty AddonConfig if it doesn't exist
                addonConfig = await AddonConfig.create({ uuid: account.addonUuid, profiles: [] });
            }
        }

        // 4. Sign JWT and set cookie
        const token = signToken({ userId, email: resolvedEmail });
        res.cookie(COOKIE_NAME, token, getCookieOptions());

        // 5. Return user info with profiles from AddonConfig
        const resolvedProfiles = (addonConfig?.profiles || []).map(p => {
            const pObj = p.toObject?.() || p;
            return {
                ...pObj,
                id: pObj.id || pObj._id?.toString()
            };
        });

        return res.json({
            success: true,
            userId,
            email: resolvedEmail,
            isReturningUser,
            profiles: resolvedProfiles,
            activeProfileId: risolviProfiloAttivo({ addonConfig, profiles: resolvedProfiles }),
            traktConnected: Boolean(account?.apiKeys?.trakt),
            configVersion: addonConfig?.config?.configVersion || null
        });
    } catch (err) {
        console.error('[Auth] Login error:', err.message);
        return res.json({ success: false, error: 'Errore di connessione al servizio di autenticazione.' });
    }
}

/**
 * GET /api/auth/me
 * Returns the current authenticated user's session info.
 * Requires valid JWT cookie.
 * Uses Two-Table Split: reads account from UserAccount, profiles from AddonConfig.
 */
async function meHandler(req, res) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
        return res.status(401).json({ authenticated: false });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret());

        // Read auth data from UserAccount
        const account = await UserAccount.findOne({ userId: decoded.userId }).lean();
        if (!account) {
            res.clearCookie(COOKIE_NAME, getCookieOptions());
            return res.status(401).json({ authenticated: false });
        }

        // Read profiles from AddonConfig via addonUuid join
        const addonConfig = account.addonUuid
            ? await AddonConfig.findOne({ uuid: account.addonUuid }).lean()
            : null;

        const resolvedProfiles = (addonConfig?.profiles || []).map(p => ({
            ...p,
            id: p.id || p._id?.toString()
        }));

        return res.json({
            authenticated: true,
            userId: account.userId,
            email: account.email,
            profiles: resolvedProfiles,
            activeProfileId: risolviProfiloAttivo({ addonConfig, profiles: resolvedProfiles }),
            configVersion: addonConfig?.config?.configVersion || null,
            traktConnected: Boolean(account.apiKeys?.trakt),
            traktStatus: account.traktStatus || null,
            apiKeys: {
                stremio: account.apiKeys?.stremio || null,
                tmdb: account.apiKeys?.tmdb || null,
                mistral: account.apiKeys?.mistral || null,
                trakt: account.apiKeys?.trakt || null,
                // NB: il refresh token NON esce dal server (credenziale long-lived).
                // Il backend lo preserva da sé quando il client non lo rimanda.
                traktExpiresAt: account.apiKeys?.traktExpiresAt || null
            }
        });
    } catch (err) {
        res.clearCookie(COOKIE_NAME, getCookieOptions());
        return res.status(401).json({ authenticated: false });
    }
}

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
async function logoutHandler(req, res) {
    res.clearCookie(COOKIE_NAME, getCookieOptions());
    return res.json({ success: true });
}

/**
 * POST /api/auth/trakt/disconnect
 * Body: { userId? }
 * Removes Trakt tokens (trakt, traktRefreshToken, traktExpiresAt) from UserAccount.
 */
async function traktDisconnectHandler(req, res) {
    let userId = req.body?.userId;
    const token = req.cookies?.[COOKIE_NAME];

    if (token) {
        try {
            const decoded = jwt.verify(token, getJwtSecret());
            if (decoded?.userId) {
                userId = decoded.userId;
            }
        } catch (err) {
            // Se il cookie non è valido, usa req.body.userId se fornito
        }
    }

    if (!userId) {
        return res.status(401).json({ success: false, error: 'Non autorizzato o userId mancante.' });
    }

    try {
        const updated = await UserAccount.findOneAndUpdate(
            { userId },
            {
                $unset: {
                    'apiKeys.trakt': 1,
                    'apiKeys.traktRefreshToken': 1,
                    'apiKeys.traktExpiresAt': 1
                }
            },
            { returnDocument: 'after' }
        );

        if (!updated) {
            return res.status(404).json({ success: false, error: 'Utente non trovato.' });
        }

        return res.json({ success: true, message: 'Trakt disconnesso con successo.' });
    } catch (err) {
        console.error('[Auth] Errore disconnessione Trakt:', err.message);
        return res.status(500).json({ success: false, error: 'Errore interno durante la disconnessione.' });
    }
}

/**
 * GET /api/trakt/health
 * Esegue l'heartbeat diagnostico su Trakt e restituisce lo stato aggiornato.
 */
async function traktHealthHandler(req, res) {
    // Solo sessione autenticata: mai fidarsi di uno userId passato dal client (IDOR).
    const token = req.cookies?.[COOKIE_NAME];
    let userId = null;
    if (token) {
        try {
            const decoded = jwt.verify(token, getJwtSecret());
            if (decoded?.userId) userId = decoded.userId;
        } catch (_err) {}
    }

    if (!userId) {
        return res.status(401).json({ success: false, error: 'Non autorizzato.' });
    }

    try {
        const { checkTraktHeartbeat } = require('../../clients/trakt');
        const health = await checkTraktHeartbeat(userId);
        return res.json({ success: true, userId, ...health });
    } catch (err) {
        console.error('[Auth] Errore health check Trakt:', err.message);
        return res.status(500).json({ error: { code: 'non_disponibile', message: 'Errore interno controllo stato Trakt.' } });
    }
}

/**
 * POST /api/auth/stremio
 * Autentica su Stremio con email e password, restituendo l'authKey.
 */
async function stremioAuthHandler(req, res) {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({
            error: {
                code: 'richiesta_non_valida',
                message: 'Email e password obbligatorie.'
            }
        });
    }
    try {
        const stremioRes = await stremioClient.post('/api/login', { email, password }, { timeout: 10000 });
        const data = stremioRes.data;
        if (data && data.result && data.result.authKey) {
            return res.json({ success: true, authKey: data.result.authKey, email: data.result.user?.email || email });
        }
        return res.status(401).json({
            error: {
                code: 'non_autenticato',
                message: data?.result?.error || 'Credenziali non valide.'
            }
        });
    } catch (_err) {
        return res.status(503).json({
            error: {
                code: 'motore_giu',
                message: 'Errore di connessione al servizio di autenticazione Stremio.'
            }
        });
    }
}

/**
 * POST /api/auth/trakt/code
 * Avvia il device flow di Trakt generando user_code e device_code.
 */
async function traktCodeHandler(req, res) {
    const clientId = process.env.TRAKT_CLIENT_ID;
    if (!clientId) {
        return res.status(503).json({
            error: {
                code: 'non_disponibile',
                message: 'TRAKT_CLIENT_ID mancante nel server.'
            }
        });
    }
    try {
        const response = await traktClient.post('/oauth/device/code', {
            client_id: clientId
        }, { headers: { 'Content-Type': 'application/json' } });
        return res.json(response.data);
    } catch (err) {
        console.error('[Auth] Errore Trakt Code:', err.response?.data || err.message);
        return res.status(503).json({
            error: {
                code: 'motore_giu',
                message: 'Errore di connessione a Trakt.'
            }
        });
    }
}

/**
 * POST /api/auth/trakt/token
 * Polling del token di Trakt per il device flow.
 * Quando approvato, il token viene salvato in UserAccount nel database e non esposto al browser.
 */
async function traktTokenHandler(req, res) {
    const { device_code } = req.body || {};
    const clientId = process.env.TRAKT_CLIENT_ID;
    const clientSecret = process.env.TRAKT_CLIENT_SECRET;

    if (!device_code) {
        return res.status(400).json({
            error: {
                code: 'richiesta_non_valida',
                message: 'device_code mancante.'
            }
        });
    }
    if (!clientId || !clientSecret) {
        return res.status(503).json({
            error: {
                code: 'non_disponibile',
                message: 'Credenziali Trakt non configurate sul server.'
            }
        });
    }

    try {
        const response = await traktClient.post('/oauth/device/token', {
            code: device_code,
            client_id: clientId,
            client_secret: clientSecret
        }, { headers: { 'Content-Type': 'application/json' } });

        const { access_token, refresh_token, expires_in } = response.data;
        const userId = req.utenteId;
        if (userId && access_token) {
            const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000) : null;
            await UserAccount.findOneAndUpdate(
                { userId },
                {
                    $set: {
                        'apiKeys.trakt': access_token,
                        'apiKeys.traktRefreshToken': refresh_token,
                        'apiKeys.traktExpiresAt': expiresAt
                    }
                }
            );
        }

        return res.json({ success: true, connected: true });
    } catch (err) {
        const status = err.response?.status;
        if (status === 400 || status === 429) {
            return res.json({ pending: true });
        } else if (status === 404 || status === 410) {
            return res.status(400).json({
                error: {
                    code: 'richiesta_non_valida',
                    message: 'Codice autorizzazione Trakt scaduto o non valido.'
                }
            });
        } else if (status === 409) {
            return res.status(403).json({
                error: {
                    code: 'non_autenticato',
                    message: "L'utente ha negato l'accesso su Trakt."
                }
            });
        }
        console.error('[Auth] Errore Trakt Token:', err.response?.data || err.message);
        return res.status(503).json({
            error: {
                code: 'motore_giu',
                message: 'Errore durante il recupero del token Trakt.'
            }
        });
    }
}

module.exports = {
    loginHandler,
    meHandler,
    logoutHandler,
    traktDisconnectHandler,
    traktHealthHandler,
    stremioAuthHandler,
    traktCodeHandler,
    traktTokenHandler,
    getJwtSecret
};


