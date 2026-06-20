require('dotenv').config();
const { getPresets } = require('../src/data/presets');
const tmdb = require('../src/clients/tmdb');
const fs = require('fs');
const path = require('path');
const { rateLimitedMap } = require('../src/utils/rateLimiter');

function checkItemMatches(item, params, type) {
    const mismatches = [];

    // 1. Genre check
    if (params.with_genres) {
        const requiredGenres = String(params.with_genres).split(/[,,|]/).map(Number);
        const itemGenres = (item.genres || []).map(g => g.id);
        const match = requiredGenres.some(rg => itemGenres.includes(rg));
        if (!match) {
            mismatches.push(`missing genres: required one of [${requiredGenres}], got [${itemGenres}]`);
        }
    }

    // 2. Original language check
    if (params.with_original_language) {
        const allowedLangs = String(params.with_original_language).split('|');
        if (!allowedLangs.includes(item.original_language)) {
            mismatches.push(`original_language mismatch: expected one of [${allowedLangs}], got "${item.original_language}"`);
        }
    }
    if (params.without_original_language) {
        const excludedLangs = String(params.without_original_language).split('|');
        if (excludedLangs.includes(item.original_language)) {
            mismatches.push(`excluded original_language: got "${item.original_language}" which is in [${excludedLangs}]`);
        }
    }

    // 3. Crew check
    if (params.with_crew) {
        const requiredCrew = String(params.with_crew).split('|').map(Number);
        const itemCrew = (item.credits?.crew || []).map(c => c.id);
        const match = requiredCrew.some(rc => itemCrew.includes(rc));
        if (!match) {
            mismatches.push(`missing required crew: one of [${requiredCrew}]`);
        }
    }

    // 4. Cast check
    if (params.with_cast) {
        const requiredCast = String(params.with_cast).split('|').map(Number);
        const itemCast = (item.credits?.cast || []).map(c => c.id);
        const match = requiredCast.some(rc => itemCast.includes(rc));
        if (!match) {
            mismatches.push(`missing required cast: one of [${requiredCast}]`);
        }
    }

    // 5. Companies check
    if (params.with_companies) {
        const requiredCompanies = String(params.with_companies).split('|').map(Number);
        const itemCompanies = (item.production_companies || []).map(c => c.id);
        const match = requiredCompanies.some(rc => itemCompanies.includes(rc));
        if (!match) {
            mismatches.push(`missing required companies: one of [${requiredCompanies}]`);
        }
    }

    // 6. Watch Providers check
    if (params.with_watch_providers && params.watch_region) {
        const requiredProviders = String(params.with_watch_providers).split('|').map(Number);
        const region = params.watch_region;
        const provResults = item['watch/providers']?.results?.[region];
        const flatProviders = [];
        if (provResults) {
            ['flatrate', 'rent', 'buy', 'ads'].forEach(key => {
                if (provResults[key]) {
                    provResults[key].forEach(p => flatProviders.push(p.provider_id));
                }
            });
        }
        const match = requiredProviders.some(rp => flatProviders.includes(rp));
        if (!match) {
            mismatches.push(`missing watch provider: required one of [${requiredProviders}] in ${region}`);
        }
    }

    // 7. Keywords check
    if (params.with_keywords || params.without_keywords) {
        const itemKeywords = [];
        const keywordsList = item.keywords?.keywords || item.keywords?.results || [];
        keywordsList.forEach(k => itemKeywords.push(k.id));

        if (params.with_keywords) {
            const requiredKeywords = String(params.with_keywords).split(/[,,|]/).map(Number);
            const match = requiredKeywords.some(rk => itemKeywords.includes(rk));
            if (!match) {
                mismatches.push(`missing required keywords: required one of [${requiredKeywords}], got [${itemKeywords}]`);
            }
        }

        if (params.without_keywords) {
            const excludedKeywords = String(params.without_keywords).split(/[,,|]/).map(Number);
            const foundExclusions = excludedKeywords.filter(ek => itemKeywords.includes(ek));
            if (foundExclusions.length > 0) {
                mismatches.push(`contains excluded keywords: [${foundExclusions}]`);
            }
        }
    }

    return mismatches;
}

async function run() {
    try {
        const tmdbKey = process.env.TMDB_API_KEY;
        if (!tmdbKey) {
            console.error("TMDB_API_KEY is not defined in environment.");
            return;
        }

        const tmdbClient = tmdb.createTmdbClient(tmdbKey);
        const presets = getPresets();

        console.log(`Step 1: Discovering top 20 items for all ${presets.length} presets...`);
        const presetItemsMap = {};
        const uniqueMovieIds = new Set();
        const uniqueTvIds = new Set();

        let progress = 0;
        for (const preset of presets) {
            progress++;
            const tmdbType = (preset.type === 'series') ? 'tv' : 'movie';
            const endpoint = `/discover/${tmdbType}`;
            
            const query = preset.queries?.[0];
            if (!query) continue;

            const params = { ...query };
            delete params.strategy;

            try {
                const res = await tmdbClient.get(endpoint, { params, timeout: 5000 });
                const results = res.data?.results || [];
                const top20 = results.slice(0, 20).map(r => String(r.id));
                presetItemsMap[preset.id] = {
                    name: preset.name,
                    type: preset.type,
                    params,
                    ids: top20
                };
                
                top20.forEach(id => {
                    if (preset.type === 'series') {
                        uniqueTvIds.add(id);
                    } else {
                        uniqueMovieIds.add(id);
                    }
                });
            } catch (err) {
                console.error(`Failed to discover preset ${preset.id}:`, err.message);
            }

            if (progress % 20 === 0 || progress === presets.length) {
                console.log(`  Discovered ${progress}/${presets.length} presets...`);
            }
            await new Promise(resolve => setTimeout(resolve, 30));
        }

        console.log(`\nUnique movies found: ${uniqueMovieIds.size}`);
        console.log(`Unique TV shows found: ${uniqueTvIds.size}`);
        console.log(`Total unique items to fetch details for: ${uniqueMovieIds.size + uniqueTvIds.size}`);

        console.log("\nStep 2: Fetching details, credits, watch providers and keywords for all unique items...");
        const detailsCache = {};
        
        const fetchDetails = async (id, mediaType) => {
            const typeLabel = mediaType === 'series' ? 'tv' : 'movie';
            try {
                const res = await tmdbClient.get(`/${typeLabel}/${id}`, {
                    params: { append_to_response: 'credits,watch/providers,keywords', language: 'en-US' },
                    timeout: 10000
                });
                return { id, mediaType, data: res.data };
            } catch (e) {
                console.error(`Failed to fetch details for ${typeLabel} ${id}:`, e.message);
                return { id, mediaType, error: e.message };
            }
        };

        const uniqueItemsList = [
            ...Array.from(uniqueMovieIds).map(id => ({ id, mediaType: 'movie' })),
            ...Array.from(uniqueTvIds).map(id => ({ id, mediaType: 'series' }))
        ];

        let fetchedCount = 0;
        const detailsResults = await rateLimitedMap(
            uniqueItemsList,
            async (item) => {
                const res = await fetchDetails(item.id, item.mediaType);
                fetchedCount++;
                if (fetchedCount % 100 === 0 || fetchedCount === uniqueItemsList.length) {
                    console.log(`  Fetched details for ${fetchedCount}/${uniqueItemsList.length} items...`);
                }
                return res;
            },
            { batchSize: 8, delayMs: 40 }
        );

        detailsResults.forEach(r => {
            if (r.data) {
                detailsCache[`${r.mediaType}_${r.id}`] = r.data;
            }
        });

        console.log("\nStep 3: Programmatically validating relevance of top 20 items for each preset...");
        const report = {};
        let totalCheckedItems = 0;
        let totalMismatchedItems = 0;

        for (const presetId in presetItemsMap) {
            const preset = presetItemsMap[presetId];
            const presetReport = {
                name: preset.name,
                params: preset.params,
                checked: preset.ids.length,
                mismatches: []
            };

            for (const id of preset.ids) {
                totalCheckedItems++;
                const details = detailsCache[`${preset.type}_${id}`];
                if (!details) {
                    presetReport.mismatches.push({
                        id,
                        error: "Details not available in cache"
                    });
                    totalMismatchedItems++;
                    continue;
                }

                const mismatches = checkItemMatches(details, preset.params, preset.type);
                if (mismatches.length > 0) {
                    presetReport.mismatches.push({
                        id,
                        title: details.title || details.name,
                        mismatches
                    });
                    totalMismatchedItems++;
                }
            }

            report[presetId] = presetReport;
        }

        const reportPath = path.join(__dirname, 'relevance_validation_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

        console.log("\n=================== RELEVANCE REPORT ===================");
        console.log(`Total presets validated: ${Object.keys(presetItemsMap).length}`);
        console.log(`Total items evaluated: ${totalCheckedItems}`);
        console.log(`Total mismatch counts: ${totalMismatchedItems}`);
        console.log(`Success Rate: ${((totalCheckedItems - totalMismatchedItems) / totalCheckedItems * 100).toFixed(2)}%`);
        console.log("=========================================================");

        const criticalPresets = [];
        for (const presetId in report) {
            const r = report[presetId];
            if (r.mismatches.length > 0) {
                criticalPresets.push({
                    id: presetId,
                    name: r.name,
                    mismatchCount: r.mismatches.length,
                    samples: r.mismatches.slice(0, 3)
                });
            }
        }

        if (criticalPresets.length > 0) {
            console.log("\n⚠️ PRESETS WITH MISMATCHED ITEMS:");
            criticalPresets.forEach(cp => {
                console.log(`- [${cp.id}] "${cp.name}": ${cp.mismatchCount}/${report[cp.id].checked} items had mismatches.`);
                cp.samples.forEach(s => {
                    console.log(`  * ID ${s.id} "${s.title || 'Error'}": ${s.mismatches ? s.mismatches.join('; ') : s.error}`);
                });
            });
        } else {
            console.log("\n✅ ALL PRESETS HAVE 100% RELEVANT TOP 20 ITEMS!");
        }

        console.log(`\nDetailed report written to: ${reportPath}`);

    } catch (err) {
        console.error("An error occurred during relevance validation:", err);
    }
}

run();
