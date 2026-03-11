jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'mock-id') }));

jest.mock('../src/db/models/User', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    hashValue: jest.fn((v) => v ? `hash_${v}` : null)
}));

const User = require('../src/db/models/User');
const UserConfig = require('../src/models/UserConfig');

describe('UserConfig.saveUser pending DNA preservation', () => {
    beforeEach(() => {
        User.findOne.mockReset();
        User.findOneAndUpdate.mockReset();
    });

    it('preserves pendingDNASuggestions when the dashboard saves profiles without that field', async () => {
        User.findOne
            .mockResolvedValueOnce({
                userId: 'user-1',
                email: 'user@test.dev',
                apiKeys: { tmdb: 'existing-key' },
                config: { activeProfileId: 'p1' },
                profiles: [{
                    id: 'p1',
                    settings: {
                        pendingDNASuggestions: [{ id: '16', type: 'genre', name: 'Genre 16' }]
                    }
                }]
            })
            .mockResolvedValueOnce(null);
        User.findOneAndUpdate.mockResolvedValue({ userId: 'user-1' });

        await UserConfig.saveUser({
            userId: 'user-1',
            email: 'user@test.dev',
            apiKeys: { tmdb: 'new-key' },
            config: { activeProfileId: 'p1' },
            profiles: [{
                id: 'p1',
                settings: {
                    manualDNA: [],
                    suggestedDNA: []
                }
            }]
        });

        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'user-1' },
            expect.objectContaining({
                $set: expect.objectContaining({
                    profiles: [
                        expect.objectContaining({
                            id: 'p1',
                            settings: expect.objectContaining({
                                pendingDNASuggestions: [{ id: '16', type: 'genre', name: 'Genre 16' }]
                            })
                        })
                    ]
                })
            }),
            expect.any(Object)
        );
    });

    it('preserves mistral and tmdb api keys when incoming values are empty', async () => {
        User.findOne
            .mockResolvedValueOnce({
                userId: 'user-1',
                email: 'user@test.dev',
                apiKeys: {
                    tmdb: 'existing-tmdb-key',
                    mistral: 'existing-mistral-key',
                    trakt: 'existing-trakt-key'
                },
                config: { activeProfileId: 'p1' },
                profiles: []
            })
            .mockResolvedValueOnce(null);
        User.findOneAndUpdate.mockResolvedValue({ userId: 'user-1' });

        await UserConfig.saveUser({
            userId: 'user-1',
            email: 'user@test.dev',
            apiKeys: {
                tmdb: '',
                mistral: '',
                trakt: 'new-trakt-key'
            },
            config: { activeProfileId: 'p1' },
            profiles: []
        });

        expect(User.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'user-1' },
            expect.objectContaining({
                $set: expect.objectContaining({
                    apiKeys: expect.objectContaining({
                        tmdb: 'existing-tmdb-key',
                        mistral: 'existing-mistral-key',
                        trakt: 'new-trakt-key'
                    })
                })
            }),
            expect.any(Object)
        );
    });

});
