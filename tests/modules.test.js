// Test the parseMistralResponse function and toStremioMetaItem
// We need to access these without triggering external API calls

// Test toStremioMetaItem via a mock-free approach
describe('toStremioMetaItem (TMDB)', () => {
    it('should have all required exports', () => {
        const tmdb = require('../src/clients/tmdb');
        expect(typeof tmdb.createTmdbClient).toBe('function');
        expect(typeof tmdb.fetchTmdbCatalog).toBe('function');
        expect(typeof tmdb.getTmdbMetaDetails).toBe('function');
        expect(typeof tmdb.getTmdbIdByName).toBe('function');
    });
});

describe('parseMistralResponse', () => {
    // We need to test this function - let's access it. It's not exported.
    // But we can test the router module's exported functions
    let router;

    beforeAll(() => {
        router = require('../src/ai/router');
    });

    it('should export generateTmdbFiltersFromPrompt and routeLiveStremioSearch', () => {
        expect(typeof router.generateTmdbFiltersFromPrompt).toBe('function');
        expect(typeof router.routeLiveStremioSearch).toBe('function');
    });
});

describe('catalogHandler module', () => {
    it('should export catalogHandler and buildDiscoveryParams functions', () => {
        const { catalogHandler, buildDiscoveryParams } = require('../src/handlers/catalogHandler');
        expect(typeof catalogHandler).toBe('function');
        expect(typeof buildDiscoveryParams).toBe('function');
    });
});

describe('metaHandler module', () => {
    it('should export metaHandler function', () => {
        const { metaHandler } = require('../src/handlers/metaHandler');
        expect(typeof metaHandler).toBe('function');
    });
});

describe('config module', () => {
    it('should export expected configuration constants', () => {
        const config = require('../src/config');
        expect(config.TMDB_ENDPOINT).toBe('https://api.themoviedb.org/3');
        expect(config.KITSU_ENDPOINT).toBe('https://kitsu.io/api/edge');
        expect(config.TRAKT_ENDPOINT).toBe('https://api.trakt.tv');
        expect(config.PAGES_PER_REQUEST).toBeGreaterThan(0);
        expect(config.ITEMS_PER_PAGE).toBeGreaterThan(0);
        expect(config.DEFAULT_REGION).toBeDefined();
        expect(config.DEFAULT_LANGUAGE).toBeDefined();
    });
});

describe('presets module', () => {
    it('should export presets array with required fields', () => {
        const { getPresets } = require('../src/data/presets');
        const presets = getPresets();
        expect(Array.isArray(presets)).toBe(true);
        expect(presets.length).toBeGreaterThan(0);

        for (const preset of presets) {
            expect(preset).toHaveProperty('id');
            expect(preset).toHaveProperty('name');
            expect(preset).toHaveProperty('category');
            expect(preset).toHaveProperty('type');
            expect(preset).toHaveProperty('filters');
            expect(['movie', 'series']).toContain(preset.type);
        }
    });

    it('should export profile templates with valid preset references', () => {
        const { getPresets, profileTemplates } = require('../src/data/presets');
        const presets = getPresets();
        expect(Array.isArray(profileTemplates)).toBe(true);

        const presetIds = new Set(presets.map(p => p.id));
        for (const template of profileTemplates) {
            expect(template).toHaveProperty('id');
            expect(template).toHaveProperty('name');
            expect(template).toHaveProperty('presets');
            for (const presetRef of template.presets) {
                expect(presetIds.has(presetRef)).toBe(true);
            }
        }
    });

    it('should have unique preset IDs', () => {
        const { getPresets } = require('../src/data/presets');
        const presets = getPresets();
        const ids = presets.map(p => p.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have structured filters with sort_by on most presets', () => {
        const { getPresets } = require('../src/data/presets');
        const presets = getPresets();
        const withSortBy = presets.filter(p => p.filters.sort_by);
        // At least 80% of presets should have sort_by defined
        expect(withSortBy.length / presets.length).toBeGreaterThan(0.8);
    });

    it('should have profile templates with at least 5 presets each', () => {
        const { profileTemplates } = require('../src/data/presets');
        for (const template of profileTemplates) {
            expect(template.presets.length).toBeGreaterThanOrEqual(5);
        }
    });

    it('should have no duplicate presets within a single template', () => {
        const { profileTemplates } = require('../src/data/presets');
        for (const template of profileTemplates) {
            const unique = new Set(template.presets);
            expect(unique.size).toBe(template.presets.length);
        }
    });

    it('should compute dates dynamically on each call', () => {
        const { getPresets } = require('../src/data/presets');
        const presets1 = getPresets();
        const presets2 = getPresets();
        // Both calls should return the same structure
        expect(presets1.length).toBe(presets2.length);
        // The date-dependent presets should have today's date
        const newMovies = presets1.find(p => p.id === 'preset_new_movies');
        expect(newMovies).toBeDefined();
        const todayStr = new Date().toISOString().split('T')[0];
        expect(newMovies.filters['primary_release_date.lte']).toBe(todayStr);
    });
});
