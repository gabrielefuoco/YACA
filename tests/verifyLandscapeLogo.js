const { getImageKitUrl } = require('../src/utils/imageProcessor');
const IMAGEKIT_ID = 'yaca_test';

function test() {
    console.log('--- Testing Landscape and Logo URL Generation ---');

    const poster = 'https://image.tmdb.org/t/p/w500/r30pXvKy9vRsmkS7n7q6G66vMQb.jpg';

    // Case 1: Standard Portrait (Backward compatibility)
    const url1 = getImageKitUrl(poster, 'S1 E5', IMAGEKIT_ID);
    console.log('\nCase 1 (Standard Portrait + Text):');
    console.log(url1);
    // Expected contain tr:w-300,h-450 and l-text
    if (url1.includes('tr:w-300,h-450') && url1.includes('l-text')) {
        console.log('✅ OK - Default dimensions and text layer found');
    } else {
        console.error('❌ FAIL - Expected portrait dimensions and text layer');
    }

    // Case 2: Landscape Shape
    const url2 = getImageKitUrl(poster, { posterShape: 'landscape' }, IMAGEKIT_ID);
    console.log('\nCase 2 (Landscape Shape):');
    console.log(url2);
    // Expected contain tr:w-600,h-338
    if (url2.includes('tr:w-600,h-338')) {
        console.log('✅ OK - Landscape dimensions found');
    } else {
        console.error('❌ FAIL - Expected landscape dimensions (w-600,h-338)');
    }

    // Case 3: Logo Overlay
    const url3 = getImageKitUrl(poster, { addLogo: true }, IMAGEKIT_ID);
    console.log('\nCase 3 (Logo Overlay):');
    console.log(url3);
    // Expected contain l-image,i-logo_yaca.png
    if (url3.includes('l-image,i-logo_yaca.png')) {
        console.log('✅ OK - Logo layer found');
    } else {
        console.error('❌ FAIL - Expected logo image layer (l-image,i-logo_yaca.png)');
    }

    // Case 4: Combined Everything
    const url4 = getImageKitUrl(poster, { posterShape: 'landscape', addLogo: true, text: 'PREMIUM' }, IMAGEKIT_ID);
    console.log('\nCase 4 (Combined: Landscape + Logo + Text):');
    console.log(url4);
    if (url4.includes('tr:w-600,h-338') && url4.includes('l-image') && url4.includes('l-text')) {
        console.log('✅ OK - All layers found');
    } else {
        console.error('❌ FAIL - Missing one or more layers in combined URL');
    }

    console.log('\n--- Verification Finished ---');
}

test();
