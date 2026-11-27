/**
 * Il manifest di un utente che non esiste non è un guasto: è un addon da configurare.
 *
 * Era un 400, e Stremio legge un 400 sul manifest come «questo addon non si installa»: mostra un
 * errore invece della pagina di configurazione. La risposta giusta è il manifest radice, che
 * dichiara `configurationRequired` e porta l'utente dove si crea il profilo.
 */
const express = require('express');
const http = require('http');

jest.mock('../src/models/UserConfig', () => ({
    resolveUserConfig: jest.fn(async () => null)
}));

const stremioRouter = require('../src/api/stremio');

function get(server, percorso) {
    return new Promise((resolve, reject) => {
        const { port } = server.address();
        http.get({ host: '127.0.0.1', port, path: percorso }, (res) => {
            let corpo = '';
            res.on('data', (pezzo) => { corpo += pezzo; });
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(corpo); } catch { /* non JSON */ }
                resolve({ stato: res.statusCode, json });
            });
        }).on('error', reject);
    });
}

describe('manifest di un utente inesistente', () => {
    let server;

    beforeAll((done) => {
        const app = express();
        app.use(stremioRouter);
        server = app.listen(0, '127.0.0.1', done);
    });

    afterAll((done) => {
        server.close(done);
    });

    it('risponde 200 con il manifest da configurare, non un errore', async () => {
        const r = await get(server, '/utente-che-non-esiste/manifest.json');
        expect(r.stato).toBe(200);
        expect(r.json.id).toBe('org.stremio.yaca.catalog');
        expect(r.json.behaviorHints.configurationRequired).toBe(true);
        expect(r.json.catalogs).toEqual([]);
    });

    it('anche con una versione di configurazione nel percorso', async () => {
        const r = await get(server, '/utente-che-non-esiste/AAAAAAAA/manifest.json');
        expect(r.stato).toBe(200);
        expect(r.json.behaviorHints.configurationRequired).toBe(true);
    });

    it('la radice resta la stessa cosa', async () => {
        const r = await get(server, '/manifest.json');
        expect(r.stato).toBe(200);
        expect(r.json.behaviorHints.configurationRequired).toBe(true);
    });
});
