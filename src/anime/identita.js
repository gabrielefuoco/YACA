/**
 * src/anime/identita.js
 *
 * Modulo identità canonica Anime in YACA (Ticket 32).
 *
 * REGOLA CANONICA (Decisione 6 e 7):
 * 1. Lo store risponde tre stati: 'si' | 'non-lo-so' | 'no'.
 *    - 'si': id presente negli indici o certificato -> anime (true)
 *    - 'no': id in exclude -> non anime (false, l'euristica si ferma)
 *    - 'non-lo-so': id assente -> l'euristica decide
 * 2. L'euristica decide SOLO su 'non-lo-so':
 *    Genere 16 (Animation) AND (original_language === 'ja' OR keyword TMDB contiene 'anime' case-insensitive,
 *    escludendo qualificatori occidentali come anime-inspired / influenced / style).
 * 3. Quando l'euristica dice 'si' su un 'non-lo-so', viene registrato per il log aggregato al refresh
 *    (Decisione 7: id + titolo come candidati certify).
 */

const ANIME_MARKER_DEFAULT = false;

// Buffer aggregato dei candidati certify prodotti dall'euristica su titoli 'non-lo-so'
const candidatiCertify = new Map();

function recordCandidatoCertify(tmdbId, title) {
    if (!tmdbId) return;
    const cleanId = String(tmdbId).trim();
    if (!cleanId) return;
    if (!candidatiCertify.has(cleanId)) {
        candidatiCertify.set(cleanId, {
            id: cleanId,
            title: title ? String(title).trim() : ''
        });
    } else if (title && !candidatiCertify.get(cleanId).title) {
        candidatiCertify.get(cleanId).title = String(title).trim();
    }
}

/**
 * Emette in una sola riga aggregata tutti i candidati certify emersi dall'euristica (Decisione 7)
 * e svuota il buffer.
 */
function flusheLogCandidatiCertify() {
    if (candidatiCertify.size === 0) return [];
    const list = Array.from(candidatiCertify.values());
    candidatiCertify.clear();
    const formatted = list.map(c => (c.title ? `${c.id} ("${c.title}")` : `${c.id}`)).join(', ');
    console.log(`[AnimeIdentity] Verdetto euristica su 'non-lo-so': ${list.length} candidati per certify -> ${formatted}`);
    return list;
}

function getCandidatiCertify() {
    return Array.from(candidatiCertify.values());
}

function resetCandidatiCertifyForTests() {
    candidatiCertify.clear();
}

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
 *
 * @param {Object} [params]
 * @param {string|number} [params.tmdbId] - ID TMDB del contenuto
 * @param {string} [params.title] - Titolo dell'opera (per visibilità candidati certify)
 * @param {string} [params.name] - Alias del titolo
 * @param {Array<number|string|Object>} [params.genreIds] - Array di ID genere o oggetti genere
 * @param {string} [params.originalLanguage] - Codice lingua ISO (es. 'ja', 'en')
 * @param {Array<string|Object>|Object|string} [params.keywords] - Lista o oggetto keywords TMDB
 * @param {Object} [params.mappingStore] - Istanza dello store di mapping anime (opzionale)
 * @param {string} [params.tipo] - Tipo del contenuto ('movie' | 'tv' | 'series' | 'anime')
 * @returns {boolean}
 */
function isAnimeContent({ tmdbId, title, name, genreIds, originalLanguage, keywords, mappingStore, tipo } = {}) {
    let store = mappingStore;
    if (store === undefined) {
        try {
            store = require('./mapping');
        } catch {
            store = null;
        }
    }

    // 1. Interrogazione dello store sui tre stati (Decisione 6):
    //    - 'si': id negli indici o certificato -> true
    //    - 'no': id in exclude -> false (stop euristica)
    //    - 'non-lo-so': id assente -> l'euristica decide
    if (tmdbId && store && typeof store.statoAnime === 'function') {
        const storeTipo = normalizeTipoAnime(tipo);
        const stato = store.statoAnime(tmdbId, storeTipo || undefined);
        if (stato === 'si') {
            return true;
        }
        if (stato === 'no') {
            return false;
        }
        // 'non-lo-so': prosegui con l'euristica
    } else if (tmdbId && store && typeof store.isAnimeTmdbId === 'function') {
        // Fallback di retrocompatibilità se viene iniettato un mock privo di statoAnime
        const storeTipo = normalizeTipoAnime(tipo);
        const storeMatch = storeTipo
            ? store.isAnimeTmdbId(tmdbId, storeTipo)
            : (tipo === undefined ? store.isAnimeTmdbId(tmdbId) : false);
        if (storeMatch) {
            return true;
        }
    }

    // 2. Euristica TMDB: opera solo su 'non-lo-so' (o assenza di store)
    // Genere 16 (Animation) obbligatorio per l'euristica
    if (!hasAnimationGenre(genreIds)) {
        return false;
    }

    const lang = typeof originalLanguage === 'string' ? originalLanguage.toLowerCase().trim() : '';
    const hasJa = lang === 'ja';
    const hasKw = hasAnimeKeyword(keywords);

    if (hasJa || hasKw) {
        // Decisione 7: registra il verdetto dell'euristica come candidato certify
        if (tmdbId) {
            recordCandidatoCertify(tmdbId, title || name);
        }
        return true;
    }

    return false;
}

/**
 * Estrae un TMDB id dai payload Stremio senza richiedere una rete.
 */
function extractAnimeTmdbId(item) {
    if (!item) return null;
    if (item.tmdbId !== undefined && item.tmdbId !== null && item.tmdbId !== '') {
        return String(item.tmdbId);
    }
    if (item._tmdbId !== undefined && item._tmdbId !== null && item._tmdbId !== '') {
        return String(item._tmdbId);
    }

    const rawId = String(item.id || item.stremioId || '').replace(/_ita_offset$/, '').trim();
    if (/^\d+$/.test(rawId)) return rawId;

    const parts = rawId.split(':');
    if (parts[0] === 'tmdb') {
        if (/^\d+$/.test(parts[1] || '')) return parts[1];
        if (parts.length > 2 && /^\d+$/.test(parts[2])) return parts[2];
    }
    return null;
}

function extractAnimeGenreIds(item) {
    const candidates = [item.genre_ids, item.genres, item.rawTMDB?.genre_ids, item.rawTMDB?.genres];
    const rawGenres = candidates.find(source => {
        if (Array.isArray(source)) return source.some(genre => genre !== null && genre !== undefined);
        if (typeof source === 'string' && source.trim()) {
            try {
                const parsed = JSON.parse(source);
                return Array.isArray(parsed) && parsed.length > 0;
            } catch {
                return false;
            }
        }
        return false;
    });

    if (!rawGenres) return [];
    let list = rawGenres;
    if (typeof list === 'string') {
        try {
            list = JSON.parse(list);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(list)) return [];

    return list.map(genre => {
        if (typeof genre === 'string') {
            const normalized = genre.toLowerCase();
            return normalized === 'animation' || normalized === 'animazione' ? 16 : genre;
        }
        if (typeof genre === 'number') return genre;
        if (genre && typeof genre === 'object' && genre.id !== undefined) return genre.id;
        return genre;
    });
}

/**
 * Unico contratto di normalizzazione del marcatore anime.
 */
function normalizeAnimeMarker(item, options = {}) {
    if (!item || typeof item !== 'object') return false;
    if (typeof item._isAnime === 'boolean') return item._isAnime;

    const opts = options && typeof options === 'object' ? options : {};
    const rawId = String(item.id || item.stremioId || '').replace(/_ita_offset$/, '');
    let isAnime = item.type === 'anime'
        || rawId.startsWith('kitsu:')
        || rawId.startsWith('anilist:');

    if (!isAnime) {
        let tipo = opts.tipo;
        if (!tipo && item.type) {
            tipo = item.type;
        }
        const tipoNormalizzato = normalizeTipoAnime(tipo);
        if (tipoNormalizzato) {
            tipo = tipoNormalizzato;
        } else if (tipo !== undefined) {
            tipo = null;
        }

        const title = opts.title || item.title || item.name || item.rawTMDB?.title || item.rawTMDB?.name;

        isAnime = isAnimeContent({
            tmdbId: opts.tmdbId ?? extractAnimeTmdbId(item),
            title,
            genreIds: opts.genreIds ?? extractAnimeGenreIds(item),
            originalLanguage: opts.originalLanguage
                ?? item.original_language
                ?? item.originalLanguage
                ?? item._originalLanguage
                ?? item.rawTMDB?.original_language,
            keywords: opts.keywords ?? item.keywords ?? item.rawTMDB?.keywords,
            mappingStore: opts.mappingStore,
            tipo
        });
    }

    if (typeof isAnime !== 'boolean') isAnime = ANIME_MARKER_DEFAULT;
    item._isAnime = isAnime;
    return isAnime;
}

/**
 * Normalizza il tipo di contenuto nella coppia canonica ('movie' | 'tv').
 */
function normalizeTipoAnime(tipo) {
    if (tipo === undefined || tipo === null) return null;
    const t = String(tipo).trim().toLowerCase();
    if (t === 'movie') return 'movie';
    if (t === 'tv' || t === 'series' || t === 'anime') return 'tv';
    return null;
}

module.exports = {
    ANIME_MARKER_DEFAULT,
    normalizeTipoAnime,
    normalizeAnimeMarker,
    extractAnimeTmdbId,
    extractAnimeGenreIds,
    isAnimeContent,
    hasAnimeKeyword,
    isAnimeKeywordString,
    hasAnimationGenre,
    flusheLogCandidatiCertify,
    getCandidatiCertify,
    resetCandidatiCertifyForTests
};
