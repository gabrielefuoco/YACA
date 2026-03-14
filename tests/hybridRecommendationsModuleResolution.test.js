describe('hybrid recommendations module resolution', () => {
    it('loads without missing model modules', () => {
        jest.isolateModules(() => {
            jest.doMock('../src/db/models/TasteProfile', () => ({
                findOne: jest.fn(),
                updateOne: jest.fn(),
                findOneAndUpdate: jest.fn()
            }));
            jest.doMock('../src/db/models/TmdbScoringData', () => ({
                findOne: jest.fn(),
                find: jest.fn(),
                updateOne: jest.fn()
            }));
            jest.doMock('../src/models/User', () => ({
                findOne: jest.fn()
            }));
            jest.doMock('../src/profile/ProfileScorer', () => ({
                calculateItemMatch: jest.fn(() => 0),
                applyDiversityCaps: jest.fn(items => items)
            }));
            jest.doMock('../src/clients/tmdb', () => ({
                createTmdbClient: jest.fn(() => ({ get: jest.fn() })),
                getTmdbMovieDetails: jest.fn(),
                getTmdbMetaDetails: jest.fn()
            }));
            jest.doMock('../src/clients/trakt', () => ({
                traktClient: { get: jest.fn() }
            }));
            jest.doMock('../src/cache/cacheInstances', () => ({
                hybridRecommendationsCache: {
                    getWithStatus: jest.fn(),
                    set: jest.fn(),
                    delete: jest.fn(),
                    clear: jest.fn()
                }
            }));
            jest.doMock('../src/ai/querySynthesizer', () => ({
                generateDiscoveryQueries: jest.fn(() => [])
            }));

            expect(() => require('../src/engines/hybridRecommendations')).not.toThrow();
        });
    });
});
