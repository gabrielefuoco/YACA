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

    test('carica i titoli da certify in anime-overrides.json e li riconosce in isAnimeTmdbId', () => {
        animeMappingStore.loadOverrides({
            version: 1,
            identities: [],
            certify: [
                { tmdbId: 198182, title: 'Throne of Seal' },
                { tmdbId: 223911, title: 'Xian Ni' }
            ]
        });

        expect(animeMappingStore.isAnimeTmdbId(198182)).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId('198182')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId('tmdb:198182')).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(223911)).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(99999999)).toBe(false);
    });

    test('rebuildAnimeTmdbIds preserva i titoli certificati assieme agli indici Anibridge/Fribb', () => {
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

        expect(animeMappingStore.isAnimeTmdbId(106449)).toBe(true);
        expect(animeMappingStore.isAnimeTmdbId(12345)).toBe(true);
        expect(animeMappingStore.animeTmdbIds.has('106449')).toBe(true);
        expect(animeMappingStore.animeTmdbIds.has('12345')).toBe(true);
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

        const ids = Array.from(animeMappingStore.animeTmdbIds);
        await duckDbStore.updateAnimeMapping(ids);

        // Query diretta su DuckDB: i titoli zh con genere 16 certificati devono soddisfare F.anime
        const rows = await duckDbStore.query(`
            SELECT id, name, original_language 
            FROM tv 
            WHERE id IN (106449, 223911) AND (${F.anime})
        `);

        expect(rows.length).toBe(2);
        const returnedIds = rows.map(r => Number(r.id));
        expect(returnedIds).toContain(106449);
        expect(returnedIds).toContain(223911);
    });
});
