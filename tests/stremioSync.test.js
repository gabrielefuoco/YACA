const { syncAllStremioData, pushToStremioLibrary } = require('../src/utils/stremioAddon');
const { stremioClient, stremioLikesClient } = require('../src/clients/stremio');
const { syncTraktRatings } = require('../src/clients/trakt');
const UserAccount = require('../src/db/models/UserAccount');
const ProfileBuilder = require('../src/profile/ProfileBuilder');
const AddonConfig = require('../src/db/models/AddonConfig');
const TasteProfile = require('../src/models/TasteProfile');

jest.mock('../src/clients/stremio');
jest.mock('../src/clients/trakt');
jest.mock('../src/db/models/UserAccount');
jest.mock('../src/db/models/AddonConfig');
jest.mock('../src/models/TasteProfile');
jest.mock('../src/profile/ProfileBuilder');

describe('Stremio Sync Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('pushToStremioLibrary', () => {
        it('should fetch existing items and only push new ones without overwriting state', async () => {
            // Mock existing library
            stremioClient.post.mockImplementation(async (url, data) => {
                if (data.type === 'DatastoreGet') {
                    return {
                        data: {
                            result: [
                                { _id: 'tt1234567', state: { timeOffset: 5000 } }
                            ]
                        }
                    };
                }
                if (data.type === 'DatastorePut') {
                    return { data: { result: { success: true } } };
                }
                return { data: {} };
            });

            const itemsToAdd = [
                { id: 'tt1234567', name: 'Existing Movie' }, // Should be skipped
                { id: 'tt9876543', name: 'New Movie' }       // Should be added
            ];

            const result = await pushToStremioLibrary('fake_auth_key', itemsToAdd);

            expect(result.success).toBe(true);
            expect(result.added).toBe(1);

            // Verify DatastorePut only includes the new item
            expect(stremioClient.post).toHaveBeenCalledWith(
                '/api/datastorePut',
                expect.objectContaining({
                    collection: 'libraryItem',
                    changes: expect.arrayContaining([
                        expect.objectContaining({ _id: 'tt9876543', name: 'New Movie' })
                    ])
                }),
                expect.any(Object)
            );
        });

        it('should handle API errors gracefully', async () => {
            stremioClient.post.mockImplementation(async (url, data) => {
                if (data.type === 'DatastorePut') throw new Error('Network error');
                return { data: { result: [] } };
            });
            
            const result = await pushToStremioLibrary('fake_auth_key', [{ id: 'tt111' }]);
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Network error');
        });
    });

    describe('syncAllStremioData and pushToTrakt', () => {
        it('should sync stremio data and push loved/liked items to Trakt with correct ratings', async () => {
            // Mock getting addon key
            stremioLikesClient.get.mockResolvedValue({ data: 'fake_addon_key' });

            // Mock fetching catalogs
            // This is called 4 times for liked/loved movies/series
            stremioLikesClient.get.mockImplementation(async (url) => {
                if (url.includes('loved') && url.includes('movie')) {
                    return { data: { metas: [{ id: 'tt1111111', type: 'movie' }] } };
                }
                if (url.includes('liked') && url.includes('movie')) {
                    return { data: { metas: [{ id: 'tt2222222', type: 'movie' }] } };
                }
                return { data: { metas: [] } }; // Empty for others
            });

            // Mock fetchStremioLibrary
            stremioClient.post.mockResolvedValue({ data: { result: [] } });

            // Mock DB
            UserAccount.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    userId: 'user1',
                    apiKeys: { trakt: 'trakt_token' },
                    addonUuid: 'uuid123'
                })
            });

            AddonConfig.findOne.mockReturnValue({
                lean: jest.fn().mockResolvedValue({
                    uuid: 'uuid123',
                    profiles: [{ id: 'global', name: 'Global' }]
                })
            });

            AddonConfig.findOneAndUpdate.mockResolvedValue({});
            TasteProfile.findOne.mockResolvedValue({ owner: 'user1' });
            
            ProfileBuilder.syncStremioData.mockResolvedValue(true);
            syncTraktRatings.mockResolvedValue();

            const result = await syncAllStremioData('user1', 'auth_key', 'global');

            expect(result.success).toBe(true);
            
            // Verify Trakt sync called with correct ratings
            expect(syncTraktRatings).toHaveBeenCalledWith(
                'trakt_token',
                expect.arrayContaining([
                    expect.objectContaining({ rating: 10, movie: { ids: { imdb: 'tt1111111' } } }),
                    expect.objectContaining({ rating: 8, movie: { ids: { imdb: 'tt2222222' } } })
                ])
            );
        });
    });
});
