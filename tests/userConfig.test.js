const UserConfig = require('../src/models/UserConfig');
const zlib = require('zlib');

describe('UserConfig.encodeConfig / decodeConfig', () => {
    it('round-trips a config object through encode and decode', () => {
        const config = { apiKeys: { tmdb: 'key1' }, catalogs: [], profiles: [], activeProfileId: null };
        const encoded = UserConfig.encodeConfig(config);
        expect(typeof encoded).toBe('string');
        const decoded = UserConfig.decodeConfig(encoded);
        expect(decoded).toEqual(config);
    });

    it('encoded string starts with c1 prefix (compressed format)', () => {
        const config = { apiKeys: { tmdb: 'key1' }, profiles: [], activeProfileId: null };
        const encoded = UserConfig.encodeConfig(config);
        expect(encoded.startsWith('c1')).toBe(true);
    });

    it('compressed config is smaller than legacy base64 for large configs', () => {
        const config = {
            apiKeys: { tmdb: 'key1' },
            profiles: Array.from({ length: 10 }, (_, i) => ({
                id: `prof_${i}`, name: `Profile ${i}`,
                catalogs: Array.from({ length: 5 }, (_, j) => ({ id: `cat_${i}_${j}`, name: `Catalog ${j}`, type: 'movie', filters: { sort_by: 'popularity.desc', 'primary_release_date.gte': '2020-01-01' } }))
            })),
            activeProfileId: 'prof_0'
        };
        const compressed = UserConfig.encodeConfig(config);
        const legacy = Buffer.from(JSON.stringify(config)).toString('base64url');
        expect(compressed.length).toBeLessThan(legacy.length);
    });

    it('falls back to legacy decode for uncompressed base64', () => {
        const config = { apiKeys: { tmdb: 'legacy_key' }, profiles: [], activeProfileId: null };
        const legacyEncoded = Buffer.from(JSON.stringify(config)).toString('base64url');
        const decoded = UserConfig.decodeConfig(legacyEncoded);
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

    it('returns null for invalid compressed data with c1 prefix', () => {
        expect(UserConfig.decodeConfig('c1not_valid_compressed_data')).toBeNull();
    });
});

describe('UserConfig.buildConfig', () => {
    it('builds config with configBase64 and configVersion, omitting top-level catalogs when profiles present', () => {
        const input = {
            apiKeys: { tmdb: 'key1' },
            catalogs: [{ id: 'c1' }],
            profiles: [{ id: 'p1', name: 'Test' }],
            activeProfileId: 'p1'
        };
        const { config, configBase64, configVersion } = UserConfig.buildConfig(input);

        expect(config.apiKeys).toEqual(input.apiKeys);
        expect(config.catalogs).toBeUndefined(); // omitted when profiles present
        expect(config.profiles).toEqual(input.profiles);
        expect(config.activeProfileId).toBe('p1');
        expect(config.configVersion).toBe(configVersion);
        expect(typeof configBase64).toBe('string');
        expect(configBase64.startsWith('c1')).toBe(true);

        // configBase64 should decode back to the config
        const decoded = UserConfig.decodeConfig(configBase64);
        expect(decoded).toEqual(config);
    });

    it('includes top-level catalogs when profiles is absent', () => {
        const input = {
            apiKeys: { tmdb: 'key1' },
            catalogs: [{ id: 'c1' }],
            profiles: [],
            activeProfileId: null
        };
        const { config } = UserConfig.buildConfig(input);
        expect(config.catalogs).toEqual(input.catalogs);
    });

    it('generates a configVersion string', () => {
        const { configVersion } = UserConfig.buildConfig({
            apiKeys: { tmdb: 'k' }, catalogs: [], profiles: [], activeProfileId: null
        });
        expect(typeof configVersion).toBe('string');
        expect(configVersion.length).toBeGreaterThan(0);
    });
});
