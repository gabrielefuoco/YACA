/**
 * Versione del badge disegnato dalla rotta `/images/poster/...`.
 *
 * Vive in un modulo suo perché ha DUE lettori: il formatter, che la scrive nel percorso
 * dell'URL composto (`StremioFormatter`), e il refresh al sync, che la riporta a quella
 * corrente per gli item che Stremio ha in libreria con una versione vecchia
 * (`src/utils/libraryPosterRefresh.js`). Due copie della stessa costante divergerebbero
 * in silenzio, e il refresh riallineerebbe i poster a un numero che non esiste più.
 *
 * Resta un numero scritto a mano (decisione 3 del ticket 30: diventerà un valore derivato
 * dal contenuto nella sessione che tocca la rotta): qui è solo l'unica fonte di verità.
 */
const BADGE_IMG_VERSION = 24;

module.exports = { BADGE_IMG_VERSION };
