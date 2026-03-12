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

    it('routes /api/auth requests directly to Next.js before Express middleware', async () => {
        const repoRoot = path.resolve(__dirname, '..');
        const serverPath = path.join(repoRoot, 'server.js');
        const dbConnectionPath = path.join(repoRoot, 'src', 'db', 'connection.js');
        const redisClientPath = path.join(repoRoot, 'src', 'cache', 'redisClient.js');
        const indexPath = path.join(repoRoot, 'index.js');

        let authUrlSeenByNext;
        const nextHandle = jest.fn((req) => {
            if (req.originalUrl && req.originalUrl.startsWith('/api/auth')) {
                authUrlSeenByNext = req.url;
            }
        });
        const close = jest.fn();
        const prepare = jest.fn().mockResolvedValue(undefined);
        const use = jest.fn();
        const set = jest.fn();
        const listen = jest.fn((port, callback) => {
            if (callback) callback();
            return { close: jest.fn() };
        });
        const mainApp = { use, set, listen };
        const expressFactory = jest.fn(() => mainApp);
        const expressApp = { name: 'express-api-app' };

        process.env.NEXTAUTH_SECRET = 'test-secret';

        jest.resetModules();
        jest.doMock('dotenv', () => ({ config: jest.fn() }));
        jest.doMock('express', () => expressFactory);
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

            const authReq = { originalUrl: '/api/auth/callback/credentials', url: '/callback/credentials' };
            const fallbackReq = { url: '/dashboard' };
            const res = { end: jest.fn() };

            expect(prepare).toHaveBeenCalledTimes(1);
            expect(expressFactory).toHaveBeenCalledTimes(1);
            expect(set).toHaveBeenCalledWith('trust proxy', true);
            expect(use).toHaveBeenCalledTimes(3);
            expect(listen).toHaveBeenCalledTimes(1);

            const [authPath, authHandler] = use.mock.calls[0];
            expect(authPath).toBe('/api/auth');
            expect(typeof authHandler).toBe('function');

            const [mountedExpressApp] = use.mock.calls[1];
            expect(mountedExpressApp).toBe(expressApp);

            const fallbackHandler = use.mock.calls[2][0];
            expect(typeof fallbackHandler).toBe('function');

            authHandler(authReq, res);
            fallbackHandler(fallbackReq, res);

            expect(nextHandle).toHaveBeenCalledWith(authReq, res);
            expect(nextHandle).toHaveBeenCalledWith(fallbackReq, res);
            expect(authReq.url).toBe('/api/auth/callback/credentials');
            expect(authUrlSeenByNext).toBe('/api/auth/callback/credentials');
        } finally {
            logSpy.mockRestore();
            warnSpy.mockRestore();
            errorSpy.mockRestore();
            processOnSpy.mockRestore();
            jest.dontMock('dotenv');
            jest.dontMock('express');
            jest.dontMock('next');
            jest.dontMock(dbConnectionPath);
            jest.dontMock(redisClientPath);
            jest.dontMock(indexPath);
            delete process.env.NEXTAUTH_SECRET;
        }
    });
});
