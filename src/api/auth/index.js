/**
 * Auth API Routes — JWT-based authentication with HttpOnly cookies.
 * 
 * Endpoints:
 *   POST /api/auth/login  — Authenticates via Stremio, returns JWT cookie
 *   GET  /api/auth/me     — Returns current session user info
 *   POST /api/auth/logout — Clears session cookie
 */
const jwt = require('jsonwebtoken');
const { COOKIE_NAME } = require('../../middleware/requireAuth');
const { stremioClient } = require('../../clients/stremio');
const UserConfig = require('../../models/UserConfig');
const User = require('../../db/models/User');
const { nanoid } = require('nanoid');

const JWT_EXPIRY = '7d';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms — must match JWT_EXPIRY

/**
 * Builds the Set-Cookie options for the session cookie.
 */
function getCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE_MS,
        path: '/'
    };
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
        let existingUser = null;
        if (resolvedEmail) {
            existingUser = await User.findOne({ email: resolvedEmail });
        }
        if (!existingUser && authKey) {
            existingUser = await User.findOne({ 'apiKeys.stremio': authKey });
        }

        let userId;
        if (existingUser) {
            userId = existingUser.userId;
            // Update stremio auth key & password if changed
            await UserConfig.saveUser({
                userId,
                email: resolvedEmail,
                apiKeys: { stremio: authKey, stremioPass: password }
            });
        } else {
            userId = nanoid(10);
            await UserConfig.saveUser({
                userId,
                email: resolvedEmail,
                apiKeys: { stremio: authKey, stremioPass: password }
            });
        }

        // 3. Sign JWT and set cookie
        const token = signToken({ userId, email: resolvedEmail });
        res.cookie(COOKIE_NAME, token, getCookieOptions());

        // 4. Return user info (no sensitive tokens in the body)
        return res.json({
            success: true,
            userId,
            email: resolvedEmail,
            isReturningUser: Boolean(existingUser),
            profiles: existingUser?.profiles || [],
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
    if (!secret) {
        return res.status(500).json({ error: 'JWT_SECRET non configurato.' });
    }

    try {
        const decoded = jwt.verify(token, secret);
        const user = await User.findOne({ userId: decoded.userId }).lean();

        if (!user) {
            // User deleted — clear cookie
            res.clearCookie(COOKIE_NAME, getCookieOptions());
            return res.status(401).json({ authenticated: false });
        }

        return res.json({
            authenticated: true,
            userId: user.userId,
            email: user.email,
            profiles: user.profiles || [],
            activeProfileId: user.config?.activeProfileId || 'global',
            configVersion: user.config?.configVersion || null,
            traktConnected: Boolean(user.apiKeys?.trakt),
            apiKeys: {
                tmdb: user.apiKeys?.tmdb || null,
                mistral: user.apiKeys?.mistral || null
            }
        });
    } catch (err) {
        // Invalid or expired token
        res.clearCookie(COOKIE_NAME, getCookieOptions());
        return res.status(401).json({ authenticated: false });
    }
}

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
function logoutHandler(req, res) {
    res.clearCookie(COOKIE_NAME, getCookieOptions());
    return res.json({ success: true });
}

module.exports = { loginHandler, meHandler, logoutHandler, getCookieOptions, signToken };
