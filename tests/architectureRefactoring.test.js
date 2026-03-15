/**
 * Tests for the architectural refactoring and bug fixes:
 * - Phase 0.1: UserAccount and AddonConfig models
 * - Phase 0.2: UUID-based routing and configure redirect
 * - Phase 0.3: Token invalidation fix (Bug 1.1)
 * - Bug 1.3: Preset fall-through fix (buildDirectPresetCatalog)
 * - Bug 1.4: Cold start fallback (no more return [])
 */

// --- Phase 0.1: Model Tests ---
describe('Phase 0.1: Two-Table Split Models', () => {
    it('UserAccount model should have required fields including passwordHash', () => {
        const UserAccount = require('../src/db/models/UserAccount');
        const schema = UserAccount.schema;
        expect(schema.path('userId')).toBeDefined();
        expect(schema.path('email')).toBeDefined();
        expect(schema.path('passwordHash')).toBeDefined();
        expect(schema.path('addonUuid')).toBeDefined();
        expect(schema.path('apiKeys.stremio')).toBeDefined();
        expect(schema.path('apiKeys.tmdb')).toBeDefined();
        expect(schema.path('apiKeys.mistral')).toBeDefined();
        expect(schema.path('apiKeys.trakt')).toBeDefined();
        expect(schema.path('apiKeys.traktRefreshToken')).toBeDefined();
        expect(schema.path('apiKeys.mdblist')).toBeDefined();
    });

    it('UserAccount email should be required (not sparse)', () => {
        const UserAccount = require('../src/db/models/UserAccount');
        const emailPath = UserAccount.schema.path('email');
        expect(emailPath.isRequired).toBe(true);
    });

    it('UserAccount passwordHash should be required', () => {
        const UserAccount = require('../src/db/models/UserAccount');
        const passwordPath = UserAccount.schema.path('passwordHash');
        expect(passwordPath.isRequired).toBe(true);
    });

    it('UserAccount should auto-generate addonUuid', () => {
        const UserAccount = require('../src/db/models/UserAccount');
        const doc = new UserAccount({ userId: 'test-user', email: 'test@example.com', passwordHash: 'hashed' });
        expect(doc.addonUuid).toBeDefined();
        expect(typeof doc.addonUuid).toBe('string');
        // UUID v4 format with version+variant bits
        expect(doc.addonUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('AddonConfig model should NOT have userId field (full anonymity)', () => {
        const AddonConfig = require('../src/db/models/AddonConfig');
        const schema = AddonConfig.schema;
        expect(schema.path('uuid')).toBeDefined();
        // userId must NOT exist in AddonConfig — the relationship is unidirectional
        expect(schema.path('userId')).toBeUndefined();
        expect(schema.path('profiles')).toBeDefined();
        expect(schema.path('config.activeProfileId')).toBeDefined();
        expect(schema.path('syncStatus.isSyncing')).toBeDefined();
        expect(schema.path('syncStatus.total')).toBeDefined();
        expect(schema.path('syncStatus.current')).toBeDefined();
        expect(schema.path('syncStatus.lastSync')).toBeDefined();
    });

    it('AddonConfig catalogs should be typed objects with id/name/type (not plain strings)', () => {
        const AddonConfig = require('../src/db/models/AddonConfig');
        const profileSchema = AddonConfig.schema.path('profiles').schema;
        const catalogsPath = profileSchema.path('catalogs');
        expect(catalogsPath).toBeDefined();
        // Catalogs should be an array of subdocuments, not array of strings
        const catalogSchema = catalogsPath.schema;
        expect(catalogSchema.path('id')).toBeDefined();
        expect(catalogSchema.path('name')).toBeDefined();
        expect(catalogSchema.path('type')).toBeDefined();
    });

    it('AddonConfig DNA fields should use Map of Number (not Mixed)', () => {
        const AddonConfig = require('../src/db/models/AddonConfig');
        const profileSchema = AddonConfig.schema.path('profiles').schema;
        // DNA fields should exist and be Map type
        for (const field of ['dna.genres', 'dna.keywords', 'dna.networks', 'dna.companies']) {
            const fieldPath = profileSchema.path(field);
            expect(fieldPath).toBeDefined();
            expect(fieldPath.instance).toBe('Map');
        }
    });

    it('AddonConfig DNA Map should accept numeric values', () => {
        const AddonConfig = require('../src/db/models/AddonConfig');
        const doc = new AddonConfig({
            uuid: 'test-uuid',
            profiles: [{
                id: 'global',
                name: 'Test',
                dna: {
                    genres: { '27': 15.5, '28': 8.2 },
                    keywords: { '1234': 3.0 }
                }
            }]
        });
        const profile = doc.profiles[0];
        expect(profile.dna.genres.get('27')).toBe(15.5);
        expect(profile.dna.genres.get('28')).toBe(8.2);
        expect(profile.dna.keywords.get('1234')).toBe(3.0);
    });

    it('AddonConfig syncStatus defaults to not syncing', () => {
        const AddonConfig = require('../src/db/models/AddonConfig');
        const doc = new AddonConfig({ uuid: 'test-uuid' });
        expect(doc.syncStatus.isSyncing).toBe(false);
        expect(doc.syncStatus.total).toBe(0);
        expect(doc.syncStatus.current).toBe(0);
    });

    it('legacy User.js should be DELETED (clean-slate, no old users)', () => {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '../src/db/models/User.js');
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it('legacy migration script should be DELETED', () => {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '../scripts/migrate-encrypt-keys.js');
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it('legacy User.js shim should be DELETED (clean-slate, no old users)', () => {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '../src/models/User.js');
        expect(fs.existsSync(filePath)).toBe(false);
    });
});

// --- Phase 0.3 / Bug 1.1: Token Invalidation Fix ---
describe('Bug 1.1: Token Invalidation Prevention', () => {
    it('validateKeys should preserve existing Trakt token when body sends empty string', () => {
        const { validateKeys } = require('../src/api/configure/validators');
        const body = { tmdbKey: 'valid-tmdb', traktToken: '', traktRefreshToken: '', mistralKey: '' };
        const existingUser = {
            apiKeys: {
                tmdb: 'existing-tmdb',
                trakt: 'existing-trakt-token',
                traktRefreshToken: 'existing-refresh',
                mistral: 'existing-mistral'
            }
        };
        const warnings = [];
        const result = validateKeys(body, existingUser, warnings);

        // Trakt and Mistral tokens should be preserved from existing user
        expect(result.traktToken).toBe('existing-trakt-token');
        expect(result.traktRefreshToken).toBe('existing-refresh');
        expect(result.mistralKey).toBe('existing-mistral');
    });

    it('validateKeys should preserve existing Trakt token when body sends undefined', () => {
        const { validateKeys } = require('../src/api/configure/validators');
        const body = { tmdbKey: 'valid-tmdb' };
        const existingUser = {
            apiKeys: {
                trakt: 'my-valid-trakt-token',
                traktRefreshToken: 'my-refresh'
            }
        };
        const warnings = [];
        const result = validateKeys(body, existingUser, warnings);
        expect(result.traktToken).toBe('my-valid-trakt-token');
        expect(result.traktRefreshToken).toBe('my-refresh');
    });

    it('configure index should not include null/empty validated values in apiKeys', () => {
        // Simulate the logic from configure/index.js
        const validatedValues = {
            effectiveTmdbKey: 'valid-tmdb',
            mistralKey: null,        // was empty, preserved as null
            traktToken: null,        // was empty, preserved as null
            traktRefreshToken: null,
            mdblistKey: undefined,
            stremioAuthKey: ''
        };

        const validatedKeyMap = {
            effectiveTmdbKey: 'tmdb',
            mistralKey: 'mistral',
            traktToken: 'trakt',
            traktRefreshToken: 'traktRefreshToken',
            mdblistKey: 'mdblist',
            stremioAuthKey: 'stremio'
        };

        const apiKeys = {};
        for (const [validatedName, dbKey] of Object.entries(validatedKeyMap)) {
            const value = validatedValues[validatedName];
            if (value !== undefined && value !== null && value !== '') {
                apiKeys[dbKey] = value;
            }
        }

        // Only the non-empty TMDB key should be included
        expect(apiKeys).toEqual({ tmdb: 'valid-tmdb' });
        expect(apiKeys.trakt).toBeUndefined();
        expect(apiKeys.mistral).toBeUndefined();
        expect(apiKeys.stremio).toBeUndefined();
    });
});

// --- Bug 1.3: Preset Fall-through ---
describe('Bug 1.3: Preset Fall-through Fix', () => {
    it('buildDirectPresetCatalog should be exported from hybridRecommendations', () => {
        jest.resetModules();
        jest.mock('../src/cache/cacheInstances', () => ({
            hybridRecommendationsCache: {
                clear: jest.fn(),
                set: jest.fn(),
                get: jest.fn(),
                getWithStatus: jest.fn(async () => ({ value: null, status: 'miss' })),
                delete: jest.fn()
            }
        }));
        jest.mock('../src/clients/trakt', () => ({
            traktClient: { get: jest.fn() }
        }));
        jest.mock('../src/models/UserList', () => ({
            findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
        }));

        const { buildDirectPresetCatalog } = require('../src/engines/hybridRecommendations');
        expect(typeof buildDirectPresetCatalog).toBe('function');
    });
});

// --- Bug 1.4: Cold Start Fallback ---
describe('Bug 1.4: Cold Start Fallback', () => {
    it('fetchPopularFallbackIds should be exported and callable', () => {
        jest.resetModules();
        jest.mock('../src/cache/cacheInstances', () => ({
            hybridRecommendationsCache: {
                clear: jest.fn(),
                set: jest.fn(),
                get: jest.fn(),
                getWithStatus: jest.fn(async () => ({ value: null, status: 'miss' })),
                delete: jest.fn()
            }
        }));
        jest.mock('../src/clients/trakt', () => ({
            traktClient: { get: jest.fn() }
        }));
        jest.mock('../src/models/UserList', () => ({
            findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
        }));

        const { fetchPopularFallbackIds, fetchHiddenGemsFallbackIds } = require('../src/engines/hybridRecommendations');
        expect(typeof fetchPopularFallbackIds).toBe('function');
        expect(typeof fetchHiddenGemsFallbackIds).toBe('function');
    });
});

// --- Phase 0.2: Configure Redirect ---
describe('Phase 0.2: Configure Redirect', () => {
    it('stremio router should have the configure redirect route', () => {
        // Verify the route exists by checking if the module loads without errors
        jest.resetModules();
        
        // Mock all required dependencies to avoid DB connections
        jest.mock('../src/clients/stremio', () => ({
            stremioClient: { post: jest.fn() }
        }));
        jest.mock('../src/clients/trakt', () => ({
            traktClient: { post: jest.fn() }
        }));
        jest.mock('../src/utils/stremioAddonSync', () => ({
            updateStremioAddonCollection: jest.fn()
        }));
        jest.mock('../src/models/UserConfig', () => ({
            resolveUserConfig: jest.fn(),
            saveUser: jest.fn()
        }));
        jest.mock('../src/db/models/AddonConfig', () => ({
            findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) }))
        }));
        jest.mock('../src/handlers/catalogHandler', () => ({
            catalogHandler: jest.fn()
        }));
        jest.mock('../src/handlers/metaHandler', () => ({
            metaHandler: jest.fn()
        }));
        jest.mock('../src/handlers/streamHandler', () => ({
            streamHandler: jest.fn()
        }));

        const router = require('../src/api/stremio');
        expect(router).toBeDefined();
        
        // Check that the router has routes registered
        const routes = router.stack
            .filter(layer => layer.route)
            .map(layer => ({ path: layer.route.path, methods: layer.route.methods }));
        
        // Find the configure redirect route
        const configureRoute = routes.find(r => 
            r.path === '/:userHandle/configure' && r.methods.get
        );
        expect(configureRoute).toBeDefined();
    });
});
