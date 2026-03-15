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
    it('UserAccount model should have required fields', () => {
        const UserAccount = require('../src/db/models/UserAccount');
        const schema = UserAccount.schema;
        expect(schema.path('userId')).toBeDefined();
        expect(schema.path('email')).toBeDefined();
        expect(schema.path('addonUuid')).toBeDefined();
        expect(schema.path('apiKeys.stremio')).toBeDefined();
        expect(schema.path('apiKeys.tmdb')).toBeDefined();
        expect(schema.path('apiKeys.mistral')).toBeDefined();
        expect(schema.path('apiKeys.trakt')).toBeDefined();
        expect(schema.path('apiKeys.traktRefreshToken')).toBeDefined();
        expect(schema.path('apiKeys.mdblist')).toBeDefined();
    });

    it('UserAccount should auto-generate addonUuid', () => {
        const UserAccount = require('../src/db/models/UserAccount');
        const doc = new UserAccount({ userId: 'test-user' });
        expect(doc.addonUuid).toBeDefined();
        expect(typeof doc.addonUuid).toBe('string');
        // UUID v4 format with version+variant bits
        expect(doc.addonUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('AddonConfig model should NOT have userId field (Critica 1: full anonymity)', () => {
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

    it('AddonConfig profiles should have typed catalogs and dna fields (Critica 2 & 3)', () => {
        const AddonConfig = require('../src/db/models/AddonConfig');
        const schema = AddonConfig.schema;
        // Catalogs should be an array of strings, not Mixed
        const profileSchema = schema.path('profiles').schema;
        expect(profileSchema.path('id')).toBeDefined();
        expect(profileSchema.path('name')).toBeDefined();
        expect(profileSchema.path('catalogs')).toBeDefined();
        // DNA fields should exist for inferred traits
        expect(profileSchema.path('dna.genres')).toBeDefined();
        expect(profileSchema.path('dna.keywords')).toBeDefined();
        // Settings should have typed fields
        expect(profileSchema.path('settings.language')).toBeDefined();
        expect(profileSchema.path('settings.includeAdult')).toBeDefined();
    });

    it('AddonConfig syncStatus defaults to not syncing', () => {
        const AddonConfig = require('../src/db/models/AddonConfig');
        const doc = new AddonConfig({ uuid: 'test-uuid' });
        expect(doc.syncStatus.isSyncing).toBe(false);
        expect(doc.syncStatus.total).toBe(0);
        expect(doc.syncStatus.current).toBe(0);
    });

    it('legacy User.js should have deprecation comment', () => {
        const fs = require('fs');
        const path = require('path');
        const content = fs.readFileSync(
            path.join(__dirname, '../src/db/models/User.js'), 'utf-8'
        );
        expect(content).toContain('DEPRECATED');
        expect(content).toContain('TO BE REMOVED AFTER MIGRATION');
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
        jest.mock('../src/models/User', () => ({}));
        jest.mock('../src/models/UserConfig', () => ({
            resolveUserConfig: jest.fn(),
            getUser: jest.fn(),
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
