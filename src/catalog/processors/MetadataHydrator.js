const { getTmdbMovieDetails } = require('../../clients/tmdb');
const { normalizeContentId } = require('../../utils/contentId');
const TmdbScoringData = require('../../models/TmdbScoringData');
const { MAX_BADGE_CACHE_HYDRATION_ITEMS } = require('../constants');
const { rateLimitedMap } = require('../../utils/rateLimiter');

async function hydrateEpisodeBadgesFromCache(metas, tmdbApiKey) {
    if (!tmdbApiKey || !Array.isArray(metas) || metas.length === 0) return;

    await rateLimitedMap(
        metas.slice(0, MAX_BADGE_CACHE_HYDRATION_ITEMS),
        async (item) => {
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
        },
        { batchSize: 3, delayMs: 150 }
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

    // Fase 1: Bulk query su TmdbScoringData per evitare N chiamate individuali
    let scoringMap = new Map();
    try {
        const orConditions = tmdbIds.map(id => {
            if (id.startsWith('tt')) {
                return { imdbId: id };
            } else {
                return { tmdbId: Number(id) };
            }
        });

        const cachedDocs = await TmdbScoringData.find({
            $or: orConditions,
            type: tmdbType
        }).lean();

        for (const doc of cachedDocs) {
            // Store by both tmdbId and imdbId for easier lookup later
            if (doc.tmdbId) scoringMap.set(String(doc.tmdbId), doc);
            if (doc.imdbId) scoringMap.set(doc.imdbId, doc);
        }
    } catch (_e) { /* TmdbScoringData miss is non-blocking */ }

    // Fase 2: Idratta i risultati in batch parallelo
    await Promise.all(
        itemsToHydrate.map(async (item) => {
            try {
                const tmdbId = normalizeContentId(item.id);
                const scoringDoc = scoringMap.get(tmdbId);

                if (scoringDoc) {
                    item.rawTMDB = {
                        id: scoringDoc.tmdbId,
                        genre_ids: scoringDoc.genre_ids,
                        vote_average: scoringDoc.vote_average,
                        vote_count: scoringDoc.vote_count,
                        keywords: { keywords: scoringDoc.keyword_ids.map(id => ({ id })) },
                        credits: {
                            crew: scoringDoc.director_ids.map(id => ({ id, job: 'Director' })),
                            cast: scoringDoc.cast_ids.map(id => ({ id }))
                        }
                    };
                    item.keywords = item.rawTMDB.keywords.keywords;
                    item.cast = item.rawTMDB.credits.cast;
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
