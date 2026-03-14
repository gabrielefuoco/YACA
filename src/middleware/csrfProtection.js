const { resolveHostUrl } = require('../utils/helpers');
const { COOKIE_NAME, CSRF_COOKIE_NAME } = require('./requireAuth');

/**
 * Middleware per la protezione CSRF.
 * Implementa Double Submit Cookie e Origin/Referer check.
 */
function csrfProtection(req, res, next) {
    const method = req.method?.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return next();
    }

    const hasSessionCookie = Boolean(req.cookies?.[COOKIE_NAME]);
    
    // 1. Double Submit Cookie Pattern via Header
    if (hasSessionCookie) {
        const csrfCookie = req.cookies?.[CSRF_COOKIE_NAME];
        const csrfHeader = req.get('x-csrf-token');
        if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
            console.warn(`[Security] CSRF Blocked: Missing or mismatching token for ${req.path}`);
            return res.status(403).json({ error: 'CSRF validation failed. Refresh the page.' });
        }
    }

    // 2. Origin/Referer Check (Strict)
    const origin = req.get('origin');
    const referer = req.get('referer');
    
    // In production, we MUST have an Origin or Referer for state-changing requests
    if (process.env.NODE_ENV === 'production' && !origin && !referer) {
        console.warn(`[Security] CSRF Blocked: Missing both Origin and Referer headers for ${req.path}`);
        return res.status(403).json({ error: 'Security headers missing.' });
    }

    if (!origin && !referer) {
        return next();
    }

    let allowedOrigins = [];
    if (process.env.CORS_ALLOWED_ORIGINS) {
        allowedOrigins = process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => {
            try { return new URL(o.trim()).host; } catch { return o.trim(); }
        });
    }

    let expectedHost = null;
    try {
        expectedHost = new URL(resolveHostUrl(req)).host;
    } catch {
        expectedHost = req.get('host');
    }

    const candidate = origin || referer;
    try {
        const sourceHost = new URL(candidate).host;
        const isWhitelisted = allowedOrigins.includes(sourceHost) || sourceHost === expectedHost;
        
        if (!isWhitelisted) {
            console.warn(`[Security] CSRF Blocked: Origin ${sourceHost} not in whitelist for ${req.path}`);
            return res.status(403).json({ error: 'CSRF validation failed: Unauthorized origin.' });
        }
    } catch {
        return res.status(403).json({ error: 'CSRF validation failed: Invalid origin format.' });
    }

    return next();
}

module.exports = { csrfProtection };
