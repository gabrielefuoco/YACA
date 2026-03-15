const UserConfig = require('../src/models/UserConfig');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');

// Mock Two-Table Split models
jest.mock('../src/db/models/UserAccount');
jest.mock('../src/db/models/AddonConfig');

describe('Profile Persistence', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should preserve catalogs and raw_ui_state in profiles', async () => {
        const userId = 'user123';
        const addonUuid = 'test-addon-uuid';

        const existingAccount = {
            userId,
            addonUuid,
            apiKeys: {},
        };

        const existingConfig = {
            uuid: addonUuid,
            profiles: [
                {
                    id: 'global',
                    name: 'Generale',
                    settings: { minVoteAverage: 0 }
                }
            ],
            config: { activeProfileId: 'global', configVersion: 'abc' }
        };

        const incomingData = {
            userId,
            profiles: [
                {
                    id: 'global',
                    name: 'Generale',
                    catalogs: [{ id: 'yaca_preset_popular', name: 'Popular', type: 'movie' }],
                    raw_ui_state: {
                        selectedPresets: ['popular'],
                        catalogOrder: ['popular']
                    },
                    settings: { minVoteAverage: 5 }
                }
            ]
        };

        // Mock UserAccount.findOne to return existing account
        UserAccount.findOne.mockResolvedValue(existingAccount);

        // Mock AddonConfig.findOne with .lean() chain
        AddonConfig.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(existingConfig)
        });

        // Mock UserAccount.findOneAndUpdate to return account doc
        UserAccount.findOneAndUpdate.mockResolvedValue({
            ...existingAccount,
            toObject: jest.fn().mockReturnValue(existingAccount)
        });

        // Mock AddonConfig.findOneAndUpdate to return the "saved" config
        AddonConfig.findOneAndUpdate.mockResolvedValue({
            ...existingConfig,
            profiles: incomingData.profiles,
            toObject: jest.fn().mockReturnValue({
                ...existingConfig,
                profiles: incomingData.profiles
            })
        });

        const savedUser = await UserConfig.saveUser(incomingData);

        // Verify AddonConfig.findOneAndUpdate was called with the correct profiles
        const updateCall = AddonConfig.findOneAndUpdate.mock.calls[0][1];

        expect(updateCall.$set.profiles).toBeDefined();
        const savedProfile = updateCall.$set.profiles[0];

        expect(savedProfile.id).toBe('global');
        expect(savedProfile.catalogs).toEqual(incomingData.profiles[0].catalogs);
        expect(savedProfile.raw_ui_state).toEqual(incomingData.profiles[0].raw_ui_state);
        expect(savedProfile.settings.minVoteAverage).toBe(5);
    });
});
