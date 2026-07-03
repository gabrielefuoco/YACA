const { traktClient, fetchTraktCatalog, refreshTraktTokens } = require('../src/clients/trakt');
const UserAccount = require('../src/db/models/UserAccount');

jest.mock('../src/db/models/UserAccount');

describe('Trakt Integration Tests', () => {
    let mockTraktPost;
    let mockTraktGet;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        
        // Mock axios instance methods
        mockTraktPost = jest.spyOn(traktClient, 'post');
        mockTraktGet = jest.spyOn(traktClient, 'get');
    });

    afterEach(() => {
        mockTraktPost.mockRestore();
        mockTraktGet.mockRestore();
    });

    describe('refreshTraktTokens', () => {
        it('should successfully refresh token and return new tokens', async () => {
            mockTraktPost.mockResolvedValueOnce({
                data: {
                    access_token: 'new_access',
                    refresh_token: 'new_refresh'
                }
            });

            // Set env variables needed
            process.env.TRAKT_CLIENT_ID = 'test_id';
            process.env.TRAKT_CLIENT_SECRET = 'test_secret';

            const result = await refreshTraktTokens('old_refresh');
            
            expect(result).toEqual({
                access_token: 'new_access',
                refresh_token: 'new_refresh'
            });
            expect(mockTraktPost).toHaveBeenCalledWith('/oauth/token', expect.objectContaining({
                refresh_token: 'old_refresh',
                grant_type: 'refresh_token'
            }), expect.any(Object));
        });

        it('should return null if refresh fails', async () => {
            mockTraktPost.mockRejectedValueOnce({ response: { status: 400, data: 'invalid_grant' } });

            process.env.TRAKT_CLIENT_ID = 'test_id';
            process.env.TRAKT_CLIENT_SECRET = 'test_secret';

            const result = await refreshTraktTokens('bad_refresh');
            
            expect(result).toBeNull();
        });
    });

    describe('fetchTraktCatalog - Auto Refresh Logic', () => {
        it('should trigger auto-refresh on 401 Unauthorized', async () => {
            // First request fails with 401
            mockTraktGet.mockRejectedValueOnce({ response: { status: 401 } });
            
            // Token refresh succeeds
            mockTraktPost.mockResolvedValueOnce({
                data: {
                    access_token: 'refreshed_access',
                    refresh_token: 'refreshed_refresh'
                }
            });

            // Second request with new token succeeds
            mockTraktGet.mockResolvedValueOnce({
                data: [
                    { title: 'Test Movie', year: 2020, ids: { tmdb: 123 } }
                ]
            });

            // Mock UserAccount update
            UserAccount.findOneAndUpdate.mockResolvedValueOnce({});

            const refreshContext = {
                userConfig: {
                    userId: 'user123',
                    apiKeys: { traktRefreshToken: 'old_refresh' }
                }
            };

            const result = await fetchTraktCatalog('watchlist_movies', 0, 'expired_token', null, refreshContext);
            
            expect(mockTraktPost).toHaveBeenCalled(); // Token refresh called
            expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
                { userId: 'user123' },
                { $set: { 'apiKeys.trakt': 'refreshed_access', 'apiKeys.traktRefreshToken': 'refreshed_refresh' } },
                expect.any(Object)
            );
            
            // Result should contain the fetched item mapped properly
            expect(result.length).toBeGreaterThan(0);
            expect(result[0].id).toBe('tmdb:123');
        });

        it('should handle rate limits correctly without crashing', async () => {
            // We'll simulate a 429 Error
            mockTraktGet.mockRejectedValueOnce({ response: { status: 429 } });
            
            const result = await fetchTraktCatalog('watchlist_movies', 0, 'valid_token');
            // fetchTraktCatalog catches errors and returns empty array
            expect(result).toEqual([]);
        });
    });
});
