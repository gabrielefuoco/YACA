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

const getPresets = () => {
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

    return [
        // =============================================
        // --- 🔥 TOP, TREND & TRAKT ---
        // =============================================
        { id: 'preset_pop_movies', name: 'Film Popolari', category: '🔥 Top, Trend & Trakt', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'popularity.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_pop_series', name: 'Serie TV Popolari', category: '🔥 Top, Trend & Trakt', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_keywords: '210024' }] },
        { id: 'preset_top_rated_movies', name: 'Film Più Votati (All Time)', category: '🔥 Top, Trend & Trakt', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'vote_average.desc', 'vote_count.gte': 1000 }] },
        { id: 'preset_top_rated_series', name: 'Serie Più Votate (All Time)', category: '🔥 Top, Trend & Trakt', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'vote_average.desc', 'vote_count.gte': 500, without_keywords: '210024' }] },
        { id: 'preset_new_movies', name: 'Film: Nuove Uscite', category: '🔥 Top, Trend & Trakt', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'primary_release_date.lte': todayStr, 'primary_release_date.gte': twoMonthsAgoStr, sort_by: 'popularity.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_new_series', name: 'Serie TV: Novità', category: '🔥 Top, Trend & Trakt', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'first_air_date.lte': todayStr, 'first_air_date.gte': sixMonthsAgoStr, sort_by: 'popularity.desc', 'vote_count.gte': 5, without_keywords: '210024' }] },
        { id: 'preset_new_series_eps', name: 'Serie: Episodi Recenti', category: '🔥 Top, Trend & Trakt', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'air_date.lte': todayStr, 'air_date.gte': twoWeeksAgoStr, sort_by: 'popularity.desc', without_keywords: '210024' }] },
        { id: 'preset_pop_anime', name: 'Anime Popolari', category: '🔥 Top, Trend & Trakt', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '210024', sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation, 'vote_count.gte': 20 }] },
        { id: 'preset_new_anime', name: 'Anime: Novità', category: '🔥 Top, Trend & Trakt', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '210024', 'first_air_date.lte': todayStr, 'first_air_date.gte': sixMonthsAgoStr, sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation, 'vote_count.gte': 5 }] },
        { id: 'preset_new_anime_eps', name: 'Anime: Simulcast', category: '🔥 Top, Trend & Trakt', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'air_date.lte': todayStr, 'air_date.gte': twoWeeksAgoStr, with_keywords: '210024', sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation }] },

        // =============================================
        // --- 🎬 CINEMA, REGISTI & AUTORI ---
        // =============================================
        { id: 'preset_nolan', name: 'Regia: Christopher Nolan', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Nolan, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_tarantino', name: 'Regia: Quentin Tarantino', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Tarantino, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_scorsese', name: 'Regia: Martin Scorsese', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Scorsese, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_spielberg', name: 'Regia: Steven Spielberg', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Spielberg, sort_by: 'revenue.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_kubrick', name: 'Regia: Stanley Kubrick', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Kubrick, sort_by: 'vote_average.desc' }] },
        { id: 'preset_villeneuve', name: 'Regia: Denis Villeneuve', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Villeneuve, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_fincher', name: 'Regia: David Fincher', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Fincher, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_burton', name: 'Regia: Tim Burton', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Burton, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_wesanderson', name: 'Regia: Wes Anderson', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.WesAnderson, sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_lynch', name: 'Regia: David Lynch', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Lynch, sort_by: 'vote_average.desc' }] },
        { id: 'preset_scott', name: 'Regia: Ridley Scott', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Scott, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },

        // =============================================
        // --- 🎬 CINEMA, REGISTI & AUTORI (Attori) ---
        // =============================================
        { id: 'preset_actor_dicaprio', name: 'Starring: Leonardo DiCaprio', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.DiCaprio, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_actor_cruise', name: 'Starring: Tom Cruise', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.Cruise, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_actor_reeves', name: 'Starring: Keanu Reeves', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.Reeves, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_brad_pitt', name: 'Starring: Brad Pitt', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.BradPitt, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_de_niro', name: 'Starring: Robert De Niro', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.DeNiro, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_johnny_depp', name: 'Starring: Johnny Depp', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.JohnnyDepp, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_denzel', name: 'Starring: Denzel Washington', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.Denzel, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_nicolas_cage', name: 'La Follia di Nicolas Cage', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.NicolasCage, sort_by: 'popularity.desc' }] },

        // =============================================
        // --- 🎬 CINEMA, REGISTI & AUTORI (Studios) ---
        // =============================================
        { id: 'preset_ghibli', name: 'Studio Ghibli', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.Ghibli, sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_pixar', name: 'Disney Pixar', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.Pixar, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_a24', name: 'A24: Cinema Indipendente', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.A24, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_marvel', name: 'Marvel Cinematic Universe', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.Marvel, sort_by: 'revenue.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_dc', name: 'DC Comics (Film)', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.DC, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_blumhouse', name: 'Blumhouse Horror', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.Blumhouse, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_dreamworks', name: 'DreamWorks Animation', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.DreamWorks, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_disney_animation', name: 'Disney Classici & Animazione', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.Disney, with_genres: TMDB_GENRES.MOVIE.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },

        // =============================================
        // --- 🏮 ANIME & ASIA ---
        // =============================================
        { id: 'preset_kdrama_romance', name: 'K-Drama: Romantici', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ko', with_genres: '35,18', with_keywords: '9840', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_kdrama_thriller', name: 'K-Drama: Thriller & Mistero', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ko', with_genres: '80,9648', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_asian_action', name: 'Azione Asiatica (JP, KR, HK)', category: '🏮 Anime & Asia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja|ko|zh', with_genres: '28', with_keywords: '779|2073|18034|9826', sort_by: 'popularity.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_cinema_coreano', name: 'Cinema Coreano (Film)', category: '🏮 Anime & Asia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ko', sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },

        // =============================================
        // --- 🎬 CINEMA, REGISTI & AUTORI (Internazionale) ---
        // =============================================
        { id: 'preset_nordic_noir', name: 'Nordic Noir (Gialli Scandinavi)', category: '🎬 Cinema, Registi & Autori', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'sv|da|no', with_genres: TMDB_GENRES.TV.Crime, sort_by: 'popularity.desc', 'vote_count.gte': 10, without_keywords: '210024' }] },
        { id: 'preset_spanish_thriller', name: 'Thriller Spagnoli', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'es', with_genres: `${TMDB_GENRES.MOVIE.Thriller}|${TMDB_GENRES.MOVIE.Mystery}`, sort_by: 'vote_average.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_british_crime', name: 'Gialli & Crime Inglesi (UK)', category: '🎬 Cinema, Registi & Autori', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_origin_country: 'GB', with_genres: `${TMDB_GENRES.TV.Crime}|${TMDB_GENRES.TV.Mystery}`, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_bollywood', name: 'Bollywood & Cinema Indiano', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'hi', with_origin_country: 'IN', sort_by: 'popularity.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_french_cinema', name: 'Cinema Francese d\'Autore', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'fr', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 100 }] },
        { id: 'preset_italian_cinema', name: 'Cinema Italiano', category: '🎬 Cinema, Registi & Autori', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'it', sort_by: 'vote_average.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_german_dark', name: 'Serie Tedesche (Dark & Thriller)', category: '🎬 Cinema, Registi & Autori', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'de', with_genres: `${TMDB_GENRES.TV.Drama}|${TMDB_GENRES.TV.Mystery}`, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },

        // =============================================
        // --- 🎭 GENERI & TEMATICHE (Epoche) ---
        // =============================================
        { id: 'preset_80s_movies', name: 'Cult Anni \'80', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'primary_release_date.gte': '1980-01-01', 'primary_release_date.lte': '1989-12-31', sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_90s_movies', name: 'Classici Anni \'90', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'primary_release_date.gte': '1990-01-01', 'primary_release_date.lte': '1999-12-31', sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_00s_movies', name: 'I favolosi Anni 2000', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'primary_release_date.gte': '2000-01-01', 'primary_release_date.lte': '2009-12-31', sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_oscar_winners', name: 'Grandi Film Premiati', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'vote_average.desc', 'vote_average.gte': 8.0, 'vote_count.gte': 20 }] },
        { id: 'preset_cult_classics', name: 'Film Cult (Venerati dai fan)', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '11800', sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_blockbusters', name: 'Blockbusters (Campioni d\'Incasso)', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'revenue.desc', 'vote_count.gte': 20 }] },

        // =============================================
        // --- 🎭 GENERI & TEMATICHE (Mood) ---
        // =============================================
        { id: 'preset_mindfuck', name: 'Mindfuck & Plot Twists', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Mystery}|${TMDB_GENRES.MOVIE.Thriller}`, with_keywords: '362567|275311', sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_feel_good', name: 'Feel-Good (Umore Leggero)', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '35,10751', without_genres: '18,27', sort_by: 'vote_average.desc', 'vote_average.gte': 6.5, 'vote_count.gte': 20 }] },
        { id: 'preset_pure_comedy', name: 'Commedia Pura (No Dramma)', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Comedy, without_genres: `${TMDB_GENRES.MOVIE.Drama},${TMDB_GENRES.MOVIE.Romance}`, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_horror_all', name: 'Horror: I Migliori', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Horror, sort_by: 'vote_average.desc', 'vote_count.gte': 20, 'vote_average.gte': 6.5 }] },
        { id: 'preset_scary_horror', name: 'Horror Atmosferico & Soprannaturali', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '3335|9706|6152|10224', sort_by: 'vote_average.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_slasher_gore', name: 'Slasher, Zombie & Gore', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '12335|12377|3133|200424', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_whodunit', name: 'Whodunit & Indagini', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '9648', with_keywords: '11134|10391|191199', sort_by: 'vote_average.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_apocalypse_survival', name: 'Apocalisse & Sopravvivenza', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '285366|4564|12377|241725', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_cyberpunk', name: 'Cyberpunk & Futuro Distopico', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.SciFi}|${TMDB_GENRES.MOVIE.Action}`, with_keywords: '12190|4565|156556|210086', sort_by: 'vote_average.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_sad_romance', name: 'Storie d\'Amore Drammatiche', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Drama},${TMDB_GENRES.MOVIE.Romance}`, sort_by: 'vote_average.desc', 'vote_count.gte': 20, 'vote_average.gte': 7.0 }] },
        { id: 'preset_heist', name: 'Rapine & Colpi Grossi (Heist)', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Crime}|${TMDB_GENRES.MOVIE.Action}`, with_keywords: '10051', sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_true_story', name: 'Biopic: Grandi Storie Vere', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '9672|5564|200155', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 200 }] },
        { id: 'preset_videogame_movies', name: 'Tratti da Videogiochi (Film)', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '41645|282', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_stand_up', name: 'Stand-Up Comedy', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '9716', with_genres: TMDB_GENRES.MOVIE.Comedy, sort_by: 'popularity.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_musical', name: 'Musical & Film Musicali', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Music, with_keywords: '4344', sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_war_movies', name: 'Film di Guerra', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.War, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_western', name: 'Western', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Western, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },

        // =============================================
        // --- 🎭 GENERI & TEMATICHE (Sottogeneri) ---
        // =============================================
        { id: 'preset_epic_historical', name: 'Kolossal & Epopee Storiche', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.History}|${TMDB_GENRES.MOVIE.Action}`, with_keywords: '10084|302011|15167|2968', sort_by: 'vote_average.desc', 'vote_count.gte': 100 }], weights: { tmdb: 1.5, trakt: 0.5 } },
        { id: 'preset_spy_action', name: 'Spionaggio & Agenti Segreti', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Action}|${TMDB_GENRES.MOVIE.Thriller}`, with_keywords: '470|3230|10410', sort_by: 'revenue.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_neo_noir', name: 'Neo-Noir & Detective Oscuri', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Crime}|${TMDB_GENRES.MOVIE.Mystery}`, with_keywords: '1471|207317|209210', sort_by: 'vote_average.desc', 'vote_average.gte': 6.5, 'vote_count.gte': 50 }] },
        { id: 'preset_space_hard_scifi', name: 'Hard Sci-Fi & Spazio Profondo', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.SciFi, with_keywords: '3801|161176|3388|157675', sort_by: 'vote_average.desc', 'vote_average.gte': 6.5, 'vote_count.gte': 50 }], weights: { tmdb: 1.2, trakt: 0.8 } },
        { id: 'preset_disaster_movies', name: 'Disaster Movies', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Action}|${TMDB_GENRES.MOVIE.SciFi}`, with_keywords: '5686|10483|10364', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_martial_arts', name: 'Arti Marziali & Kung Fu', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Action, with_keywords: '779|18034', sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_time_travel_movies', name: 'Viaggi nel Tempo (Film)', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.SciFi, with_keywords: '4379', sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },

        // =============================================
        // --- 📺 SERIE TV & DOCU (Tematiche) ---
        // =============================================
        { id: 'preset_tv_mafia', name: 'Mafia, Cartelli & Gangster', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.TV.Crime}|${TMDB_GENRES.TV.Drama}`, with_keywords: '10398|3149|2463', sort_by: 'vote_average.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_tv_high_fantasy', name: 'High Fantasy (Spade & Draghi)', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '11024|12554|3205', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_tv_dystopia', name: 'Futuri Distopici', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '10053|4565', sort_by: 'vote_average.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_tv_politics', name: 'Intrighi Politici & Potere', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.TV.WarPolitics}|${TMDB_GENRES.TV.Drama}`, with_keywords: '6078|34038|41282|10410|298532', sort_by: 'popularity.desc', 'vote_count.gte': 10, without_keywords: '210024' }] },
        { id: 'preset_tv_superheroes_dark', name: 'Supereroi (Toni Oscuri)', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.TV.ActionAdventure}|${TMDB_GENRES.TV.Crime}|${TMDB_GENRES.TV.Drama}`, with_keywords: '9715|180734|7002', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 10, without_keywords: '210024' }] },
        { id: 'preset_tv_horror', name: 'Serie Horror & Soprannaturali', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Drama, with_keywords: '6152|3335', sort_by: 'vote_average.desc', 'vote_count.gte': 10, without_keywords: '210024' }] },

        // =============================================
        // --- 📺 SERIE TV & DOCU (Formati) ---
        // =============================================
        { id: 'preset_nature_docs', name: 'Documentari: Natura e Animali', category: '📺 Serie TV & Docu', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '818|2964|2271|9882', sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_space_docs', name: 'Documentari: Cosmo e Spazio', category: '📺 Serie TV & Docu', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '3801|161176|173161|3388', sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_true_crime', name: 'Docuserie: True Crime', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '33722', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_sports_docs', name: 'Docuserie: Sport e Atleti', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '6075|258273', sort_by: 'popularity.desc' }] },
        { id: 'preset_doc_music_legends', name: 'Leggende della Musica', category: '📺 Serie TV & Docu', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Documentary},${TMDB_GENRES.MOVIE.Music}`, sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_doc_food_travel', name: 'Cibo, Viaggi & Alta Cucina', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '1918|9935|10637|233721|6513', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_doc_history_war', name: 'Storia & Guerre Mondiali', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '273967|282633|195232|3573', sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_doc_tech_future', name: 'Tecnologia, AI & Futuro', category: '📺 Serie TV & Docu', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '1576|2964|41666|362282|310', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_big_sagas', name: 'Le Grandi Saghe (Franchises)', category: '🎭 Generi & Tematiche', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '363309|364043|180547|306278|368218|361758', sort_by: 'revenue.desc', 'vote_count.gte': 100 }] },

        // =============================================
        // --- 🎭 GENERI & TEMATICHE (Formati) ---
        // =============================================
        { id: 'preset_miniseries', name: 'Miniserie di Qualità', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Drama, with_keywords: '11162', sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_anthology', name: 'Serie Antologiche', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '9706', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_sketch_comedy', name: 'Sketch Comedy', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Comedy, with_keywords: '156203', sort_by: 'popularity.desc' }] },

        // =============================================
        // --- 📺 SERIE TV & DOCU ---
        // =============================================
        { id: 'preset_sitcoms', name: 'Sitcom Americane', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Comedy, with_keywords: '9840|193171|9713', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_keywords: '210024' }] },
        { id: 'preset_medical_drama', name: 'Medical Drama', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Drama, with_keywords: '208788|11612|13005', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_crime_procedural', name: 'Procedurali (Crime)', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Crime, with_keywords: '207694|268067|298849|191199', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_teen_drama', name: 'Teen Drama & Coming of Age', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Drama, with_keywords: '6270|10683|11156|315570', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_time_travel', name: 'Viaggi nel Tempo (Serie)', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '4379|196984', sort_by: 'vote_average.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_legal_drama', name: 'Legal Drama & Tribunali', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Drama, with_keywords: '222517|10909|33519', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_tv_thriller', name: 'Thriller & Suspense (Serie)', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.TV.Drama}|${TMDB_GENRES.TV.Mystery}`, sort_by: 'vote_average.desc', 'vote_count.gte': 100, 'vote_average.gte': 7.5, without_keywords: '210024' }] },

        // =============================================
        // --- 🏮 ANIME & ASIA (Sottogeneri) ---
        // =============================================
        { id: 'preset_anime_shonen', name: 'Anime: Battle Shōnen', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_keywords: '363152|14643|779|207469', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_anime_seinen', name: 'Anime: Seinen (Maturi)', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_keywords: '195668|158536', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_anime_shoujo', name: 'Anime: Shōjo (Romantico)', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_keywords: '206437|207469|9840', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_anime_slice_of_life', name: 'Anime: Slice of Life', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_keywords: '9914|6054', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_anime_mecha', name: 'Anime: Mecha & Robot', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_keywords: '10046|238767|36', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_anime_isekai', name: 'Anime: Isekai & Fantasy', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_keywords: '237451|291482|196984|12554', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_anime_dark', name: 'Anime: Dark & Psicologico', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_keywords: '818|158536|10410', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_anime_action', name: 'Anime: Azione & Combattimento', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_keywords: '11545|18034|41165|207469|14643', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_anime_sports', name: 'Anime: Sport & Competizione', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_keywords: '6075', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc' }] },

        // =============================================
        // --- 🏮 ANIME & ASIA (Classici & Film) ---
        // =============================================
        { id: 'preset_anime_classic', name: 'Anime Classici (\'80/\'90)', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', 'first_air_date.gte': '1980-01-01', 'first_air_date.lte': '1999-12-31', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_anime_00s', name: 'Anime Anni 2000', category: '🏮 Anime & Asia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', 'first_air_date.gte': '2000-01-01', 'first_air_date.lte': '2009-12-31', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_anime_movies_top', name: 'Capolavori Anime (Film)', category: '🏮 Anime & Asia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_genres: TMDB_GENRES.MOVIE.Animation, sort_by: 'vote_average.desc', 'vote_average.gte': 7.5, 'vote_count.gte': 20 }] },
        { id: 'preset_anime_movies_romance', name: 'Film Anime Romantici', category: '🏮 Anime & Asia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja', with_genres: `${TMDB_GENRES.MOVIE.Animation},${TMDB_GENRES.MOVIE.Romance}`, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },

        // =============================================
        // --- 📺 SERIE TV & DOCU (Networks) ---
        // =============================================
        { id: 'preset_hbo', name: 'Produzione HBO', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: TMDB_NETWORKS.HBO, sort_by: 'vote_average.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_netflix', name: 'Originali Netflix', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: TMDB_NETWORKS.Netflix, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_amazon', name: 'Amazon Prime Video', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: TMDB_NETWORKS.Amazon, sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_disney_plus', name: 'Disney+', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: TMDB_NETWORKS.DisneyPlus, sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_apple_tv', name: 'Apple TV+', category: '📺 Serie TV & Docu', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: TMDB_NETWORKS.AppleTV, sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },

    ];
};

const profileTemplates = [
    {
        id: 'tpl_all',
        name: 'Generale (Tutto)',
        description: 'Un mix completo di film e serie per ogni gusto',
        presets: [
            'preset_pop_movies', 'preset_pop_series', 'preset_new_movies', 'preset_new_series',
            'preset_new_series_eps', 'preset_top_rated_movies', 'preset_top_rated_series',
            'preset_oscar_winners', 'preset_pop_anime'
        ]
    },
    {
        id: 'tpl_movies',
        name: 'Solo Film',
        description: 'I migliori film di ogni genere e periodo',
        presets: [
            'preset_pop_movies', 'preset_new_movies', 'preset_top_rated_movies', 'preset_oscar_winners',
            'preset_blockbusters', 'preset_big_sagas', 'preset_nolan', 'preset_tarantino',
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
            'preset_new_movies', 'preset_miniseries'
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
            'preset_miniseries', 'preset_sitcoms', 'preset_new_series_eps',
            'preset_stand_up', 'preset_pure_comedy', 'preset_feel_good'
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
            'preset_anime_classic',
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
            'preset_disney_animation'
        ]
    }
];

// Sanity check: validate that all preset IDs referenced in profileTemplates exist
const _validationPresets = getPresets();
const _presetIdSet = new Set(_validationPresets.map(p => p.id));
for (const template of profileTemplates) {
    for (const presetRef of template.presets) {
        if (!_presetIdSet.has(presetRef)) {
            console.warn(`[YACA] WARNING: profileTemplate "${template.id}" references unknown preset "${presetRef}"`);
        }
    }
}

module.exports = { getPresets, profileTemplates };
