/**
 * Esegue un fetch per una singola pagina (1 fetch per richiesta).
 * 
 * @param {Function} fetchFn - Funzione (currentSkip) => Promise<Array>
 * @param {number} skip - Offset iniziale
 * @param {number} limit - Numero massimo di elementi desiderati
 * @param {Object} userConfig - Configurazione utente
 * @param {Object} options - Opzioni extra
 */
async function executePaginatedFetch(fetchFn, skip, limit, userConfig, options = {}) {
    const results = await fetchFn(skip);
    if (!Array.isArray(results)) return [];
    if (limit && results.length > limit) {
        return results.slice(0, limit);
    }
    return results;
}

module.exports = { executePaginatedFetch };
