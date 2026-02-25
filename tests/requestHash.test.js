const { generateRequestHash } = require('../src/utils/requestHash');

describe('generateRequestHash', () => {
    it('should produce a deterministic hash for the same inputs', () => {
        const hash1 = generateRequestHash('/discover/movie', { sort_by: 'popularity.desc', with_genres: '28' }, 0, 'movie');
        const hash2 = generateRequestHash('/discover/movie', { sort_by: 'popularity.desc', with_genres: '28' }, 0, 'movie');
        expect(hash1).toBe(hash2);
    });

    it('should produce the same hash regardless of parameter order', () => {
        const hash1 = generateRequestHash('/discover/movie', { with_genres: '28', sort_by: 'popularity.desc', language: 'it-IT' }, 0, 'movie');
        const hash2 = generateRequestHash('/discover/movie', { language: 'it-IT', sort_by: 'popularity.desc', with_genres: '28' }, 0, 'movie');
        expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different endpoints', () => {
        const hash1 = generateRequestHash('/discover/movie', { sort_by: 'popularity.desc' }, 0, 'movie');
        const hash2 = generateRequestHash('/discover/tv', { sort_by: 'popularity.desc' }, 0, 'movie');
        expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different skip values', () => {
        const hash1 = generateRequestHash('/discover/movie', { sort_by: 'popularity.desc' }, 0, 'movie');
        const hash2 = generateRequestHash('/discover/movie', { sort_by: 'popularity.desc' }, 20, 'movie');
        expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different types', () => {
        const hash1 = generateRequestHash('/discover/movie', { sort_by: 'popularity.desc' }, 0, 'movie');
        const hash2 = generateRequestHash('/discover/movie', { sort_by: 'popularity.desc' }, 0, 'series');
        expect(hash1).not.toBe(hash2);
    });

    it('should exclude api_key from the hash', () => {
        const hash1 = generateRequestHash('/discover/movie', { api_key: 'key1', sort_by: 'popularity.desc' }, 0, 'movie');
        const hash2 = generateRequestHash('/discover/movie', { api_key: 'key2', sort_by: 'popularity.desc' }, 0, 'movie');
        expect(hash1).toBe(hash2);
    });

    it('should return a valid SHA-256 hex string', () => {
        const hash = generateRequestHash('/discover/movie', {}, 0, 'movie');
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty params', () => {
        const hash1 = generateRequestHash('/discover/movie', {}, 0, 'movie');
        const hash2 = generateRequestHash('/discover/movie', null, 0, 'movie');
        expect(hash1).toBe(hash2);
    });

    it('should ignore null, undefined and empty string param values', () => {
        const hash1 = generateRequestHash('/discover/movie', { sort_by: 'popularity.desc' }, 0, 'movie');
        const hash2 = generateRequestHash('/discover/movie', { sort_by: 'popularity.desc', extra: null, foo: undefined, bar: '' }, 0, 'movie');
        expect(hash1).toBe(hash2);
    });

    it('should treat skip=0 and skip=undefined the same', () => {
        const hash1 = generateRequestHash('/discover/movie', {}, 0, 'movie');
        const hash2 = generateRequestHash('/discover/movie', {}, undefined, 'movie');
        expect(hash1).toBe(hash2);
    });
});
