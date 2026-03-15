const UserConfig = require('../src/models/UserConfig');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');

jest.mock('../src/db/models/UserAccount');
jest.mock('../src/db/models/AddonConfig');

describe('UserConfig Key Deletion Regression', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should correctly trigger $unset when apiKeys are set to null or empty string', async () => {
        const userId = 'test-user';
        const addonUuid = 'test-addon-uuid';

        const existingAccount = {
            userId,
            addonUuid,
            apiKeys: { tmdb: 'old-key', mistral: 'mistral-key' },
        };

        const existingConfig = {
            uuid: addonUuid,
            config: { configVersion: 'v1' },
            profiles: []
        };

        // Mock UserAccount.findOne (returns existing account)
        UserAccount.findOne.mockResolvedValue(existingAccount);

        // Mock AddonConfig.findOne with .lean() chain
        AddonConfig.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(existingConfig)
        });

        // Mock UserAccount.findOneAndUpdate
        UserAccount.findOneAndUpdate.mockResolvedValue({
            userId,
            addonUuid,
            apiKeys: { mistral: 'mistral-key' },
            toObject: jest.fn().mockReturnValue({
                userId,
                addonUuid,
                apiKeys: { mistral: 'mistral-key' }
            })
        });

        // Mock AddonConfig.findOneAndUpdate
        AddonConfig.findOneAndUpdate.mockResolvedValue({
            ...existingConfig,
            toObject: jest.fn().mockReturnValue(existingConfig)
        });

        // Simulating the user clearing the TMDB key
        const updateData = {
            userId,
            apiKeys: { tmdb: null },
            config: { configVersion: 'v1' }
        };

        await UserConfig.saveUser(updateData);

        // Verify UserAccount.findOneAndUpdate was called with $unset for apiKeys.tmdb
        expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ userId }),
            expect.objectContaining({
                $unset: { 'apiKeys.tmdb': 1 }
            }),
            expect.any(Object)
        );
    });

    it('should NOT trigger $unset when tokens are undefined (frontend-safe behavior)', async () => {
        const userId = 'test-user';
        const addonUuid = 'test-addon-uuid';

        const existingAccount = {
            userId,
            addonUuid,
            apiKeys: { trakt: 'existing-trakt' },
        };

        const existingConfig = {
            uuid: addonUuid,
            config: { configVersion: 'v1' },
            profiles: []
        };

        // Mock UserAccount.findOne
        UserAccount.findOne.mockResolvedValue(existingAccount);

        // Mock AddonConfig.findOne with .lean() chain
        AddonConfig.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(existingConfig)
        });

        // Mock UserAccount.findOneAndUpdate
        UserAccount.findOneAndUpdate.mockResolvedValue({
            userId,
            addonUuid,
            apiKeys: { trakt: 'existing-trakt' },
            toObject: jest.fn().mockReturnValue({
                userId,
                addonUuid,
                apiKeys: { trakt: 'existing-trakt' }
            })
        });

        // Mock AddonConfig.findOneAndUpdate
        AddonConfig.findOneAndUpdate.mockResolvedValue({
            ...existingConfig,
            toObject: jest.fn().mockReturnValue(existingConfig)
        });

        // Simulating the LoginPage completion where tokens are undefined (newTraktToken ?? undefined)
        const updateData = {
            userId,
            apiKeys: { trakt: undefined },
            config: { configVersion: 'v1' }
        };

        await UserConfig.saveUser(updateData);

        // Verify UserAccount.findOneAndUpdate does NOT have $unset for trakt
        const call = UserAccount.findOneAndUpdate.mock.calls[0];
        const updateDoc = call[1];

        expect(updateDoc.$unset).toBeUndefined();
    });
});
