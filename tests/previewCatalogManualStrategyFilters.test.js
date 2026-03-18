const fs = require('fs');
const path = require('path');

describe('preview-catalog manual filters keep strategy fields', () => {
    const catalogApiPath = path.join(__dirname, '..', 'src', 'api', 'catalog.js');
    const source = fs.readFileSync(catalogApiPath, 'utf8');

    it('uses strategy from custom filters instead of forcing discovery', () => {
        expect(source).toContain("strategy = sanitizeString(String(customFilters?.strategy || 'discovery'));");
    });

    it('whitelists strategy-specific manual preview filters', () => {
        expect(source).toContain("'strategy', 'similar_to', 'text_search'");
    });
});
