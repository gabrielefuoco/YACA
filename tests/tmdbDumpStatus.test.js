const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');
const TmdbDumpStore = require('../services/tmdb-daemon/tmdbDumpStore');

describe('TMDB Dump Status from Artifact (Ticket 34)', () => {
    let tempDir;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-tmdb-test-'));
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
    });

    test('1. Volume non inizializzato (nessun file): restituisce phase=uninitialized e isStale=true', () => {
        const store = new TmdbDumpStore(tempDir);
        const status = store.loadStatus();

        expect(status.isRunning).toBe(false);
        expect(status.phase).toBe('uninitialized');
        expect(status.isStale).toBe(true);
        expect(status.staleReason).toContain('Nessun artefatto');
        expect(status.artifacts.duckdb.exists).toBe(false);
        expect(status.artifacts.moviesParquet.exists).toBe(false);
    });

    test('2. Artefatti presenti ma dump_status.json assente: non mente, riporta phase=stale e isStale=true', () => {
        const store = new TmdbDumpStore(tempDir);
        // Simula la presenza di file parquet sul volume
        fs.writeFileSync(path.join(tempDir, 'movies.parquet'), 'fake-parquet-content');
        fs.writeFileSync(path.join(tempDir, 'catalog.duckdb'), 'fake-duckdb-content');

        const status = store.loadStatus();

        expect(status.isRunning).toBe(false);
        expect(status.phase).toBe('stale');
        expect(status.isStale).toBe(true);
        expect(status.staleReason).toContain('dump_status.json assente');
        expect(status.artifacts.moviesParquet.exists).toBe(true);
        expect(status.artifacts.duckdb.exists).toBe(true);
        expect(status.lastSync).not.toBeNull();
    });

    test('3. Daemon attivo con battito fresco: riporta isRunning=true, isStale=false', () => {
        const store = new TmdbDumpStore(tempDir);
        store.saveStatus({
            isRunning: true,
            phase: 'daily-sync',
            currentTask: 'Syncing movies 101 (1/50)',
            progress: 1,
            total: 50,
            stats: { movies: 100, tv: 20 }
        });

        const status = store.loadStatus();

        expect(status.isRunning).toBe(true);
        expect(status.phase).toBe('daily-sync');
        expect(status.isStale).toBe(false);
        expect(status.currentTask).toBe('Syncing movies 101 (1/50)');
        expect(status.progress).toBe(1);
        expect(status.total).toBe(50);
        expect(status.stats.movies).toBe(100);
    });

    test('4. Heartbeat scaduto (>10 minuti): rileva il processo morto/bloccato e riporta phase=stale', () => {
        const store = new TmdbDumpStore(tempDir);
        const statusPath = store.getStatusPath();
        const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();

        fs.writeFileSync(statusPath, JSON.stringify({
            isRunning: true,
            phase: 'cold-start',
            currentTask: 'Fetching movies...',
            updatedAt: elevenMinutesAgo
        }));

        const status = store.loadStatus();

        expect(status.isRunning).toBe(false);
        expect(status.phase).toBe('stale');
        expect(status.isStale).toBe(true);
        expect(status.staleReason).toContain('Heartbeat scaduto');
    });

    test('5. Sync stantio (>36 ore): riporta phase=stale e isStale=true', () => {
        const store = new TmdbDumpStore(tempDir);
        const statusPath = store.getStatusPath();
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        fs.writeFileSync(statusPath, JSON.stringify({
            isRunning: false,
            phase: 'idle',
            lastSync: twoDaysAgo,
            updatedAt: new Date().toISOString()
        }));

        const status = store.loadStatus();

        expect(status.isRunning).toBe(false);
        expect(status.phase).toBe('stale');
        expect(status.isStale).toBe(true);
        expect(status.staleReason).toContain('più di 36 ore fa');
    });

    test('6. Daemon idle con sync recente: riporta phase=idle e isStale=false', () => {
        const store = new TmdbDumpStore(tempDir);
        const statusPath = store.getStatusPath();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        fs.writeFileSync(statusPath, JSON.stringify({
            isRunning: false,
            phase: 'idle',
            lastSync: oneHourAgo,
            stats: { movies: 87000, tv: 15000 },
            updatedAt: new Date().toISOString()
        }));

        const status = store.loadStatus();

        expect(status.isRunning).toBe(false);
        expect(status.phase).toBe('idle');
        expect(status.isStale).toBe(false);
        expect(status.stats.movies).toBe(87000);
    });

    test('7. /api/admin/tmdb-dump/status risponde con lo stato letto dall artefatto', async () => {
        const oldDumpDir = process.env.TMDB_DUMP_DIR;
        process.env.TMDB_DUMP_DIR = tempDir;

        const store = new TmdbDumpStore(tempDir);
        store.saveStatus({
            isRunning: true,
            phase: 'cold-start',
            currentTask: 'Downloading Daily Export for movies',
            progress: 10,
            total: 100
        });

        let server;
        try {
            const app = express();
            app.use(express.json());

            jest.isolateModules(() => {
                jest.doMock('../src/api/middleware/adminAuth', () => (req, res, next) => next());
                const adminRouter = require('../src/api/admin');
                app.use('/api/admin', adminRouter);
            });

            const port = await new Promise((resolve) => {
                server = http.createServer(app);
                server.listen(0, '127.0.0.1', () => {
                    resolve(server.address().port);
                });
            });

            const res = await fetch(`http://127.0.0.1:${port}/api/admin/tmdb-dump/status`);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.status.isRunning).toBe(true);
            expect(data.status.phase).toBe('cold-start');
            expect(data.status.currentTask).toBe('Downloading Daily Export for movies');
        } finally {
            if (server) {
                await new Promise(r => server.close(r));
            }
            if (oldDumpDir) process.env.TMDB_DUMP_DIR = oldDumpDir;
            else delete process.env.TMDB_DUMP_DIR;
        }
    });
});
