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

module.exports = {
    erdbIdDaEvento,
    nomeFileDaEvento,
    urlDaEvento
};