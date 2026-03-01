const { isValidUUID, parseExtra, isValidConfigBase64 } = require('../src/utils/helpers');

describe('isValidUUID', () => {
    it('should accept valid UUIDv4', () => {
        expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
        expect(isValidUUID('')).toBe(false);
        expect(isValidUUID('not-a-uuid')).toBe(false);
        expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
        expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false);
        expect(isValidUUID('gggggggg-gggg-gggg-gggg-gggggggggggg')).toBe(false);
    });

    it('should be case insensitive', () => {
        expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
        expect(isValidUUID('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
    });
});

describe('parseExtra', () => {
    it('should return empty object for falsy input', () => {
        expect(parseExtra(null)).toEqual({});
        expect(parseExtra(undefined)).toEqual({});
        expect(parseExtra('')).toEqual({});
    });

    it('should parse single parameter', () => {
        expect(parseExtra('search=avengers')).toEqual({ search: 'avengers' });
    });

    it('should parse multiple parameters', () => {
        expect(parseExtra('search=avengers&skip=20')).toEqual({ search: 'avengers', skip: '20' });
    });

    it('should decode URI components', () => {
        expect(parseExtra('search=hello%20world')).toEqual({ search: 'hello world' });
        expect(parseExtra('search=film%20d%27azione')).toEqual({ search: "film d'azione" });
    });

    it('should skip entries without value', () => {
        expect(parseExtra('search=test&empty=')).toEqual({ search: 'test' });
        expect(parseExtra('novalue&search=test')).toEqual({ search: 'test' });
    });
});

describe('isValidConfigBase64', () => {
    it('should accept a valid config base64 string', () => {
        const config = { apiKeys: { tmdb: 'key1' }, catalogs: [] };
        const encoded = Buffer.from(JSON.stringify(config)).toString('base64url');
        expect(isValidConfigBase64(encoded)).toBe(true);
    });

    it('should reject base64 without apiKeys', () => {
        const encoded = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');
        expect(isValidConfigBase64(encoded)).toBe(false);
    });

    it('should reject non-JSON base64', () => {
        const encoded = Buffer.from('not json').toString('base64url');
        expect(isValidConfigBase64(encoded)).toBe(false);
    });

    it('should reject null and empty string', () => {
        expect(isValidConfigBase64(null)).toBe(false);
        expect(isValidConfigBase64('')).toBe(false);
        expect(isValidConfigBase64(undefined)).toBe(false);
    });

    it('should reject non-string input', () => {
        expect(isValidConfigBase64(123)).toBe(false);
        expect(isValidConfigBase64({})).toBe(false);
    });
});
