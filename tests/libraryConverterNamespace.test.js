/**
 * tests/libraryConverterNamespace.test.js
 *
 * Test di collisione e scelta del namespace (movies vs tv) nel convertitore di libreria.
 *
 * Il difetto reale: gli ID TMDB sono due namespace numerici separati e sovrapposti.
 * Lo stesso ID esiste sia in `movies` che in `tv` con opere diverse.
 * Il convertitore deduceva la tabella da `(item.type === 'series' || item.type === 'tv') ? 'tv' : 'movies'`:
 * per gli item `anime` finiva sempre in `movies`, leggendo e scrivendo il film omonimo
 * per ID anziché la serie TV anime.
 *
 * Fixture reali verificate (dalla ricognizione ticket 11 & 12):
 * - 30981: film "Know Your Mushrooms" (2009) / serie "Monster" (2004) -> kitsu:10 (TV)
 * - 26867: film "The Blue Parrot" (1953) / serie "Mushishi" (2005) -> kitsu:419 (TV)
 * - 46298: film "Disney's Sing-Along Songs: Home On The Range" (2004) / serie "Hunter x Hunter (2011)" -> kitsu:6448 (TV)
 * - 94664: film "Sono venuto così" (1965) / serie "Mushoku Tensei: Jobless Reincarnation" (2021) -> kitsu:42323 (TV)
 * - 128: film "Princess Mononoke" (1997) / serie "Pasadena" (2001) -> kitsu:142 (Movie)
 * - 270603: film "Roundabout American" (2012) / serie "The Exiled Heavy Knight" (2026) -> tmdb:270603 (TV da poster)
 */

const mockDuckDbStore = {
    query: jest.fn(async (sql, params) => {
        const id = Number(params[0]);
        if (sql.includes('FROM movies')) {
            if (id === 30981) return [{ id: 30981, title: 'Know Your Mushrooms', release_date: '2009-01-01' }];
            if (id === 26867) return [{ id: 26867, title: 'The Blue Parrot', release_date: '1953-01-01' }];
            if (id === 46298) return [{ id: 46298, title: "Disney's Sing-Along Songs: Home On The Range", release_date: '2004-01-01' }];
            if (id === 94664) return [{ id: 94664, title: 'Sono venuto così', release_date: '1965-01-01' }];
            if (id === 128) return [{ id: 128, title: 'Princess Mononoke', release_date: '1997-07-12' }];
            if (id === 270603) return [{ id: 270603, title: 'Roundabout American', release_date: '2012-01-01' }];
            if (id === 99999) return [{ id: 99999, title: 'Wrong Guessed Movie' }];
        }
        if (sql.includes('FROM tv')) {
            if (id === 30981) return [{ id: 30981, name: 'Monster', first_air_date: '2004-04-06' }];
            if (id === 26867) return [{ id: 26867, name: 'Mushishi', first_air_date: '2005-10-23' }];
            if (id === 46298) return [{ id: 46298, name: 'Hunter x Hunter (2011)', first_air_date: '2011-10-02' }];
            if (id === 94664) return [{ id: 94664, name: 'Mushoku Tensei: Jobless Reincarnation', first_air_date: '2021-01-11' }];
            if (id === 128) return [{ id: 128, name: 'Pasadena', first_air_date: '2001-09-28' }];
            if (id === 270603) return [{ id: 270603, name: 'The Exiled Heavy Knight Knows How to Game the System', first_air_date: '2026-01-01' }];
            if (id === 99999) return [{ id: 99999, name: 'Wrong Guessed TV' }];
        }
        return [];
    })
};

jest.mock('../src/db/duckDbStore', () => mockDuckDbStore);

const mockAnimeMappingStore = {
    isReady: true,
    kitsuToTmdb: new Map([
        ['10', '30981'],
        ['419', '26867'],
        ['6448', '46298'],
        ['42323', '94664'],
        ['142', '128'],
        ['55555', '99999'] // Kitsu con TMDB id ma tipo ignoto
    ]),
    resolveTmdbFromKitsu: jest.fn(id => {
        const map = {
            '10': '30981',
            '419': '26867',
            '6448': '46298',
            '42323': '94664',
            '142': '128',
            '55555': '99999'
        };
        return map[String(id)] || null;
    }),
    resolveMediaTypeFromKitsu: jest.fn(id => {
        const map = {
            '10': 'tv',
            '419': 'tv',
            '6448': 'tv',
            '42323': 'tv',
            '142': 'movie'
        };
        return map[String(id)] || null; // '55555' ritorna null (tipo ignoto)
    }),
    resolveTmdbEntryFromKitsu: jest.fn(id => {
        const map = {
            '10': { tmdbId: '30981', type: 'tv' },
            '419': { tmdbId: '26867', type: 'tv' },
            '6448': { tmdbId: '46298', type: 'tv' },
            '42323': { tmdbId: '94664', type: 'tv' },
            '142': { tmdbId: '128', type: 'movie' },
            '55555': { tmdbId: '99999', type: null }
        };
        return map[String(id)] || null;
    }),
    resolveKitsuMovie: jest.fn(id => (String(id) === '128' ? '142' : null)),
    resolveMediaTypeDaTmdbId: jest.fn(id => {
        if (['30981', '26867', '46298', '94664'].includes(String(id))) return 'tv';
        if (String(id) === '128') return 'movie';
        return null;
    }),
    tmdbToAnimeNode: new Map([
        ['30981:1', {}],
        ['26867:1', {}],
        ['46298:1', {}],
        ['94664:1', {}]
    ]),
    _tmdbIdPuro: jest.fn(id => String(id))
};

jest.mock('../src/data/animeMappingStore', () => mockAnimeMappingStore);

let mockCandidates = [];
jest.mock('../src/db/models/UserLibraryItem', () => ({
    find: jest.fn().mockReturnValue({
        limit: jest.fn().mockImplementation(() => Promise.resolve(mockCandidates))
    })
}));

jest.mock('../src/db/models/UserAccount', () => ({
    findOne: jest.fn().mockResolvedValue({
        userId: 'user-test',
        addonUuid: 'addon-uuid-1',
        apiKeys: { stremio: 'stremio-key', tmdb: 'tmdb-key' }
    })
}));

jest.mock('../src/db/models/AddonConfig', () => ({
    findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({})
    })
}));

jest.mock('../src/services/LibrarySyncService', () => ({
    deduplicateUserLibrary: jest.fn().mockResolvedValue(true)
}));

const mockStremioClient = {
    post: jest.fn().mockResolvedValue({ data: { success: true } })
};
jest.mock('../src/clients/stremio', () => ({
    stremioClient: mockStremioClient
}));

const mockTmdbClient = {
    get: jest.fn().mockResolvedValue({ data: {} })
};
jest.mock('../src/clients/tmdb', () => ({
    createTmdbClient: jest.fn().mockReturnValue(mockTmdbClient)
}));

function createItem(props) {
    return {
        _id: props.itemId || props._id,
        itemId: props.itemId || props._id,
        name: props.name || 'Titolo Iniziale',
        type: props.type || 'anime',
        tmdbId: props.tmdbId || null,
        mapped: props.mapped || false,
        removed: false,
        duplicateOf: null,
        parkedAt: null,
        conversionAttempts: 0,
        poster: props.poster || null,
        save: jest.fn().mockImplementation(async function() {
            return this;
        }),
        ...props
    };
}

const LibraryConverterService = require('../src/services/LibraryConverterService');

describe('LibraryConverterService: collisioni di namespace TMDB e tipo giusto', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('COLLISIONE kitsu:10 (ID 30981): sceglie tv (Monster) e non movies (Know Your Mushrooms)', async () => {
        const item = createItem({
            itemId: 'kitsu:10',
            name: 'Monster',
            type: 'anime',
            tmdbId: null,
            mapped: false
        });
        mockCandidates = [item];

        await LibraryConverterService.convertAll('user-test');

        expect(mockDuckDbStore.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM tv'),
            [30981]
        );
        expect(item.name).toBe('Monster');
        expect(item.mapped).toBe(true);
        expect(item.tmdbId).toBe('30981');
    });

    test('COLLISIONE kitsu:419 (ID 26867): sceglie tv (Mushishi) e non movies (The Blue Parrot)', async () => {
        const item = createItem({
            itemId: 'kitsu:419',
            name: 'Mushishi',
            type: 'anime',
            tmdbId: null,
            mapped: false
        });
        mockCandidates = [item];

        await LibraryConverterService.convertAll('user-test');

        expect(mockDuckDbStore.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM tv'),
            [26867]
        );
        expect(item.name).toBe('Mushishi');
        expect(item.mapped).toBe(true);
    });

    test('COLLISIONE kitsu:6448 (ID 46298): sceglie tv (Hunter x Hunter 2011) e non movies (Disney Sing-Along Songs)', async () => {
        const item = createItem({
            itemId: 'kitsu:6448',
            name: 'Hunter x Hunter (2011)',
            type: 'anime',
            tmdbId: null,
            mapped: false
        });
        mockCandidates = [item];

        await LibraryConverterService.convertAll('user-test');

        expect(mockDuckDbStore.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM tv'),
            [46298]
        );
        expect(item.name).toBe('Hunter x Hunter (2011)');
        expect(item.mapped).toBe(true);
    });

    test('COLLISIONE kitsu:42323 (ID 94664): sceglie tv (Mushoku Tensei) e non movies (Sono venuto così)', async () => {
        const item = createItem({
            itemId: 'kitsu:42323',
            name: 'Mushoku Tensei: Jobless Reincarnation',
            type: 'anime',
            tmdbId: null,
            mapped: false
        });
        mockCandidates = [item];

        await LibraryConverterService.convertAll('user-test');

        expect(mockDuckDbStore.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM tv'),
            [94664]
        );
        expect(item.name).toBe('Mushoku Tensei: Jobless Reincarnation');
        expect(item.mapped).toBe(true);
    });

    test('CASO FILM kitsu:142 (ID 128): sceglie movies (Princess Mononoke) e non tv (Pasadena)', async () => {
        const item = createItem({
            itemId: 'kitsu:142',
            name: 'Princess Mononoke',
            type: 'anime',
            tmdbId: null,
            mapped: false
        });
        mockCandidates = [item];

        await LibraryConverterService.convertAll('user-test');

        expect(mockDuckDbStore.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM movies'),
            [128]
        );
        expect(item.name).toBe('Princess Mononoke');
        expect(item.mapped).toBe(true);
        expect(item.tmdbId).toBe('128');
    });

    test('ITEM TMDB DIRETTO CON TYPE ANIME: tmdb:270603 ricava tv dal poster e scrive The Exiled Heavy Knight', async () => {
        const item = createItem({
            itemId: 'tmdb:270603',
            name: 'The Exiled Heavy Knight Knows How to Game the System',
            type: 'anime',
            poster: 'https://images.metahub.space/poster/medium/tmdb:tv:270603/img.jpg',
            tmdbId: '270603',
            mapped: false
        });
        mockCandidates = [item];

        await LibraryConverterService.convertAll('user-test');

        expect(mockDuckDbStore.query).toHaveBeenCalledWith(
            expect.stringContaining('FROM tv'),
            [270603]
        );
        expect(item.name).toBe('The Exiled Heavy Knight Knows How to Game the System');
        expect(item.mapped).toBe(true);
    });

    test('QUANDO IL TIPO NON E NOTO: il titolo salvato non cambia, zero interrogazioni e non si indovina', async () => {
        const originalName = 'Titolo Originario Intatto';
        const item = createItem({
            itemId: 'kitsu:55555',
            name: originalName,
            type: 'anime',
            tmdbId: null,
            mapped: false
        });
        mockCandidates = [item];

        await LibraryConverterService.convertAll('user-test');

        // Non deve aver interrogato né movies né tv con id 99999
        expect(mockDuckDbStore.query).not.toHaveBeenCalled();
        // Il titolo salvato NON cambia!
        expect(item.name).toBe(originalName);
        // Non è dato per convertito
        expect(item.mapped).toBe(false);
        // Non è stato inviato alcun aggiornamento a Stremio Datastore
        expect(mockStremioClient.post).not.toHaveBeenCalled();
    });
});
