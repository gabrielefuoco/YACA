describe('User model cleanup (Two-Table Split complete)', () => {
    test('src/models/User.js should not exist (shim deleted, clean-slate)', () => {
        const fs = require('fs');
        const path = require('path');
        expect(fs.existsSync(path.join(__dirname, '../src/models/User.js'))).toBe(false);
    });

    test('src/db/models/User.js should not exist (deleted, clean-slate)', () => {
        const fs = require('fs');
        const path = require('path');
        expect(fs.existsSync(path.join(__dirname, '../src/db/models/User.js'))).toBe(false);
    });

    test('no src/ files should import models/User', () => {
        const fs = require('fs');
        const path = require('path');
        const srcDir = path.join(__dirname, '../src');

        function findJsFiles(dir) {
            const files = [];
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) files.push(...findJsFiles(fullPath));
                else if (entry.name.endsWith('.js')) files.push(fullPath);
            }
            return files;
        }

        const jsFiles = findJsFiles(srcDir);
        const violations = [];
        for (const file of jsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            if (/require\(['"].*models\/User['"]\)/.test(content)) {
                violations.push(file);
            }
        }
        expect(violations).toEqual([]);
    });
});
