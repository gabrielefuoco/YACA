const { connectMongo } = require('../../src/utils/mongoConnect');
const mongoose = require('mongoose');
require('dotenv').config();
const { buildSharedHeroCatalogs } = require('../../src/engines/hybridRecommendations');
const duckDbStore = require('../../src/db/duckDbStore');
const animeMappingStore = require('../../src/data/animeMappingStore');

async function probe() {
    await connectMongo(process.env.MONGODB_URI, { mongoose });
    await duckDbStore.init();
    await animeMappingStore.init();

    const UserAccount = require('../../src/db/models/UserAccount');
    const account = await UserAccount.findOne({ userId: 'REOZrGNRr3' });
    const tmdbKey = account?.apiKeys?.tmdb;

    console.log('Testing probe for Otaku profile context 1c1da0af (series)...');
    const t0 = performance.now();
    const res = await buildSharedHeroCatalogs({
        userId: 'REOZrGNRr3',
        context: '1c1da0af',
        mediaType: 'series',
        traktToken: null,
        tmdbApiKey: tmdbKey,
        kidsMode: false,
        userConfig: null,
        typeSelectors: { film: false, serie: false, anime: 'only' }
    });
    const elapsed = performance.now() - t0;
    console.log('Elapsed ms:', elapsed.toFixed(1));
    console.log('Assigned counts (series):');
    const catalogSets = {};
    for (const [cat, items] of Object.entries(res.catalogs)) {
        console.log(`  ${cat}: ${items.length} items`);
        catalogSets[cat] = new Set(items.map(it => it.id || it));
    }
    console.log('Trakt meta (series):', res.trakt);

    // Verifica disgiunzione (sovrapposizioni a coppie)
    const catKeys = Object.keys(catalogSets);
    let totalOverlaps = 0;
    for (let i = 0; i < catKeys.length; i++) {
        for (let j = i + 1; j < catKeys.length; j++) {
            const intersection = [...catalogSets[catKeys[i]]].filter(x => catalogSets[catKeys[j]].has(x));
            if (intersection.length > 0) {
                console.error(`OVERLAP DETECTED between ${catKeys[i]} and ${catKeys[j]}: ${intersection.length}`);
                totalOverlaps += intersection.length;
            }
        }
    }
    console.log(`Disjointness check (series): 0 overlaps? ${totalOverlaps === 0} (total overlaps: ${totalOverlaps})`);

    console.log('\nTesting probe for Otaku profile context 1c1da0af (movie)...');
    const t1 = performance.now();
    const resM = await buildSharedHeroCatalogs({
        userId: 'REOZrGNRr3',
        context: '1c1da0af',
        mediaType: 'movie',
        traktToken: null,
        tmdbApiKey: tmdbKey,
        kidsMode: false,
        userConfig: null,
        typeSelectors: { film: false, serie: false, anime: 'only' }
    });
    const elapsedM = performance.now() - t1;
    console.log('Elapsed ms:', elapsedM.toFixed(1));
    console.log('Assigned counts (movie):');
    const movieCatalogSets = {};
    for (const [cat, items] of Object.entries(resM.catalogs)) {
        console.log(`  ${cat}: ${items.length} items`);
        movieCatalogSets[cat] = new Set(items.map(it => it.id || it));
    }
    console.log('Trakt meta (movie):', resM.trakt);

    let totalMovieOverlaps = 0;
    const movieCatKeys = Object.keys(movieCatalogSets);
    for (let i = 0; i < movieCatKeys.length; i++) {
        for (let j = i + 1; j < movieCatKeys.length; j++) {
            const intersection = [...movieCatalogSets[movieCatKeys[i]]].filter(x => movieCatalogSets[movieCatKeys[j]].has(x));
            if (intersection.length > 0) {
                console.error(`OVERLAP DETECTED between ${movieCatKeys[i]} and ${movieCatKeys[j]}: ${intersection.length}`);
                totalMovieOverlaps += intersection.length;
            }
        }
    }
    console.log(`Disjointness check (movie): 0 overlaps? ${totalMovieOverlaps === 0} (total overlaps: ${totalMovieOverlaps})`);

    await mongoose.disconnect();
    process.exit(0);
}
probe().catch(e => { console.error(e); process.exit(1); });
