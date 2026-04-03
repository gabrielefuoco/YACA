const { VectorEngine } = require('./out/vectorEngine');

describe('VectorEngine (VSM frontend implementation)', () => {

    test('should extract metadata into vectors based on type', () => {
        const item = {
            id: 123,
            genres: [{ id: 28 }, { id: 53 }],
            keywords: { results: [{ id: 111 }] },
            credits: {
                crew: [{ id: 222, job: 'Director' }],
                cast: [{ id: 333 }]
            }
        };

        const result = {};
        VectorEngine.addMetadataToVector(result, item, 1.0);
        
        expect(result['g:28']).toBeDefined();
        expect(result['g:53']).toBe(result['g:28']); // Same weight for genres
        expect(result['k:111']).toBeDefined();
        expect(result['d:222']).toBeDefined();
        expect(result['a:333']).toBeDefined();
    });

    test('should fuse historical and daily vectors', () => {
        const historical = { 'g:28': 1.0, 'a:333': 0.5 };
        const daily = { 'g:28': 0.5, 'd:222': 1.0 };
        
        // fuse(active, staticV, staticWeight)
        const fused = VectorEngine.fuse(historical, daily, 1.5);
        
        // Fused value for g:28 should be historical + daily * 1.5
        expect(fused['g:28']).toBeDefined();
        expect(fused['a:333']).toBeDefined();
        expect(fused['d:222']).toBeDefined();
        
        expect(fused['g:28']).toBeCloseTo(1.0 + (0.5 * 1.5), 2);
        expect(fused['d:222']).toBeCloseTo(1.0 * 1.5, 2);
    });

    test('should prune low impact vectors using percentile thresholding', () => {
        const fused = {
            'g:28': 100,
            'g:53': 80,
            'k:111': 20, 
            'a:333': 1 
        };

        // Aggiungiamo attributi dummy per superare la threshold keys > 20
        for (let i = 0; i < 20; i++) {
            fused[`g:100${i}`] = Math.random() * 50;
        }

        const pruned = VectorEngine.prune(fused);
        
        // g:28 holds the biggest value, must remain. a:333 is 1 (too few 'a:' items -> wait, a: requires minCount 4!)
        // So a:333 might remain if there are less than 4 'a's... let's add many 'a's to force pruning
        for (let i = 0; i < 10; i++) {
            fused[`a:100${i}`] = 10 + i;
        }
        
        const pruned2 = VectorEngine.prune(fused);

        expect(pruned2['g:28']).toBeDefined();
        expect(pruned2['a:333']).toBeUndefined(); // Adesso verrà piallato perchè è l'ultimo
    });
});
