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
    // --- TOP & TREND (Base) ---
    { id: 'preset_pop_movies', name: 'Film Popolari', category: 'Top & Trend', type: 'movie', filters: { sort_by: 'popularity.desc' } },
    { id: 'preset_pop_series', name: 'Serie TV Popolari', category: 'Top & Trend', type: 'series', filters: { sort_by: 'popularity.desc' } },
    { id: 'preset_new_movies', name: 'Film: Nuove Uscite (Ultimi 2 Mesi)', category: 'Top & Trend', type: 'movie', filters: { 'primary_release_date.lte': todayStr, 'primary_release_date.gte': twoMonthsAgoStr, sort_by: 'popularity.desc' } },
    { id: 'preset_new_series', name: 'Serie TV: Novità (Ultimi 6 Mesi)', category: 'Top & Trend', type: 'series', filters: { 'first_air_date.lte': todayStr, 'first_air_date.gte': sixMonthsAgoStr, sort_by: 'popularity.desc' } },
    { id: 'preset_new_series_eps', name: 'Serie TV: Ultimi Episodi (In Corso)', category: 'Top & Trend', type: 'series', filters: { 'air_date.lte': todayStr, 'air_date.gte': twoWeeksAgoStr, sort_by: 'popularity.desc' } },
    { id: 'preset_pop_anime', name: 'Anime Popolari', category: 'Top & Trend', type: 'series', filters: { with_keywords: '210024', sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_new_anime', name: 'Anime: Novità', category: 'Top & Trend', type: 'series', filters: { with_keywords: '210024', 'first_air_date.lte': todayStr, 'first_air_date.gte': sixMonthsAgoStr, sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_new_anime_eps', name: 'Anime: Nuovi Episodi (Simulcast)', category: 'Top & Trend', type: 'series', filters: { 'air_date.lte': todayStr, 'air_date.gte': twoWeeksAgoStr, with_keywords: '210024', sort_by: 'popularity.desc', with_genres: TMDB_GENRES.TV.Animation } },

    // --- GRANDI REGISTI ---
    { id: 'preset_nolan', name: 'Regia: Christopher Nolan', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Nolan } },
    { id: 'preset_tarantino', name: 'Regia: Quentin Tarantino', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Tarantino } },
    { id: 'preset_scorsese', name: 'Regia: Martin Scorsese', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Scorsese } },
    { id: 'preset_spielberg', name: 'Regia: Steven Spielberg', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Spielberg } },
    { id: 'preset_kubrick', name: 'Regia: Stanley Kubrick', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Kubrick } },
    { id: 'preset_villeneuve', name: 'Regia: Denis Villeneuve', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Villeneuve } },
    { id: 'preset_fincher', name: 'Regia: David Fincher', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Fincher } },
    { id: 'preset_burton', name: 'Regia: Tim Burton', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Burton } },
    { id: 'preset_wesanderson', name: 'Regia: Wes Anderson', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.WesAnderson } },
    { id: 'preset_lynch', name: 'Regia: David Lynch', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Lynch } },
    { id: 'preset_scott', name: 'Regia: Ridley Scott', category: 'Grandi Registi', type: 'movie', filters: { with_crew: TMDB_PEOPLE.Scott } },

    // --- GRANDI ATTORI ---
    { id: 'preset_actor_dicaprio', name: 'Starring: Leonardo DiCaprio', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.DiCaprio } },
    { id: 'preset_actor_cruise', name: 'Starring: Tom Cruise', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.Cruise } },
    { id: 'preset_actor_reeves', name: 'Starring: Keanu Reeves', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.Reeves } },
    { id: 'preset_brad_pitt', name: 'Starring: Brad Pitt', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.BradPitt } },
    { id: 'preset_de_niro', name: 'Starring: Robert De Niro', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.DeNiro } },
    { id: 'preset_johnny_depp', name: 'Starring: Johnny Depp', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.JohnnyDepp } },
    { id: 'preset_denzel', name: 'Starring: Denzel Washington', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.Denzel } },
    { id: 'preset_nicolas_cage', name: 'La Follia di Nicolas Cage', category: 'Grandi Attori', type: 'movie', filters: { with_cast: TMDB_PEOPLE.NicolasCage } },

    // --- STUDIOS ---
    { id: 'preset_ghibli', name: 'Studio Ghibli: Capolavori Animati', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Ghibli } },
    { id: 'preset_pixar', name: 'Disney Pixar', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Pixar } },
    { id: 'preset_a24', name: 'A24: Cinema Indipendente', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.A24 } },
    { id: 'preset_marvel', name: 'Marvel Cinematic Universe', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Marvel } },
    { id: 'preset_blumhouse', name: 'Blumhouse Horror', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.Blumhouse } },
    { id: 'preset_dreamworks', name: 'DreamWorks Animation', category: 'Studios & Produzioni', type: 'movie', filters: { with_companies: TMDB_COMPANIES.DreamWorks } },

    // --- CINEMA ASIATICO & K-DRAMA ---
    { id: 'preset_kdrama_romance', name: 'K-Drama: Romantici e Commedie', category: 'Cinema Asiatico & K-Drama', type: 'series', filters: { with_original_language: 'ko', with_genres: '35,10749', sort_by: 'popularity.desc' } },
    { id: 'preset_kdrama_thriller', name: 'K-Drama: Thriller & Mistero', category: 'Cinema Asiatico & K-Drama', type: 'series', filters: { with_original_language: 'ko', with_genres: '80,9648', sort_by: 'popularity.desc' } },
    { id: 'preset_asian_action', name: 'Azione Asiatica (JP, KR, HK)', category: 'Cinema Asiatico & K-Drama', type: 'movie', filters: { with_original_language: 'ja|ko|zh', with_genres: '28', with_keywords: '779,2073' } },

    // --- CINEMA INTERNAZIONALE ---
    { id: 'preset_nordic_noir', name: 'Nordic Noir (Gialli Scandinavi)', category: 'Cinema Internazionale', type: 'series', filters: { with_original_language: 'sv|da|no', with_genres: TMDB_GENRES.TV.Crime } },
    { id: 'preset_spanish_thriller', name: 'Thriller Spagnoli (Alta Tensione)', category: 'Cinema Internazionale', type: 'movie', filters: { with_original_language: 'es', with_genres: `${TMDB_GENRES.MOVIE.Thriller},${TMDB_GENRES.MOVIE.Mystery}` } },
    { id: 'preset_british_crime', name: 'Gialli & Crime Inglesi (UK)', category: 'Cinema Internazionale', type: 'series', filters: { with_origin_country: 'GB', with_genres: `${TMDB_GENRES.TV.Crime},${TMDB_GENRES.TV.Mystery}` } },
    { id: 'preset_bollywood', name: 'Bollywood Hits & Cinema Indiano', category: 'Cinema Internazionale', type: 'movie', filters: { with_original_language: 'hi', with_origin_country: 'IN', sort_by: 'popularity.desc' } },
    { id: 'preset_french_cinema', name: 'Cinema Francese d\'Autore', category: 'Cinema Internazionale', type: 'movie', filters: { with_original_language: 'fr', 'vote_average.gte': 7.0, 'vote_count.gte': 300 } },

    // --- DECENNI & EPOCHE ---
    { id: 'preset_80s_movies', name: 'Cult Anni \'80', category: 'Decenni & Epoche', type: 'movie', filters: { 'primary_release_date.gte': '1980-01-01', 'primary_release_date.lte': '1989-12-31', 'vote_count.gte': 500 } },
    { id: 'preset_90s_movies', name: 'Classici Anni \'90', category: 'Decenni & Epoche', type: 'movie', filters: { 'primary_release_date.gte': '1990-01-01', 'primary_release_date.lte': '1999-12-31', 'vote_count.gte': 1000 } },
    { id: 'preset_00s_movies', name: 'I favolosi Anni 2000', category: 'Decenni & Epoche', type: 'movie', filters: { 'primary_release_date.gte': '2000-01-01', 'primary_release_date.lte': '2009-12-31', 'vote_count.gte': 2000 } },
    { id: 'preset_oscar_winners', name: 'Grandi Film Premiati', category: 'Decenni & Epoche', type: 'movie', filters: { 'vote_average.gte': 8.0, 'vote_count.gte': 3000 } },
    { id: 'preset_cult_classics', name: 'Film Cult (Venerati dai fan)', category: 'Decenni & Epoche', type: 'movie', filters: { with_keywords: '11800', 'vote_count.gte': 1000 } },

    // --- MOOD & TEMATICHE ---
    { id: 'preset_mindfuck', name: 'Mindfuck & Plot Twists', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Mystery},${TMDB_GENRES.MOVIE.Thriller}`, with_keywords: '978,33633' } },
    { id: 'preset_feel_good', name: 'Feel-Good (Umore Leggero)', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: '35,10751', without_genres: '18,27', 'vote_average.gte': 6.5 } },
    { id: 'preset_pure_comedy', name: 'Commedia Pura (No Dramma)', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Comedy, without_genres: `${TMDB_GENRES.MOVIE.Drama},${TMDB_GENRES.MOVIE.Romance}` } },
    { id: 'preset_scary_horror', name: 'Horror Atmosferico', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '3335,9706' } },
    { id: 'preset_vampires_werewolves', name: 'Vampiri & Licantropi', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '3133,12564' } },
    { id: 'preset_slasher', name: 'Horror Slasher (Anni 80/90)', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Horror, with_keywords: '12335' } },
    { id: 'preset_whodunit', name: 'Whodunit & Indagini', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: '9648', with_keywords: '11134,10391' } },
    { id: 'preset_post_apocalyptic', name: 'Sopravvivenza & Post-Apocalisse', category: 'Mood & Tematiche', type: 'movie', filters: { with_keywords: '285366,4564' } },
    { id: 'preset_sad_romance', name: 'Storie d\'Amore Drammatiche', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: '18,10749', with_keywords: '13130' } },
    { id: 'preset_heist', name: 'Rapine & Colpi Grossi (Heist)', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Crime},${TMDB_GENRES.MOVIE.Action}`, with_keywords: '10051' } },
    { id: 'preset_true_story', name: 'Basato su Storie Vere', category: 'Mood & Tematiche', type: 'movie', filters: { with_keywords: '9672', 'vote_average.gte': 6.5 } },
    { id: 'preset_stand_up', name: 'Stand-Up Comedy (Spettacoli)', category: 'Mood & Tematiche', type: 'movie', filters: { with_keywords: '9716', with_genres: TMDB_GENRES.MOVIE.Comedy } },
    { id: 'preset_musical', name: 'Musical & Film Musicali', category: 'Mood & Tematiche', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Music, with_keywords: '4344' } },

    // --- FILM: SOTTOGENERI ---
    { id: 'preset_epic_historical', name: 'Kolossal & Epopee Storiche', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.History},${TMDB_GENRES.MOVIE.Action}`, with_keywords: '10084,302011', 'vote_count.gte': 500 } },
    { id: 'preset_spy_action', name: 'Spionaggio & Agenti Segreti', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Action},${TMDB_GENRES.MOVIE.Thriller}`, with_keywords: '470,3230', sort_by: 'revenue.desc' } },
    { id: 'preset_neo_noir', name: 'Neo-Noir & Detective Oscuri', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Crime},${TMDB_GENRES.MOVIE.Mystery}`, with_keywords: '207317', 'vote_average.gte': 7.0, 'vote_count.gte': 300 } },
    { id: 'preset_space_hard_scifi', name: 'Hard Sci-Fi (Spazio Profondo)', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.SciFi, with_keywords: '161176,3388,4379', 'vote_average.gte': 6.8 } },
    { id: 'preset_disaster_movies', name: 'Disaster Movies (Fine del Mondo)', category: 'Film: Sottogeneri', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Action},${TMDB_GENRES.MOVIE.SciFi}`, with_keywords: '5686,10483,10364', sort_by: 'popularity.desc' } },

    // --- SERIE TV: TEMATICHE ---
    { id: 'preset_tv_mafia', name: 'Mafia, Cartelli & Gangster', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: `${TMDB_GENRES.TV.Crime},${TMDB_GENRES.TV.Drama}`, with_keywords: '10398,3149,2463', 'vote_count.gte': 150 } },
    { id: 'preset_tv_high_fantasy', name: 'High Fantasy (Spade & Draghi)', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '11024,12554,3205', sort_by: 'popularity.desc' } },
    { id: 'preset_tv_dystopia', name: 'Futuri Distopici & Dittature', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '10053,4565' } },
    { id: 'preset_tv_politics', name: 'Intrighi Politici & Potere', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: `${TMDB_GENRES.TV.WarPolitics},${TMDB_GENRES.TV.Drama}`, with_keywords: '918,11150', 'vote_average.gte': 7.0 } },
    { id: 'preset_tv_superheroes_dark', name: 'Supereroi (Toni Oscuri/Maturi)', category: 'Serie TV: Tematiche', type: 'series', filters: { with_genres: `${TMDB_GENRES.TV.ActionAdventure},${TMDB_GENRES.TV.Crime}`, with_keywords: '9715,180734', 'vote_average.gte': 7.5 } },

    // --- DOCUMENTARI ---
    { id: 'preset_nature_docs', name: 'Documentari: Natura e Animali', category: 'Documentari', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '4344' } },
    { id: 'preset_space_docs', name: 'Documentari: Cosmo e Spazio', category: 'Documentari', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '3801' } },
    { id: 'preset_true_crime', name: 'Docuserie: True Crime', category: 'Documentari', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '156434' } },
    { id: 'preset_sports_docs', name: 'Docuserie: Sport e Atleti', category: 'Documentari', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '6075' } },
    { id: 'preset_doc_music_legends', name: 'Leggende della Musica & Concerti', category: 'Documentari', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Documentary},${TMDB_GENRES.MOVIE.Music}`, sort_by: 'vote_average.desc', 'vote_count.gte': 100 } },
    { id: 'preset_doc_food_travel', name: 'Cibo, Viaggi & Alta Cucina', category: 'Documentari', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '6513,13013,277353' } },
    { id: 'preset_doc_history_war', name: 'Storia Antica & Guerre Mondiali', category: 'Documentari', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Documentary, with_keywords: '2081,3573,12190' } },
    { id: 'preset_doc_tech_future', name: 'Tecnologia, AI & Futuro', category: 'Documentari', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Documentary, with_keywords: '41666,233379' } },

    // --- FORMATI & EVENTI ---
    { id: 'preset_miniseries', name: 'Miniserie (Da finire in un weekend)', category: 'Formati & Eventi', type: 'series', filters: { with_keywords: '11162', sort_by: 'vote_average.desc', 'vote_count.gte': 500 } },
    { id: 'preset_short_movies', name: 'Film Brevi (Sotto i 95 minuti)', category: 'Formati & Eventi', type: 'movie', filters: { 'with_runtime.lte': 95, sort_by: 'popularity.desc', 'vote_count.gte': 500 } },
    { id: 'preset_hidden_gems', name: 'Capolavori Nascosti', category: 'Formati & Eventi', type: 'movie', filters: { 'vote_average.gte': 7.5, 'vote_count.gte': 100, 'vote_count.lte': 1500, sort_by: 'vote_average.desc' } },

    // --- BAMBINI & FAMIGLIA ---
    { id: 'preset_kids_cn_nostalgia', name: 'Cartoon Network (Anni \'90/00)', category: 'Bambini & Famiglia', type: 'series', filters: { with_networks: '56', 'first_air_date.lte': '2010-12-31', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc' } },
    { id: 'preset_kids_nick_nostalgia', name: 'Nickelodeon (Anni \'90/00)', category: 'Bambini & Famiglia', type: 'series', filters: { with_networks: '13', 'first_air_date.lte': '2010-12-31', with_genres: TMDB_GENRES.TV.Animation, sort_by: 'popularity.desc' } },
    { id: 'preset_family_magic_adv', name: 'Avventure Magiche (Live Action)', category: 'Bambini & Famiglia', type: 'movie', filters: { with_genres: `${TMDB_GENRES.MOVIE.Family},${TMDB_GENRES.MOVIE.Fantasy}`, with_keywords: '11024,3205', sort_by: 'revenue.desc' } },
    { id: 'preset_teens_coming_of_age', name: 'Coming of Age (Crescita & Adolescenza)', category: 'Bambini & Famiglia', type: 'movie', filters: { with_genres: TMDB_GENRES.MOVIE.Drama, with_keywords: '10683', 'vote_average.gte': 7.0 } },

    // --- SERIE TV ---
    { id: 'preset_sitcoms', name: 'Sitcom Americane', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Comedy, with_keywords: '8596' } },
    { id: 'preset_scifi_shows', name: 'Serie TV Sci-Fi & Distopiche', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '4565,10053' } },
    { id: 'preset_medical_drama', name: 'Medical Drama', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Drama, with_keywords: '10091' } },
    { id: 'preset_crime_procedural', name: 'Procedurali (Un caso a episodio)', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Crime, with_keywords: '11094' } },
    { id: 'preset_teen_drama', name: 'Teen Drama & Liceo', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.Drama, with_keywords: '6270' } },
    { id: 'preset_time_travel', name: 'Viaggi nel Tempo & Paradossi', category: 'Serie TV', type: 'series', filters: { with_genres: TMDB_GENRES.TV.SciFiFantasy, with_keywords: '4379' } },

    // --- ANIME: SOTTOGENERI & DEMOGRAFICHE ---
    { id: 'preset_anime_shonen', name: 'Anime: Battle Shōnen', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,11545', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_seinen', name: 'Anime: Seinen (Maturi)', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,33446', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_shoujo', name: 'Anime: Shōjo (Storie Romantiche)', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,209714', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_slice_of_life', name: 'Anime: Slice of Life (Rilassanti)', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,282362', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_mecha', name: 'Anime: Mecha & Robot Giganti', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,6821', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_spokon', name: 'Anime: Spokon (Sport & Competizione)', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,6075', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_majokko', name: 'Anime: Magical Girl (Majokko)', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,226685', with_genres: TMDB_GENRES.TV.Animation } },

    // --- ANIME: NICCHIE HARDCORE ---
    { id: 'preset_anime_isekai_op', name: 'Anime: Isekai (Protagonista OP)', category: 'Anime: Nicchie', type: 'series', filters: { with_keywords: '210024,286460,170362', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_iyashikei', name: 'Anime: Iyashikei (Rilassanti & Curativi)', category: 'Anime: Nicchie', type: 'series', filters: { with_keywords: '210024,282362', 'vote_average.gte': 7.2, with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_gore_survival', name: 'Anime: Survival Game & Gore', category: 'Anime: Nicchie', type: 'series', filters: { with_keywords: '210024,10336,10821', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_music_idols', name: 'Anime: Idol & Musica', category: 'Anime: Nicchie', type: 'series', filters: { with_keywords: '210024,258288', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_dark_fantasy', name: 'Anime: Dark Fantasy', category: 'Anime: Nicchie', type: 'series', filters: { with_keywords: '210024,818', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_psychological', name: 'Anime: Thriller Psicologico', category: 'Anime: Nicchie', type: 'series', filters: { with_keywords: '210024,158536', with_genres: TMDB_GENRES.TV.Animation } },

    // --- ANIME: STORIA & COMBATTIMENTO ---
    { id: 'preset_anime_samurai', name: 'Anime: Samurai & Epoca Edo', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,41165', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_ninja', name: 'Anime: Ninja & Shinobi', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,3386', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_martial_arts', name: 'Anime: Arti Marziali & Tornei', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,18034', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_military', name: 'Anime: Guerra & Strategia Militare', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,16306', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_demons', name: 'Anime: Demoni & Cacciatori', category: 'Anime & Manga', type: 'series', filters: { with_keywords: '210024,3273', with_genres: TMDB_GENRES.TV.Animation } },

    // --- ANIME: DECENNI & FILM ---
    { id: 'preset_anime_80s', name: 'Anime Anni \'80 (Retrowave)', category: 'Anime & Manga', type: 'series', filters: { 'first_air_date.gte': '1980-01-01', 'first_air_date.lte': '1989-12-31', with_keywords: '210024', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_90s', name: 'Anime Anni \'90 (I Classici)', category: 'Anime & Manga', type: 'series', filters: { 'first_air_date.gte': '1990-01-01', 'first_air_date.lte': '1999-12-31', with_keywords: '210024', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_00s', name: 'Anime Anni 2000', category: 'Anime & Manga', type: 'series', filters: { 'first_air_date.gte': '2000-01-01', 'first_air_date.lte': '2009-12-31', with_keywords: '210024', with_genres: TMDB_GENRES.TV.Animation } },
    { id: 'preset_anime_movies_top', name: 'Capolavori Anime (Film)', category: 'Anime & Manga', type: 'movie', filters: { with_keywords: '210024', with_genres: TMDB_GENRES.MOVIE.Animation, 'vote_average.gte': 7.5, 'vote_count.gte': 500, sort_by: 'vote_average.desc' } },
    { id: 'preset_anime_movies_romance', name: 'Film Anime Romantici', category: 'Anime & Manga', type: 'movie', filters: { with_keywords: '210024', with_genres: `${TMDB_GENRES.MOVIE.Animation},${TMDB_GENRES.MOVIE.Romance}`, 'vote_count.gte': 200 } },

    // --- NETWORKS (Serie TV) ---
    { id: 'preset_hbo', name: 'Produzione HBO', category: 'Serie TV', type: 'series', filters: { with_networks: TMDB_NETWORKS.HBO } },
    { id: 'preset_netflix', name: 'Originali Netflix', category: 'Serie TV', type: 'series', filters: { with_networks: TMDB_NETWORKS.Netflix } },
    { id: 'preset_amazon', name: 'Amazon Prime Video', category: 'Serie TV', type: 'series', filters: { with_networks: TMDB_NETWORKS.Amazon } },
    { id: 'preset_disney_plus', name: 'Disney+', category: 'Serie TV', type: 'series', filters: { with_networks: TMDB_NETWORKS.DisneyPlus } }
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
        presets: ['preset_pop_movies', 'preset_new_movies', 'preset_nolan', 'preset_tarantino', 'preset_scorsese', 'preset_mindfuck', 'preset_pure_comedy']
    },
    {
        id: 'tpl_series',
        name: 'Solo Serie TV',
        presets: ['preset_pop_series', 'preset_new_series', 'preset_new_series_eps', 'preset_hbo', 'preset_netflix', 'preset_sitcoms', 'preset_true_crime']
    },
    {
        id: 'tpl_otaku',
        name: '🎌 Otaku Hardcore (Anime)',
        presets: [
            'preset_new_anime_eps', // Simulcast
            'preset_anime_movies_top', // Capolavori Film
            'preset_anime_dark_fantasy',
            'preset_anime_psychological',
            'preset_anime_slice_of_life',
            'preset_anime_90s' // I classici in fondo alla home
        ]
    },
    {
        id: 'tpl_nerd_culture',
        name: '🎮 Cultura Nerd & Sci-Fi',
        presets: [
            'preset_space_hard_scifi',
            'preset_tv_high_fantasy',
            'preset_tv_dystopia',
            'preset_tv_superheroes_dark',
            'preset_cyberpunk',
            'preset_anime_mecha'
        ]
    },
    {
        id: 'tpl_couple',
        name: '💕 Serata di Coppia',
        presets: [
            'preset_feel_good',
            'preset_pure_comedy',
            'preset_sad_romance',
            'preset_pop_movies',
            'preset_sitcoms'
        ]
    },
    {
        id: 'tpl_adrenaline',
        name: '💥 Adrenalina & Popcorn',
        presets: [
            'preset_actor_cruise',
            'preset_actor_reeves',
            'preset_heist',
            'preset_marvel',
            'preset_cyberpunk',
            'preset_pop_movies'
        ]
    },
    {
        id: 'tpl_mystery',
        name: '🕵️♂️ Crimine & Mistero',
        presets: [
            'preset_whodunit',
            'preset_mindfuck',
            'preset_true_crime',
            'preset_fincher',
            'preset_crime_procedural'
        ]
    },
    {
        id: 'tpl_fast_watch',
        name: '⏱️ Poco Tempo',
        presets: [
            'preset_short_movies',
            'preset_miniseries',
            'preset_sitcoms',
            'preset_new_series_eps'
        ]
    },
    {
        id: 'tpl_international',
        name: '🌎 Passaporto Globale',
        presets: ['preset_nordic_noir', 'preset_spanish_thriller', 'preset_french_cinema', 'preset_british_crime', 'preset_bollywood']
    },
    {
        id: 'tpl_hollywood_stars',
        name: '🌟 Maratona Hollywood',
        presets: ['preset_brad_pitt', 'preset_de_niro', 'preset_johnny_depp', 'preset_denzel', 'preset_nicolas_cage']
    },
    {
        id: 'tpl_docu_discovery',
        name: '🌍 Discovery Channel',
        presets: [
            'preset_nature_docs',
            'preset_space_docs',
            'preset_doc_history_war',
            'preset_doc_tech_future',
            'preset_doc_food_travel'
        ]
    },
    {
        id: 'tpl_nostalgia_90s',
        name: '📼 Nostalgia Anni \'90',
        presets: [
            'preset_90s_movies',
            'preset_kids_cn_nostalgia',
            'preset_kids_nick_nostalgia',
            'preset_anime_90s',
            'preset_sitcoms'
        ]
    },
    {
        id: 'tpl_horror',
        name: 'Horror Night',
        presets: ['preset_scary_horror', 'preset_blumhouse', 'preset_zombie', 'preset_80s_movies']
    },
    {
        id: 'tpl_autori',
        name: 'Cinema d\'Autore',
        presets: ['preset_a24', 'preset_nolan', 'preset_kubrick', 'preset_villeneuve', 'preset_ghibli']
    },
    {
        id: 'tpl_kids',
        name: 'Bambini & Famiglia',
        presets: ['preset_pixar', 'preset_dreamworks', 'preset_ghibli', 'preset_disney_plus']
    }
];

module.exports = { presets, profileTemplates };
