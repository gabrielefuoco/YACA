require('dotenv').config();
const { getPresets } = require('../src/data/presets');
const tmdb = require('../src/clients/tmdb');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { rateLimitedMap } = require('../src/utils/rateLimiter');

const MIN_ITEMS_THRESHOLD = 60;

async function run() {
    try {
        const tmdbKey = process.env.TMDB_API_KEY;
        if (!tmdbKey) {
            console.error("❌ ERRORE: TMDB_API_KEY non definita nel file .env");
            process.exit(1);
        }

        const tmdbClient = tmdb.createTmdbClient(tmdbKey);
        const presets = getPresets();

        console.log(`🔎 Avvio audit dei cataloghi (soglia minima: ${MIN_ITEMS_THRESHOLD} elementi)...`);
        console.log(`Presets totali da analizzare: ${presets.length}\n`);

        const emptyOrSemiEmpty = [];
        let progress = 0;

        const results = await rateLimitedMap(presets, async (preset) => {
            progress++;
            const type = preset.type;
            const searchType = type === 'series' ? 'tv' : 'movie';
            const endpoint = `/discover/${searchType}`;
            
            let totalResults = 0;
            let provider = 'tmdb';

            // Check if it's a Kitsu provider
            const firstQuery = preset.queries?.[0];
            if (firstQuery && firstQuery.provider === 'kitsu') {
                provider = 'kitsu';
                try {
                    // Simula query a Kitsu
                    // Ad esempio Kitsu trending o generi anime
                    // Possiamo fare una chiamata alle API di Kitsu per contare quanti elementi restituisce per quella categoria/filtro
                    const kitsuUrl = 'https://kitsu.io/api/edge/anime';
                    const params = { 'page[limit]': 1 };
                    
                    if (firstQuery.with_genres) {
                        params['filter[categories]'] = firstQuery.with_genres;
                    }
                    if (firstQuery.keyword) {
                        params['filter[text]'] = firstQuery.keyword;
                    }

                    const res = await axios.get(kitsuUrl, { params, timeout: 5000 });
                    totalResults = res.data?.meta?.count || 0;
                } catch (err) {
                    console.error(`  ⚠️ Errore fetch Kitsu per preset '${preset.id}':`, err.message);
                }
            } else {
                // TMDB provider
                // Se ci sono query multiple, sommiamo i total_results di ciascuna per un'approssimazione ottimistica
                for (const query of (preset.queries || [])) {
                    const params = { ...query };
                    delete params.strategy;
                    delete params.provider;

                    // Mappatura generi TV/Movie se necessario
                    if (type === 'series' && params.with_genres) {
                        // Conversione dei generi cinematografici a televisivi per simulare discover corretto
                        const { resolveGenreIds } = require('../src/catalog/providers/TmdbProvider');
                        if (typeof resolveGenreIds === 'function') {
                            const resolved = resolveGenreIds(String(params.with_genres).split(/[|,]/), 'series');
                            params.with_genres = resolved.join(',');
                        }
                    }

                    try {
                        const res = await tmdbClient.get(endpoint, { params, timeout: 5000 });
                        totalResults += res.data?.total_results || 0;
                    } catch (err) {
                        console.error(`  ⚠️ Errore fetch TMDB per preset '${preset.id}':`, err.message);
                    }
                }
            }

            const isLow = totalResults < MIN_ITEMS_THRESHOLD;
            const status = {
                id: preset.id,
                name: preset.name,
                category: preset.category,
                type: preset.type,
                provider,
                totalItems: totalResults,
                isLow
            };

            if (isLow) {
                emptyOrSemiEmpty.push(status);
                console.log(`  ❌ [CRITICO] Catalog '${preset.id}' ("${preset.name}") ha solo ${totalResults} elementi.`);
            } else {
                console.log(`  ✅ [OK] Catalog '${preset.id}' ("${preset.name}") ha ${totalResults} elementi.`);
            }

            return status;
        }, { batchSize: 5, delayMs: 100 });

        const reportPath = path.join(__dirname, '..', 'audit_empty_catalogs_report.json');
        fs.writeFileSync(reportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            totalChecked: presets.length,
            totalCritical: emptyOrSemiEmpty.length,
            criticalList: emptyOrSemiEmpty,
            allResults: results
        }, null, 2), 'utf-8');

        console.log(`\n=================== AUDIT SUMMARY ===================`);
        console.log(`Cataloghi scansionati: ${presets.length}`);
        console.log(`Cataloghi sotto-soglia (<60): ${emptyOrSemiEmpty.length}`);
        console.log(`Report di dettaglio salvato in: ${reportPath}`);
        console.log(`=====================================================`);

    } catch (e) {
        console.error("❌ Errore generale durante l'audit:", e.message);
    }
}

run();
