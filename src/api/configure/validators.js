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
    return /^[A-Za-z0-9._-]{20,500}$/.test(value);
}

function normalizeInputString(value) {
    if (value === undefined || value === null) return value;
    if (typeof value !== 'string') return value;
    return value.trim();
}

function validateAuth(req) {
    if (!req.user?.userId) {
        throw { status: 401, message: 'Non autenticato. Effettua il login.' };
    }
}

function validateKeys(body, existingUser, warnings) {
    const personalTmdbKey = normalizeInputString(body.tmdbKey);
    const personalMistralKey = normalizeInputString(body.mistralKey);
    const traktToken = normalizeInputString(body.traktToken);
    const traktRefreshToken = normalizeInputString(body.traktRefreshToken);
    const stremioAuthKey = normalizeInputString(body.stremioAuthKey);
    const stremioEmail = body.email || null; // email can come from body in some flows

    const effectiveTmdbKey = personalTmdbKey || process.env.TMDB_API_KEY;
    const effectiveMistralKey = (personalMistralKey === undefined
        ? (existingUser?.apiKeys?.mistral || null)
        : (personalMistralKey || null));

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
        mdblistKey: normalizeInputString(body.mdblistKey),
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
