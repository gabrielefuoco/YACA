/**
 * Il tetto ai tentativi: un item che il giro non risolve un numero fisso di volte
 * smette di essere ritentato e resta **parcheggiato**, col motivo registrato.
 *
 * Qui è tutto funzione pura alimentata dai dati (nessuna rete, nessun database):
 * il conteggio, il parcheggio, l'ammissione al giro e la riga di log.
 */
const {
    MAX_CONVERSION_ATTEMPTS,
    PARKED_REASONS,
    applyConversionAttempt,
    isParked,
    readConversionAttempts,
    summarizeParkedRun
} = require('../src/services/libraryConversionRetry');
const { applyConversionOutcome } = require('../src/services/libraryConversionOutcome');
const { evaluateConversionAdmission, selectConvertibleItems } = require('../src/services/libraryConversionAdmission');
const { RESOLUTION_REASONS } = require('../src/services/libraryIdentityResolution');

const NOT_FOUND_OUTCOME = { resolved: false, tmdbId: null, reason: RESOLUTION_REASONS.NOT_FOUND };
const FOUND_OUTCOME = { resolved: true, tmdbId: 128, reason: RESOLUTION_REASONS.FOUND_VIA_KITSU_MAP };

/** Un giro: il ciclo applica l'esito e poi il conteggio del tetto. */
function runTurn(item, outcome, now = new Date('2026-10-05T00:00:00Z')) {
    return Object.assign(
        {},
        item,
        applyConversionOutcome(item, outcome),
        applyConversionAttempt(item, outcome, { now })
    );
}

describe('il tetto ai tentativi', () => {
    test('tre, non tre giri qualunque', () => {
        expect(MAX_CONVERSION_ATTEMPTS).toBe(3);
    });

    test('prima e seconda volta l\'item resta in coda e non è ancora parcheggiato', () => {
        const item = { itemId: 'kitsu:99999999', tmdbId: null, mapped: false, conversionAttempts: 0 };

        const first = runTurn(item, NOT_FOUND_OUTCOME);
        expect(first.conversionAttempts).toBe(1);
        expect(isParked(first)).toBe(false);

        const second = runTurn(first, NOT_FOUND_OUTCOME);
        expect(second.conversionAttempts).toBe(2);
        expect(isParked(second)).toBe(false);
        expect(evaluateConversionAdmission(second)).toEqual({ eligible: true, reason: null });
    });

    test('alla terza l\'item è parcheggiato, col motivo dell\'ultimo tentativo', () => {
        let item = { itemId: 'kitsu:99999999', tmdbId: null, mapped: false, conversionAttempts: 0 };
        item = runTurn(item, NOT_FOUND_OUTCOME);
        item = runTurn(item, NOT_FOUND_OUTCOME);
        item = runTurn(item, NOT_FOUND_OUTCOME);

        expect(item.conversionAttempts).toBe(3);
        expect(isParked(item)).toBe(true);
        expect(item.parkedReason).toBe(RESOLUTION_REASONS.NOT_FOUND);
        expect(item.parkedAt).not.toBeNull();
    });

    test('un item convertito azzera il conteggio e non resta parcheggiato', () => {
        const parked = {
            itemId: 'kitsu:99999999',
            tmdbId: null,
            mapped: false,
            conversionAttempts: 3,
            parkedAt: new Date('2026-10-05T00:00:00Z'),
            parkedReason: RESOLUTION_REASONS.NOT_FOUND
        };

        const fixed = runTurn(parked, FOUND_OUTCOME);
        expect(fixed.mapped).toBe(true);
        expect(fixed.conversionAttempts).toBe(0);
        expect(isParked(fixed)).toBe(false);
        expect(fixed.parkedAt).toBeNull();
        expect(fixed.parkedReason).toBeNull();
    });

    test('il conteggio letto è quello del dato, mai una stringa', () => {
        expect(readConversionAttempts({ conversionAttempts: 2 })).toBe(2);
        expect(readConversionAttempts({})).toBe(0);
        expect(readConversionAttempts(null)).toBe(0);
        expect(readConversionAttempts({ conversionAttempts: '3' })).toBe(3);
        expect(readConversionAttempts({ conversionAttempts: 'sporco' })).toBe(0);
    });
});

describe('parcheggiato ≠ convertito, ≠ in coda', () => {
    test('il parcheggio è un dato a parte: `mapped` resta falso', () => {
        let item = { itemId: 'kitsu:99999999', tmdbId: null, mapped: false, conversionAttempts: 2 };
        item = runTurn(item, NOT_FOUND_OUTCOME);

        expect(item.mapped).toBe(false);
        expect(isParked(item)).toBe(true);
    });

    test('un item convertito e uno parcheggiato non si confondono', () => {
        const converted = runTurn({ itemId: 'kitsu:142', tmdbId: null, mapped: false, conversionAttempts: 0 }, FOUND_OUTCOME);
        const parked = runTurn({ itemId: 'kitsu:99999999', tmdbId: null, mapped: false, conversionAttempts: 2 }, NOT_FOUND_OUTCOME);
        const queued = runTurn({ itemId: 'kitsu:1', tmdbId: null, mapped: false, conversionAttempts: 0 }, NOT_FOUND_OUTCOME);

        expect([converted.mapped, isParked(converted)]).toEqual([true, false]);
        expect([parked.mapped, isParked(parked)]).toEqual([false, true]);
        expect([queued.mapped, isParked(queued)]).toEqual([false, false]);
    });

    test('la coda del giro dopo contiene il parcheggiato solo se qualcuno lo rimette in giro', () => {
        const parked = runTurn(
            runTurn(runTurn({ itemId: 'kitsu:99999999', tmdbId: null, mapped: false, conversionAttempts: 0 }, NOT_FOUND_OUTCOME), NOT_FOUND_OUTCOME),
            NOT_FOUND_OUTCOME
        );

        expect(selectConvertibleItems([parked])).toHaveLength(0);
        expect(evaluateConversionAdmission(parked)).toEqual({ eligible: false, reason: PARKED_REASONS.PARKED });

        // Rimetterlo in giro è un **cambio di campo**, non una modifica al codice:
        // azzeriamo il conteggio e la marcatura di parcheggio.
        const requeued = Object.assign({}, parked, {
            conversionAttempts: 0,
            parkedAt: null,
            parkedReason: null
        });

        expect(evaluateConversionAdmission(requeued)).toEqual({ eligible: true, reason: null });
        expect(selectConvertibleItems([requeued])).toHaveLength(1);

        // E il giro dopo lo converte davvero.
        const fixed = runTurn(requeued, FOUND_OUTCOME);
        expect(fixed.mapped).toBe(true);
        expect(fixed.tmdbId).toBe(128);
    });
});

describe('summarizeParkedRun', () => {
    test('senza parcheggiati non c\'è niente da dire', () => {
        expect(summarizeParkedRun([])).toBeNull();
    });

    test('una riga sola: quanti e perché', () => {
        const line = summarizeParkedRun([
            { itemId: 'kitsu:1', reason: RESOLUTION_REASONS.NOT_FOUND, attempts: 3 },
            { itemId: 'kitsu:2', reason: RESOLUTION_REASONS.NOT_FOUND, attempts: 3 },
            { itemId: 'anilist:3', reason: RESOLUTION_REASONS.UNSUPPORTED_SOURCE, attempts: 3 }
        ]);

        expect(line.split('\n')).toHaveLength(1);
        expect(line).toBe(
            `3 item parcheggiati dopo ${MAX_CONVERSION_ATTEMPTS} tentativi (2 assenti dalla mappatura, 1 fonte non gestita)`
        );
    });

    test('un solo item parcheggiato: singolare e con il suo motivo', () => {
        const line = summarizeParkedRun([{ itemId: 'kitsu:1', reason: RESOLUTION_REASONS.NOT_FOUND, attempts: 3 }]);

        expect(line).toBe(
            `1 item parcheggiato dopo ${MAX_CONVERSION_ATTEMPTS} tentativi (1 assenti dalla mappatura)`
        );
    });
});