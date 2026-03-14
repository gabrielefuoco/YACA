describe('User model import paths', () => {
    afterEach(() => {
        jest.resetModules();
    });

    test('legacy and db model paths resolve to the same User model instance', () => {
        jest.isolateModules(() => {
            expect(() => {
                const legacyUserModel = require('../src/models/User');
                const dbUserModel = require('../src/db/models/User');

                expect(legacyUserModel).toBe(dbUserModel);
            }).not.toThrow();
        });
    });
});
