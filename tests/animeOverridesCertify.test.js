const animeMappingStore = require('../src/data/animeMappingStore');
const duckDbStore = require('../src/db/duckDbStore');
const { F } = require('../src/data/filters');

describe('Anime Overrides - Certify & F.anime Integration', () => {
    beforeAll(async () => {
        await duckDbStore.init();
    });

    afterAll(() => {
        duckDbStore.close();
    });

    test('carica i titoli da certify in anime-overrides.json e li riconosce in isAnimeTmdbId (in entrambi i namespace)', () => {
        animeMappingStore.loadOverrides({
            version: 1,
            identities: [],
            certify: [
                { tmdbId: 198182, title: 'Throne of Seal' },
                { tmdbId: 223911, title: 'Xian Ni' }
            ]
        });

        // Un ID certificato a mano vale per entrambi i namespace
        expect(animeMappingStore.isAnimeTmdbId(198182, 'tv')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(198182, 'movie')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId('198182', 'tv')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId('198182', 'movie')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId('tmdb:198182', 'tv')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(223911, 'tv')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(223911, 'movie')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(99999999, 'tv')).toBe(false);
        expect(animeMappingStore.isAnimeTmdbId(99999999, 'movie')).toBe(false);
    });

    test('rebuildAnimeTmdbIds preserva i titoli certificati assieme agli indici Anibridge/Fribb nei rispettivi namespace', () => {
        animeMappingStore.loadOverrides({
            version: 1,
            identities: [],
            certify: [{ tmdbId: 106449, title: 'Fanren Xiuxian Chuan' }]
        });

        animeMappingStore.buildAnibridgeIndex({
            'anidb:1001': {
                'tmdb_show:12345:s1': { '1-12': '1-12' }
            }
        });

        // Il certificato nasce in ENTRAMBI i namespace
        expect(animeMappingStore.isAnimeTmdbId(106449, 'tv')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(106449, 'movie')).toBe(true);
        expect(animeMappingStore.animeTmdbIdsMovie.has('106449')).toBe(true);
        expect(animeMappingStore.animeTmdbIdsShow.has('106449')).toBe(true);

        // La serie da Anibridge è SOLO serie
        expect(animeMappingStore.isAnimeTmdbId(12345, 'tv')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(12345, 'movie')).toBe(false);
        expect(animeMappingStore.animeTmdbIdsShow.has('12345')).toBe(true);
        expect(animeMappingStore.animeTmdbIdsMovie.has('12345')).toBe(false);
    });

    test('updateAnimeMapping popola DuckDB RAM e F.anime include i titoli certificati', async () => {
        animeMappingStore.loadOverrides({
            version: 1,
            identities: [],
            certify: [
                { tmdbId: 106449, title: 'Fanren' },
                { tmdbId: 223911, title: 'Xian Ni' }
            ]
        });

        // Nuovo contratto per updateAnimeMapping: oggetto { movie, tv }
        const idsByType = {
            movie: Array.from(animeMappingStore.animeTmdbIdsMovie),
            tv: Array.from(animeMappingStore.animeTmdbIdsShow)
        };
        await duckDbStore.updateAnimeMapping(idsByType);

        // Query diretta su DuckDB: i titoli zh con genere 16 certificati devono soddisfare F.animeOf('tv')
        const rows = await duckDbStore.query(`
            SELECT id, name, original_language 
            FROM tv 
            WHERE id IN (106449, 223911) AND (${F.animeOf('tv')})
        `);

        expect(rows.length).toBe(2);
        const returnedIds = rows.map(r => Number(r.id));
        expect(returnedIds).toContain(106449);
        expect(returnedIds).toContain(223911);
    });
});
