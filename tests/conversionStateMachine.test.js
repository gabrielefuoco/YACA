/**
 * tests/conversionStateMachine.test.js
 *
 * Collaudo formale della macchina a stati della conversione (Ticket 16).
 * Verifica:
 * 1. Stati formali e predicati (QUEUED, CONVERTED, PARKED, EXCLUDED_REMOVED, EXCLUDED_DUPLICATE)
 * 2. Tetto tentativi (MAX_CONVERSION_ATTEMPTS = 3) e transizione a PARKED
 * 3. Risoluzione positiva e pulizia dei contatori/parcheggio
 * 4. Ritorno in coda tramite unparkItem (reset dei dati)
 * 5. Lettori di parkedAt e sommario del giro
 */

const {
    MAX_CONVERSION_ATTEMPTS,
    CONVERSION_STATES,
    PARKED_REASONS,
    readConversionAttempts,
    isParked,
    getConversionState,
    isEligibleForConversion,
    applyConversionAttempt,
    unparkItem,
    summarizeParkedRun
} = require('../src/library/ingestion/conversionStateMachine');

describe('Macchina a stati della conversione (Ticket 16)', () => {
    describe('1. Stati e predicati di ammissione', () => {
        test('un item nuovo o non mappato è QUEUED ed eleggibile', () => {
            const item = { itemId: 'tt001', mapped: false, removed: false, duplicateOf: null, parkedAt: null };
            expect(getConversionState(item)).toBe(CONVERSION_STATES.QUEUED);
            expect(isEligibleForConversion(item)).toBe(true);
            expect(isParked(item)).toBe(false);
            expect(readConversionAttempts(item)).toBe(0);
        });

        test('un item con mapped: true è CONVERTED e non eleggibile', () => {
            const item = { itemId: 'tt001', mapped: true, tmdbId: 100 };
            expect(getConversionState(item)).toBe(CONVERSION_STATES.CONVERTED);
            expect(isEligibleForConversion(item)).toBe(false);
        });

        test('un item con removed: true è EXCLUDED_REMOVED', () => {
            const item = { itemId: 'tt001', mapped: false, removed: true };
            expect(getConversionState(item)).toBe(CONVERSION_STATES.EXCLUDED_REMOVED);
            expect(isEligibleForConversion(item)).toBe(false);
        });

        test('un item con duplicateOf valorizzato è EXCLUDED_DUPLICATE', () => {
            const item = { itemId: 'kitsu:123', mapped: false, duplicateOf: 'tt001' };
            expect(getConversionState(item)).toBe(CONVERSION_STATES.EXCLUDED_DUPLICATE);
            expect(isEligibleForConversion(item)).toBe(false);
        });

        test('un item con parkedAt valido è PARKED e non eleggibile', () => {
            const item = { itemId: 'tt001', mapped: false, parkedAt: new Date(), parkedReason: 'not-found' };
            expect(getConversionState(item)).toBe(CONVERSION_STATES.PARKED);
            expect(isParked(item)).toBe(true);
            expect(isEligibleForConversion(item)).toBe(false);
        });

        test('isParked rifiuta valori non validi (null, undefined, stringa non data)', () => {
            expect(isParked(null)).toBe(false);
            expect(isParked({})).toBe(false);
            expect(isParked({ parkedAt: null })).toBe(false);
            expect(isParked({ parkedAt: '' })).toBe(false);
            expect(isParked({ parkedAt: 'invalid-date' })).toBe(false);
        });
    });

    describe('2. Transizioni e tetto dei tentativi', () => {
        const failureOutcome = { resolved: false, tmdbId: null, reason: 'not-found' };
        const successOutcome = { resolved: true, tmdbId: 550, reason: 'search-hit' };

        test('fallimento tentativo 1: incrementa a 1 e resta in QUEUED senza parcheggio', () => {
            const item = { conversionAttempts: 0 };
            const next = applyConversionAttempt(item, failureOutcome);
            expect(next.conversionAttempts).toBe(1);
            expect(next.parked).toBe(false);
            expect(next.parkedAt).toBeNull();
            expect(next.parkedReason).toBeNull();
            expect(next.nextState).toBe(CONVERSION_STATES.QUEUED);
        });

        test('fallimento tentativo 2: incrementa a 2 e resta in QUEUED', () => {
            const item = { conversionAttempts: 1 };
            const next = applyConversionAttempt(item, failureOutcome);
            expect(next.conversionAttempts).toBe(2);
            expect(next.parked).toBe(false);
            expect(next.nextState).toBe(CONVERSION_STATES.QUEUED);
        });

        test('fallimento al tetto (tentativo 3): transiziona a PARKED con motivo e data', () => {
            const item = { conversionAttempts: 2 };
            const fixedDate = new Date('2026-10-17T08:00:00Z');
            const next = applyConversionAttempt(item, failureOutcome, { now: fixedDate });

            expect(next.conversionAttempts).toBe(3);
            expect(next.parked).toBe(true);
            expect(next.parkedAt).toEqual(fixedDate);
            expect(next.parkedReason).toBe('not-found');
            expect(next.nextState).toBe(CONVERSION_STATES.PARKED);
        });

        test('risoluzione positiva: azzera tentativi e pulisce il parcheggio', () => {
            const item = { conversionAttempts: 2, parkedAt: new Date(), parkedReason: 'not-found' };
            const next = applyConversionAttempt(item, successOutcome);

            expect(next.conversionAttempts).toBe(0);
            expect(next.parked).toBe(false);
            expect(next.parkedAt).toBeNull();
            expect(next.parkedReason).toBeNull();
            expect(next.nextState).toBe(CONVERSION_STATES.CONVERTED);
        });
    });

    describe('3. Ritorno in coda (unparkItem)', () => {
        test('unparkItem azzera conversionAttempts, parkedAt e parkedReason', () => {
            const parkedItem = {
                itemId: 'tt001',
                mapped: false,
                conversionAttempts: 3,
                parkedAt: new Date('2026-10-17T08:00:00Z'),
                parkedReason: 'not-found'
            };

            const resetFields = unparkItem(parkedItem);
            const restoredItem = { ...parkedItem, ...resetFields };

            expect(restoredItem.conversionAttempts).toBe(0);
            expect(restoredItem.parkedAt).toBeNull();
            expect(restoredItem.parkedReason).toBeNull();
            expect(getConversionState(restoredItem)).toBe(CONVERSION_STATES.QUEUED);
            expect(isEligibleForConversion(restoredItem)).toBe(true);
        });
    });

    describe('4. Sommario del giro di parcheggio', () => {
        test('summarizeParkedRun produce la stringa attesa per singolare e plurale', () => {
            expect(summarizeParkedRun([])).toBeNull();

            const single = [{ itemId: 'tt001', reason: 'not-found', attempts: 3 }];
            expect(summarizeParkedRun(single)).toBe(
                '1 item parcheggiato dopo 3 tentativi (1 assenti dalla mappatura)'
            );

            const multi = [
                { itemId: 'tt001', reason: 'not-found', attempts: 3 },
                { itemId: 'tt002', reason: 'not-found', attempts: 3 },
                { itemId: 'tt003', reason: 'unsupported', attempts: 3 }
            ];
            expect(summarizeParkedRun(multi)).toBe(
                '3 item parcheggiati dopo 3 tentativi (2 assenti dalla mappatura, 1 fonte non gestita)'
            );
        });
    });
});
