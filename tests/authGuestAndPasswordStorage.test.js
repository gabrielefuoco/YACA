jest.mock('../src/clients/stremio', () => ({
    stremioClient: { post: jest.fn() }
}));

jest.mock('../src/models/UserConfig', () => ({
    saveUser: jest.fn()
}));

jest.mock('../src/db/models/User', () => ({
    findOne: jest.fn()
}));

jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'guest_user_id')
}));

const { stremioClient } = require('../src/clients/stremio');
const UserConfig = require('../src/models/UserConfig');
const User = require('../src/db/models/User');
const { loginHandler, guestHandler } = require('../src/api/auth');

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
        User.findOne.mockResolvedValue(null);
        UserConfig.saveUser.mockResolvedValue({ userId: 'guest_user_id' });

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

    it('creates guest JWT session and cookie for anonymous users', async () => {
        UserConfig.saveUser.mockResolvedValue({ userId: 'guest_user_id' });
        const req = { body: {} };
        const res = mockRes();

        await guestHandler(req, res);

        expect(UserConfig.saveUser).toHaveBeenCalledWith({ userId: 'guest_user_id' });
        expect(res.cookie).toHaveBeenCalledWith('yaca_session', expect.any(String), expect.any(Object));
        expect(res.cookie).toHaveBeenCalledWith('yaca_csrf', expect.any(String), expect.any(Object));
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            userId: 'guest_user_id',
            isGuest: true
        }));
    });
});
