const { fetchAnilistCatalog } = require('../../clients/anilist');
const animeMappingStore = require('../../data/animeMappingStore');
const { getDuckDbCatalogFromPreset } = require('./DuckDbProvider');

async function getAnilistSimulcastCatalog(skip = 0) {
    try {
        // Fetch raw AniList media (RELEASING)
        const anilistMedia = await fetchAnilistCatalog('anilist-simulcast', skip);
        
        const tmdbIds = [];
        const seen = new Set();
        
        for (const media of anilistMedia) {
            if (media.idMal) {
                const tmdbId = animeMappingStore.resolveTmdbFromMal(media.idMal);
                if (tmdbId && !seen.has(tmdbId)) {
                    seen.add(tmdbId);
                    tmdbIds.push(tmdbId);
                }
            }
        }

        if (tmdbIds.length === 0) return [];

        // Esegui la query DuckDB per recuperare tutti i metadati in blocco e senza rete
        const preset = {
            type: 'series',
            where: [`id IN (${tmdbIds.join(',')})`],
            orderBy: 'popularity DESC NULLS LAST'
        };

        const metas = await getDuckDbCatalogFromPreset(preset, 0, tmdbIds.length);
        
        return metas;
    } catch (error) {
        console.error('[AnilistProvider] Error fetching simulcast catalog:', error.message);
        return [];
    }
}

module.exports = {
    getAnilistSimulcastCatalog
};
