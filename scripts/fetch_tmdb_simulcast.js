require('dotenv').config();
const { getPresets } = require('../src/data/presets');
const tmdb = require('../src/clients/tmdb');
const fs = require('fs');
const path = require('path');

async function run() {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) {
        console.error("TMDB_API_KEY is not defined in environment.");
        return;
    }

    const tmdbClient = tmdb.createTmdbClient(tmdbKey);
    const presets = getPresets();
    const preset = presets.find(p => p.id === 'preset_anime_simulcast');

    if (!preset) {
        console.error("Preset preset_anime_simulcast not found!");
        return;
    }

    const tmdbType = (preset.type === 'series') ? 'tv' : 'movie';
    const endpoint = `/discover/${tmdbType}`;
    
    const query = preset.queries?.[0];
    const paramsBase = { ...query };
    delete paramsBase.strategy;

    const pages = 6;
    let textOutput = `=== Catalog: ${preset.id} (${preset.name}) ===\n`;
    textOutput += `Parameters: ${JSON.stringify(paramsBase, null, 2)}\n\n`;
    
    let totalItems = 0;

    for (let page = 1; page <= pages; page++) {
        const params = { ...paramsBase, page };
        try {
            console.log(`Fetching page ${page}...`);
            const res = await tmdbClient.get(endpoint, { params, timeout: 10000 });
            const results = res.data?.results || [];
            
            if (results.length === 0) {
                console.log(`No results on page ${page}`);
                break;
            }

            results.forEach((item, index) => {
                totalItems++;
                textOutput += `${totalItems.toString().padStart(3, ' ')}. [ID: ${item.id}] ${item.name || item.title}\n`;
            });
        } catch (err) {
            console.error(`Failed to fetch page ${page}:`, err.message);
            break;
        }
    }

    const outPath = path.join(__dirname, '..', 'simulcast_report.txt');
    fs.writeFileSync(outPath, textOutput, 'utf-8');
    console.log(`\nFetched ${totalItems} items across ${pages} pages.`);
    console.log(`Saved report to ${outPath}`);
    console.log('\nPreview (first 20 items):');
    console.log(textOutput.split('\n').slice(0, 25).join('\n'));
}

run();
