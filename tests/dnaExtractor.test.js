const { extractStaticDNAFromQueries, extractActiveDNAFromTmdbData, computeFinalDNA, calculateWeightedInteractions, normalizeVector } = require('../src/utils/dnaExtractor');

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

        it('should extract genres and countries, ignoring cast e crew', () => {
            const queries = [{ with_genres: '28,12', with_cast: '999', with_crew: '888', with_origin_country: 'US' }];
            const result = extractStaticDNAFromQueries(queries);
            expect(result).toHaveProperty('g:28', 100);
            expect(result).toHaveProperty('g:12', 100);
            expect(result).toHaveProperty('o:US', 100);
            // Le persone non alimentano il DNA (scelta di prodotto).
            expect(result).not.toHaveProperty('a:999');
            expect(result).not.toHaveProperty('d:888');
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
            expect(result).toHaveProperty('o:JP', 100);
            // Registi e cast sono esclusi dal DNA.
            expect(result).not.toHaveProperty('d:50');
            expect(result).not.toHaveProperty('a:1');
            expect(result).not.toHaveProperty('a:6');
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
            expect(result).toHaveProperty('o:US', 100);
            expect(result).not.toHaveProperty('d:50');
            expect(result).not.toHaveProperty('a:1');
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

    describe('calculateWeightedInteractions', () => {
        it('should correctly weight signals: watched=2, liked=3, loved=4, library=0', () => {
            const historyDocs = [
                { signals: [{ type: 'watched' }] },            // 2
                { signals: [{ type: 'liked' }] },              // 3
                { signals: [{ type: 'loved' }] },              // 4
                { signals: [{ type: 'library' }] },            // 0 (esclusa)
                { signals: [{ type: 'watched' }, { type: 'loved' }] }, // 2 + 4 = 6
                { signals: [] },                               // 2 (default visto)
                {}                                             // 2 (default visto)
            ];
            const T = calculateWeightedInteractions(historyDocs);
            expect(T).toBe(2 + 3 + 4 + 0 + 6 + 2 + 2); // 19
        });

        it('should return 0 for null or empty docs', () => {
            expect(calculateWeightedInteractions(null)).toBe(0);
            expect(calculateWeightedInteractions([])).toBe(0);
        });
    });

    describe('computeFinalDNA', () => {
        it('should favor static DNA initially when T=0', () => {
            const vStatic = { 'g:28': 100 };
            const vActive = { 'g:12': 100 };
            const T = 0; // 0% active weight
            
            const result = computeFinalDNA(vStatic, vActive, T);
            // static weight = 1, active = 0
            expect(result['g:28']).toBe(100);
            expect(result['g:12']).toBe(0);
        });

        it('should blend static and active according to w = 0.85 * T / (T + 50)', () => {
            const vStatic = { 'g:28': 100 };
            const vActive = { 'g:12': 100 };
            
            // A T = 50: w = 0.85 * 50 / 100 = 0.425
            const res50 = computeFinalDNA(vStatic, vActive, 50);
            expect(res50['g:28']).toBeCloseTo(57.5);
            expect(res50['g:12']).toBeCloseTo(42.5);

            // A T = 150: w = 0.85 * 150 / 200 = 0.6375
            const res150 = computeFinalDNA(vStatic, vActive, 150);
            expect(res150['g:28']).toBeCloseTo(36.25);
            expect(res150['g:12']).toBeCloseTo(63.75);
        });

        it('should asymptotically approach maxActiveWeight 0.85 without exceeding it', () => {
            const vStatic = { 'g:28': 100 };
            const vActive = { 'g:12': 100 };
            const T = 100000; // very large T
            
            const result = computeFinalDNA(vStatic, vActive, T);
            // w = 0.85 * 100000 / 100050 ~= 0.84957
            expect(result['g:12']).toBeLessThanOrEqual(85);
            expect(result['g:12']).toBeGreaterThan(84.9);
            expect(result['g:28']).toBeGreaterThanOrEqual(15);
        });
    });
});
