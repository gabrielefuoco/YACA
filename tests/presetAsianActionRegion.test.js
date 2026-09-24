const { getPresets } = require('../src/data/presets');
const { buildPresetFromFilters } = require('../src/catalog/providers/DuckDbProvider');

describe('preset_asian_action regional whitelist', () => {
    test('accepts only JP, KR and HK production origins', () => {
        const preset = getPresets().find(({ id }) => id === 'preset_asian_action');
        const query = preset.queries[0];
        expect(query.with_origin_country).toBe('JP|KR|HK');
        expect(query.without_tmdbIds).toBe('1305781|12289|1357305');

        const compiled = buildPresetFromFilters(query, 'movie');
        const countryClause = compiled.where.find(clause => clause.includes('production_countries'));
        expect(compiled.where).toContain('"id" NOT IN (1305781,12289,1357305)');
        expect(countryClause).toContain('"JP"');
        expect(countryClause).toContain('"KR"');
        expect(countryClause).toContain('"HK"');
        expect(countryClause).not.toContain('"CN"');
    });
});
