const fs = require('fs');

describe('dead code and duplication cleanup', () => {
    it('keeps a single /api/user/:userId route definition in index.js', () => {
        const source = fs.readFileSync(require.resolve('../index.js'), 'utf-8');
        const matches = source.match(/app\.get\('\/api\/user\/:userId'/g) || [];
        expect(matches).toHaveLength(1);
    });

    it('does not expose internal auth helpers as module exports', () => {
        const authSource = fs.readFileSync(require.resolve('../src/api/auth/index.js'), 'utf-8');
        expect(authSource).toContain('module.exports = { loginHandler, guestHandler, meHandler, logoutHandler };');
    });

    it('does not expose internal sleep helper from rateLimiter', () => {
        const rateLimiter = require('../src/utils/rateLimiter');
        expect(rateLimiter.sleep).toBeUndefined();
    });
});
