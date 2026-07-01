require('dotenv').config();
const { getPresets } = require('../src/data/presets');
const tmdb = require('../src/clients/tmdb');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { rateLimitedMap } = require('../src/utils/rateLimiter');
const { buildDiscoveryParams } = require('../src/catalog/providers/TmdbProvider');

async function run() {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) {
        console.error("No TMDB_API_KEY");
        return;
    }
    const tmdbClient = tmdb.createTmdbClient(tmdbKey);
    const presets = getPresets();

    console.log(`🚀 Starting Advanced Catalog Audit (Analysing 3 pages / 60 items per catalog)...`);
    console.log(`Total presets: ${presets.length}\n`);

    const catalogItems = {};

    let count = 0;
    await rateLimitedMap(presets, async (preset) => {
        count++;
        const type = preset.type;
        const searchType = type === 'series' ? 'tv' : 'movie';
        const endpoint = `/discover/${searchType}`;
        const items = new Set();

        const firstQuery = preset.queries?.[0];
        if (!firstQuery) return;

        if (firstQuery.provider === 'kitsu') {
            // Kitsu provider (Anime)
            try {
                let kitsuParams = { sort: 'popularityRank' };
                
                if (firstQuery.text_search || firstQuery.keyword) {
                    kitsuParams['filter[text]'] = firstQuery.text_search || firstQuery.keyword;
                }
                
                if (firstQuery._keywordNames) {
                    const categories = firstQuery._keywordNames
                        .split(/[|,]/)
                        .map(c => c.trim().replace(/\s+/g, '-'))
                        .filter(Boolean)
                        .join(',')
                        .toLowerCase();
                    kitsuParams['filter[categories]'] = categories;
                }
                
                if (type === 'movie') {
                    kitsuParams['filter[subtype]'] = 'movie';
                } else if (type === 'series') {
                    kitsuParams['filter[subtype]'] = 'TV';
                }

                // Map TMDB date filters to Kitsu seasonYear
                const gteDate = firstQuery['first_air_date.gte'] || firstQuery['primary_release_date.gte'];
                const lteDate = firstQuery['first_air_date.lte'] || firstQuery['primary_release_date.lte'];
                const currentYear = new Date().getFullYear();

                if (gteDate || lteDate) {
                    const startYear = gteDate ? gteDate.substring(0, 4) : '1900';
                    const endYear = lteDate ? lteDate.substring(0, 4) : '2030';
                    kitsuParams['filter[seasonYear]'] = `${startYear}..${endYear}`;
                } else {
                    kitsuParams['filter[seasonYear]'] = `1900..${currentYear}`;
                }

                for (let page = 0; page < 3; page++) {
                    const kitsuUrl = 'https://kitsu.io/api/edge/anime';
                    const params = {
                        ...kitsuParams,
                        'page[limit]': 20,
                        'page[offset]': page * 20
                    };
                    const res = await axios.get(kitsuUrl, { params, timeout: 5000 });
                    const data = res.data?.data || [];
                    data.forEach(item => {
                        if (item.id) items.add(`kitsu:${item.id}`);
                    });
                    if (data.length < 20) break;
                }
            } catch (err) {
                console.error(`  Error kitsu preset ${preset.id}:`, err.message);
            }
        } else {
            // TMDB provider
            const query = { ...firstQuery };
            const params = await buildDiscoveryParams(query, tmdbKey, type);
            
            try {
                for (let page = 1; page <= 3; page++) {
                    const pageParams = {
                        ...params,
                        page
                    };
                    const res = await tmdbClient.get(endpoint, { params: pageParams, timeout: 5000 });
                    const results = res.data?.results || [];
                    results.forEach(r => {
                        if (r.id) items.add(`tmdb:${r.id}`);
                    });
                    if (results.length < 20) break;
                }
            } catch (err) {
                console.error(`  Error tmdb preset ${preset.id}:`, err.message);
            }
        }

        catalogItems[preset.id] = {
            id: preset.id,
            name: preset.name,
            type: preset.type,
            items: Array.from(items)
        };

        if (count % 20 === 0 || count === presets.length) {
            console.log(`  Fetched ${count}/${presets.length} presets...`);
        }
    }, { batchSize: 5, delayMs: 150 });

    console.log(`\nAnalyzing overlaps (>10% common items)...`);
    const overlaps = [];

    const keys = Object.keys(catalogItems);
    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            const catA = catalogItems[keys[i]];
            const catB = catalogItems[keys[j]];

            if (catA.type !== catB.type) continue; // Skip different media types
            if (catA.items.length === 0 || catB.items.length === 0) continue;

            const setA = new Set(catA.items);
            const common = catB.items.filter(item => setA.has(item));

            const percentA = (common.length / catA.items.length) * 100;
            const percentB = (common.length / catB.items.length) * 100;

            if (percentA > 10 || percentB > 10) {
                overlaps.push({
                    catA: { id: catA.id, name: catA.name, size: catA.items.length },
                    catB: { id: catB.id, name: catB.name, size: catB.items.length },
                    commonCount: common.length,
                    percentA: percentA.toFixed(1),
                    percentB: percentB.toFixed(1)
                });
            }
        }
    }

    overlaps.sort((a, b) => Math.max(b.percentA, b.percentB) - Math.max(a.percentA, a.percentB));

    const reportPath = path.join(__dirname, '..', 'advanced_catalog_audit_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalChecked: presets.length,
        overlapsCount: overlaps.length,
        overlaps,
        catalogDetails: catalogItems
    }, null, 2), 'utf-8');

    console.log(`\n=================== ADVANCED AUDIT SUMMARY ===================`);
    console.log(`Scanned presets: ${presets.length}`);
    console.log(`Overlapping pairs found (>10%): ${overlaps.length}`);
    console.log(`Report saved to: ${reportPath}`);
    console.log(`==============================================================`);
}

run();
