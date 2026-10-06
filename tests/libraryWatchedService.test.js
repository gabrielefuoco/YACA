/**
 * tests/libraryWatchedService.test.js
 *
 * Test di specifica per Ticket 20: Rimuovi titoli visti.
 * 1. Fonte del "visto": solo lo stato di Stremio (timesWatched > 0 || flaggedWatched === 1).
 *    Nessun incrocio con WatchHistory (DNA intatto).
 * 2. Protezione serie in corso: solo completate (timesWatched > 0) o marcate a mano (flaggedWatched === 1).
 *    Un episodio visto (season > 0, episode > 0, timeWatched > 0) NON basta.
 * 3. Scrittura: soft-delete locale (removed: true, _mtime fresco monotono) + push Stremio via datastorePut.
 *    Nessun deleteMany (prevenzione resurrezione da sync).
 * 4. Anteprima obbligatoria: conteggio dichiarato prima dell'esecuzione coincidente con i titoli che spariscono.
 * 5. Riuso identità e duplicati: cancellazione a cascata dei duplicati collegati (duplicateOf) e normalizzazione id.
 * 6. Idempotenza: rieseguire l'azione non produce effetti né errori.
 */

const {
    isWatchedItem,
    findWatchedItems,
    previewWatchedLibrary,
    removeWatchedLibrary
} = require('../src/services/libraryWatchedService');

const UserLibraryItem = require('../src/db/models/UserLibraryItem');
const UserAccount = require('../src/db/models/UserAccount');
const WatchHistory = require('../src/models/WatchHistory');
const { stremioClient } = require('../src/clients/stremio');

jest.mock('../src/db/models/UserLibraryItem');
jest.mock('../src/db/models/UserAccount');
jest.mock('../src/models/WatchHistory');
jest.mock('../src/clients/stremio', () => ({
    stremioClient: {
        post: jest.fn().mockResolvedValue({ data: { result: { success: true } } })
    }
}));
jest.mock('../src/utils/libraryIdentity', () => ({
    applyDuplicateMarks: jest.fn().mockResolvedValue({ duplicates: 0, cleared: 0 })
}));

describe('Ticket 20: 1. Regola di identificazione del "visto" e protezione serie in corso', () => {
    describe('Film (type: movie)', () => {
        test('Film visto tramite riproduzione (timesWatched > 0) è visto', () => {
            const item = {
                itemId: 'tt0111161',
                type: 'movie',
                name: 'Le ali della libertà',
                state: { timesWatched: 1, flaggedWatched: 0, watched: '', season: 0, episode: 0 }
            };
            expect(isWatchedItem(item)).toBe(true);
        });

        test('Film marcato a mano (flaggedWatched === 1) è visto anche se timesWatched === 0', () => {
            const item = {
                itemId: 'tt0068646',
                type: 'movie',
                name: 'Il padrino',
                state: { timesWatched: 0, flaggedWatched: 1, watched: '', season: 0, episode: 0 }
            };
            expect(isWatchedItem(item)).toBe(true);
        });

        test('Film non visto (timesWatched === 0, flaggedWatched === 0) non è visto', () => {
            const item = {
                itemId: 'tt0137523',
                type: 'movie',
                name: 'Fight Club',
                state: { timesWatched: 0, flaggedWatched: 0, watched: '', season: 0, episode: 0 }
            };
            expect(isWatchedItem(item)).toBe(false);
        });

        test('Film senza state o con state nullo non è visto', () => {
            expect(isWatchedItem({ itemId: 'tt123', type: 'movie' })).toBe(false);
            expect(isWatchedItem({ itemId: 'tt123', type: 'movie', state: null })).toBe(false);
        });
    });

    describe('Serie TV (type: series / tv)', () => {
        test('Serie in corso (season 1, episode 3, timesWatched === 0, flaggedWatched === 0) NON è vista (protetta dal Continue Watching)', () => {
            const item = {
                itemId: 'tt0903747',
                type: 'series',
                name: 'Breaking Bad',
                state: { timesWatched: 0, flaggedWatched: 0, watched: 'tt0903747:1:1,tt0903747:1:2', season: 1, episode: 3, timeWatched: 3000 }
            };
            expect(isWatchedItem(item)).toBe(false);
        });

        test('Serie al finale ma non completata né marcata (timesWatched === 0, flaggedWatched === 0) NON è vista', () => {
            const item = {
                itemId: 'tt0903747',
                type: 'series',
                name: 'Breaking Bad',
                state: { timesWatched: 0, flaggedWatched: 0, watched: '', season: 5, episode: 16 }
            };
            expect(isWatchedItem(item)).toBe(false);
        });

        test('Serie completata interamente in Stremio (timesWatched > 0) è vista', () => {
            const item = {
                itemId: 'tt0903747',
                type: 'series',
                name: 'Breaking Bad',
                state: { timesWatched: 1, flaggedWatched: 0, watched: '', season: 5, episode: 16 }
            };
            expect(isWatchedItem(item)).toBe(true);
        });

        test('Serie marcata a mano (flaggedWatched === 1) è vista', () => {
            const item = {
                itemId: 'tt0944947',
                type: 'series',
                name: 'Il Trono di Spade',
                state: { timesWatched: 0, flaggedWatched: 1, watched: '', season: 8, episode: 6 }
            };
            expect(isWatchedItem(item)).toBe(true);
        });
    });

    describe('Anime (type: anime)', () => {
        test('Anime film con timesWatched > 0 è visto', () => {
            const item = {
                itemId: 'kitsu:142',
                type: 'anime',
                name: 'Princess Mononoke',
                state: { timesWatched: 1, flaggedWatched: 0, season: 0, episode: 0 }
            };
            expect(isWatchedItem(item)).toBe(true);
        });

        test('Anime serie in corso con episodi visti (season 1, episode 5, timesWatched 0) NON è vista', () => {
            const item = {
                itemId: 'kitsu:7278',
                type: 'anime',
                name: 'Date A Live',
                state: { timesWatched: 0, flaggedWatched: 0, season: 1, episode: 5 }
            };
            expect(isWatchedItem(item)).toBe(false);
        });

        test('Anime serie marcata a mano (flaggedWatched === 1) è vista', () => {
            const item = {
                itemId: 'kitsu:7278',
                type: 'anime',
                name: 'Date A Live',
                state: { timesWatched: 0, flaggedWatched: 1, season: 1, episode: 12 }
            };
            expect(isWatchedItem(item)).toBe(true);
        });
    });
});

describe('Ticket 20: 2. Anteprima e gestione duplicati (duplicateOf)', () => {
    test('findWatchedItems calcola l anteprima sui titoli visibili e include i duplicati collegati nella rimozione', () => {
        const items = [
            // Titolo 1: Film visto con duplicato kitsu
            { itemId: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole', duplicateOf: null, state: { timesWatched: 1, flaggedWatched: 0 } },
            { itemId: 'kitsu:534', type: 'anime', name: 'Grave of the Fireflies', duplicateOf: 'tt0095327', state: { timesWatched: 0, flaggedWatched: 0 } },

            // Titolo 2: Serie in corso (NON vista)
            { itemId: 'tt0903747', type: 'series', name: 'Breaking Bad', duplicateOf: null, state: { timesWatched: 0, flaggedWatched: 0, season: 2, episode: 5 } },

            // Titolo 3: Serie marcata a mano (vista)
            { itemId: 'tt0944947', type: 'series', name: 'Game of Thrones', duplicateOf: null, state: { timesWatched: 0, flaggedWatched: 1 } },

            // Titolo 4: Film non visto
            { itemId: 'tt0137523', type: 'movie', name: 'Fight Club', duplicateOf: null, state: { timesWatched: 0, flaggedWatched: 0 } }
        ];

        const { visibleItems, allItemsToRemove, count } = findWatchedItems(items);

        // Nel pannello spariranno esattamente 2 titoli (La tomba delle lucciole e Game of Thrones)
        expect(count).toBe(2);
        expect(visibleItems.map(i => i.itemId)).toEqual(['tt0095327', 'tt0944947']);

        // Nei record da soft-deletare e pushare a Stremio ci devono essere 3 documenti (incluso kitsu:534!)
        expect(allItemsToRemove.map(i => i.itemId)).toEqual(['tt0095327', 'kitsu:534', 'tt0944947']);
    });

    test('Se il duplicato secondario ha lo stato visto mentre il primario no, il titolo viene comunque riconosciuto e rimosso', () => {
        const items = [
            { itemId: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole', duplicateOf: null, state: { timesWatched: 0, flaggedWatched: 0 } },
            { itemId: 'kitsu:534', type: 'anime', name: 'Grave of the Fireflies', duplicateOf: 'tt0095327', state: { timesWatched: 1, flaggedWatched: 0 } }
        ];

        const { visibleItems, allItemsToRemove, count } = findWatchedItems(items);
        expect(count).toBe(1);
        expect(visibleItems.map(i => i.itemId)).toEqual(['tt0095327']);
        expect(allItemsToRemove.map(i => i.itemId)).toEqual(['tt0095327', 'kitsu:534']);
    });
});

describe('Ticket 20: 3. Esecuzione sincrona, soft-delete e push Stremio', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('previewWatchedLibrary restituisce il conteggio senza modificare il DB né chiamare Stremio', async () => {
        const mockItems = [
            { itemId: 'tt0111161', type: 'movie', name: 'Le ali della libertà', duplicateOf: null, state: { timesWatched: 1 } },
            { itemId: 'tt0137523', type: 'movie', name: 'Fight Club', duplicateOf: null, state: { timesWatched: 0 } }
        ];

        UserLibraryItem.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockItems)
        });

        const preview = await previewWatchedLibrary({ addonUuid: 'uuid-123' });

        expect(preview.count).toBe(1);
        expect(preview.items).toHaveLength(1);
        expect(preview.items[0].itemId).toBe('tt0111161');

        expect(UserLibraryItem.updateMany).not.toHaveBeenCalled();
        expect(stremioClient.post).not.toHaveBeenCalled();
    });

    test('removeWatchedLibrary esegue soft-delete locale con _mtime fresco e push a Stremio', async () => {
        const beforeDate = new Date();

        const mockItems = [
            { itemId: 'tt0111161', type: 'movie', name: 'Le ali della libertà', duplicateOf: null, state: { timesWatched: 1 } },
            { itemId: 'tt0137523', type: 'movie', name: 'Fight Club', duplicateOf: null, state: { timesWatched: 0 } }
        ];

        UserLibraryItem.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockItems)
        });
        UserLibraryItem.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });

        const result = await removeWatchedLibrary({
            addonUuid: 'uuid-123',
            stremioAuthKey: 'auth-stremio-key'
        });

        expect(result.success).toBe(true);
        expect(result.count).toBe(1);
        expect(result.removedItemsCount).toBe(1);

        // 1. Soft-delete locale (removed: true, _mtime >= beforeDate)
        expect(UserLibraryItem.updateMany).toHaveBeenCalledWith(
            { addonUuid: 'uuid-123', itemId: { $in: ['tt0111161'] } },
            expect.objectContaining({
                $set: expect.objectContaining({
                    removed: true,
                    _mtime: expect.any(Date)
                })
            })
        );
        const updateCall = UserLibraryItem.updateMany.mock.calls[0][1].$set;
        expect(updateCall._mtime.getTime()).toBeGreaterThanOrEqual(beforeDate.getTime());

        // 2. Push a Stremio con datastorePut
        expect(stremioClient.post).toHaveBeenCalledWith('/api/datastorePut', expect.objectContaining({
            authKey: 'auth-stremio-key',
            collection: 'libraryItem',
            changes: [
                expect.objectContaining({
                    _id: 'tt0111161',
                    removed: true,
                    _mtime: expect.any(Date)
                })
            ]
        }), expect.any(Object));

        // 3. WatchHistory NON toccata
        expect(WatchHistory.find).not.toHaveBeenCalled();
        expect(WatchHistory.deleteMany).not.toHaveBeenCalled();
    });

    test('removeWatchedLibrary con 0 titoli visti è idempotente e non chiama Stremio', async () => {
        const mockItems = [
            { itemId: 'tt0137523', type: 'movie', name: 'Fight Club', duplicateOf: null, state: { timesWatched: 0 } }
        ];

        UserLibraryItem.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockItems)
        });
        UserLibraryItem.updateMany = jest.fn();

        const result = await removeWatchedLibrary({
            addonUuid: 'uuid-123',
            stremioAuthKey: 'auth-stremio-key'
        });

        expect(result.success).toBe(true);
        expect(result.count).toBe(0);
        expect(result.removedItemsCount).toBe(0);
        expect(UserLibraryItem.updateMany).not.toHaveBeenCalled();
        expect(stremioClient.post).not.toHaveBeenCalled();
    });

    test('removeWatchedLibrary spezza il push a Stremio in chunk di 100 per grandi volumi', async () => {
        // Genera 150 item visti
        const mockItems = [];
        for (let i = 1; i <= 150; i++) {
            mockItems.push({
                itemId: `tt${String(i).padStart(7, '0')}`,
                type: 'movie',
                name: `Movie ${i}`,
                duplicateOf: null,
                state: { timesWatched: 1 }
            });
        }

        UserLibraryItem.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockItems)
        });
        UserLibraryItem.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 150 });

        const result = await removeWatchedLibrary({
            addonUuid: 'uuid-123',
            stremioAuthKey: 'auth-stremio-key'
        });

        expect(result.count).toBe(150);
        expect(result.removedItemsCount).toBe(150);
        // Due chiamate a stremioClient.post: prima da 100, seconda da 50
        expect(stremioClient.post).toHaveBeenCalledTimes(2);
        expect(stremioClient.post.mock.calls[0][1].changes).toHaveLength(100);
        expect(stremioClient.post.mock.calls[1][1].changes).toHaveLength(50);
    });
});
