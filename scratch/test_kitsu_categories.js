const axios = require('axios');

async function testKitsu() {
    const url = 'https://kitsu.io/api/edge/anime';
    
    // Test 2: multiple categories comma-separated without space
    try {
        const res2 = await axios.get(url, {
            params: {
                'page[limit]': 5,
                'filter[categories]': 'action,romance'
            }
        });
        console.log('\n--- Test 2 (action,romance) ---');
        res2.data.data.forEach(item => {
            console.log(`Title: ${item.attributes.canonicalTitle}`);
        });
    } catch (e) {
        console.error('Test 2 failed:', e.message);
    }

    // Test 3: multiple categories comma-separated with spaces (which backend turns into action,-romance because of replace(/ /g, '-'))
    try {
        const res3 = await axios.get(url, {
            params: {
                'page[limit]': 5,
                'filter[categories]': 'action,-romance'
            }
        });
        console.log('\n--- Test 3 (action,-romance) ---');
        res3.data.data.forEach(item => {
            console.log(`Title: ${item.attributes.canonicalTitle}`);
        });
    } catch (e) {
        console.error('Test 3 failed:', e.message);
    }
}

testKitsu();
