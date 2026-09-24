const duckDbStore = require('../db/duckDbStore');
let ImdbToTmdbMapping = null;
try {
    ImdbToTmdbMapping = require('../db/models/ImdbToTmdbMapping');
} catch (_e) {
    ImdbToTmdbMapping = null;
}

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

/**
 * Risolve la copertina di un elemento della libreria se mancante,
 * interrogando la sorgente più economica disponibile (DuckDB in memoria, poi TMDB con cache).
 * Rispetta rigorosamente qualsiasi copertina già esistente e valida.
 *
 * @param {Object} item - { itemId, tmdbId, type, poster, name }
 * @param {Object} [options] - Opzioni opzionali { tmdbClient, apiKey }
 * @returns {Promise<string|null>} URL del poster o null
 */
async function resolvePoster(item, options = {}) {
    if (!item) return null;

    // Se esiste già una copertina valida, rispettala senza sovrascriverla
    if (typeof item.poster === 'string' && item.poster.trim().length > 0) {
        const trimmed = item.poster.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return trimmed;
        }
        if (trimmed.startsWith('/')) {
            return `${TMDB_IMAGE_BASE}${trimmed}`;
        }
        return trimmed;
    }

    const rawId = String(item.itemId || item._id || item.id || '').trim();
    let effectiveTmdbId = item.tmdbId ? Number(item.tmdbId) : null;

    // 1. Estrai tmdbId da rawId se ha prefisso tmdb: o è puramente numerico
    if (!effectiveTmdbId || isNaN(effectiveTmdbId)) {
        if (/^\d+$/.test(rawId)) {
            effectiveTmdbId = Number(rawId);
        } else if (rawId.startsWith('tmdb:')) {
            const parts = rawId.split(':');
            const numPart = parts.find(p => /^\d+$/.test(p));
            if (numPart) effectiveTmdbId = Number(numPart);
        }
    }

    // 2. Se è un imdbId (tt...), prova a risolvere tramite ImdbToTmdbMapping (senza rete)
    if ((!effectiveTmdbId || isNaN(effectiveTmdbId)) && /^tt\d+$/.test(rawId) && ImdbToTmdbMapping) {
        try {
            const mapping = await ImdbToTmdbMapping.findOne({ imdbId: rawId }).lean();
            if (mapping && mapping.tmdbId) {
                const cleaned = String(mapping.tmdbId).replace(/^tmdb:/i, '').split(':')[0].trim();
                if (/^\d+$/.test(cleaned)) {
                    effectiveTmdbId = Number(cleaned);
                }
            }
        } catch (_err) {
            // Ignora fallimenti db non bloccanti
        }
    }

    // 3. SORGENTE PIÙ ECONOMICA: DuckDB in-memory (file parquet locali, 0ms, 0 chiamate di rete)
    if (effectiveTmdbId && !isNaN(effectiveTmdbId)) {
        try {
            const isTv = item.type === 'series' || item.type === 'tv';
            const primaryTable = isTv ? 'tv' : 'movies';
            const fallbackTable = isTv ? 'movies' : 'tv';

            const primaryRows = await duckDbStore.query(
                `SELECT poster_path FROM ${primaryTable} WHERE id = ? LIMIT 1`,
                [effectiveTmdbId]
            );

            if (primaryRows && primaryRows.length > 0 && primaryRows[0].poster_path) {
                return `${TMDB_IMAGE_BASE}${primaryRows[0].poster_path}`;
            }

            // Fallback tra tabelle (es. anime classificato series ma catalogato in movies)
            const fallbackRows = await duckDbStore.query(
                `SELECT poster_path FROM ${fallbackTable} WHERE id = ? LIMIT 1`,
                [effectiveTmdbId]
            );

            if (fallbackRows && fallbackRows.length > 0 && fallbackRows[0].poster_path) {
                return `${TMDB_IMAGE_BASE}${fallbackRows[0].poster_path}`;
            }
        } catch (_duckErr) {
            // DuckDB non pronto o query non riuscita, fallback
        }
    }

    // 4. SORGENTE SECONDARIA: TMDB API con caching layer (se client o apiKey disponibili)
    const tmdbClient = options.tmdbClient || (options.apiKey ? require('../clients/tmdb').createTmdbClient(options.apiKey) : null);
    if (tmdbClient) {
        try {
            // Se ancora non abbiamo tmdbId ma abbiamo un imdbId
            if (!effectiveTmdbId && /^tt\d+$/.test(rawId)) {
                const findRes = await tmdbClient.get(`/find/${rawId}`, {
                    params: { external_source: 'imdb_id', language: 'it-IT' }
                });
                const movie = findRes.data?.movie_results?.[0];
                const tv = findRes.data?.tv_results?.[0];
                const match = movie || tv;
                if (match?.poster_path) {
                    return `${TMDB_IMAGE_BASE}${match.poster_path}`;
                }
                if (match?.id) effectiveTmdbId = match.id;
            }

            if (effectiveTmdbId) {
                const endpoint = (item.type === 'series' || item.type === 'tv')
                    ? `/tv/${effectiveTmdbId}`
                    : `/movie/${effectiveTmdbId}`;
                const detailRes = await tmdbClient.get(endpoint, { params: { language: 'it-IT' } });
                if (detailRes.data?.poster_path) {
                    return `${TMDB_IMAGE_BASE}${detailRes.data.poster_path}`;
                }
            }
        } catch (_tmdbErr) {
            // Ignora errori di rete TMDB
        }
    }

    return null;
}

module.exports = {
    resolvePoster,
    TMDB_IMAGE_BASE
};
