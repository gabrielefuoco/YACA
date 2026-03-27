const { fetchKitsuCatalog, fetchKitsuEpisodes } = require('../../clients/kitsu');
const { rateLimitedMap } = require('../../utils/rateLimiter');

async function getKitsuCatalog(id, skip) {
    const kitsuParams = { sort: '-popularityRank' };
    
    if (id === 'yaca_anime_ova') kitsuParams['filter[subtype]'] = 'OVA';
    if (id === 'yaca_anime_ona') kitsuParams['filter[subtype]'] = 'ONA';
    if (id === 'yaca_anime_specials') kitsuParams['filter[subtype]'] = 'special';

    try {
        const results = await fetchKitsuCatalog('/anime', skip, kitsuParams);
        
        await rateLimitedMap(
            results,
            async (item) => {
                const kitsuId = item?.id?.replace('kitsu:', '');
                if (!kitsuId) return;
                const episodes = await fetchKitsuEpisodes(kitsuId);
                item.videos = episodes || [];
            },
            { batchSize: 3, delayMs: 100 }
        );

        return results;
    } catch (e) {
        return [];
    }
}

module.exports = { getKitsuCatalog };
