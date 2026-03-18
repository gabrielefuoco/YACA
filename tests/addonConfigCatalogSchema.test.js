const AddonConfig = require('../src/db/models/AddonConfig');

describe('AddonConfig catalog schema', () => {
    it('preserves merged catalog metadata needed after reload', () => {
        const doc = new AddonConfig({
            uuid: 'test-uuid',
            profiles: [{
                id: 'p1',
                name: 'Profilo Test',
                catalogs: [{
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
                    presentation_strategy: 'interleave'
                }]
            }]
        });

        const catalog = doc.toObject().profiles[0].catalogs[0];
        expect(catalog.source).toBe('merged');
        expect(catalog.filters).toEqual({
            merge: {
                catalogs: ['list_a', 'list_b'],
                sourceTypes: ['movie', 'movie'],
                strategy: 'mixed'
            }
        });
        expect(catalog.presentation_strategy).toBe('interleave');
    });
});
