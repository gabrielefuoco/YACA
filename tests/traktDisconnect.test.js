const mockTraktClient = {
    post: jest.fn(),
    get: jest.fn(),
    interceptors: { response: { use: jest.fn() } }
};

jest.mock('../src/utils/axiosClient', () => ({
    createAxiosClient: jest.fn(() => ({
        post: jest.fn(),
        get: jest.fn(),
        interceptors: { response: { use: jest.fn() } }
    }))
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOneAndUpdate: jest.fn()
}));

const { traktDisconnectHandler } = require('../src/api/auth/index.js');
const { syncTraktTokensToDb, refreshTraktTokens, traktClient } = require('../src/clients/trakt');
const UserAccount = require('../src/db/models/UserAccount');

describe('Trakt Disconnect & traktExpiresAt Persistence', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.TRAKT_CLIENT_ID = 'test_id';
        process.env.TRAKT_CLIENT_SECRET = 'test_secret';
    });

    describe('traktDisconnectHandler', () => {
        it('should return 401 if no userId and no cookie are provided', async () => {
            const req = { body: {}, cookies: {} };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            await traktDisconnectHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: expect.stringContaining('userId mancante')
            }));
        });

        it('should unset apiKeys.trakt, traktRefreshToken, and traktExpiresAt from UserAccount', async () => {
            const req = { body: { userId: 'user-to-disconnect' }, cookies: {} };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            UserAccount.findOneAndUpdate.mockResolvedValueOnce({
                userId: 'user-to-disconnect',
                apiKeys: {}
            });

            await traktDisconnectHandler(req, res);

            expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
                { userId: 'user-to-disconnect' },
                {
                    $unset: {
                        'apiKeys.trakt': 1,
                        'apiKeys.traktRefreshToken': 1,
                        'apiKeys.traktExpiresAt': 1
                    }
                },
                { returnDocument: 'after' }
            );

            expect(res.json).toHaveBeenCalledWith({
                success: true,
                message: 'Trakt disconnesso con successo.'
            });
        });

        it('should return 404 if user not found in UserAccount', async () => {
            const req = { body: { userId: 'unknown-user' }, cookies: {} };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };

            UserAccount.findOneAndUpdate.mockResolvedValueOnce(null);

            await traktDisconnectHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: 'Utente non trovato.'
            }));
        });
    });

    describe('syncTraktTokensToDb with traktExpiresAt', () => {
        it('saves traktExpiresAt when provided', async () => {
            UserAccount.findOneAndUpdate.mockResolvedValueOnce({ userId: 'u1' });
            const expiry = new Date(Date.now() + 3600000);

            const result = await syncTraktTokensToDb('u1', 'access_tok', 'refresh_tok', expiry);

            expect(result).toBe(true);
            expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
                { userId: 'u1' },
                {
                    $set: {
                        'apiKeys.trakt': 'access_tok',
                        'apiKeys.traktRefreshToken': 'refresh_tok',
                        'apiKeys.traktExpiresAt': expiry
                    }
                },
                { returnDocument: 'after' }
            );
        });
    });

    describe('refreshTraktTokens with expires_in', () => {
        it('calculates and returns expires_at when expires_in is present', async () => {
            jest.spyOn(traktClient, 'post').mockResolvedValueOnce({
                data: {
                    access_token: 'new_acc',
                    refresh_token: 'new_ref',
                    expires_in: 7200,
                    created_at: 1700000000
                }
            });

            const tokens = await refreshTraktTokens('existing_ref');

            expect(tokens).toEqual({
                access_token: 'new_acc',
                refresh_token: 'new_ref',
                expires_at: new Date((1700000000 + 7200) * 1000)
            });
        });
    });
});
