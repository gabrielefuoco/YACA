// Mock nanoid (ESM issue in Jest)
jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'test_nanoid_id')
}));

// Mock httpClient to control traktClient
const mockTraktClient = {
    post: jest.fn(),
    get: jest.fn()
};
jest.mock('../src/utils/httpClient', () => ({
    createAxiosInstance: jest.fn(() => mockTraktClient)
}));

// Mock MongoDB UserAccount Model (Two-Table Split: trakt.js writes tokens to UserAccount)
jest.mock('../src/db/models/UserAccount', () => ({
    findOneAndUpdate: jest.fn()
}));

const { refreshTraktTokens, syncTraktTokensToDb, traktClient } = require('../src/clients/trakt');
const UserAccount = require('../src/db/models/UserAccount');

describe('Trakt Stateful Auto-Refresh', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...ORIGINAL_ENV,
            TRAKT_CLIENT_ID: 'test_client_id',
            TRAKT_CLIENT_SECRET: 'test_client_secret'
        };
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    describe('refreshTraktTokens', () => {
        it('returns new tokens on successful refresh', async () => {
            mockTraktClient.post.mockResolvedValueOnce({
                data: {
                    access_token: 'new_access_token',
                    refresh_token: 'new_refresh_token'
                }
            });

            const result = await refreshTraktTokens('old_refresh_token');

            expect(result).toEqual({
                access_token: 'new_access_token',
                refresh_token: 'new_refresh_token'
            });

            expect(mockTraktClient.post).toHaveBeenCalledWith(
                '/oauth/token',
                expect.objectContaining({
                    refresh_token: 'old_refresh_token',
                    client_id: 'test_client_id',
                    client_secret: 'test_client_secret'
                }),
                expect.any(Object)
            );
        });
    });

    describe('syncTraktTokensToDb', () => {
        it('updates MongoDB with new tokens via UserAccount', async () => {
            UserAccount.findOneAndUpdate.mockResolvedValueOnce({ userId: 'user123' });

            const result = await syncTraktTokensToDb('user123', 'new_access', 'new_refresh');

            expect(result).toBe(true);
            expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
                { userId: 'user123' },
                {
                    $set: {
                        'apiKeys.trakt': 'new_access',
                        'apiKeys.traktRefreshToken': 'new_refresh'
                    }
                },
                { returnDocument: 'after' }
            );
        });
    });
});
