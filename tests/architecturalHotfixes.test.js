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
});
