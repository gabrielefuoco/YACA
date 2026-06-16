const fs = require('fs');
const path = './src/data/presets.js';
let content = fs.readFileSync(path, 'utf8');

let [catalogsPart, templatesPart] = content.split('const profileTemplates = [');

let lines = catalogsPart.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (!line.trim().startsWith('{ id:')) continue;

    // FIX 2: Series without 'without_keywords' for anime
    if (line.includes("type: 'series'") && !line.includes("without_keywords") && !line.includes("210024") && !line.includes("preset_anime") && !line.includes("Anime")) {
        line = line.replace(/\s*\}\]\s*\}\s*,?$/, ", without_keywords: '210024' }] },");
    }

    // FIX 4: Vote count for vote_average.desc
    if (line.includes("sort_by: 'vote_average.desc'")) {
        if (!line.includes("'vote_count.gte'")) {
            line = line.replace(/\s*\}\]\s*\}\s*,?$/, ", 'vote_count.gte': 200 }] },");
        } else {
            line = line.replace(/'vote_count\.gte':\s*(\d+)/, (match, p1) => {
                let num = parseInt(p1, 10);
                if (num < 100) {
                    let limit = line.includes("type: 'movie'") ? 200 : 100;
                    return `'vote_count.gte': ${limit}`;
                }
                return match;
            });
        }
    }

    // FIX 4: Vote count for popularity.desc (if missing)
    if (line.includes("sort_by: 'popularity.desc'") && !line.includes("'vote_count.gte'")) {
        if (!line.includes("preset_new_") && !line.includes("recent") && !line.includes("eps") && !line.includes("Simulcast")) {
            line = line.replace(/\s*\}\]\s*\}\s*,?$/, ", 'vote_count.gte': 10 }] },");
        }
    }

    lines[i] = line;
}

catalogsPart = lines.join('\n');

// ADD NEW CATALOGS
const newCatalogs = `
        // =============================================
        // --- ➕ NUOVI CATALOGHI ---
        // =============================================
        { id: 'preset_a24_horror', name: 'A24: Horror & Thriller', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.A24, with_genres: \`\${TMDB_GENRES.MOVIE.Horror}|\${TMDB_GENRES.MOVIE.Thriller}\`, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_vampires_werewolves', name: 'Vampiri & Lupi Mannari', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '3133|12377|12564|12377', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_cyberpunk_series', name: 'Cyberpunk & Distopia (Serie)', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '12190|4565|156556|210086', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_top_current_year', name: 'Il meglio dell\\'anno', category: '🔥 Top, Trend & Trakt', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', primary_release_year: today.getFullYear(), sort_by: 'vote_average.desc', 'vote_count.gte': 100 }] },
`;

catalogsPart = catalogsPart.replace(/\s*\];\s*\};\s*$/, newCatalogs + '\n    ];\n};\n\n');

// Update profiles template part ONLY
templatesPart = templatesPart.replace(/'preset_pop_anime'/g, "'preset_pop_anime', 'preset_top_current_year'");
templatesPart = templatesPart.replace(/'preset_pure_comedy'/g, "'preset_pure_comedy', 'preset_top_current_year'");
templatesPart = templatesPart.replace(/'preset_nolan'/g, "'preset_nolan', 'preset_cyberpunk_series'");
templatesPart = templatesPart.replace(/'preset_kdrama_thriller'/g, "'preset_kdrama_thriller', 'preset_a24_horror', 'preset_vampires_werewolves'");
templatesPart = templatesPart.replace(/'preset_oscar_winners'/g, "'preset_oscar_winners', 'preset_a24_horror'");
templatesPart = templatesPart.replace(/'preset_crime_procedural'/g, "'preset_crime_procedural', 'preset_cyberpunk_series'");

content = catalogsPart + 'const profileTemplates = [' + templatesPart;

fs.writeFileSync(path, content, 'utf8');
console.log("Done");
