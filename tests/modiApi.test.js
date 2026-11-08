/**
 * Le due rotte di attivazione (ticket 01), dietro `MODI_ABILITATI`.
 *
 * Verifica la superficie HTTP vera (sessione, forma dell'errore, status):
 *  · flag OFF  -> 404, la rotta non esiste nel prodotto spento;
 *  · flag ON   -> GET elenca le cinque modalità; POST attiva; modo ignoto -> 400.
 */

const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const _jwtPrima = process.env.JWT_SECRET;
process.env.JWT_SECRET = _jwtPrima || 'segreto-test-modi-api';

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

jest.mock('../src/stremio', () => ({
    syncAllStremioData: jest.fn().mockResolvedValue({}),
    updateStremioAddonCollection: jest.fn().mockResolvedValue({ success: true })
}));

const { materializzaModi } = require('../src/profile/modo');
const UserConfig = require('../src/models/UserConfig');
const UserAccount = require('../src/models/UserAccount');
const AddonConfig = require('../src/models/AddonConfig');
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

function documento() {
    const profiles = materializzaModi({ profiles: [] }).profiles;
    return {
        uuid: 'addon-api',
        profiles,
        customCatalogs: [],
        config: {
            activeProfileId: 'modo_generale',
            activeModo: 'generale',
            configVersion: 'v1',
            manifestFingerprint: 'impronta-vecchia',
            cataloghi: { generale: [], film: [], serie: [], anime: [], bambini: [] }
        }
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

    const token = jwt.sign({ userId: 'utente-modi' }, getJwtSecret());
    validCookie = `yaca_session=${token}`;
});

afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    if (_jwtPrima === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = _jwtPrima;
});

beforeEach(() => {
    delete process.env.MODI_ABILITATI;
    jest.clearAllMocks();
    AddonConfig.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(documento()) });
    AddonConfig.updateOne.mockResolvedValue({ matchedCount: 1 });
    UserConfig.resolveUserConfig.mockResolvedValue({
        userId: 'utente-modi',
        addonUuid: 'addon-api',
        profiles: documento().profiles,
        activeProfileId: 'modo_generale',
        configVersion: 'v1',
        apiKeys: {}
    });
    UserAccount.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ userId: 'utente-modi', addonUuid: 'addon-api', apiKeys: {} })
    });
});

afterAll(() => {
    delete process.env.MODI_ABILITATI;
});

describe('flag OFF: le rotte non esistono nel prodotto spento', () => {
    it('GET /api/profilo/modi risponde 404 senza toccare la configurazione', async () => {
        const res = await request('GET', '/api/profilo/modi');
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('non_disponibile');
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });

    it('POST /api/profilo/modi/attiva risponde 404 e non scrive niente', async () => {
        const res = await request('POST', '/api/profilo/modi/attiva', { modo: 'film' });
        expect(res.status).toBe(404);
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });
});

describe('flag ON: elenco e attivazione', () => {
    beforeEach(() => {
        process.env.MODI_ABILITATI = '1';
    });

    it('GET /api/profilo/modi elenca le cinque modalità con le leve derivate', async () => {
        const res = await request('GET', '/api/profilo/modi');

        expect(res.status).toBe(200);
        expect(res.body.modi).toHaveLength(5);
        expect(res.body.attivo).toBe('generale');
        expect(res.body.modi.map(m => m.nome)).toEqual(['Generale', 'Film', 'Serie', 'Anime', 'Bambini']);
        expect(res.body.modi.find(m => m.modo === 'film').leve).toEqual({ medium: 'movie', anime: 'exclude', kids: false });
        expect(res.body.modi.filter(m => m.attivo).map(m => m.modo)).toEqual(['generale']);
    });

    it('POST /api/profilo/modi/attiva attiva una sola modalità', async () => {
        const res = await request('POST', '/api/profilo/modi/attiva', { modo: 'serie' });

        expect(res.status).toBe(200);
        expect(res.body.attivo).toBe('serie');
        expect(res.body.modi.filter(m => m.attivo).map(m => m.modo)).toEqual(['serie']);
        const set = AddonConfig.updateOne.mock.calls[0][1].$set;
        expect(set['config.activeModo']).toBe('serie');
        expect(set['config.activeProfileId']).toBe('modo_serie');
    });

    it('un modo sconosciuto risponde 400 con la forma d\'errore unica', async () => {
        const res = await request('POST', '/api/profilo/modi/attiva', { modo: 'plays' });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('modo_non_valido');
        expect(res.body.error.message).toContain('plays');
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });

    it('un corpo senza modo risponde 400 (nessun default silenzioso)', async () => {
        const res = await request('POST', '/api/profilo/modi/attiva', {});

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('modo_non_valido');
        expect(AddonConfig.updateOne).not.toHaveBeenCalled();
    });
});
