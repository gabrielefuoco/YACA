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
            timeout: 10000
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('FATAL ERROR: NEXTAUTH_SECRET is missing. Shutting down.');
    });

    it('registers the Next.js fallback without using an Express 5 wildcard route', async () => {
        const repoRoot = path.resolve(__dirname, '..');
        const serverPath = path.join(repoRoot, 'server.js');
        const dbConnectionPath = path.join(repoRoot, 'src', 'db', 'connection.js');
        const redisClientPath = path.join(repoRoot, 'src', 'cache', 'redisClient.js');
        const indexPath = path.join(repoRoot, 'index.js');

        const nextHandle = jest.fn();
        const close = jest.fn();
        const prepare = jest.fn().mockResolvedValue(undefined);
        const use = jest.fn();
        const all = jest.fn();
        const listen = jest.fn((port, callback) => {
            if (callback) callback();
            return { close: jest.fn() };
        });
        const expressApp = { use, all, listen };

        process.env.NEXTAUTH_SECRET = 'test-secret';

        jest.resetModules();
        jest.doMock('dotenv', () => ({ config: jest.fn() }));
        jest.doMock('next', () => jest.fn(() => ({
            prepare,
            getRequestHandler: () => nextHandle,
            close
        })));
        jest.doMock(dbConnectionPath, () => jest.fn().mockResolvedValue(undefined));
        jest.doMock(redisClientPath, () => ({ disconnectRedis: jest.fn().mockResolvedValue(undefined) }));
        jest.doMock(indexPath, () => expressApp);

        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process);

        try {
            require(serverPath);
            await new Promise(setImmediate);
            await new Promise(setImmediate);

            expect(prepare).toHaveBeenCalledTimes(1);
            expect(use).toHaveBeenCalledTimes(1);
            expect(typeof use.mock.calls[0][0]).toBe('function');
            expect(all).not.toHaveBeenCalled();
            expect(listen).toHaveBeenCalledTimes(1);
        } finally {
            logSpy.mockRestore();
            warnSpy.mockRestore();
            errorSpy.mockRestore();
            processOnSpy.mockRestore();
            jest.dontMock('dotenv');
            jest.dontMock('next');
            jest.dontMock(dbConnectionPath);
            jest.dontMock(redisClientPath);
            jest.dontMock(indexPath);
            delete process.env.NEXTAUTH_SECRET;
        }
    });
});
