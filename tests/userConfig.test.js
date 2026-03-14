const UserConfig = require('../src/models/UserConfig');

describe('UserConfig', () => {
    it('should be loaded and expose saveUser and resolveUserConfig', () => {
        expect(UserConfig).toBeDefined();
        expect(typeof UserConfig.saveUser).toBe('function');
        expect(typeof UserConfig.resolveUserConfig).toBe('function');
    });
});
