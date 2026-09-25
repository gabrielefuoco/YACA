const {
    computeTimeDecay,
    applyLogSaturation,
    getSoftRarityMultiplier,
    applySoftRarity,
    DF_MIN_DEFAULT,
    RARITY_MAX_WEIGHT
} = require('../src/utils/dnaRarity');

describe('dnaRarity utilities', () => {
    describe('computeTimeDecay', () => {
        const now = new Date('2026-09-25T12:00:00Z').getTime();

        it('should return 1.0 for null, invalid or future dates', () => {
            expect(computeTimeDecay(null, now)).toBe(1.0);
            expect(computeTimeDecay('invalid', now)).toBe(1.0);
            expect(computeTimeDecay(new Date(now + 100000), now)).toBe(1.0);
        });

        it('should decay to ~0.5 at 24 months half-life', () => {
            // 24 mesi = 24 * 30.4375 giorni = 730.5 giorni
            const msIn24Months = 24 * 30.4375 * 24 * 60 * 60 * 1000;
            const date24m = new Date(now - msIn24Months);
            const factor = computeTimeDecay(date24m, now, 24);
            expect(factor).toBeCloseTo(0.5, 2);
        });

        it('should decay to ~0.25 at 48 months', () => {
            const msIn48Months = 48 * 30.4375 * 24 * 60 * 60 * 1000;
            const date48m = new Date(now - msIn48Months);
            const factor = computeTimeDecay(date48m, now, 24);
            expect(factor).toBeCloseTo(0.25, 2);
        });

        it('should not decay below 0.01 for very old interactions', () => {
            const dateVeryOld = new Date('1990-01-01');
            const factor = computeTimeDecay(dateVeryOld, now, 24);
            expect(factor).toBe(0.01);
        });
    });

    describe('applyLogSaturation', () => {
        it('should apply logarithmic saturation to diminish dominant keys', () => {
            const raw = {
                'g:28': 5000, // 50 film
                'g:12': 100   // 1 film
            };
            const sat = applyLogSaturation(raw, 100);

            // 5000 / 100 = 50: 100 * ln(51) ~= 393.18
            expect(sat['g:28']).toBeCloseTo(393.18, 1);
            // 100 / 100 = 1: 100 * ln(2) ~= 69.31
            expect(sat['g:12']).toBeCloseTo(69.31, 1);

            // Ratio prima: 50. Ratio dopo: ~5.67
            const ratioBefore = raw['g:28'] / raw['g:12'];
            const ratioAfter = sat['g:28'] / sat['g:12'];
            expect(ratioBefore).toBe(50);
            expect(ratioAfter).toBeLessThan(6);
            expect(ratioAfter).toBeGreaterThan(5);
        });

        it('should ignore 0 or negative values and empty input', () => {
            expect(applyLogSaturation({})).toEqual({});
            expect(applyLogSaturation(null)).toEqual({});
            expect(applyLogSaturation({ 'g:28': 0, 'g:12': -5 })).toEqual({});
        });
    });

    describe('getSoftRarityMultiplier and applySoftRarity', () => {
        it('should bound rarity multiplier between 1.00 and RARITY_MAX_WEIGHT (1.80)', () => {
            const testDfMap = new Map([
                ['g:28', 40000],  // comunissimo
                ['k:rare', 2],    // sotto df_min=15
                ['k:mid', 500]    // medio
            ]);

            const multCommon = getSoftRarityMultiplier('g:28', testDfMap);
            const multRare = getSoftRarityMultiplier('k:rare', testDfMap);
            const multMid = getSoftRarityMultiplier('k:mid', testDfMap);

            expect(multCommon).toBe(1.0);
            expect(multRare).toBeLessThanOrEqual(RARITY_MAX_WEIGHT);
            expect(multRare).toBeGreaterThan(1.5);
            expect(multMid).toBeGreaterThan(multCommon);
            expect(multMid).toBeLessThan(multRare);
        });

        it('should clamp rarity using df_min to avoid exploding on rare single items', () => {
            const dfMap = new Map([
                ['k:df_1', 1],
                ['k:df_15', DF_MIN_DEFAULT]
            ]);

            const mult1 = getSoftRarityMultiplier('k:df_1', dfMap);
            const mult15 = getSoftRarityMultiplier('k:df_15', dfMap);

            // df=1 deve essere clamperato a df_min=15, quindi identico a df=15
            expect(mult1).toBe(mult15);
        });

        it('should apply soft rarity to all vector keys', () => {
            const dfMap = new Map([
                ['g:28', 40000],
                ['k:mid', 500]
            ]);
            const vec = { 'g:28': 100, 'k:mid': 100 };
            const result = applySoftRarity(vec, dfMap);

            expect(result['g:28']).toBe(100); // 100 * 1.0
            expect(result['k:mid']).toBeGreaterThan(100);
            expect(result['k:mid']).toBeLessThanOrEqual(180);
        });
    });

    describe('calculateProfileRelevance', () => {
        const { calculateProfileRelevance } = require('../src/utils/dnaRarity');

        it('should return 1.0 for global context or empty static prior', () => {
            const itemDna = { 'g:28': 100, 'k:123': 100 };
            expect(calculateProfileRelevance(itemDna, { 'g:28': 50 }, 'global')).toBe(1.0);
            expect(calculateProfileRelevance(itemDna, {}, 'custom_profile')).toBe(1.0);
            expect(calculateProfileRelevance(itemDna, null, 'custom_profile')).toBe(1.0);
        });

        it('should return 1.0 (full weight) when item shares a genre or topos with static prior', () => {
            const vStatic = { 'g:28': 100, 'L1:c_1': 50 };
            const itemRelevant = { 'g:28': 100, 'k:999': 100 };
            // relevance = 1.0 -> 0.20 + 0.80 * 1.0 = 1.00
            expect(calculateProfileRelevance(itemRelevant, vStatic, 'profile_action')).toBe(1.0);
        });

        it('should return 0.40 (80/20 mix with relevance 0.25) when item does not share features with static prior', () => {
            const vStatic = { 'g:28': 100, 'g:12': 50 };
            const itemUnrelated = { 'g:16': 100, 'k:999': 100 }; // Animation
            // relevance = 0.25 -> 0.20 + 0.80 * 0.25 = 0.40
            const factor = calculateProfileRelevance(itemUnrelated, vStatic, 'profile_action');
            expect(factor).toBeCloseTo(0.40, 2);
        });
    });
});
