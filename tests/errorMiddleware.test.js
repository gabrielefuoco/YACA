/**
 * Un `%` non codificato nel percorso non deve diventare un 500.
 *
 * Era un difetto vero: `search=100%` faceva fallire la decodifica del parametro `:extra` di
 * Express, e il gestore degli errori (`err.statusCode || 500`) riportava 500 su una richiesta che
 * il protocollo Stremio vuole 200 con `metas: []`. Qui si prova la rotta vera.
 */
const express = require('express');
const http = require('http');
const errorMiddleware = require('../src/api/middleware/errorMiddleware');

function richiesta(server, percorso) {
    return new Promise((resolve, reject) => {
        const { port } = server.address();
        // `http.request` manda il percorso così com'è: è l'unico modo di riprodurre un `%` nudo.
        http.get({ host: '127.0.0.1', port, path: percorso }, (res) => {
            let corpo = '';
            res.on('data', (pezzo) => { corpo += pezzo; });
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(corpo); } catch { /* non JSON */ }
                resolve({ stato: res.statusCode, json, corpo });
            });
        }).on('error', reject);
    });
}

function creaApp() {
    const app = express();
    app.get(['/:user/catalog/:type/:id/:extra.json', '/:user/catalog/:type/:id.json'], (_req, res) => res.json({ metas: [{ id: 'ok' }] }));
    app.get('/:user/meta/:type/:id.json', (_req, res) => res.json({ meta: { id: 'ok' } }));
    app.get('/api/altro', (_req, res) => res.json({ ok: true }));
    app.use(errorMiddleware);
    return app;
}

describe('errorMiddleware: decodifica del percorso', () => {
    let server;

    beforeAll((done) => {
        server = creaApp().listen(0, '127.0.0.1', done);
    });

    afterAll((done) => {
        server.close(done);
    });

    it('un `%` nudo in una ricerca risponde 200 con metas vuote', async () => {
        const r = await richiesta(server, '/utente/catalog/movie/yaca_search_standard/search=100%.json');
        expect(r.stato).toBe(200);
        expect(r.json).toEqual({ metas: [] });
    });

    it('una sequenza percentuale invalida nella meta risponde 200 con meta null', async () => {
        const r = await richiesta(server, '/utente/meta/movie/%zz.json');
        expect(r.stato).toBe(200);
        expect(r.json).toEqual({ meta: null });
    });

    it('fuori dalle rotte Stremio resta un 400 chiaro', async () => {
        const r = await richiesta(server, '/api/altro?x=%zz');
        expect(r.stato).toBeLessThan(500);
    });

    it('una richiesta normale passa intatta', async () => {
        const r = await richiesta(server, '/utente/catalog/movie/yaca_home.json');
        expect(r.stato).toBe(200);
        expect(r.json).toEqual({ metas: [{ id: 'ok' }] });
    });
});
