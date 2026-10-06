/**
 * libraryPosterRefresh.js — riallinea il poster di un item di libreria che è già un URL
 * costruito da YACA.
 *
 * PERCHÉ ESISTE. Per gli item "composti" il poster memorizzato in `UserLibraryItem` non è
 * un URL di Stremio: è l'URL che il formatter ha costruito quando ha servito il catalogo,
 * del tipo
 *
 *   https://<host>/images/poster/<tipo>/<id>/<episodio>/<versione>?original=...&fallback=...
 *
 * Stremio si ritrova quell'URL nella propria libreria (gliel'ha messo il convertitore) e
 * il sync lo ricopia verbatim: copiare e basta NON cambierebbe niente, perché sarebbe la
 * stessa URL vecchia con la stessa versione. Per questo qui l'URL viene RICALCOLATO:
 *
 * - la versione nel percorso viene riportata a quella corrente (`BADGE_IMG_VERSION`):
 *   è il segmento che Stremio usa come chiave di cache, quindi un item fermo a `/ITA/23`
 *   riprende l'immagine al giro dopo;
 * - le sorgenti annidate (`original`/`fallback` che sono a loro volta un composto di YACA,
 *   residuo di giri precedenti) vengono risolte fino all'immagine vera: senza questo la
 *   rotta chiederebbe a sé stessa un'immagine, e un `original` con un host interno
 *   (`localhost:7000`) non verrebbe mai servito;
 * - i composti statici `/erdb-poster/<file>` riprendono come parametro di cache-busting
 *   l'`mtime` del file: quando il drenatore riscrive il poster, il giro successivo cambia
 *   l'URL e i client lo riscaricano, invece di restare sul file vecchio per sempre.
 *
 * La funzione non fa rete: al più legge `stat` di un file locale. Un poster che non è un
 * composto di YACA (TMDB, Kitsu, URL custom dell'utente) resta identico.
 */

const fs = require('fs');
const path = require('path');

const { BADGE_IMG_VERSION } = require('../catalog/formatters/posterBadgeVersion');
const { erdbIdDaNomeFile } = require('../cache/posterDaEvento');
const { posterFileName } = require('../../scripts/erdb-builder/build');
const { normalizeLegacyPosterHost } = require('./libraryIdentity');

const COMPOSED_PREFIX = '/images/poster/';
const STATIC_PREFIX = '/erdb-poster/';
// Un annidamento oltre questo tetto è un dato rotto: si smette di scendere e si tiene
// l'ultimo valore leggibile, invece di ricorrere all'infinito.
const MAX_UNWRAP_DEPTH = 3;

/**
 * Interpreta un poster come URL. Gli URL relativi (`/images/...`) sono ammessi: la base
 * è finta e non finisce mai nell'output (vedi `isAbsolute`).
 *
 * @param {string} poster
 * @returns {{ url: URL, isAbsolute: boolean } | null}
 */
function parsePosterUrl(poster) {
    if (typeof poster !== 'string') return null;
    const value = poster.trim();
    if (!value) return null;

    const isAbsolute = /^https?:\/\//i.test(value);
    try {
        return { url: new URL(value, isAbsolute ? undefined : 'http://yaca.invalid'), isAbsolute };
    } catch (_err) {
        return null;
    }
}

/**
 * Se `value` è a sua volta un poster composto da YACA, scende nella sua sorgente
 * (`original`) fino all'immagine vera. Altrimenti lo restituisce com'è.
 *
 * @param {string} value
 * @param {number} [depth]
 * @returns {string}
 */
function unwrapComposedSource(value, depth = 0) {
    if (typeof value !== 'string' || !value.trim() || depth >= MAX_UNWRAP_DEPTH) return value;

    const parsed = parsePosterUrl(value);
    if (!parsed || !parsed.url.pathname.startsWith(COMPOSED_PREFIX)) return value;

    const inner = parsed.url.searchParams.get('original');
    if (!inner || inner === value) return value;
    return unwrapComposedSource(inner, depth + 1);
}

/**
 * Riallinea un URL composto `/images/poster/...`: versione corrente nel percorso e
 * sorgenti annidate risolte. Se non c'è niente da cambiare restituisce la stringa
 * originale, così il refresh è idempotente e il sync non riscrive URL identiche.
 *
 * @param {string} poster
 * @param {{ badgeVersion?: number, hostUrl?: string }} [options]
 * @returns {string}
 */
function refreshComposedPoster(poster, options = {}) {
    const parsed = parsePosterUrl(poster);
    if (!parsed || !parsed.url.pathname.startsWith(COMPOSED_PREFIX)) return poster;

    const { url, isAbsolute } = parsed;
    let changed = false;

    for (const key of ['original', 'fallback']) {
        const current = url.searchParams.get(key);
        if (!current) continue;
        let unwrapped = unwrapComposedSource(current);
        if (options.hostUrl) unwrapped = normalizeLegacyPosterHost(unwrapped, options.hostUrl);
        if (unwrapped && unwrapped !== current) {
            url.searchParams.set(key, unwrapped);
            changed = true;
        }
    }

    // ['', 'images', 'poster', tipo, id, episodio] oppure [..., versione]
    const segments = url.pathname.split('/');
    const tipo = decodeURIComponent(segments[3] || '');
    const id = decodeURIComponent(segments[4] || '');
    const rawBadge = segments[5] === '_' ? null : decodeURIComponent(segments[5] || '');
    const source = url.searchParams.get('original') || url.searchParams.get('fallback') || '';

    const badgeVersion = String(options.badgeVersion ?? BADGE_IMG_VERSION);

    if (segments.length === 6) {
        // Forma vecchia, senza segmento di versione: si aggiunge.
        segments.push(badgeVersion);
        changed = true;
    } else if (segments.length >= 7 && segments[6] !== badgeVersion) {
        segments[6] = badgeVersion;
        changed = true;
    }

    if (!changed) return poster;
    url.pathname = segments.join('/');
    return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

/**
 * Riallinea un composto statico `/erdb-poster/<file>`: il nome del file include
 * la versione corrente (`<nome>-<versione>.jpg`), eliminando eventuali parametri `t`
 * di cache-busting legacy. Un file non riconosciuto o non valido lascia l'URL intatto.
 *
 * @param {string} poster
 * @param {{ badgeVersion?: string|number, hostUrl?: string }} [options]
 * @returns {string}
 */
function refreshStaticPoster(poster, options = {}) {
    const parsed = parsePosterUrl(poster);
    if (!parsed || !parsed.url.pathname.startsWith(STATIC_PREFIX)) return poster;

    const { url, isAbsolute } = parsed;
    const fileName = url.pathname.slice(STATIC_PREFIX.length);
    // Le stesse difese della rotta che serve il file: niente separatori, niente risalita.
    if (!fileName || /[/\\]/.test(fileName) || fileName.includes('..') || fileName.includes('\0')) {
        return poster;
    }

    const riconosciuto = erdbIdDaNomeFile(fileName);
    if (!riconosciuto) return poster;

    const { erdbId } = riconosciuto;
    const badge = url.searchParams.get('badge') || riconosciuto.badge || null;
    let source = url.searchParams.get('fallback') || url.searchParams.get('original') || null;
    if (source) {
        source = unwrapComposedSource(source);
        if (options.hostUrl) source = normalizeLegacyPosterHost(source, options.hostUrl);
    }

    // La versione la deriva `posterFileName` dal contenuto (id + badge + disegno):
    // qui non si ricalcola, altrimenti l'app tornerebbe ad avere una sua idea del nome
    // e il dump offline un'altra. `options.badgeVersion` resta come override per i test.
    let nuovoFile;
    try {
        nuovoFile = posterFileName({ erdbId, badge, version: options.badgeVersion });
    } catch {
        return poster;
    }

    let changed = false;
    if (fileName !== nuovoFile) {
        url.pathname = `${STATIC_PREFIX}${nuovoFile}`;
        changed = true;
    }

    if (url.searchParams.has('t')) {
        url.searchParams.delete('t');
        changed = true;
    }

    if (!changed) return poster;
    return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

/**
 * Riallinea il poster di un item di libreria al momento del sync.
 *
 * @param {string} poster - il poster così com'è arrivato da Stremio (o già in archivio)
 * @param {{ badgeVersion?: number, hostUrl?: string, cacheDir?: string }} [options]
 * @returns {string} il poster da scrivere: ricalcolato se composto, altrimenti identico
 */
function refreshLibraryPoster(poster, options = {}) {
    if (typeof poster !== 'string' || !poster.trim()) return poster;

    const composed = refreshComposedPoster(poster, options);
    if (composed !== poster) return composed;
    return refreshStaticPoster(poster, options);
}

module.exports = {
    refreshLibraryPoster,
    refreshComposedPoster,
    refreshStaticPoster,
    unwrapComposedSource
};
