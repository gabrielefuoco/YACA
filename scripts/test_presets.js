/**
 * Test Script: Verifica ogni singolo preset TMDB
 * Esegue la query /discover per ogni preset e riporta quelli che non restituiscono risultati.
 * 
 * Usage: node scripts/test_presets.js
 */
require('dotenv').config();
const axios = require('axios');
const { getPresets } = require('../src/data/presets');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

// Preset che NON usano /discover (hanno logica custom nel catalogHandler)
const SKIP_IDS = new Set([
    'yaca_hybrid_movies', 'yaca_hybrid_series',
    'yaca_hybrid_popular_movies', 'yaca_hybrid_popular_series',
    'trakt_watchlist_movies', 'trakt_watchlist_series',
    'trakt_history_movies', 'trakt_history_series',
    'trakt_trending_movies', 'trakt_trending_series',
    'trakt_popular_movies', 'trakt_popular_series',
    'trakt_favorites_movies', 'trakt_favorites_series',
    'trakt_recommendations_movies', 'trakt_recommendations_series',
]);

// Filtri custom che non vanno passati direttamente a /discover
const CUSTOM_KEYS = new Set(['strategy', 'similar_to', 'text_search', 'people_list', 'keyword', 'company_name', 'genre_ids', 'year_from', 'year_to', 'runtime_lte', 'runtime_gte', 'watch_provider', 'original_language', 'target']);

async function testPreset(preset) {
    const { id, name, type, filters } = preset;

    // Skip preset senza filtri reali (Trakt, Hybrid)
    if (SKIP_IDS.has(id)) return { id, name, status: 'SKIP', reason: 'Custom handler (non /discover)' };
    if (!filters || Object.keys(filters).length === 0) return { id, name, status: 'SKIP', reason: 'Nessun filtro' };

    const searchType = type === 'series' ? 'tv' : 'movie';
    const params = { api_key: TMDB_API_KEY, language: 'it-IT', page: 1 };

    // Copia solo i filtri validi per TMDB /discover
    for (const [key, value] of Object.entries(filters)) {
        if (CUSTOM_KEYS.has(key)) continue;
        params[key] = value;
    }

    try {
        const res = await axios.get(`${BASE_URL}/discover/${searchType}`, { params, timeout: 10000 });
        const count = res.data?.total_results ?? 0;
        const firstTitle = res.data?.results?.[0]?.title || res.data?.results?.[0]?.name || '(nessuno)';

        if (count === 0) {
            return { id, name, status: 'FAIL', count, reason: 'Zero risultati', params };
        }
        return { id, name, status: 'OK', count, firstTitle };
    } catch (err) {
        const errMsg = err.response?.data?.status_message || err.message;
        return { id, name, status: 'ERROR', reason: errMsg, httpCode: err.response?.status, params };
    }
}

async function main() {
    if (!TMDB_API_KEY) {
        console.error('ERRORE: TMDB_API_KEY mancante nel .env');
        process.exit(1);
    }

    const presets = getPresets();
    console.log(`\n🔍 Test di ${presets.length} preset...\n`);
    console.log('─'.repeat(100));

    const results = [];
    const BATCH_SIZE = 5; // Evita rate limiting

    for (let i = 0; i < presets.length; i += BATCH_SIZE) {
        const batch = presets.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(p => testPreset(p)));
        results.push(...batchResults);

        for (const r of batchResults) {
            const icon = r.status === 'OK' ? '✅' : r.status === 'SKIP' ? '⏭️' : r.status === 'FAIL' ? '❌' : '⚠️';
            const detail = r.status === 'OK'
                ? `${r.count} risultati — es. "${r.firstTitle}"`
                : r.reason;
            console.log(`${icon} [${r.id}] ${r.name} → ${detail}`);
        }

        // Piccola pausa per non eccedere rate limit TMDB (40 req/10s)
        if (i + BATCH_SIZE < presets.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // === RIEPILOGO ===
    console.log('\n' + '═'.repeat(100));
    const ok = results.filter(r => r.status === 'OK');
    const fail = results.filter(r => r.status === 'FAIL');
    const err = results.filter(r => r.status === 'ERROR');
    const skip = results.filter(r => r.status === 'SKIP');

    console.log(`\n📊 RIEPILOGO:`);
    console.log(`   ✅ OK:      ${ok.length}`);
    console.log(`   ❌ FAIL:    ${fail.length} (zero risultati)`);
    console.log(`   ⚠️  ERROR:   ${err.length} (errore API)`);
    console.log(`   ⏭️  SKIP:    ${skip.length} (non testabili)`);

    if (fail.length > 0) {
        console.log(`\n❌ PRESET ROTTI (0 risultati):`);
        for (const f of fail) {
            console.log(`   - ${f.id} ("${f.name}")`);
            console.log(`     Params inviati: ${JSON.stringify(f.params, null, 2).split('\n').join('\n     ')}`);
        }
    }

    if (err.length > 0) {
        console.log(`\n⚠️  PRESET CON ERRORE API:`);
        for (const e of err) {
            console.log(`   - ${e.id} ("${e.name}") → HTTP ${e.httpCode}: ${e.reason}`);
            console.log(`     Params inviati: ${JSON.stringify(e.params, null, 2).split('\n').join('\n     ')}`);
        }
    }

    process.exit(fail.length + err.length > 0 ? 1 : 0);
}

main();
