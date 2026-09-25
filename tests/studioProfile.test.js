/**
 * Sezione "STUDI" del DNA: distribuzione degli studi di produzione nella libreria.
 * Tutto locale (parquet + Mongo), nessuna chiamata TMDB. Gli studi NON entrano
 * nel vettore DNA: servono solo alla vista.
 */
jest.mock('../src/db/duckDbStore', () => ({ query: jest.fn() }));
jest.mock('../src/db/models/UserLibraryItem', () => ({
    collection: { find: jest.fn() }
}));
jest.mock('../src/data/animeMappingStore', () => ({
    kitsuToTmdb: new Map([['142', '129']])
}));

const duckDbStore = require('../src/db/duckDbStore');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');
const { computeStudioProfile, parseLibraryId } = require('../src/profile/studioProfile');

const libraryDocs = (docs) => ({
    toArray: () => Promise.resolve(docs),
});

describe('computeStudioProfile', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('estrae le chiavi di ricerca dagli id della libreria (imdb, tmdb, kitsu)', () => {
        expect(parseLibraryId('tt0111161')).toEqual([{ kind: 'imdb', value: 'tt0111161' }]);
        expect(parseLibraryId('tmdb:42953')).toEqual([{ kind: 'id', value: '42953' }]);
        expect(parseLibraryId('tmdb: 12477 ')).toEqual([{ kind: 'id', value: '12477' }]);
        expect(parseLibraryId('kitsu:142')).toEqual([{ kind: 'id', value: '129' }]); // mappato via animeMappingStore
        expect(parseLibraryId('kitsu:999999')).toEqual([]);
        expect(parseLibraryId('')).toEqual([]);
    });

    test('aggrega gli studi di film e serie e normalizza il peso sul più presente', async () => {
        UserLibraryItem.collection.find.mockReturnValue(libraryDocs([
            { itemId: 'tmdb:550', type: 'movie' },
            { itemId: 'tmdb:551', type: 'movie' },
            { itemId: 'tt0903747', type: 'series' },
        ]));

        duckDbStore.query.mockImplementation((sql) => {
            if (sql.includes('FROM movies')) {
                return Promise.resolve([
                    { id: '550', imdb_id: 'tt0137523', production_companies: '[{"id":1,"name":"Fox 2000 Pictures"}]' },
                    { id: '551', imdb_id: 'tt0137524', production_companies: '[{"id":1,"name":"FOX 2000 PICTURES"},{"id":2,"name":"Regency"}]' },
                ]);
            }
            if (sql.includes('FROM tv')) {
                return Promise.resolve([
                    { id: '1396', imdb_id: 'tt0903747', production_companies: '[{"id":3,"name":"Sony Pictures Television"}]', networks: '[{"id":4,"name":"AMC"}]' },
                ]);
            }
            return Promise.resolve([]);
        });

        const studios = await computeStudioProfile('uuid-test', { limit: 5 });

        expect(studios.map(s => s.name)).toEqual(['Fox 2000 Pictures', 'AMC', 'Regency', 'Sony Pictures Television']);
        expect(studios[0].weight).toBe(100); // 2 titoli su 2 massimi
        expect(studios.every(s => s.type === 'company')).toBe(true);

        // Il conteggio è case-insensitive: "Fox 2000 Pictures" e "FOX 2000 PICTURES" contano insieme
        const sony = studios.find(s => s.name === 'Sony Pictures Television');
        expect(sony.weight).toBe(50);
    });

    test('una libreria vuota non produce nulla', async () => {
        UserLibraryItem.collection.find.mockReturnValue(libraryDocs([]));

        await expect(computeStudioProfile('uuid-test')).resolves.toEqual([]);
        expect(duckDbStore.query).not.toHaveBeenCalled();
    });

    test('gli item non risolvibili vengono ignorati senza errori', async () => {
        UserLibraryItem.collection.find.mockReturnValue(libraryDocs([
            { itemId: 'kitsu:999999', type: 'anime' },
        ]));
        duckDbStore.query.mockResolvedValue([]);

        await expect(computeStudioProfile('uuid-test')).resolves.toEqual([]);
    });

    test('esclude gli item rimossi dalla libreria', async () => {
        UserLibraryItem.collection.find.mockReturnValue(libraryDocs([]));
        await computeStudioProfile('uuid-test');

        expect(UserLibraryItem.collection.find).toHaveBeenCalledWith({ addonUuid: 'uuid-test', removed: { $ne: true } });
    });
});
