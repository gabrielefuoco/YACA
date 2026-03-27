const { filterWatchedItems } = require('../processors/FilterWatched');
const { rateLimitedMap } = require('../../utils/rateLimiter');

/**
 * Esegue un fetch paginato con supporto per il filtro "hideWatched".
 * Se hideWatched è attivo, scarica più pagine in parallelo (tramite rateLimitedMap)
 * per compensare gli elementi filtrati.
 * 
 * @param {Function} fetchFn - Funzione (currentSkip) => Promise<Array>
 * @param {number} skip - Offset iniziale
 * @param {number} limit - Numero di elementi desiderati (soglia di stop)
 * @param {Object} userConfig - Configurazione utente per userId e settings
 * @param {Object} options - Opzioni extra (batchSize, delayMs, maxParallelPages)
 */
async function executePaginatedFetch(fetchFn, skip, limit, userConfig, options = {}) {
    const hideWatched = userConfig?.config?.hideWatched;
    const maxParallelPages = options.maxParallelPages || (hideWatched ? 3 : 1);
    const batchSize = options.batchSize || 3;

    let combinedResults = [];
    
    // Fetch delle pagine tramite rateLimiter per evitare blocchi IP/Rate Limit
    const pagesResults = await rateLimitedMap(
        Array.from({ length: maxParallelPages }, (_, i) => i),
        (i) => fetchFn(skip + (i * 20)),
        { batchSize, delayMs: options.delayMs || 50 }
    );

    for (let pageResults of pagesResults) {
        if (!Array.isArray(pageResults)) continue;
        if (pageResults.length === 0) break;

        // Post-processing: Rimozione contenuti già visti
        let processedResults = pageResults;
        if (hideWatched) {
            processedResults = await filterWatchedItems(pageResults, userConfig);
        }
        
        combinedResults.push(...processedResults);
        
        // Ottimizzazione: Se abbiamo già abbastanza item, usciamo dal loop delle pagine
        if (combinedResults.length >= limit) break;
        
        // Se non stiamo filtrando (hideWatched=false), carichiamo solo la prima pagina per default
        if (!hideWatched && !options.forceMultiPage) break;
    }

    return combinedResults;
}

module.exports = { executePaginatedFetch };
