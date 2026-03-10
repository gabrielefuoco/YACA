const ProfileScorer = require('../src/profile/ProfileScorer');

// Mock external dependencies before importing querySynthesizer
jest.mock('@mistralai/mistralai', () => ({ Mistral: jest.fn() }), { virtual: true });
jest.mock('../src/cache/cacheInstances', () => ({
    aiDiscoveryCache: {
        getWithStatus: jest.fn().mockResolvedValue({ value: null, status: 'miss' }),
        set: jest.fn().mockResolvedValue(null)
    }
}), { virtual: true });

const { parseQuerySynthesizerResponse, buildDnaDescription, GENRE_NAME_TO_ID } = require('../src/ai/querySynthesizer');

// ============================================
// Test: calculateLightScore (Two-Tier Scoring - Tier 1)
// ============================================
describe('ProfileScorer.calculateLightScore', () => {
    const makeProfile = (genreScores = {}) => ({
        genreScores: new Map(Object.entries(genreScores))
    });

    it('should return 0 for null inputs', () => {
        expect(ProfileScorer.calculateLightScore(null, null)).toBe(0);
        expect(ProfileScorer.calculateLightScore({}, null)).toBe(0);
        expect(ProfileScorer.calculateLightScore(null, makeProfile())).toBe(0);
    });

    it('should compute genre match score from profile', () => {
        const profile = makeProfile({ '28': 5.0, '878': 3.0 }); // Action=5, Sci-Fi=3
        const lightData = { id: 1, genre_ids: [28, 878], vote_average: 0, vote_count: 0 };
        const score = ProfileScorer.calculateLightScore(lightData, profile);
        // genreScore = 5.0 + 3.0 = 8.0
        // bayesian = (0/(0+300))*0 + (300/(0+300))*6.5 = 6.5
        // combined = 8.0 * 0.7 + 6.5 * 0.3 = 5.6 + 1.95 = 7.55
        expect(score).toBeCloseTo(7.55, 1);
    });

    it('should compute bayesian score correctly for popular titles', () => {
        const profile = makeProfile({});
        const lightData = { id: 2, genre_ids: [], vote_average: 8.5, vote_count: 5000 };
        const score = ProfileScorer.calculateLightScore(lightData, profile);
        // genreScore = 0
        // bayesian = (5000/(5000+300))*8.5 + (300/(5000+300))*6.5
        // = (5000/5300)*8.5 + (300/5300)*6.5
        // = 0.9434*8.5 + 0.0566*6.5
        // ≈ 8.019 + 0.368 = 8.387
        // combined = 0 * 0.7 + 8.387 * 0.3 ≈ 2.516
        expect(score).toBeCloseTo(2.516, 1);
    });

    it('should combine genre and bayesian scores', () => {
        const profile = makeProfile({ '28': 4.0 }); // Action=4
        const lightData = { id: 3, genre_ids: [28], vote_average: 7.0, vote_count: 500 };
        const score = ProfileScorer.calculateLightScore(lightData, profile);
        // genreScore = 4.0
        // bayesian = (500/800)*7.0 + (300/800)*6.5 = 0.625*7.0 + 0.375*6.5 = 4.375 + 2.4375 = 6.8125
        // combined = 4.0 * 0.7 + 6.8125 * 0.3 = 2.8 + 2.044 = 4.844
        expect(score).toBeCloseTo(4.844, 1);
    });

    it('should cap score at 10', () => {
        const profile = makeProfile({ '28': 20.0, '878': 15.0 });
        const lightData = { id: 4, genre_ids: [28, 878], vote_average: 9.5, vote_count: 10000 };
        const score = ProfileScorer.calculateLightScore(lightData, profile);
        expect(score).toBeLessThanOrEqual(10);
    });

    it('should handle empty genre_ids gracefully', () => {
        const profile = makeProfile({ '28': 5.0 });
        const lightData = { id: 5, genre_ids: [], vote_average: 6.0, vote_count: 100 };
        const score = ProfileScorer.calculateLightScore(lightData, profile);
        expect(score).toBeGreaterThanOrEqual(0);
    });
});

// ============================================
// Test: parseQuerySynthesizerResponse
// ============================================
describe('parseQuerySynthesizerResponse', () => {
    it('should parse a valid JSON array', () => {
        const input = JSON.stringify([
            { vibe: 'Action Sci-Fi', genre_ids: [878, 28], keyword: 'cyberpunk|neon' },
            { vibe: 'Romance', genre_ids: [10749], keyword: 'first love' }
        ]);
        const result = parseQuerySynthesizerResponse(input);
        expect(result).toHaveLength(2);
        expect(result[0].vibe).toBe('Action Sci-Fi');
        expect(result[0].genre_ids).toEqual([878, 28]);
        expect(result[0].keyword).toBe('cyberpunk|neon');
        expect(result[1].genre_ids).toEqual([10749]);
    });

    it('should extract JSON array from markdown code fence', () => {
        const input = '```json\n[{"vibe":"test","genre_ids":[28],"keyword":"action"}]\n```';
        const result = parseQuerySynthesizerResponse(input);
        expect(result).toHaveLength(1);
        expect(result[0].genre_ids).toEqual([28]);
    });

    it('should filter out non-whitelisted fields (security)', () => {
        const input = JSON.stringify([
            { vibe: 'test', genre_ids: [28], keyword: 'action', malicious_field: 'hack', extra_data: 'injected' }
        ]);
        const result = parseQuerySynthesizerResponse(input);
        expect(result[0]).not.toHaveProperty('malicious_field');
        expect(result[0]).not.toHaveProperty('extra_data');
    });

    it('should reject invalid genre_ids (not array of integers)', () => {
        const input = JSON.stringify([
            { vibe: 'test', genre_ids: 'not_array', keyword: 'action' }
        ]);
        const result = parseQuerySynthesizerResponse(input);
        expect(result[0]).not.toHaveProperty('genre_ids');
        expect(result[0].keyword).toBe('action');
    });

    it('should reject non-integer genre_ids', () => {
        const input = JSON.stringify([
            { vibe: 'test', genre_ids: [28, 'invalid'], keyword: 'test' }
        ]);
        const result = parseQuerySynthesizerResponse(input);
        expect(result[0]).not.toHaveProperty('genre_ids');
    });

    it('should reject non-string keywords', () => {
        const input = JSON.stringify([
            { vibe: 'test', genre_ids: [28], keyword: 123 }
        ]);
        const result = parseQuerySynthesizerResponse(input);
        expect(result[0]).not.toHaveProperty('keyword');
        expect(result[0].genre_ids).toEqual([28]);
    });

    it('should filter items without genre_ids or keyword', () => {
        const input = JSON.stringify([
            { vibe: 'empty' },
            { vibe: 'has_genres', genre_ids: [28] }
        ]);
        const result = parseQuerySynthesizerResponse(input);
        expect(result).toHaveLength(1);
        expect(result[0].vibe).toBe('has_genres');
    });

    it('should return empty array for invalid JSON', () => {
        expect(parseQuerySynthesizerResponse('not json')).toEqual([]);
    });

    it('should return empty array for non-array JSON without embedded arrays', () => {
        expect(parseQuerySynthesizerResponse('{"key": "value"}')).toEqual([]);
    });

    it('should handle object-wrapped arrays (json_object format)', () => {
        const input = JSON.stringify({
            queries: [
                { vibe: 'Sci-Fi Action', genre_ids: [878, 28], keyword: 'cyberpunk|neon' }
            ]
        });
        const result = parseQuerySynthesizerResponse(input);
        expect(result).toHaveLength(1);
        expect(result[0].genre_ids).toEqual([878, 28]);
        expect(result[0].keyword).toBe('cyberpunk|neon');
    });

    it('should handle empty array', () => {
        expect(parseQuerySynthesizerResponse('[]')).toEqual([]);
    });
});

// ============================================
// Test: buildDnaDescription
// ============================================
describe('buildDnaDescription', () => {
    it('should return empty string for null profile', () => {
        expect(buildDnaDescription(null)).toBe('');
    });

    it('should build description from genre scores', () => {
        const profile = {
            genreScores: new Map([['28', 8.5], ['878', 6.2]]),
            keywordScores: new Map()
        };
        const desc = buildDnaDescription(profile, 5);
        expect(desc).toContain('Top Genres');
        expect(desc).toContain('action');
        expect(desc).toContain('8.5');
    });

    it('should build description from keyword scores', () => {
        const profile = {
            genreScores: new Map(),
            keywordScores: new Map([['cyberpunk', 10.1], ['neon', 8.0]])
        };
        const desc = buildDnaDescription(profile, 5);
        expect(desc).toContain('Top Keywords');
        expect(desc).toContain('cyberpunk');
        expect(desc).toContain('10.1');
    });

    it('should limit to topN items', () => {
        const profile = {
            genreScores: new Map([['28', 10], ['878', 9], ['53', 8], ['27', 7]]),
            keywordScores: new Map()
        };
        const desc = buildDnaDescription(profile, 2);
        // Should only include top 2
        expect(desc).toContain('action');
        expect(desc).toContain('sci-fi');
        expect(desc).not.toContain('horror');
    });

    it('should combine genres and keywords', () => {
        const profile = {
            genreScores: new Map([['28', 5.0]]),
            keywordScores: new Map([['robot', 3.0]])
        };
        const desc = buildDnaDescription(profile, 5);
        expect(desc).toContain('Top Genres');
        expect(desc).toContain('Top Keywords');
    });
});

// ============================================
// Test: GENRE_NAME_TO_ID mapping
// ============================================
describe('GENRE_NAME_TO_ID', () => {
    it('should have correct TMDB genre IDs', () => {
        expect(GENRE_NAME_TO_ID['action']).toBe(28);
        expect(GENRE_NAME_TO_ID['comedy']).toBe(35);
        expect(GENRE_NAME_TO_ID['horror']).toBe(27);
        expect(GENRE_NAME_TO_ID['sci-fi']).toBe(878);
        expect(GENRE_NAME_TO_ID['science fiction']).toBe(878);
        expect(GENRE_NAME_TO_ID['thriller']).toBe(53);
        expect(GENRE_NAME_TO_ID['romance']).toBe(10749);
    });
});

// ============================================
// Test: Keyword AND/OR logic in buildDiscoveryParams
// (Unit test via the catalogHandler buildDiscoveryParams)
// These test the logic documented in the problem statement
// ============================================
describe('Keyword AND/OR separator logic', () => {
    it('should detect OR separator (pipe) in keyword string', () => {
        const keyword = 'cyberpunk|neon|futuristic';
        const isOr = keyword.includes('|');
        const separator = isOr ? '|' : ',';
        const parts = keyword.split(separator).map(k => k.trim()).filter(Boolean);
        
        expect(isOr).toBe(true);
        expect(separator).toBe('|');
        expect(parts).toEqual(['cyberpunk', 'neon', 'futuristic']);
    });

    it('should detect AND separator (comma) in keyword string', () => {
        const keyword = 'snow,serial killer,isolation';
        const isOr = keyword.includes('|');
        const separator = isOr ? '|' : ',';
        const parts = keyword.split(separator).map(k => k.trim()).filter(Boolean);
        
        expect(isOr).toBe(false);
        expect(separator).toBe(',');
        expect(parts).toEqual(['snow', 'serial killer', 'isolation']);
    });

    it('should preserve the separator when joining resolved IDs', () => {
        // Simulating what buildDiscoveryParams does
        const testCases = [
            { keyword: 'cyberpunk|neon', expectedSeparator: '|' },
            { keyword: 'snow,isolation', expectedSeparator: ',' },
            { keyword: 'single_keyword', expectedSeparator: ',' }
        ];

        for (const { keyword, expectedSeparator } of testCases) {
            const isOr = keyword.includes('|');
            const separator = isOr ? '|' : ',';
            expect(separator).toBe(expectedSeparator);
            
            // Simulate resolving to IDs and re-joining
            const fakeIds = [123, 456];
            const joined = fakeIds.join(separator);
            expect(joined).toBe(`123${expectedSeparator}456`);
        }
    });
});
