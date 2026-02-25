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
    Lynch: 5602, DelToro: 10828, Peele: 185153, Eastwood: 190, Cameron: 2710, Bay: 865, Carpenter: 887,
    Hitchcock: 2636, Scott: 578, Miyazaki: 608, Burton: 510, Jackson: 108, WesAnderson: 5655,
    DiCaprio: 6193, Cruise: 500, Reeves: 6384, BradPitt: 287, DeNiro: 380, JohnnyDepp: 85, Denzel: 882, NicolasCage: 2963
};

const TMDB_NETWORKS = {
    HBO: 49, Netflix: 213, Amazon: 1024, DisneyPlus: 2739, AppleTV: 2552, Sky: 125
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
    // =============================================
    // --- TOP & TREND (Base) ---
    // =============================================
    { id: 'preset_pop_movies', name: 'Film Popolari', category: 'Top & Trend', type: 'movie', filters: { sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_pop_series', name: 'Serie TV Popolari', category: 'Top & Trend', type: 'series', filters: { sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_top_rated_movies', name: 'Film Più Votati (All Time)', category: 'Top & Trend', type: 'movie', filters: { sort_by: 'vote_average.desc', 'vote_count.gte': 5000 } },
    { id: 'preset_top_rated_series', name: 'Serie Più Votate (All Time)', category: 'Top & Trend', type: 'series', filters: { sort_by: 'vote_average.desc', 'vote_count.gte': 2000 } },
    { id: 'preset_new_movies', name: 'Film: Nuove Uscite', category: 'Top & Trend', type: 'movie', filters: { 'primary_release_date.lte': todayStr, 'primary_release_date.gte': twoMonthsAgoStr, sort_by: 'popularity.desc' } },
    { id: 'preset_new_series', name: 'Serie TV: Novità', category: 'Top & Trend', type: 'series', filters: { 'first_air_date.lte': todayStr, 'first_air_date.gte': sixMonthsAgoStr, sort_by: 'popularity.desc' } },
    { id: 'preset_new_series_eps', name: 'Serie: Episodi Recenti', category: 'Top & Trend', type: 'series', filters: { 'air_date.lte': todayStr, 'air_date.gte': twoWeeksAgoStr, sort_by: 'popularity.desc' } },
    { id: 'preset_pop_anime', name: 'Anime Popolari', category: 'Top & Trend', type: 'series', filters: { with_keywords: '210024', sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation, 'vote_count.gte': 20 } },
    { id: 'preset_new_anime', name: 'Anime: Novità', category: 'Top & Trend', type: 'series', filters: { with_keywords: '210024', 'first_air_date.lte': todayStr, 'first_air_date.gte': sixMonthsAgoStr, sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_new_anime_eps', name: 'Anime: Simulcast', category: 'Top & Trend', type: 'series', filters: { 'air_date.lte': todayStr, 'air_date.gte': twoWeeksAgoStr, with_keywords: '210024', sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation } },

    // =============================================
    // --- GRANDI REGISTI ---
    // =============================================
    { id: 'preset_nolan', name: 'Regia: Christopher Nolan', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Nolan, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_tarantino', name: 'Regia: Quentin Tarantino', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Tarantino, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_scorsese', name: 'Regia: Martin Scorsese', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Scorsese, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_spielberg', name: 'Regia: Steven Spielberg', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Spielberg, sort_by: 'revenue.desc', 'vote_count.gte': 100 } },
    { id: 'preset_kubrick', name: 'Regia: Stanley Kubrick', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Kubrick, sort_by: 'vote_average.desc' } },
    { id: 'preset_villeneuve', name: 'Regia: Denis Villeneuve', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Villeneuve, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_fincher', name: 'Regia: David Fincher', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Fincher, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_burton', name: 'Regia: Tim Burton', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Burton, sort_by: 'popularity.desc', 'vote_count.gte': 100 } },
    { id: 'preset_wesanderson', name: 'Regia: Wes Anderson', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.WesAnderson, sort_by: 'vote_average.desc', 'vote_count.gte': 50 } },
    { id: 'preset_lynch', name: 'Regia: David Lynch', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Lynch, sort_by: 'vote_average.desc' } },
    { id: 'preset_scott', name: 'Regia: Ridley Scott', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Scott, sort_by: 'popularity.desc', 'vote_count.gte': 100 } },

    // =============================================
    // --- GRANDI ATTORI ---
    // =============================================
    { id: 'preset_actor_dicaprio', name: 'Starring: Leonardo DiCaprio', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.DiCaprio, sort_by: 'vote_average.desc', 'vote_count.gte': 200 } },
    { id: 'preset_actor_cruise', name: 'Starring: Tom Cruise', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.Cruise, sort_by: 'popularity.desc', 'vote_count.gte': 200 } },
    { id: 'preset_actor_reeves', name: 'Starring: Keanu Reeves', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.Reeves, sort_by: 'popularity.desc', 'vote_count.gte': 100 } },
    { id: 'preset_brad_pitt', name: 'Starring: Brad Pitt', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.BradPitt, sort_by: 'vote_average.desc', 'vote_count.gte': 200 } },
    { id: 'preset_de_niro', name: 'Starring: Robert De Niro', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.DeNiro, sort_by: 'vote_average.desc', 'vote_count.gte': 200 } },
    { id: 'preset_johnny_depp', name: 'Starring: Johnny Depp', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.JohnnyDepp, sort_by: 'popularity.desc', 'vote_count.gte': 100 } },
    { id: 'preset_denzel', name: 'Starring: Denzel Washington', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.Denzel, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_nicolas_cage', name: 'La Follia di Nicolas Cage', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.NicolasCage, sort_by: 'popularity.desc' } },

    // =============================================
    // --- STUDIOS & PRODUZIONI ---
    // =============================================
    { id: 'preset_ghibli', name: 'Studio Ghibli', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Ghibli, sort_by: 'vote_average.desc', 'vote_count.gte': 50 } },
    { id: 'preset_pixar', name: 'Disney Pixar', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Pixar, sort_by: 'vote_average.desc', 'vote_count.gte': 200 } },
    { id: 'preset_a24', name: 'A24: Cinema Indipendente', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.A24, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_marvel', name: 'Marvel Cinematic Universe', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Marvel, sort_by: 'revenue.desc', 'vote_count.gte': 500 } },
    { id: 'preset_dc', name: 'DC Comics (Film)', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.DC, sort_by: 'popularity.desc', 'vote_count.gte': 200 } },
    { id: 'preset_blumhouse', name: 'Blumhouse Horror', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Blumhouse, sort_by: 'popularity.desc', 'vote_count.gte': 100 } },
    { id: 'preset_dreamworks', name: 'DreamWorks Animation', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.DreamWorks, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_disney_animation', name: 'Disney Classici & Animazione', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Disney, with_genres: TMDB_GENRES.MOVIE.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 200 } },

    // =============================================
    // --- CINEMA ASIATICO & K-DRAMA ---
    // =============================================
    { id: 'preset_kdrama_romance', name: 'K-Drama: Romantici', category: 'Cinema Asiatico & K-Drama', type: 'series', filters: { with_original_language: 'ko', with_genres: '35,18', with_keywords: '9840', sort_by: 'popularity.desc', 'vote_count.gte': 20 } },
    { id: 'preset_kdrama_thriller', name: 'K-Drama: Thriller & Mistero', category: 'Cinema Asiatico & K-Drama', type: 'series', filters: { with_original_language: 'ko', with_genres: '80,9648', sort_by: 'popularity.desc', 'vote_count.gte': 20 } },
    { id: 'preset_asian_action', name: 'Azione Asiatica (JP, KR, HK)', category: 'Cinema Asiatico & K-Drama', type: 'movie', filters: { with_original_language: 'ja|ko|zh', with_genres: '28', with_keywords: '779,2073', sort_by: 'popularity.desc' } },
    { id: 'preset_cinema_coreano', name: 'Cinema Coreano (Film)', category: 'Cinema Asiatico & K-Drama', type: 'movie', filters: { with_original_language: 'ko', sort_by: 'vote_average.desc', 'vote_count.gte': 200 } },

    // =============================================
    // --- CINEMA INTERNAZIONALE ---
    // =============================================
    { id: 'preset_nordic_noir', name: 'Nordic Noir (Gialli Scandinavi)', category: 'Cinema Internazionale', type: 'series', filters: { with_original_language: 'sv|da|no', with_genres: TMDB_GENRES.TV.Crime, sort_by: 'popularity.desc', 'vote_count.gte': 20 } },
    { id: 'preset_spanish_thriller', name: 'Thriller Spagnoli', category: 'Cinema Internazionale', type: 'movie', filters: { with_original_language: 'es', with_genres: `${TMDB_GENRES.MOVIE.Thriller},${TMDB_GENRES.MOVIE.Mystery}`, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_british_crime', name: 'Gialli & Crime Inglesi (UK)', category: 'Cinema Internazionale', type: 'series', filters: { with_origin_country: 'GB', with_genres: `${TMDB_GENRES.TV.Crime},${TMDB_GENRES.TV.Mystery}`, sort_by: 'popularity.desc', 'vote_count.gte': 30 } },
    { id: 'preset_bollywood', name: 'Bollywood & Cinema Indiano', category: 'Cinema Internazionale', type: 'movie', filters: { with_original_language: 'hi', with_origin_country: 'IN', sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_french_cinema', name: 'Cinema Francese d\'Autore', category: 'Cinema Internazionale', type: 'movie', filters: { with_original_language: 'fr', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 300 } },
    { id: 'preset_italian_cinema', name: 'Cinema Italiano', category: 'Cinema Internazionale', type: 'movie', filters: { with_original_language: 'it', sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_german_dark', name: 'Serie Tedesche (Dark & Thriller)', category: 'Cinema Internazionale', type: 'series', filters: { with_original_language: 'de', with_genres: `${TMDB_GENRES.TV.Drama},${TMDB_GENRES.TV.Mystery}`, sort_by: 'popularity.desc', 'vote_count.gte': 30 } },

    // =============================================
    // --- DECENNI & EPOCHE ---
    // =============================================
    { id: 'preset_80s_movies', name: 'Cult Anni \'80', category: 'Decenni & Epoche', type: 'movie', filters: { 'primary_release_date.gte': '1980-01-01', 'primary_release_date.lte': '1989-12-31', sort_by: 'vote_average.desc', 'vote_count.gte': 500 } },
    { id: 'preset_90s_movies', name: 'Classici Anni \'90', category: 'Decenni & Epoche', type: 'movie', filters: { 'primary_release_date.gte': '1990-01-01', 'primary_release_date.lte': '1999-12-31', sort_by: 'vote_average.desc', 'vote_count.gte': 1000 } },
    { id: 'preset_00s_movies', name: 'I favolosi Anni 2000', category: 'Decenni & Epoche', type: 'movie', filters: { 'primary_release_date.gte': '2000-01-01', 'primary_release_date.lte': '2009-12-31', sort_by: 'vote_average.desc', 'vote_count.gte': 2000 } },
    { id: 'preset_oscar_winners', name: 'Grandi Film Premiati', category: 'Decenni & Epoche', type: 'movie', filters: { sort_by: 'vote_average.desc', 'vote_average.gte': 8.0, 'vote_count.gte': 3000 } },
    { id: 'preset_cult_classics', name: 'Film Cult (Venerati dai fan)', category: 'Decenni & Epoche', type: 'movie', filters: { with_keywords: '11800', sort_by: 'vote_average.desc', 'vote_count.gte': 1000 } },
    { id: 'preset_blockbusters', name: 'Blockbusters (Campioni d\'Incasso)', category: 'Decenni & Epoche', type: 'movie', filters: { sort_by: 'revenue.desc', 'vote_count.gte': 1000 } },

    // =============================================
    // --- MOOD & TEMATICHE ---
    // =============================================
    { id: 'preset_mindfuck', name: 'Mindfuck & Plot Twists', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Mystery},${TMDB_GENRES.MOVIE.Thriller}`, with_keywords: '978,33633', sort_by: 'vote_average.desc', 'vote_count.gte': 200 } },
    { id: 'preset_feel_good', name: 'Feel-Good (Umore Leggero)', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: '35,10751', without_genres: '18,27', sort_by: 'vote_average.desc', 'vote_average.gte': 6.5, 'vote_count.gte': 200 } },
    { id: 'preset_pure_comedy', name: 'Commedia Pura (No Dramma)', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Comedy, without_genres: `${TMDB_GENRES.MOVIE.Drama},${TMDB_GENRES.MOVIE.Romance}`, sort_by: 'popularity.desc', 'vote_count.gte': 200 } },
    { id: 'preset_horror_all', name: 'Horror: I Migliori', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Horror, sort_by: 'vote_average.desc', 'vote_count.gte': 500, 'vote_average.gte': 6.5 } },
    { id: 'preset_scary_horror', name: 'Horror Atmosferico & Soprannaturale', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '3335,9706,6152', sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_slasher_gore', name: 'Slasher, Zombie & Gore', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '12335,12377,3133', sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_whodunit', name: 'Whodunit & Indagini', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: '9648', with_keywords: '11134,10391', sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_apocalypse_survival', name: 'Apocalisse & Sopravvivenza', category: 'Mood & Tematiche', type: 'movie', filters: { with_keywords: '285366,4564,12377', sort_by: 'popularity.desc', 'vote_count.gte': 100 } },
    { id: 'preset_cyberpunk', name: 'Cyberpunk & Futuro Distopico', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.SciFi},${TMDB_GENRES.MOVIE.Action}`, with_keywords: '12190,4565', sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_sad_romance', name: 'Storie d\'Amore Drammatiche', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Drama},${TMDB_GENRES.MOVIE.Romance}`, sort_by: 'vote_average.desc', 'vote_count.gte': 300, 'vote_average.gte': 7.0 } },
    { id: 'preset_heist', name: 'Rapine & Colpi Grossi (Heist)', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Crime},${TMDB_GENRES.MOVIE.Action}`, with_keywords: '10051', sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_true_story', name: 'Basato su Storie Vere', category: 'Mood & Tematiche', type: 'movie', filters: { with_keywords: '9672', sort_by: 'vote_average.desc', 'vote_average.gte': 6.5, 'vote_count.gte': 200 } },
    { id: 'preset_stand_up', name: 'Stand-Up Comedy', category: 'Mood & Tematiche', type: 'movie', filters: { with_keywords: '9716', with_genres: TMDB_GENRES.MOVIE.Comedy, sort_by: 'popularity.desc' } },
    { id: 'preset_musical', name: 'Musical & Film Musicali', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Music, with_keywords: '4344', sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_war_movies', name: 'Film di Guerra', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.War, sort_by: 'vote_average.desc', 'vote_count.gte': 500 } },
    { id: 'preset_western', name: 'Western', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Western, sort_by: 'vote_average.desc', 'vote_count.gte': 200 } },

    // =============================================
    // --- FILM: SOTTOGENERI ---
    // =============================================
    { id: 'preset_epic_historical', name: 'Kolossal & Epopee Storiche', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.History},${TMDB_GENRES.MOVIE.Action}`, with_keywords: '10084,302011', sort_by: 'vote_average.desc', 'vote_count.gte': 500 } },
    { id: 'preset_spy_action', name: 'Spionaggio & Agenti Segreti', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Action},${TMDB_GENRES.MOVIE.Thriller}`, with_keywords: '470,3230', sort_by: 'revenue.desc', 'vote_count.gte': 200 } },
    { id: 'preset_neo_noir', name: 'Neo-Noir & Detective Oscuri', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Crime},${TMDB_GENRES.MOVIE.Mystery}`, with_keywords: '207317', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 300 } },
    { id: 'preset_space_hard_scifi', name: 'Hard Sci-Fi & Spazio Profondo', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.SciFi, with_keywords: '161176,3388,4379', sort_by: 'vote_average.desc', 'vote_average.gte': 6.5, 'vote_count.gte': 200 } },
    { id: 'preset_disaster_movies', name: 'Disaster Movies', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Action},${TMDB_GENRES.MOVIE.SciFi}`, with_keywords: '5686,10483,10364', sort_by: 'popularity.desc', 'vote_count.gte': 100 } },
    { id: 'preset_martial_arts', name: 'Arti Marziali & Kung Fu', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Action, with_keywords: '779,18034', sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_time_travel_movies', name: 'Viaggi nel Tempo (Film)', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.SciFi, with_keywords: '4379', sort_by: 'vote_average.desc', 'vote_count.gte': 200 } },

    // =============================================
    // --- SERIE TV: TEMATICHE ---
    // =============================================
    { id: 'preset_tv_mafia', name: 'Mafia, Cartelli & Gangster', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: `${TMDB_GENRES.TV.Crime},${TMDB_GENRES.TV.Drama}`, with_keywords: '10398,3149,2463', sort_by: 'vote_average.desc', 'vote_count.gte': 150 } },
    { id: 'preset_tv_high_fantasy', name: 'High Fantasy (Spade & Draghi)', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '11024,12554,3205', sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_tv_dystopia', name: 'Futuri Distopici', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '10053,4565', sort_by: 'vote_average.desc', 'vote_count.gte': 50 } },
    { id: 'preset_tv_politics', name: 'Intrighi Politici & Potere', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: `${TMDB_GENRES.TV.WarPolitics},${TMDB_GENRES.TV.Drama}`, with_keywords: '918,11150', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 50 } },
    { id: 'preset_tv_superheroes_dark', name: 'Supereroi (Toni Oscuri)', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: `${TMDB_GENRES.TV.ActionAdventure},${TMDB_GENRES.TV.Crime}`, with_keywords: '9715,180734', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 100 } },
    { id: 'preset_tv_horror', name: 'Serie Horror & Soprannaturali', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Drama, with_keywords: '6152,3335', sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },

    // =============================================
    // --- DOCUMENTARI ---
    // =============================================
    { id: 'preset_nature_docs', name: 'Documentari: Natura e Animali', category: 'Documentari', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '4344', sort_by: 'vote_average.desc', 'vote_count.gte': 50 } },
    { id: 'preset_space_docs', name: 'Documentari: Cosmo e Spazio', category: 'Documentari', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '3801', sort_by: 'vote_average.desc', 'vote_count.gte': 30 } },
    { id: 'preset_true_crime', name: 'Docuserie: True Crime', category: 'Documentari', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '156434', sort_by: 'popularity.desc', 'vote_count.gte': 20 } },
    { id: 'preset_sports_docs', name: 'Docuserie: Sport e Atleti', category: 'Documentari', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '6075', sort_by: 'popularity.desc' } },
    { id: 'preset_doc_music_legends', name: 'Leggende della Musica', category: 'Documentari', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Documentary},${TMDB_GENRES.MOVIE.Music}`, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_doc_food_travel', name: 'Cibo, Viaggi & Alta Cucina', category: 'Documentari', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '6513,13013,277353', sort_by: 'popularity.desc' } },
    { id: 'preset_doc_history_war', name: 'Storia & Guerre Mondiali', category: 'Documentari', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '2081,3573,12190', sort_by: 'vote_average.desc' } },
    { id: 'preset_doc_tech_future', name: 'Tecnologia, AI & Futuro', category: 'Documentari', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '41666,233379', sort_by: 'popularity.desc' } },

    // =============================================
    // --- FORMATI SPECIALI ---
    // =============================================
    { id: 'preset_miniseries', name: 'Miniserie (Weekend)', category: 'Formati Speciali', type: 'series', filters: { with_keywords: '11162', sort_by: 'vote_average.desc', 'vote_count.gte': 500 } },
    { id: 'preset_short_movies', name: 'Film Brevi (< 95 min)', category: 'Formati Speciali', type: 'movie', filters: { 'with_runtime.lte': 95, sort_by: 'vote_average.desc', 'vote_count.gte': 500 } },
    { id: 'preset_hidden_gems', name: 'Capolavori Nascosti', category: 'Formati Speciali', type: 'movie', filters: { 'vote_average.gte': 7.5, 'vote_count.gte': 100, 'vote_count.lte': 1500, sort_by: 'vote_average.desc' } },
    { id: 'preset_long_epics', name: 'Film Epici (> 150 min)', category: 'Formati Speciali', type: 'movie', filters: { 'with_runtime.gte': 150, sort_by: 'vote_average.desc', 'vote_count.gte': 500 } },

    // =============================================
    // --- BAMBINI & FAMIGLIA ---
    // =============================================
    { id: 'preset_kids_cn_nostalgia', name: 'Cartoon Network (\'90/\'00)', category: 'Bambini & Famiglia', type: 'series', filters: { with_networks: '56', 'first_air_date.gte': '1990-01-01', 'first_air_date.lte': '2009-12-31', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc' } },
    { id: 'preset_kids_nick_nostalgia', name: 'Nickelodeon (\'90/\'00)', category: 'Bambini & Famiglia', type: 'series', filters: { with_networks: '13', 'first_air_date.gte': '1990-01-01', 'first_air_date.lte': '2009-12-31', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc' } },
    { id: 'preset_family_magic_adv', name: 'Avventure Magiche (Live Action)', category: 'Bambini & Famiglia', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Family},${TMDB_GENRES.MOVIE.Fantasy}`, with_keywords: '11024,3205', sort_by: 'revenue.desc', 'vote_count.gte': 100 } },
    { id: 'preset_teens_coming_of_age', name: 'Coming of Age', category: 'Bambini & Famiglia', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Drama, with_keywords: '10683', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 200 } },
    { id: 'preset_family_animation', name: 'Animazione per Tutti', category: 'Bambini & Famiglia', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Animation},${TMDB_GENRES.MOVIE.Family}`, sort_by: 'vote_average.desc', 'vote_count.gte': 500 } },

    // =============================================
    // --- SERIE TV ---
    // =============================================
    { id: 'preset_sitcoms', name: 'Sitcom Americane', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Comedy, with_keywords: '8596', sort_by: 'popularity.desc', 'vote_count.gte': 100 } },
    { id: 'preset_medical_drama', name: 'Medical Drama', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Drama, with_keywords: '10091', sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_crime_procedural', name: 'Procedurali (Crime)', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Crime, with_keywords: '11094', sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_teen_drama', name: 'Teen Drama & Liceo', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Drama, with_keywords: '6270', sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_time_travel', name: 'Viaggi nel Tempo (Serie)', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '4379', sort_by: 'vote_average.desc', 'vote_count.gte': 30 } },
    { id: 'preset_legal_drama', name: 'Legal Drama & Tribunali', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Drama, with_keywords: '10155', sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_tv_thriller', name: 'Thriller & Suspense (Serie)', category: 'Serie TV', type: 'series', filters: { with_genres: `${TMDB_GENRES.TV.Drama},${TMDB_GENRES.TV.Mystery}`, sort_by: 'vote_average.desc', 'vote_count.gte': 200, 'vote_average.gte': 7.5 } },

    // =============================================
    // --- ANIME: SOTTOGENERI ---
    // =============================================
    { id: 'preset_anime_shonen', name: 'Anime: Battle Shōnen', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,11545', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_anime_seinen', name: 'Anime: Seinen (Maturi)', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,33446', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 30 } },
    { id: 'preset_anime_shoujo', name: 'Anime: Shōjo (Romantico)', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,209714', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc' } },
    { id: 'preset_anime_slice_of_life', name: 'Anime: Slice of Life', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,282362', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 20 } },
    { id: 'preset_anime_mecha', name: 'Anime: Mecha & Robot', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,6821', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc' } },
    { id: 'preset_anime_isekai', name: 'Anime: Isekai & Fantasy', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,286460', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc', 'vote_count.gte': 20 } },
    { id: 'preset_anime_dark', name: 'Anime: Dark & Psicologico', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,818,158536', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 30 } },
    { id: 'preset_anime_action', name: 'Anime: Azione & Combattimento', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,11545,18034,41165', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc', 'vote_count.gte': 30 } },
    { id: 'preset_anime_sports', name: 'Anime: Sport & Competizione', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,6075', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc' } },

    // =============================================
    // --- ANIME: DECENNI & FILM ---
    // =============================================
    { id: 'preset_anime_classic', name: 'Anime Classici (\'80/\'90)', category: 'Anime & Manga', type: 'series', filters: { 'first_air_date.gte': '1980-01-01', 'first_air_date.lte': '1999-12-31', with_keywords: '210024', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 20 } },
    { id: 'preset_anime_00s', name: 'Anime Anni 2000', category: 'Anime & Manga', type: 'series', filters: { 'first_air_date.gte': '2000-01-01', 'first_air_date.lte': '2009-12-31', with_keywords: '210024', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 30 } },
    { id: 'preset_anime_movies_top', name: 'Capolavori Anime (Film)', category: 'Anime & Manga', type: 'movie', filters: { with_keywords: '210024', with_genres: TMDB_GENRES.MOVIE.Animation, sort_by: 'vote_average.desc', 'vote_average.gte': 7.5, 'vote_count.gte': 500 } },
    { id: 'preset_anime_movies_romance', name: 'Film Anime Romantici', category: 'Anime & Manga', type: 'movie', filters: { with_keywords: '210024', with_genres: `${TMDB_GENRES.MOVIE.Animation},${TMDB_GENRES.MOVIE.Romance}`, sort_by: 'vote_average.desc', 'vote_count.gte': 200 } },

    // =============================================
    // --- NETWORKS (Serie TV) ---
    // =============================================
    { id: 'preset_hbo', name: 'Produzione HBO', category: 'Serie TV', type: 'series', filters: { with_networks: TMDB_NETWORKS.HBO, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_netflix', name: 'Originali Netflix', category: 'Serie TV', type: 'series', filters: { with_networks: TMDB_NETWORKS.Netflix, sort_by: 'popularity.desc', 'vote_count.gte': 100 } },
    { id: 'preset_amazon', name: 'Amazon Prime Video', category: 'Serie TV', type: 'series', filters: { with_networks: TMDB_NETWORKS.Amazon, sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_disney_plus', name: 'Disney+', category: 'Serie TV', type: 'series', filters: { with_networks: TMDB_NETWORKS.DisneyPlus, sort_by: 'popularity.desc', 'vote_count.gte': 50 } },
    { id: 'preset_apple_tv', name: 'Apple TV+', category: 'Serie TV', type: 'series', filters: { with_networks: TMDB_NETWORKS.AppleTV, sort_by: 'vote_average.desc', 'vote_count.gte': 50 } },

    // =============================================
    // --- MDBLIST (Liste Curate dalla Community) ---
    // =============================================
    { id: 'mdblist_123', name: 'MDBList: Top 100 Movies (All Time)', category: 'Community Lists (MDB)', type: 'movie' },
    { id: 'mdblist_456', name: 'MDBList: Top 100 Shows (All Time)', category: 'Community Lists (MDB)', type: 'series' },
    { id: 'mdblist_789', name: 'MDBList: Latest Releases', category: 'Community Lists (MDB)', type: 'movie' },
    { id: 'mdblist_101', name: 'MDBList: Trending this Week', category: 'Community Lists (MDB)', type: 'movie' },
    { id: 'mdblist_102', name: 'MDBList: Hidden Gems', category: 'Community Lists (MDB)', type: 'movie' }
];

const profileTemplates = [
    {
        id: 'tpl_all',
        name: 'Generale (Tutto)',
        description: 'Un mix completo di film e serie per ogni gusto',
        presets: [
            'preset_pop_movies', 'preset_pop_series', 'preset_new_movies', 'preset_new_series',
            'preset_new_series_eps', 'preset_top_rated_movies', 'preset_top_rated_series',
            'preset_oscar_winners', 'preset_hidden_gems', 'preset_pop_anime'
        ]
    },
    {
        id: 'tpl_movies',
        name: 'Solo Film',
        description: 'I migliori film di ogni genere e periodo',
        presets: [
            'preset_pop_movies', 'preset_new_movies', 'preset_top_rated_movies', 'preset_oscar_winners',
            'preset_blockbusters', 'preset_hidden_gems', 'preset_nolan', 'preset_tarantino',
            'mdblist_123', 'mdblist_789', // MDBList
            'preset_scorsese', 'preset_a24', 'preset_mindfuck', 'preset_pure_comedy'
        ]
    },
    {
        id: 'tpl_series',
        name: 'Solo Serie TV',
        description: 'Le migliori serie TV da binge-watchare',
        presets: [
            'preset_pop_series', 'preset_new_series', 'preset_new_series_eps', 'preset_top_rated_series',
            'preset_hbo', 'preset_netflix', 'preset_apple_tv', 'preset_sitcoms',
            'preset_true_crime', 'preset_tv_thriller', 'preset_miniseries', 'preset_crime_procedural'
        ]
    },
    {
        id: 'tpl_otaku',
        name: '🎌 Otaku Hardcore (Anime)',
        description: 'Ogni sottogenere anime, dai classici al simulcast',
        presets: [
            'preset_pop_anime', 'preset_new_anime', 'preset_new_anime_eps',
            'preset_anime_shonen', 'preset_anime_seinen', 'preset_anime_dark',
            'preset_anime_isekai', 'preset_anime_slice_of_life', 'preset_anime_action',
            'preset_anime_movies_top', 'preset_anime_classic', 'preset_ghibli'
        ]
    },
    {
        id: 'tpl_nerd_culture',
        name: '🎮 Cultura Nerd & Sci-Fi',
        description: 'Fantascienza, fantasy, supereroi e tutto il nerd',
        presets: [
            'preset_space_hard_scifi', 'preset_cyberpunk', 'preset_time_travel_movies',
            'preset_tv_high_fantasy', 'preset_tv_dystopia', 'preset_tv_superheroes_dark',
            'preset_marvel', 'preset_dc', 'preset_anime_mecha', 'preset_disaster_movies',
            'preset_villeneuve', 'preset_nolan'
        ]
    },
    {
        id: 'tpl_couple',
        name: '💕 Serata di Coppia',
        description: 'Film e serie romantiche, commedie e feel-good',
        presets: [
            'preset_feel_good', 'preset_pure_comedy', 'preset_sad_romance', 'preset_musical',
            'preset_pop_movies', 'preset_sitcoms', 'preset_kdrama_romance',
            'preset_teens_coming_of_age', 'preset_new_movies', 'preset_miniseries'
        ]
    },
    {
        id: 'tpl_adrenaline',
        name: '💥 Adrenalina & Popcorn',
        description: 'Azione, esplosioni, supereroi e adrenalina pura',
        presets: [
            'preset_actor_cruise', 'preset_actor_reeves', 'preset_heist', 'preset_spy_action',
            'preset_marvel', 'preset_dc', 'preset_blockbusters', 'preset_disaster_movies',
            'preset_martial_arts', 'preset_pop_movies', 'preset_cyberpunk'
        ]
    },
    {
        id: 'tpl_mystery',
        name: '🕵️ Crimine & Mistero',
        description: 'Thriller, misteri, whodunit e vero crimine',
        presets: [
            'preset_whodunit', 'preset_mindfuck', 'preset_neo_noir', 'preset_fincher',
            'preset_true_crime', 'preset_crime_procedural', 'preset_tv_mafia',
            'preset_nordic_noir', 'preset_british_crime', 'preset_tv_thriller',
            'preset_kdrama_thriller'
        ]
    },
    {
        id: 'tpl_fast_watch',
        name: '⏱️ Poco Tempo',
        description: 'Film brevi, miniserie e episodi veloci',
        presets: [
            'preset_short_movies', 'preset_miniseries', 'preset_sitcoms', 'preset_new_series_eps',
            'preset_stand_up', 'preset_pure_comedy', 'preset_hidden_gems', 'preset_feel_good'
        ]
    },
    {
        id: 'tpl_international',
        name: '🌎 Passaporto Globale',
        description: 'Il meglio del cinema e delle serie da tutto il mondo',
        presets: [
            'preset_nordic_noir', 'preset_spanish_thriller', 'preset_french_cinema',
            'preset_british_crime', 'preset_bollywood', 'preset_cinema_coreano',
            'preset_italian_cinema', 'preset_german_dark', 'preset_kdrama_thriller',
            'preset_asian_action'
        ]
    },
    {
        id: 'tpl_hollywood_stars',
        name: '🌟 Maratona Hollywood',
        description: 'I migliori attori e registi di Hollywood',
        presets: [
            'preset_actor_dicaprio', 'preset_brad_pitt', 'preset_de_niro', 'preset_denzel',
            'preset_actor_cruise', 'preset_actor_reeves', 'preset_nicolas_cage',
            'preset_spielberg', 'preset_scorsese', 'preset_nolan'
        ]
    },
    {
        id: 'tpl_docu_discovery',
        name: '🌍 Documentari & Scoperta',
        description: 'Documentari di ogni tipo: natura, scienza, storia',
        presets: [
            'preset_nature_docs', 'preset_space_docs', 'preset_doc_history_war',
            'preset_doc_tech_future', 'preset_doc_food_travel', 'preset_true_crime',
            'preset_sports_docs', 'preset_doc_music_legends', 'preset_true_story'
        ]
    },
    {
        id: 'tpl_nostalgia',
        name: '📼 Nostalgia (\'80/\'90)',
        description: 'Rivisita i classici degli anni \'80 e \'90',
        presets: [
            'preset_80s_movies', 'preset_90s_movies', 'preset_cult_classics',
            'preset_kids_cn_nostalgia', 'preset_kids_nick_nostalgia', 'preset_anime_classic',
            'preset_sitcoms', 'preset_spielberg', 'preset_burton'
        ]
    },
    {
        id: 'tpl_horror',
        name: '🧛 Horror Night',
        description: 'Paura, terrore e brividi per serate da incubo',
        presets: [
            'preset_horror_all', 'preset_scary_horror', 'preset_slasher_gore',
            'preset_blumhouse', 'preset_tv_horror', 'preset_apocalypse_survival',
            'preset_80s_movies', 'preset_mindfuck', 'preset_kdrama_thriller'
        ]
    },
    {
        id: 'tpl_autori',
        name: '🎬 Cinema d\'Autore',
        description: 'Il meglio del cinema d\'autore internazionale',
        presets: [
            'preset_a24', 'preset_nolan', 'preset_kubrick', 'preset_villeneuve',
            'preset_ghibli', 'preset_fincher', 'preset_wesanderson', 'preset_lynch',
            'preset_french_cinema', 'preset_cinema_coreano', 'preset_italian_cinema',
            'preset_oscar_winners'
        ]
    },
    {
        id: 'tpl_kids',
        name: '👨‍👩‍👧‍👦 Bambini & Famiglia',
        description: 'Contenuti sicuri e divertenti per tutta la famiglia',
        presets: [
            'preset_pixar', 'preset_dreamworks', 'preset_ghibli', 'preset_disney_plus',
            'preset_disney_animation', 'preset_family_animation', 'preset_family_magic_adv',
            'preset_kids_cn_nostalgia', 'preset_kids_nick_nostalgia', 'preset_teens_coming_of_age'
        ]
    }
];

module.exports = { presets, profileTemplates };
