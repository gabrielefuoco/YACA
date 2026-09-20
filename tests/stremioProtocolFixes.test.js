const express = require('express');
const axios = require('axios');
const http = require('http');
const stremioRouter = require('../src/api/stremio');
const { buildCatalogQuery } = require('../src/db/queryBuilder');
const DuckDbProvider = require('../src/catalog/providers/DuckDbProvider');
const duckDbStore = require('../src/db/duckDbStore');
const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');

// Utente inesistente: il protocollo Stremio vuole HTTP 200 con payload vuoto
jest.mock('../src/models/UserConfig', () => ({
    resolveUserConfig: jest.fn(async () => null)
}));

describe('Stremio Protocol Fixes', () => {
    let server;
    let baseUrl;

    beforeAll((done) => {
        const app = express();
        app.use(stremioRouter);
        server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            done();
        });
    });

    afterAll((done) => {
        if (server) {
            server.close(done);
        } else {
            done();
        }
    });

    describe('(a) HTTP 200 con payload vuoto per utente inesistente', () => {
        test('catalog endpoint risponde con HTTP 200 e { metas: [] }', async () => {
            const res = await axios.get(`${baseUrl}/non_existent_handle_xyz/catalog/movie/top.json`, {
                validateStatus: () => true
            });
            expect(res.status).toBe(200);
            expect(res.data).toEqual({ metas: [] });
        });

        test('meta endpoint risponde con HTTP 200 e { meta: null }', async () => {
            const res = await axios.get(`${baseUrl}/non_existent_handle_xyz/meta/movie/tt1234567.json`, {
                validateStatus: () => true
            });
            expect(res.status).toBe(200);
            expect(res.data).toEqual({ meta: null });
        });

        test('stream endpoint risponde con HTTP 200 e { streams: [] }', async () => {
            const res = await axios.get(`${baseUrl}/non_existent_handle_xyz/stream/movie/tt1234567.json`, {
                validateStatus: () => true
            });
            expect(res.status).toBe(200);
            expect(res.data).toEqual({ streams: [] });
        });
    });

    describe('(b) Paginazione a step 100 e calcolo offset corretto', () => {
        test('buildCatalogQuery genera LIMIT 100 e OFFSET corretto per step di 100', async () => {
            const preset = { type: 'movie', where: [] };

            const sqlPage0 = await buildCatalogQuery(preset, 0);
            expect(sqlPage0).toContain('LIMIT 100 OFFSET 0');

            const sqlPage1 = await buildCatalogQuery(preset, 100);
            expect(sqlPage1).toContain('LIMIT 100 OFFSET 100');

            const sqlPage2 = await buildCatalogQuery(preset, 200);
            expect(sqlPage2).toContain('LIMIT 100 OFFSET 200');
        });

        test('buildCatalogQuery FTS rispetta LIMIT 100 e OFFSET skip', async () => {
            const ftsPreset = { type: 'movie', where: [{ _fts: 'Inception' }] };

            const sqlFts0 = await buildCatalogQuery(ftsPreset, 0);
            expect(sqlFts0).toContain('LIMIT 100 OFFSET 0');

            const sqlFts100 = await buildCatalogQuery(ftsPreset, 100);
            expect(sqlFts100).toContain('LIMIT 100 OFFSET 100');
        });

        test('DuckDbProvider getDuckDbCatalogFromPreset e getDuckDbCatalogFromFilters hanno default limit 100', async () => {
            const querySpy = jest.spyOn(duckDbStore, 'query').mockResolvedValue([]);

            await DuckDbProvider.getDuckDbCatalogFromPreset({ type: 'movie', where: [] }, 0);
            expect(querySpy).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT 100 OFFSET 0'));

            await DuckDbProvider.getDuckDbCatalogFromPreset({ type: 'movie', where: [] }, 100);
            expect(querySpy).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT 100 OFFSET 100'));

            await DuckDbProvider.getDuckDbCatalogFromFilters({}, 'movie', 0);
            expect(querySpy).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT 100 OFFSET 0'));

            await DuckDbProvider.getDuckDbCatalogFromFilters({}, 'movie', 100);
            expect(querySpy).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT 100 OFFSET 100'));

            querySpy.mockRestore();
        });

    });
});
