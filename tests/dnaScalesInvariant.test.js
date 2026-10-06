/**
 * L'invariante delle due scale del DNA.
 *
 * PERCHÉ QUESTO FILE ESISTE
 * Nel DNA circolano due normalizzazioni con nomi simili e scopi opposti:
 *
 *   - `sanitizeDnaVector` (src/data/keywordIds.js) porta la somma a **100**:
 *     è la scala PERSISTITA, quella che finisce in `compiledVectors` su Mongo;
 *   - `normalizeVector` (src/dna/dnaEngine.js) porta la somma a **1**: è un
 *     passaggio ALGEBRICO INTERNO a `computeFinalDNA`, per fondere
 *     distribuzioni unitarie.
 *
 * Non sono due standard in competizione: sono due cose diverse che si
 * chiamano in modo simile. E in realtà le convenzioni sono **tre**, non due:
 *
 *   1. **somma 100** — `sanitizeDnaVector`: la scala PERSISTITA su Mongo;
 *   2. **somma 1** — `normalizeVector`: passaggio interno di `computeFinalDNA`
 *      per fondere distribuzioni;
 *   3. **norma euclidea 1** — `sparseUnitNormalize`: serve al coseno, e la sua
 *      somma può essere qualunque cosa (per `{a:3,b:4}` è 1.4). Unificarle "per pulizia" — cosa che verrebbe
 * naturale a chi legge i due nomi — rompe i pesi dei profili già salvati:
 * un vettore da 1 riletto come se fosse da 100 vale un centesimo.
 *
 * Questo test è la voce che mancava: non verifica che una funzione fa il suo
 * lavoro (lo fanno già le suite di caratterizzazione), verifica che le due
 * restino **diverse** e che i percorsi di scrittura restino CONSISTENTI fra
 * loro. È il difetto vero che è già stato pagato una volta: `V_active` veniva
 * scritto in due scale a seconda di chi salvava il profilo (il builder
 * saturava, la rotta REST rinormalizzava) e il significato dei pesi dipendeva
 * dal percorso.
 *
 * Se un giorno qualcuno unifica le due funzioni, questo file rosseggia e dice
 * perché. Se rosseggia per un altro motivo, la domanda giusta è: qualcuno ha
 * toccato la scala di ciò che si scrive su Mongo?
 */
const { computeActiveDNA, normalizeVector, sparseUnitNormalize } = require('../src/dna/dnaEngine');
const { sanitizeDnaVector } = require('../src/data/keywordIds');

const somma = (v) => Object.values(v).reduce((a, b) => a + b, 0);

/** Un attivo grezzo verosimile: conteggi piccoli e grandi, come dopo un sync. */
const GREZZO = { 'g:16': 12, 'g:28': 9, 'k:12984': 3, 'o:JP': 7, 'L2:t_272': 2 };

describe('DNA: le due scale', () => {
    it('sanitizeDnaVector persiste a somma 100', () => {
        expect(somma(sanitizeDnaVector(GREZZO))).toBeCloseTo(100, 9);
    });

    it('normalizeVector lavora a somma 1, ed è INTERNO', () => {
        expect(somma(normalizeVector(GREZZO))).toBeCloseTo(1, 12);
    });

    it('le due scale restano diverse: unificarle romperebbe i profili salvati', () => {
        const persistito = sanitizeDnaVector(GREZZO);
        const unitario = normalizeVector(GREZZO);
        expect(somma(persistito)).not.toBeCloseTo(somma(unitario), 3);
        // Il fattore è ~100: è quello che rende la confusione costosa.
        expect(somma(persistito) / somma(unitario)).toBeCloseTo(100, 6);
    });

    it('computeActiveDNA scrive già sulla scala persistita', () => {
        // È la correzione del difetto: il builder e la rotta REST devono
        // produrre la stessa cosa, senza che nessuno rinormalizzi dopo.
        const attivo = computeActiveDNA(GREZZO);
        expect(somma(attivo)).toBeCloseTo(100, 9);
    });

    it('i due percorsi di scrittura sono CONSISTENTI: sanitize ∘ computeActive = computeActive', () => {
        // La rotta REST passa il vettore da sanitizeDnaVector, il builder no.
        // Se questo non è idempotente, i due percorsi scrivono scale diverse —
        // ed è esattamente il difetto che ha reso ambiguo il significato di
        // V_active per mesi.
        const attivo = computeActiveDNA(GREZZO);
        const ripassato = sanitizeDnaVector(attivo);
        const chiavi = new Set([...Object.keys(attivo), ...Object.keys(ripassato)]);
        for (const k of chiavi) {
            expect(ripassato[k] ?? 0).toBeCloseTo(attivo[k] ?? 0, 9);
        }
    });

    it('la normalizzazione sparsa porta la NORMA euclidea a 1, non la somma', () => {
        // Terza convenzione, e serve al coseno: `sparseUnitNormalize({a:3,b:4})`
        // dà {a:0.6, b:0.8}, che somma 1.4. Chi la scambiasse per una
        // normalizzazione a somma 1 troverebbe pesi che non tornano.
        const norma = (v) => Math.sqrt(Object.values(v).reduce((a, b) => a + (b * b), 0));
        const unitario = sparseUnitNormalize(GREZZO);
        expect(norma(unitario)).toBeCloseTo(1, 12);
        expect(somma(unitario)).not.toBeCloseTo(1, 3);
        // E su ciò che è già a somma 100 non cambia la scala persistita:
        // è un'operazione di lettura per lo scoring, non di scrittura.
        expect(somma(sanitizeDnaVector(GREZZO))).toBeCloseTo(100, 9);
    });
});
