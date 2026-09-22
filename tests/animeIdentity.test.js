const { isAnimeContent, hasAnimeKeyword, isAnimeKeywordString } = require('../src/utils/animeIdentity');
const animeMappingStore = require('../src/data/animeMappingStore');

describe('Anime Identity & Canonical Rule (Zero-Network Synthetic Tests)', () => {
    describe('Keyword Helper (Anti-false-positive check)', () => {
        test('recognizes standard anime keywords (case-insensitive)', () => {
            expect(isAnimeKeywordString('anime')).toBe(true);
            expect(isAnimeKeywordString('Anime Series')).toBe(true);
            expect(isAnimeKeywordString('based on anime')).toBe(true);
            expect(isAnimeKeywordString('ORIGINAL ANIME')).toBe(true);
        });

        test('filters out false positives for Western animations (anime-inspired, influenced, style)', () => {
            expect(isAnimeKeywordString('anime-inspired')).toBe(false);
            expect(isAnimeKeywordString('anime inspired')).toBe(false);
            expect(isAnimeKeywordString('anime-influenced')).toBe(false);
            expect(isAnimeKeywordString('anime influenced')).toBe(false);
            expect(isAnimeKeywordString('anime-style')).toBe(false);
            expect(isAnimeKeywordString('anime style')).toBe(false);
        });

        test('hasAnimeKeyword parses arrays of strings, objects, and TMDB objects', () => {
            expect(hasAnimeKeyword(['action', 'anime'])).toBe(true);
            expect(hasAnimeKeyword([{ id: 1, name: 'action' }, { id: 2, name: 'anime series' }])).toBe(true);
            expect(hasAnimeKeyword({ results: [{ id: 2, name: 'anime' }] })).toBe(true);
            expect(hasAnimeKeyword({ keywords: [{ id: 2, name: 'anime' }] })).toBe(true);
            expect(hasAnimeKeyword(JSON.stringify([{ id: 2, name: 'anime' }]))).toBe(true);
            expect(hasAnimeKeyword(['action', 'anime-inspired', 'fantasy'])).toBe(false);
            expect(hasAnimeKeyword(null)).toBe(false);
        });
    });

    describe('AnimeMappingStore.isAnimeTmdbId O(1) Lookup', () => {
        beforeAll(() => {
            // Popolamento sintetico in memoria senza I/O di rete
            animeMappingStore.buildAnibridgeIndex({
                'anidb:1001': {
                    'tmdb_show:12345:s1': { '1-12': '1-12' },
                    'tmdb_show:54321:s2': { '1-24': '1-24' }
                }
            });

            animeMappingStore.buildFribbIndex([
                {
                    kitsu_id: 501,
                    anidb_id: 501,
                    themoviedb_id: { movie: 67890 },
                    type: 'Movie'
                },
                {
                    kitsu_id: 502,
                    anidb_id: 502,
                    themoviedb_id: 77777,
                    type: 'Movie'
                }
            ]);
        });

        test('store-hit serie (chiave con stagione su Anibridge)', () => {
            expect(animeMappingStore.isAnimeTmdbId('12345')).toBe(true);
            expect(animeMappingStore.isAnimeTmdbId(12345)).toBe(true);
            expect(animeMappingStore.isAnimeTmdbId('12345:1')).toBe(true);
            expect(animeMappingStore.isAnimeTmdbId('tmdb:12345')).toBe(true);
            expect(animeMappingStore.isAnimeTmdbId('54321')).toBe(true);
        });

        test('store-hit film (chiave film su Fribb)', () => {
            expect(animeMappingStore.isAnimeTmdbId('67890')).toBe(true);
            expect(animeMappingStore.isAnimeTmdbId(67890)).toBe(true);
            expect(animeMappingStore.isAnimeTmdbId('tmdb:67890')).toBe(true);
            expect(animeMappingStore.isAnimeTmdbId(77777)).toBe(true);
        });

        test('store miss returns false for non-store titles', () => {
            expect(animeMappingStore.isAnimeTmdbId('99999')).toBe(false);
            expect(animeMappingStore.isAnimeTmdbId(null)).toBe(false);
            expect(animeMappingStore.isAnimeTmdbId('')).toBe(false);
        });
    });

    describe('Canonical isAnimeContent Pure Function', () => {
        const mockStore = {
            isAnimeTmdbId: (id) => ['12345', '67890', '33333'].includes(String(id).replace(/^tmdb:/i, '').split(':')[0])
        };

        test('1. store-hit serie (chiave con stagione)', () => {
            const result = isAnimeContent({
                tmdbId: '12345:1',
                genreIds: [16, 18],
                originalLanguage: 'ja',
                keywords: [],
                mappingStore: mockStore
            });
            expect(result).toBe(true);
        });

        test('2. store-hit film', () => {
            const result = isAnimeContent({
                tmdbId: 67890,
                genreIds: [16],
                originalLanguage: 'ja',
                keywords: [],
                mappingStore: mockStore
            });
            expect(result).toBe(true);
        });

        test('3. 16+ja senza store', () => {
            const result = isAnimeContent({
                tmdbId: 99999,
                genreIds: [16, 10759],
                originalLanguage: 'ja',
                keywords: [],
                mappingStore: mockStore // non presente nel mock
            });
            expect(result).toBe(true);
        });

        test('4. 16 + keyword anime senza store', () => {
            const result = isAnimeContent({
                tmdbId: 99999,
                genreIds: [16],
                originalLanguage: 'en', // non giapponese
                keywords: [{ id: 210024, name: 'anime' }],
                mappingStore: mockStore
            });
            expect(result).toBe(true);
        });

        test('5. animazione occidentale (16 + en, nessuna keyword, non nello store) -> false', () => {
            // Esempio: Arcane o Avatar
            const result = isAnimeContent({
                tmdbId: 94605, // Arcane
                genreIds: [16, 10765, 10759],
                originalLanguage: 'en',
                keywords: [{ id: 1, name: 'steampunk' }, { id: 2, name: 'magic' }],
                mappingStore: mockStore
            });
            expect(result).toBe(false);
        });

        test('5b. animazione occidentale con keyword "anime-inspired" -> false', () => {
            // Avatar / Castlevania con keyword "anime-inspired" o "anime style"
            const result = isAnimeContent({
                tmdbId: 246, // Avatar: The Last Airbender
                genreIds: [16, 10759],
                originalLanguage: 'en',
                keywords: ['anime-inspired', 'martial arts'],
                mappingStore: mockStore
            });
            expect(result).toBe(false);
        });

        test('6. donghua nello store (lingua zh/ko, coperto da store) -> true', () => {
            // Donghua cinese coperto da Anibridge/Fribb
            const result = isAnimeContent({
                tmdbId: 33333,
                genreIds: [16, 10759],
                originalLanguage: 'zh', // Cinese
                keywords: ['donghua', 'cultivation'],
                mappingStore: mockStore
            });
            expect(result).toBe(true);
        });

        test('7. film anime 16+ja -> true', () => {
            // Film di Hayao Miyazaki o Makoto Shinkai (non presente nello store)
            const result = isAnimeContent({
                tmdbId: 88888,
                genreIds: [16, 14, 18],
                originalLanguage: 'ja',
                keywords: ['supernatural', 'train'],
                mappingStore: mockStore
            });
            expect(result).toBe(true);
        });

        test('8. non-animation content is never anime regardless of ja language or anime keyword', () => {
            // Live action giapponese (senza genere 16)
            expect(isAnimeContent({
                tmdbId: 11111,
                genreIds: [18, 28], // Drama, Action
                originalLanguage: 'ja',
                keywords: ['tokyo'],
                mappingStore: null
            })).toBe(false);

            // Documentario su anime (genere 99 Documentary, nessuna 16)
            expect(isAnimeContent({
                tmdbId: 22222,
                genreIds: [99],
                originalLanguage: 'en',
                keywords: ['anime'],
                mappingStore: null
            })).toBe(false);
        });
    });
});
