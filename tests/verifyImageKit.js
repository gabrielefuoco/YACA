const { getImageKitUrl } = require('../src/utils/imageProcessor');
const IMAGEKIT_ID = 'yaca_test';

function test() {
    console.log('--- Testing ImageKit URL Generation (REAL IMAGE) ---');

    // The Godfather (1972) - Real TMDB Poster
    const poster1 = 'https://image.tmdb.org/t/p/w500/r30pXvKy9vRsmkS7n7q6G66vMQb.jpg';

    const url1 = getImageKitUrl(poster1, null, IMAGEKIT_ID);
    console.log('Case 1 (No Badge):', url1);
    const expected1 = `https://ik.imagekit.io/${IMAGEKIT_ID}/tr:w-300,h-450/https://image.tmdb.org/t/p/w500/r30pXvKy9vRsmkS7n7q6G66vMQb.jpg`;
    console.assert(url1 === expected1, `Expected ${expected1}, got ${url1}`);

    const url2 = getImageKitUrl(poster1, 'S1 E5', IMAGEKIT_ID);
    console.log('Case 2 (Badge):', url2);
    const expected2 = `https://ik.imagekit.io/${IMAGEKIT_ID}/tr:w-300,h-450,l-text,ie-UzEgRTU,co-FFFFFF,bg-00000080,pa-10,r-10,lx-N10,ly-10,l-end/https://image.tmdb.org/t/p/w500/r30pXvKy9vRsmkS7n7q6G66vMQb.jpg`;
    console.assert(url2 === expected2, `Expected ${expected2}, got ${url2}`);

    console.log('\n--- Test Results Analysis ---');
    console.log('If Scenario 1 shows 404, check if "yaca_test" is valid or if Web Proxy is enabled in ImageKit.');
    console.log('If Scenario 1 works but Scenario 2 fails, the transformation syntax (tr:...) has an error.');
}

test();
