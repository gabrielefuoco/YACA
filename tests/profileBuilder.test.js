const ProfileBuilder = require('../src/profile/ProfileBuilder');
const TasteProfile = require('../src/models/TasteProfile');
const WatchHistory = require('../src/library/models/WatchHistory');

jest.mock('../src/models/TasteProfile');
jest.mock('../src/library/models/WatchHistory');

describe('ProfileBuilder', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('appendToHistory', () => {
        it('should append item to WatchHistory', async () => {
            WatchHistory.findOneAndUpdate.mockResolvedValue({});

            await ProfileBuilder.appendToHistory('user123', 'global', {
                tmdbId: 123,
                type: 'movie'
            });

            expect(WatchHistory.findOneAndUpdate).toHaveBeenCalledWith(
                { owner: 'user123', context: 'global', tmdbId: 123 },
                expect.any(Object),
                expect.any(Object)
            );
        });
    });
});
