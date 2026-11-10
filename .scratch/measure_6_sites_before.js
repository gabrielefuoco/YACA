const indice = require('../src/indice');
const { catalogHandler } = require('../src/stremio/catalogHandler');
const { getWatchlistCatalog } = require('../src/stremio/providers/WatchlistProvider');
const { fetchPopularFallbackIds, composeCandidateIds } = require('../src/pool/composer');
const { serveHybridCatalog } = require('../src/stremio/hybridServing');
const { idrataEImpaginaCandidati } = require('../src/stremio/idratazione');
const UserLibraryItem = require('../src/library/models/UserLibraryItem');
const mongoose = require('mongoose');
const fs = require('fs');

async function main() {
    await indice.init();

    const kidsProfile = {
        id: 'sim_prof_famiglia',
        name: '👨‍👩‍👧‍👦 Bambini & Famiglia',
        settings: {
            kidsMode: true,
            typeSelectors: { film: false, serie: false, anime: null }
        }
    };

    const userConfig = {
        userId: 'sim_user_yaca',
        addonUuid: 'sim-uuid-yaca',
        activeProfileId: 'sim_prof_famiglia',
        profiles: [kidsProfile],
        apiKeys: {
            tmdb: 'fake_key'
        }
    };

    const results = {};

    // SITE 1: catalogHandler.js - applyKidsMode after fetch slice
    // We test 10 general presets under kidsMode: true
    const testCatalogsSite1 = [
        'preset_pop_movies',
        'preset_pop_series',
        'preset_top_rated_movies',
        'preset_top_rated_series',
        'preset_new_movies',
        'preset_new_series',
        'preset_grandi_registi',
        'preset_blockbusters',
        'preset_80s_movies',
        'preset_90s_movies'
    ];
    let site1Short = 0, site1Empty = 0, site1Full = 0;
    const site1Details = [];
    for (const catId of testCatalogsSite1) {
        const type = catId.includes('series') ? 'series' : 'movie';
        const res = await catalogHandler({ id: catId, type, extra: { skip: 0 } }, userConfig, 'http://localhost:7000');
        const count = res?.metas?.length || 0;
        if (count === 0) site1Empty++;
        else if (count < 20) site1Short++;
        else site1Full++;
        site1Details.push({ id: catId, count });
    }
    results.site1 = { full: site1Full, short: site1Short, empty: site1Empty, details: site1Details };

    // SITE 2: catalogHandler.js - animeSelector after slice
    // Profile with animeSelector: 'only'
    const animeOnlyConfig = {
        ...userConfig,
        profiles: [{
            id: 'sim_prof_anime',
            name: 'Anime Only',
            settings: {
                kidsMode: false,
                typeSelectors: { film: false, serie: false, anime: 'only' }
            }
        }],
        activeProfileId: 'sim_prof_anime'
    };
    const testCatalogsSite2 = [
        'preset_pop_movies',
        'preset_pop_series',
        'preset_top_rated_movies',
        'preset_top_rated_series',
        'preset_new_movies'
    ];
    let site2Short = 0, site2Empty = 0, site2Full = 0;
    const site2Details = [];
    for (const catId of testCatalogsSite2) {
        const type = catId.includes('series') ? 'series' : 'movie';
        const res = await catalogHandler({ id: catId, type, extra: { skip: 0 } }, animeOnlyConfig, 'http://localhost:7000');
        const count = res?.metas?.length || 0;
        if (count === 0) site2Empty++;
        else if (count < 20) site2Short++;
        else site2Full++;
        site2Details.push({ id: catId, count });
    }
    results.site2 = { full: site2Full, short: site2Short, empty: site2Empty, details: site2Details };

    // SITE 3: catalogHandler.js - isAnimeCatalog after slice
    const testCatalogsSite3 = [
        'preset_pop_anime',
        'preset_anime_kids_series',
        'preset_anime_kids_movies',
        'preset_anime_shonen',
        'preset_anime_classic'
    ];
    let site3Short = 0, site3Empty = 0, site3Full = 0;
    const site3Details = [];
    for (const catId of testCatalogsSite3) {
        const type = catId.includes('movies') ? 'movie' : 'series';
        const res = await catalogHandler({ id: catId, type, extra: { skip: 0 } }, userConfig, 'http://localhost:7000');
        const count = res?.metas?.length || 0;
        if (count === 0) site3Empty++;
        else if (count < 20) site3Short++;
        else site3Full++;
        site3Details.push({ id: catId, count });
    }
    results.site3 = { full: site3Full, short: site3Short, empty: site3Empty, details: site3Details };

    // SITE 4: WatchlistProvider.js - Mongo .limit(20) before kids enrichment
    // Test Watchlist query with a mock database of 30 items (first 20 adult, next 10 kids)
    const testLibraryItems = [];
    // 20 adult movie IDs
    for (let i = 1; i <= 20; i++) {
        testLibraryItems.push({
            itemId: `tt_adult_${i}`,
            type: 'movie',
            name: `Adult Movie ${i}`,
            year: '2020',
            tmdbId: 550 // Fight Club (adult / inappropriate)
        });
    }
    // 10 kids movie IDs
    for (let i = 1; i <= 10; i++) {
        testLibraryItems.push({
            itemId: `tt_kids_${i}`,
            type: 'movie',
            name: `Kids Movie ${i}`,
            year: '2020',
            tmdbId: 862 // Toy Story (kids safe)
        });
    }

    // Mock UserLibraryItem.find
    const origFind = UserLibraryItem.find;
    UserLibraryItem.find = function(filter) {
        return {
            sort: () => ({
                skip: (skipVal) => ({
                    limit: (limitVal) => ({
                        lean: async () => testLibraryItems.slice(skipVal, skipVal + limitVal)
                    })
                })
            })
        };
    };

    const watchlistRes = await getWatchlistCatalog('yaca_watchlist_movies', 'movie', 0, userConfig, kidsProfile.settings);
    // And in catalogHandler it applies applyKidsMode:
    const { applyKidsMode } = require('../src/catalog/kidsModeFilters');
    const watchlistPostKids = applyKidsMode(watchlistRes);
    results.site4 = {
        returnedFromProvider: watchlistRes.length,
        survivedKidsMode: watchlistPostKids.length,
        shortOrEmpty: watchlistPostKids.length < 20
    };
    UserLibraryItem.find = origFind;

    // SITE 5: composer.js - fetchFallbackDirectCatalog / fetchFallbackRows
    // We will measure how many rows fetchFallbackRows returns with limit 20
    const fallbackIds = await fetchPopularFallbackIds('fake_tmdb_key', 'movie', 20, true, null);
    results.site5 = {
        requested: 20,
        returned: fallbackIds.length,
        shortOrEmpty: fallbackIds.length < 20
    };

    // SITE 6: idratazione.js / hybridServing.js
    // Test idrataEImpaginaCandidati where the first 20 candidates are ineligible
    const candidateIds = [
        ...Array.from({ length: 20 }, () => 550), // 20 Fight Club (adult)
        ...Array.from({ length: 20 }, () => 862)  // 20 Toy Story (kids)
    ];
    const hydratedPage = await idrataEImpaginaCandidati({
        recommendationIds: candidateIds,
        skip: 0,
        limit: 20,
        tmdbApiKey: 'fake_key',
        mediaType: 'movie',
        isKidsMode: true
    });
    results.site6 = {
        candidateCount: candidateIds.length,
        hydratedCount: hydratedPage.length,
        shortOrEmpty: hydratedPage.length < 20
    };

    console.log('--- MEASUREMENT RESULTS (BEFORE) ---');
    console.log(JSON.stringify(results, null, 2));
    fs.writeFileSync('.scratch/measure_6_sites_before.json', JSON.stringify(results, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error('Error in main:', err);
    process.exit(1);
});
