const ProfileBuilder = require('../src/profile/ProfileBuilder');
const TasteProfile = require('../src/models/TasteProfile');
const WatchHistory = require('../src/models/WatchHistory');
const duckDbStore = require('../src/db/duckDbStore');

jest.mock('../src/models/TasteProfile');
jest.mock('../src/models/WatchHistory');
jest.mock('../src/db/duckDbStore');
jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) })
}));
jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) })
}));

describe('ProfileBuilder - Multi-vector integration & hysteresis', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('computes and saves V_clusters and clustersMeta when signals >= 12', async () => {
        const owner = 'test_user';
        const context = 'global';

        // 15 item nella cronologia (5 sci-fi, 5 animazione, 5 horror)
        const historyDocs = [];
        const duckDbRows = [];
        for (let i = 1; i <= 15; i++) {
            historyDocs.push({
                tmdbId: i,
                type: 'movie',
                signals: [{ type: 'watched', at: new Date() }]
            });
            const genre = i <= 5 ? [{ id: 878 }] : i <= 10 ? [{ id: 16 }] : [{ id: 27 }];
            const kw = i <= 5 ? [{ id: 1001 }] : i <= 10 ? [{ id: 2001 }] : [{ id: 3001 }];
            duckDbRows.push({
                id: i,
                genres: JSON.stringify(genre),
                keywords: JSON.stringify(kw),
                cast: '[]',
                directors: '[]',
                original_language: 'en'
            });
        }

        WatchHistory.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue(historyDocs)
        });

        TasteProfile.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                owner,
                context,
                compiledVectors: {
                    V_static: {},
                    V_clusters: [],
                    clustersMeta: null
                }
            })
        });

        duckDbStore.query.mockResolvedValue(duckDbRows);
        TasteProfile.updateOne.mockResolvedValue({ modifiedCount: 1 });

        await ProfileBuilder.recomputeVectorsForUser(owner, context);

        expect(TasteProfile.updateOne).toHaveBeenCalledTimes(1);
        const updateArgs = TasteProfile.updateOne.mock.calls[0][1].$set;

        expect(updateArgs['compiledVectors.V_clusters']).toBeDefined();
        expect(updateArgs['compiledVectors.clustersMeta']).toBeDefined();
        expect(Array.isArray(updateArgs['compiledVectors.V_clusters'])).toBe(true);
        expect(updateArgs['compiledVectors.V_clusters'].length).toBeGreaterThan(1);
        expect(updateArgs['compiledVectors.clustersMeta'].signalCount).toBe(15);
    });

    it('reuses existing clusters under hysteresis when signal changes are minor', async () => {
        const owner = 'test_user';
        const context = 'global';

        // 15 items precedenti
        const existingClusters = [
            { vector: { 'g:878': 100 }, mass: 500, seeds: [1, 2] },
            { vector: { 'g:16': 100 }, mass: 500, seeds: [6, 7] }
        ];
        const existingMeta = {
            signalCount: 15,
            itemIds: Array.from({ length: 15 }, (_, i) => i + 1),
            computedAt: new Date('2026-09-01')
        };

        // Nuova history con 16 item (solo 1 nuovo -> isteresi attiva)
        const historyDocs = [];
        const duckDbRows = [];
        for (let i = 1; i <= 16; i++) {
            historyDocs.push({
                tmdbId: i,
                type: 'movie',
                signals: [{ type: 'watched', at: new Date() }]
            });
            duckDbRows.push({
                id: i,
                genres: JSON.stringify([{ id: 878 }]),
                keywords: '[]',
                cast: '[]',
                directors: '[]',
                original_language: 'en'
            });
        }

        WatchHistory.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue(historyDocs)
        });

        TasteProfile.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                owner,
                context,
                compiledVectors: {
                    V_static: {},
                    V_clusters: existingClusters,
                    clustersMeta: existingMeta
                }
            })
        });

        duckDbStore.query.mockResolvedValue(duckDbRows);
        TasteProfile.updateOne.mockResolvedValue({ modifiedCount: 1 });

        await ProfileBuilder.recomputeVectorsForUser(owner, context);

        const updateArgs = TasteProfile.updateOne.mock.calls[0][1].$set;
        // Devono essere stati riusati i cluster e i metadati precedenti
        expect(updateArgs['compiledVectors.V_clusters']).toEqual(existingClusters);
        expect(updateArgs['compiledVectors.clustersMeta']).toEqual(existingMeta);
    });
});
