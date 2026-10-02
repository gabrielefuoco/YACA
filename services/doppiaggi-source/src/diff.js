/**
 * diff.js
 * Quali titoli hanno **cambiato doppiaggio** fra due giri.
 *
 * PERCHÉ ESISTE: i poster composti sono file statici serviti come immagini. Un file vale per
 * mesi finché il titolo non cambia; ma quando un titolo **diventa doppiato** (o smette di esserlo)
 * quel file è vecchio e aspettare il TTL sarebbe assurdo. Il diff è ciò che dice *quali* poster
 * rifare: è la sorgente degli eventi per la coda dell'app (`push({tipo, id, badge})`).
 *
 * L'ingresso sono i due file prodotti da `writer.js`:
 *     ita_annotations.jsonl   una riga per voce, {"t":"movie","id":5,"ita":true|valore}
 * ordinati per **(tipo, id)** — scritti apposta così ("per avere diff leggibili e file confrontabili
 * fra un giro e l'altro"). Quindi il confronto è una **fusione a due puntatori**: ogni file viene
 * letto una riga alla volta e in memoria sta solo la coppia di righe sotto esame. Il codice non
 * deve sapere quanti titoli ci sono (oggi ~24.000).
 *
 * CHE COSA È UN CAMBIAMENTO (e cosa non lo è):
 * - `false`/`null`/assente -> `true`  ⇒ `{tipo, id, badge: 'ITA'}`   il poster va rifatto col badge;
 * - `true` -> altro                   ⇒ `{tipo, id, badge: null}`      il poster va rifatto **senza**
 *   badge. Anche questo è un evento: togliere il badge è un cambiamento visibile quanto metterlo;
 * - tutto il resto (null -> null, true -> true, una riga che compare o sparisce) ⇒ nessun evento.
 *   Un titolo che entra nel catalogo non ha un poster da rifare: si rifarà quando verrà composto.
 *
 * PRIMO GIRO: se il file precedente **non esiste** il diff è **vuoto**, per contratto. Senza questo,
 * al primo giro tutti i ~19.000 doppiati sembrerebbero "nuovi" e la coda chiederebbe 19.000 poster
 * in un colpo. Il modulo lo dichiara nel log e nel file (`primoGiro: true`).
 *
 * Il modulo qui fa solo il calcolo e scrive il suo artefatto: **non è agganciato al writer**
 * (l'aggancio al giro è un passo dopo) e non tocca `ita_annotations.jsonl`.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCHEMA_VERSION = 1;
const DEFAULT_FILENAME = 'ita_annotations.diff.json';

/**
 * Tetto sui cambi di un giro. Sopra questa soglia è quasi certamente un guasto (l'ordinamento
 * rotto, un file sovrascritto da uno scarico, la fonte andata a pezzi) o un primo giro travestito:
 * 5.000 poster da rifare in un colpo non è un lavoro, è un incidente. Non blocchiamo (il numero
 * vero resta nel file e nel log: nasconderlo sarebbe peggio), ma gridiamo.
 */
const CAP_CAMBI = 5000;

/** Il badge che il core mette sulla card di un titolo doppiato (`StremioFormatter`: `ITA` secca). */
const BADGE_ITA = 'ITA';

/** `ita_annotations.jsonl` -> `ita_annotations.diff.json` (stessa cartella, come il meta). */
function diffPathFor(outputPath) {
    const dir = path.dirname(outputPath);
    const base = path.basename(outputPath).replace(/\.jsonl$/i, '');
    return path.join(dir, `${base}.diff.json`);
}

/** Una riga è doppiata **solo** se `ita === true` (stringa `'true'` compresa, difensivo). */
function _doppiato(row) {
    if (!row) return false;
    return row.ita === true || row.ita === 'true';
}

/**
 * Normalizza una riga in `{t, id, ita}`: accetta l'oggetto già pronto **o** la riga grezza del
 * file (JSON in una stringa), così lo stesso codice serve sia un array in memoria sia lo stream di
 * `readline`. Riga vuota, JSON rotto, `t` ignoto o `id` non numerico: `null` (si salta, non si
 * indovina) — è la stessa tolleranza di `readAnnotationRows`.
 */
function _normalizza(riga) {
    if (!riga) return null;
    let row = riga;
    if (typeof row === 'string') {
        const testo = row.trim();
        if (!testo) return null;
        try {
            row = JSON.parse(testo);
        } catch (_) {
            return null;
        }
    }
    if (!row || typeof row !== 'object') return null;
    const t = row.t !== undefined ? row.t : row.tipo; // `t` nel file, `tipo` nell'evento
    if (t !== 'movie' && t !== 'tv') return null;
    const id = Number(row.id);
    if (!Number.isFinite(id)) return null;
    return { t, id, ita: row.ita === undefined ? false : row.ita };
}

/** Ordine `(tipo, id)` — lo stesso del file: `movie` prima di `tv`, poi id crescente. */
function _confronta(a, b) {
    if (a.t !== b.t) return a.t < b.t ? -1 : 1;
    return a.id - b.id;
}

/** Chiave leggibile per i log e per l'anomalia d'ordinamento: `movie:5`. */
function _chiave(row) {
    return `${row.t}:${row.id}`;
}

/**
 * Sorgente "a puntatore": espone `prossimo()` invece di un array, così si può avanzare di una riga
 * alla volta su uno stream (niente `Array.from` su 24.000 righe). Accetta array, iterabili sincroni,
 * iterabili asincroni e valori singoli.
 */
function _sorgente(righe) {
    let it;
    let finito = !righe;
    let accodati = null;

    const prossimoGrezzo = async () => {
        if (finito) return undefined;
        if (!it) {
            if (righe && typeof righe[Symbol.asyncIterator] === 'function') {
                it = righe[Symbol.asyncIterator]();
            } else if (righe && typeof righe[Symbol.iterator] === 'function') {
                it = righe[Symbol.iterator]();
            } else {
                it = [righe][Symbol.iterator](); // una riga singola
            }
        }
        const passo = await it.next();
        if (passo.done) finito = true;
        return passo.value;
    };

    return {
        // righe scartate (JSON rotto, riga vuota, id non numerico): contate, mai usate come chiave
        scartate: () => accodati,
        async prossimo() {
            for (;;) {
                const grezzo = await prossimoGrezzo();
                if (grezzo === undefined) return null;
                const row = _normalizza(grezzo);
                if (row) return row;
                accodati = (accodati || 0) + 1;
            }
        }
    };
}

/**
 * Quali titoli sono cambiati fra due elenchi di righe **ordinati per (tipo, id)**.
 *
 * Funzione pura: nessuna I/O, nessun orologio, nessuno stato nascosto. Accetta array, iterabili
 * sincroni o asincroni, e sia oggetti (`{t,id,ita}`) sia righe greffe di file. Restituisce solo i
 * cambiamenti, quindi l'array è piccolo anche quando gli elenchi sono enormi.
 *
 * Le chiavi duplicate **nella stessa fonte** non sono previste (il merge le elimina a monte per
 * costruzione); se ci fossero, il confronto le tratterebbe come righe indipendenti.
 *
 * @param {Iterable|AsyncIterable} righeVecchie righe del giro precedente (ordinate)
 * @param {Iterable|AsyncIterable} righeNuove righe di questo giro (ordinate)
 * @param {object} [opts]
 * @param {boolean} [opts.primoGiro=false] se `true` il diff è **vuoto**: non c'è un giro precedente
 *        con cui confrontare, quindi tutto sembrerebbe nuovo. Va impostato da chi sa che il file
 *        precedente non esiste (`computeDiff`), non dedotto qui.
 * @param {(info: {file?: string, chiave?: string, motivo: string}) => void} [opts.onAnomalia]
 *        chiamata quando una sorgente **non risulta ordinata**: la fusione a due puntatori su
 *        righe disordinate darebbe eventi sbagliati (o mancanti), quindi il chiamante che non passa
 *        la callback riceve comunque il risultato ma senza sapere che è sospetto.
 * @returns {Promise<Array<{tipo:'movie'|'tv', id:number, badge:'ITA'|null}>>}
 */
async function computeChanges(righeVecchie, righeNuove, opts = {}) {
    if (opts.primoGiro) return [];

    const vecchio = _sorgente(righeVecchie);
    const nuovo = _sorgente(righeNuove);
    const cambiamenti = [];

    // Distingue "cambiato in su" (diventa doppiato) da "cambiato in giù" (smette): senza questa
    // coppia il badge da mettere o da togliere sarebbe indistinguibile.
    const evento = (row, badge) => cambiamenti.push({ tipo: row.t, id: row.id, badge });

    let a = await vecchio.prossimo();
    let b = await nuovo.prossimo();
    let ultimoVecchio = null;
    let ultimoNuovo = null;

    // Una sola segnalazione per sorgente: se il file non è ordinato lo dice una volta, non 24.000.
    let segnalatoVecchio = false;
    let segnalatoNuovo = false;
    const segnala = (file, chiave, giaSegnalato) => {
        if (giaSegnalato || !opts.onAnomalia) return;
        if (file === 'vecchio') segnalatoVecchio = true;
        else segnalatoNuovo = true;
        opts.onAnomalia({ file, chiave, motivo: 'righe fuori ordine: il confronto a due puntatori non è attendibile' });
    };

    while (a || b) {
        if (a) {
            if (ultimoVecchio && _confronta(ultimoVecchio, a) > 0) segnala('vecchio', _chiave(a), segnalatoVecchio);
            ultimoVecchio = a;
        }
        if (b) {
            if (ultimoNuovo && _confronta(ultimoNuovo, b) > 0) segnala('nuovo', _chiave(b), segnalatoNuovo);
            ultimoNuovo = b;
        }

        if (!b) {
            // resta solo nel vecchio: se era doppiato, adesso non lo è più
            if (_doppiato(a)) evento(a, null);
            a = await vecchio.prossimo();
        } else if (!a) {
            // resta solo nel nuovo: se è doppiato, prima non lo era
            if (_doppiato(b)) evento(b, BADGE_ITA);
            b = await nuovo.prossimo();
        } else {
            const ordine = _confronta(a, b);
            if (ordine === 0) {
                const prima = _doppiato(a);
                const adesso = _doppiato(b);
                if (prima !== adesso) evento(b, adesso ? BADGE_ITA : null);
                a = await vecchio.prossimo();
                b = await nuovo.prossimo();
            } else if (ordine < 0) {
                if (_doppiato(a)) evento(a, null); // sparito dal nuovo giro
                a = await vecchio.prossimo();
            } else {
                if (_doppiato(b)) evento(b, BADGE_ITA); // apparso in questo giro
                b = await nuovo.prossimo();
            }
        }
    }

    return cambiamenti;
}

/**
 * Righe di un file di annotazioni, **una alla volta**: `for await (const row of streamRows(p))`.
 * Serve a non tenere in memoria 24.000 righe per volta.
 * @param {string} filePath
 */
async function* streamRows(filePath) {
    const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
    });
    for await (const line of rl) {
        yield line;
    }
}

/**
 * Il diff fra il giro precedente e questo.
 *
 * Le righe nuove arrivano in due modi, e il chiamante sceglie: `current` (le righe che ha in mano
 * il writer, ordinate dal merge — è il caso dell'aggancio al giro) oppure `currentPath` (il file
 * appena riscritto). Il file **precedente** invece è sempre un percorso: se non c'è, è il primo
 * giro e il diff è vuoto.
 *
 * @param {object} opts
 * @param {string} [opts.previousPath] file del giro precedente (assente = primo giro)
 * @param {Iterable|AsyncIterable} [opts.current] righe di questo giro, già ordinate
 * @param {string} [opts.currentPath] file di questo giro (se `current` non c'è)
 * @param {(info: object) => void} [opts.onAnomalia] vedi `computeChanges`
 * @param {boolean} [opts.quiet=false] non logga (i test)
 * @returns {Promise<{changes:Array, primoGiro:boolean, diventatiDoppiati:number,
 *                    nonPiuDoppiati:number, cambiati:number, righe:{vecchie:number,nuove:number},
 *                    ordineSospetto:boolean}>}
 */
async function computeDiff(opts = {}) {
    const { previousPath, current, currentPath, onAnomalia, quiet = false } = opts;
    const primoGiro = !previousPath || !fs.existsSync(previousPath);

    const vuoto = {
        changes: [],
        primoGiro,
        diventatiDoppiati: 0,
        nonPiuDoppiati: 0,
        cambiati: 0,
        righe: { vecchie: 0, nuove: 0 },
        ordineSospetto: false
    };

    if (primoGiro) {
        if (!quiet) {
            console.log(`[Diff] primo giro (nessun file precedente${previousPath ? `: ${previousPath}` : ''}): il diff è vuoto, nessun evento.`);
        }
        return vuoto;
    }

    const daFile = !current && currentPath;
    if (daFile && !fs.existsSync(currentPath)) {
        throw new Error(`computeDiff: il file di questo giro non esiste: ${currentPath}`);
    }
    if (!current && !currentPath) {
        throw new Error('computeDiff: servono le righe nuove (current) o il loro file (currentPath)');
    }

    let ordineSospetto = false;
    const segnala = (info) => {
        ordineSospetto = true;
        if (onAnomalia) onAnomalia(info);
        else if (!quiet) console.warn(`[Diff] ${info.file} non ordinato per (tipo, id) (${info.chiave}): il diff potrebbe essere sbagliato.`);
    };

    const conta = (cambi) => {
        const diventatiDoppiati = cambi.filter((c) => c.badge === BADGE_ITA).length;
        return {
            changes: cambi,
            primoGiro: false,
            diventatiDoppiati,
            nonPiuDoppiati: cambi.length - diventatiDoppiati,
            cambiati: cambi.length,
            righe: { vecchie: contatoreRiga, nuove: contatoreRigaNuovo },
            ordineSospetto
        };
    };

    // Contatori di righe lette: servono a distinguere "il file è vuoto" da "non abbiamo letto niente".
    // Restano volutamente greppiabili: il diff vero non deve dipendere dal loro numero.
    let contatoreRiga = 0;
    let contatoreRigaNuovo = 0;

    const contaVecchie = (async function* () {
        for await (const row of streamRows(previousPath)) { contatoreRiga++; yield row; }
    })();
    const sorgenteNuove = current || streamRows(currentPath);
    const contaNuove = (async function* () {
        for await (const row of sorgenteNuove) { contatoreRigaNuovo++; yield row; }
    })();

    const changes = await computeChanges(contaVecchie, contaNuove, { onAnomalia: segnala });
    return conta(changes);
}

/**
 * Scrive l'esito in `ita_annotations.diff.json`, accanto agli altri file, in modo atomico
 * (`.tmp` + `rename`): o il diff vecchio, o quello nuovo, mai un file a metà.
 *
 * Sopra `cap` l'avviso è forte ma **il file si scrive lo stesso**: il numero vero resta scritto
 * (`cambiati`) e marcato (`oltreSoglia`), perché un artefatto che mente sul numero è peggio di un
 * artefatto che ne riporta uno enorme.
 *
 * @param {{changes:Array, primoGiro?:boolean}} esito output di `computeDiff`
 * @param {object} [opts]
 * @param {string} opts.outputPath percorso di `ita_annotations.jsonl` (da cui si ricava il diff)
 * @param {string} [opts.diffPath] percorso esplicito del `.diff.json`
 * @param {string} [opts.generato] timestamp ISO (default adesso)
 * @param {number} [opts.cap] tetto sui cambi (default 5000)
 * @param {boolean} [opts.quiet=false] non logga
 * @returns {Promise<{written:boolean, path:string|null, cambiati:number, oltreSoglia:boolean, avviso:string|null}>}
 */
async function writeDiff(esito = {}, opts = {}) {
    if (!opts.outputPath && !opts.diffPath) {
        throw new Error('writeDiff: serve outputPath (o diffPath)');
    }
    const target = opts.diffPath || diffPathFor(opts.outputPath);
    const changes = Array.isArray(esito.changes) ? esito.changes : [];
    const cap = typeof opts.cap === 'number' ? opts.cap : CAP_CAMBI;

    const diventatiDoppiati = changes.filter((c) => c.badge === BADGE_ITA).length;
    const nonPiuDoppiati = changes.length - diventatiDoppiati;
    const oltreSoglia = changes.length > cap;

    const artefatto = {
        schemaVersion: SCHEMA_VERSION,
        generato: opts.generato || new Date().toISOString(),
        file: path.basename(target),
        primoGiro: esito.primoGiro === true,
        cap,
        oltreSoglia,
        cambiati: changes.length,
        diventatiDoppiati,
        nonPiuDoppiati,
        changes
    };

    if (oltreSoglia) {
        artefatto.avviso = `ATTENZIONE: ${changes.length} cambi in un giro, oltre il tetto di ${cap}. `
            + `Quasi certamente un guasto o un primo giro travestito: il numero sopra è quello reale, non un campione.`;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmpPath = `${target}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(artefatto, null, 1)}\n`, 'utf8');
    fs.renameSync(tmpPath, target); // atomica

    if (!opts.quiet) {
        if (esito.primoGiro) {
            console.log(`[Diff] primo giro: diff scritto vuoto in ${target} (nessun evento).`);
        } else if (oltreSoglia) {
            console.error(`[Diff] ${artefatto.avviso} Scritto comunque in ${target}.`);
        } else {
            console.log(`[Diff] ${changes.length} cambi (diventati doppiati: ${diventatiDoppiati}, non più doppiati: ${nonPiuDoppiati}) -> ${target}`);
        }
    }

    return {
        written: true,
        path: target,
        cambiati: changes.length,
        diventatiDoppiati,
        nonPiuDoppiati,
        oltreSoglia,
        avviso: oltreSoglia ? artefatto.avviso : null
    };
}

/**
 * Il giro completo: calcola il diff e scrive l'artefatto accanto al file delle annotazioni.
 *
 * `previousPath` **non ha un default**: il file di annotazioni viene riscritto a ogni giro, quindi
 * "quello che c'è adesso" è il giro precedente solo *prima* che il writer passi. Chi aggancia questo
 * modulo al giro o chiama `runDiff` prima della scrittura (con `previousPath` = il percorso che
 * verrà sovrascritto), o gli passa uno snapshot già salvato. Il default sarebbe una moneta
 * tirata: nel dubbio è un primo giro, e un primo giro silenzioso è la cosa più economica da fare
 * (nessun evento, nessun poster da rifare) mentre uno sbagliato costa 19.000 poster.
 *
 * @param {object} opts vedi `computeDiff`, più le opzioni di `writeDiff` (`outputPath` obbligatorio)
 */
async function runDiff(opts = {}) {
    if (!opts.outputPath && !opts.diffPath) {
        throw new Error('runDiff: serve outputPath (il percorso di ita_annotations.jsonl)');
    }
    const esito = await computeDiff(opts);
    const scritto = await writeDiff(esito, opts);
    return { ...esito, ...scritto };
}

module.exports = {
    SCHEMA_VERSION,
    DEFAULT_FILENAME,
    CAP_CAMBI,
    BADGE_ITA,
    diffPathFor,
    streamRows,
    computeChanges,
    computeDiff,
    writeDiff,
    runDiff
};