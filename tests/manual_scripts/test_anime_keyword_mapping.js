require('dotenv').config();
const axios = require('axios');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!TMDB_API_KEY) {
    console.error("TMDB_API_KEY non trovata in .env");
    process.exit(1);
}

const terms = [
    'shounen', 'shonen',
    'seinen',
    'shoujo', 'shojo',
    'slice of life',
    'mecha',
    'isekai',
    'dark', 'psychological',
    'anime' // per filtrare solo gli anime? (su TMDB anime è un genere, ID 16, Animation)
];

async function findKeywords() {
    console.log("Ricerca Keyword ID su TMDB...\n");
    for (const term of terms) {
        try {
            const res = await axios.get(`https://api.themoviedb.org/3/search/keyword`, {
                params: {
                    api_key: TMDB_API_KEY,
                    query: term
                }
            });
            const results = res.data.results.slice(0, 3); // Prendi i primi 3 match
            console.log(`🔎 [${term}]`);
            if (results.length > 0) {
                results.forEach(k => console.log(`   ➔ ID: ${k.id} | Nome: "${k.name}"`));
            } else {
                console.log(`   ❌ Nessuna keyword trovata.`);
            }
        } catch (e) {
            console.error(`Errore ricerca ${term}:`, e.message);
        }
    }
}

findKeywords();
