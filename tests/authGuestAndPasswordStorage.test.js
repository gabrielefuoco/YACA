jest.mock('../src/clients/stremio', () => ({
    stremioClient: { post: jest.fn() }
}));

jest.mock('../src/models/UserConfig', () => ({
    saveUser: jest.fn()
}));

// Two-Table Split: auth/index.js now imports UserAccount and AddonConfig directly
jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) })
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    create: jest.fn()
}));

jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'guest_user_id')
}));

const { stremioClient } = require('../src/clients/stremio');
const UserConfig = require('../src/models/UserConfig');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const { loginHandler } = require('../src/api/auth');

describe('auth handlers security hardening', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.JWT_SECRET = 'test-secret';
    });

    afterEach(() => {
        delete process.env.JWT_SECRET;
    });

    function mockRes() {
        const res = {};
        res.cookie = jest.fn();
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        return res;
    }

    it('does not persist Stremio password on login', async () => {
        stremioClient.post.mockResolvedValue({
            data: {
                result: {
                    authKey: 'stremio_auth_key',
                    user: { email: 'user@example.com' }
                }
            }
        });
        // First call: lookup existing account → not found
        // Second call: re-read account after saveUser → found
        const mockAccount = { userId: 'guest_user_id', addonUuid: 'uuid-1', apiKeys: {} };
        UserAccount.findOne
            .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
            .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(mockAccount) });
        UserConfig.saveUser.mockResolvedValue({ userId: 'guest_user_id' });
        AddonConfig.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ uuid: 'uuid-1', profiles: [], config: {} })
        });

        const req = { body: { email: 'user@example.com', password: 'super-secret-password' } };
        const res = mockRes();

        await loginHandler(req, res);

        expect(UserConfig.saveUser).toHaveBeenCalledWith(expect.objectContaining({
            apiKeys: { stremio: 'stremio_auth_key' }
        }));
        expect(UserConfig.saveUser.mock.calls[0][0].apiKeys.stremioPass).toBeUndefined();
        expect(res.cookie).toHaveBeenCalledWith('yaca_session', expect.any(String), expect.any(Object));
        expect(res.cookie).toHaveBeenCalledWith('yaca_csrf', expect.any(String), expect.any(Object));
        const sessionCookieOpts = res.cookie.mock.calls.find(call => call[0] === 'yaca_session')[2];
        const csrfCookieOpts = res.cookie.mock.calls.find(call => call[0] === 'yaca_csrf')[2];
        expect(sessionCookieOpts).toEqual(expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }));
        expect(csrfCookieOpts).toEqual(expect.objectContaining({ httpOnly: false, sameSite: 'lax', path: '/' }));
    });

});
