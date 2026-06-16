const fs = require('fs');

const categoryMap = {
    // 1. 🔥 Top & Trend
    preset_pop_movies: '🔥 Top & Trend',
    preset_pop_series: '🔥 Top & Trend',
    preset_top_rated_movies: '🔥 Top & Trend',
    preset_top_rated_series: '🔥 Top & Trend',
    preset_new_movies: '🔥 Top & Trend',
    preset_new_series: '🔥 Top & Trend',
    preset_new_series_eps: '🔥 Top & Trend',
    preset_top_current_year: '🔥 Top & Trend',
    preset_oscar_winners: '🔥 Top & Trend',
    preset_blockbusters: '🔥 Top & Trend',

    // 2. 🍿 Serata Leggera & Risate
    preset_feel_good: '🍿 Serata Leggera & Risate',
    preset_pure_comedy: '🍿 Serata Leggera & Risate',
    preset_sitcoms: '🍿 Serata Leggera & Risate',
    preset_stand_up: '🍿 Serata Leggera & Risate',
    preset_romcom: '🍿 Serata Leggera & Risate',
    preset_italian_comedy: '🍿 Serata Leggera & Risate',
    preset_teen_drama_comedy: '🍿 Serata Leggera & Risate',
    preset_teen_drama: '🍿 Serata Leggera & Risate',
    preset_slapstick_comedy: '🍿 Serata Leggera & Risate',
    preset_musical: '🍿 Serata Leggera & Risate',

    // 3. 💥 Adrenalina & Avventura
    preset_heist: '💥 Adrenalina & Avventura',
    preset_spy_action: '💥 Adrenalina & Avventura',
    preset_martial_arts: '💥 Adrenalina & Avventura',
    preset_disaster_movies: '💥 Adrenalina & Avventura',
    preset_action_blockbusters: '💥 Adrenalina & Avventura',
    preset_treasure_hunters: '💥 Adrenalina & Avventura',
    preset_extreme_survival: '💥 Adrenalina & Avventura',
    preset_sports_underdog: '💥 Adrenalina & Avventura',
    preset_big_sagas: '💥 Adrenalina & Avventura',
    preset_war_movies: '💥 Adrenalina & Avventura',
    preset_western: '💥 Adrenalina & Avventura',

    // 4. 🕵️ Crimine, Mistero & Thriller
    preset_whodunit: '🕵️ Crimine, Mistero & Thriller',
    preset_neo_noir: '🕵️ Crimine, Mistero & Thriller',
    preset_tv_mafia: '🕵️ Crimine, Mistero & Thriller',
    preset_tv_politics: '🕵️ Crimine, Mistero & Thriller',
    preset_crime_procedural: '🕵️ Crimine, Mistero & Thriller',
    preset_legal_drama: '🕵️ Crimine, Mistero & Thriller',
    preset_tv_thriller: '🕵️ Crimine, Mistero & Thriller',
    preset_spanish_thriller: '🕵️ Crimine, Mistero & Thriller',
    preset_nordic_noir: '🕵️ Crimine, Mistero & Thriller',
    preset_british_crime: '🕵️ Crimine, Mistero & Thriller',
    preset_german_dark: '🕵️ Crimine, Mistero & Thriller',
    preset_psych_thriller: '🕵️ Crimine, Mistero & Thriller',
    preset_mindfuck: '🕵️ Crimine, Mistero & Thriller',

    // 5. 🐉 Fantascienza & Fantasy
    preset_space_hard_scifi: '🐉 Fantascienza & Fantasy',
    preset_time_travel_movies: '🐉 Fantascienza & Fantasy',
    preset_tv_high_fantasy: '🐉 Fantascienza & Fantasy',
    preset_tv_dystopia: '🐉 Fantascienza & Fantasy',
    preset_tv_superheroes_dark: '🐉 Fantascienza & Fantasy',
    preset_time_travel: '🐉 Fantascienza & Fantasy',
    preset_cyberpunk: '🐉 Fantascienza & Fantasy',
    preset_cyberpunk_series: '🐉 Fantascienza & Fantasy',
    preset_fantasy_magic: '🐉 Fantascienza & Fantasy',
    preset_marvel: '🐉 Fantascienza & Fantasy',
    preset_dc: '🐉 Fantascienza & Fantasy',

    // 6. 👻 Brivido & Paura
    preset_horror_all: '👻 Brivido & Paura',
    preset_scary_horror: '👻 Brivido & Paura',
    preset_slasher_gore: '👻 Brivido & Paura',
    preset_apocalypse_survival: '👻 Brivido & Paura',
    preset_tv_horror: '👻 Brivido & Paura',
    preset_a24_horror: '👻 Brivido & Paura',
    preset_vampires_werewolves: '👻 Brivido & Paura',
    preset_zombies: '👻 Brivido & Paura',
    preset_giant_monsters: '👻 Brivido & Paura',
    preset_blumhouse: '👻 Brivido & Paura',

    // 7. 🎬 Cinema d'Autore & Registi
    preset_nolan: "🎬 Cinema d'Autore & Registi",
    preset_tarantino: "🎬 Cinema d'Autore & Registi",
    preset_scorsese: "🎬 Cinema d'Autore & Registi",
    preset_spielberg: "🎬 Cinema d'Autore & Registi",
    preset_kubrick: "🎬 Cinema d'Autore & Registi",
    preset_villeneuve: "🎬 Cinema d'Autore & Registi",
    preset_fincher: "🎬 Cinema d'Autore & Registi",
    preset_burton: "🎬 Cinema d'Autore & Registi",
    preset_wesanderson: "🎬 Cinema d'Autore & Registi",
    preset_lynch: "🎬 Cinema d'Autore & Registi",
    preset_scott: "🎬 Cinema d'Autore & Registi",
    preset_actor_dicaprio: "🎬 Cinema d'Autore & Registi",
    preset_actor_cruise: "🎬 Cinema d'Autore & Registi",
    preset_actor_reeves: "🎬 Cinema d'Autore & Registi",
    preset_brad_pitt: "🎬 Cinema d'Autore & Registi",
    preset_de_niro: "🎬 Cinema d'Autore & Registi",
    preset_johnny_depp: "🎬 Cinema d'Autore & Registi",
    preset_denzel: "🎬 Cinema d'Autore & Registi",
    preset_nicolas_cage: "🎬 Cinema d'Autore & Registi",
    preset_a24: "🎬 Cinema d'Autore & Registi",
    preset_french_cinema: "🎬 Cinema d'Autore & Registi",
    preset_italian_cinema: "🎬 Cinema d'Autore & Registi",

    // 8. 📺 Network & Piattaforme
    preset_hbo: '📺 Network & Piattaforme',
    preset_netflix: '📺 Network & Piattaforme',
    preset_amazon: '📺 Network & Piattaforme',
    preset_disney_plus: '📺 Network & Piattaforme',
    preset_apple_tv: '📺 Network & Piattaforme',
    preset_netflix_movies: '📺 Network & Piattaforme',
    preset_amazon_movies: '📺 Network & Piattaforme',
    preset_disney_movies: '📺 Network & Piattaforme',
    preset_hbo_max_movies: '📺 Network & Piattaforme',
    preset_hbo_max_series: '📺 Network & Piattaforme',
    preset_hulu_series: '📺 Network & Piattaforme',
    preset_paramount_series: '📺 Network & Piattaforme',

    // 9. 🏮 Solo Anime
    preset_pop_anime: '🏮 Solo Anime',
    preset_new_anime: '🏮 Solo Anime',
    preset_new_anime_eps: '🏮 Solo Anime',
    preset_anime_shonen: '🏮 Solo Anime',
    preset_anime_seinen: '🏮 Solo Anime',
    preset_anime_shoujo: '🏮 Solo Anime',
    preset_anime_slice_of_life: '🏮 Solo Anime',
    preset_anime_mecha: '🏮 Solo Anime',
    preset_anime_isekai: '🏮 Solo Anime',
    preset_anime_dark: '🏮 Solo Anime',
    preset_anime_action: '🏮 Solo Anime',
    preset_anime_sports: '🏮 Solo Anime',
    preset_anime_classic: '🏮 Solo Anime',
    preset_anime_00s: '🏮 Solo Anime',
    preset_anime_movies_top: '🏮 Solo Anime',
    preset_anime_movies_romance: '🏮 Solo Anime',
    preset_ghibli: '🏮 Solo Anime',

    // 10. 🌏 K-Drama, Dizi & Asia
    preset_kdrama_romance: '🌏 K-Drama, Dizi & Asia',
    preset_kdrama_thriller: '🌏 K-Drama, Dizi & Asia',
    preset_asian_action: '🌏 K-Drama, Dizi & Asia',
    preset_cinema_coreano: '🌏 K-Drama, Dizi & Asia',
    preset_bollywood: '🌏 K-Drama, Dizi & Asia',
    preset_turkish_dizi: '🌏 K-Drama, Dizi & Asia',

    // 11. 🌍 Documentari & Storie Vere
    preset_nature_docs: '🌍 Documentari & Storie Vere',
    preset_space_docs: '🌍 Documentari & Storie Vere',
    preset_true_crime: '🌍 Documentari & Storie Vere',
    preset_sports_docs: '🌍 Documentari & Storie Vere',
    preset_doc_music_legends: '🌍 Documentari & Storie Vere',
    preset_doc_food_travel: '🌍 Documentari & Storie Vere',
    preset_doc_history_war: '🌍 Documentari & Storie Vere',
    preset_doc_tech_future: '🌍 Documentari & Storie Vere',
    preset_true_story: '🌍 Documentari & Storie Vere',
    preset_reality_shows: '🌍 Documentari & Storie Vere',
    
    preset_pixar: '👨‍👩‍👧‍👦 Bambini & Famiglia', 
    preset_dreamworks: '👨‍👩‍👧‍👦 Bambini & Famiglia',
    preset_disney_animation: '👨‍👩‍👧‍👦 Bambini & Famiglia',
    preset_sad_romance: '🍿 Serata Leggera & Risate',
    preset_80s_movies: '🔥 Top & Trend', 
    preset_90s_movies: '🔥 Top & Trend',
    preset_00s_movies: '🔥 Top & Trend',
    preset_cult_classics: '🔥 Top & Trend',
    preset_miniseries: '🕵️ Crimine, Mistero & Thriller',
    preset_anthology: '🕵️ Crimine, Mistero & Thriller',
    preset_sketch_comedy: '🍿 Serata Leggera & Risate',
    preset_medical_drama: '🍿 Serata Leggera & Risate',
};

const path = './src/data/presets.js';
let content = fs.readFileSync(path, 'utf8');
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (!line.trim().startsWith('{ id:')) continue;

    const idMatch = line.match(/id:\s*'([^']+)'/);
    if (!idMatch) continue;

    const id = idMatch[1];
    let newCategory = categoryMap[id];

    if (!newCategory) {
        if (id.includes('anime')) newCategory = '🏮 Solo Anime';
        else if (id.includes('doc')) newCategory = '🌍 Documentari & Storie Vere';
        else if (id.includes('comedy')) newCategory = '🍿 Serata Leggera & Risate';
        else newCategory = '🔥 Altri Cataloghi';
    }

    line = line.replace(/category:\s*(['"])[^\1]+?\1/, 'category: "' + newCategory + '"');
    
    lines[i] = line;
}

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Categories reorganized.');
