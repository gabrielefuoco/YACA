/**
 * tests/animeAllCatalogsDubbedBadge.test.js
 *
 * Verifica del badge ITA su tutti i cataloghi per gli anime (Ticket 25).
 * Decisione dell'utente (Ticket 22):
 *  - "Badge ITA ovunque, se il titolo è nella lista dei doppiati di AnimeUnity";
 *  - Clone `_ita_offset` solo dove c'è distinzione temporale (catalogo novità `preset_anime_simulcast`);
 *  - Nessun clone nei cataloghi standard (card singola, stesso id `kitsu:{id}` o `tmdb:{id}`);
 *  - Nessuna query per item (snapshot in RAM via animeAiringState);
 *  - Degrado silenzioso se modulo spento o collection vuota;
 *  - Formato badge coerente con Ticket 10: `ITA n`.
 */

jest.mock('../src/db/models/PendingScan', () => ({
    findOneAndUpdate: jest.fn().mockReturnValue(Promise.resolve())
}));

jest.mock('../src/db/models/StreamBadge', () => ({
    find: jest.fn()
}));

const PendingScan = require('../src/db/models/PendingScan');
const StreamBadge = require('../src/db/models/StreamBadge');
const animeMappingStore = require('../src/data/animeMappingStore');
const animeAiringState = require('../src/data/animeAiringState');
const {
    applyPostCacheBadges
} = require('../src/handlers/catalogHandler');

const NOW = Date.UTC(2026, 8, 22, 12, 0, 0);
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };
const HOST_URL = 'http://localhost:7860';

function buildFixtureDocs() {
    return [
        {
            // Dandadan: in corso, sub S2E12, dub S2E8 (recente)
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
        },
        {
            // Serie conclusa: fuori finestra 14 giorni (60 giorni fa), ma doppiata fino a ep 26
            _id: '8864',
            schemaVersion: 1,
            ids: { tmdb: 8864, kitsu: '30' },
            title: '.hack//Sign',
            italian: {
                sub: null,
                dub: { latest: { season: 1, episode: 26 }, isSimuldub: false }
            },
            episodes: [
                { season: 1, episode: 26, airedAt: daysAgo(60), subIta: false, dubIta: true }
            ]
        },
        {
            // Anime solo sub (non doppiato): dub latest null e nessun episodio dubIta
            _id: '999005',
            schemaVersion: 1,
            ids: { tmdb: 999005, kitsu: '555' },
            title: 'Solo Sub Active',
            italian: {
                sub: { latest: { season: 1, episode: 12 } },
                dub: null
            },
            episodes: [
                { season: 1, episode: 12, airedAt: daysAgo(2), subIta: true, dubIta: false }
            ]
        },
        {
            // Anime movie doppiato (ep 1)
            _id: '372058',
            schemaVersion: 1,
            ids: { tmdb: 372058, kitsu: '11614' },
            title: 'Your Name.',
            italian: {
                sub: { latest: { season: 1, episode: 1 } },
                dub: { latest: { season: 1, episode: 1 } }
            },
            episodes: [
                { season: 1, episode: 1, airedAt: daysAgo(400), subIta: true, dubIta: true }
            ]
        },
        {
            // Documento con schemaVersion futura (2): deve essere ignorato
            _id: '999009',
            schemaVersion: 2,
            ids: { tmdb: 999009, kitsu: '999' },
            title: 'Future Schema',
            italian: {
                dub: { latest: { season: 1, episode: 10 } }
            }
        }
    ];
}

describe('Badge ITA su tutti i cataloghi per gli anime (Ticket 25)', () => {
    let snapshot;

    beforeAll(() => {
        animeMappingStore.isReady = true;
        animeMappingStore.buildAnibridgeIndex({
            'anidb:1001': { 'tmdb_show:240411:s2': { '1-12': '1-12' } }
        });
        animeMappingStore.buildFribbIndex([
            { kitsu_id: 48269, anidb_id: 1001, themoviedb_id: 240411, type: 'TV' },
            { kitsu_id: 30, themoviedb_id: 8864, type: 'TV' },
            { kitsu_id: 555, themoviedb_id: 999005, type: 'TV' },
            { kitsu_id: 11614, themoviedb_id: { movie: 372058 }, type: 'Movie' }
        ]);
    });

    beforeEach(() => {
        jest.clearAllMocks();
        StreamBadge.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
        });
        PendingScan.findOneAndUpdate.mockReturnValue(Promise.resolve());
        snapshot = animeAiringState.buildSnapshot(buildFixtureDocs());
        jest.spyOn(animeAiringState, 'getSnapshot').mockResolvedValue(snapshot);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        animeAiringState.resetForTests();
    });

    test('1. Anime doppiato in catalogo standard mostra badge ITA n e NON viene clonato', async () => {
        const cachedData = {
            metas: [
                {
                    id: 'kitsu:48269',
                    type: 'series',
                    name: 'Dandadan',
                    poster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg'
                }
            ]
        };

        const result = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_pop_anime' },
            'series',
            'preset_pop_anime',
            { snapshot }
        );

        // Nessun clone: esattamente 1 sola card
        expect(result.metas).toHaveLength(1);
        const item = result.metas[0];

        // L'id resta quello kitsu originale
        expect(item.id).toBe('kitsu:48269');
        expect(item.id).not.toContain('_ita_offset');

        // Badge ITA 8 applicato
        expect(item._forceBadgeText).toBe('ITA 8');
        expect(item._itaBadge).toBe(false);
        expect(item.poster).toContain('ITA%208');

        // Nessuna chiamata allo scanner torrent
        expect(StreamBadge.find).not.toHaveBeenCalled();
        expect(PendingScan.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('2. Anime concluso doppiato (fuori finestra novità) ha il badge ITA nei cataloghi standard', async () => {
        const cachedData = {
            metas: [
                {
                    id: 'kitsu:30',
                    type: 'series',
                    name: '.hack//Sign',
                    poster: 'https://image.tmdb.org/t/p/w500/hack.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/hack.jpg'
                }
            ]
        };

        const result = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_top_rated_anime' },
            'series',
            'preset_top_rated_anime',
            { snapshot }
        );

        expect(result.metas).toHaveLength(1);
        const item = result.metas[0];
        expect(item.id).toBe('kitsu:30');
        expect(item._forceBadgeText).toBe('ITA 26');
        expect(item._itaBadge).toBe(false);
        expect(item.poster).toContain('ITA%2026');
    });

    test('3. Anime NON doppiato: nessun badge ITA, nessuna clonazione', async () => {
        const cachedData = {
            metas: [
                {
                    id: 'kitsu:555',
                    type: 'series',
                    name: 'Solo Sub Active',
                    poster: 'https://image.tmdb.org/t/p/w500/sub.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/sub.jpg'
                }
            ]
        };

        // In catalogo normale (senza showEpisodeBadge): nessun badge
        const resultNormal = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_pop_anime' },
            'series',
            'preset_pop_anime',
            { snapshot }
        );
        expect(resultNormal.metas).toHaveLength(1);
        expect(resultNormal.metas[0]._forceBadgeText).toBeUndefined();
        expect(resultNormal.metas[0]._itaBadge).toBe(false);
        expect(resultNormal.metas[0].poster).not.toContain('ITA');

        // In catalogo con showEpisodeBadge: show episode text da TMDB/videos se disponibile, ma NESSUN ITA
        const resultEps = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_new_anime_eps', showEpisodeBadge: true },
            'series',
            'preset_new_anime_eps',
            { snapshot }
        );
        expect(resultEps.metas).toHaveLength(1);
        expect(resultEps.metas[0]._itaBadge).toBe(false);
        expect(resultEps.metas[0]._forceBadgeText).toBeUndefined();
        expect(resultEps.metas[0].poster).not.toContain('ITA');
    });

    test('4. Anime Movie doppiato riceve il badge ITA 1', async () => {
        const cachedData = {
            metas: [
                {
                    id: 'kitsu:11614',
                    type: 'movie',
                    name: 'Your Name.',
                    poster: 'https://image.tmdb.org/t/p/w500/yourname.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/yourname.jpg'
                }
            ]
        };

        const result = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_pop_anime_movies' },
            'movie',
            'preset_pop_anime_movies',
            { snapshot }
        );

        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].id).toBe('kitsu:11614');
        expect(result.metas[0]._forceBadgeText).toBe('ITA 1');
        expect(result.metas[0].poster).toContain('ITA%201');
    });

    test('5. Supporto per ID TMDB differenti (tmdb:id, tmdb:tv:id)', async () => {
        const cachedData = {
            metas: [
                {
                    id: 'tmdb:240411',
                    type: 'series',
                    name: 'Dandadan Bare TMDB',
                    poster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg'
                },
                {
                    id: 'tmdb:tv:240411',
                    type: 'series',
                    name: 'Dandadan Typed TMDB',
                    poster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg'
                }
            ]
        };

        const result = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_pop_series' },
            'series',
            'preset_pop_series',
            { snapshot }
        );

        expect(result.metas).toHaveLength(2);
        expect(result.metas[0]._forceBadgeText).toBe('ITA 8');
        expect(result.metas[0].poster).toContain('ITA%208');
        expect(result.metas[1]._forceBadgeText).toBe('ITA 8');
        expect(result.metas[1].poster).toContain('ITA%208');
    });

    test('6. Catalogo misto: serie non-anime usa scanner torrent, anime usa stato esterno', async () => {
        StreamBadge.find.mockReturnValue({
            lean: jest.fn().mockResolvedValue([
                { baseId: 'tmdb:1399', stremioId: 'tmdb:1399:1:8', hasIta: true }
            ])
        });

        const cachedData = {
            metas: [
                {
                    id: 'tmdb:1399',
                    type: 'series',
                    name: 'Game of Thrones',
                    original_language: 'en',
                    genre_ids: [18],
                    poster: 'https://image.tmdb.org/t/p/w500/got.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/got.jpg'
                },
                {
                    id: 'kitsu:48269',
                    type: 'series',
                    name: 'Dandadan',
                    poster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg'
                }
            ]
        };

        const result = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_pop_series' },
            'series',
            'preset_pop_series',
            { snapshot }
        );

        // GoT (non-anime) riceve il badge ITA da StreamBadge (_itaBadge: true)
        const got = result.metas.find(m => m.id === 'tmdb:1399');
        expect(got).toBeDefined();
        expect(got._itaBadge).toBe(true);

        // Dandadan (anime) riceve il badge ITA dallo stato esterno (_forceBadgeText: 'ITA 8')
        const dandadan = result.metas.find(m => m.id === 'kitsu:48269');
        expect(dandadan).toBeDefined();
        expect(dandadan._forceBadgeText).toBe('ITA 8');
        expect(dandadan._itaBadge).toBe(false);

        // Solo GoT è stato cercato su StreamBadge
        expect(StreamBadge.find).toHaveBeenCalledTimes(1);
        const queryIds = StreamBadge.find.mock.calls[0][0].baseId.$in;
        expect(queryIds).toContain('tmdb:1399');
        expect(queryIds).not.toContain('kitsu:48269');
    });

    test('7. Nessun doppio clone se l\'item ha già _ita_offset', async () => {
        const cachedData = {
            metas: [
                {
                    id: 'kitsu:48269_ita_offset',
                    type: 'series',
                    name: 'Dandadan Clone',
                    poster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg'
                }
            ]
        };

        const result = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_pop_anime' },
            'series',
            'preset_pop_anime',
            { snapshot }
        );

        expect(result.metas).toHaveLength(1);
        expect(result.metas[0].id).toBe('kitsu:48269_ita_offset');
        expect(result.metas[0].id).not.toContain('_ita_offset_ita_offset');
    });

    test('8. Degrado: snapshot vuoto o errore del modulo -> nessun badge, nessuna eccezione', async () => {
        const cachedData = {
            metas: [
                {
                    id: 'kitsu:48269',
                    type: 'series',
                    name: 'Dandadan',
                    poster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/dandadan.jpg'
                }
            ]
        };

        // Snapshot vuoto
        const resultEmpty = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_pop_anime' },
            'series',
            'preset_pop_anime',
            { snapshot: animeAiringState.buildSnapshot([]) }
        );
        expect(resultEmpty.metas).toHaveLength(1);
        expect(resultEmpty.metas[0]._forceBadgeText).toBeUndefined();
        expect(resultEmpty.metas[0]._itaBadge).toBe(false);

        // Modulo spento / getSnapshot fallisce
        animeAiringState.getSnapshot.mockRejectedValueOnce(new Error('Mongo connection refused'));
        const resultError = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_pop_anime' },
            'series',
            'preset_pop_anime'
        );
        expect(resultError.metas).toHaveLength(1);
        expect(resultError.metas[0]._forceBadgeText).toBeUndefined();
        expect(resultError.metas[0]._itaBadge).toBe(false);
    });

    test('9. Documento con schemaVersion superiore a quella supportata viene ignorato', async () => {
        const cachedData = {
            metas: [
                {
                    id: 'kitsu:999',
                    type: 'series',
                    name: 'Future Schema Anime',
                    poster: 'https://image.tmdb.org/t/p/w500/future.jpg',
                    _rawPoster: 'https://image.tmdb.org/t/p/w500/future.jpg'
                }
            ]
        };

        const result = await applyPostCacheBadges(
            cachedData,
            USER_CONFIG,
            HOST_URL,
            { id: 'preset_pop_anime' },
            'series',
            'preset_pop_anime',
            { snapshot }
        );

        expect(result.metas).toHaveLength(1);
        expect(result.metas[0]._forceBadgeText).toBeUndefined();
        expect(result.metas[0]._itaBadge).toBe(false);
        expect(result.metas[0].poster).not.toContain('ITA');
    });
});
