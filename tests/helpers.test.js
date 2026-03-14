const { parseExtra, getProfileDnaFilters, resolveHostUrl } = require('../src/utils/helpers');

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

describe('getProfileDnaFilters', () => {
    it('should merge manualDNA, suggestedDNA and pending DNA for the selected profile without duplicates', () => {
        const filters = getProfileDnaFilters({
            profiles: [
                {
                    id: 'kids',
                    settings: {
                        manualDNA: [{ type: 'genre', id: '16' }],
                        suggestedDNA: [{ type: 'keyword', id: 'robot' }],
                        pendingDNASuggestions: [
                            { type: 'genre', id: '16' },
                            { type: 'country', id: 'JP' }
                        ]
                    }
                }
            ]
        }, 'kids');

        expect(filters).toEqual([
            { type: 'genre', id: '16' },
            { type: 'keyword', id: 'robot' },
            { type: 'country', id: 'JP' }
        ]);
    });

    it('should return an empty array when the profile does not exist', () => {
        expect(getProfileDnaFilters({ profiles: [] }, 'missing')).toEqual([]);
    });
});

describe('resolveHostUrl', () => {
    const originalHost = process.env.HOST_URL;
    const originalRenderHost = process.env.RENDER_EXTERNAL_URL;

    afterEach(() => {
        process.env.HOST_URL = originalHost;
        process.env.RENDER_EXTERNAL_URL = originalRenderHost;
    });

    it('prefers explicit environment host when configured', () => {
        process.env.HOST_URL = 'https://configured.example.com';
        const req = { headers: {}, protocol: 'http', get: () => 'ignored.example.com' };
        expect(resolveHostUrl(req)).toBe('https://configured.example.com');
    });

    it('uses forwarded host/proto when present', () => {
        process.env.HOST_URL = '';
        process.env.RENDER_EXTERNAL_URL = '';
        const req = {
            headers: {
                'x-forwarded-host': 'edge.example.com, proxy.local',
                'x-forwarded-proto': 'https'
            },
            protocol: 'http',
            get: () => 'internal.example.com'
        };
        expect(resolveHostUrl(req)).toBe('https://edge.example.com');
    });

    it('falls back to request protocol and host', () => {
        process.env.HOST_URL = '';
        process.env.RENDER_EXTERNAL_URL = '';
        const req = { headers: {}, protocol: 'http', get: () => 'localhost:7000' };
        expect(resolveHostUrl(req)).toBe('http://localhost:7000');
    });
});
