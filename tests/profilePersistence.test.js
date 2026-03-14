const UserConfig = require('../src/models/UserConfig');
const User = require('../src/models/User');

// Mock User model
jest.mock('../src/models/User');

describe('Profile Persistence', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should preserve catalogs and raw_ui_state in profiles', async () => {
        const userId = 'user123';
        const existingUser = {
            userId,
            apiKeys: {},
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

        // Mock findOne to return existing user
        User.findOne.mockReturnValue({
            exec: jest.fn().mockResolvedValue(existingUser)
        });

        // Mock findOneAndUpdate to return the "saved" doc
        User.findOneAndUpdate.mockReturnValue({
            exec: jest.fn().mockResolvedValue({
                ...existingUser,
                profiles: incomingData.profiles
            })
        });

        const savedUser = await UserConfig.saveUser(incomingData);

        // Verify findOneAndUpdate was called with the correct data
        const updateCall = User.findOneAndUpdate.mock.calls[0][1];
        
        expect(updateCall.$set.profiles).toBeDefined();
        const savedProfile = updateCall.$set.profiles[0];
        
        expect(savedProfile.id).toBe('global');
        expect(savedProfile.catalogs).toEqual(incomingData.profiles[0].catalogs);
        expect(savedProfile.raw_ui_state).toEqual(incomingData.profiles[0].raw_ui_state);
        expect(savedProfile.settings.minVoteAverage).toBe(5);
    });
});
