const UserConfig = require('../src/models/UserConfig');
const User = require('../src/models/User');

jest.mock('../src/models/User');

describe('UserConfig Key Deletion Regression', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should correctly trigger $unset when apiKeys are set to null or empty string', async () => {
        const userId = 'test-user';
        const existingUser = {
            userId,
            apiKeys: { tmdb: 'old-key', mistral: 'mistral-key' },
            config: { configVersion: 'v1' },
            toObject: jest.fn().mockReturnValue({
                userId,
                apiKeys: { tmdb: 'old-key', mistral: 'mistral-key' },
                config: { configVersion: 'v1' }
            })
        };

        // Mock getUser (which calls findOne)
        User.findOne.mockResolvedValue(existingUser);
        
        // Mock findOneAndUpdate
        User.findOneAndUpdate.mockResolvedValue({
            userId,
            apiKeys: { mistral: 'mistral-key' }, // tmdb should be gone
            config: { configVersion: 'v2' }
        });

        // Simulating the user clearing the TMDB key
        const updateData = {
            userId,
            apiKeys: { tmdb: null },
            config: { configVersion: 'v1' }
        };

        await UserConfig.saveUser(updateData);

        // Verify findOneAndUpdate was called with $unset for apiKeys.tmdb
        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ userId }),
            expect.objectContaining({
                $unset: { 'apiKeys.tmdb': 1 }
            }),
            expect.any(Object)
        );
    });

    it('should NOT trigger $unset when tokens are undefined (frontend-safe behavior)', async () => {
        const userId = 'test-user';
        const existingUser = {
            userId,
            apiKeys: { trakt: 'existing-trakt' },
            config: { configVersion: 'v1' },
            toObject: jest.fn().mockReturnValue({
                userId,
                apiKeys: { trakt: 'existing-trakt' },
                config: { configVersion: 'v1' }
            })
        };

        User.findOne.mockResolvedValue(existingUser);
        User.findOneAndUpdate.mockResolvedValue(existingUser);

        // Simulating the LoginPage completion where tokens are undefined (newTraktToken ?? undefined)
        const updateData = {
            userId,
            apiKeys: { trakt: undefined },
            config: { configVersion: 'v1' }
        };

        await UserConfig.saveUser(updateData);

        // Verify findOneAndUpdate does NOT have $unset for trakt
        const call = User.findOneAndUpdate.mock.calls[0];
        const updateDoc = call[1];
        
        expect(updateDoc.$unset).toBeUndefined();
    });
});
