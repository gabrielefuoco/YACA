describe('User model cleanup (Two-Table Split complete)', () => {
    const fs = require('fs');
    const path = require('path');

    function findJsFiles(dir) {
        const files = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && entry.name !== 'node_modules') files.push(...findJsFiles(fullPath));
            else if (entry.name.endsWith('.js')) files.push(fullPath);
        }
        return files;
    }

    test('src/models/User.js should not exist (shim deleted, clean-slate)', () => {
        expect(fs.existsSync(path.join(__dirname, '../src/models/User.js'))).toBe(false);
    });

    test('src/db/models/User.js should not exist (deleted, clean-slate)', () => {
        expect(fs.existsSync(path.join(__dirname, '../src/db/models/User.js'))).toBe(false);
    });

    test('no src/ files should import models/User', () => {
        const srcDir = path.join(__dirname, '../src');
        const jsFiles = findJsFiles(srcDir);
        const violations = [];
        for (const file of jsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            if (/require\(['"].*\/models\/User['"]\)/.test(content)) {
                violations.push(file);
            }
        }
        expect(violations).toEqual([]);
    });

    test('no test or script files should import the deleted models/User model', () => {
        const testsDir = path.join(__dirname, '../tests');
        const scriptsDir = path.join(__dirname, '../scripts');
        const dirs = [testsDir, scriptsDir].filter(d => fs.existsSync(d));
        const jsFiles = dirs.flatMap(dir => findJsFiles(dir));
        const violations = [];
        for (const file of jsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            // Match require paths ending in /models/User (the deleted legacy model)
            // but NOT /models/UserAccount, /models/UserConfig, /models/UserList, etc.
            if (/require\(['"].*\/models\/User['"]\)/.test(content)) {
                violations.push(path.relative(path.join(__dirname, '..'), file));
            }
        }
        expect(violations).toEqual([]);
    });
});
