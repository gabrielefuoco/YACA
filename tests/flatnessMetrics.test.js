const { calculateFlatnessMetrics } = require('../src/utils/dnaRarity');

describe('calculateFlatnessMetrics', () => {
    it('should calculate entropy, top10Share, sum and dimensions', () => {
        // Vettore con 10 chiavi a 10 ciascuna (somma 100) -> massima entropia uniforme
        const vFinal = {};
        for (let i = 1; i <= 10; i++) {
            vFinal[`k:${i}`] = 10;
        }

        const metrics = calculateFlatnessMetrics(vFinal);
        expect(metrics.dimensions).toBe(10);
        expect(metrics.sum).toBe(100);
        // Shannon entropy di 10 elementi equiprobabili = log2(10) ~= 3.322
        expect(metrics.entropyBits).toBeCloseTo(3.322, 2);
        // Quota top 10 = 100% (1.0)
        expect(metrics.top10Share).toBe(1.0);
    });

    it('should show lower entropy and higher concentration on skewed distributions', () => {
        // Vettore collassato su 1 elemento dominante al 91%, altri 9 a 1%
        const skewed = { 'g:28': 91 };
        for (let i = 1; i <= 9; i++) {
            skewed[`k:${i}`] = 1;
        }

        const metrics = calculateFlatnessMetrics(skewed);
        expect(metrics.dimensions).toBe(10);
        expect(metrics.sum).toBe(100);
        // L'entropia deve essere molto bassa (< 1 bit)
        expect(metrics.entropyBits).toBeLessThan(1.0);
        expect(metrics.top10Share).toBe(1.0);
    });

    it('should return zeroes for empty or null vectors', () => {
        expect(calculateFlatnessMetrics(null)).toMatchObject({ dimensions: 0, sum: 0, entropyBits: 0, top10Share: 0 });
        expect(calculateFlatnessMetrics({})).toMatchObject({ dimensions: 0, sum: 0, entropyBits: 0, top10Share: 0 });
        expect(calculateFlatnessMetrics({ a: 0, b: -10 })).toMatchObject({ dimensions: 0, sum: 0, entropyBits: 0, top10Share: 0 });
    });
});
