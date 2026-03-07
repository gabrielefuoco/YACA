const fs = require('fs');
const path = require('path');

describe('manifest search catalog declaration', () => {
    it('declares searchable catalogs with required search extra', () => {
        const indexPath = path.join(__dirname, '..', 'index.js');
        const source = fs.readFileSync(indexPath, 'utf8');

        expect(source).toContain("id: 'yaca_search_movies'");
        expect(source).toContain("id: 'yaca_search_series'");
        expect(source).toContain("name: 'search', isRequired: true");
    });
});
