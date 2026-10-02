const express = require('express');
const axios = require('axios');
const http = require('http');
const sharp = require('sharp');
const stremioRouter = require('../src/api/stremio');

// La rotta /images/fallback non deve MAI rispondere 4xx/5xx: il client Stremio mette in
// cache l'errore e il buco a video resta nero per sempre (172 titoli su 117.006 non si
// riparavano più). I test coprono i tre casi:
//   1. solo `fallback`  → 302 al fallback
//   2. nessuno dei due  → 200 con immagine valida e Cache-Control corto
//   3. url + fallback   → invariato (redirect a url se esiste, al fallback se 404)

jest.mock('../src/models/UserConfig', () => ({
    resolveUserConfig: jest.fn(async () => null)
}));

describe('Rotta /images/fallback', () => {
    let addonServer;
    let addonBaseUrl;
    let originServer;
    let originBaseUrl;

    beforeAll((done) => {
        // Server "origin" finto: /ok risponde 200, /missing risponde 404, così i test
        // non dipendono dalla rete e axios.head fa davvero il giro completo.
        originServer = http.createServer((req, res) => {
            if (req.url.startsWith('/ok')) {
                res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                return res.end('ok');
            }
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('missing');
        });

        originServer.listen(0, '127.0.0.1', () => {
            originBaseUrl = `http://127.0.0.1:${originServer.address().port}`;

            const app = express();
            app.use(stremioRouter);
            addonServer = http.createServer(app);
            addonServer.listen(0, '127.0.0.1', () => {
                addonBaseUrl = `http://127.0.0.1:${addonServer.address().port}`;
                done();
            });
        });
    });

    afterAll((done) => {
        const close = (server, next) => (server ? server.close(next) : next());
        close(addonServer, () => close(originServer, done));
    });

    const get = async (query) => {
        const pairs = Object.entries(query)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
        return axios.get(`${addonBaseUrl}/images/fallback${pairs.length ? `?${pairs.join('&')}` : ''}`, {
            maxRedirects: 0,
            validateStatus: () => true,
            responseType: 'arraybuffer'
        });
    };

    test('(1) fallback senza url → 302 al fallback, non un errore', async () => {
        const fallback = 'https://image.tmdb.org/t/p/w500/abc.jpg';
        const res = await get({ fallback });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(fallback);
    });

    test('(2) senza url e senza fallback → 200 con immagine valida e Cache-Control corto', async () => {
        const res = await get({});

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/^image\/png/);
        expect(res.headers['cache-control']).toMatch(/public/);

        const maxAge = Number(/max-age=(\d+)/.exec(res.headers['cache-control'])?.[1]);
        expect(Number.isFinite(maxAge)).toBe(true);
        expect(maxAge).toBeGreaterThan(0);
        expect(maxAge).toBeLessThanOrEqual(3600); // "corto": il client deve riprovare presto

        // Il corpo è un PNG davvero decodificabile, non una stringa d'errore.
        const png = Buffer.from(res.data);
        expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
        const meta = await sharp(png).metadata();
        expect(meta.format).toBe('png');
        expect(meta.width).toBe(1);
        expect(meta.height).toBe(1);
    });

    test('(2b) fallback vuoto (fallback=) → immagine valida, mai 4xx/5xx', async () => {
        const res = await get({ fallback: '' });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/^image\/png/);
    });

    test('(3a) url esistente + fallback → 302 a url (comportamento invariato)', async () => {
        const url = `${originBaseUrl}/ok/1.jpg`;
        const res = await get({ url, fallback: 'https://image.tmdb.org/t/p/w500/abc.jpg' });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(url);
    });

    test('(3b) url che 404 + fallback → 302 al fallback (comportamento invariato)', async () => {
        const url = `${originBaseUrl}/missing/1.jpg`;
        const fallback = 'https://image.tmdb.org/t/p/w500/abc.jpg';
        const res = await get({ url, fallback });

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(fallback);
    });

    test('(3c) seconda richiesta dopo il 404 → 302 al fallback dalla cache (nessun giro di rete)', async () => {
        const url = `${originBaseUrl}/missing/2.jpg`;
        const fallback = 'https://image.tmdb.org/t/p/w500/def.jpg';

        const first = await get({ url, fallback });
        expect(first.status).toBe(302);
        expect(first.headers.location).toBe(fallback);

        const second = await get({ url, fallback });
        expect(second.status).toBe(302);
        expect(second.headers.location).toBe(fallback);
    });

    test('(3d) url che 404 senza fallback → immagine valida, mai 4xx/5xx', async () => {
        const url = `${originBaseUrl}/missing/3.jpg`;
        const res = await get({ url });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/^image\/png/);
    });

    test('(4) nessuna combinazione di parametri produce 4xx/5xx', async () => {
        const combinations = [
            {},
            { url: '' },
            { fallback: '' },
            { url: '', fallback: '' },
            { url: `${originBaseUrl}/ok/4.jpg` },
            { url: `${originBaseUrl}/missing/4.jpg`, fallback: '' },
            { fallback: 'https://image.tmdb.org/t/p/w500/ghi.jpg' }
        ];

        for (const combo of combinations) {
            const res = await get(combo);
            expect(res.status).toBeLessThan(400);
        }
    });
});