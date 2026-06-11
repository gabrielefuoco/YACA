require('dotenv').config();
const { generateTmdbFiltersFromPrompt } = require('./src/ai/router');
const { buildDiscoveryParams } = require('./src/engines/ai/discoveryBuilder');

async function test() {
    const mistralKey = process.env.MISTRAL_API_KEY;
    const sanitizedTmdbKey = process.env.TMDB_API_KEY;
    const aiFilters = await generateTmdbFiltersFromPrompt("anime isekai mecha", mistralKey, 'multi_query');
    
    let strategy = aiFilters.strategy || 'discovery';
    let discoverFilters = strategy === 'discovery' && !aiFilters.queries
            ? await buildDiscoveryParams(aiFilters, sanitizedTmdbKey, 'series')
            : aiFilters;
    
    console.log("aiFilters:", JSON.stringify(aiFilters, null, 2));
    console.log("discoverFilters:", JSON.stringify(discoverFilters, null, 2));
}

test().catch(console.error);
