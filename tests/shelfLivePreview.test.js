/**
 * tests/shelfLivePreview.test.js
 *
 * ITEM 2 — VERIFICA END-TO-END ANTEPRIMA DAL VIVO PER GLI SCAFFALI DEL GRAFO (V45).
 *
 * Verifica:
 * 1. Chiamata a POST /api/configurazione/anteprima con id scaffale dinamico (yaca_12609_series).
 * 2. Risoluzione tramite il path degli scaffali (graphClient.scaffali) e non tramite il legacy catalog registry.
 * 3. La risposta contiene i titoli idratati per yaca_12609_series (es. Dragon Ball Z / tmdb:46298).
 * 4. Gestione di ID scaffale sconosciuto (es. yaca_999999_series) o ID ignoto:
 *    restituisce HTTP 200 con stato vuoto (items: [], cards: [], total: 0) senza andare in crash né bloccare il client.
 */

const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const _jwtPrima = process.env.JWT_SECRET;
process.env.JWT_SECRET = _jwtPrima || 'segreto-test-shelf-preview';

const FAKE_3_SHELFS = [
    {
        catalog_id: 'yaca_12609_series',
        nome: 'Anime shōnen',
        nome_fonte: 'tassonomia',
        confidenza: 1.0,
        medium: 'series',
        slot: 1,
        semi_rappresentativi: [
            { tmdbId: 12609, medium: 'series', titolo: 'Dragon Ball Z', anno: 1989, plays: 12.0, eta_giorni: 5.0 }
        ],
        semi_membri: [
            { tmdbId: 12609, medium: 'series', titolo: 'Dragon Ball Z', anno: 1989 }
        ],
        titoli: [
            { key: 'tv:46298', tmdbId: 46298, medium: 'series', punteggio: 0.95 },
            { key: 'tv:110356', tmdbId: 110356, medium: 'series', punteggio: 0.88 }
        ]
    },
    {
        catalog_id: 'yaca_447332_movie',
        nome: 'Horror psicologico',
        nome_fonte: 'tassonomia',
        confidenza: 0.92,
        medium: 'movie',
        slot: 2,
        semi_rappresentativi: [
            { tmdbId: 447332, medium: 'movie', titolo: 'A Quiet Place', anno: 2018, plays: 2.0, eta_giorni: 12.0 }
        ],
        semi_membri: [
            { tmdbId: 447332, medium: 'movie', titolo: 'A Quiet Place', anno: 2018 }
        ],
        titoli: [
            { key: 'movie:50014', tmdbId: 50014, medium: 'movie', punteggio: 0.91 }
        ]
    },
    {
        catalog_id: 'yaca_4607_series',
        nome: 'Mistero & Sci-Fi',
        nome_fonte: 'tassonomia',
        confidenza: 0.88,
        medium: 'series',
        slot: 3,
        semi_rappresentativi: [
            { tmdbId: 4607, medium: 'series', titolo: 'Lost', anno: 2004, plays: 8.0, eta_giorni: 20.0 }
        ],
        semi_membri: [
            { tmdbId: 4607, medium: 'series', titolo: 'Lost', anno: 2004 }
        ],
        titoli: [
            { key: 'tv:1399', tmdbId: 1399, medium: 'series', punteggio: 0.85 }
        ]
    }
];

// Mock modelli e dipendenze
jest.mock('../src/models/UserConfig', () => ({
    resolveUserConfig: jest.fn(),
    saveUser: jest.fn()
}));

jest.mock('../src/models/TasteProfile', () => ({
    findOne: jest.fn().mockResolvedValue(null),
    updateOne: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/models/UserAccount', () => ({
    findOne: jest.fn().mockResolvedValue(null),
    findOneAndUpdate: jest.fn().mockResolvedValue(null),
    updateOne: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/models/AddonConfig', () => ({
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    updateOne: jest.fn().mockResolvedValue({})
}));

jest.mock('../src/clients/graphClient', () => ({
    getGraphHealthVersions: jest.fn().mockResolvedValue({ artefatto: 'v45-test', ricetta: 'v45-test' }),
    getGraphHealthVersionsCached: jest.fn().mockReturnValue({ artefatto: 'v45-test', ricetta: 'v45-test' }),
    scaffali: jest.fn(),
    raccomanda: jest.fn()
}));

jest.mock('../src/clients/tmdb', () => {
    const actual = jest.requireActual('../src/clients/tmdb');
    return {
        ...actual,
        createTmdbClient: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ data: {} })
        })),
        getTmdbMovieDetails: jest.fn().mockImplementation(async (apiKey, id, type) => {
            const numId = Number(String(id).replace(/^(tmdb:|tv:|movie:)/, ''));
            if (numId === 46298) {
                return {
                    id: 46298,
                    name: 'Hunter x Hunter',
                    title: 'Hunter x Hunter',
                    first_air_date: '2011-10-02',
                    vote_average: 9.0,
                    poster_path: '/hunter.jpg',
                    genre_ids: [16, 10759]
                };
            }
            if (numId === 110356) {
                return {
                    id: 110356,
                    name: 'Solo Leveling',
                    title: 'Solo Leveling',
                    first_air_date: '2024-01-07',
                    vote_average: 8.7,
                    poster_path: '/sololeveling.jpg',
                    genre_ids: [16, 10759]
                };
            }
            return null;
        })
    };
});

jest.mock('../src/library', () => ({
    semiDi: jest.fn(),
    cronologiaDi: jest.fn().mockResolvedValue([])
}));

jest.mock('../src/pool/impressioni', () => ({
    applicaDecadimento: jest.fn().mockImplementation(async ({ assigned }) => ({
        assigned,
        statistiche: { titoli: 0, cataloghi: 0, riposati: 0, spostamenti: 0, giorniMedi: 0, righeNonOrdinate: 0 }
    }))
}));

jest.mock('../src/indice/duckDbProvider', () => {
    const actual = jest.requireActual('../src/indice/duckDbProvider');
    return {
        ...actual,
        getDuckDbMetaDetails: jest.fn().mockImplementation(async (id, type) => {
            const numId = Number(String(id).replace(/^(tmdb:|tv:|movie:)/, ''));
            if (numId === 46298) {
                return {
                    rawTMDB: {
                        id: 46298,
                        name: 'Hunter x Hunter',
                        title: 'Hunter x Hunter',
                        first_air_date: '2011-10-02',
                        vote_average: 9.0,
                        poster_path: '/hunter.jpg',
                        genre_ids: [16, 10759]
                    }
                };
            }
            if (numId === 110356) {
                return {
                    rawTMDB: {
                        id: 110356,
                        name: 'Solo Leveling',
                        title: 'Solo Leveling',
                        first_air_date: '2024-01-07',
                        vote_average: 8.7,
                        poster_path: '/sololeveling.jpg',
                        genre_ids: [16, 10759]
                    }
                };
            }
            return null;
        }),
        getDuckDbCatalogFromFilters: jest.fn().mockResolvedValue([]),
        getDuckDbCatalogFromPreset: jest.fn().mockResolvedValue([])
    };
});

const UserConfig = require('../src/models/UserConfig');
const graphClient = require('../src/clients/graphClient');
const library = require('../src/library');
const impressioni = require('../src/pool/impressioni');
const profileContext = require('../src/profile/profileContext');
const configurazioneRouter = require('../src/api/configurazione');
const { getJwtSecret } = require('../src/api/auth/index');

let server;
let port;
let cookie;

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const req = http.request({
            host: '127.0.0.1',
            port,
            path,
            method,
            headers: {
                ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
                Cookie: cookie
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (_e) { parsed = data; }
                resolve({
                    status: res.statusCode,
                    body: parsed
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
    app.use('/api/configurazione', configurazioneRouter);

    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;

    const token = jwt.sign({ userId: 'utente-preview-test' }, getJwtSecret());
    cookie = `yaca_session=${token}`;
});

afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (_jwtPrima === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = _jwtPrima;
});

describe('CatalogLivePreview con ID scaffale dinamici (yaca_<tmdbId>_<medium>)', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        jest.spyOn(profileContext, 'fetchProfileContext').mockResolvedValue({ profile: {}, user: {} });
        jest.spyOn(impressioni, 'applicaDecadimento').mockImplementation(async ({ assigned }) => ({
            assigned,
            statistiche: { titoli: 0, cataloghi: 0, riposati: 0, spostamenti: 0, giorniMedi: 0, righeNonOrdinate: 0 }
        }));

        UserConfig.resolveUserConfig.mockResolvedValue({
            userId: 'utente-preview-test',
            activeProfileId: 'profile-main',
            apiKeys: { tmdb: 'tmdb-test-key' },
            profiles: [
                {
                    id: 'profile-main',
                    name: 'Profilo Principale',
                    settings: {
                        kidsMode: false,
                        typeSelectors: { anime: null }
                    },
                    raw_ui_state: {
                        selectedPresets: ['yaca_12609_series']
                    }
                }
            ],
            shelves: FAKE_3_SHELFS
        });

        library.semiDi.mockResolvedValue({
            seeds: new Map([['12609', 5]]),
            tipi: new Map([['12609', 'loved']]),
            ultimaVisione: new Map([['12609', Date.now() - 86400000]]),
            plays: new Map([['12609', 10]])
        });

        graphClient.scaffali.mockResolvedValue({
            ok: true,
            scaffali: FAKE_3_SHELFS
        });
    });

    test('1. Riceve i titoli per yaca_12609_series chiamando il path degli scaffali del grafo', async () => {
        // La risposta di /scaffali e' ora in cache (RAM+Redis): senza svuotarla, questa asserzione
        // misurerebbe la cache del test precedente invece della chiamata al grafo.
        const { shelvesCache } = require('../src/cache/cacheInstances');
        await shelvesCache.clear();

        const res = await request('POST', '/api/configurazione/anteprima', {
            id: 'yaca_12609_series',
            type: 'series',
            profileId: 'profile-main'
        });

        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();

        // Verifica che il routing sia andato attraverso graphClient.scaffali (il path degli scaffali dinamici)
        expect(graphClient.scaffali).toHaveBeenCalled();
        const callArgs = graphClient.scaffali.mock.calls[0];
        expect(callArgs[1].medium).toBe('series');

        // La risposta contiene i titoli idratati per yaca_12609_series
        const items = res.body.items || res.body.cards;
        expect(Array.isArray(items)).toBe(true);
        expect(items.length).toBeGreaterThan(0);

        const titoli = items.map(i => i.title || i.titolo);
        expect(titoli).toContain('Hunter x Hunter');
        expect(res.body.total).toBeGreaterThan(0);
        expect(res.body.diagnosi).toBeDefined();
        expect(res.body.diagnosi.entrati).toBeGreaterThan(0);
    });

    test('2. ID scaffale sconosciuto (es. yaca_999999_series) restituisce stato vuoto (200 OK, items: []) senza crash né blocco', async () => {
        const res = await request('POST', '/api/configurazione/anteprima', {
            id: 'yaca_999999_series',
            type: 'series',
            profileId: 'profile-main'
        });

        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();

        const items = res.body.items || res.body.cards;
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(0);
        expect(res.body.total).toBe(0);
        expect(res.body.diagnosi.entrati).toBe(0);
    });

    test('3. ID non valido/arbitrario restituisce stato vuoto (200 OK, items: []) senza crashare', async () => {
        const res = await request('POST', '/api/configurazione/anteprima', {
            id: 'catalogo_inesistente_xyz',
            type: 'movie',
            profileId: 'profile-main'
        });

        expect(res.status).toBe(200);
        expect(res.body).toBeDefined();

        const items = res.body.items || res.body.cards;
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(0);
    });
});

describe('Anteprima con la modalità dichiarata dal client', () => {
    // L'anteprima usava il profilo ATTIVO: guardando un catalogo di Serie TV mentre la
    // modalità in uso è Film, il contesto rispondeva `serie:false` e l'anteprima tornava
    // vuota su un catalogo che Stremio serviva. Ora il client dice per quale modalità guarda.
    const utenteBase = () => ({
        userId: 'utente-preview-test',
        addonUuid: 'addon-preview',
        activeProfileId: 'modo_film',
        config: { activeModo: 'film' },
        apiKeys: { tmdb: 'tmdb-test-key' },
        profiles: [
            { id: 'modo_film', modo: 'film', settings: { kidsMode: false } },
            { id: 'modo_serie', modo: 'serie', settings: { kidsMode: false } }
        ],
        shelves: FAKE_3_SHELFS
    });

    beforeEach(() => {
        process.env.MODI_ABILITATI = '1';
        UserConfig.resolveUserConfig.mockResolvedValue(utenteBase());
    });

    afterEach(() => {
        delete process.env.MODI_ABILITATI;
    });

    test('una modalità inventata è 400 modo_non_valido', async () => {
        const { status } = await request('POST', '/api/configurazione/anteprima', {
            id: 'yaca_12609_series',
            type: 'series',
            modo: 'documentari'
        });
        expect(status).toBe(400);
    });

    test('la modalità dichiarata sostituisce quella attiva nel contesto', async () => {
        const spia = jest.spyOn(require('../src/profile'), 'contestoDi');
        await request('POST', '/api/configurazione/anteprima', {
            id: 'yaca_12609_series',
            type: 'series',
            modo: 'serie'
        });
        const argomenti = spia.mock.calls.at(-1)?.[0] || {};
        expect(argomenti.user?.activeModo).toBe('serie');
        expect(argomenti.profileId).toBe('modo_serie');
    });
});
