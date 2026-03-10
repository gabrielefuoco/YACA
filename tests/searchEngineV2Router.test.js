const fs = require('fs');
const path = require('path');

const { BASE_RULES, buildAiPrompt } = require('../src/ai/prompts');
const { parseMistralResponse } = require('../src/ai/router');

describe('Search Engine V2 prompts', () => {
    it('builds the deep AI planner prompt from modular sections', () => {
        const prompt = buildAiPrompt('multi_query');

        expect(prompt).toContain(BASE_RULES.split('\n')[0]);
        expect(prompt).toContain('"queries"');
        expect(prompt).toContain('Query Planner');
        expect(prompt).toContain('Game of Thrones');
    });

    it('keeps exact-title queries intact even when they contain Italian prepositions', () => {
        const parsed = parseMistralResponse(
            JSON.stringify({
                strategy: 'multi_search',
                text_search: 'La casa di carta',
                target: 'tmdb'
            }),
            'La casa di carta'
        );

        expect(parsed.strategy).toBe('multi_search');
        expect(parsed.text_search).toBe('La casa di carta');
        expect(parsed.people_list).toBeUndefined();
    });

    it('parses multi-query planner responses into sanitized parallel tasks', () => {
        const parsed = parseMistralResponse(
            JSON.stringify({
                queries: [
                    { strategy: 'similar', similar_to: 'Game of Thrones', target: 'tmdb', ignored: true },
                    { strategy: 'discovery', keyword: 'politics|romance', genre_ids: [18, 10765], target: 'tmdb' }
                ]
            }),
            'Io amo Game of Thrones ma la mia ragazza Bridgerton',
            'multi_query'
        );

        expect(parsed.queries).toHaveLength(2);
        expect(parsed.queries[0]).toEqual({
            strategy: 'similar',
            similar_to: 'Game of Thrones',
            target: 'tmdb'
        });
        expect(parsed.queries[1]).toEqual({
            strategy: 'discovery',
            keyword: 'politics|romance',
            genre_ids: [18, 10765],
            target: 'tmdb'
        });
    });
});

describe('Search Engine V2 manifest catalogs', () => {
    it('exposes separate standard and deep AI search catalogs in the manifest builder', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

        expect(source).toContain("{ id: 'yaca_search_standard', type: 'movie', name: 'YACA: Ricerca Veloce TMDB'");
        expect(source).toContain("{ id: 'yaca_search_standard', type: 'series', name: 'YACA: Ricerca Veloce TMDB'");
        expect(source).toContain("{ id: 'yaca_search_ai', type: 'movie', name: 'YACA: Deep AI Search'");
        expect(source).toContain("{ id: 'yaca_search_ai', type: 'series', name: 'YACA: Deep AI Search'");
    });
});
