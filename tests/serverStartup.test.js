const { spawnSync } = require('child_process');
const path = require('path');

describe('server startup guards', () => {
    it('fails fast when NEXTAUTH_SECRET is missing', () => {
        const repoRoot = path.resolve(__dirname, '..');
        const envWithoutSecret = { ...process.env };
        delete envWithoutSecret.NEXTAUTH_SECRET;

        const result = spawnSync('node', ['server.js'], {
            cwd: repoRoot,
            env: envWithoutSecret,
            encoding: 'utf8',
            timeout: 5000
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('FATAL ERROR: NEXTAUTH_SECRET is missing. Shutting down.');
    });
});
