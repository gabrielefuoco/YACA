jest.mock('../src/utils/database', () => ({
    getSupabase: jest.fn()
}));

// Mock config to provide CACHE_TTL_MS
jest.mock('../src/config', () => ({
    CACHE_TTL_MS: 24 * 60 * 60 * 1000
}));

const { getSupabase } = require('../src/utils/database');
const TmdbRequestCache = require('../src/models/TmdbRequestCache');

describe('TmdbRequestCache', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('get', () => {
        it('should return null when Supabase is not available', async () => {
            getSupabase.mockReturnValue(null);
            const result = await TmdbRequestCache.get('somehash');
            expect(result).toBeNull();
        });

        it('should return null on cache miss', async () => {
            const selectMock = jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
                })
            });
            getSupabase.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    select: selectMock,
                    update: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({})
                    })
                })
            });

            const result = await TmdbRequestCache.get('missinghash');
            expect(result).toBeNull();
        });

        it('should return fresh data when within TTL', async () => {
            const now = new Date().toISOString();
            const mockData = {
                stremio_data: [{ id: 'tt123', name: 'Test Movie' }],
                updated_at: now
            };

            const updateEqMock = jest.fn().mockResolvedValue({});
            const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });
            const selectMock = jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: mockData, error: null })
                })
            });
            getSupabase.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    select: selectMock,
                    update: updateMock
                })
            });

            const result = await TmdbRequestCache.get('freshhash');
            expect(result).not.toBeNull();
            expect(result.isStale).toBe(false);
            expect(result.stremioData).toEqual([{ id: 'tt123', name: 'Test Movie' }]);
        });

        it('should return stale data when TTL has expired', async () => {
            const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
            const mockData = {
                stremio_data: [{ id: 'tt456', name: 'Old Movie' }],
                updated_at: oldDate
            };

            const updateEqMock = jest.fn().mockResolvedValue({});
            const updateMock = jest.fn().mockReturnValue({ eq: updateEqMock });
            const selectMock = jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: mockData, error: null })
                })
            });
            getSupabase.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    select: selectMock,
                    update: updateMock
                })
            });

            const result = await TmdbRequestCache.get('stalehash');
            expect(result).not.toBeNull();
            expect(result.isStale).toBe(true);
            expect(result.stremioData).toEqual([{ id: 'tt456', name: 'Old Movie' }]);
        });
    });

    describe('set', () => {
        it('should be a no-op when Supabase is not available', async () => {
            getSupabase.mockReturnValue(null);
            // Should not throw
            await TmdbRequestCache.set('hash', '/discover/movie', []);
        });

        it('should upsert data into tmdb_request_cache', async () => {
            const upsertMock = jest.fn().mockResolvedValue({ error: null });
            getSupabase.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    upsert: upsertMock
                })
            });

            await TmdbRequestCache.set('testhash', '/discover/movie', [{ id: 'tt789' }]);
            expect(upsertMock).toHaveBeenCalledTimes(1);

            const upsertArg = upsertMock.mock.calls[0][0];
            expect(upsertArg.request_hash).toBe('testhash');
            expect(upsertArg.endpoint).toBe('/discover/movie');
            expect(upsertArg.stremio_data).toEqual([{ id: 'tt789' }]);
            expect(upsertArg.updated_at).toBeDefined();
            expect(upsertArg.last_accessed).toBeDefined();
        });

        it('should log error on upsert failure without throwing', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const upsertMock = jest.fn().mockResolvedValue({ error: { message: 'db error' } });
            getSupabase.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    upsert: upsertMock
                })
            });

            await TmdbRequestCache.set('hash', '/discover/movie', []);
            expect(consoleSpy).toHaveBeenCalledWith(
                'Errore salvataggio tmdb_request_cache:',
                'db error'
            );
            consoleSpy.mockRestore();
        });
    });
});
