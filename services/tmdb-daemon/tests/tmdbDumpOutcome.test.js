const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const TmdbDumpClient = require('../tmdbDumpClient');
const { dailySync, runTmdbDumpDaemon } = require('../tmdbDumpDaemon');
const { tmdbBudget } = require('../../../src/clients/tmdbBudget');
const { animeAiringState } = require('../../../src/anime');

test('TmdbDumpClient.fetchWithRetry: budget cap ritorna status errore e non not_found', async () => {
    tmdbBudget.resetMetrics();
    tmdbBudget.configureCap({ enabled: true, limit: 1, windowMs: 60000 });
    try {
        const client = new TmdbDumpClient('fake-key');
        tmdbBudget.recordCall('backfill', 'https://api.themoviedb.org/3/movie/1'); // satura il cap di 1

        const res = await client.fetchWithRetry('https://api.themoviedb.org/3/movie/603');
        assert.equal(res.status, 'errore');
        assert.equal(res.data, null);

        const outcome = await client.fetchMovieOutcome(603);
        assert.equal(outcome.status, 'errore');
        assert.equal(outcome.row, null);
    } finally {
        tmdbBudget.configureCap({ enabled: false, limit: null });
        tmdbBudget.resetMetrics();
    }
});

test('TmdbDumpClient.fetchWithRetry: HTTP 404 ritorna status not_found', async (t) => {
    const client = new TmdbDumpClient('fake-key');
    const notFoundError = new Error('Request failed with status code 404');
    notFoundError.response = { status: 404 };

    t.mock.method(axios, 'get', async () => {
        throw notFoundError;
    });

    const res = await client.fetchWithRetry('https://api.themoviedb.org/3/movie/9999999');
    assert.equal(res.status, 'not_found');
    assert.equal(res.data, null);

    const outcome = await client.fetchMovieOutcome(9999999);
    assert.equal(outcome.status, 'not_found');
    assert.equal(outcome.row, null);
});

test('TmdbDumpClient.fetchWithRetry: retry esauriti ritorna status errore', async (t) => {
    const client = new TmdbDumpClient('fake-key');
    const netError = new Error('Network error 500');
    netError.response = { status: 500 };

    t.mock.method(axios, 'get', async () => {
        throw netError;
    });

    // retries: 0 per fallire immediatamente senza pause
    const res = await client.fetchWithRetry('https://api.themoviedb.org/3/movie/500', {}, 0);
    assert.equal(res.status, 'errore');
    assert.equal(res.data, null);
});

test('buildMovieRow e fetchMovie: preserva formato riga JSONL e retrocompatibilità', async (t) => {
    const client = new TmdbDumpClient('fake-key');
    const samplePayload = {
        id: 603,
        imdb_id: 'tt0133093',
        title: 'Matrix',
        original_title: 'The Matrix',
        original_language: 'en',
        overview: 'Welcome to the Real World.',
        release_date: '1999-03-30',
        runtime: 136,
        vote_average: 8.2,
        vote_count: 24000,
        popularity: 85.5,
        status: 'Released',
        poster_path: '/matrix_poster.jpg',
        backdrop_path: '/matrix_backdrop.jpg',
        tagline: 'Free your mind',
        adult: false,
        budget: 63000000,
        revenue: 463517383,
        credits: {
            cast: [{ id: 6384, name: 'Keanu Reeves', character: 'Neo', order: 0 }],
            crew: [
                { id: 9339, name: 'Lana Wachowski', job: 'Director' },
                { id: 9340, name: 'Lilly Wachowski', job: 'Director' },
                { id: 9339, name: 'Lana Wachowski', job: 'Screenplay' }
            ]
        },
        keywords: { keywords: [{ id: 1, name: 'virtual reality' }] },
        videos: { results: [{ key: 'vKQi3bBA1y8', type: 'Trailer', site: 'YouTube' }] },
        images: { logos: [{ iso_639_1: 'it', file_path: '/logo_it.png' }] },
        recommendations: { results: [{ id: 604 }] },
        'watch/providers': { results: { IT: { flatrate: [{ provider_name: 'Netflix' }] } } },
        production_companies: [{ id: 79, name: 'Village Roadshow Pictures' }],
        production_countries: [{ iso_3166_1: 'US' }],
        spoken_languages: [{ iso_639_1: 'en' }],
        genres: [{ id: 878, name: 'Fantascienza' }],
        release_dates: {
            results: [{
                iso_3166_1: 'IT',
                release_dates: [{ certification: 'T' }]
            }]
        },
        translations: {
            translations: [{
                iso_639_1: 'it',
                data: { title: 'Matrix' }
            }]
        }
    };

    t.mock.method(axios, 'get', async () => ({ data: samplePayload }));

    const outcome = await client.fetchMovieOutcome(603);
    assert.equal(outcome.status, 'ok');
    assert.ok(outcome.row);

    const directRow = TmdbDumpClient.buildMovieRow(samplePayload);
    assert.equal(outcome.row.id, 603);
    assert.equal(outcome.row.imdb_id, 'tt0133093');
    assert.equal(outcome.row.title, 'Matrix');
    assert.equal(outcome.row.original_title, 'The Matrix');
    assert.equal(outcome.row.directors, JSON.stringify([{ id: 9339, name: 'Lana Wachowski' }, { id: 9340, name: 'Lilly Wachowski' }]));
    assert.equal(outcome.row.content_rating, 'T');
    assert.equal(outcome.row.adult, false);

    // fetchMovie restituisce l'oggetto row direttamente
    const legacyRow = await client.fetchMovie(603);
    assert.equal(legacyRow.id, directRow.id);
    assert.equal(legacyRow.title, directRow.title);
    assert.equal(legacyRow.runtime, directRow.runtime);
});

test('fetchMovieOutcome e fetchTvOutcome: gestione adult_filtered e filtered_vote_floor', async (t) => {
    const client = new TmdbDumpClient('fake-key');

    // 1. Adult filtered
    t.mock.method(axios, 'get', async () => ({
        data: {
            id: 999,
            title: 'Adult Title',
            original_title: 'Adult Title',
            original_language: 'en',
            adult: true,
            vote_count: 500
        }
    }));

    const adultOutcome = await client.fetchMovieOutcome(999);
    assert.equal(adultOutcome.status, 'adult_filtered');
    assert.equal(adultOutcome.row, null);

    const legacyAdult = await client.fetchMovie(999);
    assert.equal(legacyAdult, null);
});

test('dailySync: delete branch (errore -> NO delete, not_found -> delete, not_found tracciato airing -> NO delete)', async (t) => {
    t.mock.method(animeAiringState, 'getSnapshot', async () => ({
        byTmdbId: new Map([
            ['103', { tmdbId: '103' }] // 103 è tracciato airing
        ])
    }));

    const deletedMovies = [];
    const upsertedMovies = [];

    const fakeStore = {
        loadIds: async (type) => (type === 'movies' ? new Set([101, 102, 103, 104]) : new Set()),
        countLines: async () => 4,
        upsert: async (rows, type) => {
            if (type === 'movies') upsertedMovies.push(...rows);
        },
        deleteIds: async (ids, type) => {
            if (type === 'movies') deletedMovies.push(...ids);
        },
        saveStatus: () => {}
    };

    const fakeClient = {
        fetchChanges: async (mediaType, page) => {
            if (mediaType === 'movie' && page === 1) {
                return {
                    results: [
                        { id: 101 }, // esito 'errore'
                        { id: 102 }, // esito 'not_found'
                        { id: 103 }, // esito 'not_found' ma tracciato airing
                        { id: 104 }  // esito 'filtered_vote_floor'
                    ],
                    total_pages: 1
                };
            }
            return { results: [], total_pages: 1 };
        },
        downloadDailyExport: async () => [],
        fetchMovieOutcome: async (id) => {
            if (id === 101) return { status: 'errore', row: null };
            if (id === 102) return { status: 'not_found', row: null };
            if (id === 103) return { status: 'not_found', row: null };
            if (id === 104) return { status: 'filtered_vote_floor', row: null };
            return { status: 'ok', row: { id } };
        },
        fetchTvOutcome: async () => ({ status: 'errore', row: null })
    };

    await dailySync(fakeStore, fakeClient, { delayMs: 0, skipParquetRebuild: true });

    // Verifica cancellazioni:
    // 101 ('errore') -> NON cancellato
    // 102 ('not_found') -> CANCELLATO
    // 103 ('not_found' tracciato airing) -> NON cancellato
    // 104 ('filtered_vote_floor') -> NON cancellato
    assert.deepEqual(deletedMovies, [102], 'Solo 102 deve essere cancellato');
    assert.equal(deletedMovies.includes(101), false, 'ID con errore non deve essere cancellato');
    assert.equal(deletedMovies.includes(103), false, 'ID tracciato airing non deve essere cancellato');
    assert.equal(deletedMovies.includes(104), false, 'ID sotto floor voti non deve essere cancellato');
});

test('runTmdbDumpDaemon: accetta client iniettabile e completa senza rete', async (t) => {
    t.mock.method(animeAiringState, 'getSnapshot', async () => ({
        byTmdbId: new Map()
    }));

    const deletedMovies = [];
    const fakeStore = {
        storeExists: () => true,
        loadCursor: () => ({ completed: { movies: true, tv: true } }), // skip cold start
        loadIds: async () => new Set([201]),
        countLines: async () => 1,
        upsert: async () => {},
        deleteIds: async (ids) => { deletedMovies.push(...ids); },
        saveStatus: () => {}
    };

    const fakeClient = {
        fetchChanges: async () => ({ results: [{ id: 201 }], total_pages: 1 }),
        downloadDailyExport: async () => [],
        fetchMovieOutcome: async () => ({ status: 'errore', row: null }),
        fetchTvOutcome: async () => ({ status: 'errore', row: null })
    };

    await runTmdbDumpDaemon({
        once: true,
        delayMs: 0,
        skipParquetRebuild: true,
        store: fakeStore,
        client: fakeClient
    });

    // 201 ha errore -> non cancellato
    assert.equal(deletedMovies.length, 0);
});
