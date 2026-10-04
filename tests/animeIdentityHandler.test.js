/**
 * tests/animeIdentityHandler.test.js
 *
 * L'identità anime **vista dal handler** (il contratto al confine), più l'invariante del catalogo novità:
 * - `isItemAnime` riconosce Kitsu/AniList/type anime, il mapping store e la regola canonica;
 * - `extractTmdbId` legge i formati `tmdb:id`, `tmdb:tv:id`, `kitsu:`, `anilist:`;
 * - nel catalogo novità (`preset_anime_simulcast`) vince lo stato esterno e nasce al più un clone ITA.
 *
 * La regola canonica e lo store sono verificati a livello di modulo in `animeIdentity.test.js`: qui si
 * verifica che il handler li usi come deve.
 *
 * Nota (01/10/2026): questo file si chiamava `animeTorrentScannerExclusion` e verificava l'esclusione degli
 * anime dallo scanner torrent ITA. Quello scanner non esiste più — la fonte del badge è la colonna `ita`
 * (mappa `.scratch/doppiaggio-ita`, ticket 04/06) — quindi i test di quella meccanica sono stati rimossi
 * insieme al codice che li giustificava, e il nome è cambiato perché non raccontasse più una cosa che non c'è.
 */

const animeMappingStore = require('../src/data/animeMappingStore');
const animeAiringState = require('../src/data/animeAiringState');
const {
    applyPostCacheBadges,
    isItemAnime,
    extractTmdbId
} = require('../src/handlers/catalogHandler');

// Le date dei fixture seguono l'orologio VERO. Il codice confronta con `Date.now()` e la
// finestra è di 14 giorni: con un NOW congelato il test era verde il giorno in cui è stato
// scritto e poi scadeva da solo. Il 04/10/2026 falliva perché l'episodio "di 3 giorni fa"
// era in realtà di 15 — e per giorni è stato archiviato come "rosso per dati mancanti".
const NOW = Date.now();
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const USER_CONFIG = { profiles: [{ id: 'global', settings: {} }], activeProfileId: 'global' };
const HOST_URL = 'http://localhost:7860';

describe('Identità anime e badge fuori dal catalogo novità', () => {
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

    describe('Un solo clone ITA, e solo nel catalogo novità', () => {
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
        });
    });
});
