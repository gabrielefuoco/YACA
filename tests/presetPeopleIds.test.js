const { getPresets, TMDB_PEOPLE } = require('../src/data/presets');

describe('TMDB people preset IDs', () => {
    // IDs/name verified against TMDB's `/person/{id}` endpoint on 2026-09-24.
    // The expected values are intentionally hardcoded so this regression test never uses the network.
    const correctedPeople = {
        Scorsese: { id: 1032, name: 'Martin Scorsese', source: 'https://www.themoviedb.org/person/1032' },
        Fincher: { id: 7467, name: 'David Fincher', source: 'https://www.themoviedb.org/person/7467' },
        Carpenter: { id: 11770, name: 'John Carpenter', source: 'https://www.themoviedb.org/person/11770' },
        Denzel: { id: 5292, name: 'Denzel Washington', source: 'https://www.themoviedb.org/person/5292' },
        Peele: { id: 291263, name: 'Jordan Peele', source: 'https://www.themoviedb.org/person/291263' }
    };

    test.each(Object.entries(correctedPeople))(
        '%s uses its verified TMDB person ID',
        (key, expected) => {
            expect({ name: expected.name, id: TMDB_PEOPLE?.[key] }).toEqual({
                name: expected.name,
                id: expected.id
            });
            expect(expected.source).toBe(`https://www.themoviedb.org/person/${expected.id}`);
        }
    );

    test.each([
        ['preset_scorsese', 'with_crew', 'Scorsese'],
        ['preset_fincher', 'with_crew', 'Fincher'],
        ['preset_denzel', 'with_cast', 'Denzel']
    ])('%s uses its corrected people ID', (presetId, queryKey, peopleKey) => {
        const preset = getPresets().find(({ id }) => id === presetId);
        expect(preset).toBeDefined();
        expect(preset.queries[0][queryKey]).toBe(TMDB_PEOPLE[peopleKey]);
    });
});
