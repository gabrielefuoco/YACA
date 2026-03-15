/**
 * Auth API Routes — JWT-based authentication with HttpOnly cookies.
 * 
 * Endpoints:
 *   POST /api/auth/login  — Authenticates via Stremio, returns JWT cookie
 *   GET  /api/auth/me     — Returns current session user info
 *   POST /api/auth/logout — Clears session cookie
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { COOKIE_NAME, CSRF_COOKIE_NAME } = require('../../middleware/requireAuth');
const { stremioClient } = require('../../clients/stremio');
const UserConfig = require('../../models/UserConfig');
const User = require('../../models/User');
const { nanoid } = require('nanoid');

const JWT_EXPIRY = '7d';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms — must match JWT_EXPIRY

/**
 * Builds the Set-Cookie options for the session cookie.
 */
function buildCookieOptions(httpOnly) {
    const isProd = process.env.NODE_ENV === 'production';
    return {
        httpOnly,
        secure: isProd,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE_MS,
        path: '/'
    };
}

function getCookieOptions() {
    return buildCookieOptions(true);
}

function getCsrfCookieOptions() {
    return buildCookieOptions(false);
}

/**
 * Signs a JWT token containing user identity.
 */
function signToken(payload) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET non configurato.');
    return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRY });
}

/**
 * POST /api/auth/login
 * Body: { email, password }
 * 
 * Authenticates via Stremio API, finds/creates user in DB, and sets JWT cookie.
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

        // 2. Find or create user in DB
        let existingUser = await User.findOne({ 
            $or: [
                { email: resolvedEmail },
                { 'apiKeys.stremio': authKey }
            ]
        });

        let userId;
        if (existingUser) {
            userId = existingUser.userId;
            // Update stremio auth key if changed
            await UserConfig.saveUser({
                userId,
                email: resolvedEmail,
                apiKeys: { stremio: authKey }
            });
        } else {
            userId = nanoid(10);
            await UserConfig.saveUser({
                userId,
                email: resolvedEmail,
                apiKeys: { stremio: authKey }
            });
        }

        // 3. Sign JWT and set cookie
        // Rimosso sessionId (Selective Logout) - Usiamo solo userId e email
        const token = signToken({ userId, email: resolvedEmail });
        const csrfToken = crypto.randomBytes(32).toString('hex');

        res.cookie(COOKIE_NAME, token, getCookieOptions());
        res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());

        // 4. Return user info
        const resolvedProfiles = (existingUser?.profiles || []).map(p => {
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
            isReturningUser: Boolean(existingUser),
            profiles: resolvedProfiles,
            activeProfileId: existingUser?.config?.activeProfileId || 'global',
            traktConnected: Boolean(existingUser?.apiKeys?.trakt),
            configVersion: existingUser?.config?.configVersion || null
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
 */
async function meHandler(req, res) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
        return res.status(401).json({ authenticated: false });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ error: 'JWT_SECRET missing.' });

    try {
        const decoded = jwt.verify(token, secret);
        const user = await User.findOne({ userId: decoded.userId }).lean();

        if (!user) {
            res.clearCookie(COOKIE_NAME, getCookieOptions());
            return res.status(401).json({ authenticated: false });
        }

        // Rimosso il controllo sessione attiva (Stateless)

        // Map profiles to ensure they each have a stable 'id' field (fallback to _id)
        const resolvedProfiles = (user.profiles || []).map(p => {
            const pObj = p.toObject?.() || p;
            return {
                ...pObj,
                id: pObj.id || pObj._id?.toString()
            };
        });

        return res.json({
            authenticated: true,
            userId: user.userId,
            email: user.email,
            profiles: resolvedProfiles,
            activeProfileId: user.config?.activeProfileId || 'global',
            configVersion: user.config?.configVersion || null,
            traktConnected: Boolean(user.apiKeys?.trakt),
            apiKeys: {
                stremio: user.apiKeys?.stremio || null,
                tmdb: user.apiKeys?.tmdb || null,
                mistral: user.apiKeys?.mistral || null,
                trakt: user.apiKeys?.trakt || null,
                mdblist: user.apiKeys?.mdblist || null
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
    res.clearCookie(CSRF_COOKIE_NAME, getCsrfCookieOptions());
    return res.json({ success: true });
}

module.exports = { loginHandler, meHandler, logoutHandler };
