const {
    cosineSimilarity,
    sparseNorm,
    sparseUnitNormalize,
    resolveK,
    clusterTasteSignals,
    shouldRecomputeClusters,
    MIN_SIGNALS_FOR_CLUSTERING
} = require('../src/utils/tasteClusters');

describe('tasteClusters - Sparse DNA Clustering & Multi-vector', () => {
    describe('cosineSimilarity & sparse vector math', () => {
        it('calculates correct cosine similarity for identical and orthogonal sparse vectors', () => {
            const v1 = { 'g:28': 10, 'g:12': 5 };
            const v2 = { 'g:28': 20, 'g:12': 10 };
            const vOrthogonal = { 'g:35': 10 };

            expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
            expect(cosineSimilarity(v1, vOrthogonal)).toBe(0);
        });

        it('handles empty and null vectors safely', () => {
            expect(cosineSimilarity(null, { 'g:28': 10 })).toBe(0);
            expect(cosineSimilarity({}, {})).toBe(0);
            expect(sparseNorm(null)).toBe(0);
            expect(sparseUnitNormalize({})).toEqual({});
        });
    });

    describe('resolveK and cold-start guards', () => {
        it('returns 0 for items below MIN_SIGNALS_FOR_CLUSTERING', () => {
            expect(resolveK(5)).toBe(0);
            expect(resolveK(11)).toBe(0);
        });

        it('returns 3 for 12-19 items, 4 for 20-34 items, 5 for >= 35 items', () => {
            expect(resolveK(12)).toBe(3);
            expect(resolveK(19)).toBe(3);
            expect(resolveK(20)).toBe(4);
            expect(resolveK(34)).toBe(4);
            expect(resolveK(35)).toBe(5);
            expect(resolveK(100)).toBe(5);
        });

        it('clusterTasteSignals returns empty array for fewer than MIN_SIGNALS_FOR_CLUSTERING items', () => {
            const smallItems = Array.from({ length: 10 }, (_, i) => ({
                tmdbId: 100 + i,
                weight: 100,
                itemDna: { 'g:28': 100 }
            }));
            const clusters = clusterTasteSignals(smallItems);
            expect(clusters).toEqual([]);
        });
    });

    describe('Deterministic clustering behavior', () => {
        // Creiamo un insieme sintetico di 15 segnali suddivisi in 3 gusti distinti:
        // Gruppo A: Sci-Fi (g:878, k:space)
        // Gruppo B: Animazione (g:16, k:anime)
        // Gruppo C: Horror (g:27, k:zombie)
        const generateTestDataset = () => [
            // Sci-Fi
            { tmdbId: 101, weight: 200, itemDna: { 'g:878': 100, 'k:space': 80 } },
            { tmdbId: 102, weight: 150, itemDna: { 'g:878': 100, 'k:space': 90 } },
            { tmdbId: 103, weight: 180, itemDna: { 'g:878': 100, 'k:alien': 70 } },
            { tmdbId: 104, weight: 120, itemDna: { 'g:878': 100, 'k:future': 60 } },
            { tmdbId: 105, weight: 100, itemDna: { 'g:878': 100, 'k:space': 50 } },
            // Animazione
            { tmdbId: 201, weight: 300, itemDna: { 'g:16': 100, 'k:anime': 90 } },
            { tmdbId: 202, weight: 250, itemDna: { 'g:16': 100, 'k:anime': 80 } },
            { tmdbId: 203, weight: 220, itemDna: { 'g:16': 100, 'k:manga': 70 } },
            { tmdbId: 204, weight: 190, itemDna: { 'g:16': 100, 'k:fantasy': 60 } },
            { tmdbId: 205, weight: 150, itemDna: { 'g:16': 100, 'k:anime': 50 } },
            // Horror
            { tmdbId: 301, weight: 280, itemDna: { 'g:27': 100, 'k:zombie': 90 } },
            { tmdbId: 302, weight: 210, itemDna: { 'g:27': 100, 'k:ghost': 80 } },
            { tmdbId: 303, weight: 170, itemDna: { 'g:27': 100, 'k:monster': 70 } },
            { tmdbId: 304, weight: 140, itemDna: { 'g:27': 100, 'k:blood': 60 } },
            { tmdbId: 305, weight: 110, itemDna: { 'g:27': 100, 'k:slasher': 50 } }
        ];

        it('separates distinct genres and keywords into k clusters', () => {
            const items = generateTestDataset();
            const clusters = clusterTasteSignals(items, { k: 3 });

            expect(clusters.length).toBe(3);
            clusters.forEach(cluster => {
                expect(cluster).toHaveProperty('vector');
                expect(cluster).toHaveProperty('mass');
                expect(cluster).toHaveProperty('massShare');
                expect(cluster).toHaveProperty('seeds');
                expect(cluster.seeds.length).toBeGreaterThan(0);

                // La somma di ogni vettore cluster deve essere normalizzata a 100
                const sum = Object.values(cluster.vector).reduce((a, b) => a + b, 0);
                expect(sum).toBeCloseTo(100, 1);
            });

            // Verifica che i tre cluster catturino rispettivamente i tre generi distinti
            const topGenres = clusters.map(c => {
                const entries = Object.entries(c.vector).filter(([k]) => k.startsWith('g:'));
                entries.sort((a, b) => b[1] - a[1]);
                return entries[0]?.[0];
            });

            expect(topGenres).toContain('g:878');
            expect(topGenres).toContain('g:16');
            expect(topGenres).toContain('g:27');
        });

        it('is 100% deterministic on multiple executions with identical input', () => {
            const itemsA = generateTestDataset();
            const itemsB = generateTestDataset();

            const clustersA = clusterTasteSignals(itemsA);
            const clustersB = clusterTasteSignals(itemsB);

            expect(clustersA).toEqual(clustersB);
        });

        it('is invariant to the input array order (shuffled items produce identical output)', () => {
            const itemsA = generateTestDataset();
            const itemsShuffled = [...itemsA].reverse();

            const clustersA = clusterTasteSignals(itemsA);
            const clustersShuffled = clusterTasteSignals(itemsShuffled);

            expect(clustersA).toEqual(clustersShuffled);
        });
    });

    describe('Hysteresis guard (shouldRecomputeClusters)', () => {
        const baseItems = Array.from({ length: 20 }, (_, i) => ({ tmdbId: 100 + i }));
        const baseMeta = { signalCount: 20, itemIds: baseItems.map(i => i.tmdbId) };
        const dummyClusters = [{ vector: {}, mass: 100, seeds: [100] }];

        it('returns true if no existing clusters or missing metadata', () => {
            expect(shouldRecomputeClusters(null, baseMeta, baseItems)).toBe(true);
            expect(shouldRecomputeClusters([], baseMeta, baseItems)).toBe(true);
            expect(shouldRecomputeClusters(dummyClusters, null, baseItems)).toBe(true);
        });

        it('returns true if items drop below cold-start threshold', () => {
            const fewItems = Array.from({ length: 8 }, (_, i) => ({ tmdbId: 100 + i }));
            expect(shouldRecomputeClusters(dummyClusters, baseMeta, fewItems)).toBe(true);
        });

        it('returns false when difference in signal count is small (< 3) and overlap is high', () => {
            // Aggiungiamo solo 1 nuovo film (21 items totali vs 20 precedenti)
            const slightlyChanged = [...baseItems, { tmdbId: 999 }];
            expect(shouldRecomputeClusters(dummyClusters, baseMeta, slightlyChanged)).toBe(false);
        });

        it('returns true when difference in signal count is >= 3', () => {
            // Aggiungiamo 3 nuovi film (23 items totali vs 20)
            const changedBy3 = [...baseItems, { tmdbId: 901 }, { tmdbId: 902 }, { tmdbId: 903 }];
            expect(shouldRecomputeClusters(dummyClusters, baseMeta, changedBy3)).toBe(true);
        });

        it('returns true when overlap drops (Jaccard < 0.85) even if total count is similar', () => {
            // 20 items, ma sostituiamo 5 item su 20
            const swapped = [
                ...baseItems.slice(0, 15),
                { tmdbId: 901 }, { tmdbId: 902 }, { tmdbId: 903 }, { tmdbId: 904 }, { tmdbId: 905 }
            ];
            expect(shouldRecomputeClusters(dummyClusters, baseMeta, swapped)).toBe(true);
        });
    });
});
