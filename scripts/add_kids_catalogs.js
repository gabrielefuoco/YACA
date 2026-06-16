const fs = require('fs');
const path = './src/data/presets.js';
let content = fs.readFileSync(path, 'utf8');

const newCatalogs = `
        // =============================================
        // --- ➕ NUOVI CATALOGHI (Bambini & Famiglia) ---
        // =============================================
        { id: 'preset_family_movies_live', name: 'Film per Famiglie (Live)', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 10751, without_genres: 16, without_keywords: '210024', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_kids_series', name: 'Cartoni in TV & Serie Kids', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 10762, without_keywords: '210024', sort_by: 'popularity.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_teen_preteen_tv', name: 'Teen & Pre-Teen TV (Live)', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '10762|35', without_genres: 16, without_keywords: '210024', sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_fairy_tales', name: 'Fiabe, Castelli & Principesse', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '3205|3095|12554', without_keywords: '210024', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_animal_protagonists', name: 'Animali Protagonisti', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 10751, with_keywords: '10574|6054|11303', without_keywords: '210024', sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_anime_kids_series', name: 'Anime per Bambini (Serie)', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_genres: '10762|16', with_keywords: '210024', without_keywords: '195668|158536|10410|818', sort_by: 'popularity.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_anime_kids_movies', name: 'Anime per Bambini (Film)', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_genres: '10751,16', with_keywords: '210024', without_keywords: '195668|158536|10410|818', sort_by: 'popularity.desc', 'vote_count.gte': 20 }] }
`;

let [catalogsPart, templatesPart] = content.split('const profileTemplates = [');

catalogsPart = catalogsPart.replace(/\s*\];\s*\};\s*$/, newCatalogs + '\n    ];\n};\n\n');

// Add to profile templates tpl_kids
templatesPart = templatesPart.replace(/'preset_disney_animation'/g, "'preset_disney_animation', 'preset_family_movies_live', 'preset_kids_series', 'preset_teen_preteen_tv', 'preset_fairy_tales', 'preset_animal_protagonists', 'preset_anime_kids_series', 'preset_anime_kids_movies'");

content = catalogsPart + 'const profileTemplates = [' + templatesPart;

fs.writeFileSync(path, content, 'utf8');
console.log('Added kids catalogs');
