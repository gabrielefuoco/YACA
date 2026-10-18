/**
 * Middleware per sanitizzare gli input critici (NoSQL Injection & XSS).
 * Forza userId a essere stringa e blocca operatori MongoDB ($) nelle query.
 */
const inputSanitizer = (req, res, next) => {
    // 1. Force userId to be a string if it exists in params, query, or body
    const userIdInput = req.params.userId || req.query.userId || req.body.userId;
    if (userIdInput && typeof userIdInput !== 'string') {
        console.warn(`[Security] Intercepted non-string userId (type: ${typeof userIdInput}) from ${req.ip}`);
        return res.status(400).json({ error: "userId non valido" });
    }

    // 2. Recursively check for NoSQL operators ($) in request data (body, query, params)
    const hasNoSqlOperators = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        
        for (const key in obj) {
            if (key.startsWith('$')) return true;
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                if (hasNoSqlOperators(obj[key])) return true;
            }
        }
        return false;
    };

    const targets = ['query', 'body', 'params'];
    for (const target of targets) {
        if (req[target] && hasNoSqlOperators(req[target])) {
            console.warn(`[Security] Intercepted NoSQL operators in req.${target} from ${req.ip}`);
            // Whitelist certain fields that might legitimately use $ if necessary, 
            // but for this app, the filters are parsed manually from AI, not passed raw to Mongo.
            return res.status(400).json({ error: "Input non valido: rilevati operatori non consentiti" });
        }
    }

    next();
};

module.exports = { inputSanitizer };
