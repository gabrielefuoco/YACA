/**
 * Regola di ammissione della coda di conversione: la decisione «lo converto in
 * questo giro?» dipende dai soli campi dell'item e sa dire perché quando la risposta
 * è no. Nessun database, nessuna rete.
 */
const {
    EXCLUSION_REASONS,
    evaluateConversionAdmission,
    selectConvertibleItems
} = require('../src/services/libraryConversionAdmission');

const eligibleItem = () => ({
    itemId: 'tt0095327',
    type: 'movie',
    mapped: false,
    removed: false,
    duplicateOf: null
});

describe('evaluateConversionAdmission', () => {
    test('un item mai convertito è eleggibile, senza motivo di esclusione', () => {
        expect(evaluateConversionAdmission(eligibleItem())).toEqual({ eligible: true, reason: null });
    });

    test('un item già convertito è escluso perché già convertito', () => {
        const verdict = evaluateConversionAdmission({ ...eligibleItem(), mapped: true, tmdbId: 12477 });
        expect(verdict.eligible).toBe(false);
        expect(verdict.reason).toBe(EXCLUSION_REASONS.ALREADY_MAPPED);
    });

    test('un item rimosso dalla libreria è escluso perché rimosso', () => {
        const verdict = evaluateConversionAdmission({ ...eligibleItem(), removed: true });
        expect(verdict.eligible).toBe(false);
        expect(verdict.reason).toBe(EXCLUSION_REASONS.REMOVED);
    });

    test('un duplicato marcato è escluso perché duplicato', () => {
        const verdict = evaluateConversionAdmission({ ...eligibleItem(), duplicateOf: 'tt0095327' });
        expect(verdict.eligible).toBe(false);
        expect(verdict.reason).toBe(EXCLUSION_REASONS.DUPLICATE);
    });

    test('i campi assenti valgono come le impostazioni di schema (false / null)', () => {
        expect(evaluateConversionAdmission({ itemId: 'kitsu:7278', type: 'anime' }))
            .toEqual({ eligible: true, reason: null });
        expect(evaluateConversionAdmission({ ...eligibleItem(), duplicateOf: '' }).eligible).toBe(true);
    });
});

describe('selectConvertibleItems', () => {
    test('tieno solo gli eleggibili e non perdono gli altri', () => {
        const items = [
            { itemId: 'a', mapped: false, removed: false, duplicateOf: null },
            { itemId: 'b', mapped: true },
            { itemId: 'c', mapped: false, removed: true },
            { itemId: 'd', mapped: false, duplicateOf: 'a' },
            { itemId: 'e' }
        ];
        expect(selectConvertibleItems(items).map(i => i.itemId)).toEqual(['a', 'e']);
    });

    test('su lista vuota o assente non solleva', () => {
        expect(selectConvertibleItems([])).toEqual([]);
        expect(selectConvertibleItems(null)).toEqual([]);
    });
});
