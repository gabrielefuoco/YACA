const fs = require('fs');
const path = require('path');
const store = require('../../src/db/duckDbStore');

async function main() {
    await store.init();

    const { F } = require('../../src/data/filters');

    // Query 50 mainstream movies and 50 mainstream tv shows
    const generalMovies = await store.query(`
        SELECT id, title, vote_average, popularity 
        FROM movies 
        WHERE vote_count > 5000 
          AND vote_average >= 7.5 
          AND NOT (${F.animeOf('movie')})
        ORDER BY popularity DESC 
        LIMIT 50
    `);

    const generalSeries = await store.query(`
        SELECT id, name, vote_average, popularity 
        FROM tv 
        WHERE vote_count > 2000 
          AND vote_average >= 7.8 
          AND NOT (${F.animeOf('tv')})
        ORDER BY popularity DESC 
        LIMIT 50
    `);

    // Query 50 anime movies and 50 anime series
    const animeMovies = await store.query(`
        SELECT id, title, vote_average, popularity 
        FROM movies 
        WHERE ${F.animeOf('movie')}
          AND vote_count > 100
        ORDER BY popularity DESC 
        LIMIT 50
    `);

    const animeSeries = await store.query(`
        SELECT id, name, vote_average, popularity 
        FROM tv 
        WHERE ${F.animeOf('tv')}
          AND vote_count > 100
        ORDER BY popularity DESC 
        LIMIT 50
    `);

    console.log(`Fetched candidates:
  General Movies: ${generalMovies.length}
  General Series: ${generalSeries.length}
  Anime Movies: ${animeMovies.length}
  Anime Series: ${animeSeries.length}`);

    // Build history entries with daysAgo spread over 1 to 120 days
    function buildHistoryList(movies, series, totalCount) {
        const half = Math.floor(totalCount / 2);
        const selMovies = movies.slice(0, half);
        const selSeries = series.slice(0, totalCount - half);
        const combined = [];
        const maxLen = Math.max(selMovies.length, selSeries.length);

        for (let i = 0; i < maxLen; i++) {
            if (i < selMovies.length) {
                const daysAgo = Math.max(1, Math.round(1 + (i / maxLen) * 110));
                combined.push({
                    tmdbId: Number(selMovies[i].id),
                    type: 'movie',
                    episodesWatched: 1,
                    source: 'trakt',
                    daysAgo
                });
            }
            if (i < selSeries.length) {
                const daysAgo = Math.max(1, Math.round(2 + (i / maxLen) * 110));
                combined.push({
                    tmdbId: Number(selSeries[i].id),
                    type: 'tv',
                    episodesWatched: 12,
                    source: 'stremio',
                    daysAgo
                });
            }
        }
        return combined.slice(0, totalCount);
    }

    const genHistory50 = buildHistoryList(generalMovies, generalSeries, 50);
    const genHistory100 = buildHistoryList(generalMovies, generalSeries, 100);

    const animeHistory50 = buildHistoryList(animeMovies, animeSeries, 50);
    const animeHistory100 = buildHistoryList(animeMovies, animeSeries, 100);

    const heroCatalogs = [
        "yaca_true_blend_movies",
        "yaca_true_blend_series",
        "yaca_seed_network_movies",
        "yaca_seed_network_series",
        "yaca_hidden_gems_movies",
        "yaca_hidden_gems_series",
        "yaca_trakt_filtered_movies",
        "yaca_trakt_filtered_series"
    ];

    const spec = {
        version: 1,
        description: "Campagna QC #19: valutazione hero a 0, 50 e 100 titoli visti su archetipi Generale e Otaku.",
        target: {
            userId: "sim_user_yaca",
            email: "sim@yaca.local",
            addonUuid: "sim-uuid-yaca",
            configVersion: "sim-coldstart-1.0.0",
            defaultProfileId: "sim_prof_gen_0"
        },
        heroCatalogs: {
            movie: [
                "yaca_true_blend_movies",
                "yaca_seed_network_movies",
                "yaca_hidden_gems_movies",
                "yaca_trakt_filtered_movies"
            ],
            series: [
                "yaca_true_blend_series",
                "yaca_seed_network_series",
                "yaca_hidden_gems_series",
                "yaca_trakt_filtered_series"
            ]
        },
        syntheticWatchlist: {
            items: []
        },
        syntheticLists: {
            items: []
        },
        profiles: [
            {
                id: "sim_prof_gen_0",
                name: "Generale (0 visti)",
                role: "generale_0",
                typeSelectors: { film: false, serie: false, anime: null },
                kidsMode: false,
                dna: { source: "4159713d", note: "Context reale 4159713d (Generale Tutto)" },
                catalogs: [...heroCatalogs],
                history: []
            },
            {
                id: "sim_prof_gen_50",
                name: "Generale (50 visti)",
                role: "generale_50",
                typeSelectors: { film: false, serie: false, anime: null },
                kidsMode: false,
                dna: { source: "4159713d", note: "Context reale 4159713d (Generale Tutto)" },
                catalogs: [...heroCatalogs],
                history: genHistory50
            },
            {
                id: "sim_prof_gen_100",
                name: "Generale (100 visti)",
                role: "generale_100",
                typeSelectors: { film: false, serie: false, anime: null },
                kidsMode: false,
                dna: { source: "4159713d", note: "Context reale 4159713d (Generale Tutto)" },
                catalogs: [...heroCatalogs],
                history: genHistory100
            },
            {
                id: "sim_prof_otaku_0",
                name: "Otaku (0 visti)",
                role: "otaku_0",
                typeSelectors: { film: false, serie: false, anime: null },
                kidsMode: false,
                dna: { source: "1c1da0af", note: "Context reale 1c1da0af (Otaku Hardcore)" },
                catalogs: [...heroCatalogs],
                history: []
            },
            {
                id: "sim_prof_otaku_50",
                name: "Otaku (50 visti)",
                role: "otaku_50",
                typeSelectors: { film: false, serie: false, anime: null },
                kidsMode: false,
                dna: { source: "1c1da0af", note: "Context reale 1c1da0af (Otaku Hardcore)" },
                catalogs: [...heroCatalogs],
                history: animeHistory50
            },
            {
                id: "sim_prof_otaku_100",
                name: "Otaku (100 visti)",
                role: "otaku_100",
                typeSelectors: { film: false, serie: false, anime: null },
                kidsMode: false,
                dna: { source: "1c1da0af", note: "Context reale 1c1da0af (Otaku Hardcore)" },
                catalogs: [...heroCatalogs],
                history: animeHistory100
            }
        ]
    };

    const outDir = path.resolve('.scratch/qc-cataloghi/runs');
    fs.mkdirSync(outDir, { recursive: true });
    const specPath = path.join(outDir, 'hero-coldstart.spec.json');
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
    console.log(`Spec generata con successo in: ${specPath}`);
    process.exit(0);
}

main().catch(err => {
    console.error('Errore creazione spec:', err);
    process.exit(1);
});
