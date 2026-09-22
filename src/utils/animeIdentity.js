/**
 * animeIdentity.js
 * 
 * Modulo condiviso per l'identità canonica Anime in YACA.
 * 
 * REGOLA CANONICA:
 * anime ⟺ il tmdbId è presente in animeMappingStore (Anibridge/Fribb)
 *          OPPURE (genere 16 AND (original_language === 'ja' OR keyword TMDB contiene 'anime' case-insensitive))
 * 
 * Regola Keyword:
 * Una keyword è considerata "anime" se include il termine "anime" (case-insensitive),
 * escludendo esplicitamente qualificatori come "anime-inspired", "anime inspired",
 * "anime-influenced", "anime influenced", "anime-style" o "anime style", che identificano
 * produzioni occidentali stilisticamente influenzate dall'animazione giapponese (es. Avatar, Castlevania).
 */

function isAnimeKeywordString(keyword) {
    if (!keyword || typeof keyword !== 'string') return false;
    const s = keyword.toLowerCase().trim();
    return s.includes('anime') && !/\banime[- ]?(inspired|influenced|style)\b/i.test(s);
}

function hasAnimeKeyword(keywords) {
    if (!keywords) return false;
    let list = keywords;
    if (typeof list === 'string') {
        const trimmed = list.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                list = JSON.parse(trimmed);
            } catch {
                return isAnimeKeywordString(trimmed);
            }
        } else {
            return isAnimeKeywordString(trimmed);
        }
    }
    if (list && typeof list === 'object' && !Array.isArray(list)) {
        list = list.results || list.keywords || [];
    }
    if (!Array.isArray(list)) return false;

    return list.some(k => {
        if (!k) return false;
        if (typeof k === 'string') return isAnimeKeywordString(k);
        if (typeof k === 'object' && typeof k.name === 'string') return isAnimeKeywordString(k.name);
        return false;
    });
}

function hasAnimationGenre(genreIds) {
    if (!genreIds) return false;
    let list = genreIds;
    if (typeof list === 'string') {
        const trimmed = list.trim();
        if (trimmed.startsWith('[')) {
            try {
                list = JSON.parse(trimmed);
            } catch {
                return false;
            }
        }
    }
    if (!Array.isArray(list)) return false;
    return list.some(g => {
        if (g === 16 || g === '16') return true;
        if (g && typeof g === 'object' && (g.id === 16 || g.id === '16')) return true;
        return false;
    });
}

/**
 * Determina se un contenuto è da considerarsi Anime secondo la regola canonica YACA.
 * Funzione pura: nessun I/O, nessun side-effect.
 * 
 * @param {Object} [params]
 * @param {string|number} [params.tmdbId] - ID TMDB del contenuto
 * @param {Array<number|string|Object>} [params.genreIds] - Array di ID genere o oggetti genere
 * @param {string} [params.originalLanguage] - Codice lingua ISO (es. 'ja', 'en')
 * @param {Array<string|Object>|Object|string} [params.keywords] - Lista o oggetto keywords TMDB
 * @param {Object} [params.mappingStore] - Istanza dello store di mapping anime (opzionale)
 * @returns {boolean}
 */
function isAnimeContent({ tmdbId, genreIds, originalLanguage, keywords, mappingStore } = {}) {
    let store = mappingStore;
    if (store === undefined) {
        try {
            store = require('../data/animeMappingStore');
        } catch {
            store = null;
        }
    }

    // 1. Lookup rapido nello store certificato (Anibridge / Fribb)
    if (tmdbId && store && typeof store.isAnimeTmdbId === 'function') {
        if (store.isAnimeTmdbId(tmdbId)) {
            return true;
        }
    }

    // 2. Genere 16 (Animation) obbligatorio per l'euristica TMDB
    if (!hasAnimationGenre(genreIds)) {
        return false;
    }

    // 3. Lingua originale giapponese ('ja')
    const lang = typeof originalLanguage === 'string' ? originalLanguage.toLowerCase().trim() : '';
    if (lang === 'ja') {
        return true;
    }

    // 4. Keyword TMDB contenente "anime" (con filtro anti-falsi positivi)
    if (hasAnimeKeyword(keywords)) {
        return true;
    }

    return false;
}

module.exports = {
    isAnimeContent,
    hasAnimeKeyword,
    isAnimeKeywordString,
    hasAnimationGenre
};
