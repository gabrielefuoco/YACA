require('dotenv').config();
const axios = require('axios');

const TMDB_API_KEY = process.env.TMDB_API_KEY;

const tests = [
    { name: "Shonen", params: { with_genres: '16', with_keywords: '207826', with_original_language: 'ja', sort_by: 'popularity.desc' } },
    { name: "Seinen", params: { with_genres: '16', with_keywords: '195668', with_original_language: 'ja', sort_by: 'popularity.desc' } },
    { name: "Isekai", params: { with_genres: '16', with_keywords: '237451', with_original_language: 'ja', sort_by: 'popularity.desc' } },
    { name: "Popolari", params: { with_genres: '16', with_keywords: '210024', with_original_language: 'ja', sort_by: 'popularity.desc' } }, // keyword "anime"
];

async function runTests() {
    for (const t of tests) {
        try {
            const res = await axios.get(`https://api.themoviedb.org/3/discover/tv`, {
                params: {
                    api_key: TMDB_API_KEY,
                    ...t.params
                }
            });
            console.log(`\n▶️ Test Discover: ${t.name} (Trovati: ${res.data.total_results})`);
            res.data.results.slice(0, 5).forEach(r => console.log(`   - ${r.name} (Pop: ${r.popularity})`));
        } catch (e) {
            console.error(e.message);
        }
    }
}
runTests();
