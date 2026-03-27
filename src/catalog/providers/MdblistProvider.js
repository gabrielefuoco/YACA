const { fetchMDBListItems, parseMDBListItems } = require('../../utils/mdblist');
const { filterWatchedItems } = require('../processors/FilterWatched');
const { PAGES_PER_REQUEST } = require('../../config');

async function getMdblistCatalog(id, type, skip, userConfig, tmdbApiKey) {
    const listId = id.replace('yaca_preset_mdblist_', '').replace('mdblist_', '');
    const mdblistKey = userConfig.apiKeys?.mdblist || null;

    let combinedResults = [];
    const MAX_DEPTH = Math.max(PAGES_PER_REQUEST || 3, 3);
    const pageSkips = (userConfig?.config?.hideWatched)
        ? Array.from({ length: MAX_DEPTH }, (_, i) => skip + (i * 20))
        : [skip];

    const parsedPages = await Promise.all(pageSkips.map(async (pageSkip) => {
        try {
            const page = Math.floor(pageSkip / 20) + 1;
            const items = await fetchMDBListItems(listId, mdblistKey, 'it', page);
            return await parseMDBListItems(items, type, tmdbApiKey, 'it-IT');
        } catch (e) {
            return [];
        }
    }));

    for (let pageResults of parsedPages) {
        pageResults = await filterWatchedItems(pageResults, userConfig);
        combinedResults.push(...pageResults);

        if (combinedResults.length >= 20 || pageResults.length === 0 || !userConfig?.config?.hideWatched) break;
    }

    return combinedResults.slice(0, 20);
}

module.exports = { getMdblistCatalog };
