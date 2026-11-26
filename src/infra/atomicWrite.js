const fs = require('fs');
const path = require('path');

/**
 * Scrittura atomica di un file piccolo: si scrive su un temporaneo **unico** e si rinomina sopra.
 *
 * Perché esiste: nel repo c'erano cinque copie di questo schema, ognuna con la sua gestione degli
 * errori, e due usavano un `.tmp` dal nome fisso — quindi due processi che scrivono lo stesso file
 * (il timer e un giro a mano, il drenatore e un prefill) si sovrascrivevano il temporaneo a vicenda.
 * Il nome qui porta pid e contatore: due scrittori non si incontrano mai.
 *
 * Il retry su `EPERM`/`EBUSY`/`EACCES` serve a Windows, dove `rename` fallisce se l'antivirus o un
 * altro handle tiene aperto il file per qualche millisecondo. Su Linux non scatta mai.
 *
 * NON è per i file prodotti da DuckDB (`COPY ... TO`): quelli li scrive il motore, e il "rinnovo"
 * è un altro problema (vedi `tier2.js`/`convert_to_parquet.js`).
 */

let contatore = 0;

function nomeTemporaneo(target) {
    contatore += 1;
    return `${target}.${process.pid}-${Date.now()}-${contatore}.tmp`;
}

const CODICI_DA_RITENTARE = new Set(['EPERM', 'EBUSY', 'EACCES']);

function rinominaSync(tmp, target, tentativi = 6) {
    for (let i = 0; i < tentativi; i++) {
        try {
            fs.renameSync(tmp, target);
            return;
        } catch (err) {
            if (!CODICI_DA_RITENTARE.has(err.code) || i === tentativi - 1) throw err;
            const attesa = Math.min(25 * 2 ** i, 500);
            const fine = Date.now() + attesa;
            while (Date.now() < fine) { /* attesa occupata: questo helper è sincrono per scelta */ }
        }
    }
}

async function rinominaAsync(tmp, target, tentativi = 6) {
    for (let i = 0; i < tentativi; i++) {
        try {
            await fs.promises.rename(tmp, target);
            return;
        } catch (err) {
            if (!CODICI_DA_RITENTARE.has(err.code) || i === tentativi - 1) throw err;
            await new Promise((r) => setTimeout(r, Math.min(25 * 2 ** i, 500)));
        }
    }
}

/**
 * @param {string} target percorso finale
 * @param {string|Buffer} data contenuto (stringa o buffer: un Buffer non viene ricodificato)
 * @param {{ mkdir?: boolean }} [options] `mkdir: false` per non creare la cartella
 */
function scriviAtomicoSync(target, data, options = {}) {
    const tmp = nomeTemporaneo(target);
    try {
        if (options.mkdir !== false) fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(tmp, data);
        rinominaSync(tmp, target);
    } catch (err) {
        try { fs.unlinkSync(tmp); } catch (_) { /* il temporaneo non è mai esistito */ }
        throw err;
    }
}

async function scriviAtomico(target, data, options = {}) {
    const tmp = nomeTemporaneo(target);
    try {
        if (options.mkdir !== false) await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(tmp, data);
        await rinominaAsync(tmp, target);
    } catch (err) {
        try { await fs.promises.unlink(tmp); } catch (_) { /* idem */ }
        throw err;
    }
}

module.exports = { scriviAtomicoSync, scriviAtomico };
