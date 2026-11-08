/**
 * Le tre rotte Esplora (ticket 05/06) sulla superficie HTTP vera:
 * sessione, forma dell'errore, status. 400 dichiarato per ogni input sbagliato.
 */

const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const _jwtPrima = process.env.JWT_SECRET;
process.env.JWT_SECRET = _jwtPrima || 'segreto-test-cataloghi-api';

jest.mock('../src/models/UserConfig', () => ({
    resolveUserConfig: jest.fn(),
    saveUser: jest.fn()
}));

jest.mock('../src/models/UserAccount', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn()
}));

jest.mock('../src/models/AddonConfig', () => ({
    findOne: jest.fn(),
    updateOne: jest.fn()
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn(),
    updateOne: jest.fn()
}));

jest.mock('../src/library', () => ({
    leggiLibreria: jest.fn().mockResolvedValue([]),
    trovaItemLibreria: jest.fn(),
    salvaItemLibreria: jest.fn(),
    normalizeLegacyPosterHost: jest.fn(p => p),
    applyDuplicateMarks: jest.fn(),
    previewWatchedLibrary: jest.fn(),
    removeWatchedLibrary: jest.fn(),
    salvaOrdineLibreria: jest.fn(),
    LibraryConverterService: { convertAll: jest.fn() },
    LibrarySyncService: { normalizeSyncItemId: jest.fn(id => id) }
}));

jest.mock('../src/stremio/shelvesResolver', () => ({
    resolveProfileShelves: jest.fn().mockResolvedValue([
        { catalog_id: 'yaca_mondi_movies', nome: 'I tuoi mondi', medium: 'movie', slot: 1, anime: false }
    ])
}));

jest.mock('../src/stremio', () => ({
    syncAllStremioData: jest.fn().mockResolvedValue({}),
    updateStremioAddonCollection: jest.fn().mockResolvedValue({ success: true })
}));

const UserConfig = require('../src/models/UserConfig');
const UserAccount = require('../src/models/UserAccount');
const AddonConfig = require('../src/models/AddonConfig');
const { updateStremioAddonCollection } = require('../src/stremio');
const { getJwtSecret } = require('../src/api/auth/index');
const profiloRouter = require('../src/api/profilo');

let server;
let port;
let validCookie;

function request(method, path, body = null, cookie = validCookie) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request({
            host: '127.0.0.1',
            port,
            path,
            method,
            headers: {
                ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...(cookie ? { Cookie: cookie } : {})
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch (_e) { parsed = data; }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function utente({ modo = 'film', cataloghi = {} } = {}) {
    return {
        userId: 'utente-esplora',
        addonUuid: 'addon-esplora',
        activeProfileId: `modo_${modo}`,
        activeModo: modo,
        cataloghi,
        configVersion: 'v1',
        manifestFingerprint: 'fp-vecchia',
        profiles: [{ id: `modo_${modo}`, modo }],
        customCatalogs: [],
        apiKeys: {}
    };
}

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/profilo', profiloRouter);

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    const token = jwt.sign({ userId: 'utente-esplora' }, getJwtSecret());
    validCookie = `yaca_session=${token}`;
});

afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    if (_jwtPrima === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = _jwtPrima;
    delete process.env.MODI_ABILITATI;
});

beforeEach(() => {
    process.env.MODI_ABILITATI = '1';
    jest.clearAllMocks();
    AddonConfig.updateOne.mockResolvedValue({ matchedCount: 1 });
    UserConfig.resolveUserConfig.mockResolvedValue(utente());
    UserAccount.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ userId: 'utente-esplora', addonUuid: 'addon-esplora', apiKeys: { stremio: 'auth-key' } })
    });
});

describe('flag OFF: le rotte non esistono nel prodotto spento', () => {
    beforeEach(() => {
        delete process.env.MODI_ABILITATI;
    });

    it.each([
        ['GET', '/api/profilo/cataloghi', null],
        ['POST', '/api/profilo/cataloghi/attiva', { id: 'preset_pop_movies', attivo: true }],
        ['POST', '/api/profilo/cataloghi/ordine', { ids: [] }]
    ])('%s %s risponde 404 e non scrive', async (method, path, body) => {
        const res = await request(method, path, body || null);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('non_disponibile');
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });
});

describe('GET /api/profilo/cataloghi', () => {
    it('restituisce modo e gruppi, senza gruppi vuoti', async () => {
        const res = await request('GET', '/api/profilo/cataloghi');

        expect(res.status).toBe(200);
        expect(res.body.modo).toBe('film');
        expect(res.body.gruppi.suggerimenti[0]).toMatchObject({
            id: 'yaca_mondi_movies',
            nome: 'I tuoi mondi',
            tipo: 'film',
            fonte: 'grafo',
            attivo: false,
            ordine: null
        });
        expect(res.body.gruppi.watchlist.map(v => v.id)).toEqual(['yaca_watchlist_movies']);
        expect(res.body.gruppi).not.toHaveProperty('creazioni');
    });

    it('un modo persistito sconosciuto è 400, non un default', async () => {
        UserConfig.resolveUserConfig.mockResolvedValue({ ...utente(), activeModo: 'play' });

        const res = await request('GET', '/api/profilo/cataloghi');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('modo_non_valido');
    });
});

describe('POST /api/profilo/cataloghi/attiva', () => {
    it('attiva, invalida il manifest e spinge la collezione Stremio', async () => {
        const res = await request('POST', '/api/profilo/cataloghi/attiva', { id: 'preset_pop_movies', attivo: true });

        expect(res.status).toBe(200);
        expect(res.body.attivo).toBe(true);
        expect(res.body.attivi).toEqual(['preset_pop_movies']);
        const set = AddonConfig.updateOne.mock.calls[0][1].$set;
        expect(set['config.cataloghi'].film).toEqual([{ id: 'preset_pop_movies', ordine: 0 }]);
        expect(set['config.pendingStremioResync']).toBe(true);
        expect(set['config.manifestFingerprint']).not.toBe('fp-vecchia');
        // la propagazione è fire-and-forget: un tick basta a vederla partire
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(updateStremioAddonCollection).toHaveBeenCalled();
    });

    it('è idempotente: doppio click, una sola scrittura', async () => {
        const user = utente({ cataloghi: { film: [{ id: 'preset_pop_movies', ordine: 0 }] } });
        UserConfig.resolveUserConfig.mockResolvedValue(user);

        const res = await request('POST', '/api/profilo/cataloghi/attiva', { id: 'preset_pop_movies', attivo: true });

        expect(res.status).toBe(200);
        expect(res.body.manifestChanged).toBe(false);
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });

    it.each([
        ['id sconosciuto', { id: 'non_esiste', attivo: true }, 'catalogo_non_valido'],
        ['id mancante', { attivo: true }, 'catalogo_non_valido'],
        ['attivo non booleano', { id: 'preset_pop_movies', attivo: 'sì' }, 'catalogo_non_valido'],
        ['catalogo non servibile nel modo', { id: 'preset_pop_series', attivo: true }, 'catalogo_non_servibile']
    ])('%s → 400 %s', async (_caso, body, codice) => {
        const res = await request('POST', '/api/profilo/cataloghi/attiva', body);

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe(codice);
        expect(typeof res.body.error.message).toBe('string');
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });
});

describe('POST /api/profilo/cataloghi/ordine', () => {
    const conAttivi = () => {
        UserConfig.resolveUserConfig.mockResolvedValue(utente({
            cataloghi: { film: [{ id: 'preset_pop_movies', ordine: 0 }, { id: 'preset_top_rated_movies', ordine: 1 }] }
        }));
    };

    it('riscrive l\'ordine e invalida il manifest', async () => {
        conAttivi();
        const res = await request('POST', '/api/profilo/cataloghi/ordine', {
            ids: ['preset_top_rated_movies', 'preset_pop_movies']
        });

        expect(res.status).toBe(200);
        expect(res.body.manifestChanged).toBe(true);
        const set = AddonConfig.updateOne.mock.calls[0][1].$set;
        expect(set['config.cataloghi'].film).toEqual([
            { id: 'preset_top_rated_movies', ordine: 0 },
            { id: 'preset_pop_movies', ordine: 1 }
        ]);
    });

    it.each([
        ['id non attivo', { ids: ['preset_pop_movies', 'preset_new_movies'] }, 'catalogo_non_attivo'],
        ['duplicati', { ids: ['preset_pop_movies', 'preset_pop_movies'] }, 'ordine_duplicato'],
        ['attivo mancante', { ids: ['preset_pop_movies'] }, 'ordine_incompleto'],
        ['ids non array', { ids: 'preset_pop_movies' }, 'ordine_non_valido'],
        ['id vuoto', { ids: ['preset_pop_movies', ''] }, 'ordine_non_valido']
    ])('%s → 400 %s', async (_caso, body, codice) => {
        conAttivi();
        const res = await request('POST', '/api/profilo/cataloghi/ordine', body);

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe(codice);
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });
});
