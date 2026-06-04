const ProfileBuilder = require('../src/profile/ProfileBuilder');
const TasteProfile = require('../src/models/TasteProfile');
const WatchHistory = require('../src/models/WatchHistory');
const TmdbScoringData = require('../src/models/TmdbScoringData');

jest.mock('../src/models/TasteProfile');
jest.mock('../src/models/WatchHistory');
jest.mock('../src/models/TmdbScoringData');

describe('ProfileBuilder', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('appendToHistory', () => {
        it('should append item to WatchHistory and call updateVectorsAsync', async () => {
            WatchHistory.findOneAndUpdate.mockResolvedValue({});
            
            // Mock _updateVectorsAsync to not throw error
            const spy = jest.spyOn(ProfileBuilder, '_updateVectorsAsync').mockResolvedValue();

            await ProfileBuilder.appendToHistory('user123', 'global', {
                tmdbId: 123,
                type: 'movie'
            });

            expect(WatchHistory.findOneAndUpdate).toHaveBeenCalledWith(
                { owner: 'user123', context: 'global', tmdbId: 123 },
                expect.any(Object),
                expect.any(Object)
            );
            expect(spy).toHaveBeenCalledWith('user123', 'global', 123, 'movie');
            
            spy.mockRestore();
        });
    });
});
