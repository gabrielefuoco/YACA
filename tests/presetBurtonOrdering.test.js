const { getPresets } = require('../src/data/presets');
const { buildCatalogQuery } = require('../src/db/queryBuilder');
const duckDbStore = require('../src/db/duckDbStore');

describe('preset_burton popularity ordering', () => {
    test('uses one deterministic snapshot order with popularity as primary key', async () => {
        const preset = getPresets().find(({ id }) => id === 'preset_burton');
        expect(preset.orderBy).toBe('"popularity" DESC NULLS LAST, "vote_count" DESC, "id" ASC');

        const sql = await buildCatalogQuery(preset, 0, 100);
        expect((sql.match(/"id" ASC/g) || []).length).toBe(1);
        const rows = await duckDbStore.query(sql);
        const popularity = rows.map(row => Number(row.popularity));

        expect(popularity.length).toBeGreaterThanOrEqual(10);
        for (let i = 1; i < popularity.length; i++) {
            expect(popularity[i]).toBeLessThanOrEqual(popularity[i - 1]);
        }
        expect(rows.findIndex(row => Number(row.id) === 869))
            .toBeLessThan(rows.findIndex(row => Number(row.id) === 162));
    }, 30000);
});
