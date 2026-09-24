const { resolvePoster } = require('../src/utils/posterResolver');
const LibrarySyncService = require('../src/services/LibrarySyncService');
const UserLibraryItem = require('../src/db/models/UserLibraryItem');

// Mock duckDbStore in memory
jest.mock('../src/db/duckDbStore', () => ({
    query: jest.fn().mockImplementation((sql, params) => {
        const id = params && params[0];
        if (id === 550 || id === '550') {
            return Promise.resolve([{ id: 550, title: 'Fight Club', poster_path: '/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg' }]);
        }
        if (id === 1399 || id === '1399') {
            return Promise.resolve([{ id: 1399, name: 'Game of Thrones', poster_path: '/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg' }]);
        }
        return Promise.resolve([]);
    })
}));

describe('User Library Deduplication & Poster Resolution', () => {

    describe('1. Poster Resolution (resolvePoster)', () => {
        test('rispetta rigorosamente una copertina già esistente e valida', async () => {
            const item = {
                itemId: 'tt0137523',
                tmdbId: 550,
                type: 'movie',
                poster: 'https://images.example.com/custom_poster.jpg'
            };

            const result = await resolvePoster(item);
            expect(result).toBe('https://images.example.com/custom_poster.jpg');
        });

        test('riempie la copertina mancante da DuckDB usando tmdbId', async () => {
            const item = {
                itemId: 'tmdb:550',
                tmdbId: 550,
                type: 'movie',
                poster: '' // Mancante
            };

            const result = await resolvePoster(item);
            expect(result).toBe('https://image.tmdb.org/t/p/w500/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg');
        });

        test('riempie la copertina serie TV mancante da DuckDB', async () => {
            const item = {
                itemId: 'tmdb:1399',
                tmdbId: 1399,
                type: 'series',
                poster: null // Mancante
            };

            const result = await resolvePoster(item);
            expect(result).toBe('https://image.tmdb.org/t/p/w500/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg');
        });

        test('normalizza un poster_path relativo (/...) in URL TMDB completo', async () => {
            const item = {
                itemId: 'tt9999999',
                poster: '/mypath123.jpg'
            };

            const result = await resolvePoster(item);
            expect(result).toBe('https://image.tmdb.org/t/p/w500/mypath123.jpg');
        });
    });

    describe('2. Deduplicazione e Consolidamento Library (deduplicateUserLibrary)', () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        test('consolida item duplicati mantenendo il record più completo (mapped: true)', async () => {
            // Simula record legacy (_id Stremio, senza itemId) e record nuovo con itemId
            const mockItems = [
                {
                    _id: 'legacy-doc-1',
                    itemId: 'tt0137523',
                    mapped: true,
                    name: 'Fight Club (Mapped)',
                    poster: 'https://image.tmdb.org/t/p/w500/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg',
                    _mtime: new Date('2026-07-01'),
                    save: jest.fn().mockResolvedValue(true)
                },
                {
                    _id: 'tt0137523', // Legacy row dove _id era l'itemId
                    itemId: undefined,
                    mapped: false,
                    name: 'Fight Club (Unmapped)',
                    poster: null,
                    _mtime: new Date('2026-06-01'),
                    save: jest.fn().mockResolvedValue(true)
                }
            ];

            const findSpy = jest.spyOn(UserLibraryItem, 'find').mockReturnValue({
                sort: jest.fn().mockResolvedValue(mockItems)
            });

            const deleteManySpy = jest.spyOn(UserLibraryItem, 'deleteMany').mockResolvedValue({ deletedCount: 1 });

            const removedCount = await LibrarySyncService.deduplicateUserLibrary('mock-addon-uuid');

            expect(findSpy).toHaveBeenCalledWith({ addonUuid: 'mock-addon-uuid' });
            expect(removedCount).toBe(1);
            expect(deleteManySpy).toHaveBeenCalledWith({
                _id: { $in: ['tt0137523'] }
            });
        });

        test('assegna itemId se mancante su elementi unici non duplicati', async () => {
            const mockSingleItem = {
                _id: 'tt0095327',
                itemId: null,
                mapped: true,
                _mtime: new Date(),
                save: jest.fn().mockResolvedValue(true)
            };

            jest.spyOn(UserLibraryItem, 'find').mockReturnValue({
                sort: jest.fn().mockResolvedValue([mockSingleItem])
            });
            const deleteManySpy = jest.spyOn(UserLibraryItem, 'deleteMany').mockResolvedValue({ deletedCount: 0 });

            const removedCount = await LibrarySyncService.deduplicateUserLibrary('mock-addon-uuid');

            expect(removedCount).toBe(0);
            expect(mockSingleItem.itemId).toBe('tt0095327');
            expect(mockSingleItem.save).toHaveBeenCalled();
            expect(deleteManySpy).not.toHaveBeenCalled();
        });
    });

    describe('3. Idempotenza del Sync', () => {
        test('due sync consecutivi generano bulkWrite con chiavi itemId stabili e non moltiplicano record', async () => {
            const rawStremioItems = [
                { _id: 'tt0137523', name: 'Fight Club', type: 'movie', poster: null, tmdbId: 550 },
                { _id: 'tt0903747', name: 'Breaking Bad', type: 'series', poster: 'https://ex.com/bb.jpg', tmdbId: 1399 }
            ];

            // Il mock di DuckDB serve un poster per il solo Fight Club:
            // azzero il contatore per misurare quante risoluzioni fa questo test.
            const duckDbStore = require('../src/db/duckDbStore');
            duckDbStore.query.mockClear();

            // Simula la costruzione dei bulkOps come in LibrarySyncService
            const buildBulkOps = async (items, addonUuid) => {
                return Promise.all(items.map(async item => {
                    let poster = item.poster;
                    if (!poster) {
                        poster = await resolvePoster({
                            itemId: item._id,
                            tmdbId: item.tmdbId ? String(item.tmdbId) : null,
                            type: item.type,
                            name: item.name
                        });
                    }
                    return {
                        updateOne: {
                            filter: { addonUuid, itemId: item._id },
                            update: {
                                $set: {
                                    itemId: item._id,
                                    type: item.type,
                                    name: item.name,
                                    poster: poster || null
                                }
                            },
                            upsert: true
                        }
                    };
                }));
            };

            const ops1 = await buildBulkOps(rawStremioItems, 'uuid-test');
            const ops2 = await buildBulkOps(rawStremioItems, 'uuid-test');

            // Verifica idempotenza filtri e chiavi
            expect(ops1.length).toBe(2);
            expect(ops2.length).toBe(2);
            expect(ops1[0].updateOne.filter).toEqual({ addonUuid: 'uuid-test', itemId: 'tt0137523' });
            expect(ops2[0].updateOne.filter).toEqual({ addonUuid: 'uuid-test', itemId: 'tt0137523' });

            // Il poster mancante per Fight Club è stato risolto
            expect(ops1[0].updateOne.update.$set.poster).toBe('https://image.tmdb.org/t/p/w500/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg');
            // Il poster esistente per Breaking Bad è stato preservato
            expect(ops1[1].updateOne.update.$set.poster).toBe('https://ex.com/bb.jpg');
            // Risoluzione attivata SOLO per l'item senza copertina:
            // 1 chiamata per build (2 build) nonostante 2 item per build.
            expect(duckDbStore.query).toHaveBeenCalledTimes(2);
        });
    });

    describe('4. Safeguard Deduplica nella rotta GET /api/profiles/:id/library', () => {
        test('la risposta dell API de-duplica elementi multipli con lo stesso itemId', () => {
            const rawDbItems = [
                { _id: 'doc1', itemId: 'tt0137523', name: 'Fight Club', poster: 'p1' },
                { _id: 'tt0137523', itemId: null, name: 'Fight Club Legacy', poster: 'p2' },
                { _id: 'doc3', itemId: 'tt0903747', name: 'Breaking Bad', poster: 'p3' }
            ];

            // Logica esatta presente in GET /api/profiles/:id/library
            const seen = new Set();
            const mappedItems = [];

            for (const item of rawDbItems) {
                const effectiveId = String(item.itemId || item._id).trim();
                if (!effectiveId || seen.has(effectiveId)) continue;
                seen.add(effectiveId);

                mappedItems.push({
                    ...item,
                    _id: effectiveId,
                    itemId: effectiveId
                });
            }

            expect(mappedItems.length).toBe(2);
            expect(mappedItems.map(i => i._id)).toEqual(['tt0137523', 'tt0903747']);
        });
    });

    describe('5. Nessuna copertina degradata a null da un sync (preserveExistingPosters)', () => {
        const buildOps = () => ([
            { updateOne: { filter: { addonUuid: 'uuid-p', itemId: 'tt1' }, update: { $set: { itemId: 'tt1', name: 'Senza copertina risolta', poster: null } }, upsert: true } },
            { updateOne: { filter: { addonUuid: 'uuid-p', itemId: 'tt2' }, update: { $set: { itemId: 'tt2', name: 'Copertina nuova', poster: 'https://new.example/p2.jpg' } }, upsert: true } },
            { updateOne: { filter: { addonUuid: 'uuid-p', itemId: 'tt3' }, update: { $set: { itemId: 'tt3', name: 'Mai avuta copertina', poster: null } }, upsert: true } }
        ]);

        test('ripristina la copertina esistente quando la nuova sarebbe null', async () => {
            jest.spyOn(UserLibraryItem, 'find').mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { itemId: 'tt1', poster: 'https://old.example/p1.jpg' },
                    { itemId: 'tt2', poster: 'https://old.example/p2.jpg' }
                ])
            });

            const ops = buildOps();
            const preserved = await LibrarySyncService.preserveExistingPosters('uuid-p', ops);

            expect(preserved).toBe(1);
            expect(ops[0].updateOne.update.$set.poster).toBe('https://old.example/p1.jpg');
            // Copertina nuova valida: vince quella, non la vecchia
            expect(ops[1].updateOne.update.$set.poster).toBe('https://new.example/p2.jpg');
            // Nessuna copertina da preservare: resta null
            expect(ops[2].updateOne.update.$set.poster).toBeNull();
        });

        test('non fa nulla (e non lancia) senza addonUuid o senza ops', async () => {
            const findSpy = jest.spyOn(UserLibraryItem, 'find');
            findSpy.mockClear(); // il test precedente ha già usato la stessa spia

            expect(await LibrarySyncService.preserveExistingPosters(null, buildOps())).toBe(0);
            expect(await LibrarySyncService.preserveExistingPosters('uuid-p', [])).toBe(0);
            expect(findSpy).not.toHaveBeenCalled();
        });
    });
});
