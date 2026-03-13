const jwt = require('jsonwebtoken');

describe('requireAuth middleware', () => {
    const TEST_SECRET = 'test-jwt-secret-for-unit-tests';
    let requireAuth, optionalAuth;

    beforeEach(() => {
        jest.resetModules();
        process.env.JWT_SECRET = TEST_SECRET;
        ({ requireAuth, optionalAuth } = require('../src/middleware/requireAuth'));
    });

    afterEach(() => {
        delete process.env.JWT_SECRET;
    });

    function mockReq(cookies = {}) {
        return { cookies };
    }

    function mockRes() {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        return res;
    }

    it('requireAuth should reject requests without a cookie', () => {
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
        expect(next).not.toHaveBeenCalled();
    });

    it('requireAuth should reject requests with an invalid token', () => {
        const req = mockReq({ yaca_session: 'invalid-token' });
        const res = mockRes();
        const next = jest.fn();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('requireAuth should accept requests with a valid token and set req.user', () => {
        const payload = { userId: 'user123', email: 'test@example.com' };
        const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '24h' });
        const req = mockReq({ yaca_session: token });
        const res = mockRes();
        const next = jest.fn();

        requireAuth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toBeDefined();
        expect(req.user.userId).toBe('user123');
        expect(req.user.email).toBe('test@example.com');
    });

    it('requireAuth should reject expired tokens', () => {
        const payload = { userId: 'user123' };
        const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '-1s' });
        const req = mockReq({ yaca_session: token });
        const res = mockRes();
        const next = jest.fn();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('optionalAuth should allow requests without a cookie and set req.user to null', () => {
        const req = mockReq();
        const res = mockRes();
        const next = jest.fn();

        optionalAuth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toBeNull();
    });

    it('optionalAuth should set req.user with valid token', () => {
        const payload = { userId: 'user456', email: 'opt@example.com' };
        const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '24h' });
        const req = mockReq({ yaca_session: token });
        const res = mockRes();
        const next = jest.fn();

        optionalAuth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toBeDefined();
        expect(req.user.userId).toBe('user456');
    });

    it('optionalAuth should set req.user to null for invalid token', () => {
        const req = mockReq({ yaca_session: 'garbage' });
        const res = mockRes();
        const next = jest.fn();

        optionalAuth(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toBeNull();
    });
});
