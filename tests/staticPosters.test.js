/**
 * tests/staticPosters.test.js
 *
 * Servire i poster già composti come file statici (`GET /erdb-poster/:file`).
 * Il contratto qui verificato è di sicurezza più che di formato:
 * - un file presente viene servito con il content-type giusto e cache lunga;
 * - un nome che prova a uscire dalla cartella (`..`, `/`) riceve 404 e non legge nulla fuori;
 * - un file assente (o cartella assente) è 404 con cache corta, così il poster può comparire
 *   entro pochi minuti.
 *
 * Non c'è supertest nel progetto: si avvia un server vero su porta effimera e si interroga con
 * `http`, così si verifica davvero la rotta (parametri, header, corpo) e non un handler chiamato a mano.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const registerStaticPostersRoute = require('../src/api/staticPosters');

const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x01]);
const WEBP_BYTES = Buffer.from('RIFF....WEBPVP8 fake-payload');
const SECRET_BYTES = Buffer.from('SEGRETO-DA-NON-CONSEGNARE');

let server;
let baseUrl;
let rootDir;      // cartella padre usata dai test
let cacheDir;     // cartella dei poster (ERDB_CACHE_DIR)
let secretFile;   // file FUORI dalla cartella, da non poter mai servire
const previousCacheDir = process.env.ERDB_CACHE_DIR;

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
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaca-static-posters-'));
    cacheDir = path.join(rootDir, 'erdb-cache');
    fs.mkdirSync(cacheDir);

    fs.writeFileSync(path.join(cacheDir, 'poster.jpg'), JPG_BYTES);
    fs.writeFileSync(path.join(cacheDir, 'poster.JPEG'), JPG_BYTES);
    fs.writeFileSync(path.join(cacheDir, 'poster.webp'), WEBP_BYTES);
    fs.writeFileSync(path.join(cacheDir, 'notes.txt'), 'non è un poster');

    secretFile = path.join(rootDir, 'secret.jpg');
    fs.writeFileSync(secretFile, SECRET_BYTES);

    process.env.ERDB_CACHE_DIR = cacheDir;

    const app = express();
    registerStaticPostersRoute(app);
    server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previousCacheDir === undefined) delete process.env.ERDB_CACHE_DIR;
    else process.env.ERDB_CACHE_DIR = previousCacheDir;
    if (rootDir) fs.rmSync(rootDir, { recursive: true, force: true });
});

describe('Poster statici serviti come file', () => {
    test('un file esistente viene servito con il content-type giusto e cache lunga', async () => {
        const jpg = await request('/erdb-poster/poster.jpg');
        expect(jpg.status).toBe(200);
        expect(jpg.headers['content-type']).toBe('image/jpeg');
        expect(jpg.headers['cache-control']).toBe('public, max-age=86400');
        expect(jpg.body.equals(JPG_BYTES)).toBe(true);

        // Estensioni equivalenti e maiuscole: stessa immagine, content-type coerente.
        const jpeg = await request('/erdb-poster/poster.JPEG');
        expect(jpeg.status).toBe(200);
        expect(jpeg.headers['content-type']).toBe('image/jpeg');

        const webp = await request('/erdb-poster/poster.webp');
        expect(webp.status).toBe(200);
        expect(webp.headers['content-type']).toBe('image/webp');
        expect(webp.headers['cache-control']).toBe('public, max-age=86400');
        expect(webp.body.equals(WEBP_BYTES)).toBe(true);
    });

    test('un nome con ".." riceve 404 e non serve il file fuori dalla cartella', async () => {
        const res = await request('/erdb-poster/..%2Fsecret.jpg');
        expect(res.status).toBe(404);
        expect(res.headers['cache-control']).toBe('public, max-age=300');
        expect(res.body.equals(SECRET_BYTES)).toBe(false);
        expect(res.body.toString()).not.toContain('SEGRETO');
    });

    test('un nome con "/" riceve 404 e non serve nulla fuori dalla cartella', async () => {
        for (const urlPath of [
            '/erdb-poster/..%2F..%2Fsecret.jpg',
            '/erdb-poster/%2e%2e%2fsecret.jpg',
            '/erdb-poster/sub%2Fsecret.jpg'
        ]) {
            const res = await request(urlPath);
            expect(res.status).toBe(404);
            expect(res.body.toString()).not.toContain('SEGRETO');
        }
    });

    test('un file inesistente riceve 404 con cache corta', async () => {
        const res = await request('/erdb-poster/non-esiste.jpg');
        expect(res.status).toBe(404);
        expect(res.headers['cache-control']).toBe('public, max-age=300');
    });

    test('estensioni non previste ricevono 404', async () => {
        const res = await request('/erdb-poster/notes.txt');
        expect(res.status).toBe(404);
        expect(res.headers['cache-control']).toBe('public, max-age=300');
    });

    test('una cartella che non esiste non fa crashare: 404 con cache corta', async () => {
        process.env.ERDB_CACHE_DIR = path.join(rootDir, 'cartella-che-non-esiste');
        try {
            const res = await request('/erdb-poster/poster.jpg');
            expect(res.status).toBe(404);
            expect(res.headers['cache-control']).toBe('public, max-age=300');
        } finally {
            process.env.ERDB_CACHE_DIR = cacheDir;
        }
    });

    test('il file fuori dalla cartella continua a esistere e a non essere raggiungibile', () => {
        expect(fs.existsSync(secretFile)).toBe(true);
    });
});
