/**
 * tier2Enrich.js
 *
 * I titoli del **Tier 2** arrivano dalla fusione volutamente **grezzi**: solo id, titolo
 * originale e popolarita' (`poster: null`, `description: ''`, `releaseInfo: null`).
 * Qui vengono **riempiti** con il percorso che l'app **gia'** usa: `getTmdbMetaDetails`, quello
 * che `metaHandler` chiama quando apri una scheda, con la sua cache `tmdb_details_raw`
 * (in produzione gia' calda per centinaia di titoli). Nessun client TMDB nuovo, nessuna
 * cache nuova: quando il dettaglio e' in cache l'arricchimento costa una lettura in RAM.
 *
 * Tre garanzie, in ordine di importanza:
 *   - **non rallenta mai la risposta**: concorrenza limitata (5 titoli insieme) e budget di
 *     tempo complessivo. Scaduto il budget si restituisce **quello che e' pronto** e il resto
 *     resta grezzo: alla richiesta successiva la cache e' calda e quei titoli appaiono
 *     completi. Non si aspetta mai tutto;
 *   - **non solleva mai**: una chiamata fallita lascia grezzo **solo quel** titolo, gli altri
 *     si arricchiscono lo stesso e la risposta esce uguale;
 *   - **resta gratis quando non serve**: senza risultati del Tier 2 non parte nessuna
 *     richiesta di rete (il caso normale della maggior parte delle ricerche).
 *
 * Si arricchiscono **solo i titoli della pagina gia' restituita**: nessuna pagina successiva
 * viene anticipata, nessun risultato locale viene toccato.
 */

const { TIER2_FLAG } = require('./tier2Search');

// Quanti titoli del Tier 2 vengono arricchiti insieme. Tetto deliberatamente basso: la ricerca
// e' un percorso che l'utente aspetta, non un arricchimento in secondo piano.
const ENRICH_CONCURRENCY = 5;

// Budget complessivo per l'arricchimento di una pagina. Superato, si risponde con quello che
// c'e': il resto si completa alla richiesta successiva, ormai servito dalla cache.
const ENRICH_BUDGET_MS = 3500;

// Campi che si copiano dal dettaglio al titolo grezzo. Lista chiusa per due motivi: non si
// sovrascrive mai l'`id` (il Tier 2 resta identificato da `tmdb:<n>`) e non fanno trapelare
// campi interni (`_keywordNames`, `_numberOfSeasons`, `videos` degli episodi...).
const ENRICHABLE_FIELDS = [
    'name',
    'poster',
    'background',
    'description',
    'releaseInfo',
    'imdbRating',
    'imdb_id',
    'genres',
    'genre_ids',
    'cast',
    'director',
    'writer',
    'runtime',
    'website',
    'logo',
    'trailers'
];

/** Il client TMDB pesa (axios, budget, store anime): si carica solo se serve davvero. */
let _tmdb = null;
function getTmdbModule() {
    if (!_tmdb) _tmdb = require('../clients/tmdb');
    return _tmdb;
}

/** Un risultato e' del Tier 2 solo se porta il marchio messo da `mapTier2RowToMeta`. */
function isTier2Item(item) {
    return Boolean(item && item[TIER2_FLAG]);
}

/** L'id TMDB numerico del titolo, o `null` se non e' utilizzabile. */
function tier2TmdbId(item) {
    const raw = item && item._tmdbId !== null && item._tmdbId !== undefined
        ? item._tmdbId
        : (item && item.id);
    const id = Number(String(raw === null || raw === undefined ? '' : raw).replace(/^tmdb:/i, ''));
    return Number.isFinite(id) && id > 0 ? id : null;
}

/** Un valore "vuoto" (null, '', [], {}) non cancella il grezzo: semplicemente non si copia. */
function hasContent(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

/** Riempie il titolo in-place con il dettaglio. Ritorna true se qualcosa e' cambiato. */
function applyDetails(item, details) {
    if (!item || !details) return false;

    let touched = false;
    for (const field of ENRICHABLE_FIELDS) {
        const value = details[field];
        if (!hasContent(value)) continue;
        item[field] = value;
        touched = true;
    }
    return touched;
}

/**
 * Il percorso riusato: `getTmdbMetaDetails` (cache `tmdb_details_raw`, fallback IT -> EN ->
 * lingua originale gia' gestiti). `skipEpisodes` evita di scaricare le stagioni delle serie:
 * in una riga di ricerca non servono, e il metaHandler le scarica solo quando apri la scheda.
 */
async function loadDetailsFromTmdb(apiKey, item) {
    const tmdbId = tier2TmdbId(item);
    if (!tmdbId) return null;

    const { getTmdbMetaDetails } = getTmdbModule();
    const type = item.type === 'series' ? 'series' : 'movie';
    return getTmdbMetaDetails(apiKey, `tmdb:${tmdbId}`, type, {}, { skipEpisodes: true });
}

/**
 * Arricchisce i titoli del Tier 2 **presenti nella lista data** (la pagina visibile).
 *
 * Non solleva mai e non aspetta mai piu' di `budgetMs`: alla scadenza restituisce quello che
 * e' pronto. Con zero titoli marcati non effettua nessuna richiesta.
 *
 * @param {Array<object>} items lista gia' restituita dal catalogo (viene modificata in-place)
 * @param {object} [options]
 * @param {string} [options.apiKey]        chiave TMDB; senza chiave non si chiama la rete
 * @param {number} [options.concurrency]   titoli arricchiti insieme (default 5)
 * @param {number} [options.budgetMs]      budget complessivo in ms (default 3500)
 * @param {Function} [options.loadDetails] loader sostitutivo (test)
 * @returns {Promise<Array<object>>} la stessa lista, con i titoli pronti riempiti
 */
async function enrichTier2Items(items, options = {}) {
    const list = Array.isArray(items) ? items : [];

    // Zero titoli del Tier 2 (la maggior parte delle ricerche): nessuna richiesta di rete.
    const targets = list.filter(isTier2Item);
    if (targets.length === 0) return list;

    const apiKey = options.apiKey;
    if (!apiKey) return list;

    const concurrency = Math.max(1, Number(options.concurrency) || ENRICH_CONCURRENCY);
    const budgetMs = Math.max(0, Number.isFinite(options.budgetMs) ? options.budgetMs : ENRICH_BUDGET_MS);
    const loadDetails = options.loadDetails || loadDetailsFromTmdb;

    const deadline = Date.now() + budgetMs;
    let cursor = 0;
    let stopped = false;

    async function worker() {
        while (!stopped) {
            if (Date.now() >= deadline) { stopped = true; return; }
            const item = targets[cursor++];
            if (!item) return;

            try {
                applyDetails(item, await loadDetails(apiKey, item));
            } catch (_err) {
                // Quel titolo resta grezzo: nessuna eccezione esce da qui, gli altri vanno avanti.
            }
        }
    }

    const running = Promise.all(
        Array.from({ length: Math.min(concurrency, targets.length) }, () => worker())
    );

    let timer = null;
    const expiry = new Promise(resolve => {
        timer = setTimeout(resolve, budgetMs);
        if (typeof timer.unref === 'function') timer.unref();
    });

    await Promise.race([running, expiry]);
    if (timer) clearTimeout(timer);
    // Budget scaduto: nessun altro titolo viene avviato, ma quello gia' partito continua a
    // completarsi in sottofondo e scalda la cache per la richiesta successiva.
    stopped = true;

    return list;
}

module.exports = {
    TIER2_FLAG,
    ENRICH_CONCURRENCY,
    ENRICH_BUDGET_MS,
    isTier2Item,
    tier2TmdbId,
    applyDetails,
    enrichTier2Items
};
