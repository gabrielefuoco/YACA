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
 * IL PERCHÉ VIENE FUORI, NON SI RICAVA DA NESSUN LOG: il riepilogo porta anche `fallimenti`,
 * una voce per ogni evento non rifatto, `{tipo, id, erdbId, motivo, dettaglio}`. `motivo` è un
 * **codice corto e stabile** (`http_404`, `non_jpeg`, `timeout`, `rete`, `scrittura`,
 * `cartella`, `risposta_illeggibile`, `corpo_illeggibile`, `tipo_sconosciuto`,
 * `evento_malformato`, `altro`) e `dettaglio` la frase per
 * l'occhio. Il codice è qui, dove i messaggi nascono: ricavarlo a chi legge il journal legava
 * due file a una frase, e se la frase cambiava i motivi finivano tutti in `altro` — in silenzio.
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
 * Un errore che SA perché è successo: il messaggio per l'occhio, il codice per il conto.
 *
 * Il codice è dichiarato qui, sul posto dove il guasto nasce, e non lasciato a chi legge
 * dopo: un messaggio cambiato non deve poter cambiare il nome del motivo nel riepilogo.
 */
function guasto(motivo, messaggio, cause) {
    const err = new Error(messaggio, cause ? { cause } : undefined);
    err.motivo = motivo;
    return err;
}

/**
 * Il codice del motivo: quello dichiarato sull'errore, o quello riconosciuto dal testo.
 *
 * La regex è la **rete di sicurezza** per i guasti che nascono fuori da questo file (la coda
 * degli eventi, per esempio, che è un altro modulo e non ha motivo da dichiarare). Qui sopra
 * ogni errore ha già il suo: se un giorno un messaggio cambia, il codice dichiarato resta
 * quello giusto e la regex non viene neppure consultata.
 *
 * @param {Error|string} causa
 * @returns {string} un codice corto, mai una frase
 */
function classificaMotivo(causa) {
    if (causa && typeof causa === 'object') {
        if (causa.motivo) return String(causa.motivo);
        causa = causa.message || causa;
    }
    const testo = String(causa || '');
    if (/timeout/i.test(testo)) return 'timeout';
    const http = testo.match(/HTTP\s+(\d{3})/i);
    if (http) return `http_${http[1]}`;
    if (/non è un JPEG/i.test(testo)) return 'non_jpeg';
    if (/richiesta fallita|ECONN|fetch failed|network/i.test(testo)) return 'rete';
    if (/tipo sconosciuto/i.test(testo)) return 'tipo_sconosciuto';
    if (/senza "?id"?|non in forma ERDB|id mancante|non riconosciuto/i.test(testo)) return 'evento_malformato';
    return 'altro';
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
        throw guasto('evento_malformato', `id ERDB non riconosciuto: ${JSON.stringify(erdbId)}`);
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
        throw guasto(classificaMotivo(err), `richiesta fallita: ${err && err.message ? err.message : err}`, err);
    }

    if (!risposta || typeof risposta.arrayBuffer !== 'function') {
        throw guasto('risposta_illeggibile', `risposta non leggibile da ${url}`);
    }
    if (risposta.ok === false) {
        throw guasto(`http_${risposta.status}`, `HTTP ${risposta.status} su ${url}`);
    }

    let buffer;
    try {
        buffer = Buffer.from(await risposta.arrayBuffer());
    } catch (err) {
        throw guasto('corpo_illeggibile', `corpo illeggibile: ${err && err.message ? err.message : err}`, err);
    }

    if (!eJpeg(buffer)) {
        const tipo = risposta.headers && typeof risposta.headers.get === 'function'
            ? risposta.headers.get('content-type') : null;
        throw guasto('non_jpeg', `la risposta non è un JPEG (${buffer.length} byte, content-type ${tipo || 'assente'})`);
    }
    return buffer;
}

/** Dopo `ms` la richiesta è un fallimento: un ERDB che non risponde non deve tenere il giro. */
function _conTimeout(richiesta, ms, url) {
    let timer = null;
    const scadenza = new Promise((_, respingi) => {
        timer = setTimeout(() => respingi(guasto('timeout', `timeout dopo ${ms} ms su ${url}`)), ms);
    });
    return Promise.race([richiesta, scadenza]).finally(() => clearTimeout(timer));
}

/**
 * Scrive il poster **sovrascrivendo**, su file temporaneo e poi rinominando: il rename è
 * atomico sulla stessa partizione, quindi la rotta non serve mai mezzo file. Se il rename
 * fallisce il `.tmp` viene rimosso: meglio un file mancante (l'evento verrà ritentato) di un
 * `.tmp` abbandonato che occupa disco e un giorno qualcuno rinomina per sbaglio.
 *
 * Il nome del temporaneo è UNICO per processo e per chiamata (`<file>.<pid>-<n>.tmp`), non un
 * `.tmp` fisso: due scritture dello stesso file che partono insieme (la rotta che rende un
 * poster al volo e il drenatore che lo rifà, o due richieste insieme) con un temporaneo
 * condiviso si ruberebbero il file: la seconda rinomina troverebbe il `.tmp` già sparito
 * (ENOENT) e il suo utente si prenderebbe un 404. Così ognuno scrive il suo e le due rinomine
 * competono per il file finale, che è intero per definizione. Il temporaneo resta un `.tmp`
 * (suffisso finale) se qualcosa va storto, quindi i controlli di igiene lo vedono ancora.
 */
let _temporanei = 0;
async function scrivi(target, buffer) {
    const tmp = `${target}.${process.pid}-${++_temporanei}.tmp`;
    try {
        await fs.promises.writeFile(tmp, buffer);
        await fs.promises.rename(tmp, target);
    } catch (err) {
        try {
            await fs.promises.unlink(tmp);
        } catch (_) { /* non c'era: niente da dire */ }
        throw guasto('scrittura', err && err.message ? err.message : String(err), err);
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
 * @returns {Promise<{presi: number, resi: number, falliti: number,
 *   fallimenti: Array<{tipo: *, id: *, erdbId: string|null, motivo: string, dettaglio: string}>,
 *   note: {take: number, cartella: number, chiusura: number}}>}
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
    // I tre contatori sono quelli di prima (chi li leggeva continua a leggere gli stessi);
    // `fallimenti` dice **perché** e `note` raccoglie i guasti del giro che non sono un
    // poster non rifatto (una coda che non risponde, una cartella inutilizzabile, una
    // chiusura che lancia): anche questi escono in chiaro, perché erano tre righe di log che
    // qualcuno leggeva a mano e che nessuno poteva più contare.
    const riepilogo = {
        presi: 0,
        resi: 0,
        falliti: 0,
        fallimenti: [],
        note: { take: 0, cartella: 0, chiusura: 0 }
    };

    let eventi;
    try {
        eventi = await take(batch);
    } catch (err) {
        // Una coda che non risponde è un giro vuoto, non un incidente: `take` è già pensata per
        // degradare, ma se le funzioni fossero rotte anche i caller devono stare in piedi.
        log.warn(`[DrenaPoster] take fallito: ${err && err.message ? err.message : err}`);
        riepilogo.note.take += 1;
        return riepilogo;
    }
    if (!Array.isArray(eventi)) return riepilogo;
    if (!eventi.length) return riepilogo;

    riepilogo.presi = eventi.length;

    // La cartella si crea solo se c'è qualcosa da scrivere: un giro vuoto non lascia tracce.
    try {
        await fs.promises.mkdir(outDir, { recursive: true });
    } catch (err) {
        const spiegazione = `${err && err.message ? err.message : err}`;
        log.warn(`[DrenaPoster] cartella ${outDir} non utilizzabile: ${spiegazione}`);
        riepilogo.note.cartella += 1;
        for (const evento of eventi) {
            await _chiudi(fail, evento, riepilogo, log);
            riepilogo.fallimenti.push(_voceFallimento(evento, null, 'cartella',
                `cartella ${outDir} non utilizzabile: ${spiegazione}`));
        }
        riepilogo.falliti = eventi.length;
        return riepilogo;
    }

    for (const evento of eventi) {
        let riuscito = true;
        // L'id ERDB che stava fallendo: senza, il perché di un guasto sarebbe "da qualche
        // parte" invece di "questo file" (un evento anime ha due id e fallisce sul secondo).
        let erdbId = null;

        try {
            const ids = erdbIdsDaEvento(evento, cercaKitsu);
            for (const id of ids) {
                erdbId = id;
                const { tipo, id: idErdb, badge } = eventoDaErdbId(id, evento);
                // Il nome e l'URL li decide `posterDaEvento`: qui non si riscrive niente.
                const file = nomeFileDaEvento({ tipo, id: idErdb, badge });
                const url = urlDaEvento(base, { tipo, id: idErdb, badge });
                const buffer = await scarica(url, { fetchImpl, timeoutMs });
                await scrivi(path.join(outDir, file), buffer);
                log.log(`[DrenaPoster] reso ${file}`);
            }
        } catch (err) {
            riuscito = false;
            const dettaglio = err && err.message ? err.message : String(err);
            riepilogo.fallimenti.push(_voceFallimento(evento, erdbId, classificaMotivo(err), dettaglio));
            log.warn(`[DrenaPoster] fallito ${evento && evento.tipo}:${evento && evento.id}: ${dettaglio}`);
        }

        // Chiusura: `done` solo se tutti gli id sono andati, altrimenti `fail` (l'evento resta
        // in coda e viene ritentato).
        if (riuscito) {
            riepilogo.resi += 1;
            await _chiudi(done, evento, riepilogo, log);
        } else {
            riepilogo.falliti += 1;
            await _chiudi(fail, evento, riepilogo, log);
        }
    }

    return riepilogo;
}

/**
 * Una voce di `fallimenti`: **quale** evento, su **quale** id ERDB, e con **quale** motivo.
 *
 * `motivo` è il codice corto (`http_404`, `non_jpeg`, …) e `dettaglio` la frase per l'occhio:
 * chi conta i motivi non deve leggere le frasi, chi li legge non deve contarli a mano.
 */
function _voceFallimento(evento, erdbId, motivo, dettaglio) {
    return {
        tipo: evento ? evento.tipo : null,
        id: evento ? evento.id : null,
        erdbId: erdbId || null,
        motivo,
        dettaglio: dettaglio || String(motivo)
    };
}

/** Chiama `done` o `fail` senza mai propagare: la coda non dovrebbe lanciare, ma se lo fa
 *  l'evento resta in coda e verrà ritentato — meglio un doppione rifatto che un evento perso.
 *  Una chiusura rotta si conta in `note.chiusura`: il file c'è, ma nessuno lo sa chiuso. */
async function _chiudi(chiusura, evento, riepilogo, log) {
    if (typeof chiusura !== 'function') return;
    try {
        await chiusura(evento);
    } catch (err) {
        if (riepilogo && riepilogo.note) riepilogo.note.chiusura += 1;
        log.warn(`[DrenaPoster] chiusura fallita: ${err && err.message ? err.message : err}`);
    }
}

module.exports = {
    drena,
    eJpeg,
    scarica,
    scrivi,
    eventoDaErdbId,
    classificaMotivo,
    DEFAULT_BATCH,
    DEFAULT_TIMEOUT_MS
};