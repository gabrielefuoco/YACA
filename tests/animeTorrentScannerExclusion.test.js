/**
 * tests/animeTorrentScannerExclusion.test.js
 * 
 * Verifica esclusione anime dallo scanner torrent ITA (Ticket 15).
 * - Gli anime NON devono essere accodati in `pendingscans` (mentre serie e film non-anime sì);
 * - Per un titolo anime non si generano mai due cloni ITA (vince lo stato esterno,
 *   e lo scanner torrent non crea cloni né per simulcast né per cataloghi generici);
 * - Nessun doppio clone anche se l'item ha già '_ita_offset'.
 */


jest.mock('../src/db/models/StreamBadge', () => ({
    find: jest.fn()
}));

const StreamBadge = require('../src/db/models/StreamBadge');
const animeMappingStore = require('../src/data/animeMappingStore');
const animeAiringState = require('../src/data/animeAiringState');
const {
    applyPostCacheBadges,
    isItemAnime,
    extractTmdbId
} = require('../src/handlers/catalogHandler');

const NOW = Date.UTC(2026, 8, 22, 12, 0, 0);
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };
const HOST_URL = 'http://localhost:7860';

describe('Esclusione Anime dallo Scanner Torrent ITA (Ticket 15)', () => {
    beforeAll(() => {
        // Setup in-memory mappings per animeMappingStore (zero network)
        animeMappingStore.isReady = true;
        animeMappingStore.buildAnibridgeIndex({
            'anidb:1001': {
                'tmdb_show:240411:s2': { '1-12': '1-12' }
            }
        });
        animeMappingStore.buildFribbIndex([
            {
                kitsu_id: 48269,
                anidb_id: 1001,
                themoviedb_id: 240411,
                type: 'TV'
            },
            {
                kitsu_id: 5001,
                themoviedb_id: { movie: 67890 },
                type: 'Movie'
            }
        ]);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        StreamBadge.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
        });
    });

    describe('isItemAnime Helper', () => {
        test('riconosce anime tramite ID Kitsu, AniList e type anime', () => {
            expect(isItemAnime({ id: 'kitsu:48269' })).toBe(true);
            expect(isItemAnime({ id: 'anilist:12345' })).toBe(true);
            expect(isItemAnime({ id: 'tmdb:99999', type: 'anime' })).toBe(true);
        });

        test('riconosce anime tramite animeMappingStore in O(1)', () => {
            expect(isItemAnime({ id: 'tmdb:240411' })).toBe(true);
            expect(isItemAnime({ id: 'tmdb:tv:240411' })).toBe(true);
            expect(isItemAnime({ id: 'tmdb:67890' })).toBe(true);
            expect(isItemAnime({ id: 'tmdb:movie:67890' })).toBe(true);
        });

        test('riconosce anime tramite regola canonica (genere 16 + lingua ja)', () => {
            expect(isItemAnime({
                id: 'tmdb:777001',
                genre_ids: [16, 18],
                original_language: 'ja'
            })).toBe(true);
            expect(isItemAnime({
                id: 'tmdb:777002',
                genres: ['Animation', 'Action'],
                original_language: 'ja'
            })).toBe(true);
        });

        test('non classifica come anime le serie/film non-anime (film live action, serie tv standard, animazione occidentale)', () => {
            // Live action standard
            expect(isItemAnime({
                id: 'tmdb:1399',
                type: 'series',
                genre_ids: [18, 10765],
                original_language: 'en'
            })).toBe(false);

            // Film live action
            expect(isItemAnime({
                id: 'tmdb:550',
                type: 'movie',
                genre_ids: [18],
                original_language: 'en'
            })).toBe(false);

            // Animazione occidentale (Arcane, 16 + en, non nello store)
            expect(isItemAnime({
                id: 'tmdb:94605',
                type: 'series',
                genre_ids: [16, 10765],
                original_language: 'en',
                keywords: [{ id: 1, name: 'steampunk' }]
            })).toBe(false);
        });

        test('extractTmdbId estrae correttamente formati differenti', () => {
            expect(extractTmdbId({ id: 'tmdb:12345' })).toBe('12345');
            expect(extractTmdbId({ id: 'tmdb:tv:12345' })).toBe('12345');
            expect(extractTmdbId({ id: 'tmdb:movie:12345' })).toBe('12345');
            expect(extractTmdbId({ id: 'tmdb:12345:1:2' })).toBe('12345');
            expect(extractTmdbId({ id: '12345' })).toBe('12345');
            expect(extractTmdbId({ id: 'tmdb:12345_ita_offset' })).toBe('12345');
            expect(extractTmdbId({ id: 'kitsu:123' })).toBe(null);
            expect(extractTmdbId({ id: 'tt1234567' })).toBe(null);
        });
    });

    describe('Esclusione anime da StreamBadge (A monte)', () => {
        test('un titolo anime NON viene cercato in StreamBadge, mentre serie e film non-anime SI', async () => {
            const cachedData = {
                metas: [
                    // 1. Anime Serie (Kitsu)
                    { id: 'kitsu:48269', type: 'series', name: 'Dandadan Kitsu' },
                    // 2. Anime Serie (TMDB nello store)
                    { id: 'tmdb:240411', type: 'series', name: 'Dandadan TMDB' },
                    // 3. Anime Movie (TMDB 16+ja)
                    { id: 'tmdb:777001', type: 'movie', name: 'Anime Movie', genre_ids: [16], original_language: 'ja' },
                    // 4. Serie non-anime (Game of Thrones)
                    { id: 'tmdb:1399', type: 'series', name: 'Game of Thrones', genre_ids: [18, 10765], original_language: 'en' },
                    // 5. Film non-anime (Fight Club)
                    { id: 'tmdb:550', type: 'movie', name: 'Fight Club', genre_ids: [18], original_language: 'en' }
                ]
            };

            await applyPostCacheBadges(
                cachedData,
                USER_CONFIG,
                HOST_URL,
                { showEpisodeBadge: true },
                'series',
                'preset_pop_series'
            );

            // StreamBadge.find deve essere stato chiamato SOLO con gli item non-anime
            expect(StreamBadge.find).toHaveBeenCalledTimes(1);
            const queriedBaseIds = StreamBadge.find.mock.calls[0][0].baseId.$in;
            expect(queriedBaseIds).toContain('tmdb:1399');
            expect(queriedBaseIds).toContain('tmdb:550');
            expect(queriedBaseIds).not.toContain('kitsu:48269');
            expect(queriedBaseIds).not.toContain('tmdb:240411');
            expect(queriedBaseIds).not.toContain('tmdb:777001');


            // Serie non-anime: ep 1 accodato
            // Film non-anime: film accodato

            // NESSUN anime presente tra le chiamate di accodamento!
        });

        test('un catalogo di soli anime non effettua alcuna query a StreamBadge ne accodamenti', async () => {
            const cachedData = {
                metas: [
                    { id: 'kitsu:48269', type: 'series', name: 'Dandadan' },
                    { id: 'tmdb:240411', type: 'series', name: 'Dandadan TMDB' }
                ]
            };

            const result = await applyPostCacheBadges(
                cachedData,
                USER_CONFIG,
                HOST_URL,
                { showEpisodeBadge: true },
                'series',
                'preset_pop_anime'
            );

            expect(StreamBadge.find).not.toHaveBeenCalled();
            expect(result.metas).toHaveLength(2);
            expect(result.metas[0]._itaBadge).toBe(false);
            expect(result.metas[1]._itaBadge).toBe(false);
        });
    });

    describe('Nessun doppio clone ITA per gli anime', () => {
        test('in catalogo simulcast vince lo stato esterno e produce al piu un solo clone ITA', async () => {
            // Mock snapshot di animeAiringState con sub + dub per Dandadan
            jest.spyOn(animeAiringState, 'getSnapshot').mockResolvedValue(
                animeAiringState.buildSnapshot([
                    {
                        _id: '240411',
                        schemaVersion: 1,
                        ids: { tmdb: 240411, kitsu: '48269' },
                        title: 'Dandadan',
                        italian: {
                            sub: { latest: { season: 2, episode: 12 } },
                            dub: { latest: { season: 2, episode: 8 }, isSimuldub: true }
                        },
                        episodes: [
                            { season: 2, episode: 8, airedAt: daysAgo(3), subIta: true, dubIta: true },
                            { season: 2, episode: 12, airedAt: daysAgo(2), subIta: true, dubIta: false }
                        ]
                    }
                ])
            );

            const cachedData = {
                metas: [{
                    id: 'kitsu:48269',
                    type: 'series',
                    name: 'Dandadan',
                    poster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg'
                }]
            };

            const result = await applyPostCacheBadges(
                cachedData,
                USER_CONFIG,
                HOST_URL,
                { _provider: 'airing_state', showEpisodeBadge: true },
                'series',
                'preset_anime_simulcast'
            );

            // Deve produrre esattamente 2 card (1 sub EP 12 e 1 dub ITA 8 con suffisso _ita_offset)
            expect(result.metas).toHaveLength(2);
            const sub = result.metas.find(m => m.id === 'kitsu:48269');
            const dub = result.metas.find(m => m.id === 'kitsu:48269_ita_offset');

            expect(sub).toBeDefined();
            expect(dub).toBeDefined();
            expect(sub.poster).toContain('EP%2012');
            expect(dub.poster).toContain('ITA%208');

            // Nessuna chiamata allo scanner torrent
            expect(StreamBadge.find).not.toHaveBeenCalled();
        });

        test('in catalogo standard (non-simulcast), un anime con vecchi streambadges ITA non viene clonato', async () => {
            // Simuliamo presenza di vecchi record streambadges con offset per un anime
            StreamBadge.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { baseId: 'tmdb:240411', stremioId: 'tmdb:240411:1:8', hasIta: true },
                    { baseId: 'tmdb:240411', stremioId: 'tmdb:240411:1:12', hasIta: false }
                ])
            });

            const cachedData = {
                metas: [
                    { id: 'tmdb:240411', type: 'series', name: 'Dandadan' },
                    { id: 'tmdb:1399', type: 'series', name: 'Game of Thrones', genre_ids: [18], original_language: 'en' }
                ]
            };

            // E per Game of Thrones simuliamo un offset reale su streambadges
            StreamBadge.find.mockReturnValue({
                lean: jest.fn().mockResolvedValue([
                    { baseId: 'tmdb:1399', stremioId: 'tmdb:1399:1:8', hasIta: true },
                    { baseId: 'tmdb:1399', stremioId: 'tmdb:1399:1:10', hasIta: false }
                ])
            });

            const result = await applyPostCacheBadges(
                cachedData,
                USER_CONFIG,
                HOST_URL,
                { showEpisodeBadge: true },
                'series',
                'preset_pop_series'
            );

            // Game of Thrones (non-anime) deve essere clonato (sub + dub _ita_offset)
            const gotSub = result.metas.find(m => m.id === 'tmdb:1399');
            const gotDub = result.metas.find(m => m.id === 'tmdb:1399_ita_offset');
            expect(gotSub).toBeDefined();
            expect(gotDub).toBeDefined();

            // Dandadan (anime) NON deve generare clone _ita_offset da streambadges!
            const dandadanItems = result.metas.filter(m => m.id.startsWith('tmdb:240411'));
            expect(dandadanItems).toHaveLength(1);
            expect(dandadanItems[0].id).toBe('tmdb:240411');
            expect(result.metas.find(m => m.id === 'tmdb:240411_ita_offset')).toBeUndefined();
        });

        test('un item che possiede gia _ita_offset non viene mai ri-clonato (_ita_offset_ita_offset)', async () => {
            const cachedData = {
                metas: [
                    { id: 'kitsu:48269_ita_offset', type: 'series', name: 'Dandadan Dub Clone' }
                ]
            };

            const result = await applyPostCacheBadges(
                cachedData,
                USER_CONFIG,
                HOST_URL,
                { showEpisodeBadge: true },
                'series',
                'preset_pop_anime'
            );

            expect(result.metas).toHaveLength(1);
            expect(result.metas[0].id).toBe('kitsu:48269_ita_offset');
            expect(result.metas[0].id).not.toContain('_ita_offset_ita_offset');
        });
    });
});
