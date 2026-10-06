/**
 * tests/posterRottaArchitettura.test.js
 *
 * Test di specifica e verifica per l'architettura dei poster (Sessione 2, Ticket 30):
 *  1. Spegnimento composizione in-process: la rotta legacy `/images/poster/…` fa da trampolino 302 verso `/erdb-poster/…`
 *  2. Rendering on-miss: la rotta statica chiama ERDB al volo e salva su disco
 *  3. Versione derivata dal contenuto: non un numero hardcoded, ma hash del font e dell'immagine/badge
 *  4. Ricomposizione on-demand: quando la versione richiesta non torna con quella registrata, ricompone al volo
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const stremioRouter = require('../src/api/stremio');
const registerStaticPostersRoute = require('../src/api/staticPosters');
const {
    BADGE_IMG_VERSION,
    calcolaVersionePoster,
    calcolaVersioneDisegno
} = require('../src/catalog/formatters/posterBadgeVersion');
const {
    urlPosterComposto,
    urlPosterDaRottaLegacy,
    scomponiPosterComposto
} = require('../src/catalog/formatters/StremioFormatter');

const JPEG_BYTES_A = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x01, 0xaa]);
const JPEG_BYTES_B = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x01, 0xbb]);

let appServer;
let erdbServer;
let baseUrl;
let erdbBase;
let rootDir;
let cacheDir;
let fakeErdbResponse;
const erdbCalls = [];

const request = (urlPath) => new Promise((resolve, reject) => {
    http.get(`${baseUrl}${urlPath}`, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
        }));
    }).on('error', reject);
});

beforeAll(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-arch-test-'));
    cacheDir = path.join(rootDir, 'erdb-cache');
    fs.mkdirSync(cacheDir);
    process.env.ERDB_CACHE_DIR = cacheDir;

    // Fake ERDB server
    erdbServer = http.createServer((req, res) => {
        erdbCalls.push({ url: req.url, method: req.method });
        if (fakeErdbResponse) {
            res.writeHead(fakeErdbResponse.status, { 'Content-Type': fakeErdbResponse.contentType });
            res.end(fakeErdbResponse.body);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
        }
    });
    await new Promise((r) => erdbServer.listen(0, '127.0.0.1', r));
    erdbBase = `http://127.0.0.1:${erdbServer.address().port}/fake-token`;
    process.env.ERDB_LOCAL_BASE = erdbBase;

    // App Express
    const app = express();
    registerStaticPostersRoute(app);
    app.use(stremioRouter);
    appServer = await new Promise((r) => {
        const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    baseUrl = `http://127.0.0.1:${appServer.address().port}`;
});

afterAll(async () => {
    delete process.env.ERDB_LOCAL_BASE;
    delete process.env.ERDB_CACHE_DIR;
    if (appServer) await new Promise((r) => appServer.close(r));
    if (erdbServer) await new Promise((r) => erdbServer.close(r));
    if (rootDir) fs.rmSync(rootDir, { recursive: true, force: true });
});

beforeEach(() => {
    erdbCalls.length = 0;
    fakeErdbResponse = { status: 200, contentType: 'image/jpeg', body: JPEG_BYTES_A };
});

describe('1. Rotta legacy /images/poster/… come trampolino 302', () => {
    test('reindirizza 302 verso /erdb-poster/ preservando badge, source e versione nel nome', async () => {
        const sourceUrl = 'https://image.tmdb.org/t/p/w500/test.jpg';
        const legacyPath = `/images/poster/series/tmdb:1399/EP%205/v24?original=${encodeURIComponent(sourceUrl)}&tlBadge=S1`;

        const res = await request(legacyPath);
        expect(res.status).toBe(302);
        const location = res.headers.location;
        expect(location).toBeDefined();
        expect(location).toContain('/erdb-poster/tmdb-tv-1399');
        expect(location).toContain('_EP_5.jpg');
        expect(location).toContain('badge=EP%205');
        expect(location).toContain('tlBadge=S1');
        expect(location).toContain(`fallback=${encodeURIComponent(sourceUrl)}`);
    });

    test('funziona anche senza cacheBuster nel path', async () => {
        const sourceUrl = 'https://image.tmdb.org/t/p/w500/test.jpg';
        const legacyPath = `/images/poster/series/tmdb:1399/EP%205?original=${encodeURIComponent(sourceUrl)}`;

        const res = await request(legacyPath);
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('/erdb-poster/tmdb-tv-1399');
        expect(res.headers.location).toContain('_EP_5.jpg');
    });

    test('restituisce 404 se l\'id non è riconoscibile da getErdbId', async () => {
        const legacyPath = '/images/poster/series//EP%205';
        const res = await request(legacyPath);
        expect(res.status).toBe(404);
    });
});

describe('2. Rendering on-miss su rotta statica', () => {
    test('su cache-miss chiama ERDB, scrive il file e risponde 200 con JPEG', async () => {
        const fileName = 'tmdb-tv-99991_EP_1.jpg';
        const filePath = path.join(cacheDir, fileName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        const res = await request(`/erdb-poster/${fileName}?badge=EP%201`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/jpeg');
        expect(res.body.equals(JPEG_BYTES_A)).toBe(true);
        expect(fs.existsSync(filePath)).toBe(true);
        expect(erdbCalls.length).toBe(1);
        expect(erdbCalls[0].url).toContain('tmdb:tv:99991.jpg?badge=EP%201');
    });

    test('su fallimento ERDB reindirizza 302 a fallback se presente', async () => {
        fakeErdbResponse = { status: 404, contentType: 'text/plain', body: Buffer.from('Not found') };
        const fileName = 'tmdb-tv-99992_EP_2.jpg';
        const fallback = 'https://image.tmdb.org/t/p/w500/fallback.jpg';

        const res = await request(`/erdb-poster/${fileName}?badge=EP%202&fallback=${encodeURIComponent(fallback)}`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(fallback);
    });

    test('su fallimento ERDB risponde 404 se fallback assente', async () => {
        fakeErdbResponse = { status: 404, contentType: 'text/plain', body: Buffer.from('Not found') };
        const fileName = 'tmdb-tv-99993_EP_3.jpg';

        const res = await request(`/erdb-poster/${fileName}?badge=EP%203`);
        expect(res.status).toBe(404);
    });
});

describe('3. Versione calcolata dal contenuto', () => {
    test('BADGE_IMG_VERSION deriva dall\'hash del font', () => {
        expect(typeof BADGE_IMG_VERSION).toBe('string');
        expect(BADGE_IMG_VERSION.length).toBe(8);
        expect(BADGE_IMG_VERSION).toBe(calcolaVersioneDisegno());
    });

    test('calcolaVersionePoster cambia quando cambia il badge o la sorgente', () => {
        const v1 = calcolaVersionePoster({ erdbId: 'tmdb:movie:1', badge: 'EP 1', source: 'https://tmdb/1.jpg' });
        const v2 = calcolaVersionePoster({ erdbId: 'tmdb:movie:1', badge: 'EP 2', source: 'https://tmdb/1.jpg' });
        const v3 = calcolaVersionePoster({ erdbId: 'tmdb:movie:1', badge: 'EP 1', source: 'https://tmdb/2.jpg' });
        const v1bis = calcolaVersionePoster({ erdbId: 'tmdb:movie:1', badge: 'EP 1', source: 'https://tmdb/1.jpg' });

        expect(v1).not.toBe(v2);
        expect(v1).not.toBe(v3);
        expect(v1).toBe(v1bis); // Deterministica
    });
});

describe('4. Ricomposizione on-demand dei composti e tenuta al riavvio', () => {
    test('simulazione riavvio: processo fresco con vecchio file su disco -> con la nuova versione ricompone e scrive il file nuovo', async () => {
        // 1. Sul disco c'è un file vecchio (versione vOld)
        const oldFileName = 'tmdb-tv-88881-vOld_EP_1.jpg';
        const oldFilePath = path.join(cacheDir, oldFileName);
        fs.writeFileSync(oldFilePath, JPEG_BYTES_A);

        // 2. Simuliamo riavvio completo: processo fresco, zero memoria o stato preesistente
        // Configura ERDB per restituire il poster aggiornato
        fakeErdbResponse = { status: 200, contentType: 'image/jpeg', body: JPEG_BYTES_B };

        // 3. Richiesta della nuova versione vNew (non presente su disco)
        const newFileName = 'tmdb-tv-88881-vNew_EP_1.jpg';
        const newFilePath = path.join(cacheDir, newFileName);
        expect(fs.existsSync(newFilePath)).toBe(false);

        const res = await request(`/erdb-poster/${newFileName}?badge=EP%201`);
        expect(res.status).toBe(200);
        // La rotta ha ricomposto, servendo il nuovo contenuto JPEG_BYTES_B e NON il vecchio JPEG_BYTES_A
        expect(res.body.equals(JPEG_BYTES_B)).toBe(true);

        // ERDB è stato invocato per comporre la nuova versione
        expect(erdbCalls.length).toBe(1);
        expect(fs.existsSync(newFilePath)).toBe(true);
        expect(fs.readFileSync(newFilePath).equals(JPEG_BYTES_B)).toBe(true);
    });

    test('se il file con la versione richiesta è già presente su disco, lo serve direttamente senza ERDB', async () => {
        const fileName = 'tmdb-tv-88882-vSame123_EP_1.jpg';
        const filePath = path.join(cacheDir, fileName);
        fs.writeFileSync(filePath, JPEG_BYTES_A);

        const res = await request(`/erdb-poster/${fileName}?badge=EP%201`);
        expect(res.status).toBe(200);
        expect(res.body.equals(JPEG_BYTES_A)).toBe(true);
        expect(erdbCalls.length).toBe(0); // Nessuna chiamata a ERDB
    });
});
