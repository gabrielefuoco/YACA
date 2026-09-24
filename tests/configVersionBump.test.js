const UserConfig = require('../src/models/UserConfig');
const UserAccount = require('../src/db/models/UserAccount');
const AddonConfig = require('../src/db/models/AddonConfig');
const { buildManifestFingerprint } = require('../src/utils/manifestFingerprint');

jest.mock('../src/db/models/UserAccount');
jest.mock('../src/db/models/AddonConfig');
jest.mock('nanoid', () => ({
    nanoid: jest.fn(() => 'generated-version')
}));

function makeManifestConfig(overrides = {}) {
    return {
        activeProfileId: 'profile-a',
        profiles: [
            {
                id: 'global',
                name: 'Generale',
                catalogs: [],
                raw_ui_state: { selectedPresets: [], catalogOrder: [] },
                settings: { typeSelectors: { film: false, serie: false, anime: null }, kidsMode: false }
            },
            {
                id: 'profile-a',
                name: 'Profilo A',
                catalogs: [{ id: 'movie-one', name: 'Film uno', type: 'movie', isAnime: false }],
                raw_ui_state: { selectedPresets: [], catalogOrder: ['movie-one'] },
                settings: { typeSelectors: { film: true, serie: true, anime: null }, kidsMode: false }
            },
            {
                id: 'profile-b',
                name: 'Profilo B',
                catalogs: [{ id: 'anime-one', name: 'Anime uno', type: 'anime', isAnime: true }],
                raw_ui_state: { selectedPresets: [], catalogOrder: ['anime-one'] },
                settings: { typeSelectors: { film: false, serie: false, anime: 'only' }, kidsMode: true }
            }
        ],
        customCatalogs: [],
        ...overrides
    };
}

describe('UserConfig manifest configVersion', () => {
    let existingConfig;
    let existingAccount;

    beforeEach(() => {
        jest.clearAllMocks();

        const manifestConfig = makeManifestConfig();
        existingConfig = {
            uuid: 'addon-test',
            profiles: manifestConfig.profiles,
            customCatalogs: manifestConfig.customCatalogs,
            config: {
                activeProfileId: manifestConfig.activeProfileId,
                configVersion: 'version-one',
                manifestFingerprint: buildManifestFingerprint(manifestConfig)
            }
        };
        existingAccount = {
            userId: 'user-test',
            addonUuid: 'addon-test',
            apiKeys: { tmdb: 'old-key' }
        };

        UserAccount.findOne.mockResolvedValue(existingAccount);
        AddonConfig.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue(existingConfig)
        });
        UserAccount.findOneAndUpdate.mockImplementation(async (_query, update) => ({
            ...existingAccount,
            apiKeys: {
                ...existingAccount.apiKeys,
                ...Object.fromEntries(
                    Object.entries(update.$set || {})
                        .filter(([key]) => key.startsWith('apiKeys.'))
                        .map(([key, value]) => [key.slice('apiKeys.'.length), value])
                )
            }
        }));
        AddonConfig.findOneAndUpdate.mockImplementation(async (_query, update) => {
            const nextConfig = { ...existingConfig.config };
            for (const [key, value] of Object.entries(update.$set || {})) {
                if (key.startsWith('config.')) nextConfig[key.slice('config.'.length)] = value;
            }
            return {
                ...existingConfig,
                profiles: update.$set?.profiles ?? existingConfig.profiles,
                customCatalogs: update.$set?.customCatalogs ?? existingConfig.customCatalogs,
                config: nextConfig
            };
        });
    });

    it('keeps configVersion for API-key-only saves and establishes a legacy baseline', async () => {
        const legacyFingerprint = existingConfig.config.manifestFingerprint;
        delete existingConfig.config.manifestFingerprint;

        const result = await UserConfig.saveUser({
            userId: 'user-test',
            apiKeys: { tmdb: 'new-key' }
        });

        const configUpdate = AddonConfig.findOneAndUpdate.mock.calls[0][1].$set;
        expect(configUpdate['config.configVersion']).toBe('version-one');
        expect(configUpdate['config.manifestFingerprint']).toBe(legacyFingerprint);
        expect(result.config.configVersion).toBe('version-one');
    });

    it('keeps configVersion when a resave changes only non-manifest data', async () => {
        const incomingProfiles = JSON.parse(JSON.stringify(existingConfig.profiles));
        incomingProfiles[1].catalogs[0].filters = { genres: [18] };
        incomingProfiles[1].dna = { genres: { drama: 999 } };
        incomingProfiles[1].settings.scoringWeights = { action: 999 };
        incomingProfiles[1].settings.tmdbKey = 'profile-key';

        const result = await UserConfig.saveUser({
            userId: 'user-test',
            profiles: incomingProfiles
        });

        const configUpdate = AddonConfig.findOneAndUpdate.mock.calls[0][1].$set;
        expect(configUpdate['config.configVersion']).toBe('version-one');
        expect(result.config.configVersion).toBe('version-one');
    });

    it('creates a new configVersion when type selectors change', async () => {
        const incomingProfiles = JSON.parse(JSON.stringify(existingConfig.profiles));
        incomingProfiles[1].settings.typeSelectors.anime = 'exclude';

        const result = await UserConfig.saveUser({
            userId: 'user-test',
            profiles: incomingProfiles
        });

        const configUpdate = AddonConfig.findOneAndUpdate.mock.calls[0][1].$set;
        expect(configUpdate['config.configVersion']).toBe('generated-version');
        expect(configUpdate['config.manifestFingerprint']).not.toBe(
            existingConfig.config.manifestFingerprint
        );
        expect(result.config.configVersion).toBe('generated-version');
    });

    it('creates a new configVersion when the active profile changes', async () => {
        const result = await UserConfig.saveUser({
            userId: 'user-test',
            config: { activeProfileId: 'profile-b' }
        });

        expect(AddonConfig.findOneAndUpdate.mock.calls[0][1].$set['config.configVersion'])
            .toBe('generated-version');
        expect(result.config.configVersion).toBe('generated-version');
    });

    it('initializes a version and fingerprint for a new addon config', async () => {
        UserAccount.findOne.mockResolvedValue(null);
        UserAccount.findOneAndUpdate.mockResolvedValue({
            userId: 'new-user',
            addonUuid: 'new-addon',
            apiKeys: {}
        });
        AddonConfig.findOneAndUpdate.mockResolvedValue({
            uuid: 'new-addon',
            profiles: [],
            customCatalogs: [],
            config: {
                activeProfileId: 'global',
                configVersion: 'generated-version',
                manifestFingerprint: 'a'.repeat(64)
            }
        });

        const result = await UserConfig.saveUser({
            userId: 'new-user',
            config: { activeProfileId: 'global' }
        });

        expect(result.config.configVersion).toBe('generated-version');
        expect(result.config.manifestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    });
});
