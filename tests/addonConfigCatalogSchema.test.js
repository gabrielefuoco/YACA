const AddonConfig = require('../src/db/models/AddonConfig');

describe('AddonConfig catalog schema', () => {
    it('tollera configurazioni legacy (catalogo merged e preset modificato) senza errori di validazione', () => {
        const doc = new AddonConfig({
            uuid: 'test-uuid',
            profiles: [{
                id: 'p1',
                name: 'Profilo Test',
                catalogs: [{
                    // Catalogo unito salvato quando il merge esisteva.
                    id: 'merged_a_b_123',
                    name: 'A + B',
                    type: 'movie',
                    source: 'merged',
                    filters: {
                        merge: {
                            catalogs: ['list_a', 'list_b'],
                            sourceTypes: ['movie', 'movie'],
                            strategy: 'mixed'
                        }
                    },
                    presentation_strategy: 'interleave',
                    mergedFrom: ['list_a', 'list_b']
                }, {
                    // Preset "modificato" salvato dal vecchio flusso di edit dei preset.
                    id: 'custom_abc123',
                    name: 'Mia Lista',
                    type: 'series',
                    source: 'manual',
                    filters: { queries: [{ strategy: 'discovery' }], presentation_strategy: 'interleave' },
                    presentation_strategy: 'interleave'
                }]
            }]
        });

        expect(doc.validateSync()).toBeUndefined();

        const catalogs = doc.toObject().profiles[0].catalogs;
        expect(catalogs).toHaveLength(2);
        expect(catalogs[0].id).toBe('merged_a_b_123');
        expect(catalogs[0].source).toBe('merged');
        expect(catalogs[0].filters).toEqual({
            merge: {
                catalogs: ['list_a', 'list_b'],
                sourceTypes: ['movie', 'movie'],
                strategy: 'mixed'
            }
        });
        expect(catalogs[1].id).toBe('custom_abc123');
        expect(catalogs[1].filters).toEqual({
            queries: [{ strategy: 'discovery' }],
            presentation_strategy: 'interleave'
        });
    });
});
