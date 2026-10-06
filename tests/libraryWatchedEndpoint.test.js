/**
 * tests/libraryWatchedEndpoint.test.js
 *
 * Ticket 20: endpoint dedicato per "Rimuovi titoli visti".
 * GET  /api/profiles/:id/library/watched  → anteprima read-only (conteggio)
 * POST /api/profiles/:id/library/watched  → soft-delete + push Stremio
 *
 * Criteri coperti qui:
 * - l'anteprima dichiara N e l'esecuzione rimuove esattamente quelle N card visibili;
 * - le serie in corso non entrano nel conteggio;
 * - con zero titoli visti l'azione è idempotente e non tocca né MongoDB né Stremio.
 */

const UserAccount = require('../src/db/models/UserAccount');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');
const { stremioClient } = require('../src/clients/stremio');
const router = require('../src/api/profiles');

jest.mock('../src/db/models/UserAccount');
jest.mock('../src/db/models/AddonConfig');
jest.mock('../src/db/models/UserLibraryItem');
jest.mock('../src/clients/stremio', () => ({
    stremioClient: {
        post: jest.fn().mockResolvedValue({ data: { result: { success: true } } })
    }
}));

function findHandler(path, method) {
    const layer = router.stack.find(s => s.route && s.route.path === path && s.route.methods[method]);
    expect(layer).toBeDefined();
    return layer.route.stack[0].handle;
}

function makeRes() {
    const res = { statusCode: 200, body: null };
    res.status = jest.fn(code => { res.statusCode = code; return res; });
    res.json = jest.fn(body => { res.body = body; return res; });
    return res;
}

const PREVIEW_PATH = '/:id/library/watched';

describe('Ticket 20: endpoint /library/watched', () => {
    let previewHandler;
    let removeHandler;

    beforeAll(() => {
        previewHandler = findHandler(PREVIEW_PATH, 'get');
        removeHandler = findHandler(PREVIEW_PATH, 'post');
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('GET richiede userId e risolve l addonUuid dell utente', async () => {
        const badRes = makeRes();
        await previewHandler({ params: { id: 'prof-1' }, query: {} }, badRes);
        expect(badRes.status).toHaveBeenCalledWith(400);

        UserAccount.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
        const missingRes = makeRes();
        await previewHandler({ params: { id: 'prof-1' }, query: { userId: 'u1' } }, missingRes);
        expect(missingRes.status).toHaveBeenCalledWith(404);
    });

    test('GET conta solo i titoli visibili visti e non scrive nulla', async () => {
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1' })
        });
        UserLibraryItem.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([
                { itemId: 'tt0111161', type: 'movie', name: 'Le ali della libertà', duplicateOf: null, state: { timesWatched: 1 } },
                { itemId: 'kitsu:534', type: 'anime', name: 'Grave of the Fireflies', duplicateOf: 'tt0111161', state: { timesWatched: 0 } },
                { itemId: 'tt0903747', type: 'series', name: 'Breaking Bad', duplicateOf: null, state: { timesWatched: 0, season: 2, episode: 5 } },
                { itemId: 'tt0137523', type: 'movie', name: 'Fight Club', duplicateOf: null, state: { timesWatched: 0 } }
            ])
        });
        UserLibraryItem.updateMany = jest.fn();

        const res = makeRes();
        await previewHandler({ params: { id: 'prof-1' }, query: { userId: 'u1' } }, res);

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(res.body.count).toBe(1);
        expect(res.body.totalRecords).toBe(2); // il duplicato kitsu segue il primario
        expect(res.body.items.map(i => i.itemId)).toEqual(['tt0111161']);

        expect(UserLibraryItem.updateMany).not.toHaveBeenCalled();
        expect(stremioClient.post).not.toHaveBeenCalled();
    });

    test('il numero dichiarato dall anteprima coincide con quello rimosso (film + serie marcata, duplicato incluso)', async () => {
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1', apiKeys: { stremio: 'key-1' } })
        });
        const storedItems = [
            { itemId: 'tt0095327', type: 'movie', name: 'La tomba delle lucciole', duplicateOf: null, state: { timesWatched: 1 } },
            { itemId: 'kitsu:534', type: 'anime', name: 'Grave of the Fireflies', duplicateOf: 'tt0095327', state: { timesWatched: 0 } },
            { itemId: 'tt0903747', type: 'series', name: 'Breaking Bad', duplicateOf: null, state: { timesWatched: 0, season: 2, episode: 5 } },
            { itemId: 'tt0944947', type: 'series', name: 'Game of Thrones', duplicateOf: null, state: { flaggedWatched: 1 } }
        ];
        UserLibraryItem.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(storedItems) });
        UserLibraryItem.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 3 });

        const previewRes = makeRes();
        await previewHandler({ params: { id: 'prof-1' }, query: { userId: 'u1' } }, previewRes);
        expect(previewRes.body.count).toBe(2);

        const removeRes = makeRes();
        await removeHandler({ params: { id: 'prof-1' }, body: { userId: 'u1' } }, removeRes);

        expect(removeRes.body).toEqual({ success: true, count: 2, removedItemsCount: 3 });
        expect(removeRes.body.count).toBe(previewRes.body.count);

        expect(UserLibraryItem.updateMany).toHaveBeenCalledWith(
            { addonUuid: 'uuid-1', itemId: { $in: ['tt0095327', 'kitsu:534', 'tt0944947'] } },
            expect.objectContaining({
                $set: expect.objectContaining({
                    removed: true,
                    _mtime: expect.any(Date)
                })
            })
        );

        // Una sola chiamata: 3 record stanno nel primo blocco da 100.
        expect(stremioClient.post).toHaveBeenCalledTimes(1);
        const payload = stremioClient.post.mock.calls[0][1];
        expect(payload.authKey).toBe('key-1');
        expect(payload.collection).toBe('libraryItem');
        expect(payload.changes).toHaveLength(3);
        expect(payload.changes.every(c => c.removed === true && c._mtime instanceof Date)).toBe(true);
    });

    test('il tombstone ha _mtime strettamente maggiore di quello noto: è la condizione del merge Stremio', async () => {
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1', apiKeys: { stremio: 'key-1' } })
        });
        // Caso limite: l'`_mtime` locale (copia dell'ultimo dato Stremio) è nel futuro
        // rispetto all'orologio. Il tombstone deve comunque vincere il confronto
        // `new_item.mtime > item.mtime` del datastore, altrimenti il titolo resta.
        const remoteMtime = new Date(Date.now() + 3600_000);
        UserLibraryItem.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([
                { itemId: 'tt0111161', type: 'movie', name: 'Le ali della libertà', duplicateOf: null, _mtime: remoteMtime, state: { timesWatched: 1 } }
            ])
        });
        UserLibraryItem.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });

        const res = makeRes();
        await removeHandler({ params: { id: 'prof-1' }, body: { userId: 'u1' } }, res);

        const localMtime = UserLibraryItem.updateMany.mock.calls[0][1].$set._mtime;
        const pushedMtime = stremioClient.post.mock.calls[0][1].changes[0]._mtime;
        expect(localMtime.getTime()).toBeGreaterThan(remoteMtime.getTime());
        expect(pushedMtime.getTime()).toBe(localMtime.getTime());
        expect(stremioClient.post.mock.calls[0][1].changes[0]).toMatchObject({ _id: 'tt0111161', removed: true });
    });

    test('POST senza Stremio authKey rifiuta: senza push i titoli risusciterebbero', async () => {
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1', apiKeys: {} })
        });
        UserLibraryItem.updateMany = jest.fn();

        const res = makeRes();
        await removeHandler({ params: { id: 'prof-1' }, body: { userId: 'u1' } }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(stremioClient.post).not.toHaveBeenCalled();
        expect(UserLibraryItem.updateMany).not.toHaveBeenCalled();
    });

    test('POST senza titoli visti non scrive e non chiama Stremio (idempotenza)', async () => {
        UserAccount.findOne.mockReturnValue({
            lean: jest.fn().mockResolvedValue({ userId: 'u1', addonUuid: 'uuid-1', apiKeys: { stremio: 'key-1' } })
        });
        UserLibraryItem.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([
                { itemId: 'tt0903747', type: 'series', name: 'Breaking Bad', duplicateOf: null, state: { timesWatched: 0, season: 2, episode: 5 } }
            ])
        });
        UserLibraryItem.updateMany = jest.fn();

        const res = makeRes();
        await removeHandler({ params: { id: 'prof-1' }, body: { userId: 'u1' } }, res);

        expect(res.body).toEqual({ success: true, count: 0, removedItemsCount: 0 });
        expect(UserLibraryItem.updateMany).not.toHaveBeenCalled();
        expect(stremioClient.post).not.toHaveBeenCalled();
    });
});
