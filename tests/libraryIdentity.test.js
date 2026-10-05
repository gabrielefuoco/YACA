/**
 * Identità di libreria: lo stesso titolo con id diversi (tt… / tmdb:… / kitsu:…)
 * deve diventare una sola card, e le copertine servite da host morti devono
 * essere riscritte verso l'host corrente.
 */
jest.mock('../src/db/duckDbStore', () => ({ query: jest.fn() }));
jest.mock('../src/data/animeMappingStore', () => ({
    kitsuToTmdb: new Map([['7278', '46004'], ['534', '12477']]),
    // Fribb dichiara il tipo che viaggia con l'id: 7278 (Date A Live) è una serie,
    // 534 (La tomba delle lucciole) è un film.
    resolveMediaTypeFromKitsu: jest.fn((kitsuId) => (kitsuId === '7278' ? 'tv' : (kitsuId === '534' ? 'movie' : null))),
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
    // La tailnet è stata rinominata il 2026-10-05: questo è l'host corrente, il vecchio
    // (`mate.taild24589.ts.net`) è ritirato e non risolve più.
    const CURRENT = 'https://mate.hyena-alphard.ts.net';

    test('riscrive i poster del vecchio HF Space verso l host corrente', () => {
        const poster = 'https://gabriele-fuoco-yaca.hf.space/images/poster/movie/tt0095327/ITA/23?t=1';
        expect(normalizeLegacyPosterHost(poster, CURRENT))
            .toBe(`${CURRENT}/images/poster/movie/tt0095327/ITA/23?t=1`);
    });

    test('riscrive i poster del vecchio nome tailnet, ritirato con la rinomina', () => {
        const poster = 'https://mate.taild24589.ts.net/images/poster/movie/tt1/ITA/24?t=2';
        expect(normalizeLegacyPosterHost(poster, CURRENT))
            .toBe(`${CURRENT}/images/poster/movie/tt1/ITA/24?t=2`);
    });

    test('non tocca i poster di altri host', () => {
        const tmdb = 'https://image.tmdb.org/t/p/w500/abc.jpg';
        const alreadyCurrent = `${CURRENT}/images/poster/movie/tt1/ITA/24?original=https%3A%2F%2Fgabriele-fuoco-yaca.hf.space%2Fx.jpg`;
        expect(normalizeLegacyPosterHost(tmdb, CURRENT)).toBe(tmdb);
        // Il vecchio host compare solo nel parametro: il poster è già corretto
        expect(normalizeLegacyPosterHost(alreadyCurrent, CURRENT)).toBe(alreadyCurrent);
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

    test('film e serie sono due namespace: lo stesso numero TMDB non aggancia l\'opera sbagliata', async () => {
        // 12477 è "La tomba delle lucciole" in movies ed è la serie "Fourth Reading" in tv.
        // Indicizzando le due tabelle in una mappa sola vinceva l'ultima riga (la serie):
        // `tmdb:12477` non risolveva a `tt0095327` e il film restava su due card.
        duckDbStore.query.mockImplementation((sql) => {
            if (sql.includes('FROM movies')) return Promise.resolve([{ id: '12477', imdb_id: 'tt0095327' }]);
            if (sql.includes('FROM tv')) return Promise.resolve([{ id: '12477', imdb_id: null }]);
            return Promise.resolve([]);
        });

        const plan = await planDuplicateMarks([
            { itemId: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole', year: '1988' },
            { itemId: 'tmdb:12477', type: 'movie', name: 'La tomba delle lucciole', year: '1988' },
            { itemId: 'kitsu:534', type: 'anime', name: 'La tomba delle lucciole', year: '1988' },
        ]);

        expect(plan.get('tt0095327')).toBe(null); // il primario è l'id che Stremio apre meglio
        expect(plan.get('tmdb:12477')).toBe('tt0095327');
        expect(plan.get('kitsu:534')).toBe('tt0095327');
    });

    test('una serie con lo stesso numero TMDB di un film resta un\'altra cosa', async () => {
        duckDbStore.query.mockImplementation((sql) => {
            if (sql.includes('FROM movies')) return Promise.resolve([{ id: '12477', imdb_id: 'tt0095327' }]);
            if (sql.includes('FROM tv')) return Promise.resolve([{ id: '12477', imdb_id: null }]);
            return Promise.resolve([]);
        });

        const plan = await planDuplicateMarks([
            { itemId: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole', year: '1988' },
            { itemId: 'tmdb:12477', type: 'series', name: 'Fourth Reading', year: '' },
        ]);

        expect(plan.get('tt0095327')).toBe(null);
        expect(plan.get('tmdb:12477')).toBe(null);
    });

    test('con il tipo ignoto e lo stesso numero in entrambe le tabelle non si indovina', async () => {
        duckDbStore.query.mockImplementation((sql) => {
            if (sql.includes('FROM movies')) return Promise.resolve([{ id: '12477', imdb_id: 'tt0095327' }]);
            if (sql.includes('FROM tv')) return Promise.resolve([{ id: '12477', imdb_id: null }]);
            return Promise.resolve([]);
        });

        const plan = await planDuplicateMarks([
            { itemId: 'tmdb:12477', type: 'anime', name: 'Senza tipo certo', year: '' },
            { itemId: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole', year: '1988' },
        ]);

        expect(plan.get('tmdb:12477')).toBe(null);
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
