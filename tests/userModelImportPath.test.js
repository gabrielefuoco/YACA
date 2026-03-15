describe('User model import paths (transitional shim)', () => {
    afterEach(() => {
        jest.resetModules();
    });

    test('legacy src/models/User shim should re-export UserAccount', () => {
        jest.isolateModules(() => {
            expect(() => {
                const legacyUserModel = require('../src/models/User');
                const UserAccount = require('../src/db/models/UserAccount');

                // The shim now redirects to UserAccount (no more legacy User.js)
                expect(legacyUserModel).toBe(UserAccount);
            }).not.toThrow();
        });
    });

    test('src/db/models/User.js should not exist (deleted, clean-slate)', () => {
        const fs = require('fs');
        const path = require('path');
        expect(fs.existsSync(path.join(__dirname, '../src/db/models/User.js'))).toBe(false);
    });
});
