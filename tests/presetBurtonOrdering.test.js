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

        // Contratto d'ordine completo, verificabile a prescindere dai valori dello snapshot
        // (la popolarità cambia a ogni aggiornamento del dump TMDB): a parità di popolarità
        // si ordina per vote_count DESC e, a parità anche di quello, per id ASC.
        for (let i = 1; i < rows.length; i++) {
            const prev = rows[i - 1];
            const curr = rows[i];
            if (Number(prev.popularity) !== Number(curr.popularity)) continue;
            expect(Number(curr.vote_count)).toBeLessThanOrEqual(Number(prev.vote_count));
            if (Number(prev.vote_count) === Number(curr.vote_count)) {
                expect(Number(prev.id)).toBeLessThanOrEqual(Number(curr.id));
            }
        }

        // Determinismo: la stessa query deve produrre lo stesso ordine
        const rowsAgain = await duckDbStore.query(sql);
        expect(rowsAgain.map(row => String(row.id))).toEqual(rows.map(row => String(row.id)));
    }, 30000);
});
