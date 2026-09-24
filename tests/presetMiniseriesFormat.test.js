const { getPresets } = require('../src/data/presets');
const { buildPresetFromFilters } = require('../src/catalog/providers/DuckDbProvider');

describe('preset_miniseries closed-format gate', () => {
    test('requires an ended, short one-season format in addition to the keyword', () => {
        const preset = getPresets().find(({ id }) => id === 'preset_miniseries');
        const query = preset.queries[0];

        expect(query).toMatchObject({
            with_keywords: '11162',
            with_status: 'Ended',
            'number_of_seasons.lte': 1,
            'number_of_episodes.lte': 10
        });

        const compiled = buildPresetFromFilters(query, 'series');
        expect(compiled.where).toEqual(expect.arrayContaining([
            '"status" = \'Ended\'',
            '"number_of_seasons" <= 1',
            '"number_of_episodes" <= 10'
        ]));
    });
});
