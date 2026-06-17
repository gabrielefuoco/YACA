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
const { stremioClient } = require('../../clients/stremio');
const UserConfig = require('../../models/UserConfig');
const UserAccount = require('../../db/models/UserAccount');
const AddonConfig = require('../../db/models/AddonConfig');
const { nanoid } = require('nanoid');

const JWT_EXPIRY = '7d';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms — must match JWT_EXPIRY

/**
 * Builds the Set-Cookie options for the session cookie.
 */
function buildCookieOptions(httpOnly) {
    // Force secure=true and sameSite='none' to support Hugging Face Spaces iframes
    // and Stremio Web Dashboard cross-origin requests.
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
            activeProfileId: addonConfig?.config?.activeProfileId || 'global',
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
            activeProfileId: addonConfig?.config?.activeProfileId || 'global',
            configVersion: addonConfig?.config?.configVersion || null,
            traktConnected: Boolean(account.apiKeys?.trakt),
            apiKeys: {
                stremio: account.apiKeys?.stremio || null,
                tmdb: account.apiKeys?.tmdb || null,
                mistral: account.apiKeys?.mistral || null,
                trakt: account.apiKeys?.trakt || null
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

module.exports = { loginHandler, meHandler, logoutHandler, getJwtSecret };
