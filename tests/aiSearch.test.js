const { generateTmdbFiltersFromPrompt } = require('../src/ai/router');
const { aiPromptCache } = require('../src/cache/cacheInstances');
const { deriva } = require('../src/cache');
const { Mistral } = require('@mistralai/mistralai');

jest.mock('@mistralai/mistralai');
jest.mock('../src/cache/cacheInstances', () => ({
    aiPromptCache: {
        getWithStatus: jest.fn(),
        get: jest.fn(),
        set: jest.fn()
    }
}));

describe('AI Search (Mistral & Caching) Tests', () => {
    const descBase = {
        nome: 'ai_prompt',
        versione: 1,
        dipendenze: {
            varia: {
                prompt: "film d'azione",
                taskType: 'single_query',
                kidsMode: false
            }
        }
    };
    const expectedBaseKey = deriva(descBase).chiave;

    beforeEach(() => {
        jest.clearAllMocks();
        aiPromptCache.getWithStatus.mockResolvedValue({ value: undefined, status: 'miss' });
    });

    it('la chiave di cache deriva dal modulo cache, include la versione (:v1:) e separa prompt, task e kidsMode', () => {
        const k1 = deriva(descBase).chiave;
        const kSame = deriva({
            nome: 'ai_prompt',
            versione: 1,
            dipendenze: { varia: { prompt: "film d'azione", taskType: 'single_query', kidsMode: false } }
        }).chiave;
        const kKids = deriva({
            nome: 'ai_prompt',
            versione: 1,
            dipendenze: { varia: { prompt: "film d'azione", taskType: 'single_query', kidsMode: true } }
        }).chiave;
        const kTask = deriva({
            nome: 'ai_prompt',
            versione: 1,
            dipendenze: { varia: { prompt: "film d'azione", taskType: 'multi_query', kidsMode: false } }
        }).chiave;
        const kV2 = deriva({
            nome: 'ai_prompt',
            versione: 2,
            dipendenze: { varia: { prompt: "film d'azione", taskType: 'single_query', kidsMode: false } }
        }).chiave;

        expect(k1).toBe(kSame);
        expect(k1).toMatch(/^ai_prompt:v1:/);
        expect(k1).not.toBe(kKids);
        expect(k1).not.toBe(kTask);
        expect(k1).not.toBe(kV2);
    });

    it('should return cached result if present', async () => {
        const mockCached = { strategy: 'discovery', genre_ids: [28], target: 'tmdb' };
        aiPromptCache.getWithStatus.mockResolvedValueOnce({ value: mockCached, status: 'fresh' });

        const result = await generateTmdbFiltersFromPrompt('film d\'azione', 'test_key', 'single_query', false);

        expect(aiPromptCache.getWithStatus).toHaveBeenCalledWith(expectedBaseKey);
        expect(Mistral).not.toHaveBeenCalled();
        expect(result).toEqual(mockCached);
    });

    it('should call Mistral AI and cache the response when cache misses', async () => {
        aiPromptCache.getWithStatus.mockResolvedValueOnce({ value: undefined, status: 'miss' });

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

        expect(aiPromptCache.getWithStatus).toHaveBeenCalledWith(expectedBaseKey);
        expect(mockMistralComplete).toHaveBeenCalledWith(expect.objectContaining({
            model: process.env.MISTRAL_MODEL || 'open-mistral-nemo',
            messages: expect.arrayContaining([
                { role: 'user', content: 'QUERY: "film d\'azione"' }
            ])
        }));
        
        expect(aiPromptCache.set).toHaveBeenCalledWith(
            expectedBaseKey,
            expect.objectContaining({ strategy: 'discovery', genre_ids: [28] }),
            expect.any(Number),
            expect.anything()
        );
        expect(result).toEqual({ strategy: 'discovery', genre_ids: [28], target: 'tmdb' });
    });

    it('should inject kids mode constraint in system prompt', async () => {
        const expectedKidsKey = deriva({
            nome: 'ai_prompt',
            versione: 1,
            dipendenze: {
                varia: {
                    prompt: 'cartoni animati',
                    taskType: 'single_query',
                    kidsMode: true
                }
            }
        }).chiave;
        aiPromptCache.getWithStatus.mockResolvedValueOnce({ value: undefined, status: 'miss' });

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

        expect(aiPromptCache.getWithStatus).toHaveBeenCalledWith(expectedKidsKey);
        const systemMessage = mockMistralComplete.mock.calls[0][0].messages.find(m => m.role === 'system');
        expect(systemMessage.content).toContain('KIDS MODE');
        expect(systemMessage.content).toContain('family-friendly');
    });

    it('should return fallback response when Mistral fails or returns invalid json', async () => {
        aiPromptCache.getWithStatus.mockResolvedValueOnce({ value: undefined, status: 'miss' });

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
