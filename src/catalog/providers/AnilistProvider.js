const { fetchAnilistCatalog } = require('../../clients/anilist');
const animeMappingStore = require('../../data/animeMappingStore');
const { getTmdbMetaDetails } = require('../../clients/tmdb');

async function getAnilistSimulcastCatalog(skip = 0, tmdbApiKey) {
    try {
        // Fetch raw AniList media (RELEASING)
        const anilistMedia = await fetchAnilistCatalog('anilist-simulcast', skip);
        
        const itemsToFetch = [];
        
        for (const media of anilistMedia) {
            if (media.idMal) {
                const tmdbId = animeMappingStore.resolveTmdbFromMal(media.idMal);
                if (tmdbId) {
                    const kitsuId = animeMappingStore.resolveKitsuFromMal(media.idMal);
                    itemsToFetch.push({ tmdbId, kitsuId });
                }
            }
        }

        // Deduplicate by TMDB ID
        const uniqueItems = [];
        const seen = new Set();
        for (const item of itemsToFetch) {
            if (!seen.has(item.tmdbId)) {
                seen.add(item.tmdbId);
                uniqueItems.push(item);
            }
        }

        const promises = uniqueItems.map(async ({ tmdbId, kitsuId }) => {
            try {
                // Fetch TMDB meta details directly to ensure perfect consistency
                // Use lightMode equivalent or full fetch? Stremio catalogs prefer light metas.
                // We will fetch full meta, it's fast enough since it caches, but let's map it correctly.
                const meta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, 'tv', {});
                if (meta) {
                    // For preview catalogs, we don't need episodes or extra links
                    delete meta.videos;
                    delete meta.links;
                    delete meta.cast;
                    delete meta.director;
                    delete meta.writer;
                    delete meta.website;
                    delete meta.behaviorHints?.hasScheduledVideos;
                    
                    // Override ID with Kitsu ID so Stremio routes the Meta request to YACA's Kitsu handler!
                    if (kitsuId) {
                        meta.id = `kitsu:${kitsuId}`;
                    }
                }
                return meta;
            } catch (err) {
                return null;
            }
        });

        const results = await Promise.all(promises);
        const metas = results.filter(Boolean);

        return metas;
    } catch (err) {
        console.error('[AnilistProvider] Error fetching simulcast catalog:', err.message);
        return [];
    }
}

module.exports = {
    getAnilistSimulcastCatalog
};
