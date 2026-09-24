const { getTmdbMovieDetails } = require('../../clients/tmdb');
const { normalizeContentId } = require('../../utils/contentId');
const duckDbStore = require('../../db/duckDbStore');
const { mapDuckDbRowToMeta } = require('../providers/DuckDbProvider');
const { MAX_BADGE_CACHE_HYDRATION_ITEMS } = require('../constants');

async function hydrateEpisodeBadgesFromCache(metas, tmdbApiKey) {
    if (!tmdbApiKey || !Array.isArray(metas) || metas.length === 0) return;

    await Promise.all(
        metas.slice(0, MAX_BADGE_CACHE_HYDRATION_ITEMS).map(async (item) => {
            const itemId = String(item?.id || '');
            if (!itemId || item.rawTMDB) return;
            // Accept both 'tmdb:123' and bare numeric IDs (from TMDB provider before Kitsu translation)
            const isTmdbId = itemId.startsWith('tmdb:') || /^\d+$/.test(itemId);
            if (!isTmdbId) return;

            try {
                const tmdbId = normalizeContentId(item.id);
                let details = await getTmdbMovieDetails(tmdbApiKey, tmdbId, 'tv', { cacheOnly: true });
                if (!details) {
                    details = await getTmdbMovieDetails(tmdbApiKey, tmdbId, 'tv');
                }
                if (details) {
                    item.rawTMDB = details;
                }
            } catch (_err) {
                // Il recupero badge è best-effort: in caso di errore manteniamo il poster originale.
            }
        })
    );
}

async function hydrateResultsFromLocalDetailsCache(metas, tmdbApiKey, type) {
    if (!tmdbApiKey || !Array.isArray(metas) || metas.length === 0) return;

    const tmdbType = type === 'series' ? 'tv' : 'movie';
    const itemsToHydrate = metas.slice(0, 60).filter(item => {
        if (!item || !item.id) return false;
        // Idratiamo se mancano metadati fondamentali (cast/keywords)
        const isMissingMeta = !(item.cast && item.keywords);
        return isMissingMeta;
    });
    if (itemsToHydrate.length === 0) return;

    const tmdbIds = itemsToHydrate.map(item => normalizeContentId(item.id)).filter(Boolean);

    // Fase 1: Bulk query su DuckDB (parquet) per evitare N chiamate individuali
    let scoringMap = new Map();
    try {
        if (!duckDbStore.isInitialized) {
            await duckDbStore.init();
        }

        const tableName = tmdbType === 'movie' ? 'movies' : 'tv';
        const numericIds = tmdbIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);
        const imdbIds = tmdbIds.filter(id => typeof id === 'string' && /^tt\d+$/.test(id));

        let conditions = [];
        if (numericIds.length > 0) {
            conditions.push(`id IN (${numericIds.join(',')})`);
        }
        if (tableName === 'movies' && imdbIds.length > 0) {
            conditions.push(`imdb_id IN (${imdbIds.map(id => `'${id}'`).join(',')})`);
        }

        if (conditions.length > 0) {
            const sql = `SELECT * FROM ${tableName} WHERE ${conditions.join(' OR ')}`;
            const rows = await duckDbStore.query(sql);

            for (const row of rows) {
                const mappedMeta = mapDuckDbRowToMeta(row, tmdbType === 'movie');
                if (row.id !== null && row.id !== undefined) scoringMap.set(String(row.id), mappedMeta);
                if (row.imdb_id) scoringMap.set(row.imdb_id, mappedMeta);
            }
        }
    } catch (_e) { /* DuckDB miss is non-blocking */ }

    // Fase 2: Idratta i risultati in batch parallelo
    await Promise.all(
        itemsToHydrate.map(async (item) => {
            try {
                const tmdbId = normalizeContentId(item.id);
                const mappedMeta = scoringMap.get(String(tmdbId));

                if (mappedMeta) {
                    item.rawTMDB = mappedMeta.rawTMDB;
                    item.keywords = mappedMeta.keywords || [];
                    item.cast = mappedMeta.rawTMDB?.credits?.cast || [];
                    if (mappedMeta.genre_ids && (!item.genre_ids || item.genre_ids.length === 0)) {
                        item.genre_ids = mappedMeta.genre_ids;
                    }
                    if (mappedMeta.vote_count !== null && mappedMeta.vote_count !== undefined && !item.vote_count) {
                        item.vote_count = mappedMeta.vote_count;
                    }
                    return;
                }

                // Fallback: chiamata individuale alla cache TMDB
                const cachedDetails = await getTmdbMovieDetails(tmdbApiKey, String(tmdbId), tmdbType, { cacheOnly: true });
                if (!cachedDetails) return;

                item.rawTMDB = cachedDetails;
                item.keywords = cachedDetails.keywords?.keywords || cachedDetails.keywords?.results || [];
                item.cast = cachedDetails.credits?.cast || [];
                
            } catch (_err) {
                // Il recupero cache è best-effort
            }
        })
    );
}

module.exports = {
    hydrateEpisodeBadgesFromCache,
    hydrateResultsFromLocalDetailsCache
};
