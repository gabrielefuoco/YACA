/**
 * **Aggancio lazy della promozione Tier 2 → Tier 1** (ticket 42).
 *
 * `tier1Promotion` sa scrivere la riga ma nessuno lo chiama: questo modulo è il ponte con il
 * percorso caldo. Quando `metaHandler` apre un titolo che DuckDB **non** sa servire (quindi un
 * titolo che sta solo nel Tier 2, o uno ancora da materializzare), i dettagli si scaricano **una
 * volta** e il titolo viene promosso: da lì è un cittadino completo per cataloghi, filtri ed hero.
 *
 * Tre regole, in ordine di importanza:
 *
 * 1. **La promozione non può mai rompere l'apertura di un titolo.** `schedulePromotion` è
 *    fire-and-forget e non solleva mai: chi chiama può accendersi e spegnersi il ramo di promozione
 *    senza che la risposta `meta` ne risenta. Per questo è *separata* da `promoteOnOpen`, che invece
 *    è una promise normale e lascia trapelare i suoi errori (test, diagnosi).
 * 2. **Niente promozioni inutili.** Un titolo già in Tier 1 non si tocca: prima di spendere una
 *    chiamata TMDB si controlla `hasTier1Id`, che è la dedup del modulo di scrittura (non la si
 *    riscrive). L'esito "già presente" viene ricordato in un memo **limitato** (`MAX_MEMO_KEYS`):
 *    `hasTier1Id` scorre il JSONL a blocchi e su un file di centinaia di MB un controllo per ogni
 *    riapertura dello stesso titolo è I/O sprecato; il memo lo azzera per titolo e per tipo.
 * 3. **Nessun rebuild a caldo.** Qui si appende una riga e basta: parquet e DuckDB li ricostruisce
 *    `tmdbDumpDaemon.convertAndReloadDuckDb()` al giro batch. Nessun reload, nessuna conversione.
 *
 * La riga promossa è quella che produce `TmdbDumpClient.fetchMovie/fetchTv`, quindi passa anche da
 * `shouldKeepTmdbRecord`: un titolo che la politica di ingestione scarta non viene promosso, e i
 * pavimenti di visibilità dei cataloghi restano quelli di sempre (qui non si tocca niente).
 */

/** Tetto delle voci del memo: sono `tipo:id`, interi e stringhe corte, ma il container è finito. */
const MAX_MEMO_KEYS = 500;

/** `tipo:id` → esito della promozione. Inserimento ordinato: a saturazione esce la più vecchia. */
const memoEsiti = new Map();

function rememberEsito(key, esito) {
    memoEsiti.delete(key);
    memoEsiti.set(key, esito);
    while (memoEsiti.size > MAX_MEMO_KEYS) {
        const piuVecchia = memoEsiti.keys().next().value;
        memoEsiti.delete(piuVecchia);
    }
}

/**
 * `metaHandler` ragiona in termini Stremio (`movie` / `series`), il file in termini di dump
 * (`movie` / `tv`). Qui si traduce e si lascia a `tier1Promotion.normalizeTipo` la validazione.
 */
function tipoFromMeta(type) {
    const value = String(type || '').trim().toLowerCase();
    if (value === 'series') return 'tv';
    return value;
}

/**
 * Promuove davvero un titolo appena aperto. **Non** è mai da chiamare dal percorso di risposta:
 * usa `schedulePromotion`.
 *
 * @param {object} opts
 * @param {string|number} opts.tmdbId id TMDB numerico del titolo aperto
 * @param {'movie'|'series'} opts.type `type` come arriva da Stremio
 * @param {string} opts.apiKey chiave TMDB (serve a scaricare i dettagli del dump)
 * @param {string} [opts.dataDir] cartella dati (default: quella di `tier1Promotion`)
 * @param {function} [opts.fetchDetails] iniettione per i test: `(tipo) => dettagli | null`
 * @returns {Promise<{scritto: boolean, motivo: string, id: number, tipo: string}>}
 */
async function promoteOnOpen({ tmdbId, type, apiKey, dataDir = null, fetchDetails = null } = {}) {
    const { hasTier1Id, promoteToTier1, tier1FileFor, normalizeTipo, normalizeId } = require('./tier1Promotion');

    const tipo = normalizeTipo(tipoFromMeta(type));
    const id = normalizeId(tmdbId);
    if (id === null) {
        throw new Error(`Id TMDB non numerico: ${JSON.stringify(tmdbId)}`);
    }

    const key = `${tipo}:${id}`;
    if (memoEsiti.has(key)) return memoEsiti.get(key);

    const percorso = tier1FileFor(tipo, dataDir);

    // (2) Già in Tier 1: niente da promuovere e, soprattutto, niente da riscaricare da TMDB.
    if (await hasTier1Id(percorso, id)) {
        const esito = { scritto: false, motivo: `id ${id} già nel Tier 1: promozione saltata`, id, tipo, percorso };
        rememberEsito(key, esito);
        return esito;
    }

    // I dettagli: stessa sorgente e stessa forma delle righe già nel file. Il default è il
    // TmdbDumpClient, che richiede axios e il budget TMDB: si carica qui, non all'import del modulo.
    const carica = fetchDetails || (async (tipoNorm) => {
        const TmdbDumpClient = require('../utils/tmdbDumpClient');
        const client = new TmdbDumpClient(apiKey);
        return tipoNorm === 'tv' ? client.fetchTv(id) : client.fetchMovie(id);
    });

    const dettagli = await carica(tipo);
    if (!dettagli) {
        // 404, budget esaurito o record scartato dalla politica di ingestione: niente da scrivere.
        // Non lo si memoizza: è un esito che può cambiare al giro dopo (o al riavvio del container).
        return { scritto: false, motivo: `id ${id}: dettagli non disponibili, niente scritto`, id, tipo, percorso };
    }

    // La dedup per id la fa ancora `promoteToTier1`: qui non la si riscrive, e il file resta append puro.
    const esito = await promoteToTier1(percorso, dettagli, tipo);
    if (esito.scritto) rememberEsito(key, esito);
    return esito;
}

/**
 * Entry point per il percorso caldo: lancia `promoteOnOpen` e **non lo aspetta**.
 *
 * Non solleva mai (nemmeno in sincrono) e non produce rejection non gestite: la risposta `meta`
 * dell'utente non deve dipendere dalla promozione. Ritorna la promise comunque, così i test
 * possono attendere il lavoro in background senza che il chiamante di produzione lo faccia.
 *
 * @param {object} opts stessi campi di `promoteOnOpen`
 * @returns {Promise<object>} sempre risolta
 */
function schedulePromotion(opts) {
    try {
        return Promise.resolve()
            .then(() => promoteOnOpen(opts))
            .catch((err) => {
                console.warn(`[Tier1 Lazy Promotion] Promozione saltata per ${opts?.tmdbId}: ${err.message}`);
                return { scritto: false, motivo: `errore: ${err.message}` };
            });
    } catch (_err) {
        return Promise.resolve({ scritto: false, motivo: 'errore: promozione non avviabile' });
    }
}

/** Svuota il memo (test, e un eventuale comando di diagnosi). */
function resetPromotionMemo() {
    memoEsiti.clear();
}

/** Contenuto del memo, per diagnostica. */
function getPromotionMemo() {
    return new Map(memoEsiti);
}

module.exports = {
    schedulePromotion,
    promoteOnOpen,
    resetPromotionMemo,
    getPromotionMemo,
    tipoFromMeta,
    MAX_MEMO_KEYS
};