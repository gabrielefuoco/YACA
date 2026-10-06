const {
    normalizeToUniversalSchema,
    applyConsensusScoring
} = require('../src/utils/resultMerger');

describe('resultMerger', () => {
    describe('normalizeToUniversalSchema', () => {
        it('should handle direct multi-query filters', () => {
            const directFilters = { queries: [{ strategy: 'discovery' }] };
            const result = normalizeToUniversalSchema(null, directFilters);
            expect(result.queries).toHaveLength(1);
        });

        it('tollera un catalogo merged legacy senza crash (degrada a query discovery)', () => {
            const catalogMeta = {
                id: 'merged_a_b',
                source: 'merged',
                filters: { merge: { catalogs: ['a', 'b'], strategy: 'mixed' } }
            };
            const result = normalizeToUniversalSchema(catalogMeta, null);
            expect(result.queries).toHaveLength(1);
            expect(result.queries[0].strategy).toBe('discovery');
            expect(result.presentation_strategy).toBe('popularity');
        });

        it('tollera un preset personalizzato legacy con presentazione interleave', () => {
            const catalogMeta = {
                id: 'custom_abc',
                source: 'manual',
                presentation_strategy: 'interleave',
                queries: [{ strategy: 'discovery' }, { strategy: 'discovery' }]
            };
            const result = normalizeToUniversalSchema(catalogMeta, null);
            expect(result.queries).toHaveLength(2);
            expect(result.presentation_strategy).toBe('popularity');
        });
    });

    describe('applyConsensusScoring', () => {
        it('should correctly calculate consensus count and bonus', () => {
            const arr1 = [{ id: 1, popularity: 10 }, { id: 2 }];
            const arr2 = [{ id: 1, popularity: 10 }, { id: 3 }];
            const result = applyConsensusScoring([arr1, arr2]);
            const item1 = result.find(i => i.id === 1);
            expect(item1.consensusCount).toBe(2);
            expect(item1.consensusBonus).toBeGreaterThan(0);
            
            const item2 = result.find(i => i.id === 2);
            expect(item2.consensusCount).toBe(1);
            expect(item2.consensusBonus).toBe(0);
        });
    });
});
