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

async function getKitsuCatalogFromFilters(filters, type, skip) {
    let kitsuParams = { sort: '-popularityRank' };
    
    if (filters.text_search || filters.keyword) {
        kitsuParams['filter[text]'] = filters.text_search || filters.keyword;
    }
    
    if (filters._keywordNames) {
        kitsuParams['filter[categories]'] = filters._keywordNames.replace(/\|/g, ',');
    }
    
    if (type === 'movie') {
        kitsuParams['filter[subtype]'] = 'movie';
    } else if (type === 'series') {
        kitsuParams['filter[subtype]'] = 'TV';
    }

    if (filters.sort_by) {
        if (filters.sort_by.includes('popularity')) kitsuParams.sort = '-popularityRank';
        if (filters.sort_by.includes('first_air_date')) kitsuParams.sort = '-startDate';
        if (filters.sort_by.includes('vote_average')) kitsuParams.sort = '-averageRating';
    }

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

module.exports = { getKitsuCatalog, getKitsuCatalogFromFilters };
