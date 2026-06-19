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
        { id: 'preset_pop_movies', name: 'Film Popolari', emoji: '🌟', category: "🔥 Top & Trend", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'popularity.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_pop_series', name: 'Serie TV Popolari', emoji: '🌟', category: "🔥 Top & Trend", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_keywords: '210024' }] },
        { id: 'preset_top_rated_movies', name: 'Film Più Votati (All Time)', emoji: '🏆', category: "🔥 Top & Trend", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'vote_average.desc', 'vote_count.gte': 1000 }] },
        { id: 'preset_top_rated_series', name: 'Serie Più Votate (All Time)', emoji: '🏆', category: "🔥 Top & Trend", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'vote_average.desc', 'vote_count.gte': 500, without_keywords: '210024' }] },
        { id: 'preset_new_movies', name: 'Film: Nuove Uscite', emoji: '🆕', category: "🔥 Top & Trend", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'primary_release_date.lte': todayStr, 'primary_release_date.gte': twoMonthsAgoStr, sort_by: 'popularity.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_new_series', name: 'Serie TV: Novità', emoji: '🆕', category: "🔥 Top & Trend", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'first_air_date.lte': todayStr, 'first_air_date.gte': sixMonthsAgoStr, sort_by: 'popularity.desc', 'vote_count.gte': 5, without_keywords: '210024' }] },
        { id: 'preset_new_series_eps', name: 'Serie: Episodi Recenti', emoji: '🆕', category: "🔥 Top & Trend", type: 'series', presentation_strategy: 'popularity', showEpisodeBadge: true, queries: [{ strategy: 'discovery', 'air_date.lte': todayStr, 'air_date.gte': twoWeeksAgoStr, sort_by: 'popularity.desc', without_keywords: '210024' }] },
        { id: 'preset_pop_anime', name: 'Anime Popolari', emoji: '🌟', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', sort_by: 'popularity.desc' }] },
        { id: 'preset_new_anime', name: 'Anime: Novità', emoji: '🆕', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', sort_by: 'first_air_date.desc' }] },

        // =============================================
        // --- 🎬 CINEMA, REGISTI & AUTORI ---
        // =============================================
        { id: 'preset_nolan', name: 'Regia: Christopher Nolan', emoji: '⏳', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Nolan, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_tarantino', name: 'Regia: Quentin Tarantino', emoji: '🩸', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Tarantino, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_scorsese', name: 'Regia: Martin Scorsese', emoji: '🔫', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Scorsese, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_spielberg', name: 'Regia: Steven Spielberg', emoji: '🦖', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Spielberg, sort_by: 'revenue.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_kubrick', name: 'Regia: Stanley Kubrick', emoji: '👁️', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Kubrick, sort_by: 'vote_average.desc' }] },
        { id: 'preset_villeneuve', name: 'Regia: Denis Villeneuve', emoji: '🏜️', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Villeneuve, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_fincher', name: 'Regia: David Fincher', emoji: '🔦', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Fincher, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_burton', name: 'Regia: Tim Burton', emoji: '✂️', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Burton, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_wesanderson', name: 'Regia: Wes Anderson', emoji: '🎨', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.WesAnderson, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_lynch', name: 'Regia: David Lynch', emoji: '☕', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Lynch, sort_by: 'vote_average.desc' }] },
        { id: 'preset_scott', name: 'Regia: Ridley Scott', emoji: '👽', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_crew: TMDB_PEOPLE.Scott, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },

        // =============================================
        // --- 🎬 CINEMA, REGISTI & AUTORI (Attori) ---
        // =============================================
        { id: 'preset_actor_dicaprio', name: 'Starring: Leonardo DiCaprio', emoji: '⭐', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.DiCaprio, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_actor_cruise', name: 'Starring: Tom Cruise', emoji: '⭐', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.Cruise, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_actor_reeves', name: 'Starring: Keanu Reeves', emoji: '⭐', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.Reeves, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_brad_pitt', name: 'Starring: Brad Pitt', emoji: '👊', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.BradPitt, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_de_niro', name: 'Starring: Robert De Niro', emoji: '🚕', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.DeNiro, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_johnny_depp', name: 'Starring: Johnny Depp', emoji: '🏴‍☠️', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.JohnnyDepp, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_denzel', name: 'Starring: Denzel Washington', emoji: '👮', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.Denzel, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_nicolas_cage', name: 'La Follia di Nicolas Cage', emoji: '🔥', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_cast: TMDB_PEOPLE.NicolasCage, sort_by: 'popularity.desc' }] },

        // =============================================
        // --- 🎬 CINEMA, REGISTI & AUTORI (Studios) ---
        // =============================================
        { id: 'preset_ghibli', name: 'Studio Ghibli', emoji: '🍃', category: "🏮 Solo Anime", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.Ghibli, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_pixar', name: 'Disney Pixar', emoji: '🧸', category: "👨‍👩‍👧‍👦 Bambini & Famiglia", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.Pixar, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_a24', name: 'A24: Cinema Indipendente', emoji: '💎', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.A24, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_marvel', name: 'Marvel Cinematic Universe', emoji: '🦸', category: "🐉 Fantascienza & Fantasy", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.Marvel, sort_by: 'revenue.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_dc', name: 'DC Comics (Film)', emoji: '🦇', category: "🐉 Fantascienza & Fantasy", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.DC, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_blumhouse', name: 'Blumhouse Horror', emoji: '🔪', category: "👻 Brivido & Paura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.Blumhouse, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_dreamworks', name: 'DreamWorks Animation', emoji: '🐉', category: "👨‍👩‍👧‍👦 Bambini & Famiglia", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.DreamWorks, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_disney_animation', name: 'Disney Classici & Animazione', emoji: '🏰', category: "👨‍👩‍👧‍👦 Bambini & Famiglia", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.Disney, with_genres: TMDB_GENRES.MOVIE.Animation, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },

        // =============================================
        // --- 🏮 ANIME & ASIA ---
        // =============================================
        { id: 'preset_kdrama_romance', name: 'K-Drama: Romantici', emoji: '🫰', category: "🌏 K-Drama, Dizi & Asia", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ko', with_genres: '35,18', with_keywords: '9840', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_kdrama_thriller', name: 'K-Drama: Thriller & Mistero', emoji: '🫰', category: "🌏 K-Drama, Dizi & Asia", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ko', with_genres: '80,9648', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_asian_action', name: 'Azione Asiatica (JP, KR, HK)', emoji: '🥋', category: "🌏 K-Drama, Dizi & Asia", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ja|ko|zh', with_genres: '28', with_keywords: '779|2073|18034|9826', sort_by: 'popularity.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_cinema_coreano', name: 'Cinema Coreano (Film)', emoji: '🇰🇷', category: "🌏 K-Drama, Dizi & Asia", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'ko', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },

        // =============================================
        // --- 🎬 CINEMA, REGISTI & AUTORI (Internazionale) ---
        // =============================================
        { id: 'preset_nordic_noir', name: 'Nordic Noir (Gialli Scandinavi)', emoji: '❄️', category: "🕵️ Crimine, Mistero & Thriller", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'sv|da|no', with_genres: TMDB_GENRES.TV.Crime, sort_by: 'popularity.desc', 'vote_count.gte': 10, without_keywords: '210024' }] },
        { id: 'preset_spanish_thriller', name: 'Thriller Spagnoli', emoji: '🇪🇸', category: "🕵️ Crimine, Mistero & Thriller", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'es', with_genres: `${TMDB_GENRES.MOVIE.Thriller}|${TMDB_GENRES.MOVIE.Mystery}`, sort_by: 'vote_average.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_british_crime', name: 'Gialli & Crime Inglesi (UK)', emoji: '🇬🇧', category: "🕵️ Crimine, Mistero & Thriller", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_origin_country: 'GB', with_genres: `${TMDB_GENRES.TV.Crime}|${TMDB_GENRES.TV.Mystery}`, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_bollywood', name: 'Bollywood & Cinema Indiano', emoji: '🇮🇳', category: "🌏 K-Drama, Dizi & Asia", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'hi', with_origin_country: 'IN', sort_by: 'popularity.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_french_cinema', name: 'Cinema Francese d\'Autore', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'fr', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 100 }] },
        { id: 'preset_italian_cinema', name: 'Cinema Italiano', emoji: '🇮🇹', category: "🎬 Cinema d'Autore & Registi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'it', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_german_dark', name: 'Serie Tedesche (Dark & Thriller)', emoji: '🇩🇪', category: "🕵️ Crimine, Mistero & Thriller", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'de', with_genres: `${TMDB_GENRES.TV.Drama}|${TMDB_GENRES.TV.Mystery}`, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },

        // =============================================
        // --- 🎭 GENERI & TEMATICHE (Epoche) ---
        // =============================================
        { id: 'preset_80s_movies', name: 'Cult Anni \'80', category: "🔥 Top & Trend", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'primary_release_date.gte': '1980-01-01', 'primary_release_date.lte': '1989-12-31', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_90s_movies', name: 'Classici Anni \'90', category: "🔥 Top & Trend", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'primary_release_date.gte': '1990-01-01', 'primary_release_date.lte': '1999-12-31', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_00s_movies', name: 'I favolosi Anni 2000', emoji: '💿', category: "🔥 Top & Trend", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', 'primary_release_date.gte': '2000-01-01', 'primary_release_date.lte': '2009-12-31', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_oscar_winners', name: 'Grandi Film Premiati', emoji: '🥇', category: "🔥 Top & Trend", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'vote_average.desc', 'vote_average.gte': 8.0, 'vote_count.gte': 200 }] },
        { id: 'preset_cult_classics', name: 'Film Cult (Venerati dai fan)', emoji: '🙌', category: "🔥 Top & Trend", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '11800', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_blockbusters', name: 'Blockbusters (Campioni d\'Incasso)', category: "🔥 Top & Trend", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', sort_by: 'revenue.desc', 'vote_count.gte': 20 }] },

        // =============================================
        // --- 🎭 GENERI & TEMATICHE (Mood) ---
        // =============================================
        { id: 'preset_mindfuck', name: 'Mindfuck & Plot Twists', emoji: '🤯', category: "🕵️ Crimine, Mistero & Thriller", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Mystery}|${TMDB_GENRES.MOVIE.Thriller}`, with_keywords: '362567|275311', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_feel_good', name: 'Feel-Good (Umore Leggero)', emoji: '😊', category: "🍿 Serata Leggera & Risate", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '35,10751', without_genres: '18,27', sort_by: 'vote_average.desc', 'vote_average.gte': 6.5, 'vote_count.gte': 200 }] },
        { id: 'preset_pure_comedy', name: 'Commedia Pura (No Dramma)', emoji: '😂', category: "🍿 Serata Leggera & Risate", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Comedy, without_genres: `${TMDB_GENRES.MOVIE.Drama},${TMDB_GENRES.MOVIE.Romance}`, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_horror_all', name: 'Horror: I Migliori', emoji: '👻', category: "👻 Brivido & Paura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Horror, sort_by: 'vote_average.desc', 'vote_count.gte': 200, 'vote_average.gte': 6.5 }] },
        { id: 'preset_scary_horror', name: 'Horror Atmosferico & Soprannaturali', emoji: '👻', category: "👻 Brivido & Paura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '3335|9706|6152|10224', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_slasher_gore', name: 'Slasher, Zombie & Gore', emoji: '🪓', category: "👻 Brivido & Paura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '12335|12377|3133|200424', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_whodunit', name: 'Whodunit & Indagini', emoji: '🔎', category: "🕵️ Crimine, Mistero & Thriller", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '9648', with_keywords: '11134|10391|191199', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_apocalypse_survival', name: 'Apocalisse & Sopravvivenza', emoji: '🏕️', category: "👻 Brivido & Paura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '285366|4564|12377|241725', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_cyberpunk', name: 'Cyberpunk & Futuro Distopico', emoji: '🤖', category: "🐉 Fantascienza & Fantasy", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.SciFi}|${TMDB_GENRES.MOVIE.Action}`, with_keywords: '12190|4565|156556|210086', sort_by: 'vote_average.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_sad_romance', name: 'Storie d\'Amore Drammatiche', category: "🍿 Serata Leggera & Risate", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Drama},${TMDB_GENRES.MOVIE.Romance}`, sort_by: 'vote_average.desc', 'vote_count.gte': 200, 'vote_average.gte': 7.0 }] },
        { id: 'preset_heist', name: 'Rapine & Colpi Grossi (Heist)', emoji: '💰', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Crime}|${TMDB_GENRES.MOVIE.Action}`, with_keywords: '10051', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_true_story', name: 'Biopic: Grandi Storie Vere', emoji: '📖', category: "🌍 Documentari & Storie Vere", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '9672|5564|200155', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 200 }] },
        { id: 'preset_videogame_movies', name: 'Tratti da Videogiochi (Film)', emoji: '🎮', category: "🔥 Altri Cataloghi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '41645|282', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_stand_up', name: 'Stand-Up Comedy', emoji: '🎤', category: "🍿 Serata Leggera & Risate", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '9716', with_genres: TMDB_GENRES.MOVIE.Comedy, sort_by: 'popularity.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_musical', name: 'Musical & Film Musicali', emoji: '🎵', category: "🍿 Serata Leggera & Risate", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Music, with_keywords: '4344', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_war_movies', name: 'Film di Guerra', emoji: '🪖', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.War, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_western', name: 'Western', emoji: '🤠', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Western, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },

        // =============================================
        // --- 🎭 GENERI & TEMATICHE (Sottogeneri) ---
        // =============================================
        { id: 'preset_epic_historical', name: 'Kolossal & Epopee Storiche', emoji: '⚔️', category: "🔥 Altri Cataloghi", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.History}|${TMDB_GENRES.MOVIE.Action}`, with_keywords: '10084|302011|15167|2968', sort_by: 'vote_average.desc', 'vote_count.gte': 100 }], weights: { tmdb: 1.5, trakt: 0.5 } },
        { id: 'preset_spy_action', name: 'Spionaggio & Agenti Segreti', emoji: '🕵️', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Action}|${TMDB_GENRES.MOVIE.Thriller}`, with_keywords: '470|3230|10410', sort_by: 'revenue.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_neo_noir', name: 'Neo-Noir & Detective Oscuri', emoji: '🚬', category: "🕵️ Crimine, Mistero & Thriller", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Crime}|${TMDB_GENRES.MOVIE.Mystery}`, with_keywords: '1471|207317|209210', sort_by: 'vote_average.desc', 'vote_average.gte': 6.5, 'vote_count.gte': 200 }] },
        { id: 'preset_space_hard_scifi', name: 'Hard Sci-Fi & Spazio Profondo', emoji: '🚀', category: "🐉 Fantascienza & Fantasy", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.SciFi, with_keywords: '3801|161176|3388|157675', sort_by: 'vote_average.desc', 'vote_average.gte': 6.5, 'vote_count.gte': 200 }], weights: { tmdb: 1.2, trakt: 0.8 } },
        { id: 'preset_disaster_movies', name: 'Disaster Movies', emoji: '🌋', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Action}|${TMDB_GENRES.MOVIE.SciFi}`, with_keywords: '5686|10483|10364', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_martial_arts', name: 'Arti Marziali & Kung Fu', emoji: '🥋', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Action, with_keywords: '779|18034', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_time_travel_movies', name: 'Viaggi nel Tempo (Film)', emoji: '⏱️', category: "🐉 Fantascienza & Fantasy", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.SciFi, with_keywords: '4379', sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },

        // =============================================
        // --- 📺 SERIE TV & DOCU (Tematiche) ---
        // =============================================
        { id: 'preset_tv_mafia', name: 'Mafia, Cartelli & Gangster', emoji: '🕴️', category: "🕵️ Crimine, Mistero & Thriller", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.TV.Crime}|${TMDB_GENRES.TV.Drama}`, with_keywords: '10398|3149|2463', sort_by: 'vote_average.desc', 'vote_count.gte': 100, without_keywords: '210024' }] },
        { id: 'preset_tv_high_fantasy', name: 'High Fantasy (Spade & Draghi)', emoji: '🧙', category: "🐉 Fantascienza & Fantasy", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '11024|12554|3205', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_tv_dystopia', name: 'Futuri Distopici', emoji: '🏆', category: "🐉 Fantascienza & Fantasy", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '10053|4565', sort_by: 'vote_average.desc', 'vote_count.gte': 100, without_keywords: '210024' }] },
        { id: 'preset_tv_politics', name: 'Intrighi Politici & Potere', emoji: '🏛️', category: "🕵️ Crimine, Mistero & Thriller", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.TV.WarPolitics}|${TMDB_GENRES.TV.Drama}`, with_keywords: '6078|34038|41282|10410|298532', sort_by: 'popularity.desc', 'vote_count.gte': 10, without_keywords: '210024' }] },
        { id: 'preset_tv_superheroes_dark', name: 'Supereroi (Toni Oscuri)', emoji: '🦸‍♂️', category: "🐉 Fantascienza & Fantasy", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.TV.ActionAdventure}|${TMDB_GENRES.TV.Crime}|${TMDB_GENRES.TV.Drama}`, with_keywords: '9715|180734|7002', sort_by: 'vote_average.desc', 'vote_average.gte': 7.0, 'vote_count.gte': 100, without_keywords: '210024' }] },
        { id: 'preset_tv_horror', name: 'Serie Horror & Soprannaturali', emoji: '👻', category: "👻 Brivido & Paura", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Drama, with_keywords: '6152|3335', sort_by: 'vote_average.desc', 'vote_count.gte': 100, without_keywords: '210024' }] },

        // =============================================
        // --- 📺 SERIE TV & DOCU (Formati) ---
        // =============================================
        { id: 'preset_nature_docs', name: 'Documentari: Natura e Animali', emoji: '🌿', category: "🌍 Documentari & Storie Vere", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '18330|18165|9902|221355|284176', sort_by: 'vote_average.desc', 'vote_count.gte': 30 }] },
        { id: 'preset_nature_series_docs', name: 'Docuserie: Natura e Animali', emoji: '🌿', category: "🌍 Documentari & Storie Vere", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '18330|18165|9902|221355|284176', sort_by: 'vote_average.desc', 'vote_count.gte': 30 }] },
        { id: 'preset_space_docs', name: 'Documentari: Cosmo e Spazio', emoji: '🚀', category: "🌍 Documentari & Storie Vere", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '9882|3801|15325|41608|160330|252634', sort_by: 'vote_average.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_sea_movie_docs', name: 'Documentari: Abissi e Oceani', emoji: '🌊', category: "🌍 Documentari & Storie Vere", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '270|658|240494|4676|15066|155529|15097|14785|240075|232412|3343|2769|348851|367878|195857', sort_by: 'vote_average.desc', 'vote_count.gte': 15 }] },
        { id: 'preset_sea_series_docs', name: 'Docuserie: Abissi e Oceani', emoji: '🌊', category: "🌍 Documentari & Storie Vere", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '270|658|240494|4676|15066|155529|15097|14785|240075|232412|3343|2769|348851|367878|195857', sort_by: 'vote_average.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_true_crime', name: 'Docuserie: True Crime', emoji: '🚨', category: "🌍 Documentari & Storie Vere", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '33722', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_sports_docs', name: 'Docuserie: Sport e Atleti', emoji: '🌍', category: "🌍 Documentari & Storie Vere", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '6075|258273', sort_by: 'popularity.desc' }] },
        { id: 'preset_doc_music_legends', name: 'Leggende della Musica', emoji: '🎸', category: "🌍 Documentari & Storie Vere", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.MOVIE.Documentary},${TMDB_GENRES.MOVIE.Music}`, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }] },
        { id: 'preset_doc_food_travel', name: 'Cibo, Viaggi & Alta Cucina', emoji: '🍔', category: "🌍 Documentari & Storie Vere", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '1918|9935|10637|233721|6513', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_doc_history_war', name: 'Storia & Guerre Mondiali', emoji: '🪖', category: "🌍 Documentari & Storie Vere", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '1956|2504|258077|221689|282633', sort_by: 'vote_average.desc', 'vote_count.gte': 10 }] },
        { id: 'preset_doc_tech_future', name: 'Tecnologia, AI & Futuro', emoji: '💻', category: "🌍 Documentari & Storie Vere", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '1576|2964|41666|362282|310', sort_by: 'popularity.desc', 'vote_count.gte': 50 }] },
        { id: 'preset_big_sagas', name: 'Le Grandi Saghe (Franchises)', emoji: '💍', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '363309|364043|180547|306278|368218|361758', sort_by: 'revenue.desc', 'vote_count.gte': 100 }] },

        // =============================================
        // --- 🎭 GENERI & TEMATICHE (Formati) ---
        // =============================================
        { id: 'preset_miniseries', name: 'Miniserie di Qualità', emoji: '📺', category: "🕵️ Crimine, Mistero & Thriller", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Drama, with_keywords: '11162', sort_by: 'vote_average.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_anthology', name: 'Serie Antologiche', emoji: '📦', category: "🕵️ Crimine, Mistero & Thriller", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '9706', sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_sketch_comedy', name: 'Sketch Comedy', emoji: '😂', category: "🍿 Serata Leggera & Risate", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Comedy, with_keywords: '156203', sort_by: 'popularity.desc' }] },

        // =============================================
        // --- 📺 SERIE TV & DOCU ---
        // =============================================
        { id: 'preset_sitcoms', name: 'Sitcom Americane', emoji: '🛋️', category: "🍿 Serata Leggera & Risate", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Comedy, with_keywords: '9840|193171|9713', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_keywords: '210024' }] },
        { id: 'preset_medical_drama', name: 'Medical Drama', emoji: '🩺', category: "🍿 Serata Leggera & Risate", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Drama, with_keywords: '208788|11612|13005', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_crime_procedural', name: 'Procedurali (Crime)', emoji: '🚨', category: "🕵️ Crimine, Mistero & Thriller", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Crime, with_keywords: '207694|268067|298849|191199', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_teen_drama', name: 'Teen Drama & Coming of Age', emoji: '🎒', category: "🍿 Serata Leggera & Risate", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Drama, with_keywords: '6270|10683|11156|315570', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_time_travel', name: 'Viaggi nel Tempo (Serie)', emoji: '⏱️', category: "🐉 Fantascienza & Fantasy", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '4379|196984', sort_by: 'vote_average.desc', 'vote_count.gte': 100, without_keywords: '210024' }] },
        { id: 'preset_legal_drama', name: 'Legal Drama & Tribunali', emoji: '⚖️', category: "🕵️ Crimine, Mistero & Thriller", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.Drama, with_keywords: '222517|10909|33519', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024' }] },
        { id: 'preset_tv_thriller', name: 'Thriller & Suspense (Serie)', emoji: '😱', category: "🕵️ Crimine, Mistero & Thriller", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: `${TMDB_GENRES.TV.Drama}|${TMDB_GENRES.TV.Mystery}`, sort_by: 'vote_average.desc', 'vote_count.gte': 100, 'vote_average.gte': 7.5, without_keywords: '210024' }] },

        // =============================================
        // --- 🏮 ANIME & ASIA (Sottogeneri via Kitsu) ---
        // =============================================
        { id: 'preset_anime_simulcast', name: 'Simulcast (Nuovi Episodi)', emoji: '📺', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', showEpisodeBadge: true, queries: [{ provider: 'tmdb', strategy: 'discovery', with_original_language: 'ja', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc', 'air_date.gte': new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 'air_date.lte': new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }] },
        { id: 'preset_anime_shonen', name: 'Anime: Battle Shōnen', emoji: '🔥', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'shounen', sort_by: 'popularity.desc' }] },
        { id: 'preset_anime_seinen', name: 'Anime: Seinen (Maturi)', emoji: '🍷', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'seinen', sort_by: 'vote_average.desc' }] },
        { id: 'preset_anime_shoujo', name: 'Anime: Shōjo (Romantico)', emoji: '🌸', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'shoujo', sort_by: 'popularity.desc' }] },
        { id: 'preset_anime_slice_of_life', name: 'Anime: Slice of Life', emoji: '☕', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'slice of life', sort_by: 'vote_average.desc' }] },
        { id: 'preset_anime_mecha', name: 'Anime: Mecha & Robot', emoji: '🤖', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'mecha', sort_by: 'popularity.desc' }] },
        { id: 'preset_anime_isekai', name: 'Anime: Isekai & Fantasy', emoji: '🌀', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'isekai', sort_by: 'popularity.desc' }] },
        { id: 'preset_anime_dark', name: 'Anime: Dark & Psicologico', emoji: '💀', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'dark|psychological', sort_by: 'vote_average.desc' }] },
        { id: 'preset_anime_action', name: 'Anime: Azione & Combattimento', emoji: '💥', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'action', sort_by: 'popularity.desc' }] },
        { id: 'preset_anime_sports', name: 'Anime: Sport & Competizione', emoji: '🏐', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'sports', sort_by: 'vote_average.desc' }] },

        // =============================================
        // --- 🏮 ANIME & ASIA (Classici & Film via Kitsu) ---
        // =============================================
        { id: 'preset_anime_classic', name: 'Anime Classici (\'80/\'90)', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', 'first_air_date.gte': '1980-01-01', 'first_air_date.lte': '1999-12-31', sort_by: 'vote_average.desc' }] },
        { id: 'preset_anime_00s', name: 'Anime Anni 2000', emoji: '💿', category: "🏮 Solo Anime", type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', 'first_air_date.gte': '2000-01-01', 'first_air_date.lte': '2009-12-31', sort_by: 'vote_average.desc' }] },
        { id: 'preset_anime_movies_top', name: 'Capolavori Anime (Film)', emoji: '🏆', category: "🏮 Solo Anime", type: 'movie', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', sort_by: 'vote_average.desc' }] },
        { id: 'preset_anime_movies_romance', name: 'Film Anime Romantici', emoji: '🎥', category: "🏮 Solo Anime", type: 'movie', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'romance', sort_by: 'popularity.desc' }] },

        // =============================================
        // --- 📺 SERIE TV & DOCU (Networks) ---
        // =============================================
        { id: 'preset_hbo', name: 'Produzione HBO', emoji: '📺', category: "📺 Network & Piattaforme", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: TMDB_NETWORKS.HBO, sort_by: 'vote_average.desc', 'vote_count.gte': 100 }] },
        { id: 'preset_netflix', name: 'Originali Netflix', emoji: 'N', category: "📺 Network & Piattaforme", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: TMDB_NETWORKS.Netflix, sort_by: 'popularity.desc', 'vote_count.gte': 20 }] },
        { id: 'preset_amazon', name: 'Amazon Prime Video', emoji: 'A', category: "📺 Network & Piattaforme", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: TMDB_NETWORKS.Amazon, sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_disney_plus', name: 'Disney+', emoji: '🏰', category: "📺 Network & Piattaforme", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: TMDB_NETWORKS.DisneyPlus, sort_by: 'popularity.desc', 'vote_count.gte': 5 }] },
        { id: 'preset_apple_tv', name: 'Apple TV+', emoji: '🍎', category: "📺 Network & Piattaforme", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: TMDB_NETWORKS.AppleTV, sort_by: 'vote_average.desc', 'vote_count.gte': 100, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        // =============================================
        // --- ➕ NUOVI CATALOGHI ---
        // =============================================
        { id: 'preset_a24_horror', name: 'A24: Horror & Thriller', emoji: '💎', category: "👻 Brivido & Paura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_companies: TMDB_COMPANIES.A24, with_genres: `${TMDB_GENRES.MOVIE.Horror}|${TMDB_GENRES.MOVIE.Thriller}`, sort_by: 'vote_average.desc', 'vote_count.gte': 200, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_vampires_werewolves', name: 'Vampiri & Lupi Mannari', emoji: '🧛', category: "👻 Brivido & Paura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '3133|12377|12564|12377', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_cyberpunk_series', name: 'Cyberpunk & Distopia (Serie)', emoji: '🤖', category: "🐉 Fantascienza & Fantasy", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '12190|4565|156556|210086', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024', without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_top_current_year', name: 'Il meglio dell\'anno', category: "🔥 Top & Trend", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', primary_release_year: today.getFullYear(), sort_by: 'vote_average.desc', 'vote_count.gte': 100, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        // =============================================
        // --- ➕ NUOVI CATALOGHI (Mainstream & Thematic) ---
        // =============================================
        { id: 'preset_romcom', name: 'Commedie Romantiche', emoji: '🎬', category: "🍿 Serata Leggera & Risate", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '35,10749', sort_by: 'popularity.desc', 'vote_count.gte': 100, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_action_blockbusters', name: 'Azione, Motori & Esplosioni', emoji: '🍿', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 28, with_keywords: '10051|208035|4565|1701', sort_by: 'revenue.desc', 'vote_count.gte': 100, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_psych_thriller', name: 'Thriller Psicologici', emoji: '😱', category: "🕵️ Crimine, Mistero & Thriller", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 53, with_keywords: '15001|12377|12988|10391', sort_by: 'popularity.desc', 'vote_count.gte': 100, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_reality_shows', name: 'Reality Show & Competizioni', emoji: '🎬', category: "🌍 Documentari & Storie Vere", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 10764, sort_by: 'popularity.desc', 'vote_count.gte': 5, without_keywords: '210024', without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_fantasy_magic', name: 'Grandi Saghe Fantasy & Magia', emoji: '🧙', category: "🐉 Fantascienza & Fantasy", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '14,12', with_keywords: '12554|6092|3205', sort_by: 'revenue.desc', 'vote_count.gte': 100, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        
        { id: 'preset_italian_comedy', name: 'Commedie Italiane', emoji: '🇮🇹', category: "🍿 Serata Leggera & Risate", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'it', with_genres: 35, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_turkish_dizi', name: 'Serie Turche (Dizi)', emoji: '🎬', category: "🌏 K-Drama, Dizi & Asia", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_original_language: 'tr', with_genres: '18|10766', sort_by: 'popularity.desc', 'vote_count.gte': 5, without_keywords: '210024' }] },
        { id: 'preset_teen_drama_comedy', name: 'High School & Teen Drama', emoji: '😂', category: "🍿 Serata Leggera & Risate", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '35|18', with_keywords: '6270|10683|11156|315570', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_keywords: '210024', without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_zombies', name: 'Zombie & Infezioni', emoji: '🧟', category: "👻 Brivido & Paura", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '12377|4565|10483', with_genres: '27|10765', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_keywords: '210024', without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_treasure_hunters', name: 'Cacciatori di Tesori & Avventurieri', emoji: '🎬', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 12, with_keywords: '10084|156525|4328', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_original_language: 'ko|zh|th|hi|te|ta' }] },

        { id: 'preset_adult_animation', name: 'Animazione per Adulti', emoji: '🎬', category: "🔥 Altri Cataloghi", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: '16,35', with_keywords: '158536|187056', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_keywords: '210024', without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_giant_monsters', name: 'Squali & Mostri Giganti', emoji: '🦖', category: "👻 Brivido & Paura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '10466|156095|257007|12335', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_slapstick_comedy', name: 'Commedia Demenziale', emoji: '😂', category: "🍿 Serata Leggera & Risate", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 35, with_keywords: '14185|175402|34117|9716', sort_by: 'popularity.desc', 'vote_count.gte': 100, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_extreme_survival', name: 'Sopravvivenza Estrema', emoji: '🏕️', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '4564|285366|3335', sort_by: 'vote_average.desc', 'vote_count.gte': 200, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_sports_underdog', name: 'Storie di Sport & Riscatto', emoji: '⚽', category: "💥 Adrenalina & Avventura", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_keywords: '6075|10505|22822', with_genres: 18, sort_by: 'vote_average.desc', 'vote_count.gte': 200, without_original_language: 'ko|zh|th|hi|te|ta' }] },

        // =============================================
        // --- 📺 NETWORKS & PIATTAFORME ---
        // =============================================
        { id: 'preset_netflix_movies', name: 'Film su Netflix', emoji: 'N', category: "📺 Network & Piattaforme", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_watch_providers: 8, watch_region: 'US', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_amazon_movies', name: 'Film su Prime Video', emoji: 'A', category: "📺 Network & Piattaforme", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_watch_providers: 119, watch_region: 'US', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_disney_movies', name: 'Film su Disney+', emoji: '🏰', category: "📺 Network & Piattaforme", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_watch_providers: 337, watch_region: 'US', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_hbo_max_movies', name: 'Film su Max', emoji: '📺', category: "📺 Network & Piattaforme", type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_watch_providers: 384, watch_region: 'US', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        
        { id: 'preset_hbo_max_series', name: 'Serie su Max', emoji: '📺', category: "📺 Network & Piattaforme", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: 3186, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024', without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_hulu_series', name: 'Serie su Hulu', emoji: '🟩', category: "📺 Network & Piattaforme", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: 453, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024', without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_paramount_series', name: 'Serie su Paramount+', emoji: '🏔️', category: "📺 Network & Piattaforme", type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_networks: 4330, sort_by: 'popularity.desc', 'vote_count.gte': 20, without_keywords: '210024', without_original_language: 'ko|zh|th|hi|te|ta' }] },
        // =============================================
        // --- ➕ NUOVI CATALOGHI (Bambini & Famiglia) ---
        // =============================================
        { id: 'preset_family_movies_live', name: 'Film per Famiglie (Live)', emoji: '👨‍👩‍👧‍👦', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 10751, without_genres: 16, without_keywords: '210024', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_kids_series', name: 'Cartoni in TV & Serie Kids', emoji: '🧸', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 10762, without_keywords: '210024', sort_by: 'popularity.desc', 'vote_count.gte': 10, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_teen_preteen_tv', name: 'Teen & Pre-Teen TV (Live)', emoji: '🎒', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'series', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 10762, without_genres: 16, without_keywords: '210024', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_fairy_tales', name: 'Fiabe, Castelli & Principesse', emoji: '🧚', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 10751, with_keywords: '3205|3095|12554', without_keywords: '210024', sort_by: 'popularity.desc', 'vote_count.gte': 50, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_animal_protagonists', name: 'Animali Protagonisti', emoji: '🐾', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'movie', presentation_strategy: 'popularity', queries: [{ strategy: 'discovery', with_genres: 10751, with_keywords: '10574|6054|11303', without_keywords: '210024', sort_by: 'popularity.desc', 'vote_count.gte': 20, without_original_language: 'ko|zh|th|hi|te|ta' }] },
        { id: 'preset_anime_kids_series', name: 'Anime per Bambini (Serie)', emoji: '🧸', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'series', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'kids', sort_by: 'popularity.desc' }] },
        { id: 'preset_anime_kids_movies', name: 'Anime per Bambini (Film)', emoji: '🧸', category: '👨‍👩‍👧‍👦 Bambini & Famiglia', type: 'movie', presentation_strategy: 'popularity', queries: [{ provider: 'kitsu', strategy: 'discovery', _keywordNames: 'kids', sort_by: 'popularity.desc' }] },

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
            'preset_oscar_winners', 'preset_a24_horror', 'preset_pop_anime', 'preset_romcom', 'preset_netflix_movies', 'preset_top_current_year'
        ]
    },
    {
        id: 'tpl_movies',
        name: 'Solo Film',
        description: 'I migliori film di ogni genere e periodo',
        presets: [
            'preset_pop_movies', 'preset_new_movies', 'preset_top_rated_movies', 'preset_oscar_winners', 'preset_a24_horror',
            'preset_blockbusters', 'preset_big_sagas', 'preset_nolan', 'preset_cyberpunk_series', 'preset_tarantino',
            'preset_scorsese', 'preset_a24', 'preset_romcom', 'preset_action_blockbusters', 'preset_psych_thriller', 'preset_italian_comedy', 'preset_netflix_movies', 'preset_amazon_movies', 'preset_disney_movies', 'preset_hbo_max_movies', 'preset_mindfuck', 'preset_pure_comedy', 'preset_top_current_year'
        ]
    },
    {
        id: 'tpl_series',
        name: 'Solo Serie TV',
        description: 'Le migliori serie TV da binge-watchare',
        presets: [
            'preset_pop_series', 'preset_new_series', 'preset_new_series_eps', 'preset_top_rated_series',
            'preset_hbo', 'preset_hbo_max_series', 'preset_hulu_series', 'preset_paramount_series', 'preset_reality_shows', 'preset_turkish_dizi', 'preset_adult_animation', 'preset_teen_drama_comedy', 'preset_netflix', 'preset_apple_tv', 'preset_sitcoms', 'preset_teen_drama_comedy', 'preset_romcom', 'preset_turkish_dizi',
            'preset_true_crime', 'preset_reality_shows', 'preset_sports_underdog', 'preset_tv_thriller', 'preset_miniseries', 'preset_crime_procedural', 'preset_cyberpunk_series'
        ]
    },
    {
        id: 'tpl_otaku',
        name: '🎌 Otaku Hardcore (Anime)',
        description: 'Ogni sottogenere anime, dai classici al simulcast',
        presets: [
            'preset_anime_simulcast', 'preset_pop_anime', 'preset_new_anime',
            'preset_anime_shonen', 'preset_anime_seinen', 'preset_anime_shoujo',
            'preset_anime_isekai', 'preset_anime_slice_of_life', 'preset_anime_action',
            'preset_anime_mecha', 'preset_anime_dark', 'preset_anime_sports',
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
            'preset_villeneuve', 'preset_nolan', 'preset_cyberpunk_series'
        ]
    },
    {
        id: 'tpl_couple',
        name: '💕 Serata di Coppia',
        description: 'Film e serie romantiche, commedie e feel-good',
        presets: [
            'preset_feel_good', 'preset_pure_comedy', 'preset_top_current_year', 'preset_sad_romance', 'preset_musical',
            'preset_pop_movies', 'preset_sitcoms', 'preset_teen_drama_comedy', 'preset_romcom', 'preset_turkish_dizi', 'preset_kdrama_romance',
            'preset_new_movies', 'preset_miniseries'
        ]
    },
    {
        id: 'tpl_adrenaline',
        name: '💥 Adrenalina & Popcorn',
        description: 'Azione, esplosioni, supereroi e adrenalina pura',
        presets: [
            'preset_actor_cruise', 'preset_actor_reeves', 'preset_heist', 'preset_action_blockbusters', 'preset_giant_monsters', 'preset_zombies', 'preset_treasure_hunters', 'preset_extreme_survival', 'preset_spy_action',
            'preset_marvel', 'preset_dc', 'preset_blockbusters', 'preset_disaster_movies',
            'preset_martial_arts', 'preset_pop_movies', 'preset_cyberpunk'
        ]
    },
    {
        id: 'tpl_mystery',
        name: '🕵️ Crimine & Mistero',
        description: 'Thriller, misteri, whodunit e vero crimine',
        presets: [
            'preset_whodunit', 'preset_mindfuck', 'preset_neo_noir', 'preset_psych_thriller', 'preset_fincher',
            'preset_true_crime', 'preset_reality_shows', 'preset_sports_underdog', 'preset_crime_procedural', 'preset_cyberpunk_series', 'preset_tv_mafia',
            'preset_nordic_noir', 'preset_british_crime', 'preset_tv_thriller',
            'preset_kdrama_thriller', 'preset_a24_horror', 'preset_vampires_werewolves'
        ]
    },
    {
        id: 'tpl_fast_watch',
        name: '⏱️ Poco Tempo',
        description: 'Film brevi, miniserie e episodi veloci',
        presets: [
            'preset_miniseries', 'preset_sitcoms', 'preset_teen_drama_comedy', 'preset_romcom', 'preset_turkish_dizi', 'preset_new_series_eps',
            'preset_stand_up', 'preset_adult_animation', 'preset_slapstick_comedy', 'preset_pure_comedy', 'preset_top_current_year', 'preset_feel_good'
        ]
    },
    {
        id: 'tpl_international',
        name: '🌎 Passaporto Globale',
        description: 'Il meglio del cinema e delle serie da tutto il mondo',
        presets: [
            'preset_nordic_noir', 'preset_spanish_thriller', 'preset_french_cinema', 'preset_italian_comedy', 'preset_turkish_dizi',
            'preset_british_crime', 'preset_bollywood', 'preset_cinema_coreano',
            'preset_italian_cinema', 'preset_german_dark', 'preset_kdrama_thriller', 'preset_a24_horror', 'preset_vampires_werewolves',
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
            'preset_spielberg', 'preset_scorsese', 'preset_nolan', 'preset_cyberpunk_series'
        ]
    },
    {
        id: 'tpl_docu_discovery',
        name: '🌍 Documentari & Scoperta',
        description: 'Documentari di ogni tipo: natura, scienza, storia',
        presets: [
            'preset_nature_docs', 'preset_nature_series_docs', 'preset_space_docs', 'preset_sea_movie_docs', 'preset_sea_series_docs', 'preset_doc_history_war',
            'preset_doc_tech_future', 'preset_doc_food_travel', 'preset_true_crime', 'preset_reality_shows', 'preset_sports_underdog',
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
            'preset_sitcoms', 'preset_teen_drama_comedy', 'preset_romcom', 'preset_turkish_dizi', 'preset_spielberg', 'preset_burton'
        ]
    },
    {
        id: 'tpl_horror',
        name: '🧛 Horror Night',
        description: 'Paura, terrore e brividi per serate da incubo',
        presets: [
            'preset_horror_all', 'preset_scary_horror', 'preset_zombies', 'preset_slasher_gore',
            'preset_blumhouse', 'preset_tv_horror', 'preset_apocalypse_survival',
            'preset_80s_movies', 'preset_mindfuck', 'preset_kdrama_thriller', 'preset_a24_horror', 'preset_vampires_werewolves'
        ]
    },
    {
        id: 'tpl_autori',
        name: '🎬 Cinema d\'Autore',
        description: 'Il meglio del cinema d\'autore internazionale',
        presets: [
            'preset_a24', 'preset_romcom', 'preset_action_blockbusters', 'preset_psych_thriller', 'preset_italian_comedy', 'preset_netflix_movies', 'preset_amazon_movies', 'preset_disney_movies', 'preset_hbo_max_movies', 'preset_nolan', 'preset_cyberpunk_series', 'preset_kubrick', 'preset_villeneuve',
            'preset_ghibli', 'preset_fincher', 'preset_wesanderson', 'preset_lynch',
            'preset_french_cinema', 'preset_italian_comedy', 'preset_turkish_dizi', 'preset_cinema_coreano', 'preset_italian_cinema',
            'preset_oscar_winners', 'preset_a24_horror'
        ]
    },
    {
        id: 'tpl_kids',
        name: '👨‍👩‍👧‍👦 Bambini & Famiglia',
        description: 'Contenuti sicuri e divertenti per tutta la famiglia',
        presets: [
            'preset_pixar', 'preset_dreamworks', 'preset_ghibli', 'preset_disney_plus',
            'preset_disney_animation', 'preset_family_movies_live', 'preset_kids_series', 'preset_teen_preteen_tv', 'preset_fairy_tales', 'preset_animal_protagonists', 'preset_anime_kids_series', 'preset_anime_kids_movies'
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
