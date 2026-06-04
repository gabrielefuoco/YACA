const {
    interleaveMultipleResults,
    normalizeToUniversalSchema,
    applyConsensusScoring
} = require('../src/utils/resultMerger');

describe('resultMerger', () => {
    describe('interleaveMultipleResults', () => {
        it('should correctly interleave and deduplicate items', () => {
            const arr1 = [{ id: 1 }, { id: 3 }, { id: 5 }];
            const arr2 = [{ id: 2 }, { id: 3 }, { id: 6 }];
            const result = interleaveMultipleResults([arr1, arr2], 10, 0);
            expect(result.map(i => i.id)).toEqual([1, 2, 3, 5, 6]);
        });
        
        it('should respect limit and skip', () => {
            const arr1 = [{ id: 1 }, { id: 3 }, { id: 5 }];
            const arr2 = [{ id: 2 }, { id: 4 }, { id: 6 }];
            const result = interleaveMultipleResults([arr1, arr2], 3, 2);
            // interleaved: 1, 2, 3, 4, 5, 6
            // skip 2, limit 3 -> 3, 4, 5
            expect(result.map(i => i.id)).toEqual([3, 4, 5]);
        });
    });

    describe('normalizeToUniversalSchema', () => {
        it('should handle direct multi-query filters', () => {
            const directFilters = { queries: [{ strategy: 'discovery' }] };
            const result = normalizeToUniversalSchema(null, directFilters);
            expect(result.queries).toHaveLength(1);
        });

        it('should handle legacy merge meta', () => {
            const catalogMeta = { filters: { merge: { strategy: 'mixed' } } };
            const result = normalizeToUniversalSchema(catalogMeta, null);
            expect(result._isMerge).toBe(true);
            expect(result.presentation_strategy).toBe('popularity'); // legacy defaults
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
