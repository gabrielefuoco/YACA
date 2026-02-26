const { sanitizeString, isAllowedUrl, isValidUUID } = require('../src/utils/helpers');

describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
        expect(sanitizeString('<script>alert("xss")</script>')).toBe('alert(xss)');
    });

    it('should remove dangerous characters', () => {
        expect(sanitizeString('test<>&"\'')).toBe('test');
    });

    it('should preserve safe text', () => {
        expect(sanitizeString('Film Horror anni 80')).toBe('Film Horror anni 80');
    });

    it('should handle empty string', () => {
        expect(sanitizeString('')).toBe('');
    });

    it('should handle non-string input', () => {
        expect(sanitizeString(null)).toBe('');
        expect(sanitizeString(undefined)).toBe('');
        expect(sanitizeString(123)).toBe('');
    });

    it('should remove nested HTML tags', () => {
        expect(sanitizeString('<div><img onerror="alert(1)">test</div>')).toBe('test');
    });

    it('should handle multi-character sanitization bypass attempts', () => {
        // <scr<script>ipt> reforms into <script> after removing inner tag
        const result = sanitizeString('<scr<script>ipt>alert(1)</scr</script>ipt>');
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('<');
    });
});

describe('isAllowedUrl', () => {
    const ALLOWED_HOSTS = ['image.tmdb.org', 'media.kitsu.app'];

    it('should allow URLs with approved hosts', () => {
        expect(isAllowedUrl('https://image.tmdb.org/t/p/w500/poster.jpg', ALLOWED_HOSTS)).toBe(true);
        expect(isAllowedUrl('http://media.kitsu.app/anime/cover_images/1234.jpg', ALLOWED_HOSTS)).toBe(true);
    });

    it('should block URLs with unapproved hosts', () => {
        expect(isAllowedUrl('https://evil.com/image.jpg', ALLOWED_HOSTS)).toBe(false);
    });

    it('should block localhost/private IPs (SSRF protection)', () => {
        expect(isAllowedUrl('http://127.0.0.1/image.jpg', ALLOWED_HOSTS)).toBe(false);
        expect(isAllowedUrl('http://localhost/image.jpg', ALLOWED_HOSTS)).toBe(false);
        expect(isAllowedUrl('http://192.168.1.1/image.jpg', ALLOWED_HOSTS)).toBe(false);
        expect(isAllowedUrl('http://10.0.0.1/image.jpg', ALLOWED_HOSTS)).toBe(false);
        expect(isAllowedUrl('http://169.254.169.254/latest/meta-data/', ALLOWED_HOSTS)).toBe(false);
        expect(isAllowedUrl('http://0.0.0.0/image.jpg', ALLOWED_HOSTS)).toBe(false);
    });

    it('should block non-HTTP protocols', () => {
        expect(isAllowedUrl('file:///etc/passwd', ALLOWED_HOSTS)).toBe(false);
        expect(isAllowedUrl('ftp://image.tmdb.org/image.jpg', ALLOWED_HOSTS)).toBe(false);
    });

    it('should return false for invalid URLs', () => {
        expect(isAllowedUrl('not-a-url', ALLOWED_HOSTS)).toBe(false);
        expect(isAllowedUrl('', ALLOWED_HOSTS)).toBe(false);
    });

    it('should allow any public host when allowedHosts is empty', () => {
        expect(isAllowedUrl('https://example.com/image.jpg', [])).toBe(true);
    });

    it('should block private IPs even without host restriction', () => {
        expect(isAllowedUrl('http://127.0.0.1/image.jpg', [])).toBe(false);
        expect(isAllowedUrl('http://localhost/secret', [])).toBe(false);
    });
});

describe('isValidUUID - security checks', () => {
    it('should reject non-UUID strings used as injection', () => {
        expect(isValidUUID('u1')).toBe(false);
        expect(isValidUUID('')).toBe(false);
        expect(isValidUUID('../../../etc/passwd')).toBe(false);
        expect(isValidUUID('SELECT * FROM users')).toBe(false);
    });

    it('should accept valid UUIDs', () => {
        expect(isValidUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
        expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });
});

describe('AI response validation (prompt injection defense)', () => {
    // Test the parseMistralResponse function via the router module
    // We test indirectly through generateTmdbFiltersFromPrompt with no key (fallback)
    const { generateTmdbFiltersFromPrompt } = require('../src/ai/router');

    it('should return safe fallback when no mistral key', async () => {
        const result = await generateTmdbFiltersFromPrompt('test prompt', null);
        expect(result).toEqual({
            strategy: 'multi_search',
            text_search: 'test prompt',
            target: 'tmdb'
        });
    });
});

describe('configure route - UUID validation', () => {
    jest.mock('../src/models/UserConfig', () => ({
        saveConfig: jest.fn(),
        findOne: jest.fn()
    }));

    jest.mock('uuid', () => ({
        v4: jest.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    }));

    jest.mock('../src/ai/router', () => ({
        generateTmdbFiltersFromPrompt: jest.fn()
    }));

    jest.mock('../src/data/presets', () => ({
        presets: []
    }));

    const configureRoute = require('../src/api/configure');

    it('should reject invalid UUID in request body', async () => {
        const req = {
            body: {
                uuid: 'invalid-uuid',
                tmdbKey: 'some_key',
                profiles: [{
                    id: 'p1',
                    name: 'Test',
                    selectedPresets: [],
                    existingCatalogs: [],
                    newPrompts: []
                }]
            }
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await configureRoute(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('UUID')
        }));
    });
});

describe('configure route - XSS sanitization', () => {
    jest.mock('../src/models/UserConfig', () => ({
        saveConfig: jest.fn(),
        findOne: jest.fn()
    }));

    jest.mock('uuid', () => ({
        v4: jest.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    }));

    jest.mock('../src/ai/router', () => ({
        generateTmdbFiltersFromPrompt: jest.fn()
    }));

    jest.mock('../src/data/presets', () => ({
        presets: []
    }));

    const configureRoute = require('../src/api/configure');
    const UserConfig = require('../src/models/UserConfig');

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should sanitize profile names with HTML content', async () => {
        UserConfig.saveConfig.mockResolvedValue([]);
        UserConfig.findOne.mockResolvedValue({ uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', configVersion: 'cv1' });

        const req = {
            body: {
                uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                tmdbKey: 'some_key',
                profiles: [{
                    id: 'p1',
                    name: '<script>alert("xss")</script>Profilo',
                    selectedPresets: [],
                    existingCatalogs: [],
                    newPrompts: []
                }]
            }
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        await configureRoute(req, res);

        expect(UserConfig.saveConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                profiles: expect.arrayContaining([
                    expect.objectContaining({
                        name: expect.not.stringContaining('<script>')
                    })
                ])
            })
        );
    });
});
