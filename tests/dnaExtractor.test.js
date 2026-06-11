const { extractStaticDNAFromQueries, extractActiveDNAFromTmdbData, computeFinalDNA, normalizeVector } = require('../src/utils/dnaExtractor');

describe('dnaExtractor', () => {
    describe('extractStaticDNAFromQueries', () => {
        it('should extract keyword from query.keyword', () => {
            const queries = [{ keyword: 'cyberpunk' }];
            const result = extractStaticDNAFromQueries(queries);
            expect(result).toHaveProperty('k:cyberpunk', 100);
        });

        it('should extract keyword from query.with_keywords', () => {
            const queries = [{ with_keywords: '123' }];
            const result = extractStaticDNAFromQueries(queries);
            expect(result).toHaveProperty('k:123', 100);
        });
        
        it('should handle multiple keywords in query.keyword', () => {
            const queries = [{ keyword: 'alien|monster' }];
            const result = extractStaticDNAFromQueries(queries);
            expect(result).toHaveProperty('k:alien', 100);
            expect(result).toHaveProperty('k:monster', 100);
        });

        it('should extract genres, cast, crew, countries', () => {
            const queries = [{ with_genres: '28,12', with_cast: '999', with_crew: '888', with_origin_country: 'US' }];
            const result = extractStaticDNAFromQueries(queries);
            expect(result).toHaveProperty('g:28', 100);
            expect(result).toHaveProperty('g:12', 100);
            expect(result).toHaveProperty('a:999', 100);
            expect(result).toHaveProperty('d:888', 100);
            expect(result).toHaveProperty('o:US', 100);
        });

        it('should return empty object for null queries', () => {
            expect(extractStaticDNAFromQueries(null)).toEqual({});
            expect(extractStaticDNAFromQueries([])).toEqual({});
        });
    });

    describe('extractActiveDNAFromTmdbData', () => {
        it('should handle empty or null tmdbData', () => {
            expect(extractActiveDNAFromTmdbData(null)).toEqual({});
        });

        it('should extract properties from raw tmdb format', () => {
            const tmdbData = {
                genres: [{ id: 28 }, { id: 12 }],
                keywords: { keywords: [{ id: 100 }, { id: 101 }] },
                credits: {
                    crew: [{ job: 'Director', id: 50 }],
                    cast: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }]
                },
                origin_country: ['JP']
            };
            const result = extractActiveDNAFromTmdbData(tmdbData);
            expect(result).toHaveProperty('g:28', 100);
            expect(result).toHaveProperty('k:100', 100);
            expect(result).toHaveProperty('d:50', 100);
            expect(result).toHaveProperty('a:1', 100);
            expect(result).not.toHaveProperty('a:6'); // only first 5
            expect(result).toHaveProperty('o:JP', 100);
        });

        it('should extract properties from cache format', () => {
            const tmdbData = {
                genre_ids: [28],
                keyword_ids: [100],
                director_ids: [50],
                cast_ids: [1],
                origin_country: ['US']
            };
            const result = extractActiveDNAFromTmdbData(tmdbData);
            expect(result).toHaveProperty('g:28', 100);
            expect(result).toHaveProperty('k:100', 100);
            expect(result).toHaveProperty('d:50', 100);
            expect(result).toHaveProperty('a:1', 100);
            expect(result).toHaveProperty('o:US', 100);
        });
    });

    describe('normalizeVector', () => {
        it('should normalize values to sum to 1', () => {
            const result = normalizeVector({ a: 100, b: 300 });
            expect(result.a).toBe(0.25);
            expect(result.b).toBe(0.75);
        });

        it('should return empty for empty or zero vector', () => {
            expect(normalizeVector({})).toEqual({});
            expect(normalizeVector({ a: 0 })).toEqual({});
            expect(normalizeVector(null)).toEqual({});
        });
    });

    describe('computeFinalDNA', () => {
        it('should favor static DNA initially', () => {
            const vStatic = { 'g:28': 100 };
            const vActive = { 'g:12': 100 };
            const totalInteractions = 0; // 0% active weight
            
            const result = computeFinalDNA(vStatic, vActive, totalInteractions);
            // static weight = 1, active = 0
            expect(result['g:28']).toBe(100); // 1 * 1 * 100
            expect(result['g:12']).toBe(0);
        });

        it('should blend static and active at threshold', () => {
            const vStatic = { 'g:28': 100 };
            const vActive = { 'g:12': 100 };
            const totalInteractions = 50; // threshold = 50, so activeWeight = 0.85
            
            const result = computeFinalDNA(vStatic, vActive, totalInteractions);
            // static weight = 0.15, active = 0.85
            expect(result['g:28']).toBeCloseTo(15);
            expect(result['g:12']).toBeCloseTo(85);
        });

        it('should cap active weight to maxActiveWeight', () => {
            const vStatic = { 'g:28': 100 };
            const vActive = { 'g:12': 100 };
            const totalInteractions = 1000; // far beyond 50
            
            const result = computeFinalDNA(vStatic, vActive, totalInteractions);
            // max activeWeight = 0.85
            expect(result['g:28']).toBeCloseTo(15);
            expect(result['g:12']).toBeCloseTo(85);
        });
    });
});
