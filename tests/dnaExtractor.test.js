const { extractStaticDNAFromQueries } = require('../src/utils/dnaExtractor');

describe('dnaExtractor', () => {
    describe('extractStaticDNAFromQueries', () => {
        it('should extract keyword from query.keyword', () => {
            const queries = [{ keyword: 'cyberpunk' }];
            const result = extractStaticDNAFromQueries(queries);
            expect(result).toHaveProperty('k:cyberpunk');
            expect(result['k:cyberpunk']).toBe(100);
        });

        it('should extract keyword from query.with_keywords', () => {
            const queries = [{ with_keywords: '123' }];
            const result = extractStaticDNAFromQueries(queries);
            expect(result).toHaveProperty('k:123');
            expect(result['k:123']).toBe(100);
        });
        
        it('should handle multiple keywords in query.keyword', () => {
            const queries = [{ keyword: 'alien|monster' }];
            const result = extractStaticDNAFromQueries(queries);
            expect(result).toHaveProperty('k:alien');
            expect(result).toHaveProperty('k:monster');
        });
    });
});
