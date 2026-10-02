/**
 * Traduce un evento della coda (`{tipo, id, badge}`) nelle cose che servono per rifare un poster.
 *
 * Il drenatore riceve dalla coda solo `tipo` (`movie`|`tv`), `id` (TMDB, oppure gia' con
 * prefisso `kitsu:` per gli anime) e `badge`. Da qui devono uscire due valori:
 *
 * 1. **l'id ERDB**, che l'evento non contiene e va costruito: `tmdb:movie:<id>`,
 *    `tmdb:tv:<id>`, oppure `kitsu:<id>` (gia' cosi' nell'id degli anime, non va riscritto);
 * 2. **il nome del file**, che NON si riscrive: lo produce il costruttore
 *    (`scripts/erdb-builder/build.js`), ed e' lo stesso nome che chiede la rotta
 *    `/erdb-poster/:file`. Un nome inventato qui produrrebbe un file che la rotta
 *    non chiederebbe mai: poster invisibile, nessun errore da nessuna parte.
 *    Per questo `posterFileName` e `posterUrl` vengono riusati, non reimplementati.
 *
 * Modulo puro: niente I/O, niente rete, niente Redis. Solo funzioni che da una voce
 * in coda ricavano stringhe.
 */

const { posterFileName, posterUrl } = require('../../scripts/erdb-builder/build');

// I soli `tipo` che la coda puo' contenere: 'tv' e tutto il resto? No, solo questi due.
// Qualunque altro valore e' un evento malformato e deve farsi sentire (vedi `erdbIdDaEvento`).
const TIPI_NOTI = new Set(['movie', 'tv']);

/*
 * Il giro INDIETRO (dal nome file all'id ERDB) e' diverso da quello in avanti per una
 * ragione sola: la trasformazione e' lossy. `sanitizeErdbId` (costruttore) scrive i ':'
 * come '-', quindi `tmdb:movie:27205` e `tmdb-movie-27205` finiscono nello stesso file e
 * viceversa: dal nome NON si ricava un id se non riconoscendo le forme note.
 * Percio' qui sotto ci sono solo forme note, niente euristiche: un nome non riconosciuto
 * dà `null` (nessuna cache, si risponde 404), mentre un id sbagliato chiederebbe a ERDB
 * il poster di un titolo DIVERSO e lo metterebbe in cache sotto il nome giusto: un errore
 * che non si vede piu'.
 */

// Le uniche estensioni che la rotta serve: se il nome non ne ha una di queste, non e' un
// poster che la rotta chiederebbe (vedi `CONTENT_TYPES` in `src/api/staticPosters.js`).
const ESTENSIONE_ROTTA = /\.(?:jpg|jpeg|webp)$/i;

// Le due uniche famiglie di nomi note. Il gruppo del badge e' opzionale e ammette solo
// `ITA`: un badge non previsto non viene "indovinato" (vedi nota sui buchi in fondo al file).
const NOME_TMDB = /^tmdb-(movie|tv)-(\d+)(?:_(ITA))?$/;
const NOME_KITSU = /^kitsu-(\d+)(?:_(ITA))?$/;

/**
 * Ricostruisce l'id ERDB di un evento: `tmdb:movie:27205`, `tmdb:tv:1396`, `kitsu:265`.
 *
 * Gli anime arrivano gia' con l'id Kitsu (`kitsu:123`): e' gia' un id ERDB valido,
 * quindi si riusa cosi' com'e' e `tipo` non viene ne' letto ne' fidato.
 *
 * @param {{tipo: string, id: string|number}} evento
 * @returns {string}
 * @throws {Error} se `tipo` non e' noto, o se `id` manca: un evento malformato in
 *   coda produrrebbe un file sbagliato (o nessun file) senza che nessuno se ne accorga.
 */
function erdbIdDaEvento({ tipo, id } = {}) {
    const idTesto = id === undefined || id === null ? '' : String(id).trim();
    if (!idTesto) {
        throw new Error(`evento senza "id" (tipo: ${JSON.stringify(tipo)})`);
    }

    // Gli anime: id gia' in forma ERDB, il prefisso si riconosce da solo.
    if (idTesto.startsWith('kitsu:')) return idTesto;

    if (!TIPI_NOTI.has(tipo)) {
        throw new Error(`tipo sconosciuto nell'evento: ${JSON.stringify(tipo)} (id: ${idTesto})`);
    }

    return `tmdb:${tipo}:${idTesto}`;
}

/**
 * Nome del file del poster, cosi' come lo chiama la rotta `/erdb-poster/:file`.
 * Non lo si riscrive: lo chiede al costruttore, che resta l'unica fonte di verita'.
 * Esempi: `tmdb-movie-27205_ITA.jpg`, `tmdb-movie-27205.jpg`, `kitsu-265.jpg`.
 *
 * @param {{tipo: string, id: string|number, badge?: string}} evento
 * @returns {string}
 */
function nomeFileDaEvento({ tipo, id, badge } = {}) {
    return posterFileName({ erdbId: erdbIdDaEvento({ tipo, id }), badge });
}

/**
 * Giro INDIETRO: dal nome file di un poster all'id ERDB da chiedere a ERDB.
 *
 * Serve a chi deve decidere se un file esiste davvero (la rotta statica risponde 404 se
 * manca, e un 404 puo' voler dire "non e' ancora arrivato", non "non esiste"): dal nome
 * che la rotta ha ricevuto si ricava l'id da chiedere a ERDB.
 *
 * Funzione PURA e TOTALE: non lancia mai. Una rotta non deve poter fallire per una
 * stringa sbagliata: qui la risposta sbagliata è `null` ("non lo so", e la rotta risponde
 * 404 come deve), non un'eccezione. Per questo qui, a differenza di `erdbIdDaEvento`,
 * nessun ingresso fa sollevare: un evento malformato si becca in coda, un nome strano
 * arriva dalla rete.
 *
 * Riconosce SOLO le forme note:
 *   `tmdb-movie-<cifre>[_ITA].jpg`, `tmdb-tv-<cifre>[_ITA].jpg`, `kitsu-<cifre>[_ITA].jpg`
 * (estensione anche `.jpeg`/`.webp`, come accetta la rotta). Tutto il resto -> `null`.
 *
 * @param {string} nomeFile nome grezzo, come arriva alla rotta (`tmdb-movie-27205_ITA.jpg`)
 * @returns {{erdbId: string, badge: string|null}|null} `badge` vale `null` se il nome non
 *   ne porta, altrimenti la stringa del suffisso (`'ITA'`).
 */
function erdbIdDaNomeFile(nomeFile) {
    // La rotta passa sempre una stringa: tutto il resto non e' un nome, e non si indovina.
    if (typeof nomeFile !== 'string' || nomeFile === '') return null;

    const nome = nomeFile.trim();
    if (!nome) return null;

    // Stesse condizioni di `isSafeFileName` nella rotta: nessun nome che attraversa
    // directory o risale. Qui non viene mai usato un nome cosi' (non si tocca il file
    // system), ma un nome che contiene un separatore non e' un nome file conosciuto e
    // restituirci un id sarebbe indovinare.
    if (nome.includes('/') || nome.includes('\\') || nome.includes('..') || nome.includes('\0')) {
        return null;
    }

    const estensione = ESTENSIONE_ROTTA.exec(nome);
    if (!estensione) return null;
    const base = nome.slice(0, nome.length - estensione[0].length);

    const tmdb = NOME_TMDB.exec(base);
    if (tmdb) {
        return { erdbId: `tmdb:${tmdb[1]}:${tmdb[2]}`, badge: tmdb[3] || null };
    }

    const kitsu = NOME_KITSU.exec(base);
    if (kitsu) {
        return { erdbId: `kitsu:${kitsu[1]}`, badge: kitsu[2] || null };
    }

    // Prefisso ignoto (`tmdb-xxx-...`, `anime-...`), id non numerico, nome troncato.
    return null;
}

/*
 * BUCHI NOTI (scelti, non dimenticati): il costruttore puo' produrre anche
 * `tmdb-tv-1399_ENG.jpg` (badge qualunque, vedi `sanitizePart`) e questo inverso NON lo
 * riconosce -> `null`. Motivo: il badge non e' una parte dell'id, e accettarne uno
 * qualsiasi non aggiungerebbe casi utili: se il chiamante ha un badge da richiedere usa
 * quello che gia' conosce. Se un giorno serve, la regola e' una lista chiusa di badge
 * (`ITA`, `ENG`, ...), non un carattere jolly.
 */

/**
 * URL del poster lato ERDB: `{base}/poster/{erdbId}.jpg?badge={badge}`.
 * Serve al drenatore per riscaricare il file quando rifà il poster.
 * Nota: qui l'`erdbId` viaggia col `:` dentro, come nell'app (leciti in un path segment);
 * il nome del file invece è quello sanitizzato.
 *
 * @param {string} base base ERDB (slash finali tolti)
 * @param {{tipo: string, id: string|number, badge?: string}} evento
 * @returns {string}
 */
function urlDaEvento(base, { tipo, id, badge } = {}) {
    return posterUrl(base, { erdbId: erdbIdDaEvento({ tipo, id }), badge });
}

/**
 * Elenco degli id ERDB da rinfrescare per un evento: quello TMDB, piu' quello Kitsu
 * se l'evento e' un anime.
 *
 * Perche' serve un elenco e non un id solo. Gli anime non sono serviti da TMDB ma da
 * Kitsu: il poster nel file system si chiama `kitsu-265.jpg`, e l'evento che arriva
 * dalla coda porta l'id TMDB. Se il drenatore rifacesse solo `tmdb:tv:123`, farebbe un
 * file che la rotta `/erdb-poster/:file` non chiedera' MAI, e il poster vero resterebbe
 * vecchio senza che nessuno se ne accorga. Quindi: entrambi, ognuno col poster giusto.
 *
 * `cercaKitsu(id, tipo)` e' INIETTATA (la mappa la passa chi chiama, vedi
 * `src/data/animeMappingStore.js`: `resolveKitsuMovie` per i film, `resolveKitsu`
 * per le serie) e non viene importata qui: questo modulo resta puro, senza rete ne'
 * database, e i test non dipendono da dati reali. Se non c'e' mappatura (o non c'e'
 * funzione, o la mappa e' rotta) l'elenco ha un elemento solo: il poster TMDB si
 * rifa comunque, perche' un guasto della mappa non deve fermare il drenaggio.
 *
 * @param {{tipo: string, id: string|number, badge?: string}} evento
 * @param {(id: string|number, tipo: string) => (string|number|null|undefined)} [cercaKitsu]
 * @returns {string[]} id ERDB, prima il TMDB, poi il Kitsu (se c'e'). Nessun duplicato.
 * @throws {Error} stessi casi di `erdbIdDaEvento` (tipo sconosciuto, id mancante).
 */
function erdbIdsDaEvento({ tipo, id } = {}, cercaKitsu) {
    const tmdbId = erdbIdDaEvento({ tipo, id });
    const idTesto = String(id).trim();

    // Id gia' in forma Kitsu: e' gia' l'id ERDB giusto, la mappa non serve (e
    // interrogarla con "kitsu:265" produrrebbe solo spazzatura).
    if (idTesto.startsWith('kitsu:')) return [tmdbId];

    let kitsuId = null;
    if (typeof cercaKitsu === 'function') {
        try {
            const trovato = cercaKitsu(idTesto, tipo);
            if (trovato !== null && trovato !== undefined && String(trovato).trim() !== '') {
                const testo = String(trovato).trim();
                // Accetta sia `265` sia `kitsu:265`: il prefisso non deve raddoppiare.
                kitsuId = testo.startsWith('kitsu:') ? testo : `kitsu:${testo}`;
            }
        } catch (err) {
            // Non si propaga: si logga e si va avanti con il solo id TMDB.
            console.warn(`[posterDaEvento] cercaKitsu fallita per ${tipo}:${idTesto}: ${err.message}`);
            kitsuId = null;
        }
    }

    // Nessun duplicato: se le due forme coincidessero, la lista ne ha una sola.
    if (!kitsuId || kitsuId === tmdbId) return [tmdbId];
    return [tmdbId, kitsuId];
}

module.exports = {
    erdbIdDaEvento,
    erdbIdDaNomeFile,
    erdbIdsDaEvento,
    nomeFileDaEvento,
    urlDaEvento
};