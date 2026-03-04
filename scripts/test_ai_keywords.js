require('dotenv').config();
const { generateTmdbFiltersFromPrompt } = require('./src/ai/router');
const { buildDiscoveryParams } = require('./src/handlers/catalogHandler');

async function testAiKeywords() {
    console.log('--- Testing AI Keyword Resolution ---');
    const mistralKey = process.env.MISTRAL_API_KEY;
    const tmdbApiKey = process.env.TMDB_API_KEY;

    if (!mistralKey || !tmdbApiKey) {
        console.error('Missing API keys in .env');
        return;
    }

    const prompts = [
        "documentari sulla cybersecurity",
        "film coreani di zombie samurai",
        "anime isekai con magia"
    ];

    for (const prompt of prompts) {
        console.log(`\nPrompt: "${prompt}"`);
        const aiFilters = await generateTmdbFiltersFromPrompt(prompt, mistralKey);
        console.log('AI Filters:', JSON.stringify(aiFilters, null, 2));

        const tmdbParams = await buildDiscoveryParams(aiFilters, tmdbApiKey, 'movie');
        console.log('TMDB Discovery Params:', JSON.stringify(tmdbParams, null, 2));
    }
}

testAiKeywords();
