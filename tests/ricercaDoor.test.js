/**
 * tests/ricercaDoor.test.js
 *
 * Collaudo del Modulo Ricerca (Ticket 22, seconda metà).
 *
 * Verifica:
 * 1. La porta unica cerca({ q, tipo, contesto, cap }):
 *    - query -> lista ordinata
 *    - query vuota -> { items: [], motivi: ['query_vuota'] }
 *    - risultato vuoto -> { items: [], motivi: ['nessun_risultato'] }
 *    - tipo non supportato -> { items: [], motivi: ['tipo_non_supportato: ...'] } (mai errore)
 * 2. Degrado morbido: una fonte giù -> le altre continuano a rispondere, motivo tracciato
 * 3. Fusione e ordinamento: locali prima di Tier 2, dedup per ID
 * 4. Rispetto del contesto: kidsMode applicato
 * 5. Registro delle 6 fonti: contratto, capabilities e due consumatori
 * 6. L'AI fuori dal modulo: prompt specialistici di ricerca e adattatore con soft degradation
 */

jest.mock('../src/indice/duckDbProvider', () => {
    const actual = jest.requireActual('../src/indice/duckDbProvider');
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

const {
    cerca,
    TIPI_TITOLO,
    TIPI_GENERE,
    TIPI_KEYWORD,
    TIPI_PERSONA,
    getSource,
    getAllSources,
    findSourceForCatalog,
    findSourcesForSearch,
    mergeLocalWithTier2,
    fondiEOrdina,
    richiediComprensioneAI,
    buildSearchUnderstandingPrompt
} = require('../src/ricerca');

describe('Modulo Ricerca (Ticket 22 — seconda metà)', () => {

    describe('1. La porta unica: cerca({ q, tipo, contesto, cap })', () => {

        test('una query testuale valida restituisce una lista ordinata con motivi', async () => {
            const mockClient = {
                get: jest.fn().mockResolvedValue({
                    data: {
                        results: [
                            { id: 101, title: 'Inception', vote_average: 8.8 },
                            { id: 102, title: 'Interstellar', vote_average: 8.6 }
                        ]
                    }
                })
            };

            const res = await cerca({
                q: 'Christopher Nolan',
                tipo: 'titolo',
                client: mockClient,
                cap: 10
            });

            expect(res).toBeDefined();
            expect(Array.isArray(res.items)).toBe(true);
            expect(Array.isArray(res.motivi)).toBe(true);
            expect(res.items.length).toBe(2);
            expect(res.items[0].title).toBe('Inception');
            expect(res.items[1].title).toBe('Interstellar');
        });

        test('query vuota o con soli spazi: lista vuota + motivo "query_vuota", mai eccezione', async () => {
            const res1 = await cerca({ q: '' });
            expect(res1.items).toEqual([]);
            expect(res1.motivi).toContain('query_vuota');

            const res2 = await cerca({ q: '   ' });
            expect(res2.items).toEqual([]);
            expect(res2.motivi).toContain('query_vuota');

            const res3 = await cerca();
            expect(res3.items).toEqual([]);
            expect(res3.motivi).toContain('query_vuota');
        });

        test('ricerca senza risultati: lista vuota + motivo "nessun_risultato", mai errore', async () => {
            const mockClient = {
                get: jest.fn().mockResolvedValue({ data: { results: [] } })
            };

            const res = await cerca({
                q: 'stringa_totalmente_inesistente_xyz',
                tipo: 'titolo',
                client: mockClient
            });

            expect(res.items).toEqual([]);
            expect(res.motivi).toContain('nessun_risultato');
        });

        test('tipo non supportato: lista vuota + motivo diagnostico, mai errore runtime', async () => {
            const res = await cerca({
                q: 'Batman',
                tipo: 'tipo_totalmente_inventato'
            });

            expect(res.items).toEqual([]);
            expect(res.motivi.some(m => m.includes('tipo_non_supportato'))).toBe(true);
        });

        test('rispetta il parametro cap troncando la lista restituita', async () => {
            const mockClient = {
                get: jest.fn().mockResolvedValue({
                    data: {
                        results: Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: `Film ${i + 1}` }))
                    }
                })
            };

            const res = await cerca({
                q: 'Film',
                tipo: 'titolo',
                client: mockClient,
                cap: 5
            });

            expect(res.items).toHaveLength(5);
        });

        test('tipo genere interroga TMDB e filtra per nome query', async () => {
            const mockClient = {
                get: jest.fn((url) => {
                    if (url.includes('/genre/movie/list')) {
                        return Promise.resolve({ data: { genres: [{ id: 28, name: 'Azione' }, { id: 35, name: 'Commedia' }] } });
                    }
                    if (url.includes('/genre/tv/list')) {
                        return Promise.resolve({ data: { genres: [{ id: 10759, name: 'Action & Adventure' }] } });
                    }
                    return Promise.resolve({ data: {} });
                })
            };

            const res = await cerca({
                q: 'Azione',
                tipo: 'genere',
                client: mockClient
            });

            expect(res.items).toHaveLength(1);
            expect(res.items[0].name).toBe('Azione');
        });
    });

    describe('2. Degrado morbido e resilienza delle fonti', () => {

        test('se TMDB fallisce con errore di rete, le fonti locali rispondono comunque e il guasto è tracciato in motivi', async () => {
            const failingClient = {
                get: jest.fn().mockRejectedValue(new Error('ETIMEDOUT TMDB Server unreachable'))
            };

            // Eseguiamo con client fallimentare
            const res = await cerca({
                q: 'Matrix',
                tipo: 'titolo',
                client: failingClient
            });

            // Mai solleva eccezione
            expect(res).toBeDefined();
            expect(Array.isArray(res.items)).toBe(true);
            expect(res.motivi.some(m => m.includes('fonte_tmdb_degradata'))).toBe(true);
        });

        test('se un handler interno lancia un eccezione non prevista, la porta risponde con 200 payload sicuro', async () => {
            const crashingClient = {
                get: () => { throw new TypeError('Crash imprevisto interno'); }
            };

            const res = await cerca({
                q: 'crash test',
                tipo: 'keyword',
                client: crashingClient
            });

            expect(res).toBeDefined();
            expect(res.items).toEqual([]);
            expect(res.motivi.length).toBeGreaterThan(0);
        });

        test('una fonte interna che solleva (lock DuckDB/FTS5) degrada senza eccezioni: candidati parziali e motivo in motivi[]', async () => {
            const { registerSource, defineSourceEntry, getSource } = require('../src/ricerca');
            const originalDuckdb = getSource('duckdb');

            const faultyDuckdb = defineSourceEntry({
                id: 'duckdb',
                name: 'DuckDB Faulty',
                kind: 'index',
                appliesToCatalog: () => false,
                serveCatalog: async () => [],
                appliesToSearch: () => true,
                search: async () => {
                    throw new Error('DuckDB lock: database is locked');
                }
            });

            registerSource(faultyDuckdb);

            try {
                const mockTmdbClient = {
                    get: jest.fn().mockResolvedValue({
                        data: {
                            results: [{ id: 999, title: 'Inception TMDB' }]
                        }
                    })
                };

                const res = await cerca({
                    q: 'Inception',
                    tipo: 'titolo',
                    client: mockTmdbClient
                });

                expect(res).toBeDefined();
                expect(res.items.length).toBe(1);
                expect(res.items[0].title).toBe('Inception TMDB');
                expect(res.motivi.some(m => m.includes('fonte_duckdb_degradata: DuckDB lock'))).toBe(true);
            } finally {
                registerSource(originalDuckdb);
            }
        });
    });

    describe('3. Fusione e ordinamento (proprietà del modulo ricerca)', () => {

        test('mergeLocalWithTier2: i titoli locali precedono quelli della coda lunga', () => {
            const locali = [{ id: 'tmdb:1', name: 'Locale Uno' }, { id: 'tmdb:2', name: 'Locale Due' }];
            const tier2 = [{ id: 'tmdb:10', name: 'Coda Tre' }, { id: 'tmdb:20', name: 'Coda Quattro' }];

            const fusi = mergeLocalWithTier2(locali, tier2);
            expect(fusi.map(x => x.name)).toEqual(['Locale Uno', 'Locale Due', 'Coda Tre', 'Coda Quattro']);
        });

        test('mergeLocalWithTier2: in caso di collisione di ID vince il locale e Tier 2 viene scartato', () => {
            const locali = [{ id: 'tmdb:100', name: 'Titolo Completo Locale' }];
            const tier2 = [{ id: 'tmdb:100', name: 'Titolo Grezzo Tier 2' }, { id: 'tmdb:200', name: 'Titolo Coda' }];

            const fusi = mergeLocalWithTier2(locali, tier2);
            expect(fusi).toHaveLength(2);
            expect(fusi[0].name).toBe('Titolo Completo Locale');
            expect(fusi[1].name).toBe('Titolo Coda');
        });

        test('fondiEOrdina gestisce cascata di candidati con tetto cap', () => {
            const fusi = fondiEOrdina({
                locali: [{ id: 'tmdb:1' }, { id: 'tmdb:2' }],
                tier2: [{ id: 'tmdb:3' }, { id: 'tmdb:4' }],
                learned: [{ id: 'tmdb:5' }],
                altri: [{ id: 'tmdb:6' }]
            }, { cap: 3 });

            expect(fusi).toHaveLength(3);
            expect(fusi.map(x => x.id)).toEqual(['tmdb:1', 'tmdb:2', 'tmdb:3']);
        });
    });

    describe('4. Rispetto del Contesto (contestoDi)', () => {

        test('kidsMode: esclude i titoli adult', async () => {
            const mockClient = {
                get: jest.fn().mockResolvedValue({
                    data: {
                        results: [
                            { id: 1, title: 'Cartone Kids', adult: false },
                            { id: 2, title: 'Film Adulti Vietato', adult: true },
                            { id: 3, title: 'Avventura Famiglia', adult: false }
                        ]
                    }
                })
            };

            const res = await cerca({
                q: 'film',
                tipo: 'titolo',
                contesto: { kidsMode: true },
                client: mockClient
            });

            expect(res.items.map(i => i.title)).toEqual(['Cartone Kids', 'Avventura Famiglia']);
        });

        test('kidsMode: il cap si applica DOPO il filtro, non prima (ticket 27)', async () => {
            // 40 candidati con 10 adulti SPARSI fra i 30 non-adulti. Se il cap a 20 scattasse
            // prima del filtro, i primi 20 conterrebbero 5 adulti e il filtro ne lascerebbe 15:
            // il vecchio ordine restituiva 15 titoli per un cap di 20.
            const risultati = [];
            for (let i = 1; i <= 40; i++) {
                const adult = i % 4 === 0;
                risultati.push({ id: i, title: adult ? `Adulto ${i}` : `Kids ${i}`, adult });
            }

            const mockClient = {
                get: jest.fn().mockResolvedValue({ data: { results: risultati } })
            };

            const res = await cerca({
                q: 'film',
                tipo: 'titolo',
                contesto: { kidsMode: true },
                cap: 20,
                client: mockClient
            });

            expect(res.items).toHaveLength(20);
            expect(res.items.every(i => !i.adult && !(i.rawTMDB && i.rawTMDB.adult))).toBe(true);
        });
    });

    describe('5. Il Registro delle Sei Fonti', () => {

        test('il registro contiene esattamente le sei fonti contrattualizzate', () => {
            const sources = getAllSources();
            expect(sources).toHaveLength(6);

            const ids = sources.map(s => s.id).sort();
            expect(ids).toEqual(['ai_discovery', 'airing_state', 'duckdb', 'hybrid', 'trakt', 'watchlist'].sort());
        });

        test('ogni fonte dichiara le sue capabilities conformi a capabilities.js', () => {
            const sources = getAllSources();
            for (const source of sources) {
                expect(source.capabilities).toBeDefined();
                expect(typeof source.capabilities.canServeFilter).toBe('function');
                expect(typeof source.capabilities.canServeMediaSet).toBe('function');
                expect(typeof source.appliesToCatalog).toBe('function');
                expect(typeof source.serveCatalog).toBe('function');
            }
        });

        test('findSourceForCatalog seleziona la fonte corretta per il servire', () => {
            // DuckDB per preset where
            const s1 = findSourceForCatalog({ effectiveMeta: { where: ['release_year > 2020'] } });
            expect(s1.id).toBe('duckdb');

            // Hybrid per taste based
            const s2 = findSourceForCatalog({ baseId: 'yaca_mondi' });
            expect(s2.id).toBe('hybrid');

            // Trakt per trakt_*
            const s3 = findSourceForCatalog({ baseId: 'trakt_trending' });
            expect(s3.id).toBe('trakt');

            // Watchlist per yaca_watchlist_*
            const s4 = findSourceForCatalog({ id: 'yaca_watchlist_movies' });
            expect(s4.id).toBe('watchlist');

            // AiringState per simulcast
            const s5 = findSourceForCatalog({ baseId: 'preset_anime_simulcast' });
            expect(s5.id).toBe('airing_state');
        });

        test('findSourcesForSearch seleziona le fonti abilitate alla ricerca', () => {
            const searchSources = findSourcesForSearch({ q: 'dune', tipo: 'titolo' });
            expect(searchSources.some(s => s.id === 'duckdb')).toBe(true);
        });
    });

    describe('6. L AI fuori dal modulo ricerca (meccanismo vs prompt)', () => {

        test('buildSearchUnderstandingPrompt costruisce il prompt specialistico di ricerca', () => {
            const prompt = buildSearchUnderstandingPrompt('film spaziali anni 80', { kidsMode: true });
            expect(prompt).toContain('film spaziali anni 80');
            expect(prompt).toContain('Kids');
        });

        test('richiediComprensioneAI degrada senza eccezioni se la chiave non è configurata', async () => {
            const res = await richiediComprensioneAI({
                query: 'fantascienza cyberpunk',
                mistralKey: null
            });

            expect(res.degraded).toBe(true);
            expect(res.comprensione).toBeNull();
            expect(res.reason).toBe('chiave_ai_assente');
        });
    });
});
