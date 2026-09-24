const { getHybridCatalog, syncIncrementalRecommendations } = require('../src/engines/hybridRecommendations');
const TasteProfile = require('../src/models/TasteProfile');
const ProfileBuilder = require('../src/profile/ProfileBuilder');
const { hybridRecommendationsCache } = require('../src/cache/cacheInstances');
const { getDuckDbMetaDetails, mapDuckDbRowToMeta } = require('../src/catalog/providers/DuckDbProvider');
const dataFetchers = require('../src/engines/hybrid/dataFetchers');
const { F } = require('../src/data/filters');

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
}));

jest.mock('../src/profile/ProfileBuilder', () => ({
    syncUserHistory: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/engines/hybrid/dataFetchers', () => {
    const actual = jest.requireActual('../src/engines/hybrid/dataFetchers');
    return {
        ...actual,
        fetchRecentHistory: jest.fn(),
        fetchRecentRatings: jest.fn()
    };
});

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return {
        ...actual,
        getDuckDbMetaDetails: jest.fn()
    };
});

jest.mock('../src/cache/cacheInstances', () => ({
    hybridRecommendationsCache: {
        getWithStatus: jest.fn(),
        set: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue(null),
        clear: jest.fn().mockResolvedValue(null)
    }
}));

function cachedHeroGroup(mediaType, ids) {
    const suffix = mediaType === 'movie' ? 'movies' : 'series';
    const catalogs = {};
    for (const slug of ['true_blend', 'seed_network', 'hidden_gems', 'trakt_filtered']) {
        catalogs[`yaca_${slug}_${suffix}`] = ids;
    }
    return { schemaVersion: 3, mediaType, catalogs };
}

describe('Hero Catalogs Audit 02 Fixes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('BUG-1: Movie hero empty due to Date object and fault isolation', () => {
        it('successfully extracts releaseInfo when DuckDB rawTMDB.release_date is a Date object', async () => {
            TasteProfile.findOne.mockResolvedValue({ lastUpdated: new Date() });
            hybridRecommendationsCache.getWithStatus.mockResolvedValue({
                value: cachedHeroGroup('movie', [{ id: '11', matchScore: 95 }]),
                status: 'fresh'
            });

            // DuckDB returns a Date object for parquet DATE columns
            getDuckDbMetaDetails.mockResolvedValueOnce({
                id: 'tmdb:11',
                rawTMDB: {
                    id: 11,
                    title: 'Star Wars: A New Hope',
                    release_date: new Date('1977-05-25T00:00:00.000Z'),
                    vote_average: 8.2,
                    poster_path: '/starwars.jpg'
                }
            });

            const results = await getHybridCatalog(
                'yaca_true_blend_movies',
                0,
                'fake_trakt',
                'fake_tmdb',
                'user_1',
                'global'
            );

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('tmdb:11');
            expect(results[0].name).toBe('Star Wars: A New Hope');
            expect(results[0].releaseInfo).toBe('1977');
            expect(results[0]._yacaMatch).toBe(95);
        });

        it('does not zero the entire page if one item has an error or fails to load', async () => {
            TasteProfile.findOne.mockResolvedValue({ lastUpdated: new Date() });
            hybridRecommendationsCache.getWithStatus.mockResolvedValue({
                value: cachedHeroGroup('movie', [
                    { id: '999999', matchScore: 90 }, // questo item fallisce
                    { id: '12', matchScore: 85 }       // questo item viene risolto
                ]),
                status: 'fresh'
            });

            // First item fails to resolve
            getDuckDbMetaDetails.mockRejectedValueOnce(new Error('DuckDB read failure'));
            // Second item succeeds
            getDuckDbMetaDetails.mockResolvedValueOnce({
                id: 'tmdb:12',
                rawTMDB: {
                    id: 12,
                    title: 'Finding Nemo',
                    release_date: '2003-05-30',
                    vote_average: 7.8,
                    poster_path: '/nemo.jpg'
                }
            });

            const results = await getHybridCatalog(
                'yaca_true_blend_movies',
                0,
                'fake_trakt',
                'fake_tmdb',
                'user_1',
                'global'
            );

            // Item 1 failed, but Item 2 must still be present on the page!
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('tmdb:12');
            expect(results[0].name).toBe('Finding Nemo');
            expect(results[0].releaseInfo).toBe('2003');
        });

        it('handles null, empty, or string release_date gracefully', async () => {
            TasteProfile.findOne.mockResolvedValue({ lastUpdated: new Date() });
            hybridRecommendationsCache.getWithStatus.mockResolvedValue({
                value: cachedHeroGroup('movie', [{ id: '100', matchScore: 50 }]),
                status: 'fresh'
            });

            getDuckDbMetaDetails.mockResolvedValueOnce({
                id: 'tmdb:100',
                rawTMDB: {
                    id: 100,
                    title: 'No Date Movie',
                    release_date: null,
                    first_air_date: null,
                    vote_average: 6.0
                }
            });

            const results = await getHybridCatalog(
                'yaca_true_blend_movies',
                0,
                'fake_trakt',
                'fake_tmdb',
                'user_1',
                'global'
            );

            expect(results).toHaveLength(1);
            expect(results[0].releaseInfo).toBe('');
        });
    });

    describe('BUG-2: Series year releaseInfo and first_air_date mapping', () => {
        it('extracts releaseInfo from first_air_date for series', async () => {
            TasteProfile.findOne.mockResolvedValue({ lastUpdated: new Date() });
            hybridRecommendationsCache.getWithStatus.mockResolvedValue({
                value: cachedHeroGroup('series', [{ id: '1399', matchScore: 92 }]),
                status: 'fresh'
            });

            getDuckDbMetaDetails.mockResolvedValueOnce({
                id: 'tmdb:1399',
                rawTMDB: {
                    id: 1399,
                    name: 'Game of Thrones',
                    first_air_date: '2011-04-17',
                    vote_average: 8.4,
                    poster_path: '/got.jpg'
                }
            });

            const results = await getHybridCatalog(
                'yaca_seed_network_series',
                0,
                'fake_trakt',
                'fake_tmdb',
                'user_1',
                'global'
            );

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('tmdb:1399');
            expect(results[0].name).toBe('Game of Thrones');
            expect(results[0].type).toBe('series');
            expect(results[0].releaseInfo).toBe('2011');
        });

        it('DuckDbProvider.mapDuckDbRowToMeta maps first_air_date to rawTMDB and releaseInfo', () => {
            const row = {
                id: '1396',
                name: 'Breaking Bad',
                first_air_date: '2008-01-20',
                last_air_date: '2013-09-29',
                vote_average: 8.9,
                vote_count: 12000,
                popularity: 150
            };

            const meta = mapDuckDbRowToMeta(row, false);
            expect(meta.releaseInfo).toBe('2008');
            expect(meta.rawTMDB.first_air_date).toBe('2008-01-20');
        });
    });

    describe('BUG-5: Smart Fallback removes keywords correctly with ILIKE', () => {
        it('removes keyword filter when keywords are generated with F.keywordStr (ILIKE)', () => {
            const baseFilters = ['"vote_count" >= 1000'];
            const mappedTopGenres = [28];
            const clusterKeywords = ['cyberpunk', 'space travel'];

            const where = [...baseFilters];
            where.push(F.any(...mappedTopGenres.map(g => F.genre(Number(g)))));
            where.push(F.any(...clusterKeywords.map(k => F.keywordStr(k))));

            expect(where.some(w => w.includes('"keywords" ILIKE'))).toBe(true);

            // Smart Fallback filtering logic
            const fallbackWhere = where.filter(w => !w.includes('"keywords"'));
            expect(fallbackWhere.some(w => w.includes('keywords'))).toBe(false);
            expect(fallbackWhere).toHaveLength(2); // baseFilters + genre
        });
    });

    describe('BUG-3: Stale profile sync without interactions prevents cache invalidation', () => {
        it('returns false and does not invalidate recommendations cache when Trakt history/ratings are empty', async () => {
            dataFetchers.fetchRecentHistory.mockResolvedValueOnce([]);
            dataFetchers.fetchRecentRatings.mockResolvedValueOnce([]);

            const result = await syncIncrementalRecommendations('user_1', 'movie', 'token', 'key', 'global');

            expect(result).toBe(false);
            expect(ProfileBuilder.syncUserHistory).not.toHaveBeenCalled();
            expect(TasteProfile.updateOne).toHaveBeenCalledWith(
                { owner: 'user_1', context: 'global' },
                expect.objectContaining({ $set: expect.objectContaining({ lastUpdated: expect.any(Date) }) })
            );
        });

        it('returns true and syncs history when Trakt interactions are present', async () => {
            dataFetchers.fetchRecentHistory.mockResolvedValueOnce([{ movie: { ids: { tmdb: 11 } } }]);
            dataFetchers.fetchRecentRatings.mockResolvedValueOnce([]);

            const result = await syncIncrementalRecommendations('user_1', 'movie', 'token', 'key', 'global');

            expect(result).toBe(true);
            expect(ProfileBuilder.syncUserHistory).toHaveBeenCalled();
            expect(TasteProfile.updateOne).toHaveBeenCalledWith(
                { owner: 'user_1', context: 'global' },
                expect.objectContaining({ $set: expect.objectContaining({ lastUpdated: expect.any(Date) }) })
            );
        });
    });
});
