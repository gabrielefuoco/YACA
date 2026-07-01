const { processProfiles } = require('../src/api/configure/profileProcessor');
const UserConfig = require('../src/models/UserConfig');
const AddonConfig = require('../src/db/models/AddonConfig');
const UserAccount = require('../src/db/models/UserAccount');

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn()
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn()
}));

jest.mock('../src/data/presets', () => ({
    getPresets: () => [
        { id: 'preset_pop_movies', name: 'Pop Movies', type: 'movie', emoji: '🎬', category: 'General', queries: [] },
        { id: 'preset_pop_series', name: 'Pop Series', type: 'series', emoji: '📺', category: 'General', queries: [] }
    ]
}));

describe('Profile and Catalog Deduplication Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('profileProcessor: processProfiles deduplication logic', () => {
        it('should deduplicate selectedPresets and catalogOrder during processProfiles', async () => {
            const inputProfiles = [{
                id: 'global',
                name: '🏠 Generale',
                selectedPresets: ['preset_pop_movies', 'preset_pop_movies', 'preset_pop_series'],
                catalogOrder: ['yaca_preset_preset_pop_movies', 'yaca_preset_preset_pop_movies', 'yaca_preset_preset_pop_series'],
                existingCatalogs: [],
                newPrompts: []
            }];

            const warnings = [];
            const result = await processProfiles(inputProfiles, 'u1', null, warnings, null);

            expect(result).toHaveLength(1);
            const globalProfile = result[0];

            // Expect profile catalogs to be deduplicated
            const catalogIds = globalProfile.catalogs.map(c => c.id);
            expect(catalogIds).toEqual(['yaca_preset_preset_pop_movies', 'yaca_preset_preset_pop_series']);

            // Expect selectedPresets in raw_ui_state to be deduplicated
            expect(globalProfile.raw_ui_state.selectedPresets).toEqual(['preset_pop_movies', 'preset_pop_series']);

            // Expect catalogOrder in raw_ui_state to be deduplicated
            expect(globalProfile.raw_ui_state.catalogOrder).toEqual(['yaca_preset_preset_pop_movies', 'yaca_preset_preset_pop_series']);
        });

        it('should handle duplicates when selectedPresets contains hero presets and duplicate standard presets', async () => {
            const inputProfiles = [{
                id: 'prof_1',
                name: 'Anime Fan',
                selectedPresets: ['preset_pop_movies', 'yaca_true_blend_movies', 'preset_pop_movies', 'yaca_true_blend_movies'],
                catalogOrder: ['yaca_preset_preset_pop_movies', 'yaca_true_blend_movies', 'yaca_preset_preset_pop_movies'],
                existingCatalogs: [{ id: 'yaca_true_blend_movies', name: 'True Blend Movies', type: 'movie' }],
                newPrompts: []
            }];

            const warnings = [];
            const result = await processProfiles(inputProfiles, 'u1', null, warnings, null);

            const profile = result[0];

            // Catalogs should contain the resolved preset + existing catalog (no duplicates)
            const catalogIds = profile.catalogs.map(c => c.id);
            expect(catalogIds).toEqual(['yaca_true_blend_movies', 'yaca_preset_preset_pop_movies']);

            // selectedPresets should be deduplicated
            expect(profile.raw_ui_state.selectedPresets).toEqual(['preset_pop_movies', 'yaca_true_blend_movies']);

            // catalogOrder should be deduplicated
            expect(profile.raw_ui_state.catalogOrder).toEqual(['yaca_preset_preset_pop_movies', 'yaca_true_blend_movies']);
        });
    });

    describe('UserConfig.saveUser: merge and save safety', () => {
        it('should deduplicate catalogs in UserConfig.saveUser during synchronization merge', async () => {
            // Mock existing config in DB with duplicate catalogs (historical data cleanup scenario)
            const existingConfig = {
                uuid: 'uuid-1',
                profiles: [{
                    id: 'global',
                    name: 'Generale',
                    catalogs: [
                        { id: 'yaca_preset_preset_pop_movies', name: 'Pop Movies' },
                        { id: 'yaca_preset_preset_pop_movies', name: 'Pop Movies (Duplicated)' }
                    ],
                    raw_ui_state: {
                        selectedPresets: ['preset_pop_movies', 'preset_pop_movies'],
                        catalogOrder: ['yaca_preset_preset_pop_movies', 'yaca_preset_preset_pop_movies']
                    }
                }],
                config: { configVersion: 'v1' }
            };

            UserAccount.findOne.mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1' });
            UserAccount.findOneAndUpdate.mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1', apiKeys: {} });
            AddonConfig.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue(existingConfig)
            });
            AddonConfig.findOneAndUpdate.mockImplementation((query, update) => {
                const updatedDoc = {
                    uuid: 'uuid-1',
                    profiles: update.$set.profiles,
                    config: { configVersion: 'newVersion' }
                };
                return Promise.resolve(updatedDoc);
            });

            // Incoming data with a single correct profile configuration
            const incomingData = {
                userId: 'u1',
                profiles: [{
                    id: 'global',
                    name: 'Generale',
                    catalogs: [
                        { id: 'yaca_preset_preset_pop_movies', name: 'Pop Movies' },
                        { id: 'yaca_preset_preset_pop_movies', name: 'Pop Movies (Duplicated in Incoming)' }
                    ],
                    raw_ui_state: {
                        selectedPresets: ['preset_pop_movies', 'preset_pop_movies'],
                        catalogOrder: ['yaca_preset_preset_pop_movies', 'yaca_preset_preset_pop_movies']
                    }
                }]
            };

            const result = await UserConfig.saveUser(incomingData);

            expect(result.profiles).toHaveLength(1);
            const globalProfile = result.profiles[0];

            // Expect catalogs to be deduplicated
            const catalogIds = globalProfile.catalogs.map(c => c.id);
            expect(catalogIds).toEqual(['yaca_preset_preset_pop_movies']);
            expect(globalProfile.catalogs).toHaveLength(1);

            // Expect raw_ui_state fields to be deduplicated
            expect(globalProfile.raw_ui_state.selectedPresets).toEqual(['preset_pop_movies']);
            expect(globalProfile.raw_ui_state.catalogOrder).toEqual(['yaca_preset_preset_pop_movies']);
        });
    });
});
