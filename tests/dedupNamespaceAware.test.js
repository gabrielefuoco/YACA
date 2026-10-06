const { applyConsensusScoring } = require('../src/utils/resultMerger');
const { getBaseId, normalizeContentId } = require('../src/utils/contentId');

describe('BUG-02: Dedup Namespace-Aware (kitsu vs tmdb collision fix)', () => {
    describe('contentId helper behavior contrast', () => {
        it('dimostra che normalizeContentId collassa kitsu:1100 e tmdb:1100 sullo stesso ID', () => {
            const kitsuNormalized = normalizeContentId('kitsu:1100');
            const tmdbNormalized = normalizeContentId('tmdb:1100');

            expect(kitsuNormalized).toBe('1100');
            expect(tmdbNormalized).toBe('1100');
            // Prima del fix, un Set basato su normalizeContentId collassava entrambi
            expect(kitsuNormalized).toBe(tmdbNormalized);
        });

        it('dimostra che getBaseId preserva il prefisso di namespace per kitsu: e tmdb:', () => {
            const kitsuBase = getBaseId('kitsu:1100');
            const tmdbBase = getBaseId('tmdb:1100');

            expect(kitsuBase).toBe('kitsu:1100');
            expect(tmdbBase).toBe('tmdb:1100');
            // Con getBaseId non c'è collisione tra namespace differenti
            expect(kitsuBase).not.toBe(tmdbBase);
        });
    });

    describe('applyConsensusScoring (resultMerger)', () => {
        it('NON unisce kitsu:1100 e tmdb:1100 nello stesso consensus bucket', () => {
            const query1 = [{ id: 'kitsu:1100', title: 'Anime 1100' }];
            const query2 = [{ id: 'tmdb:1100', title: 'Film 1100' }];

            const result = applyConsensusScoring([query1, query2]);

            // Se collassassero, ci sarebbe solo 1 item con consensusCount = 2
            expect(result).toHaveLength(2);
            const kitsuItem = result.find(i => i.id === 'kitsu:1100');
            const tmdbItem = result.find(i => i.id === 'tmdb:1100');

            expect(kitsuItem).toBeDefined();
            expect(kitsuItem.consensusCount).toBe(1);
            expect(kitsuItem.consensusBonus).toBe(0);

            expect(tmdbItem).toBeDefined();
            expect(tmdbItem.consensusCount).toBe(1);
            expect(tmdbItem.consensusBonus).toBe(0);
        });

        it('assegna correttamente consensus bonus quando lo stesso ID namespace-aware appare in più query', () => {
            const query1 = [{ id: 'kitsu:1100', title: 'Anime 1100' }];
            const query2 = [{ id: 'kitsu:1100', title: 'Anime 1100' }];

            const result = applyConsensusScoring([query1, query2]);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('kitsu:1100');
            expect(result[0].consensusCount).toBe(2);
            expect(result[0].consensusBonus).toBe(3); // 2^2 - 1 = 3
        });
    });
});
