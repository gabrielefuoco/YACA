const profileTemplates = [
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
        name: '📼 Nostalgia (\\'80/\\'90)',
        description: 'Rivisita i classici degli anni \\'80 e \\'90',
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
            'preset_horror_all', 'preset_scary_horror', 'preset_zombies', 'preset_zombies_movies', 'preset_slasher_gore',
            'preset_blumhouse', 'preset_tv_horror', 'preset_apocalypse_survival',
            'preset_80s_movies', 'preset_mindfuck', 'preset_mindfuck_series', 'preset_kdrama_thriller', 'preset_a24_horror', 'preset_vampires_werewolves'
        ]
    },
    {
        id: 'tpl_autori',
        name: '🎬 Cinema d\\'Autore',
        description: 'Il meglio del cinema d\\'autore internazionale',
        presets: [
            'preset_a24', 'preset_romcom', 'preset_action_blockbusters', 'preset_psych_thriller', 'preset_italian_comedy', 'preset_netflix_movies', 'preset_amazon_movies', 'preset_disney_movies', 'preset_hbo_max_movies', 'preset_nolan', 'preset_cyberpunk', 'preset_kubrick', 'preset_villeneuve',
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

module.exports = profileTemplates;
