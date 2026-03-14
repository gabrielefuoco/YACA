const fs = require('fs');

describe('dead code and duplication cleanup', () => {
    it('keeps a single /api/user/:userId route definition in index.js', () => {
        const source = fs.readFileSync(require.resolve('../index.js'), 'utf-8');
        const matches = source.match(/^\s*app\.get\(['"`]\/api\/user\/:userId['"`]/gm) || [];
        expect(matches).toHaveLength(1);
    });

    it('does not expose internal auth helpers as module exports', () => {
        const authSource = fs.readFileSync(require.resolve('../src/api/auth/index.js'), 'utf-8');
        const exportStatement = authSource
            .split('\n')
            .find(line => line.includes('module.exports'));
        expect(exportStatement).toBeDefined();
        expect(exportStatement).not.toContain('getCookieOptions');
        expect(exportStatement).not.toContain('signToken');
    });

    it('does not expose internal sleep helper from rateLimiter', () => {
        const rateLimiter = require('../src/utils/rateLimiter');
        expect(rateLimiter.sleep).toBeUndefined();
    });

    it('uses shared normalizeContentId utility instead of duplicate definitions', () => {
        const catalogSource = fs.readFileSync(require.resolve('../src/handlers/catalogHandler.js'), 'utf-8');
        const hybridSource = fs.readFileSync(require.resolve('../src/engines/hybridRecommendations.js'), 'utf-8');
        expect(catalogSource).not.toContain('function normalizeContentId(');
        expect(hybridSource).not.toContain('function normalizeContentId(');

        const { normalizeContentId } = require('../src/utils/contentId');
        expect(normalizeContentId('tmdb:123')).toBe('123');
        expect(normalizeContentId('TMDB:456')).toBe('456');
    });
});
