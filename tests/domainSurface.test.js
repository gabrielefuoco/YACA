/**
 * TEST SUPERFICIE DI DOMINIO (Ticket 10)
 *
 * Collauda tutte le nuove rotte di dominio:
 * - Contratto di errore unico: { error: { code, message } }
 * - Autenticazione di sessione obbligatoria (nessun userId accettato dal client)
 * - Nessun IDOR su /sync-status/:userId
 * - Misura delle dimensioni del payload (GET /api/user/:userId vs GET /api/profilo)
 */
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const _jwtPrima = process.env.JWT_SECRET;
process.env.JWT_SECRET = _jwtPrima || 'segreto-test-ticket-10';

// Mocks per i modelli e servizi
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
    leggiLibreria: jest.fn(),
    trovaItemLibreria: jest.fn(),
    salvaItemLibreria: jest.fn(),
    normalizeLegacyPosterHost: jest.fn((p) => p),
    applyDuplicateMarks: jest.fn(),
    previewWatchedLibrary: jest.fn(),
    removeWatchedLibrary: jest.fn(),
    cronologiaDi: jest.fn(),
    LibraryConverterService: { convertAll: jest.fn().mockResolvedValue({}) },
    LibrarySyncService: { normalizeSyncItemId: jest.fn((id) => id) }
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => {
    const actual = jest.requireActual('../src/catalog/providers/DuckDbProvider');
    return {
        ...actual,
        getDuckDbCatalogFromFilters: jest.fn().mockResolvedValue([]),
        getDuckDbCatalogFromPreset: jest.fn().mockResolvedValue([]),
        getDuckDbMetaDetails: jest.fn().mockResolvedValue(null)
    };
});

jest.mock('../src/catalog/tier2Search', () => ({
    searchTier2: jest.fn(() => []),
    searchLearnedTitles: jest.fn(async () => []),
    closeTier2Search: jest.fn()
}));

jest.mock('../src/clients/graphClient', () => ({
    raccomanda: jest.fn().mockResolvedValue({
        versioni: { artefatto: 'art-1', ricetta: 'ric-1' },
        liste: [
            { ruolo: 'il_tuo_mondo', tipo: 'il_tuo_mondo', titoli: [{ tmdbId: 100, medium: 'movie', punteggio: 0.95 }] }
        ]
    })
}));

jest.mock('../src/stremio/client', () => ({
    stremioClient: {
        post: jest.fn().mockResolvedValue({ data: { result: { authKey: 'stremio-key-mock', user: { email: 'test@example.com' } } } })
    }
}));

jest.mock('../src/clients/trakt', () => ({
    traktClient: {
        post: jest.fn().mockResolvedValue({
            data: {
                device_code: 'dev-123',
                user_code: 'USR123',
                verification_url: 'https://trakt.tv/activate',
                expires_in: 600,
                interval: 5,
                access_token: 'trakt-tok-123',
                refresh_token: 'trakt-ref-123'
            }
        })
    },
    checkTraktHeartbeat: jest.fn().mockResolvedValue({ healthy: true })
}));

jest.mock('../src/clients/tmdb', () => ({
    createTmdbClient: jest.fn(() => ({
        get: jest.fn().mockImplementation((url) => {
            if (url === '/configuration') return Promise.resolve({ data: { images: {} } });
            if (url.includes('/search/multi')) return Promise.resolve({ data: { results: [{ id: 1, title: 'Matrix' }] } });
            if (url.includes('/search/keyword')) return Promise.resolve({ data: { results: [{ id: 10, name: 'cyberpunk' }] } });
            if (url.includes('/search/person')) return Promise.resolve({ data: { results: [{ id: 20, name: 'Keanu Reeves' }] } });
            if (url.includes('/genre/movie/list') || url.includes('/genre/tv/list')) {
                return Promise.resolve({ data: { genres: [{ id: 28, name: 'Azione' }] } });
            }
            return Promise.resolve({ data: {} });
        })
    }))
}));

jest.mock('../src/stremio/catalogHandler', () => ({
    catalogHandler: jest.fn().mockResolvedValue({
        metas: Array.from({ length: 30 }, (_, i) => ({
            id: `tmdb:${i + 1}`,
            name: `Titolo ${i + 1}`,
            releaseInfo: '2024',
            vote_average: 8.0,
            tlBadge: i % 2 === 0
        }))
    })
}));

const UserConfig = require('../src/models/UserConfig');
const UserAccount = require('../src/models/UserAccount');
const AddonConfig = require('../src/models/AddonConfig');
const TasteProfile = require('../src/models/TasteProfile');
const library = require('../src/library');
const { getJwtSecret } = require('../src/api/auth/index');

const profiloRouter = require('../src/api/profilo');
const configurazioneRouter = require('../src/api/configurazione');
const ricercaRouter = require('../src/api/ricerca');
const mondiRouter = require('../src/api/mondi');
const stremioRoutes = require('../src/api/stremio');
const {
    stremioAuthHandler,
    traktDisconnectHandler,
    traktHealthHandler,
    traktCodeHandler,
    traktTokenHandler
} = require('../src/api/auth/index');
const { richiedeSessione } = require('../src/middleware/sessione');

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
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (_e) { parsed = data; }
                resolve({
                    status: res.statusCode,
                    body: parsed,
                    rawSize: Buffer.byteLength(data),
                    headers: res.headers
                });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    // Rotte di dominio
    app.use('/api/profilo', profiloRouter);
    app.use('/api/configurazione', configurazioneRouter);
    app.use('/api/ricerca', ricercaRouter);
    app.use('/api/mondi', mondiRouter);

    // Auth rotte
    app.post('/api/auth/stremio', stremioAuthHandler);
    app.delete('/api/auth/trakt', richiedeSessione, traktDisconnectHandler);
    app.get('/api/auth/trakt', richiedeSessione, traktHealthHandler);
    app.post('/api/auth/trakt/code', richiedeSessione, traktCodeHandler);
    app.post('/api/auth/trakt/token', richiedeSessione, traktTokenHandler);

    // Rotte legacy
    app.use('/', stremioRoutes);
    app.get('/api/user/:userId', async (req, res) => {
        const u = await UserConfig.resolveUserConfig(req.params.userId);
        if (!u) return res.status(404).json({ error: 'Utente non trovato' });
        const { getHeroUiGroups } = require('../src/catalog/registry');
        res.json({
            ...u,
            hasGlobalErdb: true,
            heroCatalogs: getHeroUiGroups()
        });
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    const token = jwt.sign({ userId: 'utente-test-123' }, getJwtSecret());
    validCookie = `yaca_session=${token}`;
});

afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (_jwtPrima === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = _jwtPrima;
});

describe('Superficie di dominio: autenticazione e forma errore unica', () => {
    const rotteProtette = [
        ['GET', '/api/profilo'],
        ['GET', '/api/profilo/libreria'],
        ['GET', '/api/profilo/sincronizzazione'],
        ['POST', '/api/profilo/sincronizzazione'],
        ['POST', '/api/profilo/aggiorna'],
        ['POST', '/api/configurazione'],
        ['POST', '/api/configurazione/anteprima'],
        ['POST', '/api/configurazione/verifica'],
        ['GET', '/api/configurazione/preset'],
        ['GET', '/api/ricerca?tipo=titolo&q=matrix'],
        ['POST', '/api/mondi'],
        ['GET', '/api/auth/trakt'],
        ['DELETE', '/api/auth/trakt'],
        ['GET', '/sync-status/utente-test-123']
    ];

    test.each(rotteProtette)('%s %s senza cookie risponde 401 con error.code non_autenticato', async (method, path) => {
        const res = await request(method, path, null, null);
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error');
        expect(res.body.error).toHaveProperty('code', 'non_autenticato');
        expect(typeof res.body.error.message).toBe('string');
    });
});

describe('GET /sync-status/:userId: chiusura IDOR e session check', () => {
    test('con sessione per utente-test-123 ignora :userId diverso e risponde per l utente in sessione', async () => {
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'utente-test-123', addonUuid: 'uuid-123' })
        });
        AddonConfig.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                uuid: 'uuid-123',
                syncStatus: { isSyncing: false, total: 5, current: 5, lastSync: '2026-10-17' }
            })
        });

        // Chiede sync-status di "vittima-idor" passando il cookie di "utente-test-123"
        const res = await request('GET', '/sync-status/vittima-idor');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(5);
        // Verifica che la query sia stata fatta con utente-test-123 (nessun IDOR!)
        expect(UserAccount.findOne).toHaveBeenCalledWith({ userId: 'utente-test-123' });
    });
});

describe('Rotte /api/profilo/*', () => {
    test('GET /api/profilo restituisce il profilo e omette syncStatus/libreria pesante', async () => {
        UserConfig.resolveUserConfig.mockResolvedValueOnce({
            userId: 'utente-test-123',
            email: 'test@yaca.local',
            addonUuid: 'uuid-123',
            profiles: [{ id: 'global', name: 'Generale', catalogs: [] }],
            activeProfileId: 'global',
            configVersion: 'v1.0',
            customCatalogs: [],
            apiKeys: { stremio: 'stremio-key', tmdb: 'tmdb-key' },
            syncStatus: { hugeQueue: Array(100).fill('dati-pesanti') }
        });

        const res = await request('GET', '/api/profilo');
        expect(res.status).toBe(200);
        expect(res.body.userId).toBe('utente-test-123');
        expect(res.body.profiles).toBeDefined();
        expect(res.body.heroCatalogs).toBeDefined();
        // syncStatus NON fa parte del payload di /api/profilo (è rotta a sé)
        expect(res.body.syncStatus).toBeUndefined();
    });

    test('GET /api/profilo/libreria restituisce gli item dell utente', async () => {
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'utente-test-123', addonUuid: 'uuid-123' })
        });
        library.leggiLibreria.mockResolvedValueOnce([
            { itemId: 'tt123', name: 'Film 1', type: 'movie' }
        ]);

        const res = await request('GET', '/api/profilo/libreria');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].itemId).toBe('tt123');
    });

    test('POST /api/profilo/sincronizzazione orchestra l avvio del sync sul server', async () => {
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'utente-test-123', addonUuid: 'uuid-123' })
        });
        TasteProfile.updateOne.mockResolvedValueOnce({ acknowledged: true });

        const res = await request('POST', '/api/profilo/sincronizzazione', { profileId: 'global' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(TasteProfile.updateOne).toHaveBeenCalledWith(
            { owner: 'utente-test-123', context: 'global' },
            expect.objectContaining({ $set: expect.objectContaining({ 'syncStatus.isSyncing': true }) }),
            { upsert: true }
        );
    });

    test('POST /api/profilo/aggiorna svuota le cache e risponde con successo', async () => {
        const res = await request('POST', '/api/profilo/aggiorna');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('Rotte /api/configurazione/*', () => {
    test('POST /api/configurazione/anteprima restituisce card con tetto ~20 e diagnosi filtri', async () => {
        UserConfig.resolveUserConfig.mockResolvedValueOnce({
            userId: 'utente-test-123',
            profiles: [{ id: 'global', settings: { kidsMode: false } }]
        });

        const res = await request('POST', '/api/configurazione/anteprima', { id: 'preset_pop_movies' });
        expect(res.status).toBe(200);
        expect(res.body.items.length).toBeLessThanOrEqual(20);
        expect(res.body.diagnosi).toBeDefined();
        expect(res.body.diagnosi).toHaveProperty('candidati');
        expect(res.body.diagnosi).toHaveProperty('entrati');
        expect(res.body.diagnosi).toHaveProperty('tagliati');
    });

    test('POST /api/configurazione/verifica valida chiavi TMDB e segnala chiavi non valide', async () => {
        const resValida = await request('POST', '/api/configurazione/verifica', { tmdbKey: 'tmdb-valida' });
        expect(resValida.status).toBe(200);
        expect(resValida.body.valida).toBe(true);
        expect(resValida.body.verificati.tmdb).toBe(true);

        const resVuota = await request('POST', '/api/configurazione/verifica', {});
        expect(resVuota.status).toBe(400);
        expect(resVuota.body.error.code).toBe('richiesta_non_valida');
    });

    test('GET /api/configurazione/preset restituisce i preset catalogo', async () => {
        const res = await request('GET', '/api/configurazione/preset');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.presets)).toBe(true);
        expect(res.body.heroCatalogs).toBeDefined();
    });
});

describe('GET /api/ricerca (una sola rotta con parametro tipo)', () => {
    test('ricerca tipo=titolo esegue multi search', async () => {
        process.env.TMDB_API_KEY = 'tmdb-test-key';
        const res = await request('GET', '/api/ricerca?tipo=titolo&q=matrix');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.results)).toBe(true);
        expect(res.body.results[0].title).toBe('Matrix');
    });

    test('tipo non valido restituisce 400 richiesta_non_valida', async () => {
        const res = await request('GET', '/api/ricerca?tipo=inventato&q=test');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('richiesta_non_valida');
    });
});

describe('POST /api/mondi', () => {
    test('POST /api/mondi legge cronologia e restituisce raccomandazioni mondi', async () => {
        library.cronologiaDi.mockResolvedValueOnce([
            { tmdbId: 100, type: 'movie', signals: [{ type: 'loved' }] }
        ]);

        const res = await request('POST', '/api/mondi', { profileId: 'global', quante: 2 });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.mondi).toBeDefined();
        expect(res.body.mondi[0].ruolo).toBe('il_tuo_mondo');
    });
});

describe('Auth routes: Stremio e Trakt device flow', () => {
    test('POST /api/auth/stremio autentica credenziali Stremio', async () => {
        const res = await request('POST', '/api/auth/stremio', { email: 'user@test.com', password: 'password123' }, null);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.authKey).toBe('stremio-key-mock');
    });

    test('POST /api/auth/trakt/code e token salvano il token nel server senza inviarlo al browser', async () => {
        process.env.TRAKT_CLIENT_ID = 'test-client-id';
        process.env.TRAKT_CLIENT_SECRET = 'test-client-secret';

        const resCode = await request('POST', '/api/auth/trakt/code');
        expect(resCode.status).toBe(200);
        expect(resCode.body.user_code).toBe('USR123');

        UserAccount.findOneAndUpdate.mockResolvedValueOnce({ userId: 'utente-test-123' });

        const resToken = await request('POST', '/api/auth/trakt/token', { device_code: 'dev-123' });
        expect(resToken.status).toBe(200);
        expect(resToken.body.success).toBe(true);
        expect(resToken.body.connected).toBe(true);
        // Il token NON deve uscire in chiaro nella risposta HTTP al browser
        expect(resToken.body.access_token).toBeUndefined();
        expect(resToken.body.refresh_token).toBeUndefined();
        expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'utente-test-123' },
            expect.objectContaining({
                $set: expect.objectContaining({ 'apiKeys.trakt': 'trakt-tok-123' })
            }),
            { returnDocument: 'after' }
        );
    });

    test('DELETE /api/auth/trakt disconnette Trakt per la sessione', async () => {
        UserAccount.findOneAndUpdate.mockResolvedValueOnce({ userId: 'utente-test-123' });
        const res = await request('DELETE', '/api/auth/trakt');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(UserAccount.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'utente-test-123' },
            { $unset: { 'apiKeys.trakt': 1, 'apiKeys.traktRefreshToken': 1, 'apiKeys.traktExpiresAt': 1 } },
            { returnDocument: 'after' }
        );
    });
});

describe('Misura del payload: GET /api/user/:userId vs GET /api/profilo', () => {
    test('misura le dimensioni in byte: GET /api/profilo è più compatto', async () => {
        const fullUserMock = {
            userId: 'utente-test-123',
            email: 'utente@yaca.local',
            addonUuid: 'addon-uuid-123',
            profiles: [
                {
                    id: 'global',
                    name: 'Generale',
                    catalogs: [{ id: 'cat1', name: 'Top Film' }, { id: 'cat2', name: 'Serie TV' }],
                    settings: { kidsMode: false, typeSelectors: { film: true, serie: true, anime: 'exclude' } },
                    raw_ui_state: { selectedPresets: ['preset1', 'preset2'], catalogOrder: ['cat1', 'cat2'] }
                }
            ],
            activeProfileId: 'global',
            configVersion: 'v2.1',
            customCatalogs: [{ id: 'custom-1', name: 'I Miei Preferiti' }],
            apiKeys: {
                stremio: 'stremio-auth-token-1234567890',
                tmdb: 'tmdb-api-key-abcdef',
                mistral: 'mistral-api-key-xyz',
                trakt: 'trakt-token-long-string-12345',
                traktRefreshToken: 'trakt-refresh-token-secret',
                traktExpiresAt: new Date().toISOString()
            },
            // Dati storici/pesanti presenti nella vecchia rotta
            syncStatus: {
                isSyncing: false,
                total: 250,
                current: 250,
                phase: 'idle',
                lastSync: '2026-10-17T08:00:00.000Z',
                historyQueueSample: Array(50).fill({ id: 'item', title: 'Titolo storico lungo di esempio per il payload' })
            },
            lastStremioSync: '2026-10-17T07:00:00.000Z',
            nextSyncInterval: 28800000
        };

        UserConfig.resolveUserConfig.mockResolvedValue(fullUserMock);

        const resPrima = await request('GET', '/api/user/utente-test-123');
        const resDopo = await request('GET', '/api/profilo');

        expect(resPrima.status).toBe(200);
        expect(resDopo.status).toBe(200);

        const bytesPrima = resPrima.rawSize;
        const bytesDopo = resDopo.rawSize;

        console.log(`[MISURA PAYLOAD] GET /api/user/:userId = ${bytesPrima} byte`);
        console.log(`[MISURA PAYLOAD] GET /api/profilo      = ${bytesDopo} byte`);
        console.log(`[MISURA PAYLOAD] Risparmio: ${bytesPrima - bytesDopo} byte (-${(((bytesPrima - bytesDopo) / bytesPrima) * 100).toFixed(1)}%)`);

        expect(bytesDopo).toBeLessThan(bytesPrima);
    });
});
