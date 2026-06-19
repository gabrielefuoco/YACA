const axios = require('axios');

async function testKitsuFilters() {
    const url = 'https://kitsu.io/api/edge/anime';
    
    // Test: episodeLength exact match
    try {
        const res = await axios.get(url, {
            params: {
                'page[limit]': 3,
                'filter[episodeLength]': '24'
            }
        });
        console.log('\n--- Test (episodeLength: 24) ---');
        res.data.data.forEach(item => {
            console.log(`Title: ${item.attributes.canonicalTitle} | EpisodeLength: ${item.attributes.episodeLength}`);
        });
    } catch (e) {
        console.error('Test failed:', e.message);
    }
}

testKitsuFilters();
