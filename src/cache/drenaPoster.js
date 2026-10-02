/**
 * drenaPoster.js — il giro di scarico della coda dei poster.
 *
 * PERCHÉ ESISTE: i poster composti sono file statici serviti da `/erdb-poster/<file>`
 * (`src/api/staticPosters.js`). Finché il titolo non cambia, quel file va bene per mesi. Ma
 * quando un titolo diventa doppiato, o esce un episodio, quel file è vecchio. Il diff mette
 * l'evento in coda (`src/cache/codaEventi.js`) e questo modulo è la metà che beve la coda e
 * rifà i file, uno alla volta.
 *
 * **TUTTO INIETTATO.** Questo file non importa la coda, né Redis, né `fetch`: `take`, `done`,
 * `fail`, `cercaKitsu`, `base`, `outDir`, `fetchImpl` e `batch` arrivano da chi chiama. Così i
 * test girano con coda e `fetch` finti, senza rete e senza Redis, e il chiamante (lo script
 * `scripts/drena-coda-poster.js`) è l'unico che sa da quale parte sono la coda e `getCacheDir()`.
 *
 * IL FORMATO È NEGOZIATO, E SI VERIFICA: l'istanza è patchata e sceglie WebP o JPEG in base ad
 * `Accept`. Qui si dichiara `image/jpeg` e poi si guarda il magic `ff d8` con i byte: un WebP
 * chiamato `.jpg` è un guasto, non un dettaglio, e senza il controllo finirebbe in cache e in
 * pagina (e la rotta servirebbe a un browser che lo opening lo rifiuta).
 *
 * IL FILE ESISTE GIÀ: a differenza del giro grosso (`scripts/erdb-builder/build.js`), qui si
 * **sovrascrive**: il file c'è proprio perché il poster è cambiato. Si scrive su `.tmp` e poi si
 * rinomina, così la rotta non vede mai mezzo file; e se il rename fallisce il `.tmp` non resta
 * in giro (un file orfano non è innocuo: occupa spazio e qualcuno, un giorno, lo rinomina).
 *
 * **NON LANCIA MAI.** Gira dentro un timer: un'eccezione non gestita uccide il processo e nessuno
 * se ne accorge. Ogni evento è dentro un `try`, ogni guasto è un `fail` (l'evento resta in coda e
 * la coda lo scarta da sola dopo 5 tentativi), e anche `take`/`done`/`fail` hanno il loro: una
 * coda che lancia non deve trasformare un guasto in un'eccezione non gestita.
 *
 * UN EVENTO È CHIUSO O NON LO È: `done` solo se **tutti** gli id dell'evento sono finiti a
 * bene. Con `erdbIdsDaEvento` un evento anime ha due id (TMDB e Kitsu) e quindi due file: se il
 * secondo fallisce il primo è già a posto, ma l'evento torna al giro dopo e riscrive il primo
 * (riscrivere un file giusto non costa niente, lasciare metà evento chiuso costa un poster
 * vecchio per sempre).
 */

const fs = require('fs');
const path = require('path');
const { erdbIdsDaEvento, nomeFileDaEvento, urlDaEvento } = require('./posterDaEvento');

// Quanti eventi per giro se il chiamante non dice nulla. La coda cresce di 10-50 voci al giorno:
// un lotto piccolo la svuota in qualche giorno e resta una richiesta alla volta, quindi un
// errore non si porta dietro un lotto intero.
const DEFAULT_BATCH = 10;

// Un poster non ci mette più di qualche secondo: dopo 20 s si passa oltre, altrimenti un ERDB che
// accetta la connessione e non risponde bloccherebbe il lotto (e il timer con lui, per sempre).
// `0` disattiva il timeout (per test e per un chiamante che ha già il suo).
const DEFAULT_TIMEOUT_MS = 20000;

/**
 * I byte sono un JPEG? Magic `ff d8`, e nient'altro.
 * Non si riusa `isUsableImage` del costruttore: quella accetta qualunque `image/…`, quindi anche
 * il WebP che l'istanza non patchata serve a chi non dichiara niente — esattamente il guasto da
 * cui la patch esce. Qui la risposta deve dimostrarlo con i byte, non con l'intestazione.
 */
function eJpeg(buffer) {
    return Buffer.isBuffer(buffer) && buffer.length >= 2 &&
        buffer[0] === 0xff && buffer[1] === 0xd8;
}

/**
 * Il `{tipo, id}` da cui ricavare nome file e URL di un id ERDB dell'elenco.
 *
 * `erdbIdsDaEvento` restituisce id già in forma ERDB (`tmdb:movie:265`, `kitsu:265`), mentre
 * `nomeFileDaEvento`/`urlDaEvento` vogliono `{tipo, id, badge}`. Si torna indietro senza
 * ricostruire le stringhe a mano: nome e URL li decide `posterDaEvento` (cioè il costruttore),
 * qui si ricostruisce solo l'input.
 */
function eventoDaErdbId(erdbId, evento) {
    const testo = String(erdbId || '').trim();
    const badge = evento && evento.badge !== undefined ? evento.badge : null;

    // Id già in forma Kitsu: `erdbIdDaEvento` lo riusa cosi' com'e' e il `tipo` non conta.
    if (testo.startsWith('kitsu:')) return { tipo: evento && evento.tipo, id: testo, badge };

    const parti = testo.split(':');   // tmdb:<tipo>:<id>
    if (parti.length !== 3 || parti[0] !== 'tmdb' || !parti[1] || !parti[2]) {
        throw new Error(`id ERDB non riconosciuto: ${JSON.stringify(erdbId)}`);
    }
    return { tipo: parti[1], id: parti[2], badge };
}

/**
 * Scarica un poster dichiarando `image/jpeg`, e lo verifica con i byte.
 * @throws {Error} rete, HTTP diverso da 2xx, risposta che non è un JPEG: sono tutti motivi di
 *   `fail` per l'evento, non eccezioni da propagare.
 */
async function scarica(url, { fetchImpl, timeoutMs }) {
    const opzioni = { headers: { Accept: 'image/jpeg' } };

    let risposta;
    try {
        // Il timeout è una `Promise.race`, non un `AbortController`: se la richiesta non
        // risponde il giro va avanti (e l'evento è un `fail`), ma la richiesta resta appesa
        // fino a quando muore da sola. Meglio una promessa pendente che un timer bloccato.
        const richiesta = Promise.resolve().then(() => fetchImpl(url, opzioni));
        risposta = timeoutMs > 0 ? await _conTimeout(richiesta, timeoutMs, url) : await richiesta;
    } catch (err) {
        throw new Error(`richiesta fallita: ${err && err.message ? err.message : err}`, { cause: err });
    }

    if (!risposta || typeof risposta.arrayBuffer !== 'function') {
        throw new Error(`risposta non leggibile da ${url}`);
    }
    if (risposta.ok === false) {
        throw new Error(`HTTP ${risposta.status} su ${url}`);
    }

    let buffer;
    try {
        buffer = Buffer.from(await risposta.arrayBuffer());
    } catch (err) {
        throw new Error(`corpo illeggibile: ${err && err.message ? err.message : err}`, { cause: err });
    }

    if (!eJpeg(buffer)) {
        const tipo = risposta.headers && typeof risposta.headers.get === 'function'
            ? risposta.headers.get('content-type') : null;
        throw new Error(`la risposta non è un JPEG (${buffer.length} byte, content-type ${tipo || 'assente'})`);
    }
    return buffer;
}

/** Dopo `ms` la richiesta è un fallimento: un ERDB che non risponde non deve tenere il giro. */
function _conTimeout(richiesta, ms, url) {
    let timer = null;
    const scadenza = new Promise((_, respingi) => {
        timer = setTimeout(() => respingi(new Error(`timeout dopo ${ms} ms su ${url}`)), ms);
    });
    return Promise.race([richiesta, scadenza]).finally(() => clearTimeout(timer));
}

/**
 * Scrive il poster **sovrascrivendo**, su file temporaneo e poi rinominando: il rename è
 * atomico sulla stessa partizione, quindi la rotta non serve mai mezzo file. Se il rename
 * fallisce il `.tmp` viene rimosso: meglio un file mancante (l'evento verrà ritentato) di un
 * `.tmp` abbandonato che occupa disco e un giorno qualcuno rinomina per sbaglio.
 */
async function scrivi(target, buffer) {
    const tmp = `${target}.tmp`;
    try {
        await fs.promises.writeFile(tmp, buffer);
        await fs.promises.rename(tmp, target);
    } catch (err) {
        try {
            await fs.promises.unlink(tmp);
        } catch (_) { /* non c'era: niente da dire */ }
        throw err;
    }
}

/**
 * Un giro di scarico: prende un lotto, rifà i poster, chiude quello che è riuscito.
 *
 * Non lancia mai, per nessun motivo: `take` che fallisce dà un giro vuoto, un evento che
 * fallisce è un `fail`, e un `done`/`fail` che fallisce non impedisce di andare avanti con gli
 * altri eventi del lotto.
 *
 * @param {object}   [opzioni]
 * @param {Function} [opzioni.take]        `take(n)` -> eventi `{tipo, id, badge}` (non li toglie)
 * @param {Function} [opzioni.done]        `done(evento)`: chiude l'evento
 * @param {Function} [opzioni.fail]        `fail(evento)`: l'evento resta in coda
 * @param {Function} [opzioni.cercaKitsu]  `(id, tipo) -> id Kitsu | null` (di norma
 *   `animeMappingStore.resolveKitsuDaTmdbId`)
 * @param {string}   [opzioni.base]        base ERDB, col token
 * @param {string}   [opzioni.outDir]      cartella dei poster (quella che serve la rotta)
 * @param {Function} [opzioni.fetchImpl]   `fetch` iniettabile (default: quella di Node)
 * @param {number}   [opzioni.batch]       quanti eventi prendere (default 10)
 * @param {number}   [opzioni.timeoutMs]   timeout per richiesta (default 20000, `0` = nessuno)
 * @param {object}   [opzioni.log]         logger (default `console`)
 * @returns {Promise<{presi: number, resi: number, falliti: number}>}
 */
async function drena({
    take,
    done,
    fail,
    cercaKitsu = null,
    base,
    outDir,
    fetchImpl = globalThis.fetch,
    batch = DEFAULT_BATCH,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    log = console
} = {}) {
    const riepilogo = { presi: 0, resi: 0, falliti: 0 };

    let eventi;
    try {
        eventi = await take(batch);
    } catch (err) {
        // Una coda che non risponde è un giro vuoto, non un incidente: `take` è già pensata per
        // degradare, ma se le funzioni fossero rotte anche i caller devono stare in piedi.
        log.warn(`[DrenaPoster] take fallito: ${err && err.message ? err.message : err}`);
        return riepilogo;
    }
    if (!Array.isArray(eventi)) return riepilogo;
    if (!eventi.length) return riepilogo;

    riepilogo.presi = eventi.length;

    // La cartella si crea solo se c'è qualcosa da scrivere: un giro vuoto non lascia tracce.
    try {
        await fs.promises.mkdir(outDir, { recursive: true });
    } catch (err) {
        log.warn(`[DrenaPoster] cartella ${outDir} non utilizzabile: ${err && err.message ? err.message : err}`);
        for (const evento of eventi) await _chiudi(fail, evento, log);
        riepilogo.falliti = eventi.length;
        return riepilogo;
    }

    for (const evento of eventi) {
        let riuscito = true;
        let primoMotivo;

        try {
            const ids = erdbIdsDaEvento(evento, cercaKitsu);
            for (const erdbId of ids) {
                const { tipo, id, badge } = eventoDaErdbId(erdbId, evento);
                // Il nome e l'URL li decide `posterDaEvento`: qui non si riscrive niente.
                const file = nomeFileDaEvento({ tipo, id, badge });
                const url = urlDaEvento(base, { tipo, id, badge });
                const buffer = await scarica(url, { fetchImpl, timeoutMs });
                await scrivi(path.join(outDir, file), buffer);
                log.log(`[DrenaPoster] reso ${file}`);
            }
        } catch (err) {
            riuscito = false;
            primoMotivo = err && err.message ? err.message : String(err);
            log.warn(`[DrenaPoster] fallito ${evento && evento.tipo}:${evento && evento.id}: ${primoMotivo}`);
        }

        // Chiusura: `done` solo se tutti gli id sono andati, altrimenti `fail` (l'evento resta
        // in coda e viene ritentato).
        if (riuscito) {
            riepilogo.resi += 1;
            await _chiudi(done, evento, log);
        } else {
            riepilogo.falliti += 1;
            await _chiudi(fail, evento, log);
        }
    }

    return riepilogo;
}

/** Chiama `done` o `fail` senza mai propagare: la coda non dovrebbe lanciare, ma se lo fa
 *  l'evento resta in coda e verrà ritentato — meglio un doppione rifatto che un evento perso. */
async function _chiudi(chiusura, evento, log) {
    if (typeof chiusura !== 'function') return;
    try {
        await chiusura(evento);
    } catch (err) {
        log.warn(`[DrenaPoster] chiusura fallita: ${err && err.message ? err.message : err}`);
    }
}

module.exports = { drena, eJpeg, scarica, scrivi, eventoDaErdbId, DEFAULT_BATCH, DEFAULT_TIMEOUT_MS };