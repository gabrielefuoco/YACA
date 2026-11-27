/**
 * La ricerca unificata: un solo percorso per `yaca_search_standard` e `yaca_search_ai`.
 *
 * I contratti che questo file difende:
 *   1. il piano AI si chiede **solo quando serve** (frase naturale, pochi risultati locali,
 *      nessun titolo esatto, prima pagina, chiave presente) — mai per un titolo secco;
 *   2. la pagina è composta qui (max CATALOG_PAGE_SIZE), con i locali davanti, senza doppioni;
 *   3. nessuna funzione solleva: AI giù, indice giù o budget scaduto ⇒ si risponde col locale;
 *   4. la ricerca NON usa la cache dei cataloghi: non legge e non scrive (né con risultati,
 *      né con zero risultati).
 */

jest.mock('../src/indice/tier2', () => ({
    Tier2SearchClient: jest.fn()
}));

jest.mock('../src/indice/duckDbProvider', () => ({
    getDuckDbCatalogFromFilters: jest.fn(),
    getDuckDbCatalogFromPreset: jest.fn(),
    getDuckDbMetaDetails: jest.fn(),
    buildPresetFromFilters: jest.fn((q = {}) => ({ type: q.type || 'movie', where: [], orderBy: 'popularity DESC' })),
    mapSortBy: jest.fn(),
    mapDuckDbRowToMeta: jest.fn((row) => row)
}));

jest.mock('../src/ricerca/learnedNames', () => ({
    searchLearnedNames: jest.fn(async () => []),
    learnNames: jest.fn(async () => 0)
}));

jest.mock('../src/ricerca/tier2Enrich', () => ({
    enrichTier2Items: jest.fn(async (items) => items)
}));

jest.mock('../src/stremio/CatalogRouter', () => ({
    routeCatalogRequest: jest.fn()
}));

const { Tier2SearchClient } = require('../src/indice/tier2');
const { getDuckDbCatalogFromFilters } = require('../src/indice/duckDbProvider');
const { routeCatalogRequest } = require('../src/stremio/CatalogRouter');
const { catalogRequestCache } = require('../src/cache/cacheInstances');
const { catalogHandler } = require('../src/stremio');

const {
    cercaUnificata
} = require('../src/ricerca/ricercaUnificata');

function locale(id, name) {
    return { id: `tmdb:${id}`, _tmdbId: id, type: 'movie', name, poster: null };
}

function ai(id, name) {
    return { id: `tmdb:${id}`, _tmdbId: id, type: 'movie', name, poster: null, _ai: true };
}

function stubIndiceLocale(items = []) {
    getDuckDbCatalogFromFilters.mockResolvedValue(items);
}

function stubTier2Vuoto() {
    Tier2SearchClient.mockImplementation(() => ({
        init: jest.fn(() => true),
        search: jest.fn(() => []),
        close: jest.fn()
    }));
}

describe('cercaUnificata — il percorso di Stremio', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        stubIndiceLocale([]);
        stubTier2Vuoto();
    });

    it('una pagina piena di locali: la risposta è la loro, in ordine', async () => {
        const pagina = require('../src/config').CATALOG_PAGE_SIZE;
        stubIndiceLocale(Array.from({ length: pagina }, (_, i) => locale(1000 + i, `Titolo ${i}`)));

        const items = await cercaUnificata({
            q: 'parole qualunque di prova',
            type: 'movie',
            activeProfileSettings: {}
        });

        expect(items).toHaveLength(pagina);
    });

    it('una frase naturale con pochi locali: si risponde col locale, senza modelli', async () => {
        stubIndiceLocale([locale(1, "Il locale"), locale(2, "L'altro locale")]);

        const items = await cercaUnificata({
            q: 'parole qualunque di prova',
            type: 'movie',
            activeProfileSettings: {}
        });

        expect(items.map(item => item._tmdbId)).toEqual([1, 2]);
    });

    it('una query con un operatore va sui filtri', async () => {
        stubIndiceLocale([locale(1, 'Il locale')]);

        const items = await cercaUnificata({
            q: 'anno 80',
            type: 'movie',
            activeProfileSettings: {}
        });

        expect(getDuckDbCatalogFromFilters).toHaveBeenCalledWith(
            expect.objectContaining({ 'primary_release_date.gte': '1980-01-01' }),
            'movie',
            0,
            require('../src/config').CATALOG_MAX_ITEMS,
            {}
        );
        expect(items.map(item => item._tmdbId)).toEqual([1]);
    });

    it('una query vuota non interroga niente', async () => {
        const items = await cercaUnificata({ q: '   ', type: 'movie' });

        expect(items).toEqual([]);
        expect(getDuckDbCatalogFromFilters).not.toHaveBeenCalled();
    });
});

describe('la ricerca non usa la cache dei cataloghi (né legge, né scrive)', () => {
    const userConfig = {
        userId: 'user-1',
        activeProfileId: 'profile-1',
        apiKeys: { tmdb: 'chiave-tmdb' },
        profiles: [{ id: 'profile-1', catalogs: [], settings: { kidsMode: false } }]
    };

    beforeEach(() => {
        jest.clearAllMocks();
        stubTier2Vuoto();
    });

    function spiaCache() {
        return {
            getWithStatus: jest.spyOn(catalogRequestCache, 'getWithStatus'),
            getOrFetch: jest.spyOn(catalogRequestCache, 'getOrFetch'),
            set: jest.spyOn(catalogRequestCache, 'set')
        };
    }

    it('una ricerca con risultati viene ricostruita ogni volta, non letta dalla cache', async () => {
        stubIndiceLocale([locale(272, 'Batman Begins')]);
        routeCatalogRequest.mockResolvedValue([locale(272, 'Batman Begins')]);
        const spie = spiaCache();

        await catalogHandler({ id: 'yaca_search_standard', type: 'movie', extra: { search: 'batman' } }, userConfig, 'http://localhost:7000');

        expect(routeCatalogRequest).toHaveBeenCalledTimes(1);
        expect(spie.getWithStatus).not.toHaveBeenCalled();
        expect(spie.getOrFetch).not.toHaveBeenCalled();
        expect(spie.set).not.toHaveBeenCalled();
        spie.getWithStatus.mockRestore();
        spie.getOrFetch.mockRestore();
        spie.set.mockRestore();
    });

    it('una ricerca senza risultati non viene congelata in cache', async () => {
        stubIndiceLocale([]);
        routeCatalogRequest.mockResolvedValue([]);
        const spie = spiaCache();

        const risposta = await catalogHandler({ id: 'yaca_search_standard', type: 'movie', extra: { search: 'xyzzy' } }, userConfig, 'http://localhost:7000');

        expect(risposta).toEqual({ metas: [] });
        expect(spie.set).not.toHaveBeenCalled();
        spie.getWithStatus.mockRestore();
        spie.getOrFetch.mockRestore();
        spie.set.mockRestore();
    });
});
