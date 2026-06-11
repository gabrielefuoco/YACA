const scoringEngine = require('../src/engines/hybrid/scoringEngine');
const tmdb = require('../src/clients/tmdb');
const TmdbScoringData = require('../src/models/TmdbScoringData');
const ProfileScorer = require('../src/profile/ProfileScorer');

jest.mock('../src/clients/tmdb');
jest.mock('../src/models/TmdbScoringData', () => ({
    updateOne: jest.fn(),
    find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) }))
}));

jest.mock('../src/profile/ProfileScorer', () => ({
    calculateLightScore: jest.fn(() => 5),
    calculateItemMatch: jest.fn(() => 8)
}));

jest.mock('../src/utils/helpers', () => ({
    getProfileDnaFilters: jest.fn(() => [])
}));

describe('scoringEngine', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('extractVectorByPrefix', () => {
        it('should extract values by prefix', () => {
            const vFinal = { 'g:28': 100, 'g:12': 50, 'k:100': 80 };
            const result = scoringEngine.extractVectorByPrefix(vFinal, 'g');
            expect(result).toEqual({ '28': 100, '12': 50 });
        });

        it('should return empty object for invalid input', () => {
            expect(scoringEngine.extractVectorByPrefix(null, 'g')).toEqual({});
        });
    });

    describe('computeTopGenres', () => {
        it('should return top N genres based on score', () => {
            const profile = { compiledVectors: { V_final: { 'g:28': 100, 'g:12': 50, 'g:16': 200 } } };
            const result = scoringEngine.computeTopGenres(profile, 2);
            expect(result).toEqual(['16', '28']);
        });

        it('should boost genres from dnaFilters', () => {
            const profile = { compiledVectors: { V_final: { 'g:28': 100 } } };
            const helpers = require('../src/utils/helpers');
            helpers.getProfileDnaFilters.mockReturnValueOnce([{ type: 'genre', id: '16' }]);
            
            const result = scoringEngine.computeTopGenres(profile, 2);
            expect(result).toEqual(expect.arrayContaining(['16', '28']));
        });
    });

    describe('computeTopKeywords', () => {
        it('should return top N keywords', () => {
            const profile = { compiledVectors: { V_final: { 'k:100': 100, 'k:200': 50, 'k:300': 200 } } };
            const result = scoringEngine.computeTopKeywords(profile, 2);
            expect(result).toEqual(['300', '100']);
        });
    });

    describe('extractDNAParams', () => {
        it('should map manual DNA to TMDB parameters', () => {
            const manualDNA = [
                { type: 'genre', id: 28 },
                { type: 'keyword', id: 100 },
                { type: 'country', id: 'US' }
            ];
            const result = scoringEngine.extractDNAParams(manualDNA);
            expect(result).toEqual({
                with_genres: '28',
                with_keywords: '100',
                with_origin_country: 'US'
            });
        });
    });

    describe('resolveAiQueryToTmdbParams', () => {
        it('should resolve keywords to IDs', async () => {
            tmdb.getTmdbIdByName.mockResolvedValueOnce(1234);
            const aiQuery = { genre_ids: [28], keyword: 'cyberpunk' };
            
            const result = await scoringEngine.resolveAiQueryToTmdbParams(aiQuery, 'key', 'movie');
            expect(result.with_genres).toBe('28');
            expect(result.with_keywords).toBe('1234');
        });
    });

    describe('saveScoringData', () => {
        it('should save data to TmdbScoringData', async () => {
            const tmdbDetails = { id: 1, genre_ids: [28] };
            await scoringEngine.saveScoringData(tmdbDetails, 'movie');
            expect(TmdbScoringData.updateOne).toHaveBeenCalled();
        });
    });

    describe('twoTierScore', () => {
        it('should filter top 50% using lightScore and enrich using itemMatch', async () => {
            const pool = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
            // Math.ceil(4/2) = 2 survivors
            tmdb.getTmdbMovieDetails.mockResolvedValue({ id: 1 });
            
            const result = await scoringEngine.twoTierScore(pool, {}, { tmdbApiKey: 'key', types: 'movie' });
            expect(result.length).toBe(2);
            expect(ProfileScorer.calculateLightScore).toHaveBeenCalledTimes(4);
            expect(ProfileScorer.calculateItemMatch).toHaveBeenCalledTimes(2);
        });
    });
});
