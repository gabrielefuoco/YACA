/**
 * La ricerca consulta anche l'archivio dei **nomi appresi**: i titoli del Tier 2 che sono gia'
 * stati mostrati una volta, e che da allora si possono cercare per il loro nome italiano.
 *
 * Qui l'archivio e' finto (nessun disco) e l'indice FTS5 pure: si verifica il contratto della
 * ricerca — ordine, deduplicazione, marcatura — e il degrado morbido quando l'archivio non
 * c'e' o e' rotto. Con l'archivio vuoto la risposta deve essere **identica** a quella di prima.
 */

jest.mock('../src/db/tier2Index', () => ({ Tier2SearchClient: jest.fn() }));

/** L'archivio finto: un array di righe, e ogni errore si puo' far explodere a piacere. */
const mockSearchLearnedNames = jest.fn(async () => []);
jest.mock('../src/db/learnedNames', () => ({
    searchLearnedNames: (...args) => mockSearchLearnedNames(...args),
    learnNames: jest.fn(async () => 0)
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

jest.mock('../src/catalog/tier2Enrich', () => ({
    TIER2_FLAG: '_tier2',
    enrichTier2Items: jest.fn(async (items) => items)
}));

const { Tier2SearchClient } = require('../src/db/tier2Index');
const { getDuckDbCatalogFromFilters } = require('../src/catalog/providers/DuckDbProvider');
const { enrichTier2Items } = require('../src/catalog/tier2Enrich');
const { routeCatalogRequest } = require('../src/catalog/CatalogRouter');
const tier2Search = require('../src/catalog/tier2Search');

/** Righe come le restituisce l'indice SQLite FTS5. */
function tier2Row(id, title, type = 'movie') {
    return { id: String(id), type, title, original_title: title, popularity: '10.0', release_date: null };
}

/** Righe come le restituisce l'archivio dei nomi appresi. */
function learnedRow(id, titleIt, over = {}) {
    return {
        tmdb_id: id,
        media_type: 'movie',
        title_it: titleIt,
        original_title: 'Spirited Away',
        year: '2001',
        ...over
    };
}

function localItem(id, name) {
    return { id: `tmdb:${id}`, _tmdbId: id, type: 'movie', name, poster: `https://image.tmdb.org/p/w500/${id}.jpg` };
}

function stubTier2Index(rows = []) {
    Tier2SearchClient.mockImplementation(() => ({
        init: jest.fn(() => true),
        search: jest.fn(() => rows),
        close: jest.fn()
    }));
}

/** La ricerca standard, con la chiave TMDB: senza chiave l'arricchimento (qui finto) e' un no-op. */
function search(query = 'la citta degli spiriti', type = 'movie') {
    return routeCatalogRequest(
        { id: 'yaca_search_standard', type, extra: { search: query } },
        {}, null, 'chiave-di-prova', {}
    );
}

let warn;

beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSearchLearnedNames.mockResolvedValue([]);
    getDuckDbCatalogFromFilters.mockResolvedValue([]);
    stubTier2Index([]);
});

afterEach(() => {
    tier2Search.closeTier2Search();
    warn.mockRestore();
});

describe('nomi appresi: dalla tabella a un risultato di ricerca', () => {
    it('interroga l\'archivio con lo stesso testo e lo stesso tipo della ricerca', async () => {
        mockSearchLearnedNames.mockResolvedValue([]);

        await tier2Search.searchLearnedTitles('la citta degli spiriti', { type: 'movie' });

        expect(mockSearchLearnedNames).toHaveBeenCalledWith('la citta degli spiriti', { type: 'movie', limit: 5 });
    });

    it('per una serie chiede il tipo `tv`, come fa l\'indice del Tier 2', async () => {
        mockSearchLearnedNames.mockResolvedValue([]);

        await tier2Search.searchLearnedTitles('better call saul', { type: 'series' });

        expect(mockSearchLearnedNames).toHaveBeenCalledWith('better call saul', expect.objectContaining({ type: 'tv' }));
    });

    it('traduce la riga in un meta del Tier 2 con il nome italiano e l\'anno', async () => {
        mockSearchLearnedNames.mockResolvedValue([learnedRow(129, 'La città degli spiriti')]);

        const [meta] = await tier2Search.searchLearnedTitles('spiriti', { type: 'movie' });

        expect(meta).toMatchObject({
            id: 'tmdb:129',
            _tmdbId: 129,
            type: 'movie',
            name: 'La città degli spiriti',
            releaseInfo: '2001',
            poster: null,
            _tier2: true
        });
        expect(meta.rawTMDB.original_title).toBe('Spirited Away');
    });

    it('una serie appresa esce come `series`, non come film', async () => {
        mockSearchLearnedNames.mockResolvedValue([learnedRow(1396, 'Better Call Saul', { media_type: 'tv' })]);

        const [meta] = await tier2Search.searchLearnedTitles('saul', { type: 'series' });

        expect(meta.type).toBe('series');
    });

    it('riga senza id utilizzabile: viene scartata, non genera un meta rotto', async () => {
        mockSearchLearnedNames.mockResolvedValue([learnedRow('non-un-id', 'Titolo'), learnedRow(0, 'Altro')]);

        await expect(tier2Search.searchLearnedTitles('titolo', { type: 'movie' })).resolves.toEqual([]);
    });

    it('testo vuoto: l\'archivio non viene neppure interrogato', async () => {
        await tier2Search.searchLearnedTitles('', {});
        await tier2Search.searchLearnedTitles('   ', {});
        await tier2Search.searchLearnedTitles(null, {});

        expect(mockSearchLearnedNames).not.toHaveBeenCalled();
    });
});

describe('nomi appresi: degrado morbido', () => {
    it('archivio assente (nessuna riga): la risposta e\' quella di sempre', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue([localItem(272, 'Batman Begins')]);
        stubTier2Index([tier2Row(414906, 'Batman: Mask of the Phantasm')]);
        mockSearchLearnedNames.mockResolvedValue([]);

        const items = await search('batman');

        expect(items.map(m => m._tmdbId)).toEqual([272, 414906]);
    });

    it('archivio che esplode: nessuna eccezione, avviso una volta sola, ricerca intatta', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue([localItem(272, 'Batman Begins')]);
        mockSearchLearnedNames.mockRejectedValue(new Error('file is not a database'));

        for (let i = 0; i < 3; i++) {
            const items = await search('batman');
            expect(items.map(m => m._tmdbId)).toEqual([272]);
        }
        expect(warn).toHaveBeenCalledTimes(1);
    });
});

describe('CatalogRouter: i nomi appresi vanno in coda, senza duplicare e senza riordinare', () => {
    it('un nome italiano imparato rende trovabile un titolo del Tier 2', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue([]);
        stubTier2Index([]);   // l'indice FTS5 non lo trova: il titolo originale non e' in pagina
        mockSearchLearnedNames.mockResolvedValue([learnedRow(129, 'La città degli spiriti')]);

        const items = await search('la citta degli spiriti');

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ _tmdbId: 129, name: 'La città degli spiriti', _tier2: true });
    });

    it('non riordina nulla: prima i locali, poi il Tier 2, poi i nomi appresi', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue([localItem(1, 'Locale A'), localItem(2, 'Locale B')]);
        stubTier2Index([tier2Row(10, 'Coda A'), tier2Row(11, 'Coda B')]);
        mockSearchLearnedNames.mockResolvedValue([learnedRow(129, 'Appreso A'), learnedRow(130, 'Appreso B')]);

        const items = await search('qualsiasi');

        expect(items.map(m => m._tmdbId)).toEqual([1, 2, 10, 11, 129, 130]);
        expect(items.map(m => m._tier2 ? 't2' : 'locale')).toEqual(['locale', 'locale', 't2', 't2', 't2', 't2']);
    });

    it('nessun duplicato: un id gia\' uscito (locale o Tier 2) non compare due volte', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue([localItem(1, 'Locale A')]);
        stubTier2Index([tier2Row(10, 'Coda A')]);
        mockSearchLearnedNames.mockResolvedValue([
            learnedRow(1, 'Appreso che coincide col locale'),
            learnedRow(10, 'Appreso che coincide col Tier 2'),
            learnedRow(129, 'Appreso nuovo')
        ]);

        const items = await search('qualsiasi');

        expect(items.map(m => m._tmdbId)).toEqual([1, 10, 129]);
        expect(items[0].name).toBe('Locale A');
        expect(items[1].name).toBe('Coda A');
    });

    it('i nomi appresi restano del Tier 2: l\'arricchimento li riceve come gli altri', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue([]);
        stubTier2Index([]);
        mockSearchLearnedNames.mockResolvedValue([learnedRow(129, 'La città degli spiriti')]);

        await search('spiriti');

        expect(enrichTier2Items).toHaveBeenCalledTimes(1);
        const passati = enrichTier2Items.mock.calls[0][0];
        expect(passati).toHaveLength(1);
        expect(passati[0]._tier2).toBe(true);
    });

    it('tabella vuota e ricerca piena di risultati: la risposta e\' identica a prima', async () => {
        getDuckDbCatalogFromFilters.mockResolvedValue(Array.from({ length: 20 }, (_, i) => localItem(1000 + i, `Locale ${i}`)));
        stubTier2Index(Array.from({ length: 20 }, (_, i) => tier2Row(2000 + i, `Coda ${i}`)));
        mockSearchLearnedNames.mockResolvedValue([]);

        const items = await search('batman');

        expect(items.map(m => m._tmdbId)).toEqual([
            ...Array.from({ length: 20 }, (_, i) => 1000 + i),
            ...Array.from({ length: 20 }, (_, i) => 2000 + i)
        ]);
    });
});
