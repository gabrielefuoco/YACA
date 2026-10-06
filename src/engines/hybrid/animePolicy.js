const { normalizeAnimeMarker } = require('../../utils/animeIdentity');

const ANIME_POLICY_MODES = Object.freeze({
    ONLY: 'only',
    FAVORED: 'favored',
    NEUTRAL: 'neutral',
    EXCLUDE: 'exclude'
});

/**
 * Calcola la quota di Animazione (g:16) rispetto a tutti i generi presenti in V_final del profilo.
 * @param {Object} profile - Documento TasteProfile o mock di profilo
 * @returns {number|null} Quota compresa tra 0 e 1, oppure null se nessun genere è presente.
 */
function getProfileAnimationQuota(profile) {
    if (!profile) return null;
    const vFinal = profile?.compiledVectors?.V_final;
    if (vFinal) {
        let g16 = 0;
        let sumG = 0;
        const entries = vFinal instanceof Map ? Array.from(vFinal.entries()) : Object.entries(vFinal);
        for (const [key, val] of entries) {
            if (typeof key === 'string' && key.startsWith('g:')) {
                const num = Math.max(0, Number(val) || 0);
                sumG += num;
                if (key === 'g:16') g16 = num;
            }
        }
        if (sumG > 0) return g16 / sumG;
    }

    // Fallback per profili con genreScores legacy o strutture di test
    const genreScores = profile?.genreScores;
    if (genreScores) {
        let g16 = 0;
        let sumG = 0;
        const entries = genreScores instanceof Map ? Array.from(genreScores.entries()) : Object.entries(genreScores);
        for (const [key, val] of entries) {
            const num = Math.max(0, Number(val) || 0);
            sumG += num;
            if (String(key) === '16' || String(key) === 'g:16') g16 = num;
        }
        if (sumG > 0) return g16 / sumG;
    }

    return null;
}

/**
 * Mappa la quota di animazione del DNA nel modo operativo corrispondente:
 * - ≥ 60%  → only
 * - 25-60% → favored
 * - 10-25% → neutral
 * - < 10%  → exclude
 * @param {number|null} quota
 * @returns {'only'|'favored'|'neutral'|'exclude'}
 */
function getPolicyFromQuota(quota) {
    if (quota === null || quota === undefined || !Number.isFinite(quota)) {
        return ANIME_POLICY_MODES.NEUTRAL;
    }
    if (quota >= 0.60) return ANIME_POLICY_MODES.ONLY;
    if (quota >= 0.25) return ANIME_POLICY_MODES.FAVORED;
    if (quota >= 0.10) return ANIME_POLICY_MODES.NEUTRAL;
    return ANIME_POLICY_MODES.EXCLUDE;
}

/**
 * Risolve la politica anime attiva.
 * La scelta manuale (typeSelectors.anime) vince sempre su qualsiasi calcolo automatico.
 * In assenza di override manuale, la politica è dedotta dal DNA del profilo.
 * @param {Object} profile
 * @param {Object} [typeSelectors]
 * @returns {'only'|'favored'|'neutral'|'exclude'}
 */
function resolveAnimePolicy(profile, typeSelectors = null, options = {}) {
    if (typeSelectors?.anime) {
        return typeSelectors.anime;
    }
    const profileManual = profile?.settings?.typeSelectors?.anime || profile?.typeSelectors?.anime;
    if (profileManual) {
        return profileManual;
    }
    if (options?.isKidsMode || profile?.settings?.kidsMode || profile?.kidsMode) {
        return ANIME_POLICY_MODES.NEUTRAL;
    }
    const quota = getProfileAnimationQuota(profile);
    return getPolicyFromQuota(quota);
}

/**
 * Restituisce i typeSelectors arricchiti con la politica anime calcolata.
 * @param {Object} profile
 * @param {Object} [typeSelectors]
 * @param {Object} [options]
 * @returns {Object}
 */
function getEffectiveTypeSelectors(profile, typeSelectors = null, options = {}) {
    const policy = resolveAnimePolicy(profile, typeSelectors, options);
    return {
        ...(typeSelectors || {}),
        anime: policy
    };
}

/**
 * Determina se un item è un anime secondo la regola canonica.
 * @param {Object} item
 * @returns {boolean}
 */
function isItemAnime(item) {
    if (!item) return false;
    const target = item.data || item.rawTMDB || item;
    return normalizeAnimeMarker(target) === true;
}

/**
 * Calcola il moltiplicatore di affinità per lo score VSM in base alla politica anime:
 * - only: ×1.25 per anime, ×0.40 per non-anime
 * - favored: ×1.15 per anime, ×0.85 per non-anime
 * - neutral: ×1.00
 * - exclude: ×0.40 per anime, ×1.00 per non-anime
 * @param {Object} item
 * @param {'only'|'favored'|'neutral'|'exclude'} policy
 * @returns {number}
 */
function computeAnimeScoreMultiplier(item, policy) {
    const isAnime = isItemAnime(item);
    if (policy === ANIME_POLICY_MODES.ONLY) {
        return isAnime ? 1.25 : 0.4;
    }
    if (policy === ANIME_POLICY_MODES.FAVORED) {
        return isAnime ? 1.15 : 0.85;
    }
    if (policy === ANIME_POLICY_MODES.EXCLUDE) {
        return isAnime ? 0.4 : 1.0;
    }
    return 1.0;
}

module.exports = {
    ANIME_POLICY_MODES,
    getProfileAnimationQuota,
    getPolicyFromQuota,
    resolveAnimePolicy,
    getEffectiveTypeSelectors,
    isItemAnime,
    computeAnimeScoreMultiplier
};
