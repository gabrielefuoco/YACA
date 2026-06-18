require('dotenv').config();
const { getPresets } = require('./src/data/presets');
const tmdb = require('./src/clients/tmdb');
const fs = require('fs');
const path = require('path');

async function run() {
    try {
        const tmdbKey = process.env.TMDB_API_KEY;
        if (!tmdbKey) {
            console.error("TMDB_API_KEY is not defined in environment.");
            return;
        }

        const tmdbClient = tmdb.createTmdbClient(tmdbKey);
        const presets = getPresets();

        console.log(`Loaded ${presets.length} presets from src/data/presets.js`);
        console.log("Starting validation of each preset against TMDB API...");

        const results = [];
        let index = 0;

        for (const preset of presets) {
            index++;
            const tmdbType = (preset.type === 'series') ? 'tv' : 'movie';
            const endpoint = `/discover/${tmdbType}`;

            for (const query of (preset.queries || [])) {
                const params = { ...query };
                delete params.strategy; // Remove 'strategy' since it's not a TMDB param

                // Perform TMDB discover request
                try {
                    const res = await tmdbClient.get(endpoint, { params, timeout: 5000 });
                    const count = res.data?.results?.length || 0;
                    results.push({
                        id: preset.id,
                        name: preset.name,
                        type: preset.type,
                        endpoint,
                        params,
                        status: 'success',
                        count
                    });
                } catch (err) {
                    results.push({
                        id: preset.id,
                        name: preset.name,
                        type: preset.type,
                        endpoint,
                        params,
                        status: 'error',
                        error: err.message,
                        responseStatus: err.response?.status,
                        responseData: err.response?.data
                    });
                }
            }

            // Print progress
            if (index % 10 === 0 || index === presets.length) {
                console.log(`Progress: checked ${index}/${presets.length} presets...`);
            }

            // Sleep 50ms to be gentle to TMDB API
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Write full results to JSON file
        const outputPath = path.join(__dirname, 'preset_validation_results.json');
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');

        // Compile statistics
        const errors = results.filter(r => r.status === 'error');
        const zeroItems = results.filter(r => r.status === 'success' && r.count === 0);
        const successes = results.filter(r => r.status === 'success' && r.count > 0);

        console.log("\n=================== SUMMARY ===================");
        console.log(`Total checks: ${results.length}`);
        console.log(`Successes (returning items): ${successes.length}`);
        console.log(`Zero results (empty catalog): ${zeroItems.length}`);
        console.log(`Errors (TMDB API failed): ${errors.length}`);
        console.log("===============================================");

        if (errors.length > 0) {
            console.log("\n❌ PRESETS WITH API ERRORS:");
            errors.forEach(e => {
                console.log(`- [${e.id}] "${e.name}": ${e.error} (Status: ${e.responseStatus})`);
                console.log(`  Params: ${JSON.stringify(e.params)}`);
            });
        }

        if (zeroItems.length > 0) {
            console.log("\n⚠️ PRESETS RETURNING 0 RESULTS:");
            zeroItems.forEach(z => {
                console.log(`- [${z.id}] "${z.name}"`);
                console.log(`  Params: ${JSON.stringify(z.params)}`);
            });
        }

        console.log(`\nFull report written to: ${outputPath}`);

    } catch (err) {
        console.error("An error occurred during verification script run:", err);
    }
}

run();
