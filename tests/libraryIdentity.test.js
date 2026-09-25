/**
 * Identità di libreria: lo stesso titolo con id diversi (tt… / tmdb:… / kitsu:…)
 * deve diventare una sola card, e le copertine servite da host morti devono
 * essere riscritte verso l'host corrente.
 */
jest.mock('../src/db/duckDbStore', () => ({ query: jest.fn() }));
jest.mock('../src/data/animeMappingStore', () => ({
    kitsuToTmdb: new Map([['7278', '46004']]),
    init: jest.fn()
}));

const duckDbStore = require('../src/db/duckDbStore');
const {
    normalizeLibraryId,
    normalizeTitle,
    normalizeLegacyPosterHost,
    planDuplicateMarks,
} = require('../src/utils/libraryIdentity');

describe('normalizeLibraryId', () => {
    test('normalizza formati legacy e riconduce gli id numerici a tmdb', () => {
        expect(normalizeLibraryId('tmdb: 12477 ')).toBe('tmdb:12477');
        expect(normalizeLibraryId('TMDB:42953')).toBe('tmdb:42953');
        expect(normalizeLibraryId('kitsu: 1075')).toBe('kitsu:1075');
        expect(normalizeLibraryId('TT0095327')).toBe('tt0095327');
        expect(normalizeLibraryId('12477')).toBe('tmdb:12477');
        expect(normalizeLibraryId('')).toBe('');
    });
});

describe('normalizeTitle', () => {
    test('ignora accenti, maiuscole e punteggiatura', () => {
        expect(normalizeTitle('La tomba delle lucciole')).toBe('la tomba delle lucciole');
        expect(normalizeTitle('RIN - Le figlie di Mnemosyne')).toBe('rin le figlie di mnemosyne');
        expect(normalizeTitle('Amélie!')).toBe('amelie');
    });
});

describe('normalizeLegacyPosterHost', () => {
    test('riscrive i poster del vecchio HF Space verso l host corrente', () => {
        const poster = 'https://gabriele-fuoco-yaca.hf.space/images/poster/movie/tt0095327/ITA/23?t=1';
        expect(normalizeLegacyPosterHost(poster, 'https://mate.taild24589.ts.net'))
            .toBe('https://mate.taild24589.ts.net/images/poster/movie/tt0095327/ITA/23?t=1');
    });

    test('non tocca i poster di altri host', () => {
        const tmdb = 'https://image.tmdb.org/t/p/w500/abc.jpg';
        const mate = 'https://mate.taild24589.ts.net/images/poster/movie/tt1/ITA/24?original=https%3A%2F%2Fgabriele-fuoco-yaca.hf.space%2Fx.jpg';
        expect(normalizeLegacyPosterHost(tmdb, 'https://mate.taild24589.ts.net')).toBe(tmdb);
        // Il vecchio host compare solo nel parametro: il poster è già corretto
        expect(normalizeLegacyPosterHost(mate, 'https://mate.taild24589.ts.net')).toBe(mate);
    });

    test('senza host corrente o con poster vuoto non cambia nulla', () => {
        expect(normalizeLegacyPosterHost('https://gabriele-fuoco-yaca.hf.space/a.jpg', '')).toBe('https://gabriele-fuoco-yaca.hf.space/a.jpg');
        expect(normalizeLegacyPosterHost('', 'https://x.ts.net')).toBe('');
        expect(normalizeLegacyPosterHost(null, 'https://x.ts.net')).toBe(null);
    });
});

describe('planDuplicateMarks', () => {
    const library = [
        { itemId: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole', year: '', _ctime: new Date('2024-01-01') },
        { itemId: 'tmdb: 12477 ', type: 'movie', name: 'La tomba delle lucciole', year: '', _ctime: new Date('2024-02-01') },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        duckDbStore.query.mockResolvedValue([]);
    });

    test('marca il duplicato quando gli id risolvono alla stessa entità', async () => {
        duckDbStore.query.mockImplementation((sql) => {
            if (sql.includes('FROM movies')) return Promise.resolve([{ id: '12477', imdb_id: 'tt0095327' }]);
            return Promise.resolve([]);
        });

        const plan = await planDuplicateMarks(library);

        // Le chiavi del piano sono gli id ripuliti; il valore è l'itemId primario
        // così com'è in archivio (serve al filtro di scrittura).
        expect(plan.get('tmdb: 12477')).toBe('tt0095327');
        expect(plan.get('tt0095327')).toBe(null); // l'id IMDb resta il primario
    });

    test('senza risoluzione dagli id usa titolo+anno: il duplicato viene marcato', async () => {
        const plan = await planDuplicateMarks([
            { itemId: 'tmdb: 12477 ', type: 'movie', name: 'La tomba delle lucciole', year: '' },
            { itemId: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole', year: '' },
        ]);

        expect(plan.get('tmdb: 12477')).toBe('tt0095327');
    });

    test('titolo uguale ma anno diverso: nessun duplicato (stagioni diverse)', async () => {
        const plan = await planDuplicateMarks([
            { itemId: 'tmdb:1', type: 'series', name: 'Fate', year: '2006' },
            { itemId: 'tmdb:2', type: 'series', name: 'Fate', year: '2014' },
        ]);

        expect([...plan.values()].filter(Boolean)).toEqual([]);
    });

    test('converte gli id kitsu in TMDB tramite il mapping anime', async () => {
        duckDbStore.query.mockImplementation((sql) => {
            if (sql.includes('FROM tv')) return Promise.resolve([{ id: '46004', imdb_id: 'tt2575684' }]);
            return Promise.resolve([]);
        });

        const plan = await planDuplicateMarks([
            { itemId: 'kitsu:7278', type: 'anime', name: 'Date A Live', year: '' },
            { itemId: 'tt2575684', type: 'series', name: 'Date A Live', year: '2013' },
        ]);

        expect(plan.get('kitsu:7278')).toBe('tt2575684');
    });

    test('gli item rimossi non contano come duplicati', async () => {
        const plan = await planDuplicateMarks([
            { itemId: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole', removed: true },
            { itemId: 'tmdb: 12477 ', type: 'movie', name: 'La tomba delle lucciole' },
        ]);

        expect(plan.has('tt0095327')).toBe(false);
        expect(plan.get('tmdb: 12477')).toBe(null);
    });
});
