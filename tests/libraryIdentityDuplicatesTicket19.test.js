/**
 * tests/libraryIdentityDuplicatesTicket19.test.js
 *
 * Test di specifica per Ticket 19:
 * 1. Regola di elezione del primario esplicita (non-rimosso prima, poi mappato, poi IMDb/canonico, poi più recente).
 * 2. Risoluzione del tipo da DB e tracciamento delle discordanze (senza indovinare).
 * 3. Normalizzazione in un percorso solo e salvaguardia di _ctime in POST /library.
 * 4. Dedup UI su chiave canonica (distinzione film vs serie con stesso ID numerico).
 */

const {
    compareLibraryItemsForPrimary,
    electPrimaryLibraryItem
} = require('../src/services/LibrarySyncService');
const {
    resolveItemMediaType,
    resolveMediaTypeFromDb,
    trackUnresolvedType,
    getUnresolvedTypeLog,
    clearUnresolvedTypeLog
} = require('../src/services/libraryMediaTypeResolution');
const { planDuplicateMarks } = require('../src/utils/libraryIdentity');
const duckDbStore = require('../src/db/duckDbStore');

jest.mock('../src/db/duckDbStore', () => ({
    query: jest.fn()
}));

describe('Ticket 19: 1. Regola di Elezione del Primario', () => {
    test('1.1. Non-rimosso vince sempre su rimosso (removed: false batte removed: true)', () => {
        const activeItem = { itemId: 'tmdb:12477', removed: false, mapped: false, _ctime: new Date('2024-01-01') };
        const removedItem = { itemId: 'tt0095327', removed: true, mapped: true, _ctime: new Date('2024-05-01') };

        // activeItem deve vincere anche se removedItem è mapped e ha data più recente
        expect(compareLibraryItemsForPrimary(activeItem, removedItem)).toBeLessThan(0);
        expect(compareLibraryItemsForPrimary(removedItem, activeItem)).toBeGreaterThan(0);
        expect(electPrimaryLibraryItem([removedItem, activeItem])).toEqual(activeItem);
    });

    test('1.2. Mappato vince su non-mappato a parità di stato rimosso (mapped: true batte mapped: false)', () => {
        const mappedItem = { itemId: 'tmdb:12477', removed: false, mapped: true, _ctime: new Date('2024-01-01') };
        const unmappedItem = { itemId: 'kitsu:534', removed: false, mapped: false, _ctime: new Date('2024-05-01') };

        expect(compareLibraryItemsForPrimary(mappedItem, unmappedItem)).toBeLessThan(0);
        expect(compareLibraryItemsForPrimary(unmappedItem, mappedItem)).toBeGreaterThan(0);
        expect(electPrimaryLibraryItem([unmappedItem, mappedItem])).toEqual(mappedItem);
    });

    test('1.3. Preferenza identificatore IMDb/canonico a parità di stato e mappatura', () => {
        const imdbItem = { itemId: 'tt0095327', removed: false, mapped: true, _ctime: new Date('2024-01-01') };
        const tmdbItem = { itemId: 'tmdb:12477', removed: false, mapped: true, _ctime: new Date('2024-05-01') };

        // IMDb ha preferenza perché Stremio lo gestisce nativamente meglio
        expect(compareLibraryItemsForPrimary(imdbItem, tmdbItem)).toBeLessThan(0);
        expect(electPrimaryLibraryItem([tmdbItem, imdbItem])).toEqual(imdbItem);
    });

    test('1.4. Timestamp più recente (_ctime o _mtime) a parità di preferenza identificatore', () => {
        const older = { itemId: 'tmdb:100', removed: false, mapped: true, _ctime: new Date('2024-01-01') };
        const newer = { itemId: 'tmdb:200', removed: false, mapped: true, _ctime: new Date('2024-06-01') };

        expect(compareLibraryItemsForPrimary(newer, older)).toBeLessThan(0);
        expect(electPrimaryLibraryItem([older, newer])).toEqual(newer);
    });

    test('1.5. Spareggio deterministico su itemId per evitare saltellamenti', () => {
        const date = new Date('2024-01-01');
        const itemA = { itemId: 'tmdb:100', removed: false, mapped: true, _ctime: date };
        const itemB = { itemId: 'tmdb:200', removed: false, mapped: true, _ctime: date };

        expect(compareLibraryItemsForPrimary(itemA, itemB)).toBeLessThan(0);
        expect(electPrimaryLibraryItem([itemB, itemA])).toEqual(itemA);
    });

    test('1.6. planDuplicateMarks applica la regola di elezione assegnando duplicateOf al secondario', async () => {
        duckDbStore.query.mockImplementation((sql) => {
            if (sql.includes('FROM movies')) return Promise.resolve([{ id: '12477', imdb_id: 'tt0095327' }]);
            return Promise.resolve([]);
        });

        const items = [
            { itemId: 'kitsu:534', type: 'anime', name: 'La tomba delle lucciole', mapped: false, removed: false, _ctime: new Date('2024-01-01') },
            { itemId: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole', mapped: true, removed: false, _ctime: new Date('2024-02-01') },
            { itemId: 'tmdb:12477', type: 'movie', name: 'La tomba delle lucciole', mapped: true, removed: false, _ctime: new Date('2024-03-01') }
        ];

        const plan = await planDuplicateMarks(items);
        expect(plan.get('tt0095327')).toBeNull(); // Primario (mapped, IMDb)
        expect(plan.get('tmdb:12477')).toBe('tt0095327');
        expect(plan.get('kitsu:534')).toBe('tt0095327');
    });
});

describe('Ticket 19: 2. Risoluzione Tipo da DB e Tracciamento Discordanze', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearUnresolvedTypeLog();
    });

    test('2.1. resolveMediaTypeFromDb risolve a movie se presente unicamente nella tabella movies', async () => {
        duckDbStore.query.mockImplementation((sql) => {
            if (sql.includes('FROM movies')) return Promise.resolve([{ id: '12477' }]);
            if (sql.includes('FROM tv')) return Promise.resolve([]);
            return Promise.resolve([]);
        });

        const item = { itemId: 'kitsu:534', type: 'anime', tmdbId: 12477, name: 'La tomba delle lucciole' };
        const resolved = await resolveMediaTypeFromDb(item, { duckDbStore });

        expect(resolved).toBe('movie');
    });

    test('2.2. resolveMediaTypeFromDb risolve a tv se presente unicamente nella tabella tv', async () => {
        duckDbStore.query.mockImplementation((sql) => {
            if (sql.includes('FROM movies')) return Promise.resolve([]);
            if (sql.includes('FROM tv')) return Promise.resolve([{ id: '46004' }]);
            return Promise.resolve([]);
        });

        const item = { itemId: 'kitsu:7278', type: 'anime', tmdbId: 46004, name: 'Date A Live' };
        const resolved = await resolveMediaTypeFromDb(item, { duckDbStore });

        expect(resolved).toBe('tv');
    });

    test('2.3. Se presente in entrambe le tabelle (collisione) e nessuna fonte disambigua: NON indovina e traccia', async () => {
        duckDbStore.query.mockImplementation((sql) => {
            if (sql.includes('FROM movies')) return Promise.resolve([{ id: '99999' }]);
            if (sql.includes('FROM tv')) return Promise.resolve([{ id: '99999' }]);
            return Promise.resolve([]);
        });

        const item = { itemId: 'tmdb:99999', type: 'anime', tmdbId: 99999, name: 'Ambiguo' };
        const resolved = await resolveMediaTypeFromDb(item, { duckDbStore });

        expect(resolved).toBeNull();
        const logs = getUnresolvedTypeLog();
        expect(logs.length).toBeGreaterThan(0);
        expect(logs.some(l => l.itemId === 'tmdb:99999' && l.reason.includes('Collisione'))).toBe(true);
    });

    test('2.4. Se assente da entrambe le tabelle: restituisce null e traccia l anomalia', async () => {
        duckDbStore.query.mockResolvedValue([]);

        const item = { itemId: 'tmdb:88888', type: 'anime', tmdbId: 88888, name: 'Sconosciuto' };
        const resolved = await resolveMediaTypeFromDb(item, { duckDbStore });

        expect(resolved).toBeNull();
        const logs = getUnresolvedTypeLog();
        expect(logs.some(l => l.itemId === 'tmdb:88888' && l.reason.includes('assente'))).toBe(true);
    });
});

describe('Ticket 19: 3. Normalizzazione e _ctime in POST /library (src/api/profiles.js)', () => {
    let handler;
    const UserAccount = require('../src/db/models/UserAccount');
    const UserLibraryItem = require('../src/db/models/UserLibraryItem');
    const libraryIdentity = require('../src/utils/libraryIdentity');

    beforeAll(() => {
        const LibraryConverterService = require('../src/services/LibraryConverterService');
        jest.spyOn(LibraryConverterService, 'convertAll').mockResolvedValue(0);
        const profilesRouter = require('../src/api/profiles');
        const postLayer = profilesRouter.stack.find(l => l.route?.path === '/:id/library' && l.route?.methods?.post);
        handler = postLayer.route.stack[0].handle;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        const LibraryConverterService = require('../src/services/LibraryConverterService');
        jest.spyOn(LibraryConverterService, 'convertAll').mockResolvedValue(0);
    });

    test('3.1. POST /library normalizza l itemId prima di salvare (tmdb: 12477  -> tmdb:12477)', async () => {
        jest.spyOn(UserAccount, 'findOne').mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'mock-uuid' })
        });
        jest.spyOn(UserLibraryItem, 'findOne').mockResolvedValue(null);
        let createdDoc = null;
        jest.spyOn(UserLibraryItem, 'create').mockImplementation((doc) => {
            createdDoc = doc;
            return Promise.resolve(doc);
        });
        const applyMarksSpy = jest.spyOn(libraryIdentity, 'applyDuplicateMarks').mockResolvedValue({ duplicates: 0, cleared: 0 });

        const req = {
            params: { id: 'prof1' },
            body: {
                userId: 'u1',
                item: { id: 'tmdb: 12477 ', type: 'movie', name: 'La tomba delle lucciole' }
            },
            headers: {},
            protocol: 'http',
            get: () => 'localhost'
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };

        await handler(req, res);

        expect(res.json).toHaveBeenCalled();
        expect(createdDoc).not.toBeNull();
        expect(createdDoc.itemId).toBe('tmdb:12477');
        expect(applyMarksSpy).toHaveBeenCalledWith('mock-uuid');
    });

    test('3.2. POST /library NON sovrascrive _ctime se il documento esiste già in archivio', async () => {
        jest.spyOn(UserAccount, 'findOne').mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'mock-uuid' })
        });
        const originalCtime = new Date('2023-01-15T10:00:00.000Z');
        const existingDoc = {
            addonUuid: 'mock-uuid',
            itemId: 'tt0095327',
            _ctime: originalCtime,
            _mtime: originalCtime,
            save: jest.fn().mockResolvedValue(true)
        };
        jest.spyOn(UserLibraryItem, 'findOne').mockResolvedValue(existingDoc);
        jest.spyOn(libraryIdentity, 'applyDuplicateMarks').mockResolvedValue({ duplicates: 0, cleared: 0 });

        const req = {
            params: { id: 'prof1' },
            body: {
                userId: 'u1',
                item: { id: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole' }
            },
            headers: {},
            protocol: 'http',
            get: () => 'localhost'
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };

        await handler(req, res);

        expect(existingDoc.save).toHaveBeenCalled();
        expect(existingDoc._ctime).toEqual(originalCtime); // Intatto! Non sovrascritto da now
    });
});

describe('Ticket 19: 4. Dedup UI su Chiave Canonica (frontend/src/lib/libraryCanonical.ts)', () => {
    let getCanonicalLibraryKey;

    beforeAll(() => {
        const fs = require('fs');
        const path = require('path');
        const ts = require('typescript');
        const canonicalCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/lib/libraryCanonical.ts'), 'utf8');
        const transpiled = ts.transpileModule(canonicalCode, {
            compilerOptions: { module: ts.ModuleKind.CommonJS }
        });
        const exportsObj = {};
        const fn = new Function('exports', transpiled.outputText);
        fn(exportsObj);
        getCanonicalLibraryKey = exportsObj.getCanonicalLibraryKey;
    });

    test('4.1. Distingue un film e una serie con lo stesso ID numerico TMDB (es. 155)', () => {
        const movieItem = { _id: '155', type: 'movie', name: 'The Dark Knight' };
        const seriesItem = { _id: '155', type: 'series', name: '3rd Rock from the Sun' };

        const movieKey = getCanonicalLibraryKey(movieItem);
        const seriesKey = getCanonicalLibraryKey(seriesItem);

        expect(movieKey).toBe('tmdb:movie:155');
        expect(seriesKey).toBe('tmdb:tv:155');
        expect(movieKey).not.toEqual(seriesKey);

        // Verifica che la deduplica in un Set/Map non cancelli uno dei due
        const items = [movieItem, seriesItem];
        const unique = Array.from(
            items.reduce((map, item) => {
                const key = getCanonicalLibraryKey(item);
                if (key && !map.has(key)) map.set(key, item);
                return map;
            }, new Map()).values()
        );

        expect(unique.length).toBe(2);
    });

    test('4.2. Riconosce come duplicati lo stesso film inserito come "12477" e "tmdb:12477"', () => {
        const item1 = { _id: '12477', type: 'movie' };
        const item2 = { itemId: 'tmdb:12477', type: 'movie' };

        expect(getCanonicalLibraryKey(item1)).toBe('tmdb:movie:12477');
        expect(getCanonicalLibraryKey(item2)).toBe('tmdb:movie:12477');
    });

    test('4.3. Riconosce come duplicati varianti case-insensitive di IMDb', () => {
        const item1 = { _id: 'tt0095327', type: 'movie' };
        const item2 = { _id: 'TT0095327', type: 'movie' };

        expect(getCanonicalLibraryKey(item1)).toBe('tt0095327');
        expect(getCanonicalLibraryKey(item2)).toBe('tt0095327');
    });

    test('4.4. Rispetta canonicalKey se già fornita esplicitamente', () => {
        const item = { _id: 'custom_1', canonicalKey: 'tt0095327' };
        expect(getCanonicalLibraryKey(item)).toBe('tt0095327');
    });
});

