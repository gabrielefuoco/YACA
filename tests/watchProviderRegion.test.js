const axios = require('axios');

const TmdbDumpClient = require('../src/utils/tmdbDumpClient');
const { getPresets } = require('../src/data/presets');
const { buildPresetFromFilters, mapDuckDbRowToMeta } = require('../src/catalog/providers/DuckDbProvider');

describe('Watch provider region', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('il dump TMDB conserva separati i provider IT e US', async () => {
        const itProviders = { flatrate: [{ provider_id: 1899, provider_name: 'HBO Max' }] };
        const usProviders = { flatrate: [{ provider_id: 1899, provider_name: 'Max' }] };
        jest.spyOn(axios, 'get').mockResolvedValue({
            data: {
                id: 1,
                title: 'Film test',
                original_title: 'Film test',
                original_language: 'en',
                overview: '',
                release_date: '2026-01-01',
                runtime: 100,
                vote_average: 7,
                vote_count: 100,
                popularity: 10,
                status: 'Released',
                poster_path: null,
                backdrop_path: null,
                adult: false,
                budget: 1,
                revenue: 1,
                genres: [],
                credits: { cast: [], crew: [] },
                keywords: { keywords: [] },
                videos: { results: [] },
                images: { logos: [] },
                recommendations: { results: [] },
                production_companies: [],
                production_countries: [],
                spoken_languages: [],
                'watch/providers': { results: { IT: itProviders, US: usProviders } },
                release_dates: { results: [] }
            }
        });

        const row = await new TmdbDumpClient('test-key').fetchMovie(1);
        expect(JSON.parse(row.watch_providers_it)).toEqual(itProviders);
        expect(JSON.parse(row.watch_providers_us)).toEqual(usProviders);
    });

    test('Film HBO & Max e Serie HBO & Max sono cataloghi per produzione, senza vincolo di regione', () => {
        const movies = getPresets().find((preset) => preset.id === 'preset_hbo_max_movies');
        const movieQuery = movies.queries[0];
        const compiled = buildPresetFromFilters(movieQuery, movies.type);
        const movieWhere = compiled.where.join(' ');

        // Scelta di prodotto: il catalogo è "roba prodotta da HBO/Max", non
        // "disponibile in streaming": niente provider né regione, solo società.
        expect(movieQuery.with_companies).toBe('3268|7429|14914|11489|158691|306613|187379');
        expect(movieQuery.with_watch_providers).toBeUndefined();
        expect(movieQuery.watch_region).toBeUndefined();
        expect(movieWhere).toContain('production_companies');
        expect(movieWhere).not.toContain('watch_providers');

        const series = getPresets().find((preset) => preset.id === 'preset_hbo_max_series');
        expect(series.queries[0].with_networks).toBe('49|3186');
        expect(series.queries[0].with_watch_providers).toBeUndefined();
    });

    test('i metadati espongono entrambe le regioni senza sostituire IT con US', () => {
        const meta = mapDuckDbRowToMeta({
            id: 42,
            title: 'Film test',
            genres: '[]',
            keywords: '[]',
            watch_providers_it: JSON.stringify({ flatrate: [{ provider_id: 8 }] }),
            watch_providers_us: JSON.stringify({ flatrate: [{ provider_id: 1899 }] })
        }, true);

        expect(meta.rawTMDB['watch/providers'].results.IT.flatrate[0].provider_id).toBe(8);
        expect(meta.rawTMDB['watch/providers'].results.US.flatrate[0].provider_id).toBe(1899);
    });
});
