const fs = require('fs');

describe('dead code and duplication cleanup', () => {
    it('keeps a single /api/user/:userId route definition in index.js', () => {
        const source = fs.readFileSync(require.resolve('../index.js'), 'utf-8');
        const matches = source.match(/app\.get\('\/api\/user\/:userId'/g) || [];
        expect(matches).toHaveLength(1);
    });

    it('does not expose internal auth helpers as module exports', () => {
        const authSource = fs.readFileSync(require.resolve('../src/api/auth/index.js'), 'utf-8');
        const exportsLine = authSource.match(/module\.exports\s*=\s*\{[^}]+\};/);
        expect(exportsLine).not.toBeNull();
        expect(exportsLine[0]).not.toContain('getCookieOptions');
        expect(exportsLine[0]).not.toContain('signToken');
    });

    it('does not expose internal sleep helper from rateLimiter', () => {
        const rateLimiter = require('../src/utils/rateLimiter');
        expect(rateLimiter.sleep).toBeUndefined();
    });
});
