require('dotenv').config();
const { getAnilistCatalogFromFilters } = require('../src/clients/anilist');

async function test() {
    const filters = {
        provider: 'kitsu',
        strategy: 'discovery',
        _keywordNames: 'seinen',
        sort_by: 'vote_average.desc'
    };
    
    const results = await getAnilistCatalogFromFilters(filters, 'series', 0);
    console.log("Seinen raw results length:", results.length);
    if(results.length > 0) {
        console.log("First item:", results[0].id, results[0].title.romaji);
    }
}
test().catch(console.error);
