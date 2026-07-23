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

});
