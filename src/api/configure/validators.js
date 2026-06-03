const LIMITS = {
    MAX_PROFILES: 20,
    MAX_EXISTING_CATALOGS: 50,
    MAX_PRESETS: 50,
    MAX_AI_PROMPTS: 20,
    MAX_PROMPT_LENGTH: 500,
    MAX_KEY_LENGTH: 200,
    MAX_TOKEN_LENGTH: 500,
    MAX_PROFILE_NAME_LENGTH: 50,
    MAX_CATALOG_NAME_LENGTH: 50
};

function isValidTraktTokenCandidate(value) {
    if (typeof value !== 'string') return false;
    // Base64 compatible regex, allowing for a wider range of tokens
    return /^[A-Za-z0-9._\-+/=]{10,1000}$/.test(value);
}

function normalizeInputString(value) {
    if (value === undefined || value === null) return value;
    if (typeof value !== 'string') return value;
    return value.trim();
}

const jwt = require('jsonwebtoken');

function validateAuth(req) {
    const token = req.cookies?.yaca_session;
    if (token) {
        try {
            const { getJwtSecret } = require('../auth/index');
            req.user = jwt.verify(token, getJwtSecret());
        } catch (err) {
            // Invalid token
        }
    }

    if (!req.user?.userId && req.body?.userId) {
        req.user = { userId: req.body.userId };
    }

    if (!req.user?.userId) {
        throw { status: 401, message: 'Non autenticato. Effettua il login.' };
    }
}

function validateKeys(body, existingUser, warnings) {
    const personalTmdbKey = normalizeInputString(body.tmdbKey);
    const personalMistralKey = normalizeInputString(body.mistralKey);
    let traktToken = normalizeInputString(body.traktToken);
    let traktRefreshToken = normalizeInputString(body.traktRefreshToken);

    // Defensive: if traktToken is accidentally passed as an object (e.g. from a raw API response)
    if (traktToken && typeof traktToken === 'object' && traktToken.access_token) {
        traktToken = traktToken.access_token;
    }

    // Preserve Trakt tokens if not provided, set to 'null' string, or set to the
    // 'connected' sentinel used by the frontend when the real token is held server-side.
    if (traktToken === undefined || traktToken === null || traktToken === 'null' || traktToken === '' || traktToken === 'connected') {
        traktToken = existingUser?.apiKeys?.trakt || null;
    }
    if (traktRefreshToken === undefined || traktRefreshToken === null || traktRefreshToken === 'null' || traktRefreshToken === '') {
        traktRefreshToken = existingUser?.apiKeys?.traktRefreshToken || null;
    }

    const stremioAuthKey = normalizeInputString(body.stremioAuthKey);
    const stremioEmail = body.email || null; // email can come from body in some flows

    const effectiveTmdbKey = personalTmdbKey || process.env.TMDB_API_KEY;
    const effectiveMistralKey = (personalMistralKey === undefined || personalMistralKey === null || personalMistralKey === 'null' || personalMistralKey === '')
        ? (existingUser?.apiKeys?.mistral || null)
        : (personalMistralKey || null);

    if (!effectiveTmdbKey) {
        throw { status: 400, message: "TMDB API key non configurata sul server o mancante." };
    }

    if (personalTmdbKey && (personalTmdbKey.length > LIMITS.MAX_KEY_LENGTH)) {
        throw { status: 400, message: "TMDB Key non valida." };
    }
    if (personalMistralKey && (personalMistralKey.length > LIMITS.MAX_KEY_LENGTH)) {
        throw { status: 400, message: "Mistral Key non valida." };
    }
    if (traktToken && !isValidTraktTokenCandidate(traktToken)) {
        throw { status: 400, message: "Token Trakt non valido." };
    }
    if (traktToken && (traktToken.length > LIMITS.MAX_TOKEN_LENGTH)) {
        throw { status: 400, message: "Token Trakt non valido (lunghezza)." };
    }
    if (traktRefreshToken && (traktRefreshToken.length > LIMITS.MAX_TOKEN_LENGTH)) {
        throw { status: 400, message: "Refresh Token Trakt non valido." };
    }
    if (stremioAuthKey && (stremioAuthKey.length > LIMITS.MAX_TOKEN_LENGTH)) {
        throw { status: 400, message: "Auth key Stremio non valida." };
    }

    return {
        effectiveTmdbKey,
        mistralKey: effectiveMistralKey,
        traktToken,
        traktRefreshToken,
        stremioAuthKey,
        stremioEmail
    };
}

module.exports = {
    LIMITS,
    isValidTraktTokenCandidate,
    normalizeInputString,
    validateAuth,
    validateKeys
};
