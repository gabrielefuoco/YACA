const fs = require('fs');
const path = './src/data/presets.js';
let content = fs.readFileSync(path, 'utf8');

const newCatalogs = `
        // =============================================
        // --- ➕ NUOVI CATALOGHI (Mainstream & Thematic) ---
        // =============================================
        { id: 'preset_romcom', name: 'Commedie Romantiche', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '35,10749', sort_by: 'popularity.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_action_blockbusters', name: 'Azione, Motori & Esplosioni', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 28, with_keywords: '10051|208035|4565|1701', sort_by: 'revenue.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_psych_thriller', name: 'Thriller Psicologici', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 53, with_keywords: '15001|12377|12988|10391', sort_by: 'popularity.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_reality_shows', name: 'Reality Show & Competizioni', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 10764, sort_by: 'popularity.desc', 'vote_count.gte': 5, without_keywords: '210024' }] },
        { id: 'preset_fantasy_magic', name: 'Grandi Saghe Fantasy & Magia', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '14,12', with_keywords: '12554|6092|3205', sort_by: 'revenue.desc', 'vote_count.gte': 100 }] },
        
        { id: 'preset_italian_comedy', name: 'Commedie Italiane', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'it', with_genres: 35, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_turkish_dizi', name: 'Serie Turche (Dizi)', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'tr', with_genres: '18|10766', sort_by: 'popularity.desc', 'vote_count.gte': 5, without_keywords: '210024' }] },
        { id: 'preset_teen_drama_comedy', name: 'High School & Teen Drama', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '35|18', with_keywords: '6270|10683|11156|315570', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_keywords: '210024' }] },
        { id: 'preset_zombies', name: 'Zombie & Infezioni', category: '🎭 Generi & Tematiche', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '12377|4565|10483', with_genres: '27|10765', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_keywords: '210024' }] },
        { id: 'preset_treasure_hunters', name: 'Cacciatori di Tesori & Avventurieri', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 12, with_keywords: '10084|156525|4328', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },

        { id: 'preset_adult_animation', name: 'Animazione per Adulti', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '16,35', with_keywords: '158536|187056', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_keywords: '210024' }] },
        { id: 'preset_giant_monsters', name: 'Squali & Mostri Giganti', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '10466|156095|257007|12335', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_slapstick_comedy', name: 'Commedia Demenziale', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 35, with_keywords: '14185|175402|34117|9716', sort_by: 'popularity.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_extreme_survival', name: 'Sopravvivenza Estrema', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '4564|285366|3335', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_sports_underdog', name: 'Storie di Sport & Riscatto', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '6075|10505|22822', with_genres: 18, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },

        // =============================================
        // --- 📺 NETWORKS & PIATTAFORME ---
        // =============================================
        { id: 'preset_netflix_movies', name: 'Film su Netflix', category: '📺 Serie TV & Docu', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_watch_providers: 8, watch_region: 'US', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_amazon_movies', name: 'Film su Prime Video', category: '📺 Serie TV & Docu', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_watch_providers: 119, watch_region: 'US', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_disney_movies', name: 'Film su Disney+', category: '📺 Serie TV & Docu', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_watch_providers: 337, watch_region: 'US', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_hbo_max_movies', name: 'Film su Max', category: '📺 Serie TV & Docu', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_watch_providers: 384, watch_region: 'US', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        
        { id: 'preset_hbo_max_series', name: 'Serie su Max', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: 3186, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_hulu_series', name: 'Serie su Hulu', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: 453, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_paramount_series', name: 'Serie su Paramount+', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: 4330, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] }
`;

let [catalogsPart, templatesPart] = content.split('const profileTemplates = [');

catalogsPart = catalogsPart.replace(/\s*\];\s*\};\s*$/, newCatalogs + '\n    ];\n};\n\n');

// Add to profile templates
templatesPart = templatesPart.replace(/'preset_pop_anime'/g, "'preset_pop_anime', 'preset_romcom', 'preset_netflix_movies'");
templatesPart = templatesPart.replace(/'preset_a24'/g, "'preset_a24', 'preset_romcom', 'preset_action_blockbusters', 'preset_psych_thriller', 'preset_italian_comedy', 'preset_netflix_movies', 'preset_amazon_movies', 'preset_disney_movies', 'preset_hbo_max_movies'");
templatesPart = templatesPart.replace(/'preset_hbo'/g, "'preset_hbo', 'preset_hbo_max_series', 'preset_hulu_series', 'preset_paramount_series', 'preset_reality_shows', 'preset_turkish_dizi', 'preset_adult_animation', 'preset_teen_drama_comedy'");
templatesPart = templatesPart.replace(/'preset_sitcoms'/g, "'preset_sitcoms', 'preset_teen_drama_comedy', 'preset_romcom', 'preset_turkish_dizi'");
templatesPart = templatesPart.replace(/'preset_heist'/g, "'preset_heist', 'preset_action_blockbusters', 'preset_giant_monsters', 'preset_zombies', 'preset_treasure_hunters', 'preset_extreme_survival'");
templatesPart = templatesPart.replace(/'preset_neo_noir'/g, "'preset_neo_noir', 'preset_psych_thriller'");
templatesPart = templatesPart.replace(/'preset_stand_up'/g, "'preset_stand_up', 'preset_adult_animation', 'preset_slapstick_comedy'");
templatesPart = templatesPart.replace(/'preset_french_cinema'/g, "'preset_french_cinema', 'preset_italian_comedy', 'preset_turkish_dizi'");
templatesPart = templatesPart.replace(/'preset_true_crime'/g, "'preset_true_crime', 'preset_reality_shows', 'preset_sports_underdog'");
templatesPart = templatesPart.replace(/'preset_scary_horror'/g, "'preset_scary_horror', 'preset_zombies'");

content = catalogsPart + 'const profileTemplates = [' + templatesPart;

fs.writeFileSync(path, content, 'utf8');
console.log('Added 22 new catalogs');
