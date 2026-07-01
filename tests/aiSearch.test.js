const { generateTmdbFiltersFromPrompt } = require('../src/ai/router');
const { aiPromptCache } = require('../src/cache/cacheInstances');
const { Mistral } = require('@mistralai/mistralai');

jest.mock('@mistralai/mistralai');
jest.mock('../src/cache/cacheInstances', () => ({
    aiPromptCache: {
        get: jest.fn(),
        set: jest.fn()
    }
}));

describe('AI Search (Mistral & Caching) Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return cached result if present', async () => {
        const mockCached = { strategy: 'discovery', genre_ids: [28], target: 'tmdb' };
        aiPromptCache.get.mockResolvedValueOnce(mockCached);

        const result = await generateTmdbFiltersFromPrompt('film d\'azione', 'test_key', 'single_query', false);

        expect(aiPromptCache.get).toHaveBeenCalledWith('prompt:single_query:film d\'azione');
        expect(Mistral).not.toHaveBeenCalled();
        expect(result).toEqual(mockCached);
    });

    it('should call Mistral AI and cache the response when cache misses', async () => {
        aiPromptCache.get.mockResolvedValueOnce(null);

        const mockMistralComplete = jest.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({ strategy: 'discovery', genre_ids: [28], target: 'tmdb' })
                }
            }]
        });

        Mistral.mockImplementation(() => ({
            chat: {
                complete: mockMistralComplete
            }
        }));

        const result = await generateTmdbFiltersFromPrompt('film d\'azione', 'test_key', 'single_query', false);

        expect(aiPromptCache.get).toHaveBeenCalledWith('prompt:single_query:film d\'azione');
        expect(mockMistralComplete).toHaveBeenCalledWith(expect.objectContaining({
            model: 'mistral-small-latest',
            messages: expect.arrayContaining([
                { role: 'user', content: 'QUERY: "film d\'azione"' }
            ])
        }));
        
        expect(aiPromptCache.set).toHaveBeenCalledWith(
            'prompt:single_query:film d\'azione',
            expect.objectContaining({ strategy: 'discovery', genre_ids: [28] })
        );
        expect(result).toEqual({ strategy: 'discovery', genre_ids: [28], target: 'tmdb' });
    });

    it('should inject kids mode constraint in system prompt', async () => {
        aiPromptCache.get.mockResolvedValueOnce(null);

        const mockMistralComplete = jest.fn().mockResolvedValue({
            choices: [{
                message: {
                    content: JSON.stringify({ strategy: 'discovery', genre_ids: [16], target: 'tmdb' })
                }
            }]
        });

        Mistral.mockImplementation(() => ({
            chat: {
                complete: mockMistralComplete
            }
        }));

        await generateTmdbFiltersFromPrompt('cartoni animati', 'test_key', 'single_query', true);

        const systemMessage = mockMistralComplete.mock.calls[0][0].messages.find(m => m.role === 'system');
        expect(systemMessage.content).toContain('KIDS MODE');
        expect(systemMessage.content).toContain('family-friendly');
    });

    it('should return fallback response when Mistral fails or returns invalid json', async () => {
        aiPromptCache.get.mockResolvedValueOnce(null);

        Mistral.mockImplementation(() => ({
            chat: {
                complete: jest.fn().mockRejectedValue(new Error('Mistral is down'))
            }
        }));

        const result = await generateTmdbFiltersFromPrompt('query complessa', 'test_key', 'single_query', false);

        expect(result).toEqual({
            strategy: 'multi_search',
            text_search: 'query complessa',
            target: 'tmdb'
        });
        expect(aiPromptCache.set).not.toHaveBeenCalled();
    });
});
