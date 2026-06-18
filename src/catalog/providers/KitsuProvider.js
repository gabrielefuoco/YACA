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

    // Map TMDB Date Filters to Kitsu seasonYear
    const gteDate = filters['first_air_date.gte'] || filters['primary_release_date.gte'];
    const lteDate = filters['first_air_date.lte'] || filters['primary_release_date.lte'];
    
    const currentYear = new Date().getFullYear();
    
    if (gteDate || lteDate) {
        const startYear = gteDate ? gteDate.substring(0, 4) : '1900';
        const endYear = lteDate ? lteDate.substring(0, 4) : '2030';
        kitsuParams['filter[seasonYear]'] = `${startYear}..${endYear}`;
    } else {
        // Exclude future anime by default using seasonYear instead of status 
        // because Kitsu API ignores subtype filters when status is used!
        kitsuParams['filter[seasonYear]'] = `1900..${currentYear}`;
    }

    if (filters.sort_by) {
        if (filters.sort_by.includes('popularity')) kitsuParams.sort = '-popularityRank';
        if (filters.sort_by.includes('first_air_date')) kitsuParams.sort = '-startDate';
        if (filters.sort_by.includes('vote_average')) kitsuParams.sort = '-averageRating';
    }

    try {
        let results = await fetchKitsuCatalog('/anime', skip, kitsuParams);
        
        // POST-FETCH FILTER: Kitsu API sometimes ignores filter[subtype] when combined with multiple filters (e.g. status + categories).
        // To guarantee accuracy for Movie vs Series catalogs, we enforce it locally.
        if (type === 'movie') {
            results = results.filter(item => item._kitsu_subtype === 'movie' || item._kitsu_subtype === 'special');
        } else if (type === 'series') {
            results = results.filter(item => item._kitsu_subtype === 'TV' || item._kitsu_subtype === 'ONA' || item._kitsu_subtype === 'OVA');
        }

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
