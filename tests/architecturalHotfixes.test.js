const fs = require('fs');
const path = require('path');

describe('architectural hotfixes', () => {
    it('keeps a single secured stremio addon update route', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf-8');
        const matches = source.match(/app\.post\('\/api\/stremio-addon-update'/g) || [];

        expect(matches).toHaveLength(1);
        expect(source).toContain("isAllowedUrl(manifestUrl, [])");
        expect(source).toContain("parsed.protocol !== 'https:'");
    });

    it('does not perform CacheEntry regex scans in catalog search', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'handlers', 'catalogHandler.js'), 'utf-8');

        expect(source).not.toContain('CacheEntry.find({');
        expect(source).not.toContain("'value.stremioData.name': { $regex:");
    });

    it('uses shared cache instances and removes rogue cache model files', () => {
        expect(fs.existsSync(path.join(__dirname, '..', 'src', 'models', 'AICache.js'))).toBe(false);
        expect(fs.existsSync(path.join(__dirname, '..', 'src', 'models', 'RecommendationCache.js'))).toBe(false);

        const hybridSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'engines', 'hybridRecommendations.js'), 'utf-8');
        expect(hybridSource).toContain("require('../cache/cacheInstances')");
        expect(hybridSource).not.toContain("require('../utils/LRUCache')");
        expect(hybridSource).not.toContain("require('../models/RecommendationCache')");
        expect(hybridSource).not.toContain("const catalogCache =");
    });

    it('does not import axios directly in hybridRecommendations', () => {
        const hybridSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'engines', 'hybridRecommendations.js'), 'utf-8');
        expect(hybridSource).not.toContain("require('axios')");
    });

    it('protects /api/configure with requireAuth middleware', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf-8');
        expect(source).toContain("app.post('/api/configure', configureLimiter, requireAuth, configureRoute);");
    });

    it('prioritizes JWT userId over request body in configure route', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'configure.js'), 'utf-8');
        expect(source).toContain('const existingUserId = req.user.userId;');
        expect(source).not.toContain('req.body.userId');
    });

    it('defines mistralKey alias for AI prompt generation', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'configure.js'), 'utf-8');
        expect(source).toContain('const mistralKey = effectiveMistralKey;');
    });

    it('does not send userId from frontend configure payload', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'app', 'page.tsx'), 'utf-8');
        expect(source).not.toContain('userId: existingUserId || (userId ?? undefined),');
    });

    it('does not overwrite trakt token for returning user login flow', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'components', 'pages', 'LoginPage.tsx'), 'utf-8');
        const normalized = source.replace(/\s+/g, '');
        expect(normalized).toContain('onComplete(auth,null,null,data.userId||undefined,');
        expect(source).not.toContain("data.traktConnected ? 'connected' : null,");
    });
});
