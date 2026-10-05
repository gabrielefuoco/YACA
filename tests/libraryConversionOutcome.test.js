/**
 * L'esito di un giro di conversione: che cosa si scrive sull'item e che cosa si
 * dice all'operatore. Il punto del giro non è solo «ho finito», è anche «chi non
 * si è risolto resta in coda»: un item senza TMDB id non viene dato per convertito,
 * e la riga di log riassume quanti ne sono rimasti e perché.
 *
 * Qui è tutto funzione pura alimentata dai dati: nessuna rete, nessun database.
 */
const {
    OUTCOME_REASONS,
    decideConversionOutcome,
    applyConversionOutcome,
    summarizeUnresolvedRun,
    buildConversionState
} = require('../src/services/libraryConversionOutcome');
const { RESOLUTION_REASONS, resolveTmdbIdentity } = require('../src/services/libraryIdentityResolution');
const { evaluateConversionAdmission, selectConvertibleItems } = require('../src/services/libraryConversionAdmission');

/** Mappa Kitsu finestra: conosce solo gli id che il test le ha insegnato. */
function fakeKitsuMap(known = {}) {
    return async (kitsuId) => (known[kitsuId] !== undefined ? known[kitsuId] : null);
}

describe('decideConversionOutcome', () => {
    test('un item senza TMDB id resta non risolto, col motivo della risoluzione', () => {
        const outcome = decideConversionOutcome({
            tmdbId: null,
            identity: { resolved: false, tmdbId: null, reason: RESOLUTION_REASONS.NOT_FOUND }
        });

        expect(outcome).toEqual({
            resolved: false,
            tmdbId: null,
            reason: RESOLUTION_REASONS.NOT_FOUND
        });
    });

    test('un item che ha già un TMDB id è risolto, anche senza passare dalla risoluzione', () => {
        const outcome = decideConversionOutcome({ tmdbId: 278, identity: null });

        expect(outcome).toEqual({
            resolved: true,
            tmdbId: 278,
            reason: OUTCOME_REASONS.ITEM_ALREADY_HAS_TMDB_ID
        });
    });

    test('l\'id trovato dalla risoluzione vince ed è risolto', () => {
        const outcome = decideConversionOutcome({
            tmdbId: null,
            identity: { resolved: true, tmdbId: 128, reason: RESOLUTION_REASONS.FOUND_VIA_KITSU_MAP }
        });

        expect(outcome).toEqual({
            resolved: true,
            tmdbId: 128,
            reason: RESOLUTION_REASONS.FOUND_VIA_KITSU_MAP
        });
    });
});

describe('un giro: chi non si risolve resta in coda', () => {
    /**
     * Un giro di conversione, per un solo item, applicando le stesse regole del
     * ciclo di produzione: si risolve l'identità, si applica l'esito sull'item,
     * e l'item resta nell'elenco degli eleggibili se non ha una TMDB id.
     */
    async function runTurn(item, deps) {
        const rawId = String(item.itemId || item._id);
        const identity = await resolveTmdbIdentity(rawId, deps);
        const outcome = decideConversionOutcome({ tmdbId: item.tmdbId, identity });
        // Come nel ciclo: si applica all'item solo ciò che l'esito dice di scrivere.
        return Object.assign({}, item, applyConversionOutcome(item, outcome));
    }

    test('un kitsu assente dalla mappatura non risulta convertito e il giro dopo lo ripesca', async () => {
        const item = { itemId: 'kitsu:99999999', tmdbId: null, mapped: false, removed: false, duplicateOf: null };

        const first = await runTurn(item, { lookupKitsuId: fakeKitsuMap() });
        expect(first.mapped).toBe(false);
        expect(first.tmdbId).toBeNull();

        // Stessa regola di ammissione del giro successivo: l'item è ancora eleggibile.
        expect(evaluateConversionAdmission(first)).toEqual({ eligible: true, reason: null });
        expect(selectConvertibleItems([first])).toHaveLength(1);

        // Il giro dopo, con la mappatura che nel frattempo si è aggiornata.
        const second = await runTurn(first, { lookupKitsuId: fakeKitsuMap({ 99999999: 4242 }) });
        expect(second.mapped).toBe(true);
        expect(second.tmdbId).toBe(4242);
        expect(evaluateConversionAdmission(second).eligible).toBe(false);
    });

    test('il conteggio degli item da convertire non torna a zero finché qualcosa non ha identità', async () => {
        const resolved = await runTurn(
            { itemId: 'kitsu:142', tmdbId: null, mapped: false, removed: false, duplicateOf: null },
            { lookupKitsuId: fakeKitsuMap({ 142: 128 }) }
        );
        const stillMissing = await runTurn(
            { itemId: 'kitsu:99999999', tmdbId: null, mapped: false, removed: false, duplicateOf: null },
            { lookupKitsuId: fakeKitsuMap({ 142: 128 }) }
        );

        const queue = selectConvertibleItems([resolved, stillMissing]);
        expect(queue.map(i => i.itemId)).toEqual(['kitsu:99999999']);
    });
});

describe('applyConversionOutcome', () => {
    test('l\'item risolto viene scritto come convertito', () => {
        const state = applyConversionOutcome(
            { itemId: 'kitsu:142', mapped: false },
            { resolved: true, tmdbId: 128, reason: RESOLUTION_REASONS.FOUND_VIA_KITSU_MAP }
        );

        expect(state.tmdbId).toBe(128);
        expect(state.mapped).toBe(true);
    });

    test('l\'item non risolto non viene scritto come convertito', () => {
        const state = applyConversionOutcome(
            { itemId: 'kitsu:99999999', mapped: false },
            { resolved: false, tmdbId: null, reason: RESOLUTION_REASONS.NOT_FOUND }
        );

        expect(state.mapped).toBe(false);
        expect(state.tmdbId).toBeNull();
    });
});

describe('summarizeUnresolvedRun', () => {
    test('senza item non risolti non c\'è niente da dire', () => {
        expect(summarizeUnresolvedRun([])).toBeNull();
    });

    test('una sola riga: quanti e perché', () => {
        const line = summarizeUnresolvedRun([
            { itemId: 'kitsu:1', reason: RESOLUTION_REASONS.NOT_FOUND },
            { itemId: 'kitsu:2', reason: RESOLUTION_REASONS.NOT_FOUND },
            { itemId: 'anilist:3', reason: RESOLUTION_REASONS.UNSUPPORTED_SOURCE }
        ]);

        expect(line).toBe(
            '3 item non risolti restano in coda (2 assenti dalla mappatura, 1 fonte non gestita): torneranno nel giro dopo'
        );
        expect(line.split('\n')).toHaveLength(1);
    });

    test('un item non risolto non viene contato come convertito', () => {
        const line = summarizeUnresolvedRun([{ itemId: 'kitsu:1', reason: RESOLUTION_REASONS.NOT_FOUND }]);
        expect(line).toBe(
            '1 item non risolto resta in coda (1 assenti dalla mappatura): torneranno nel giro dopo'
        );
    });
});

describe('buildConversionState', () => {
    test('descrive il giro intero: quante conversioni, quante rimaste in coda', () => {
        const state = buildConversionState([
            { itemId: 'kitsu:142', outcome: { resolved: true, tmdbId: 128, reason: RESOLUTION_REASONS.FOUND_VIA_KITSU_MAP } },
            { itemId: 'kitsu:99999999', outcome: { resolved: false, tmdbId: null, reason: RESOLUTION_REASONS.NOT_FOUND } }
        ]);

        expect(state.converted).toBe(1);
        expect(state.unresolved).toEqual([{ itemId: 'kitsu:99999999', reason: RESOLUTION_REASONS.NOT_FOUND }]);
    });
});
