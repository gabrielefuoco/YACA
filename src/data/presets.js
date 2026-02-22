//src/data/presets.js

// Lista dei Cataloghi Pre-Configurati con query API TMDB "Hardcoded"
// Questo permette di bypassare l'AI per cataloghi perfetti e verificati.

const TMDB_GENRES = {
    MOVIE: { Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, SciFi: 878, Thriller: 53, War: 10752, Western: 37 },
    TV: { ActionAdventure: 10759, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10762, Kids: 10762, Mystery: 9648, News: 10763, Reality: 10764, SciFiFantasy: 10765, Soap: 10766, Talk: 10767, WarPolitics: 10768, Western: 37 }
};

const TMDB_COMPANIES = {
    Pixar: 3, Ghibli: 10342, Marvel: 420, DC: 128064, A24: 41077, Blumhouse: 3172, Disney: 2, DreamWorks: 521, Illumination: 3166, Lucasfilm: 1
};

const TMDB_PEOPLE = {
    Nolan: 525, Tarantino: 138, Spielberg: 488, Scorsese: 224, Kubrick: 240, Villeneuve: 137427, Fincher: 1341,
    Lynch: 5602, DelToro: 10828, Peele: 185153, Eastwood: 190, Cameron: 2710, Bay: 865, Carpenter: 887
};

const today = new Date();
const todayStr = today.toISOString().split('T')[0];

const dMovies = new Date();
dMovies.setMonth(dMovies.getMonth() - 2);
const twoMonthsAgoStr = dMovies.toISOString().split('T')[0];

const dSeries = new Date();
dSeries.setMonth(dSeries.getMonth() - 6);
const sixMonthsAgoStr = dSeries.toISOString().split('T')[0];

const dWeek = new Date();
dWeek.setDate(dWeek.getDate() - 14);
const twoWeeksAgoStr = dWeek.toISOString().split('T')[0];

const presets = [
    // --- TOP & TREND (Base) ---
    { id: 'preset_pop_movies', name: 'Film Popolari', category: 'Top & Trend', type: 'movie', filters: { sort_by: 'popularity.desc' } },
    { id: 'preset_pop_series', name: 'Serie TV Popolari', category: 'Top & Trend', type: 'series', filters: { sort_by: 'popularity.desc' } },
    { id: 'preset_new_movies', name: 'Film: Nuove Uscite (Ultimi 2 Mesi)', category: 'Top & Trend', type: 'movie', filters: { 'primary_release_date.lte': todayStr, 'primary_release_date.gte': twoMonthsAgoStr, sort_by: 'popularity.desc' } },
    { id: 'preset_new_series', name: 'Serie TV: Novità (Ultimi 6 Mesi)', category: 'Top & Trend', type: 'series', filters: { 'first_air_date.lte': todayStr, 'first_air_date.gte': sixMonthsAgoStr, sort_by: 'popularity.desc' } },
    { id: 'preset_new_series_eps', name: 'Serie TV: Ultimi Episodi (In Corso)', category: 'Top & Trend', type: 'series', filters: { 'air_date.lte': todayStr, 'air_date.gte': twoWeeksAgoStr, sort_by: 'popularity.desc' } },
    { id: 'preset_pop_anime', name: 'Anime Popolari', category: 'Top & Trend', type: 'series', filters: { with_keywords: '210024', sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_new_anime', name: 'Anime: Novità', category: 'Top & Trend', type: 'series', filters: { with_keywords: '210024', 'first_air_date.lte': todayStr, 'first_air_date.gte': sixMonthsAgoStr, sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_new_anime_eps', name: 'Anime: Nuovi Episodi (Simulcast)', category: 'Top & Trend', type: 'series', filters: { 'air_date.lte': todayStr, 'air_date.gte': twoWeeksAgoStr, with_keywords: '210024', sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation } },

    // --- REGISTI (Film) ---
    { id: 'preset_nolan', name: 'Regia: Christopher Nolan', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Nolan } },
    { id: 'preset_tarantino', name: 'Regia: Quentin Tarantino', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Tarantino } },
    { id: 'preset_scorsese', name: 'Regia: Martin Scorsese', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Scorsese } },
    { id: 'preset_spielberg', name: 'Regia: Steven Spielberg', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Spielberg } },
    { id: 'preset_kubrick', name: 'Regia: Stanley Kubrick', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Kubrick } },
    { id: 'preset_villeneuve', name: 'Regia: Denis Villeneuve', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Villeneuve } },
    { id: 'preset_fincher', name: 'Regia: David Fincher', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Fincher } },
    { id: 'preset_burton', name: 'Regia: Tim Burton', category: 'Grandi Registi', type: 'movie', filters: { with_crew: 510 } }, // ID Burton

    // --- STUDIOS ---
    { id: 'preset_ghibli', name: 'Studio Ghibli: Capolavori Animati', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Ghibli } },
    { id: 'preset_pixar', name: 'Disney Pixar', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Pixar } },
    { id: 'preset_a24', name: 'A24: Cinema Indipendente', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.A24 } },
    { id: 'preset_marvel', name: 'Marvel Cinematic Universe', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Marvel } },
    { id: 'preset_blumhouse', name: 'Blumhouse Horror', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Blumhouse } },
    { id: 'preset_dreamworks', name: 'DreamWorks Animation', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.DreamWorks } },

    // --- DECENNI (Film & Serie) ---
    { id: 'preset_80s_movies', name: 'Cult Anni \'80', category: 'Decenni & Epoche', type: 'movie', filters: { 'primary_release_date.gte': '1980-01-01', 'primary_release_date.lte': '1989-12-31', 'vote_count.gte': 500 } },
    { id: 'preset_90s_movies', name: 'Classici Anni \'90', category: 'Decenni & Epoche', type: 'movie', filters: { 'primary_release_date.gte': '1990-01-01', 'primary_release_date.lte': '1999-12-31', 'vote_count.gte': 1000 } },
    { id: 'preset_00s_movies', name: 'I favolosi Anni 2000', category: 'Decenni & Epoche', type: 'movie', filters: { 'primary_release_date.gte': '2000-01-01', 'primary_release_date.lte': '2009-12-31', 'vote_count.gte': 2000 } },
    { id: 'preset_oscar_winners', name: 'Grandi Film Premiati', category: 'Decenni & Epoche', type: 'movie', filters: { 'vote_average.gte': 8.0, 'vote_count.gte': 3000 } },
    { id: 'preset_b_movies_80s', name: 'B-Movie Trash Anni \'80', category: 'Decenni & Epoche', type: 'movie', filters: { 'primary_release_date.gte': '1980-01-01', 'primary_release_date.lte': '1989-12-31', with_genres: `${TMDB_GENRES.MOVIE.Horror},${TMDB_GENRES.MOVIE.Action}`, 'vote_average.lte': 5.5, 'vote_count.gte': 50 } },

    // --- GENERI MOOD (Film) ---
    { id: 'preset_mindfuck', name: 'Mindfuck & Plot Twists', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Mystery},${TMDB_GENRES.MOVIE.Thriller}`, with_keywords: '978,33633' } }, // 978=plot twist, 33633=mindfuck
    { id: 'preset_pure_comedy', name: 'Commedia Pura (No Dramma)', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Comedy, without_genres: `${TMDB_GENRES.MOVIE.Drama},${TMDB_GENRES.MOVIE.Romance}` } },
    { id: 'preset_scary_horror', name: 'Horror Atmosferico', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '3335,9706' } }, // 3335=psychological horror
    { id: 'preset_cyberpunk', name: 'Atmosfere Cyberpunk', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.SciFi, with_keywords: '4565' } }, // 4565=cyberpunk
    { id: 'preset_heist', name: 'Rapine & Colpi Grossi (Heist)', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Crime},${TMDB_GENRES.MOVIE.Action}`, with_keywords: '10051' } }, // 10051=heist
    { id: 'preset_zombie', name: 'Apocalisse Zombie', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '12377' } }, // 12377=zombie
    { id: 'preset_epic_fantasy', name: 'High Fantasy (Magia e Draghi)', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Fantasy, with_keywords: '3205,11024' } }, // 3205=fairy tale, 11024=magic
    { id: 'preset_hard_scifi', name: 'Hard Sci-Fi nello Spazio', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.SciFi, with_keywords: '161176' } }, // 161176=space exploration

    // --- DOCUMENTARI ---
    { id: 'preset_nature_docs', name: 'Documentari: Natura e Animali', category: 'Documentari', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '4344' } }, // 4344=nature
    { id: 'preset_space_docs', name: 'Documentari: Cosmo e Spazio', category: 'Documentari', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '3801' } }, // 3801=space
    { id: 'preset_true_crime', name: 'Docuserie: True Crime', category: 'Documentari', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '156434' } }, // 156434=true crime
    { id: 'preset_sports_docs', name: 'Docuserie: Sport e Atleti', category: 'Documentari', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '6075' } }, // sport

    // --- SERIE TV ---
    { id: 'preset_sitcoms', name: 'Sitcom Americane', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Comedy, with_keywords: '8596' } }, // 8596=sitcom
    { id: 'preset_scifi_shows', name: 'Serie TV Sci-Fi & Distopiche', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '4565,10053' } },
    { id: 'preset_medical_drama', name: 'Medical Drama', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Drama, with_keywords: '10091' } }, // 10091=hospital
    { id: 'preset_crime_procedural', name: 'Procedurali (Un caso a episodio)', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Crime, with_keywords: '11094' } }, // 11094=police procedural

    // --- ANIME ---
    { id: 'preset_anime_shonen', name: 'Anime: Battle Shōnen', category: 'Anime', type: 'series', filters: { with_keywords: '210024,11545', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_isekai', name: 'Anime: Isekai Fantasy', category: 'Anime', type: 'series', filters: { with_keywords: '210024,286460', with_genres: TMDB_GENRES.TV.Animation } }
];

const profileTemplates = [
    {
        id: 'tpl_all',
        name: 'Generale (Tutto)',
        presets: ['preset_pop_movies', 'preset_pop_series', 'preset_new_movies', 'preset_new_series']
    },
    {
        id: 'tpl_movies',
        name: 'Solo Film',
        presets: ['preset_pop_movies', 'preset_new_movies', 'preset_nolan', 'preset_tarantino', 'preset_scorsese', 'preset_action_blockbuster', 'preset_mindfuck', 'preset_pure_comedy']
    },
    {
        id: 'tpl_series',
        name: 'Solo Serie TV',
        presets: ['preset_pop_series', 'preset_new_series', 'preset_new_series_eps', 'preset_hbo', 'preset_netflix', 'preset_sitcoms', 'preset_true_crime']
    },
    {
        id: 'tpl_anime',
        name: 'Solo Anime',
        presets: ['preset_pop_anime', 'preset_new_anime', 'preset_new_anime_eps', 'preset_anime_shonen', 'preset_anime_isekai', 'preset_ghibli']
    },
    {
        id: 'tpl_kids',
        name: 'Bambini & Famiglia',
        presets: ['preset_pixar', 'preset_disney_anim', 'preset_ghibli']
    }
];

module.exports = { presets, profileTemplates };
