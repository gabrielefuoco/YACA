require('dotenv').config();
const axios = require('axios');

const TMDB_KEY = process.env.TMDB_API_KEY;

async function testTmdbAiring(name, params) {
    console.log(`\n=== Esecuzione Query TMDB: ${name} ===`);
    try {
        const response = await axios.get('https://api.themoviedb.org/3/discover/tv', {
            params: {
                api_key: TMDB_KEY,
                language: 'it-IT',
                ...params
            }
        });
        
        const results = response.data.results.slice(0, 10);
        results.forEach((item, i) => {
            console.log(`[${i+1}] ${item.name} (ID: ${item.id})`);
        });
    } catch (e) {
        console.error("Errore query TMDB:", e.response ? e.response.data : e.message);
    }
}

async function runTests() {
    if (!TMDB_KEY) {
        console.error("Errore: TMDB_API_KEY non trovata in .env");
        return;
    }

    console.log("=== TEST TMDB AIRING TODAY & SIMULCAST ===");

    // Calcoliamo la data di oggi e di 3 giorni fa
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(today.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

    // TEST 1: Anime Airing Today (Scoperta TMDB per data di messa in onda)
    // Usiamo discover/tv perché /tv/airing_today non supporta i filtri per genere o lingua
    await testTmdbAiring("Anime Usciti tra Ieri e Oggi", {
        'air_date.gte': threeDaysAgoStr,
        'air_date.lte': todayStr,
        'with_original_language': 'ja',
        'with_genres': '16', // Animazione
        'with_keywords': '210024', // Anime
        'sort_by': 'popularity.desc' // Li ordiniamo per popolarità tra quelli appena usciti
    });

    // TEST 2: Serie TV (Non Anime) Uscite tra Ieri e Oggi
    await testTmdbAiring("Serie TV (No Anime) Uscite di Recente", {
        'air_date.gte': threeDaysAgoStr,
        'air_date.lte': todayStr,
        'without_genres': '16', // Escludiamo l'animazione
        'sort_by': 'popularity.desc'
    });

}

runTests();
