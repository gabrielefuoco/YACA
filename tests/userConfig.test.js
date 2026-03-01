const UserConfig = require('../src/models/UserConfig');

describe('UserConfig.encodeConfig / decodeConfig', () => {
    it('round-trips a config object through encode and decode', () => {
        const config = { apiKeys: { tmdb: 'key1' }, catalogs: [], profiles: [], activeProfileId: null };
        const encoded = UserConfig.encodeConfig(config);
        expect(typeof encoded).toBe('string');
        const decoded = UserConfig.decodeConfig(encoded);
        expect(decoded).toEqual(config);
    });

    it('returns null for invalid base64', () => {
        expect(UserConfig.decodeConfig('not-valid-base64!!!')).toBeNull();
    });

    it('returns null when decoded JSON has no apiKeys', () => {
        const encoded = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');
        expect(UserConfig.decodeConfig(encoded)).toBeNull();
    });

    it('returns null for non-JSON base64', () => {
        const encoded = Buffer.from('just plain text').toString('base64url');
        expect(UserConfig.decodeConfig(encoded)).toBeNull();
    });
});

describe('UserConfig.buildConfig', () => {
    it('builds config with configBase64 and configVersion', () => {
        const input = {
            apiKeys: { tmdb: 'key1' },
            catalogs: [{ id: 'c1' }],
            profiles: [{ id: 'p1', name: 'Test' }],
            activeProfileId: 'p1'
        };
        const { config, configBase64, configVersion } = UserConfig.buildConfig(input);

        expect(config.apiKeys).toEqual(input.apiKeys);
        expect(config.catalogs).toEqual(input.catalogs);
        expect(config.profiles).toEqual(input.profiles);
        expect(config.activeProfileId).toBe('p1');
        expect(config.configVersion).toBe(configVersion);
        expect(typeof configBase64).toBe('string');

        // configBase64 should decode back to the config
        const decoded = UserConfig.decodeConfig(configBase64);
        expect(decoded).toEqual(config);
    });

    it('generates a configVersion string', () => {
        const { configVersion } = UserConfig.buildConfig({
            apiKeys: { tmdb: 'k' }, catalogs: [], profiles: [], activeProfileId: null
        });
        expect(typeof configVersion).toBe('string');
        expect(configVersion.length).toBeGreaterThan(0);
    });
});
