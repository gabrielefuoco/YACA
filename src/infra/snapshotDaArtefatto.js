/**
 * src/utils/snapshotDaArtefatto.js
 *
 * Meccanismo condiviso per la lettura di snapshot da artefatto / collezioni (Ticket 32, Decisione 5).
 * Unifica:
 *  - TTL in RAM (cache L1);
 *  - In-flight deduplication (single-flight: le chiamate concorrenti condividono la stessa promise);
 *  - Politica d'errore dichiarata esplicitamente:
 *      * 'keepLastKnown': mantiene l'ultimo stato noto (degraded) e aggiorna fetchedAt per rispettare il TTL
 *      * 'emptyAndRetry': restituisce lo snapshot vuoto senza aggiornare fetchedAt, permettendo al chiamante successivo di ritentare subito.
 */

/**
 * Crea un gestore di snapshot con TTL e deduplicazione delle chiamate concorrenti.
 *
 * @param {Object} config
 * @param {() => Promise<any>} config.leggi Funzione asincrona che produce lo snapshot fresco
 * @param {number} [config.ttlMs=60000] Durata in millisecondi della cache in RAM
 * @param {'keepLastKnown'|'emptyAndRetry'|Function} [config.suErrore='keepLastKnown'] Politica in caso di errore
 * @param {any|Function} [config.vuoto] Snapshot vuoto da restituire come degrado iniziale o su errore
 * @returns {{
 *   getSnapshot: (options?: { force?: boolean }) => Promise<any>,
 *   reset: () => void,
 *   getCache: () => { snapshot: any, fetchedAt: number },
 *   setSnapshot: (snapshot: any) => void
 * }}
 */
function snapshotDaArtefatto({ leggi, ttlMs = 60000, suErrore = 'keepLastKnown', vuoto = () => ({}), onError = null }) {
    if (typeof leggi !== 'function') {
        throw new TypeError('[snapshotDaArtefatto] config.leggi deve essere una funzione asincrona');
    }

    let cache = { snapshot: null, fetchedAt: 0 };
    let inFlight = null;

    function getEmpty(error) {
        if (typeof vuoto === 'function') {
            try {
                return vuoto(error);
            } catch {
                return {};
            }
        }
        return vuoto !== undefined && vuoto !== null ? vuoto : {};
    }

    async function getSnapshot(options = {}) {
        const now = Date.now();
        if (!options.force && cache.snapshot && (now - cache.fetchedAt < ttlMs)) {
            return cache.snapshot;
        }

        if (inFlight) {
            return inFlight;
        }

        inFlight = (async () => {
            try {
                const snapshot = await leggi();
                cache = { snapshot, fetchedAt: Date.now() };
                return snapshot;
            } catch (error) {
                if (typeof suErrore === 'function') {
                    const customResult = await suErrore({
                        error,
                        lastKnown: cache.snapshot,
                        vuoto: () => getEmpty(error)
                    });
                    return customResult;
                }

                if (suErrore === 'emptyAndRetry' || suErrore === 'vuotoERitenta') {
                    // Non memorizziamo fetchedAt: il chiamante riceve lo snapshot vuoto,
                    // ma la chiamata successiva riproverà immediatamente senza aspettare il TTL.
                    return getEmpty(error);
                }

                // 'keepLastKnown' / 'ultimoNoto':
                const fallback = cache.snapshot || getEmpty(error);
                if (fallback && typeof fallback === 'object') {
                    fallback.degraded = true;
                    fallback.lastError = error?.message || String(error);
                }
                cache = { snapshot: fallback, fetchedAt: Date.now() };
                if (typeof onError === 'function') {
                    try {
                        onError(fallback, error);
                    } catch {}
                }
                return fallback;
            }
        })();

        try {
            return await inFlight;
        } finally {
            inFlight = null;
        }
    }

    function reset() {
        cache = { snapshot: null, fetchedAt: 0 };
        inFlight = null;
    }

    function getCache() {
        return cache;
    }

    function setSnapshot(snapshot) {
        cache = { snapshot, fetchedAt: Date.now() };
    }

    return {
        getSnapshot,
        reset,
        getCache,
        setSnapshot
    };
}

module.exports = {
    snapshotDaArtefatto
};
