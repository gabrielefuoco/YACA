/**
 * giro.js
 * Il passo di scrittura del giro, con il **diff agganciato**.
 *
 * PERCHÉ ESISTE: `writer.js` riscrive `ita_annotations.jsonl` a ogni giro e `diff.js` sa dire
 * quali titoli hanno cambiato doppiaggio, ma i due non si parlavano. Il motivo è che il momento in
 * cui il giro precedente è ancora su disco **è uno solo**: prima che il writer passi. Dopo, il file
 * è già quello nuovo e il confronto non ha più niente da dire. Quindi il diff si calcola *prima*,
 * con le righe nuove in mano, e l'artefatto si scrive *dopo*, solo se la scrittura è andata.
 *
 * TRE REGOLE, in ordine di importanza:
 *
 * 1. **La guardia non produce eventi.** Se i `true` calano oltre il 2% il writer non scrive e
 *    restituisce `reason: 'guard'`: su disco resta il file vecchio, quindi *nessun doppiaggio è
 *    cambiato* e non c'è nessun poster da rifare. Emettere comunque gli eventi sarebbe dire
 *    "questo titolo è diventato doppiato" per un file che non è stato scritto.
 * 2. **Il diff non può far fallire il giro.** Se il file precedente è illeggibile, se le righe sono
 *    rotte, se il disco è pieno: si logga e si va avanti. Il giro deve scrivere le sue annotazioni
 *    comunque — perdere un giro di annotazioni per un diff è un guasto molto più grosso di un
 *    giro senza eventi.
 * 3. **Nel log c'è il numero di cambi**: è la riga che l'operatore guarda dopo un timer. Sta
 *    accanto alle altre del giro (`[Writer]`, `[Anime]`), non in un file a parte.
 *
 * Il modulo è volutamente piccolo e non sa niente di scraping, Mongo o catalogo: fa da ponte fra
 * `writer.js` e `diff.js`, e come tale si può provare da solo (`tests/giro.test.js`).
 */

const { toRows, writeAnnotations } = require('./writer');
const { computeDiff, writeDiff, diffPathFor } = require('./diff');

/**
 * Scrive le annotazioni del giro e, se la scrittura è avvenuta, il diff con il giro precedente.
 *
 * @param {Array} righe righe di annotazione (`{t, id, ita}` o l'output del matcher): passate
 *        attraverso `toRows`, quindi ordinate per (tipo, id) come il file. L'ordinamento non è
 *        decorativo: è su quello che il confronto a due puntatori di `diff.js` fa affidamento.
 * @param {object} [opts] le stesse opzioni di `writeAnnotations`, più:
 * @param {boolean} [opts.calcolaDiff] iniezione di `computeDiff` (solo test: serve a provare che un
 *        diff rotto non ferma il giro senza sporcare il file con il precedente)
 * @param {object} [opts.log] logger (`console` di default)
 * @returns {Promise<object>} il risultato di `writeAnnotations` più `diff`: l'esito del diff
 *          (`null` se non è stato calcolato o se il giro non ha scritto — caso in cui **non ci
 *          sono eventi**, per costruzione).
 */
async function scriviConDiff(righe, opts = {}) {
    const { calcolaDiff = computeDiff, log = console, ...opzioniWriter } = opts;

    // Le stesse righe che il writer sta per mettere su disco: l'ordinamento deve essere identico,
    // altrimenti il confronto a due puntatori darebbe eventi sbagliati in silenzio.
    const righeOrdinate = toRows(righe);

    // ---- 1. il diff, PRIMA che il writer tocchi il file -------------------------------
    // `previousPath` è il percorso che verrà sovrascritto: adesso, e solo adesso, è il giro
    // precedente. Se il file non esiste, `computeDiff` lo dichiara primo giro e non produce eventi.
    let diff = null;
    if (!opzioniWriter.dryRun) {
        try {
            diff = await calcolaDiff({
                previousPath: opzioniWriter.outputPath,
                current: righeOrdinate,
                quiet: true // il riepilogo lo stampa chi scrive, una volta sola
            });
        } catch (err) {
            diff = null;
            log.warn(`[Diff] calcolo fallito (${err.message}): il giro continua e scrive lo stesso. Nessun evento da questo giro.`);
        }
    }

    // ---- 2. la scrittura, con la guardia del writer -------------------------------------
    const scrittura = await writeAnnotations(righeOrdinate, opzioniWriter);

    // ---- 3. l'artefatto, solo se il giro ha davvero scritto ----------------------------
    if (!scrittura.written) {
        if (scrittura.reason === 'guard') {
            // Il file vecchio è ancora lì: nessun doppiaggio è cambiato, nessun poster da rifare.
            // L'artefatto non viene toccato: quello sul disco è il diff del giro *scritto*, che è
            // l'ultimo giro realmente applicato. (Log esplicito perché è una cosa che a freddo
            // sembra un buco: il file diff è più vecchio del jsonl solo in questo caso.)
            log.error(`[Diff] guardia: il giro non ha scritto, nessun evento. ` +
                `L'artefatto resta quello dell'ultimo giro scritto (${diffPathFor(scrittura.path)}).`);
        }
        return { ...scrittura, diff: null };
    }

    if (!diff) {
        // Scritto ma senza diff: o il calcolo è esploso (loggato sopra), o è un dry-run che ha
        // scritto per caso. In entrambi i casi il giro è completo.
        return { ...scrittura, diff: null };
    }

    let artefatto = null;
    try {
        artefatto = await writeDiff(diff, {
            outputPath: scrittura.path,
            quiet: true
        });
    } catch (err) {
        log.warn(`[Diff] artefatto non scritto (${err.message}): il giro ha scritto lo stesso.`);
        return { ...scrittura, diff: null };
    }

    log.log(`[Diff] ${artefatto.cambiati} cambi di doppiaggio in questo giro ` +
        `(diventati doppiati: ${artefatto.diventatiDoppiati}, non più doppiati: ${artefatto.nonPiuDoppiati}) -> ${artefatto.path}`);

    return {
        ...scrittura,
        diff: {
            changes: diff.changes,
            cambiati: artefatto.cambiati,
            diventatiDoppiati: artefatto.diventatiDoppiati,
            nonPiuDoppiati: artefatto.nonPiuDoppiati,
            primoGiro: diff.primoGiro === true,
            oltreSoglia: artefatto.oltreSoglia === true,
            path: artefatto.path
        }
    };
}

module.exports = {
    scriviConDiff
};
