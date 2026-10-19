/**
 * tests/posterVolumeContract.test.js
 *
 * Collaudo del contratto formale sul volume della cache poster (Ticket 57).
 *
 * Verifica:
 * 1. Definizione e calcolo delle versioni del volume (disegno + convenzione)
 * 2. Scrittura e lettura di versioni.json sul volume (presenza, validità, disallineamento)
 * 3. Verifica presenza poster vs promesse del nome
 * 4. Endpoint di salute e versioni (/erdb-poster/health e /erdb-poster/versioni)
 * 5. Tracciamento anomalie: richieste di file non presenti nel volume
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const registerStaticPostersRoute = require('../src/api/staticPosters');
const {
    VERSIONI_FILE_NAME,
    CONTRATTO_VERSION,
    calcolaVersioniVolume,
    scriviVersioniVolume,
    scriviVersioniVolumeSync,
    leggiVersioniVolume,
    getStatoVolume,
    registraRichiestaPoster,
    verificaPresenzaPoster,
    getStatistichePoster,
    azzeraStatistichePoster,
    volumeObserver
} = require('../src/posters/volumeContract');
const { BADGE_IMG_VERSION } = require('../src/stremio/formatters/posterBadgeVersion');

const JPEG_SAMPLE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x01, 0x77]);

describe('1. Contratto e versioni del volume (funzioni pure e I/O atomico)', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-vol-contract-'));
        azzeraStatistichePoster();
    });

    afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('calcolaVersioniVolume include contratto, disegno e convenzione deterministica', () => {
        const v = calcolaVersioniVolume();
        expect(v.contratto).toBe(CONTRATTO_VERSION);
        expect(v.schemaVersion).toBe(1);
        expect(v.versioni).toBeDefined();
        expect(v.versioni.disegno).toBe(BADGE_IMG_VERSION);
        expect(v.versioni.convenzione).toBe('calcolaVersionePoster');
    });

    test('scriviVersioniVolume e leggiVersioniVolume: ciclo scrittura/lettura allineato', async () => {
        await scriviVersioniVolume(tmpDir, { produttore: 'test-suite' });

        const targetFile = path.join(tmpDir, VERSIONI_FILE_NAME);
        expect(fs.existsSync(targetFile)).toBe(true);

        const letto = leggiVersioniVolume(tmpDir);
        expect(letto.presente).toBe(true);
        expect(letto.valido).toBe(true);
        expect(letto.contratto).toBe(CONTRATTO_VERSION);
        expect(letto.versioni.disegno).toBe(BADGE_IMG_VERSION);
        expect(letto.produttore).toBe('test-suite');
        expect(letto.motivo).toBeNull();
    });

    test('leggiVersioniVolume: rileva file assente', () => {
        const letto = leggiVersioniVolume(tmpDir);
        expect(letto.presente).toBe(false);
        expect(letto.valido).toBe(false);
        expect(letto.motivo).toBe('file_versioni_assente');
    });

    test('leggiVersioniVolume: rileva versione disegno non allineata', () => {
        const filePath = path.join(tmpDir, VERSIONI_FILE_NAME);
        const vecchio = {
            contratto: 1,
            schemaVersion: 1,
            versioni: {
                disegno: 'disegno_vecchio_1234',
                convenzione: 'calcolaVersionePoster'
            },
            produttore: 'vecchio-produttore',
            aggiornatoIl: '2026-01-01T00:00:00.000Z'
        };
        fs.writeFileSync(filePath, JSON.stringify(vecchio), 'utf8');

        const letto = leggiVersioniVolume(tmpDir);
        expect(letto.presente).toBe(true);
        expect(letto.valido).toBe(false);
        expect(letto.motivo).toContain('versione_disegno_disallineata');
    });

    test('verificaPresenzaPoster distingue file presente, file mancante e volume disallineato', async () => {
        // A. File assente e volume assente
        const v1 = verificaPresenzaPoster('non-esiste.jpg', tmpDir);
        expect(v1.ok).toBe(false);
        expect(v1.presente).toBe(false);
        expect(v1.motivo).toBe('file_mancante');

        // B. Creiamo versioni.json valido e un file immagine reale
        await scriviVersioniVolume(tmpDir);
        fs.writeFileSync(path.join(tmpDir, 'presente.jpg'), JPEG_SAMPLE);

        const v2 = verificaPresenzaPoster('presente.jpg', tmpDir);
        expect(v2.ok).toBe(true);
        expect(v2.presente).toBe(true);
        expect(v2.volumeValido).toBe(true);
        expect(v2.motivo).toBeNull();

        // C. File ancora mancante su volume valido
        const v3 = verificaPresenzaPoster('ancora-mancante.jpg', tmpDir);
        expect(v3.ok).toBe(false);
        expect(v3.presente).toBe(false);
        expect(v3.motivo).toBe('file_mancante');
    });
});

describe('2. Endpoint HTTP /erdb-poster/health e tracciamento discrepanze', () => {
    let server;
    let baseUrl;
    let rootDir;
    let cacheDir;
    const previousEnv = process.env.ERDB_CACHE_DIR;

    const request = (urlPath) => new Promise((resolve, reject) => {
        http.get(`${baseUrl}${urlPath}`, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks),
                json: () => {
                    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
                    catch { return null; }
                }
            }));
        }).on('error', reject);
    });

    beforeAll(async () => {
        rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-http-poster-'));
        cacheDir = path.join(rootDir, 'cache');
        fs.mkdirSync(cacheDir);

        process.env.ERDB_CACHE_DIR = cacheDir;

        const app = express();
        registerStaticPostersRoute(app);
        server = await new Promise((resolve) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    afterAll(async () => {
        if (server) await new Promise((r) => server.close(r));
        if (previousEnv === undefined) delete process.env.ERDB_CACHE_DIR;
        else process.env.ERDB_CACHE_DIR = previousEnv;
        if (rootDir && fs.existsSync(rootDir)) {
            fs.rmSync(rootDir, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        azzeraStatistichePoster();
    });

    test('/erdb-poster/health risponde 503 se il volume non ha versioni.json', async () => {
        // Il file versioni.json non è ancora presente
        const vPath = path.join(cacheDir, VERSIONI_FILE_NAME);
        if (fs.existsSync(vPath)) fs.unlinkSync(vPath);

        const res = await request('/erdb-poster/health');
        expect(res.status).toBe(503);
        const data = res.json();
        expect(data.ok).toBe(false);
        expect(data.volume.presente).toBe(false);
        expect(data.volume.allineato).toBe(false);
    });

    test('/erdb-poster/health risponde 200 con contratto e versioni quando versioni.json è presente', async () => {
        await scriviVersioniVolume(cacheDir, { produttore: 'erdb-builder' });

        const res = await request('/erdb-poster/health');
        expect(res.status).toBe(200);
        const data = res.json();
        expect(data.ok).toBe(true);
        expect(data.contratto).toBe(1);
        expect(data.versioni.disegno).toBe(BADGE_IMG_VERSION);
        expect(data.volume.presente).toBe(true);
        expect(data.volume.allineato).toBe(true);
        expect(data.volume.produttore).toBe('erdb-builder');
    });

    test('/erdb-poster/versioni espone lo stato sintetico delle versioni', async () => {
        await scriviVersioniVolume(cacheDir, { produttore: 'erdb-builder' });

        const res = await request('/erdb-poster/versioni');
        expect(res.status).toBe(200);
        const data = res.json();
        expect(data.ok).toBe(true);
        expect(data.versioni.disegno).toBe(BADGE_IMG_VERSION);
        expect(data.versioni.convenzione).toBe('calcolaVersionePoster');
    });

    test('la richiesta di un poster presente incrementa trovati e serve i byte', async () => {
        const testFile = 'tmdb-movie-12345.jpg';
        fs.writeFileSync(path.join(cacheDir, testFile), JPEG_SAMPLE);

        const res = await request(`/erdb-poster/${testFile}`);
        expect(res.status).toBe(200);
        expect(res.body.equals(JPEG_SAMPLE)).toBe(true);

        const stats = getStatistichePoster();
        expect(stats.richieste).toBe(1);
        expect(stats.trovati).toBe(1);
        expect(stats.mancanti).toBe(0);
    });

    test('la richiesta di un poster mancante incrementa mancanti e registra l anomalia', async () => {
        const ghost = 'tmdb-movie-888888-ghost_ITA.jpg';

        const res = await request(`/erdb-poster/${ghost}`);
        expect(res.status).toBe(404);

        const stats = getStatistichePoster();
        expect(stats.richieste).toBe(1);
        expect(stats.trovati).toBe(0);
        expect(stats.mancanti).toBe(1);
        expect(stats.ultimiMancanti).toHaveLength(1);
        expect(stats.ultimiMancanti[0].fileName).toBe(ghost);
        expect(stats.ultimiMancanti[0].motivo).toBe('file_mancante');
    });

    test('con fallback, il redirect 302 avviene come prima MA l anomalia viene comunque registrata', async () => {
        const ghost = 'tmdb-movie-999999-ghost_ITA.jpg';
        const fallbackUrl = 'https://image.tmdb.org/t/p/w500/sample.jpg';

        const res = await request(`/erdb-poster/${ghost}?fallback=${encodeURIComponent(fallbackUrl)}`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(fallbackUrl);

        // Il client ha ricevuto il fallback senza errori, MA la discrepanza del volume è ora visibile
        const stats = getStatistichePoster();
        expect(stats.mancanti).toBe(1);
        expect(stats.ultimiMancanti[0].fileName).toBe(ghost);
    });
});
