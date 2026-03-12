const fs = require('fs');
const path = require('path');

describe('NextAuth pages config', () => {
    it('maps signIn and error routes to root', () => {
        const authSource = fs.readFileSync(
            path.join(__dirname, '..', 'frontend', 'src', 'auth.ts'),
            'utf-8'
        );

        const pagesStart = authSource.indexOf('pages: {');
        const providersStart = authSource.indexOf('providers:', pagesStart);

        expect(pagesStart).toBeGreaterThan(-1);
        expect(providersStart).toBeGreaterThan(pagesStart);

        const pagesBlock = authSource.slice(pagesStart, providersStart);
        expect(pagesBlock).toMatch(/signIn:\s*"\/"/);
        expect(pagesBlock).toMatch(/error:\s*"\/"/);
    });
});
