/**
 * JWT Authentication Middleware for Express.
 * Reads JWT from HttpOnly cookie, verifies it, and injects user info into req.user.
 */
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'yaca_session';
const CSRF_COOKIE_NAME = 'yaca_csrf';

/**
 * Middleware that requires a valid JWT session cookie.
 * On success, sets req.user = { userId, email }.
 * On failure, responds with 401 Unauthorized.
 */
function requireAuth(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME];

    if (!token) {
        return res.status(401).json({ error: 'Non autenticato. Effettua il login.' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('[Auth] JWT_SECRET non configurato.');
        return res.status(500).json({ error: 'Errore di configurazione del server.' });
    }

    try {
        const decoded = jwt.verify(token, secret);
        
        // Semplificazione: ci fidiamo della firma e della scadenza del JWT (Stateless)
        // Rimosso il trip al DB per 'activeSessions' (De-engineering)

        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            sessionId: decoded.sessionId // Mantenuto per compatibilità, ma non validato via DB
        };
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Sessione scaduta. Effettua nuovamente il login.' });
        }
        return res.status(401).json({ error: 'Token non valido.' });
    }
}

/**
 * Optional auth middleware — sets req.user if cookie is present and valid,
 * but doesn't block the request if not authenticated.
 */
function optionalAuth(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME];
    req.user = null;
    if (!token) return next();

    const secret = process.env.JWT_SECRET;
    if (!secret) return next();

    try {
        const decoded = jwt.verify(token, secret);
        req.user = {
            userId: decoded.userId,
            email: decoded.email
        };
    } catch {
        // Invalid token — just continue without auth
    }
    next();
}

module.exports = { requireAuth, COOKIE_NAME, CSRF_COOKIE_NAME };
