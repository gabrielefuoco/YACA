// src/utils/rateLimiter.js

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_DELAY_MS = 100;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mappa una funzione asincrona su un array di elementi usando un pool di worker.
 * Sostituisce la vecchia logica a lotti (batch) per una gestione più fluida della concorrenza.
 * 
 * @param {Array} items - Elementi da processare
 * @param {Function} fn - Funzione asincrona (item, index) => result
 * @param {Object} options - { batchSize (renamed to concurrency), delayMs }
 */
async function rateLimitedMap(items, fn, options = {}) {
    // Mantengo batchSize per compatibilità con il codice esistente che lo passa
    const concurrency = options.batchSize || DEFAULT_CONCURRENCY;
    const { delayMs = DEFAULT_DELAY_MS } = options;

    if (!items || items.length === 0) return [];
    
    const results = new Array(items.length);
    let currentIndex = 0;

    const worker = async () => {
        while (currentIndex < items.length) {
            const i = currentIndex++;
            try {
                results[i] = await fn(items[i], i);
            } catch (error) {
                console.error(`[WorkerPool] Fallimento all'indice ${i}:`, error.message);
                results[i] = null;
            }
            
            // Un piccolo delay opzionale per non saturare l'event loop o le API
            if (delayMs > 0 && currentIndex < items.length) {
                await sleep(delayMs);
            }
        }
    };

    // Avvia il pool di worker
    const workers = [];
    const numWorkers = Math.min(concurrency, items.length);
    for (let i = 0; i < numWorkers; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
    return results;
}

async function rateLimitedMapFiltered(items, fn, options = {}) {
    const results = await rateLimitedMap(items, fn, options);
    return results.filter(item => item !== null && item !== undefined);
}

module.exports = { rateLimitedMap, rateLimitedMapFiltered };
