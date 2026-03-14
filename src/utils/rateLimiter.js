// src/utils/rateLimiter.js

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_DELAY_MS = 200;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedMap(items, fn, options = {}) {
    const { batchSize = DEFAULT_BATCH_SIZE, delayMs = DEFAULT_DELAY_MS } = options;

    if (!items || items.length === 0) return [];
    const results = new Array(items.length);

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchPromises = batch.map((item, batchIndex) => {
            const globalIndex = i + batchIndex;
            return fn(item, globalIndex)
                .then(result => {
                    results[globalIndex] = result;
                    return result;
                })
                .catch(error => {
                    console.error(`Rate limited operation failed at index ${globalIndex}:`, error.message);
                    results[globalIndex] = null;
                    return null;
                });
        });

        await Promise.all(batchPromises);
        if (i + batchSize < items.length) await sleep(delayMs);
    }
    return results;
}

async function rateLimitedMapFiltered(items, fn, options = {}) {
    const results = await rateLimitedMap(items, fn, options);
    return results.filter(Boolean);
}

module.exports = { rateLimitedMap, rateLimitedMapFiltered };
