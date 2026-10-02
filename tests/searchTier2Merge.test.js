/**
 * La ricerca testuale interroga anche l'indice FTS5 del Tier 2 (1,45M titoli dell'export TMDB).
 *
 * Qui l'indice è **stubbato**: nessun file vero, nessuna rete. Si verifica solo il contratto
 * della fusione (ordine, dedup, marcatura) e il degrado morbido quando l'indice non c'è.
 */

jest.mock('../src/db/tier2Index', () => ({
    Tier2SearchClient: jest.fn()
}));

jest.mock('../src/catalog/providers/DuckDbProvider', () => ({
    getDuckDbCatalogFromFilters: jest.fn(),
    getDuckDbCatalogFromPreset: jest.fn(),
    getDuckDbMetaDetails: jest.fn(),
    buildPresetFromFilters: jest.fn((q = {}) => ({ type: q.type || 'movie', where: [], orderBy: 'popularity DESC' })),
    mapSortBy: jest.fn(),
    mapDuckDbRowToMeta: jest.fn((row) => row)
}));

jest.mock('../src/catalog/providers/AiDiscoveryProvider', () => ({
    executeCombinedSearch: jest.fn(),
    executeUniversalPipeline: jest.fn()
}));

const { Tier2SearchClient } = require('../src/db/tier2Index');
const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
const { executeCombinedSearch } = require('../src/catalog/providers/AiDiscoveryProvider');
const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');
const http = require('http');
const https = require('https');

/** Righe come le restituisce l'indice SQLite FTS5: id in stringa, nessun poster, nessun titolo italiano. */
function tier2Row(id, title, type = 'movie') {
    return { id: String(id), type, title, original_title: title, popularity: '10.0', release_date: null };
}

/** Meta locale come li produce DuckDB: id `tmdb:<n>`, titolo italiano e poster gia' pronti. */
function localItem(id, name) {
    return { id: `tmdb:${id}`, _tmdbId: id, type: 'movie', name, poster: `https://image.tmdb.org/p/w500/${id}.jpg` };
}

function stubTier2Index({ rows = [], initResult = true, failOn = null } = {}) {
    const search = jest.fn(() => {
        if (failOn === 'search') throw new Error('FTS5: errore di query');
        return rows;
    });
    Tier2SearchClient.mockImplementation(() => ({
        init: jest.fn(() => {
            if (failOn === 'init') throw new Error('SQLITE_CANTOPEN');
            return initResult;
        }),
        search,
        close: jest.fn()
    }));
    return { search };
}

function loadTier2Search() {
    let mod;
    jest.isolateModules(() => { mod = require('../src/catalog/tier2Search'); });
    return mod;
}

describe('Ricerca su due livelli: Tier 1 locale + indice FTS5 del Tier 2', () => {
    let tier2Search;
    let warn;

    beforeEach(() => {
        jest.clearAllMocks();
        // Il degrado morbido scrive un avviso: lo silenziamo per non sporcare l'output dei test.
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        tier2Search = loadTier2Search();
    });

    afterEach(() => {
        tier2Search.closeTier2Search();
        warn.mockRestore();
    });

    describe('mergeLocalWithTier2', () => {
        it('mette i titoli del Tier 2 DOPO quelli locali, nell ordine restituito dall indice', () => {
            const locali = [localItem(1, 'Uno'), localItem(2, 'Due')];
            const tier2 = [
                { id: 'tmdb:100', _tmdbId: 100, name: 'Coda A' },
                { id: 'tmdb:200', _tmdbId: 200, name: 'Coda B' },
                { id: 'tmdb:300', _tmdbId: 300, name: 'Coda C' }
            ];

            const merged = tier2Search.mergeLocalWithTier2(locali, tier2);

            expect(merged.map(m => m.name)).toEqual(['Uno', 'Due', 'Coda A', 'Coda B', 'Coda C']);
        });

        it('con un id in comune tiene il risultato locale e scarta quello del Tier 2', () => {
            const locali = [localItem(603, 'Matrix'), localItem(604, 'Matrix Reloaded')];
            const tier2 = [
                { id: 'tmdb:604', _tmdbId: 604, name: 'Matrix Reloaded (export)' },
                { id: 'tmdb:603', _tmdbId: 603, name: 'The Matrix (export)' },
                { id: 'tmdb:605', _tmdbId: 605, name: 'Matrix Revolutions (export)' }
            ];

            const merged = tier2Search.mergeLocalWithTier2(locali, tier2);

            expect(merged).toHaveLength(3);
            const perId = new Map(merged.map(m => [m._tmdbId, m]));
            expect(perId.get(603).name).toBe('Matrix');
            expect(perId.get(604).name).toBe('Matrix Reloaded');
            expect(perId.get(605).name).toBe('Matrix Revolutions (export)');
            // Nessun doppione: ogni id compare una volta sola.
            expect(merged.filter(m => m._tmdbId === 603)).toHaveLength(1);
            expect(merged.filter(m => m._tmdbId === 604)).toHaveLength(1);
        });

        it('dedup anche fra due righe del Tier 2 con lo stesso id', () => {
            const merged = tier2Search.mergeLocalWithTier2(
                [],
                [{ id: 'tmdb:7', _tmdbId: 7 }, { id: 'tmdb:7', _tmdbId: 7 }]
            );
            expect(merged).toHaveLength(1);
        });

        it('non altera i locali: ne mantiene l ordine, i duplicati interni inclusi', () => {
            const locali = [localItem(5, 'A'), localItem(5, 'A'), localItem(6, 'B')];
            const merged = tier2Search.mergeLocalWithTier2(locali, []);
            expect(merged).toEqual(locali);
        });

        it('con zero risultati locali restituisce comunque i titoli del Tier 2', () => {
            const merged = tier2Search.mergeLocalWithTier2([], [{ id: 'tmdb:900', _tmdbId: 900 }]);
            expect(merged.map(m => m._tmdbId)).toEqual([900]);
        });

        it('sopporta argomenti vuoti o mancanti senza eccezioni', () => {
            expect(tier2Search.mergeLocalWithTier2()).toEqual([]);
            expect(tier2Search.mergeLocalWithTier2([], [])).toEqual([]);
        });
    });

    describe('searchTier2', () => {
        it('interroga l indice con lo stesso testo e lo stesso tipo di media della ricerca', () => {
            const { search } = stubTier2Index({ rows: [tier2Row(950387, 'A Movie', 'movie')] });

            tier2Search.searchTier2('batman', { type: 'movie', limit: 20 });

            expect(search).toHaveBeenCalledTimes(1);
            expect(search).toHaveBeenCalledWith('batman', { limit: 20, type: 'movie' });
        });

        it('mappa `series` sul tipo `tv` dell indice', () => {
            const { search } = stubTier2Index({ rows: [] });
            tier2Search.searchTier2('breaking bad', { type: 'series' });
            expect(search).toHaveBeenCalledWith('breaking bad', expect.objectContaining({ type: 'tv' }));
        });

        it('marca i risultati del Tier 2 con _tier2 e NON mette il marchio sui locali', () => {
            stubTier2Index({ rows: [tier2Row(950387, 'A Movie'), tier2Row(11, 'Black Panther', 'movie')] });
            const tier2 = tier2Search.searchTier2('panther', { type: 'movie' });
            const merged = tier2Search.mergeLocalWithTier2([localItem(11, 'Black Panther')], tier2);

            const locale = merged.find(m => m.name === 'Black Panther');
            const codaLunga = merged.find(m => m.name === 'A Movie');

            expect(locale._tier2).toBeUndefined();
            expect(codaLunga._tier2).toBe(true);
        });

        it('traduce le righe dell indice in meta senza poster ma con id e tipo coerenti', () => {
            stubTier2Index({ rows: [tier2Row(950387, 'A Movie'), tier2Row(1399, 'Una Serie', 'tv')] });

            const [film, serie] = tier2Search.searchTier2('x', { type: 'movie' });

            expect(film).toMatchObject({ id: 'tmdb:950387', _tmdbId: 950387, type: 'movie', poster: null, _tier2: true });
            expect(serie).toMatchObject({ id: 'tmdb:1399', _tmdbId: 1399, type: 'series', poster: null, _tier2: true });
        });

        it('non effettua alcuna richiesta di rete', () => {
            const httpSpy = jest.spyOn(http, 'get');
            const httpsSpy = jest.spyOn(https, 'get');
            stubTier2Index({ rows: [tier2Row(1, 'Uno')] });

            tier2Search.searchTier2('qualsiasi cosa', { type: 'movie' });

            expect(httpSpy).not.toHaveBeenCalled();
            expect(httpsSpy).not.toHaveBeenCalled();
            httpSpy.mockRestore();
            httpsSpy.mockRestore();
        });
    });

    describe('degrado morbido quando l indice non c e', () => {
        it('indice assente: nessuna eccezione e lista vuota', () => {
            stubTier2Index({ initResult: false });
            expect(tier2Search.searchTier2('batman', { type: 'movie' })).toEqual([]);
        });

        it('indice che non si apre: nessuna eccezione e lista vuota', () => {
            stubTier2Index({ failOn: 'init' });
            expect(() => tier2Search.searchTier2('batman', { type: 'movie' })).not.toThrow();
            expect(tier2Search.searchTier2('batman', { type: 'movie' })).toEqual([]);
        });

        it('query che fallisce: nessuna eccezione e lista vuota', () => {
            stubTier2Index({ failOn: 'search' });
            expect(tier2Search.searchTier2('batman', { type: 'movie' })).toEqual([]);
        });

        it('segnala l indisponibilita una volta sola, non a ogni ricerca', () => {
            stubTier2Index({ initResult: false });

            for (let i = 0; i < 5; i++) tier2Search.searchTier2('batman', { type: 'movie' });

            expect(warn).toHaveBeenCalledTimes(1);
        });

        it('testo vuoto: l indice non viene neppure interrogato', () => {
            const { search } = stubTier2Index({ rows: [tier2Row(1, 'Uno')] });
            expect(tier2Search.searchTier2('', { type: 'movie' })).toEqual([]);
            expect(tier2Search.searchTier2('   ', { type: 'movie' })).toEqual([]);
            expect(tier2Search.searchTier2(null, { type: 'movie' })).toEqual([]);
            expect(search).not.toHaveBeenCalled();
        });

        it('riusa lo stesso client: la ricerca successiva non riapre il database', () => {
            stubTier2Index({ rows: [] });
            tier2Search.searchTier2('uno', { type: 'movie' });
            tier2Search.searchTier2('due', { type: 'movie' });
            expect(Tier2SearchClient).toHaveBeenCalledTimes(1);
        });
    });
});

describe('CatalogRouter: la ricerca standard interroga anche il Tier 2', () => {
    let tier2Search;
    let warn;

    beforeEach(() => {
        jest.clearAllMocks();
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        tier2Search = require('../src/catalog/tier2Search');
    });

    afterEach(() => {
        tier2Search.closeTier2Search();
        warn.mockRestore();
    });

    function search(query = 'batman', type = 'movie') {
        return routeCatalogRequest(
            { id: 'yaca_search_standard', type, extra: { search: query } },
            {}, null, null, {}
        );
    }

    it('restituisce i locali e poi i titoli della coda lunga', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue([localItem(272, 'Batman Begins'), localItem(948, 'Batman Returns')]);
        stubTier2Index({ rows: [tier2Row(414906, 'Batman: Mask of the Phantasm'), tier2Row(963, 'Batman & Robin')] });

        const items = await search();

        expect(items.map(m => m._tmdbId)).toEqual([272, 948, 414906, 963]);
        expect(items[0].name).toBe('Batman Begins');
        expect(items[2]._tier2).toBe(true);
    });

    it('l id presente in entrambi compare una volta sola, e in versione locale', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue([localItem(272, 'Batman Begins')]);
        stubTier2Index({ rows: [tier2Row(272, 'Batman Begins'), tier2Row(414906, 'Batman: Mask of the Phantasm')] });

        const items = await search();

        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ _tmdbId: 272, name: 'Batman Begins', poster: expect.any(String) });
        expect(items[0]._tier2).toBeUndefined();
        expect(items[1]).toMatchObject({ _tmdbId: 414906, _tier2: true });
    });

    it('ordina tutti i locali prima di tutti i Tier 2, rispettando l ordine dell indice', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue(Array.from({ length: 20 }, (_, i) => localItem(1000 + i, `Locale ${i}`)));
        stubTier2Index({
            rows: Array.from({ length: 20 }, (_, i) => tier2Row(2000 + i, `Coda ${i}`))
        });

        const items = await search();

        expect(items).toHaveLength(40);
        expect(items.slice(0, 20).map(m => m._tmdbId)).toEqual(Array.from({ length: 20 }, (_, i) => 1000 + i));
        expect(items.slice(20).map(m => m._tmdbId)).toEqual(Array.from({ length: 20 }, (_, i) => 2000 + i));
        expect(items.every((m, i) => (i < 20 ? m._tier2 === undefined : m._tier2 === true))).toBe(true);
    });

    it('con zero risultati locali restituisce comunque i titoli del Tier 2', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue([]);
        stubTier2Index({ rows: [tier2Row(950387, 'A Movie'), tier2Row(299534, 'Avengers: Endgame')] });

        const items = await search('titolo mai visto');

        expect(items.map(m => m._tmdbId)).toEqual([950387, 299534]);
        expect(items.every(m => m._tier2 === true)).toBe(true);
    });

    it('indice assente: la risposta e esattamente quella di prima (soli locali)', async () => {
        const expected = [localItem(272, 'Batman Begins'), localItem(948, 'Batman Returns')];
        getDuckDbCatalogFromFilters.mockResolvedValue(expected);

        stubTier2Index({ initResult: false });
        const senzaIndice = await search();

        stubTier2Index({ failOn: 'search' });
        const conErrore = await search();

        expect(senzaIndice).toEqual(expected);
        expect(conErrore).toEqual(expected);
    });

    it('non chiama TMDB: il percorso di ricerca resta solo DuckDB + indice locale', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue([]);
        stubTier2Index({ rows: [tier2Row(1, 'Uno')] });
        const httpsSpy = jest.spyOn(https, 'get');

        await search();

        expect(getDuckDbCatalogFromFilters).toHaveBeenCalledTimes(1);
        expect(getDuckDbCatalogFromFilters.mock.calls[0][0]).toEqual({ _search: 'batman' });
        expect(httpsSpy).not.toHaveBeenCalled();
        httpsSpy.mockRestore();
    });

    it('la ricerca AI profonda non viene toccata', async () => {
        executeCombinedSearch.mockResolvedValue([localItem(1, 'Da AI')]);
        stubTier2Index({ rows: [tier2Row(2, 'Da indice')] });

        const items = await routeCatalogRequest(
            { id: 'yaca_search_ai', type: 'movie', extra: { search: 'batman' } },
            {}, null, null, {}
        );

        expect(items.map(m => m.name)).toEqual(['Da AI']);
        expect(executeCombinedSearch).toHaveBeenCalled();
        expect(Tier2SearchClient).not.toHaveBeenCalled();
    });
});