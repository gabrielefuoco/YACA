/**
 * Arricchimento dei risultati di ricerca che arrivano dal **Tier 2**.
 *
 * Qui il percorso dei dettagli e la cache sono quelli veri dell'app: `src/clients/tmdb.js`
 * (`getTmdbMetaDetails`, quello di `metaHandler`) gira davvero, ma il client HTTP e la cache
 * sono finte, cosi' nessuna rete viene toccata e le chiamate si contano una per una.
 * La cache e' una mappa in memoria con la stessa interfaccia di `CacheManager`: e' lei che
 * fa scaldare la seconda richiesta.
 */

const mockHttpCalls = [];
const mockCacheNamespaces = [];
const mockCacheKeys = [];
let mockResponses = {};

/** Il client HTTP di TMDB: conta ogni richiesta e risponde dalla mappa `mockResponses`. */
jest.mock('../src/utils/axiosClient', () => ({
    createAxiosClient: jest.fn(() => ({
        interceptors: { request: { use: () => {} }, response: { use: () => {} } },
        request: jest.fn(),
        get: jest.fn(async (url, config) => {
            mockHttpCalls.push({ url, params: config?.params });
            const risposta = mockResponses[url];
            if (risposta instanceof Error) throw risposta;
            return { data: risposta || null, status: 200, headers: {}, config };
        })
    }))
}));

/** Cache finta con la stessa interfaccia di `CacheManager`, ma in memoria e tracciata. */
jest.mock('../src/cache/CacheManager', () => {
    const stores = new Map();
    class FakeCacheManager {
        constructor(namespace) {
            this.namespace = namespace;
            mockCacheNamespaces.push(namespace);
            if (!stores.has(namespace)) stores.set(namespace, new Map());
            this.store = stores.get(namespace);
        }
        _full(key) { return `${this.namespace}:${key}`; }
        async getWithStatus(key) {
            const k = this._full(key);
            if (!this.store.has(k)) return { value: undefined, status: 'miss' };
            return { value: this.store.get(k), status: 'fresh' };
        }
        async get(key) { return (await this.getWithStatus(key)).value; }
        async set(key, value) {
            mockCacheKeys.push(this._full(key));
            this.store.set(this._full(key), value);
        }
        async delete(key) { this.store.delete(this._full(key)); }
        async clear() { this.store.clear(); }
    }
    return FakeCacheManager;
});

/** Budget TMDB sempre aperto: il test misura la cache, non i cap di spesa. */
jest.mock('../src/utils/tmdbBudget', () => ({
    tmdbBudget: {
        determineCategory: () => 'meta_click',
        checkBudget: () => ({ allowed: true }),
        recordCall: () => {}
    },
    TMDB_CATEGORIES: {
        BACKFILL: 'backfill',
        META_CLICK: 'meta_click',
        SEARCH_LIVE: 'search_live',
        EPISODES: 'episodes',
        GENERAL: 'general'
    }
}));

/** Il log degli errori non deve sporcare l'output dei test. */
jest.mock('../src/utils/logger', () => ({ logError: jest.fn() }));

/** L'indice FTS5 non serve qui: non si vuole alcun disco ne' alcuna rete. */
jest.mock('../src/db/tier2Index', () => ({ Tier2SearchClient: jest.fn() }));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbCatalogFromFilters: jest.fn(),
    getDuckDbCatalogFromPreset: jest.fn(),
    getDuckDbMetaDetails: jest.fn(),
    buildPresetFromFilters: jest.fn((q = {}) => ({ type: q.type || 'movie', where: [], orderBy: 'popularity DESC' })),
    mapSortBy: jest.fn(),
    mapDuckDbRowToMeta: jest.fn()
}));

jest.mock('../src/catalog/providers/AiDiscoveryProvider', () => ({
    executeCombinedSearch: jest.fn(),
    executeUniversalPipeline: jest.fn()
}));

const API_KEY = 'chiave-di-prova';

/** Un titolo grezzo come lo produce `mapTier2RowToMeta`: senza poster, descrizione e anno. */
function tier2Greggio(id, name = 'Titolo Originale', type = 'movie') {
    return {
        id: `tmdb:${id}`,
        _tmdbId: id,
        type,
        name,
        poster: null,
        posterShape: 'poster',
        background: null,
        description: '',
        releaseInfo: null,
        popularity: 10,
        genres: [],
        genre_ids: [],
        rawTMDB: { id, title: name, original_title: name, popularity: 10, release_date: null },
        _tier2: true
    };
}

/** Un titolo locale come li produce DuckDB: gia' completo, e non va toccato. */
function locale(id, name) {
    return {
        id: `tmdb:${id}`,
        _tmdbId: id,
        type: 'movie',
        name,
        poster: `https://image.tmdb.org/t/p/w500/locale-${id}.jpg`,
        description: 'Descrizione gia presente',
        releaseInfo: '2001'
    };
}

/** Il dettaglio grezzo che TMDB restituisce (e che finisce in cache `tmdb_details_raw`). */
function dettaglioFilm(id, { titolo, originale, descrizione, anno, poster }) {
    return {
        id,
        title: titolo,
        original_title: originale,
        overview: descrizione,
        poster_path: poster,
        backdrop_path: '/backdrop.jpg',
        release_date: `${anno}-04-24`,
        original_language: 'en',
        vote_average: 8.3,
        genres: [{ id: 28, name: 'Azione' }],
        images: { posters: [{ iso_639_1: 'it', file_path: poster }] },
        external_ids: { imdb_id: `tt000000${id}` },
        credits: { cast: [{ name: 'Un Attore', known_for_department: 'Acting' }], crew: [{ name: 'Un Regista', job: 'Director' }] },
        videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'abc123' }] },
        keywords: { keywords: [] },
        release_dates: { results: [] }
    };
}

/** Carica il modulo fresco (nuova istanza, quindi nuove cache) a ogni test. */
function caricaArricchimento() {
    let mod;
    jest.isolateModules(() => { mod = require('../src/catalog/tier2Enrich'); });
    return mod;
}

beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockHttpCalls.length = 0;
    mockCacheNamespaces.length = 0;
    mockCacheKeys.length = 0;
    mockResponses = {};
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('Arricchimento dei titoli del Tier 2', () => {
    let arricchimento;

    beforeEach(() => { arricchimento = caricaArricchimento(); });

    describe('un titolo marcato viene riempito', () => {
        it('aggiunge poster, nome localizzato, descrizione e anno', async () => {
            const grezzo = tier2Greggio(950387, 'Avengers: Endgame');
            const loadDetails = jest.fn(async () => ({
                name: 'Avengers: Endgame',
                poster: 'https://image.tmdb.org/t/p/w500/endgame.jpg',
                description: "Dopo gli eventi di Infinity War, gli Avengers si riuniscono.",
                releaseInfo: '2019',
                background: 'https://image.tmdb.org/t/p/original/endgame-backdrop.jpg',
                imdbRating: '8.3',
                genres: ['Azione'],
                _keywordNames: ['interno']
            }));

            const risultato = await arricchimento.enrichTier2Items([grezzo], { apiKey: API_KEY, loadDetails });

            expect(risultato[0]).toMatchObject({
                poster: 'https://image.tmdb.org/t/p/w500/endgame.jpg',
                name: 'Avengers: Endgame',
                description: "Dopo gli eventi di Infinity War, gli Avengers si riuniscono.",
                releaseInfo: '2019'
            });
            // I campi interni del percorso di dettaglio non finiscono nella risposta di ricerca.
            expect(risultato[0]._keywordNames).toBeUndefined();
        });

        it('non lascia che un dettaglio vuoto cancelli il grezzo', async () => {
            const grezzo = tier2Greggio(1, 'Titolo Originale');
            grezzo.poster = 'https://esempio/piazzatura.jpg';

            await arricchimento.enrichTier2Items([grezzo], {
                apiKey: API_KEY,
                loadDetails: async () => ({ name: 'Titolo Italiano', poster: null, description: '   ' })
            });

            expect(grezzo.name).toBe('Titolo Italiano');
            expect(grezzo.poster).toBe('https://esempio/piazzatura.jpg');
        });

        it('lascia grezzo il titolo di cui il dettaglio non dice niente (null)', async () => {
            const grezzo = tier2Greggio(7, 'Solo Originale');

            await arricchimento.enrichTier2Items([grezzo], { apiKey: API_KEY, loadDetails: async () => null });

            expect(grezzo.poster).toBeNull();
            expect(grezzo.description).toBe('');
            expect(grezzo.releaseInfo).toBeNull();
        });
    });

    describe('i titoli locali non si toccano', () => {
        it('li lascia identici, oggetto per oggetto', async () => {
            const locali = [locale(272, 'Batman Begins'), locale(948, 'Batman Returns')];
            const copia = JSON.parse(JSON.stringify(locali));
            const loadDetails = jest.fn(async () => ({ name: 'X', poster: 'y', description: 'z', releaseInfo: '1999' }));

            const risultato = await arricchimento.enrichTier2Items(locali, { apiKey: API_KEY, loadDetails });

            expect(risultato).toEqual(copia);
            expect(loadDetails).not.toHaveBeenCalled();
        });

        it('in una pagina mista arricchisce solo i marcati', async () => {
            const locale1 = locale(272, 'Batman Begins');
            const grezzo = tier2Greggio(414906, 'Batman: Mask of the Phantasm');

            const risultato = await arricchimento.enrichTier2Items([locale1, grezzo], {
                apiKey: API_KEY,
                loadDetails: async () => ({ name: 'Batman: Maschera del Fantasma', poster: 'p.jpg', description: 'd', releaseInfo: '1993' })
            });

            expect(risultato[0]).toEqual(locale(272, 'Batman Begins'));
            expect(risultato[1].name).toBe('Batman: Maschera del Fantasma');
        });
    });

    describe('una chiamata che fallisce', () => {
        it('lascia grezzo solo quel titolo e non rompe gli altri', async () => {
            const a = tier2Greggio(1, 'A');
            const b = tier2Greggio(2, 'B');
            const c = tier2Greggio(3, 'C');
            const loadDetails = jest.fn(async (_key, item) => {
                if (item._tmdbId === 2) throw new Error('TMDB 500');
                return { name: `Titolo ${item._tmdbId}`, poster: `p-${item._tmdbId}.jpg`, description: 'd', releaseInfo: '2000' };
            });

            const risultato = await arricchimento.enrichTier2Items([a, b, c], { apiKey: API_KEY, loadDetails });

            expect(risultato[0].poster).toBe('p-1.jpg');
            expect(risultato[2].poster).toBe('p-3.jpg');
            expect(risultato[1].poster).toBeNull();
            expect(risultato[1].name).toBe('B');
            expect(risultato[1].description).toBe('');
            expect(risultato[1].releaseInfo).toBeNull();
        });

        it('non solleva nemmeno se il loader butta via una promise', async () => {
            const grezzi = [tier2Greggio(1), tier2Greggio(2)];
            await expect(arricchimento.enrichTier2Items(grezzi, {
                apiKey: API_KEY,
                loadDetails: async () => { throw new Error('boom'); }
            })).resolves.toBe(grezzi);
            expect(grezzi.every(g => g.poster === null)).toBe(true);
        });

        it('non chiama la rete senza chiave TMDB', async () => {
            const loadDetails = jest.fn();
            const risultato = await arricchimento.enrichTier2Items([tier2Greggio(1)], { loadDetails });

            expect(risultato[0].poster).toBeNull();
            expect(loadDetails).not.toHaveBeenCalled();
        });
    });

    describe('zero risultati del Tier 2', () => {
        it('non effettua nessuna chiamata (e non effettua proprio nessuna richiesta HTTP)', async () => {
            const locali = [locale(272, 'Batman Begins'), locale(948, 'Batman Returns')];

            const risultato = await arricchimento.enrichTier2Items(locali, { apiKey: API_KEY });

            expect(risultato).toBe(locali);
            expect(mockHttpCalls).toHaveLength(0);
        });

        it('lista vuota o argomenti mancanti: nessuna chiamata e nessuna eccezione', async () => {
            await expect(arricchimento.enrichTier2Items([], { apiKey: API_KEY })).resolves.toEqual([]);
            await expect(arricchimento.enrichTier2Items()).resolves.toEqual([]);
            await expect(arricchimento.enrichTier2Items(null)).resolves.toEqual([]);
            expect(mockHttpCalls).toHaveLength(0);
        });
    });

    describe('budget di tempo', () => {
        it('scaduto il budget risponde comunque: i pronti arricchiti, gli altri grezzi', async () => {
            const grezzi = Array.from({ length: 10 }, (_, i) => tier2Greggio(i + 1, `Grezzo ${i + 1}`));
            // I primi due titoli rispondono subito, gli altri restano appesi: la risposta
            // non deve aspettarli.
            const loadDetails = jest.fn(async (_key, item) => {
                if (item._tmdbId > 2) return new Promise(() => {});
                return { name: `Pronto ${item._tmdbId}`, poster: `p-${item._tmdbId}.jpg`, description: 'd', releaseInfo: '2000' };
            });

            const risultato = await arricchimento.enrichTier2Items(grezzi, {
                apiKey: API_KEY, loadDetails, concurrency: 5, budgetMs: 80
            });

            expect(risultato).toHaveLength(10);
            expect(risultato[0].poster).toBe('p-1.jpg');
            expect(risultato[1].poster).toBe('p-2.jpg');
            expect(risultato.slice(2).every(g => g.poster === null)).toBe(true);
        });

        it('non solleva e non attende tutto: risolve ben prima dei titoli appesi', async () => {
            const grezzi = Array.from({ length: 10 }, (_, i) => tier2Greggio(i + 1));
            const appesi = jest.fn(async () => new Promise(() => {}));
            const inizio = Date.now();

            await expect(arricchimento.enrichTier2Items(grezzi, {
                apiKey: API_KEY, loadDetails: appesi, concurrency: 5, budgetMs: 60
            })).resolves.toHaveLength(10);

            expect(Date.now() - inizio).toBeLessThan(2000);
            // Oltre il budget non si avviano altri titoli: la concorrenza si ferma al primo lotto.
            expect(appesi).toHaveBeenCalledTimes(5);
        });

        it('scaduto il budget i titoli gia partiti continuano e finiscono in cache', async () => {
            const grezzi = Array.from({ length: 6 }, (_, i) => tier2Greggio(i + 1));
            const risolvi = [];
            const loadDetails = jest.fn(() => new Promise(resolve => { risolvi.push(resolve); }));

            await arricchimento.enrichTier2Items(grezzi, { apiKey: API_KEY, loadDetails, concurrency: 5, budgetMs: 30 });
            // Dopo la risposta i titoli partiti non vengono abbandonati: si completano e
            // lasciano la cache calda per la richiesta successiva.
            expect(risolvi).toHaveLength(5);
            risolvi.forEach(resolve => resolve({ name: 'Arrivato tardi', poster: 'p.jpg', description: 'd', releaseInfo: '1999' }));
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(grezzi.slice(0, 5).every(g => g.poster === 'p.jpg')).toBe(true);
            expect(grezzi[5].poster).toBeNull();
        });
    });

    describe('concorrenza limitata', () => {
        it('non mette mai piu di 5 titoli insieme', async () => {
            const grezzi = Array.from({ length: 20 }, (_, i) => tier2Greggio(i + 1));
            let inVolo = 0;
            let massimo = 0;

            await arricchimento.enrichTier2Items(grezzi, {
                apiKey: API_KEY,
                concurrency: 5,
                budgetMs: 5000,
                loadDetails: async (_key, item) => {
                    inVolo += 1;
                    massimo = Math.max(massimo, inVolo);
                    await new Promise(resolve => setTimeout(resolve, 5));
                    inVolo -= 1;
                    return { name: `Titolo ${item._tmdbId}`, poster: `p-${item._tmdbId}.jpg`, description: 'd', releaseInfo: '2000' };
                }
            });

            expect(massimo).toBe(5);
            expect(grezzi.every(g => g.poster !== null)).toBe(true);
        });

        it('il tetto predefinito e 5 e il budget predefinito e di qualche secondo', () => {
            expect(arricchimento.ENRICH_CONCURRENCY).toBe(5);
            expect(arricchimento.ENRICH_BUDGET_MS).toBeGreaterThan(2000);
            expect(arricchimento.ENRICH_BUDGET_MS).toBeLessThanOrEqual(4000);
        });
    });

    describe('il percorso riusato: getTmdbMetaDetails + cache tmdb_details_raw', () => {
        it('riempie il titolo con i dettagli scaricati dal client TMDB', async () => {
            mockResponses['/movie/950387'] = dettaglioFilm(950387, {
                titolo: 'Avengers: Endgame',
                originale: 'Avengers: Endgame',
                descrizione: "Dopo gli eventi di Infinity War, gli Avengers si riuniscono per un'ultima battaglia.",
                anno: '2019',
                poster: '/or06FN3Dka5tukK1e9sl16pB3iy.jpg'
            });

            const grezzo = tier2Greggio(950387, 'Avengers: Endgame');
            await arricchimento.enrichTier2Items([grezzo], { apiKey: API_KEY });

            expect(grezzo.poster).toBe('https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg');
            expect(grezzo.name).toBe('Avengers: Endgame');
            expect(grezzo.description).toContain('Infinity War');
            expect(grezzo.releaseInfo).toBe('2019');
        });

        it('chiama l endpoint del film con la chiave di cache del percorso gia in uso', async () => {
            mockResponses['/movie/950387'] = dettaglioFilm(950387, {
                titolo: 'Gli Avengers: Endgame',
                originale: 'Avengers: Endgame',
                descrizione: 'Dopo gli eventi di Infinity War gli Avengers si uniscono per un ultima battaglia.',
                anno: '2019',
                poster: '/endgame.jpg'
            });

            await arricchimento.enrichTier2Items([tier2Greggio(950387, 'Avengers: Endgame')], { apiKey: API_KEY });

            expect(mockHttpCalls).toHaveLength(1);
            expect(mockHttpCalls[0].url).toBe('/movie/950387');
            expect(mockCacheNamespaces).toContain('tmdb_details_raw');
            expect(mockCacheKeys).toContain('tmdb_details_raw:full:v2:movie:950387');
        });

        it('la seconda richiesta sugli stessi titoli non rifa le chiamate: la cache e calda', async () => {
            mockResponses['/movie/950387'] = dettaglioFilm(950387, {
                titolo: 'Gli Avengers: Endgame',
                originale: 'Avengers: Endgame',
                descrizione: 'Dopo gli eventi di Infinity War gli Avengers si uniscono per un ultima battaglia.',
                anno: '2019',
                poster: '/endgame.jpg'
            });

            await arricchimento.enrichTier2Items([tier2Greggio(950387, 'Avengers: Endgame')], { apiKey: API_KEY });
            const chiamateDopoLaPrima = mockHttpCalls.length;
            expect(chiamateDopoLaPrima).toBe(1);

            // Pagina nuova, stessi titoli: i valori non possono arrivare da un arricchimento
            // precedente, devono arrivare dalla cache.
            const secondaPagina = tier2Greggio(950387, 'Avengers: Endgame');
            await arricchimento.enrichTier2Items([secondaPagina], { apiKey: API_KEY });

            expect(mockHttpCalls).toHaveLength(chiamateDopoLaPrima);
            expect(secondaPagina.poster).toBe('https://image.tmdb.org/t/p/w500/endgame.jpg');
            expect(secondaPagina.name).toBe('Gli Avengers: Endgame');
            expect(secondaPagina.releaseInfo).toBe('2019');
        });

        it('per una serie prende il dettaglio senza scaricare gli episodi', async () => {
            mockResponses['/tv/1396'] = {
                ...dettaglioFilm(1396, {
                    titolo: 'Better Call Saul',
                    originale: 'Better Call Saul',
                    descrizione: 'Un avvocato che diventa il Saul Goodman di Breaking Bad.',
                    anno: '2015',
                    poster: '/bcs.jpg'
                }),
                name: 'Better Call Saul',
                original_name: 'Better Call Saul',
                first_air_date: '2015-02-08',
                number_of_seasons: 6,
                created_by: [{ name: 'Vince Gilligan' }]
            };

            const serie = tier2Greggio(1396, 'Better Call Saul', 'series');
            await arricchimento.enrichTier2Items([serie], { apiKey: API_KEY });

            expect(serie.poster).toBe('https://image.tmdb.org/t/p/w500/bcs.jpg');
            expect(serie.releaseInfo).toBe('2015');
            // Nessuna richiesta alle stagioni: in una riga di ricerca la griglia episodi non serve.
            expect(mockHttpCalls.every(c => c.url === '/tv/1396')).toBe(true);
            expect(mockHttpCalls.some(c => /season|episode/.test(c.url))).toBe(false);
            expect(mockCacheKeys).toContain('tmdb_details_raw:full:v2:series:1396');
        });

        it('un dettaglio che fallisce lascia grezzo quel titolo e non gli altri', async () => {
            mockResponses['/movie/1'] = dettaglioFilm(1, {
                titolo: 'Titolo Uno', originale: 'Original One', descrizione: 'Una descrizione piu che sufficiente.', anno: '2001', poster: '/uno.jpg'
            });
            mockResponses['/movie/2'] = new Error('TMDB 500');

            const [uno, due] = [tier2Greggio(1, 'Original One'), tier2Greggio(2, 'Original Two')];
            const risultato = await arricchimento.enrichTier2Items([uno, due], { apiKey: API_KEY });

            expect(risultato[0].poster).toBe('https://image.tmdb.org/t/p/w500/uno.jpg');
            expect(risultato[1].poster).toBeNull();
            expect(risultato[1].name).toBe('Original Two');
        });

        it('senza titoli del Tier 2 nessuna richiesta HTTP, nemmeno con la cache disponibile', async () => {
            mockResponses['/movie/272'] = dettaglioFilm(272, {
                titolo: 'Batman Begins', originale: 'Batman Begins', descrizione: 'Un giovane Bruce Wayne.', anno: '2005', poster: '/bb.jpg'
            });

            const risultato = await arricchimento.enrichTier2Items([locale(272, 'Batman Begins')], { apiKey: API_KEY });

            expect(risultato[0].name).toBe('Batman Begins');
            expect(mockHttpCalls).toHaveLength(0);
            expect(mockCacheKeys).toHaveLength(0);
        });
    });
});

describe('La ricerca standard risponde con i titoli del Tier 2 gia presentabili', () => {
    let tier2Search;
    let routeCatalogRequest;

    beforeEach(() => {
        ({ routeCatalogRequest } = require('../src/catalog/CatalogRouter'));
        tier2Search = require('../src/catalog/tier2Search');
        require('../src/catalog/providers/DuckDbProvider').getDuckDbCatalogFromFilters.mockResolvedValue([]);
    });

    afterEach(() => {
        tier2Search.closeTier2Search();
    });

    /** L'indice FTS5 restituisce una riga grezza, come in produzione. */
    function stubIndice(righe) {
        const { Tier2SearchClient } = require('../src/db/tier2Index');
        Tier2SearchClient.mockImplementation(() => ({
            init: jest.fn(() => true),
            search: jest.fn(() => righe),
            close: jest.fn()
        }));
    }

    function ricerca(apiKey = API_KEY) {
        return routeCatalogRequest(
            { id: 'yaca_search_standard', type: 'movie', extra: { search: 'avengers' } },
            { apiKeys: { tmdb: apiKey } }, null, apiKey, {}
        );
    }

    it('i titoli della coda lunga arrivano con poster, nome italiano, descrizione e anno', async () => {
        stubIndice([{ id: '950387', type: 'movie', title: 'Avengers: Endgame', original_title: 'Avengers: Endgame', popularity: '90.1', release_date: null }]);
        mockResponses['/movie/950387'] = dettaglioFilm(950387, {
            titolo: 'Avengers: Endgame',
            originale: 'Avengers: Endgame',
            descrizione: "Dopo gli eventi di Infinity War, gli Avengers si riuniscono per un'ultima battaglia.",
            anno: '2019',
            poster: '/endgame.jpg'
        });

        const risultati = await ricerca();

        expect(risultati).toHaveLength(1);
        expect(risultati[0]).toMatchObject({
            _tmdbId: 950387,
            name: 'Avengers: Endgame',
            poster: 'https://image.tmdb.org/t/p/w500/endgame.jpg',
            releaseInfo: '2019'
        });
        expect(risultati[0].description).toContain('Infinity War');
        expect(mockCacheKeys).toContain('tmdb_details_raw:full:v2:movie:950387');
    });

    it('i titoli locali restano intatti e non costano nessuna richiesta', async () => {
        const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
        getDuckDbCatalogFromFilters.mockResolvedValue([locale(272, 'Batman Begins')]);
        stubIndice([]);

        const risultati = await ricerca();

        expect(risultati).toEqual([locale(272, 'Batman Begins')]);
        expect(mockHttpCalls).toHaveLength(0);
    });

    it('senza chiave TMDB la risposta e comunque quella del catalogo, grezza ma intatta', async () => {
        stubIndice([{ id: '950387', type: 'movie', title: 'Avengers: Endgame', original_title: 'Avengers: Endgame', popularity: '90.1', release_date: null }]);
        mockResponses['/movie/950387'] = dettaglioFilm(950387, {
            titolo: 'Avengers: Endgame', originale: 'Avengers: Endgame',
            descrizione: "Dopo gli eventi di Infinity War gli Avengers si riuniscono.", anno: '2019', poster: '/endgame.jpg'
        });

        const risultati = await ricerca(null);

        expect(risultati[0]._tier2).toBe(true);
        expect(risultati[0].poster).toBeNull();
        expect(mockHttpCalls).toHaveLength(0);
    });
});
