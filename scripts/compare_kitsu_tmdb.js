require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const TMDB_API_KEY = process.env.TMDB_API_KEY;

const WITHOUT_KEYWORDS = "198385,353318,214564,360629,284535,256466,356759";

const presets = [
    {
        name: "Popolari", 
        kitsu: { sort: '-userCount' },
        tmdb: { with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc' }
    },
    {
        name: "Shonen", 
        kitsu: { filter: { categories: 'shounen' }, sort: '-userCount' },
        tmdb: { with_genres: '16', with_keywords: '207826', with_original_language: 'ja', sort_by: 'popularity.desc' }
    },
    {
        name: "Seinen", 
        kitsu: { filter: { categories: 'seinen' }, sort: '-averageRating' },
        tmdb: { with_genres: '16', with_keywords: '195668', with_original_language: 'ja', sort_by: 'vote_average.desc', 'vote_count.gte': 50 }
    },
    {
        name: "Shoujo", 
        kitsu: { filter: { categories: 'shoujo' }, sort: '-userCount' },
        tmdb: { with_genres: '16', with_keywords: '206437', with_original_language: 'ja', sort_by: 'popularity.desc' }
    },
    {
        name: "Slice of Life", 
        kitsu: { filter: { categories: 'slice of life' }, sort: '-averageRating' },
        tmdb: { with_genres: '16', with_keywords: '9914', with_original_language: 'ja', sort_by: 'vote_average.desc', 'vote_count.gte': 50 }
    },
    {
        name: "Mecha", 
        kitsu: { filter: { categories: 'mecha' }, sort: '-userCount' },
        tmdb: { with_genres: '16', with_keywords: '10046', with_original_language: 'ja', sort_by: 'popularity.desc' }
    },
    {
        name: "Isekai", 
        kitsu: { filter: { categories: 'isekai' }, sort: '-userCount' },
        tmdb: { with_genres: '16', with_keywords: '237451', with_original_language: 'ja', sort_by: 'popularity.desc' }
    },
    {
        name: "Dark & Psychological", 
        kitsu: { filter: { categories: 'dark,psychological' }, sort: '-averageRating' },
        tmdb: { with_genres: '16', with_keywords: '259094|272553', with_original_language: 'ja', sort_by: 'vote_average.desc', 'vote_count.gte': 50 }
    },
    {
        name: "Action", 
        kitsu: { filter: { categories: 'action' }, sort: '-userCount' },
        tmdb: { with_genres: '16,10759', with_original_language: 'ja', sort_by: 'popularity.desc' }
    },
    {
        name: "Sports", 
        kitsu: { filter: { categories: 'sports' }, sort: '-averageRating' },
        tmdb: { with_genres: '16', with_keywords: '6075', with_original_language: 'ja', sort_by: 'vote_average.desc', 'vote_count.gte': 50 }
    }
];

async function runComparison() {
    let md = `# Comparazione Cataloghi Anime: Kitsu vs TMDB Discover\n\n`;
    md += `Questo documento mostra i primi 5 risultati per ogni preset per verificare la coerenza e pulizia dei cataloghi, usando \`without_keywords\` su TMDB per filtrare hentai.\n\n`;

    for (const p of presets) {
        md += `## Preset: ${p.name}\n`;
        
        let kitsuResults = [];
        try {
            const kRes = await axios.get('https://kitsu.io/api/edge/anime', { params: { page: { limit: 5 }, ...p.kitsu } });
            kitsuResults = kRes.data.data.map(item => item.attributes.canonicalTitle || item.attributes.titles.en_jp);
        } catch (e) { kitsuResults = [`Errore Kitsu: ${e.message}`]; }

        let tmdbResults = [];
        try {
            const tmdbRes = await axios.get('https://api.themoviedb.org/3/discover/tv', {
                params: { api_key: TMDB_API_KEY, without_keywords: WITHOUT_KEYWORDS, ...p.tmdb }
            });
            tmdbResults = tmdbRes.data.results.slice(0, 5).map(item => item.name);
        } catch (e) { tmdbResults = [`Errore TMDB: ${e.message}`]; }

        md += `| **Kitsu (Baseline Attuale)** | **TMDB Discover (Nuovo Metodo)** |\n`;
        md += `|---|---|\n`;
        for (let i=0; i<5; i++) {
            const k = kitsuResults[i] || '-';
            const t = tmdbResults[i] || '-';
            md += `| ${k} | ${t} |\n`;
        }
        md += `\n`;
    }

    const artifactPath = "C:\\Users\\gabri\\.gemini\\antigravity\\brain\\8a6bee0f-79ae-4b2d-9a1a-6c833674a697\\anime_catalog_comparison.md";
    fs.writeFileSync(artifactPath, md, 'utf-8');
    console.log(`Report generato in: ${artifactPath}`);
}

runComparison();
