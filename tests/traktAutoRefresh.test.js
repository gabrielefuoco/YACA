jest.mock('../src/utils/httpClient', () => ({
    createAxiosInstance: () => ({
        get: jest.fn()
    })
}));

const axios = require('axios');
jest.mock('axios');

// Must require after mocks are set up
const { refreshTraktTokens, syncTraktTokensToStremio } = require('../src/clients/trakt');
const UserConfig = require('../src/models/UserConfig');

describe('Trakt Auto-Refresh', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...ORIGINAL_ENV,
            TRAKT_CLIENT_ID: 'test_client_id',
            TRAKT_CLIENT_SECRET: 'test_client_secret'
        };
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    describe('refreshTraktTokens', () => {
        it('returns new tokens on successful refresh', async () => {
            axios.post.mockResolvedValueOnce({
                data: {
                    access_token: 'new_access_token',
                    refresh_token: 'new_refresh_token',
                    token_type: 'Bearer',
                    expires_in: 7776000
                }
            });

            const result = await refreshTraktTokens('old_refresh_token');

            expect(result).toEqual({
                access_token: 'new_access_token',
                refresh_token: 'new_refresh_token'
            });

            expect(axios.post).toHaveBeenCalledWith(
                'https://api.trakt.tv/oauth/token',
                expect.objectContaining({
                    refresh_token: 'old_refresh_token',
                    client_id: 'test_client_id',
                    client_secret: 'test_client_secret',
                    grant_type: 'refresh_token'
                }),
                expect.any(Object)
            );
        });

        it('returns null if refresh fails', async () => {
            axios.post.mockRejectedValueOnce(new Error('Network error'));

            const result = await refreshTraktTokens('old_refresh_token');
            expect(result).toBeNull();
        });

        it('returns null if no refresh token provided', async () => {
            const result = await refreshTraktTokens(null);
            expect(result).toBeNull();
        });

        it('returns null if no client_id in env', async () => {
            delete process.env.TRAKT_CLIENT_ID;
            const result = await refreshTraktTokens('old_refresh_token');
            expect(result).toBeNull();
        });

        it('returns null if no client_secret in env', async () => {
            delete process.env.TRAKT_CLIENT_SECRET;
            const result = await refreshTraktTokens('old_refresh_token');
            expect(result).toBeNull();
        });

        it('returns null if response lacks tokens', async () => {
            axios.post.mockResolvedValueOnce({ data: {} });

            const result = await refreshTraktTokens('old_refresh_token');
            expect(result).toBeNull();
        });
    });

    describe('syncTraktTokensToStremio', () => {
        it('returns new access token even without stremioAuthKey', async () => {
            const userConfig = {
                apiKeys: { trakt: 'old_token', traktRefreshToken: 'old_refresh' }
            };

            const result = await syncTraktTokensToStremio(userConfig, 'new_access', 'new_refresh', 'https://example.com');
            expect(result).toBe('new_access');
        });

        it('syncs with Stremio when stremioAuthKey is present', async () => {
            const userConfig = {
                apiKeys: {
                    tmdb: 'tmdb_key',
                    trakt: 'old_token',
                    traktRefreshToken: 'old_refresh',
                    stremioAuthKey: 'stremio_key'
                },
                catalogs: [],
                profiles: [],
                configVersion: 'v1'
            };

            // Mock addonCollectionGet
            axios.post.mockResolvedValueOnce({
                data: {
                    result: {
                        addons: [{
                            manifest: { id: 'org.stremio.yaca.catalog' },
                            transportUrl: 'https://example.com/old/manifest.json'
                        }]
                    }
                }
            });

            // Mock manifest GET
            axios.get.mockResolvedValueOnce({
                data: { id: 'org.stremio.yaca.catalog', version: '1.0.2' }
            });

            // Mock addonCollectionSet
            axios.post.mockResolvedValueOnce({
                data: { result: { success: true } }
            });

            const result = await syncTraktTokensToStremio(userConfig, 'new_access', 'new_refresh', 'https://example.com');
            expect(result).toBe('new_access');

            // Verify addonCollectionGet was called
            expect(axios.post).toHaveBeenCalledWith(
                'https://api.strem.io/api/addonCollectionGet',
                expect.objectContaining({ authKey: 'stremio_key' }),
                expect.any(Object)
            );

            // Verify addonCollectionSet was called
            expect(axios.post).toHaveBeenCalledWith(
                'https://api.strem.io/api/addonCollectionSet',
                expect.objectContaining({ authKey: 'stremio_key' }),
                expect.any(Object)
            );
        });

        it('builds new payload with updated tokens', async () => {
            const userConfig = {
                apiKeys: {
                    tmdb: 'tmdb_key',
                    trakt: 'old_token',
                    traktRefreshToken: 'old_refresh',
                    stremioAuthKey: 'stremio_key'
                },
                catalogs: [],
                profiles: [],
                configVersion: 'v1'
            };

            // Mock addonCollectionGet
            axios.post.mockResolvedValueOnce({
                data: { result: { addons: [] } }
            });

            // Mock manifest GET - capture the URL to verify new payload
            let capturedManifestUrl = null;
            axios.get.mockImplementationOnce((url) => {
                capturedManifestUrl = url;
                return Promise.resolve({
                    data: { id: 'org.stremio.yaca.catalog', version: '1.0.2' }
                });
            });

            // Mock addonCollectionSet
            axios.post.mockResolvedValueOnce({
                data: { result: { success: true } }
            });

            await syncTraktTokensToStremio(userConfig, 'new_access', 'new_refresh', 'https://example.com');

            // Verify the manifest URL contains a valid Base64 config
            expect(capturedManifestUrl).toMatch(/^https:\/\/example\.com\/.+\/manifest\.json$/);

            // Decode the Base64 config and verify tokens are updated
            const base64Part = capturedManifestUrl.replace('https://example.com/', '').replace('/manifest.json', '');
            const decoded = UserConfig.decodeConfig(base64Part);
            expect(decoded).not.toBeNull();
            expect(decoded.apiKeys.trakt).toBe('new_access');
            expect(decoded.apiKeys.traktRefreshToken).toBe('new_refresh');
        });
    });

    describe('configure route - traktRefreshToken persistence', () => {
        beforeEach(() => {
            jest.resetModules();
            jest.clearAllMocks();
        });

        it('stores traktRefreshToken in apiKeys', async () => {
            jest.doMock('../src/models/UserConfig', () => ({
                buildConfig: jest.fn().mockReturnValue({ config: {}, configBase64: 'abc123', configVersion: 'cv1' }),
                encodeConfig: jest.fn(),
                decodeConfig: jest.fn()
            }));
            jest.doMock('../src/ai/router', () => ({
                generateTmdbFiltersFromPrompt: jest.fn()
            }));
            jest.doMock('../src/data/presets', () => ({
                getPresets: () => []
            }));

            const configureRoute = require('../src/api/configure');
            const MockUserConfig = require('../src/models/UserConfig');

            const req = {
                body: {
                    tmdbKey: 'tmdb_key',
                    traktToken: 'access_token',
                    traktRefreshToken: 'refresh_token',
                    stremioAuthKey: 'stremio_key',
                    activeProfileId: 'p1',
                    profiles: [{
                        id: 'p1', name: 'Test', selectedPresets: [],
                        existingCatalogs: [], newPrompts: []
                    }]
                }
            };
            const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

            await configureRoute(req, res);

            expect(MockUserConfig.buildConfig).toHaveBeenCalledWith(expect.objectContaining({
                apiKeys: expect.objectContaining({
                    trakt: 'access_token',
                    traktRefreshToken: 'refresh_token'
                })
            }));
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });
    });
});
