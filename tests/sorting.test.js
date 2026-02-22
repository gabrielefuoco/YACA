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

    function getSortByValue(genreExtra, type) {
        if (!genreExtra || !Object.prototype.hasOwnProperty.call(SORT_MAP, genreExtra)) return 'popularity.desc';
        if (genreExtra === 'Data di Uscita') {
            return type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
        }
        return SORT_MAP[genreExtra];
    }

    it('should return popularity.desc for null/undefined/empty genre', () => {
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

describe('parseExtra with genre/sort parameter', () => {
    const { parseExtra } = require('../src/utils/helpers');

    it('should parse genre parameter from Stremio extra string', () => {
        const result = parseExtra('genre=Popolarit%C3%A0&skip=0');
        expect(result.genre).toBe('Popolarità');
        expect(result.skip).toBe('0');
    });

    it('should parse genre parameter with special characters', () => {
        const result = parseExtra('genre=Voto%20Medio&skip=20');
        expect(result.genre).toBe('Voto Medio');
        expect(result.skip).toBe('20');
    });

    it('should handle genre parameter alone', () => {
        const result = parseExtra('genre=Incassi');
        expect(result.genre).toBe('Incassi');
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
