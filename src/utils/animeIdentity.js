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

const ANIME_MARKER_DEFAULT = false;

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
 * @param {string} [params.tipo] - Tipo del contenuto ('movie' | 'tv' | 'series' | 'anime') per disambiguare lo store
 * @returns {boolean}
 */
function isAnimeContent({ tmdbId, genreIds, originalLanguage, keywords, mappingStore, tipo } = {}) {
    let store = mappingStore;
    if (store === undefined) {
        try {
            store = require('../data/animeMappingStore');
        } catch {
            store = null;
        }
    }

    // 1. Lookup rapido nello store certificato (Anibridge / Fribb)
    // Se tipo è specificato, lo inoltriamo a store.isAnimeTmdbId(tmdbId, tipo) per interrogare
    // la sola partizione coerente (movie vs tv) ed evitare collisioni di ID TMDB (ticket 13).
    // Se tipo è assente/undefined, preserviamo la chiamata legacy senza tipo per retrocompatibilità.
    // Un tipo *fornito* ma non riconosciuto vale "nessun namespace": non si ricade sull'unione,
    // altrimenti un errore di scrittura riaprirebbe la collisione in silenzio.
    if (tmdbId && store && typeof store.isAnimeTmdbId === 'function') {
        const storeTipo = normalizeTipoAnime(tipo);
        const storeMatch = storeTipo
            ? store.isAnimeTmdbId(tmdbId, storeTipo)
            : (tipo === undefined ? store.isAnimeTmdbId(tmdbId) : false);
        if (storeMatch) {
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

/**
 * Estrae un TMDB id dai payload Stremio senza richiedere una rete.
 * I suffissi di presentazione (`_ita_offset`) non cambiano l'opera.
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
 *
 * Un boolean già presente è autorevole e viene soltanto propagato. In assenza
 * del marker, Kitsu/AniList e `type: anime` sono prove positive; per i payload
 * TMDB viene usata `isAnimeContent`. Il default unico è `false`: senza prove
 * non abilitiamo enrichment Kitsu, filtri anime o badge-specifici.
 *
 * La funzione muta il payload e restituisce il boolean. Le chiamate successive
 * sono O(1) e non ripetono classificazioni o lookup.
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
        // Ticket 13: ricaviamo il tipo ('movie' o 'tv') da options.tipo o da item.type per inoltrarlo
        // a isAnimeContent ed evitare collisioni di ID TMDB fra film e serie.
        let tipo = opts.tipo;
        if (!tipo && item.type) {
            tipo = item.type;
        }
        // La tabella degli alias sta in un posto solo: `normalizeTipoAnime`.
        const tipoNormalizzato = normalizeTipoAnime(tipo);
        if (tipoNormalizzato) {
            tipo = tipoNormalizzato;
        } else if (tipo !== undefined) {
            // Tipo fornito ma non riconosciuto: nessun namespace, come nello store.
            tipo = null;
        }

        isAnime = isAnimeContent({
            tmdbId: opts.tmdbId ?? extractAnimeTmdbId(item),
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

    // Unico fallback per il marker; `isAnimeContent` resta il resolver
    // canonico, ma non può far ereditare un default implicito al boundary.
    if (typeof isAnime !== 'boolean') isAnime = ANIME_MARKER_DEFAULT;
    item._isAnime = isAnime;
    return isAnime;
}

/**
 * Normalizza il tipo di contenuto nella coppia canonica che lo store anime usa davvero.
 *
 * PERCHÉ ESISTE: TMDB tiene **id separati** per film e serie, quindi il tipo è ciò che
 * disambigua una collisione di numero (il film *Mediterraneo* e la serie anime *Toriko*
 * condividono il 38251). La tabella degli alias vive qui e in nessun altro posto:
 * una seconda copia altrove è il modo in cui un giorno si riapre quel bug in silenzio.
 *
 * @param {string} [tipo] `'movie' | 'series' | 'tv' | 'anime'`
 * @returns {'movie'|'tv'|null} `null` quando il tipo è assente o non riconosciuto: il
 *   chiamante decide se è un errore (la DSL dei filtri solleva) o "nessun namespace" (lo store).
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
    isAnimeContent,
    hasAnimeKeyword,
    isAnimeKeywordString,
    hasAnimationGenre
};
