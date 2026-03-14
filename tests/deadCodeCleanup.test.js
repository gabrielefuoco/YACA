const fs = require('fs');

jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'test-user-id')
}));

describe('dead code and duplication cleanup', () => {
    it('keeps a single /api/user/:userId route definition in index.js', () => {
        const source = fs.readFileSync(require.resolve('../index.js'), 'utf-8');
        const matches = source.match(/^\s*app\.get\(['"`]\/api\/user\/:userId['"`]/gm) || [];
        expect(matches).toHaveLength(1);
    });

    it('does not expose internal auth helpers as module exports', () => {
        const authModule = require('../src/api/auth');
        expect(typeof authModule.loginHandler).toBe('function');
        expect(typeof authModule.guestHandler).toBe('function');
        expect(typeof authModule.meHandler).toBe('function');
        expect(typeof authModule.logoutHandler).toBe('function');
        expect(authModule.getCookieOptions).toBeUndefined();
        expect(authModule.signToken).toBeUndefined();
    });

    it('does not expose internal sleep helper from rateLimiter', () => {
        const rateLimiter = require('../src/utils/rateLimiter');
        expect(rateLimiter.sleep).toBeUndefined();
    });

    it('validates normalizeContentId is imported from shared utility', () => {
        const catalogSource = fs.readFileSync(require.resolve('../src/handlers/catalogHandler.js'), 'utf-8');
        const hybridSource = fs.readFileSync(require.resolve('../src/engines/hybridRecommendations.js'), 'utf-8');
        expect(catalogSource).toContain('../utils/contentId');
        expect(hybridSource).toContain('../utils/contentId');
        expect(catalogSource).toContain('normalizeContentId');
        expect(hybridSource).toContain('normalizeContentId');
        expect(catalogSource).not.toContain('function normalizeContentId(');
        expect(hybridSource).not.toContain('function normalizeContentId(');

        const { normalizeContentId } = require('../src/utils/contentId');
        expect(normalizeContentId('tmdb:123')).toBe('123');
        expect(normalizeContentId('TMDB:456')).toBe('456');
    });

    it('deduplicates resolveHostUrl into shared helpers utility', () => {
        const indexSource = fs.readFileSync(require.resolve('../index.js'), 'utf-8');
        const configureSource = fs.readFileSync(require.resolve('../src/api/configure.js'), 'utf-8');
        expect(indexSource).toContain('./src/utils/helpers');
        expect(configureSource).toContain('../utils/helpers');
        expect(indexSource).not.toContain('function resolveHostUrl(');
        expect(configureSource).not.toContain('function resolveHostUrl(');
    });
});
