const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { erdbIdDaNomeFile, eventoDaNomeFile } = require('../cache/posterDaEvento');
const { posterUrl } = require('../../scripts/erdb-builder/build');
const { scarica, scrivi } = require('../cache/drenaPoster');

// Cartella dei poster già composti: in produzione è un volume montato in /data/erdb-cache,
// in sviluppo/test la si punta altrove con ERDB_CACHE_DIR.
const DEFAULT_CACHE_DIR = '/data/erdb-cache';

// I file serviti sono immutabili (produotti altrove e copiati sul server): 24 ore va bene.
// Il 404 invece dura pochi minuti, così se il poster arriva dopo compare subito.
const CACHE_CONTROL_HIT = 'public, max-age=86400';
const CACHE_CONTROL_MISS = 'public, max-age=300';

// Uniche estensioni servite: sono le stesse con cui vengono prodotti i poster.
const CONTENT_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
};

// Unica fonte di verità sulla cartella dei poster: la riusa anche il drenatore, così i due
// non possono divergere (se divergessero i file prodotti non sarebbero mai serviti).
const getCacheDir = () => process.env.ERDB_CACHE_DIR || DEFAULT_CACHE_DIR;

// Il parametro della rotta arriva già decodificato (`%2e%2e%2f` è già `../`), quindi qui si
// ragiona sul nome "grezzo": nessun separatore, nessun risalimento, nessun byte null.
const isSafeFileName = (name) => {
    if (typeof name !== 'string' || name.length === 0) return false;
    if (name.includes('/') || name.includes('\\')) return false;
    if (name.includes('..')) return false;
    if (name.includes('\0')) return false;
    return true;
};

// Difesa in profondità: anche con un nome "pulito" (p.es. `C:foo` su Windows) il percorso
// risolto deve restare dentro la cartella, o non viene servito.
const resolveInsideCacheDir = (name) => {
    const base = path.resolve(getCacheDir());
    const resolved = path.resolve(base, name);
    if (!resolved.startsWith(base + path.sep)) return null;
    return resolved;
};

const sendNotFound = (res) => {
    res.setHeader('Cache-Control', CACHE_CONTROL_MISS);
    return res.status(404).json({ error: 'Poster non trovato' });
};

/*
 * TETTO DI TEMPO PER LA RICHIESTA A ERDB.
 *
 * Il drenatore può aspettare 20 s (`DEFAULT_TIMEOUT_MS` in `drenaPoster.js`): gira ogni 10
 * minuti e un poster che arriva tardi è comunque arrivato in tempo. Qui no: sotto questa
 * richiesta c'è una persona che aspetta un'immagine, e 20 s di pagina bianca sono un guasto
 * che l'utente vede. Dopo 5 s si risponde 404 come oggi, e il drenatore farà il suo giro più
 * tardi senza che nessuno resti appeso.
 */
const TIMEOUT_ERDB_MS = 5000;

/** Il file c'è davvero ed è un file? Una cartella che non esiste non è un errore, è un no. */
const filePresente = (filePath) => {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
};

/**
 * Mette l'evento in coda perché il drenatore (`scripts/drena-coda-poster.js`, ogni 10 minuti)
 * renda il poster più tardi, con i suoi 20 s di tempo.
 *
 * PERCHÉ: il tetto di 5 s di questa rotta è più corto del render a freddo di un anime
 * (8,6-11,8 s misurati: Jikan è irraggiungibile dal mate ed ERDB ritenta 4 volte). Quindi
 * il caso NON è raro: sono decine di id esposti (ticket 10 di poster-erdb), e senza questa
 * push nessuno lo richiede e il 404 resta 404 per sempre — il file che nessuno produce e
 * nessuno chiede. Con la push la prima richiesta risponde come prima e la seconda arriva
 * dalla cache.
 *
 * NON SI ASPETTA NESSUNO: la `push` è lanciata e dimenticata, con il suo `catch`. Sotto
 * questa rotta c'è una persona che aspetta un'immagine: un guasto della coda (Redis giù,
 * una `push` rotta) deve restare un guasto della coda, non un 500 e non dieci secondi di
 * pagina bianca. Per questo anche il `require` è pigro: `codaEventi` tira dentro il client
 * Redis, e una rotta che serve file statici non deve aprire un socket solo perché in quel
 * momento non è arrivato un byte.
 *
 * LA DEDUPLICA È DELLA CODA (`tipo|id` già in attesa ⇒ niente): qui non c'è nessun memo
 * e nessun file di stato. Un utente che ricarica una pagina piena di 404 può spingere
 * mille volte lo stesso evento: la coda ne mette uno, e gli altri sono `false`.
 *
 * Il nome che non è una forma nota non produce nessun evento (`eventoDaNomeFile` → `null`):
 * non c'è niente da chiedere, e inventare un id produrrebbe un file che nessuno cerca.
 */
const mettiInCoda = (fileName) => {
    const evento = eventoDaNomeFile(fileName);
    if (!evento) return;
    const chiave = `${evento.tipo}|${evento.id}`;

    try {
        // `require` pigro, dentro il `try`: se il modulo non si carica è un "non posso",
        // non un guasto che deve uscire dalla rotta.
        const coda = require('../cache/codaEventi');
        Promise.resolve(coda.push(evento))
            .then((accodato) => {
                // Solo quando è entrato davvero: se era già in attesa è idempotenza, e
                // una riga per ogni ricarica di pagina riempirebbe il journal di rumore.
                if (accodato) console.log(`[StaticPosters] in coda per il drenatore: ${chiave} (${fileName})`);
            })
            .catch((err) => {
                console.warn(`[StaticPosters] evento ${chiave} non accodato: ${err && err.message ? err.message : err}`);
            });
    } catch (err) {
        console.warn(`[StaticPosters] coda eventi non raggiungibile per ${fileName}: ${err && err.message ? err.message : err}`);
    }
};

/**
 * Il file non è in cartella: lo si chiede all'istanza ERDB locale e lo si scrive.
 *
 * PERCHÉ: la cartella si riempie con un giro grosso fatto una volta (fuori, su un'altra
 * macchina) e poi solo col drenatore (ogni 10 minuti). Quindi un titolo nuovo — o uno dei
 * pochi che il giro grosso non è riuscito a rendere — resterebbe un 404 fino al giro
 * successivo. Chiedendolo qui il poster arriva subito e la cache si riempie da sola.
 *
 * Il download e la verifica "è un JPEG con i byte" sono quelli del drenatore (`scarica`,
 * `drenaPoster.js`): due modi di scaricare lo stesso file che possono divergere sono due
 * modi in cui un WebP finisce chiamato `.jpg`. Idem la scrittura atomica (`scrivi`): la
 * rotta non deve mai vedere mezzo file, e con la scrittura in due tempi due richieste
 * contemporanee dello stesso poster sono innocue (non serve un lucchetto).
 *
 * **NON LANCIA MAI e non risponde mai**: qualunque cosa vada storto (istanza muta, errore,
 * risposta che non è un JPEG, scrittura impossibile) il risultato è `false` e la rotta
 * risponde 404 come prima. Una rotta non deve poter fallire per una rete che non risponde.
 *
 * E quando il risultato è `false` per una richiesta **partita** l'evento va in coda
 * (`mettiInCoda`): il 404 che risponde all'utente resta quello di oggi, ma il file
 * adesso è nella lista di chi dovrà produrlo. I due rientri anticipati (`base` vuota,
 * nome non riconosciuto) non accodano niente: a quel punto non è mancato un render, è
 * mancata la configurazione, e accodare un id che nessuno ha chiesto sarebbe spazzatura.
 *
 * @returns {Promise<boolean>} `true` se il file è stato scritto in cartella.
 */
const chiediPosterAErdb = async (fileName, filePath) => {
    // Senza base non c'è nessuna istanza da chiedere: il comportamento resta quello di oggi
    // (404), che è anche quello di sviluppo e dei test.
    const base = String(process.env.ERDB_LOCAL_BASE || '').trim();
    if (!base) return false;

    // Giro indietro nome -> id ERDB. Se il nome non è una forma nota non si indovina:
    // un id sbagliato chiederebbe a ERDB il poster di un titolo DIVERSO e lo metterebbe in
    // cache sotto il nome giusto: un errore che non si vede più.
    const riconosciuto = erdbIdDaNomeFile(fileName);
    if (!riconosciuto) return false;

    // L'indirizzo lo costruisce il costruttore (`?badge=` incluso): qui non si riscrive.
    const url = posterUrl(base, riconosciuto);

    let buffer;
    try {
        buffer = await scarica(url, { fetchImpl: globalThis.fetch, timeoutMs: TIMEOUT_ERDB_MS });
    } catch (err) {
        console.warn(`[StaticPosters] ERDB non ha dato il poster di ${fileName}: ${err && err.message ? err.message : err}`);
        mettiInCoda(fileName);
        return false;
    }

    try {
        await scrivi(filePath, buffer);
    } catch (err) {
        // `scrivi` ha già tolto il temporaneo: in cartella non resta niente.
        console.warn(`[StaticPosters] scrittura fallita per ${fileName}: ${err && err.message ? err.message : err}`);
        // Il render è riuscito ma il file non c'è: per l'utente è lo stesso 404, quindi
        // lo stesso evento da rendere più tardi (stavolta con ERDB già caldo).
        mettiInCoda(fileName);
        return false;
    }

    console.log(`[StaticPosters] reso al volo da ERDB: ${fileName}`);
    return true;
};

router.get('/erdb-poster/:file', (req, res) => {
    const fileName = req.params.file;

    if (!isSafeFileName(fileName)) {
        console.warn(`[StaticPosters] Nome file rifiutato: ${fileName}`);
        return sendNotFound(res);
    }

    // Estensioni diverse da jpg/jpeg/webp non sono poster: nessun content-type da dichiarare.
    const contentType = CONTENT_TYPES[path.extname(fileName).toLowerCase()];
    if (!contentType) return sendNotFound(res);

    const filePath = resolveInsideCacheDir(fileName);
    if (!filePath) {
        console.warn(`[StaticPosters] Percorso fuori dalla cartella, rifiutato: ${fileName}`);
        return sendNotFound(res);
    }

    // Il file può non esserci, e la cartella può non esistere (o non essere ancora montata):
    // nessuna delle due è un errore, è un 404... se ERDB è raggiungibile, prima un tentativo.
    const chiedi = async () => {
        let reso;
        try {
            reso = await chiediPosterAErdb(fileName, filePath);
        } catch (err) {
            // Difesa in profondità: `chiediPosterAErdb` non lancia, ma una rotta che butta
            // un'eccezione su una rete che non risponde è un guasto nuovo.
            console.warn(`[StaticPosters] richiesta a ERDB fallita per ${fileName}: ${err && err.message ? err.message : err}`);
            reso = false;
        }
        // Se il file ora c'è lo si serve da disco (stessi header di un file già presente:
        // il `Cache-Control` è quello da HIT perché il file è in cartella, ora).
        // Se ERDB non ha risposto, è il 404 di prima: la rotta non serve mai mezzo poster.
        return reso ? inviaFile(res, filePath, contentType) : sendNotFound(res);
    };

    if (!filePresente(filePath)) return chiedi();

    return inviaFile(res, filePath, contentType);
});

/**
 * Serve il file dalla cartella con il content-type già deciso.
 * Il `Cache-Control` è quello da HIT anche per il file appena reso al volo: il file c'è, e
 * da questo momento in poi è un file in cartella come gli altri.
 */
const inviaFile = (res, filePath, contentType) => {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', CACHE_CONTROL_HIT);
    return res.sendFile(filePath, { cacheControl: false, dotfiles: 'deny' }, (err) => {
        // Il file può sparire tra il controllo e l'invio: in quel caso 404, non una mezza risposta.
        if (err && !res.headersSent) sendNotFound(res);
    });
};

/**
 * Registra la rotta GET /erdb-poster/:file sull'app Express.
 * Se il file non è in cartella e c'è `ERDB_LOCAL_BASE`, il poster viene chiesto all'istanza
 * ERDB locale e scritto in cartella prima di essere servito.
 * I poster arrivano già composti da fuori e vengono letti dalla cartella indicata da
 * process.env.ERDB_CACHE_DIR (default /data/erdb-cache).
 */
const registerStaticPostersRoute = (app) => {
    app.use(router);
    return router;
};

module.exports = registerStaticPostersRoute;
module.exports.registerStaticPostersRoute = registerStaticPostersRoute;
module.exports.getCacheDir = getCacheDir;
module.exports.DEFAULT_CACHE_DIR = DEFAULT_CACHE_DIR;
