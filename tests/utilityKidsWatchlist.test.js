jest.mock('../src/library/models/UserLibraryItem', () => ({
    find: jest.fn()
}));

jest.mock('../src/library/ingestion/LibrarySyncService', () => ({
    syncLibraryForUser: jest.fn()
}));

const UserLibraryItem = require('../src/library/models/UserLibraryItem');
const duckDbStore = require('../src/indice/duckDbStore');
const { getWatchlistCatalog } = require('../src/stremio/providers/WatchlistProvider');
const { applyKidsMode, isItemInappropriateForKids } = require('../src/catalog/kidsModeFilters');

function mockLibraryItems(items) {
    UserLibraryItem.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                    lean: jest.fn().mockResolvedValue(items)
                })
            })
        })
    });
}

describe('U-02: fail-closed kidsMode nella watchlist', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('arricchisce la watchlist e blocca Fight Club anche in kidsMode', async () => {
        mockLibraryItems([
            {
                itemId: 'tt0137523',
                type: 'movie',
                name: 'Fight Club',
                year: '1999',
                tmdbId: 550
            },
            {
                itemId: 'tt0111161',
                type: 'movie',
                name: 'Toy Story',
                year: '1995',
                tmdbId: 862
            },
            {
                itemId: 'tt0169547',
                type: 'movie',
                name: 'American Beauty',
                year: '1999'
            }
        ]);

        const querySpy = jest.spyOn(duckDbStore, 'query').mockImplementation(async sql => {
            if (!sql.includes('FROM movies')) return [];
            return [
                {
                    id: 550n,
                    title: 'Fight Club',
                    genres: JSON.stringify([
                        { id: 18, name: 'Drama' },
                        { id: 53, name: 'Thriller' }
                    ]),
                    keywords: JSON.stringify([{ id: 818, name: 'based on novel or book' }]),
                    adult: false
                },
                {
                    id: 862n,
                    title: 'Toy Story',
                    genres: JSON.stringify([
                        { id: 16, name: 'Animation' },
                        { id: 10751, name: 'Family' }
                    ]),
                    keywords: JSON.stringify([{ id: 155276, name: 'one year old' }]),
                    adult: false
                }
            ];
        });

        const metas = await getWatchlistCatalog(
            'yaca_watchlist_movies',
            'movie',
            0,
            { addonUuid: 'sim-uuid' },
            { kidsMode: true }
        );

        // Il provider filtra PRIMA del taglio: Fight Club non arriva nemmeno
        // alla pagina, invece di essere potato dopo (ticket 11, sito 4).
        const ids = metas.map(meta => meta.id);
        expect(ids).toContain('tt0111161');
        expect(ids).not.toContain('tt0137523');

        const toy = metas.find(meta => meta.id === 'tt0111161');
        expect(toy).toEqual(expect.objectContaining({
            genre_ids: [16, 10751],
            keywords: [{ id: 155276, name: 'one year old' }]
        }));

        // applyKidsMode resta idempotente su una pagina già filtrata.
        expect(applyKidsMode(metas).map(meta => meta.id)).toEqual(['tt0111161']);
    });

    test('il filtro dichiara non sicuri item e segnali metadata mancanti', () => {
        expect(isItemInappropriateForKids(null)).toBe(true);
        expect(isItemInappropriateForKids({})).toBe(true);
        expect(isItemInappropriateForKids({ genre_ids: [] })).toBe(true);
        expect(isItemInappropriateForKids({ genre_ids: [16] })).toBe(false);
        expect(isItemInappropriateForKids({ keywords: [{ id: 1 }] })).toBe(false);
        expect(isItemInappropriateForKids({
            genre_ids: [16],
            keywords: [{ id: 1 }]
        })).toBe(false);
        expect(isItemInappropriateForKids({
            genre_ids: [16],
            keywords: [{ id: 10292 }]
        })).toBe(true);
        expect(isItemInappropriateForKids({
            genre_ids: [16],
            keywords: [{ id: 1 }],
            release_dates: {
                results: [{
                    iso_3166_1: 'IT',
                    release_dates: [{ certification: 'VM14' }]
                }]
            }
        })).toBe(true);
        expect(isItemInappropriateForKids({
            genre_ids: [16],
            keywords: [{ id: 1 }],
            content_rating: 'PG'
        })).toBe(false);
    });
});
