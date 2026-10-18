const express = require('express');
const axios = require('axios');
const http = require('http');
const stremioRouter = require('../src/api/stremio');
const { compileQuery } = require('../src/indice/compiler');
const DuckDbProvider = require('../src/indice/duckDbProvider');
const duckDbStore = require('../src/indice/duckDbStore');
const { routeCatalogRequest } = require('../src/stremio/CatalogRouter');

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
        test('compileQuery genera LIMIT ? OFFSET ? corretto per step di 100', async () => {
            const preset = { type: 'movie', where: [] };

            const res0 = await compileQuery(preset, 0, 100);
            expect(res0.sql).toContain('LIMIT ? OFFSET ?');
            expect(res0.params).toEqual(expect.arrayContaining([100, 0]));

            const res1 = await compileQuery(preset, 100, 100);
            expect(res1.sql).toContain('LIMIT ? OFFSET ?');
            expect(res1.params).toEqual(expect.arrayContaining([100, 100]));

            const res2 = await compileQuery(preset, 200, 100);
            expect(res2.sql).toContain('LIMIT ? OFFSET ?');
            expect(res2.params).toEqual(expect.arrayContaining([100, 200]));
        });

        test('compileQuery FTS rispetta LIMIT ? e OFFSET skip', async () => {
            const ftsPreset = { type: 'movie', where: [{ _fts: 'Inception' }] };

            const resFts0 = await compileQuery(ftsPreset, 0, 100);
            expect(resFts0.sql).toContain('LIMIT ? OFFSET ?');
            expect(resFts0.params).toEqual(expect.arrayContaining([100, 0]));

            const resFts100 = await compileQuery(ftsPreset, 100, 100);
            expect(resFts100.sql).toContain('LIMIT ? OFFSET ?');
            expect(resFts100.params).toEqual(expect.arrayContaining([100, 100]));
        });

        test('DuckDbProvider getDuckDbCatalogFromPreset e getDuckDbCatalogFromFilters hanno default limit 100', async () => {
            const querySpy = jest.spyOn(duckDbStore, 'query').mockResolvedValue([]);

            await DuckDbProvider.getDuckDbCatalogFromPreset({ type: 'movie', where: [] }, 0);
            expect(querySpy).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT ? OFFSET ?'), [100, 0]);

            await DuckDbProvider.getDuckDbCatalogFromPreset({ type: 'movie', where: [] }, 100);
            expect(querySpy).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT ? OFFSET ?'), [100, 100]);

            await DuckDbProvider.getDuckDbCatalogFromFilters({}, 'movie', 0);
            expect(querySpy).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT ? OFFSET ?'), [100, 0]);

            await DuckDbProvider.getDuckDbCatalogFromFilters({}, 'movie', 100);
            expect(querySpy).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT ? OFFSET ?'), [100, 100]);

            querySpy.mockRestore();
        });

    });

    describe('(c) CatalogRouter con provider che solleva: zero eccezioni, il client riceve []', () => {
        test('un provider il cui serveCatalog solleva eccezione restituisce [] e non lancia al client', async () => {
            const { registerSource, defineSourceEntry, getSource } = require('../src/ricerca');
            const originalDuckdb = getSource('duckdb');

            const crashingSource = defineSourceEntry({
                id: 'duckdb',
                name: 'DuckDB Crashing Provider',
                kind: 'index',
                appliesToCatalog: () => true,
                serveCatalog: async () => {
                    throw new Error('Database disk image is malformed or lock timeout');
                },
                appliesToSearch: () => false,
                search: async () => []
            });

            registerSource(crashingSource);

            try {
                const args = { id: 'preset_top_rated_movies', type: 'movie' };
                const result = await routeCatalogRequest(args);

                expect(result).toBeDefined();
                expect(result).toEqual([]);
            } finally {
                registerSource(originalDuckdb);
            }
        });
    });
});
