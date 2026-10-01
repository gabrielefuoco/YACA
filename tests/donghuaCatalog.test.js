const { getPresets } = require('../src/data/presets');
const duckDbStore = require('../src/db/duckDbStore');
const { buildCatalogQuery } = require('../src/db/queryBuilder');
const { getDuckDbCatalogFromPreset } = require('../src/catalog/providers/DuckDbProvider');

describe('Preset Donghua Dedicato (Ticket 45)', () => {
    beforeAll(async () => {
        await duckDbStore.init();
    }, 30000);

    test('preset_donghua è registrato correttamente nei preset', () => {
        const presets = getPresets();
        const donghua = presets.find(p => p.id === 'preset_donghua');

        expect(donghua).toBeDefined();
        expect(donghua.name).toBe('Donghua (Animazione Cinese)');
        expect(donghua.type).toBe('series');
        expect(donghua.category).toBe('🏮 Solo Anime');
        expect(donghua.emoji).toBe('🇨🇳');
        expect(donghua.presentation_strategy).toBe('popularity');

        // Cruciale: non deve avere isAnime: true per non attivare il vincolo F.anime
        expect(donghua.isAnime).toBeFalsy();

        expect(Array.isArray(donghua.where)).toBe(true);
        expect(typeof donghua.orderBy).toBe('string');
        expect(donghua.orderBy).toMatch(/popularity/i);
    });

    test('la query nativa DuckDB seleziona animazione con lingua zh senza F.anime', async () => {
        const presets = getPresets();
        const donghua = presets.find(p => p.id === 'preset_donghua');

        const sql = await buildCatalogQuery({
            type: donghua.type,
            where: donghua.where,
            orderBy: donghua.orderBy
        }, 0, 20);

        expect(sql).toContain('SELECT * FROM');
        expect(sql).toContain('original_language');
        expect(sql).toContain("'zh'");
        // Non deve contenere join o clausole su anime_mappings
        expect(sql).not.toContain('anime_mappings');

        const rows = await duckDbStore.query(sql);
        expect(rows.length).toBe(20);
        for (const row of rows) {
            expect(row.original_language).toBe('zh');
        }
    });

    test('idratazione completa tramite getDuckDbCatalogFromPreset (pagina 1 piena)', async () => {
        const presets = getPresets();
        const donghua = presets.find(p => p.id === 'preset_donghua');

        const metas = await getDuckDbCatalogFromPreset(donghua, 0, 20);

        expect(metas).toHaveLength(20);
        // Ogni elemento deve avere id tmdb, nome, poster valido e tipo series
        for (const meta of metas) {
            expect(meta.id).toMatch(/^tmdb:\d+$/);
            expect(typeof meta.name).toBe('string');
            expect(meta.name.length).toBeGreaterThan(0);
            expect(meta.type).toBe('series');
            expect(meta.rawTMDB?.original_language).toBe('zh');
            expect(meta.poster).toBeDefined();
        }

        // Verifica presenza dei donghua più popolari
        const titles = metas.map(m => m.name);
        expect(titles.some(t => t.includes('凡人修仙传') || t.includes('Mortal'))).toBe(true);
    });

    test('i cataloghi anime tradizionali con isAnime=true non vengono inquinati', () => {
        const presets = getPresets();
        const animePresets = presets.filter(p => p.isAnime === true);

        expect(animePresets.length).toBeGreaterThan(0);
        expect(animePresets.some(p => p.id === 'preset_donghua')).toBe(false);
    });
});
