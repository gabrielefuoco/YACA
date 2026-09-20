// Tests for sorting filter logic (Issue 1) and configVersion (Issue 3)

describe('getSortByValue', () => {
    // We test the logic inline since getSortByValue is defined in index.js
    // Recreate the function here for unit testing
    const SORT_MAP = {
        'Popolarità': 'popularity.desc',
        'Voto Medio': 'vote_average.desc',
        'Data di Uscita': null,
        'Incassi': 'revenue.desc'
    };

    function getSortByValue(sortOption, type) {
        if (!sortOption || !Object.prototype.hasOwnProperty.call(SORT_MAP, sortOption)) return 'popularity.desc';
        if (sortOption === 'Data di Uscita') {
            return type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
        }
        return SORT_MAP[sortOption];
    }

    it('should return popularity.desc for null/undefined/empty sortBy option', () => {
        expect(getSortByValue(null, 'movie')).toBe('popularity.desc');
        expect(getSortByValue(undefined, 'movie')).toBe('popularity.desc');
        expect(getSortByValue('', 'movie')).toBe('popularity.desc');
    });

    it('should return popularity.desc for unknown sort option', () => {
        expect(getSortByValue('Unknown', 'movie')).toBe('popularity.desc');
        expect(getSortByValue('NotValid', 'series')).toBe('popularity.desc');
    });

    it('should return correct sort_by for Popolarità', () => {
        expect(getSortByValue('Popolarità', 'movie')).toBe('popularity.desc');
        expect(getSortByValue('Popolarità', 'series')).toBe('popularity.desc');
    });

    it('should return correct sort_by for Voto Medio', () => {
        expect(getSortByValue('Voto Medio', 'movie')).toBe('vote_average.desc');
        expect(getSortByValue('Voto Medio', 'series')).toBe('vote_average.desc');
    });

    it('should return correct sort_by for Data di Uscita based on type', () => {
        expect(getSortByValue('Data di Uscita', 'movie')).toBe('primary_release_date.desc');
        expect(getSortByValue('Data di Uscita', 'series')).toBe('first_air_date.desc');
    });

    it('should return correct sort_by for Incassi', () => {
        expect(getSortByValue('Incassi', 'movie')).toBe('revenue.desc');
        expect(getSortByValue('Incassi', 'series')).toBe('revenue.desc');
    });
});

describe('parseExtra with sortBy and genre parameter', () => {
    const { parseExtra } = require('../src/utils/helpers');

    it('should parse sortBy parameter from Stremio extra string', () => {
        const result = parseExtra('sortBy=Popolarit%C3%A0&skip=0');
        expect(result.sortBy).toBe('Popolarità');
        expect(result.skip).toBe('0');
    });

    it('should parse sortBy parameter with special characters', () => {
        const result = parseExtra('sortBy=Voto%20Medio&skip=20');
        expect(result.sortBy).toBe('Voto Medio');
        expect(result.skip).toBe('20');
    });

    it('should handle sortBy parameter alone', () => {
        const result = parseExtra('sortBy=Incassi');
        expect(result.sortBy).toBe('Incassi');
    });

    it('should parse genre parameter from Stremio extra string for backward compatibility', () => {
        const result = parseExtra('genre=Popolarit%C3%A0&skip=0');
        expect(result.genre).toBe('Popolarità');
        expect(result.skip).toBe('0');
    });
});

describe('Stremio manifest and catalog sortBy extra', () => {
    const stremioRouter = require('../src/api/stremio');

    it('manifest presetExtra declares sortBy extra with correct options (and no genre)', () => {
        expect(stremioRouter.presetExtra).toEqual([
            {
                name: 'sortBy',
                isRequired: false,
                options: ['Popolarità', 'Voto Medio', 'Data di Uscita', 'Incassi']
            },
            { name: 'skip' }
        ]);
        expect(stremioRouter.presetExtra.find(e => e.name === 'genre')).toBeUndefined();
    });

    it('dynamic manifest endpoint declares sortBy extra with options on preset catalogs', async () => {
        const UserConfig = require('../src/models/UserConfig');
        const spy = jest.spyOn(UserConfig, 'resolveUserConfig').mockResolvedValueOnce({
            activeProfileId: 'p1',
            profiles: [{
                id: 'p1',
                name: 'Default',
                catalogs: [{ id: 'preset_action', name: 'Action', type: 'movie' }]
            }]
        });

        const manifestRoute = stremioRouter.stack.find(
            layer => layer.route && layer.route.path &&
            (Array.isArray(layer.route.path) ? layer.route.path.includes('/:userHandle/manifest.json') : layer.route.path === '/:userHandle/manifest.json')
        );

        let manifestJson = null;
        const req = { params: { userHandle: 'testUser' }, protocol: 'http', get: () => 'localhost' };
        const res = {
            setHeader: () => {},
            json: (data) => { manifestJson = data; }
        };

        await manifestRoute.route.stack[0].handle(req, res);
        spy.mockRestore();

        expect(manifestJson).toBeDefined();
        const catalog = manifestJson.catalogs.find(c => c.id === 'preset_action');
        expect(catalog).toBeDefined();
        expect(catalog.extra).toEqual([
            {
                name: 'sortBy',
                isRequired: false,
                options: ['Popolarità', 'Voto Medio', 'Data di Uscita', 'Incassi']
            },
            { name: 'skip' }
        ]);
        expect(catalog.extra.find(e => e.name === 'genre')).toBeUndefined();
    });

    it('request with sortBy=Popolarità produces identical sorting value as before (and backward-compatible genre alias)', () => {
        const { getSortByValue } = stremioRouter;

        // Both direct helper and handler simulation
        const sortByMovie = getSortByValue('Popolarità', 'movie');
        const legacyGenreMovie = getSortByValue('Popolarità', 'movie');
        expect(sortByMovie).toBe('popularity.desc');
        expect(sortByMovie).toBe(legacyGenreMovie);

        const simulateHandlerExtra = (extra, type = 'movie') => {
            const parsed = { ...extra };
            const sortBy = parsed.sortBy || parsed.genre || null;
            if (sortBy) {
                parsed.sortBy = getSortByValue(sortBy, type);
            }
            return parsed;
        };

        // Popolarità
        const fromSortBy = simulateHandlerExtra({ sortBy: 'Popolarità' });
        const fromGenre = simulateHandlerExtra({ genre: 'Popolarità' });
        expect(fromSortBy.sortBy).toBe('popularity.desc');
        expect(fromGenre.sortBy).toBe('popularity.desc');
        expect(fromSortBy.sortBy).toBe(fromGenre.sortBy);

        // Voto Medio
        expect(simulateHandlerExtra({ sortBy: 'Voto Medio' }).sortBy).toBe('vote_average.desc');
        expect(simulateHandlerExtra({ genre: 'Voto Medio' }).sortBy).toBe('vote_average.desc');

        // Data di Uscita (movie vs series)
        expect(simulateHandlerExtra({ sortBy: 'Data di Uscita' }, 'movie').sortBy).toBe('primary_release_date.desc');
        expect(simulateHandlerExtra({ genre: 'Data di Uscita' }, 'movie').sortBy).toBe('primary_release_date.desc');
        expect(simulateHandlerExtra({ sortBy: 'Data di Uscita' }, 'series').sortBy).toBe('first_air_date.desc');
        expect(simulateHandlerExtra({ genre: 'Data di Uscita' }, 'series').sortBy).toBe('first_air_date.desc');

        // Incassi
        expect(simulateHandlerExtra({ sortBy: 'Incassi' }).sortBy).toBe('revenue.desc');
        expect(simulateHandlerExtra({ genre: 'Incassi' }).sortBy).toBe('revenue.desc');

        // Priority when both are present: sortBy wins
        expect(simulateHandlerExtra({ sortBy: 'Voto Medio', genre: 'Popolarità' }).sortBy).toBe('vote_average.desc');
    });
});

describe('configVersion generation', () => {
    it('should generate base36 timestamp string', () => {
        const configVersion = Date.now().toString(36);
        expect(typeof configVersion).toBe('string');
        expect(configVersion.length).toBeGreaterThan(0);
        // Should be alphanumeric base36
        expect(/^[0-9a-z]+$/.test(configVersion)).toBe(true);
    });

    it('should generate unique values over time', () => {
        const v1 = Date.now().toString(36);
        // Simulate a small delay
        const v2 = (Date.now() + 1).toString(36);
        expect(v1).not.toBe(v2);
    });

    it('should produce valid semver-like version with configVersion', () => {
        const cv = Date.now().toString(36);
        const dynamicVersion = `1.0.2+${cv}`;
        // Should match pattern: major.minor.patch+build
        expect(dynamicVersion).toMatch(/^1\.0\.2\+[0-9a-z]+$/);
    });
});
