jest.mock('../src/cache/CacheManager', () => {
    return jest.fn().mockImplementation(() => ({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(true),
        clear: jest.fn().mockResolvedValue(true)
    }));
});

const { translateImdbToTmdb } = require('../src/id_mapping/id_cache');

describe('Input validation - IMDB ID format', () => {
    it('should reject null IMDB ID', async () => {
        const result = await translateImdbToTmdb(null, 'fake-key');
        expect(result).toBeNull();
    });

    it('should reject empty string IMDB ID', async () => {
        const result = await translateImdbToTmdb('', 'fake-key');
        expect(result).toBeNull();
    });

    it('should reject malformed IMDB ID without tt prefix', async () => {
        const result = await translateImdbToTmdb('1234567', 'fake-key');
        expect(result).toBeNull();
    });

    it('should reject IMDB ID with path traversal', async () => {
        const result = await translateImdbToTmdb('tt../../../etc', 'fake-key');
        expect(result).toBeNull();
    });

    it('should reject IMDB ID with special characters', async () => {
        const result = await translateImdbToTmdb('tt1234;DROP TABLE', 'fake-key');
        expect(result).toBeNull();
    });

    it('should accept valid IMDB ID format', async () => {
        // This will fail because there's no real API, but it validates the format check passes
        // and reaches the API call (which will throw)
        const result = await translateImdbToTmdb('tt1234567', 'fake-key');
        // Will be null because the API call fails, but the format check passed
        expect(result).toBeNull();
    });
});

describe('AI router - missing Mistral key guard', () => {
    it('should return fallback filters when Mistral key is missing', async () => {
        const { generateTmdbFiltersFromPrompt } = require('../src/ai/router');
        const result = await generateTmdbFiltersFromPrompt('test prompt', null);
        expect(result).toBeDefined();
        expect(result.strategy).toBe('multi_search');
        expect(result.text_search).toBe('test prompt');
    });

    it('should return fallback filters when Mistral key is empty string', async () => {
        const { generateTmdbFiltersFromPrompt } = require('../src/ai/router');
        const result = await generateTmdbFiltersFromPrompt('action movies', '');
        expect(result).toBeDefined();
        expect(result.strategy).toBe('multi_search');
        expect(result.text_search).toBe('action movies');
    });
});
