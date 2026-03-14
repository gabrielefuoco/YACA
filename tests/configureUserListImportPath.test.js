describe('configure handler module imports', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    test('loads configure handler when UserList is mocked at db/models path', () => {
        let configureHandler;

        jest.isolateModules(() => {
            jest.doMock('../src/models/UserConfig', () => ({}));
            jest.doMock('../src/db/models/UserList', () => ({
                deleteMany: jest.fn(),
                findOneAndUpdate: jest.fn()
            }));
            jest.doMock('../src/utils/helpers', () => ({
                resolveHostUrl: jest.fn(() => 'http://localhost'),
                sanitizeString: jest.fn((value) => value)
            }));
            jest.doMock('../src/utils/stremioAddonSync', () => ({
                updateStremioAddonCollection: jest.fn()
            }));
            jest.doMock('../src/api/configure/validators', () => ({
                validateAuth: jest.fn(),
                validateKeys: jest.fn(() => ({})),
                LIMITS: {
                    MAX_EXISTING_CATALOGS: 10,
                    MAX_CATALOG_NAME_LENGTH: 30,
                    MAX_PRESETS: 10,
                    MAX_PROMPT_LENGTH: 250,
                    MAX_AI_PROMPTS: 5,
                    MAX_PROFILE_NAME_LENGTH: 50
                }
            }));
            jest.doMock('../src/api/configure/profileProcessor', () => ({
                processProfiles: jest.fn(),
                createGlobalProfileInput: jest.fn()
            }));

            configureHandler = require('../src/api/configure');
        });

        expect(typeof configureHandler).toBe('function');
    });
});
