const http = require('http');
const express = require('express');
const fetch = globalThis.fetch;
const { getIngestionStatus } = require('../src/infra/ingestionStatus');
const TmdbDumpStore = require('../services/tmdb-daemon/tmdbDumpStore');
const { animeAiringState, animeMappingStore } = require('../src/anime');
const itaAnnotations = require('../src/catalog/itaAnnotations');
const staticPosters = require('../src/api/staticPosters');

describe('Semaforo Ingestione - getIngestionStatus (Ticket 10)', () => {
    test('1. Non lancia mai, overall è uno dei tre valori e contiene tutte e cinque le chiavi', async () => {
        const res = await getIngestionStatus();

        expect(['green', 'yellow', 'red']).toContain(res.overall);
        expect(typeof res.timestamp).toBe('string');
        expect(Array.isArray(res.reasons)).toBe(true);
        expect(res.checks).toBeDefined();

        expect(res.checks.tmdb).toBeDefined();
        expect(res.checks.animeAiring).toBeDefined();
        expect(res.checks.animeMapping).toBeDefined();
        expect(res.checks.itaAnnotations).toBeDefined();
        expect(res.checks.posters).toBeDefined();

        for (const key of ['tmdb', 'animeAiring', 'animeMapping', 'itaAnnotations', 'posters']) {
            expect(['green', 'yellow', 'red']).toContain(res.checks[key].status);
        }
    });

    test('2. Sonda itaAnnotations in errore rende il check red e overall red', async () => {
        const spy = jest.spyOn(itaAnnotations, 'getSnapshot').mockResolvedValueOnce({
            byKey: new Map(),
            count: 0,
            trueCount: 0,
            nullCount: 0,
            generatedAt: null,
            loadedAt: Date.now(),
            path: '/fake/path/ita_annotations.jsonl',
            error: 'file assente'
        });

        try {
            const res = await getIngestionStatus();
            expect(res.checks.itaAnnotations.status).toBe('red');
            expect(res.checks.itaAnnotations.error).toBe('file assente');
            expect(res.overall).toBe('red');
            expect(res.reasons.some(r => r.includes('ita_annotations'))).toBe(true);
        } finally {
            spy.mockRestore();
        }
    });

    test('3. Sonda che solleva eccezione non fa fallire getIngestionStatus e diventa red', async () => {
        const spy = jest.spyOn(animeAiringState, 'getSnapshot').mockRejectedValueOnce(
            new Error('MongoDB connection timeout')
        );

        try {
            const res = await getIngestionStatus();
            expect(res.checks.animeAiring.status).toBe('red');
            expect(res.checks.animeAiring.error).toBe('MongoDB connection timeout');
            expect(res.overall).toBe('red');
            expect(res.reasons.some(r => r.includes('anime_airing: MongoDB connection timeout'))).toBe(true);
        } finally {
            spy.mockRestore();
        }
    });

    test('4. Tutte le sonde sane restituiscono overall green e 0 ragioni', async () => {
        const spyTmdb = jest.spyOn(TmdbDumpStore.prototype, 'loadStatus').mockReturnValueOnce({
            phase: 'idle',
            isStale: false,
            lastSync: new Date().toISOString(),
            artifacts: {
                duckdb: { exists: true },
                titlesFts5: { exists: true }
            }
        });

        const spyAiring = jest.spyOn(animeAiringState, 'getSnapshot').mockResolvedValueOnce({
            docs: [{ tmdbId: '123' }],
            homeInWindow: 10,
            homeStale: 0,
            degraded: false
        });

        const origIsReady = animeMappingStore.isReady;
        animeMappingStore.isReady = true;
        const spyIds = jest.spyOn(animeMappingStore, 'idsByType').mockReturnValueOnce({
            movie: ['1'],
            tv: ['2']
        });
        const spyMappingSnap = jest.spyOn(animeMappingStore, 'getSnapshot').mockResolvedValueOnce({
            degraded: false,
            generatedAt: new Date().toISOString()
        });

        const spyIta = jest.spyOn(itaAnnotations, 'getSnapshot').mockResolvedValueOnce({
            error: null,
            trueCount: 1500,
            nullCount: 200,
            path: null
        });

        const spyPosters = jest.spyOn(staticPosters, 'getStatoVolume').mockReturnValueOnce({
            ok: true,
            volume: { motivo: null },
            statistiche: { richieste: 10, trovati: 10, mancanti: 0 }
        });

        try {
            const res = await getIngestionStatus();
            expect(res.checks.tmdb.status).toBe('green');
            expect(res.checks.animeAiring.status).toBe('green');
            expect(res.checks.animeMapping.status).toBe('green');
            expect(res.checks.itaAnnotations.status).toBe('green');
            expect(res.checks.posters.status).toBe('green');
            expect(res.overall).toBe('green');
            expect(res.reasons).toEqual([]);
        } finally {
            spyTmdb.mockRestore();
            spyAiring.mockRestore();
            animeMappingStore.isReady = origIsReady;
            spyIds.mockRestore();
            spyMappingSnap.mockRestore();
            spyIta.mockRestore();
            spyPosters.mockRestore();
        }
    });

    test('5. Soglie yellow: poster disallineato o TMDB stale producono yellow (se nessun red)', async () => {
        const spyTmdb = jest.spyOn(TmdbDumpStore.prototype, 'loadStatus').mockReturnValueOnce({
            phase: 'idle',
            isStale: true,
            staleReason: 'Ultimo sync più di 36 ore fa',
            artifacts: {
                duckdb: { exists: true },
                titlesFts5: { exists: true }
            }
        });

        const spyAiring = jest.spyOn(animeAiringState, 'getSnapshot').mockResolvedValueOnce({
            docs: [{ tmdbId: '123' }],
            homeInWindow: 10,
            homeStale: 0,
            degraded: false
        });

        const origIsReady = animeMappingStore.isReady;
        animeMappingStore.isReady = true;
        const spyIds = jest.spyOn(animeMappingStore, 'idsByType').mockReturnValueOnce({
            movie: ['1'],
            tv: ['2']
        });
        const spyMappingSnap = jest.spyOn(animeMappingStore, 'getSnapshot').mockResolvedValueOnce({
            degraded: false,
            generatedAt: new Date().toISOString()
        });

        const spyIta = jest.spyOn(itaAnnotations, 'getSnapshot').mockResolvedValueOnce({
            error: null,
            trueCount: 50,
            nullCount: 5,
            path: null
        });

        const spyPosters = jest.spyOn(staticPosters, 'getStatoVolume').mockReturnValueOnce({
            ok: false,
            volume: { motivo: 'versione_disegno_disallineata' },
            statistiche: {}
        });

        try {
            const res = await getIngestionStatus();
            expect(res.checks.tmdb.status).toBe('yellow');
            expect(res.checks.posters.status).toBe('yellow');
            expect(res.overall).toBe('yellow');
            expect(res.reasons.length).toBeGreaterThanOrEqual(2);
        } finally {
            spyTmdb.mockRestore();
            spyAiring.mockRestore();
            animeMappingStore.isReady = origIsReady;
            spyIds.mockRestore();
            spyMappingSnap.mockRestore();
            spyIta.mockRestore();
            spyPosters.mockRestore();
        }
    });

    test('6. Anime mapping: store non pronto o vuoto produce red, artefatto vecchio produce yellow', async () => {
        const origIsReady = animeMappingStore.isReady;

        // Caso 1: !isReady
        animeMappingStore.isReady = false;
        let res = await getIngestionStatus();
        expect(res.checks.animeMapping.status).toBe('red');

        // Caso 2: isReady ma zero ids
        animeMappingStore.isReady = true;
        const spyIdsEmpty = jest.spyOn(animeMappingStore, 'idsByType').mockReturnValue({
            movie: [],
            tv: []
        });
        res = await getIngestionStatus();
        expect(res.checks.animeMapping.status).toBe('red');
        spyIdsEmpty.mockRestore();

        // Caso 3: ids presenti ma artefatto vecchio di 48h
        const spyIdsOk = jest.spyOn(animeMappingStore, 'idsByType').mockReturnValue({
            movie: ['1'],
            tv: []
        });
        const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
        const spySnapOld = jest.spyOn(animeMappingStore, 'getSnapshot').mockResolvedValue({
            degraded: false,
            generatedAt: twoDaysAgo
        });
        res = await getIngestionStatus();
        expect(res.checks.animeMapping.status).toBe('yellow');

        spyIdsOk.mockRestore();
        spySnapOld.mockRestore();
        animeMappingStore.isReady = origIsReady;
    });

    test('7. Soglie TMDB: duckdb assente o phase=error produce red, fts5 assente produce yellow', async () => {
        // duckdb assente
        let spy = jest.spyOn(TmdbDumpStore.prototype, 'loadStatus').mockReturnValueOnce({
            phase: 'idle',
            isStale: false,
            artifacts: { duckdb: { exists: false }, titlesFts5: { exists: true } }
        });
        let res = await getIngestionStatus();
        expect(res.checks.tmdb.status).toBe('red');
        expect(res.reasons.some(r => r.includes('tmdb'))).toBe(true);
        spy.mockRestore();

        // phase error
        spy = jest.spyOn(TmdbDumpStore.prototype, 'loadStatus').mockReturnValueOnce({
            phase: 'error',
            error: 'Crash dump',
            isStale: true,
            artifacts: { duckdb: { exists: true }, titlesFts5: { exists: true } }
        });
        res = await getIngestionStatus();
        expect(res.checks.tmdb.status).toBe('red');
        spy.mockRestore();

        // fts5 assente
        spy = jest.spyOn(TmdbDumpStore.prototype, 'loadStatus').mockReturnValueOnce({
            phase: 'idle',
            isStale: false,
            artifacts: { duckdb: { exists: true }, titlesFts5: { exists: false } }
        });
        res = await getIngestionStatus();
        expect(res.checks.tmdb.status).toBe('yellow');
        spy.mockRestore();
    });

    test('8. Soglie Airing: degraded produce red, homeInWindow=0 o homeStale>0 producono yellow', async () => {
        // degraded
        let spy = jest.spyOn(animeAiringState, 'getSnapshot').mockResolvedValueOnce({
            docs: [{ tmdbId: '1' }],
            homeInWindow: 5,
            homeStale: 0,
            degraded: true
        });
        let res = await getIngestionStatus();
        expect(res.checks.animeAiring.status).toBe('red');
        spy.mockRestore();

        // homeInWindow = 0
        spy = jest.spyOn(animeAiringState, 'getSnapshot').mockResolvedValueOnce({
            docs: [{ tmdbId: '1' }],
            homeInWindow: 0,
            homeStale: 0,
            degraded: false
        });
        res = await getIngestionStatus();
        expect(res.checks.animeAiring.status).toBe('yellow');
        spy.mockRestore();

        // homeStale > 0
        spy = jest.spyOn(animeAiringState, 'getSnapshot').mockResolvedValueOnce({
            docs: [{ tmdbId: '1' }],
            homeInWindow: 2,
            homeStale: 1,
            degraded: false
        });
        res = await getIngestionStatus();
        expect(res.checks.animeAiring.status).toBe('yellow');
        spy.mockRestore();
    });

    test('9. ITA annotations con mtime > 36h produce yellow', async () => {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const tmpFile = path.join(os.tmpdir(), `ita_test_${Date.now()}.jsonl`);
        fs.writeFileSync(tmpFile, '{"t":"movie","id":1,"ita":true}\n');
        // Imposta mtime a 40 ore fa
        const past = new Date(Date.now() - 40 * 3600 * 1000);
        fs.utimesSync(tmpFile, past, past);

        const spy = jest.spyOn(itaAnnotations, 'getSnapshot').mockResolvedValueOnce({
            error: null,
            trueCount: 10,
            nullCount: 1,
            path: tmpFile
        });

        try {
            const res = await getIngestionStatus();
            expect(res.checks.itaAnnotations.status).toBe('yellow');
            expect(res.reasons.some(r => r.includes('ita_annotations: file non aggiornato da oltre 36h'))).toBe(true);
        } finally {
            spy.mockRestore();
            try { fs.unlinkSync(tmpFile); } catch (_) {}
        }
    });
});

describe('Rotta Admin GET /api/admin/ingestion-status', () => {
    let server;
    let baseUrl;
    const TEST_ADMIN_PASS = 'super-secret-admin-pass';
    const origAdminPass = process.env.ADMIN_PASS;

    beforeAll(async () => {
        process.env.ADMIN_PASS = TEST_ADMIN_PASS;

        const app = express();
        app.use(express.json());
        const adminRouter = require('../src/api/admin');
        app.use('/api/admin', adminRouter);

        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (server) {
            await new Promise((r) => server.close(r));
        }
        if (origAdminPass !== undefined) {
            process.env.ADMIN_PASS = origAdminPass;
        } else {
            delete process.env.ADMIN_PASS;
        }
    });

    test('1. Risponde 401 se manca l header x-admin-pass', async () => {
        const res = await fetch(`${baseUrl}/api/admin/ingestion-status`);
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toContain('Non autorizzato');
    });

    test('2. Risponde 401 se x-admin-pass è errato', async () => {
        const res = await fetch(`${baseUrl}/api/admin/ingestion-status`, {
            headers: { 'x-admin-pass': 'wrong-password' }
        });
        expect(res.status).toBe(401);
    });

    test('3. Risponde 200 con x-admin-pass valido e restituisce success: true con lo stato', async () => {
        const res = await fetch(`${baseUrl}/api/admin/ingestion-status`, {
            headers: { 'x-admin-pass': TEST_ADMIN_PASS }
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(['green', 'yellow', 'red']).toContain(data.overall);
        expect(data.timestamp).toBeDefined();
        expect(Array.isArray(data.reasons)).toBe(true);
        expect(data.checks).toBeDefined();
        expect(data.checks.tmdb).toBeDefined();
        expect(data.checks.animeAiring).toBeDefined();
        expect(data.checks.animeMapping).toBeDefined();
        expect(data.checks.itaAnnotations).toBeDefined();
        expect(data.checks.posters).toBeDefined();
    });
});
