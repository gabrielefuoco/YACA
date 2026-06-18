require('dotenv').config();
const axios = require('axios');

const TMDB_KEY = process.env.TMDB_API_KEY;

async function fetchTmdbIsekai() {
    console.log(`\n=== Esecuzione Query TMDB: Isekai (2023-2026) ===`);
    try {
        const response = await axios.get('https://api.themoviedb.org/3/discover/tv', {
            params: {
                api_key: TMDB_KEY,
                language: 'it-IT',
                with_original_language: 'ja',
                with_genres: '16', // Animazione
                with_keywords: '237451|291482|196984|12554', // Isekai keywords trovati in YACA
                'first_air_date.gte': '2023-01-01',
                'first_air_date.lte': '2026-12-31',
                sort_by: 'popularity.desc'
            }
        });
        
        const results = response.data.results.slice(0, 20);
        results.forEach((item, i) => {
            console.log(`[${i+1}] ${item.name} (Popolarità: ${item.popularity.toFixed(1)}, Anno: ${item.first_air_date?.split('-')[0]})`);
        });
    } catch (e) {
        console.error("Errore query TMDB:", e.response ? e.response.data : e.message);
    }
}

async function fetchKitsuIsekai() {
    console.log(`\n=== Esecuzione Query Kitsu: Isekai (2023-2026) ===`);
    try {
        const response = await axios.get('https://kitsu.io/api/edge/anime', {
            params: {
                'filter[categories]': 'isekai',
                'filter[year]': '2023..2026',
                'sort': 'popularityRank',
                'page[limit]': 20
            }
        });
        
        const animes = response.data.data;
        animes.forEach((anime, i) => {
            const attrs = anime.attributes;
            console.log(`[${i+1}] ${attrs.canonicalTitle} (Popolarità Rank: ${attrs.popularityRank}, Anno: ${attrs.startDate?.split('-')[0]})`);
        });
    } catch (e) {
        console.error("Errore query Kitsu:", e.response ? e.response.data : e.message);
    }
}

async function runTests() {
    if (!TMDB_KEY) {
        console.error("Errore: TMDB_API_KEY non trovata in .env");
        return;
    }
    console.log("=== COMPARAZIONE TMDB VS KITSU (ISEKAI 2023-2026) ===");
    await fetchTmdbIsekai();
    await fetchKitsuIsekai();
}

runTests();
