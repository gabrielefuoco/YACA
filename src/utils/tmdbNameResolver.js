const { createTmdbClient } = require('../clients/tmdb');
const { dnaNamesCache } = require('../cache/cacheInstances');
const { isRetiredTmdbKeywordId } = require('../data/keywordIds');

/**
 * TMDB genre ID → Italian name lookup.
 */
const GENRE_ID_TO_NAME = Object.freeze({
    '28': 'Azione', '12': 'Avventura', '16': 'Animazione', '35': 'Commedia',
    '80': 'Crime', '99': 'Documentario', '18': 'Dramma', '10751': 'Famiglia',
    '14': 'Fantasy', '36': 'Storia', '27': 'Horror', '10402': 'Musica',
    '9648': 'Mistero', '10749': 'Romance', '878': 'Fantascienza',
    '53': 'Thriller', '10752': 'Guerra', '37': 'Western',
    '10759': 'Azione & Avventura', '10762': 'Kids', '10763': 'News',
    '10764': 'Reality', '10765': 'Sci-Fi & Fantasy', '10766': 'Soap',
    '10767': 'Talk', '10768': 'War & Politics', '10770': 'Film TV'
});

const DEFAULT_BUDGET_MS = 1500;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_BATCH_DELAY_MS = 300;

/**
 * Returns formatted fallback name when real name cannot be resolved.
 * E.g. 'Network #49', 'Company #41077', 'Keyword #123'
 *
 * @param {string} type
 * @param {string|number} id
 * @returns {string}
 */
function getReadableFallback(type, id) {
    const strId = String(id !== undefined && id !== null ? id : '').trim();
    const t = String(type || '').trim().toLowerCase();

    if (t === 'genre') {
        return GENRE_ID_TO_NAME[strId] || `Genre #${strId}`;
    }
    if (t === 'keyword') return `Keyword #${strId}`;
    if (t === 'network') return `Network #${strId}`;
    if (t === 'company') return `Company #${strId}`;
    if (t === 'actor') return `Actor #${strId}`;
    if (t === 'director') return `Director #${strId}`;
    if (t === 'person') return `Person #${strId}`;

    const capitalized = t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Item';
    return `${capitalized} #${strId}`;
}

/**
 * Determines whether a given name is a placeholder that requires resolution.
 * Detects patterns such as:
 *   - "network 49", "company 41077", "keyword 123", "actor 456", "director 789"
 *   - "Network #49", "Company #41077", "Keyword #123"
 *   - empty strings, or string equal to id
 *
 * @param {string} name
 * @param {string} type
 * @param {string|number} id
 * @returns {boolean}
 */
function isPlaceholderName(name, type, id) {
    if (!name) return true;
    const strName = String(name).trim();
    const strId = String(id !== undefined && id !== null ? id : '').trim();

    if (strName === '' || strName === strId) return true;

    const normalizedType = type ? String(type).trim().toLowerCase() : '';
    const lowerName = strName.toLowerCase();

    if (normalizedType) {
        if (lowerName === `${normalizedType} ${strId}` ||
            lowerName === `${normalizedType} #${strId}` ||
            lowerName === `${normalizedType}#${strId}`) {
            return true;
        }
    }

    const genericPattern = /^(genre|keyword|network|company|actor|director|person)\s*#?\s*\d+$/i;
    if (genericPattern.test(strName)) {
        return true;
    }

    return false;
}

/**
 * Maps DNA type to TMDB REST endpoint prefix.
 *
 * @param {string} type
 * @returns {string|null}
 */
function getEndpointForType(type) {
    const t = String(type || '').trim().toLowerCase();
    switch (t) {
        case 'keyword':
            return '/keyword';
        case 'network':
            return '/network';
        case 'company':
            return '/company';
        case 'actor':
        case 'director':
        case 'person':
            return '/person';
        default:
            return null;
    }
}

/**
 * Normalizes cache key for an item. Actor and Director map to person:id.
 *
 * @param {string} type
 * @param {string|number} id
 * @returns {string}
 */
function getCacheKey(type, id) {
    const t = String(type || '').trim().toLowerCase();
    const strId = String(id !== undefined && id !== null ? id : '').trim();
    const normalizedType = (t === 'actor' || t === 'director') ? 'person' : t;
    return `${normalizedType}:${strId}`;
}

/**
 * Resolves an array of DNA items, replacing placeholder labels with real names.
 * Respects overall budget, batches TMDB queries, uses Redis/LRU cache,
 * and filters out retired keywords.
 *
 * @param {Array<{id: string|number, type: string, name?: string}>} items
 * @param {object} [options]
 * @param {string} [options.apiKey] - TMDB API key
 * @param {object} [options.tmdbClient] - Custom axios client (for tests or pre-configured client)
 * @param {number} [options.budgetMs=1500] - Total timeout budget for the entire operation
 * @param {number} [options.batchSize=20] - Number of concurrent requests per batch
 * @param {number} [options.batchDelayMs=300] - Delay between batches in ms
 * @param {boolean} [options.filterRetired=true] - Discard retired TMDB keywords
 * @param {boolean} [options.forceRefresh=false] - Ignore cache and force resolution
 * @returns {Promise<Array<{id: string, type: string, name: string}>>}
 */
async function resolveDnaNames(items, options = {}) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const {
        apiKey,
        tmdbClient,
        budgetMs = DEFAULT_BUDGET_MS,
        batchSize = DEFAULT_BATCH_SIZE,
        batchDelayMs = DEFAULT_BATCH_DELAY_MS,
        filterRetired = true,
        forceRefresh = false
    } = options;

    const deadline = Date.now() + budgetMs;

    // 1. Initial sanitization & discard retired keywords
    const validItems = [];
    for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        const id = String(raw.id !== undefined && raw.id !== null ? raw.id : '').trim();
        const type = String(raw.type || '').trim().toLowerCase();
        if (!id || !type) continue;

        if (filterRetired && type === 'keyword' && isRetiredTmdbKeywordId(id)) {
            // Discard retired keyword from DNA
            continue;
        }

        validItems.push({ ...raw, id, type });
    }

    if (validItems.length === 0) return [];

    // 2. Resolve genres and check cache for others
    const needsFetch = [];
    for (const item of validItems) {
        if (item.type === 'genre') {
            if (GENRE_ID_TO_NAME[item.id]) {
                item.name = GENRE_ID_TO_NAME[item.id];
            } else if (isPlaceholderName(item.name, item.type, item.id)) {
                item.name = getReadableFallback(item.type, item.id);
            }
            continue;
        }

        // If item already has a meaningful, non-placeholder name, retain it
        if (!forceRefresh && !isPlaceholderName(item.name, item.type, item.id)) {
            continue;
        }

        // Check cache
        const cacheKey = getCacheKey(item.type, item.id);
        if (!forceRefresh) {
            const cachedName = await dnaNamesCache.get(cacheKey);
            if (cachedName) {
                item.name = cachedName;
                continue;
            }
        }

        needsFetch.push(item);
    }

    if (needsFetch.length === 0) {
        return validItems;
    }

    // 3. Prepare TMDB client
    let client = tmdbClient;
    if (!client) {
        const effectiveKey = apiKey || process.env.TMDB_API_KEY;
        if (effectiveKey) {
            try {
                client = createTmdbClient(effectiveKey);
            } catch (err) {
                // Ignore client creation error; fallback logic applies below
            }
        }
    }

    // If no client available, fallback all remaining items to readable labels
    if (!client) {
        for (const item of needsFetch) {
            item.name = getReadableFallback(item.type, item.id);
        }
        return validItems;
    }

    // 4. Deduplicate requests by cacheKey
    const uniqueRequests = new Map();
    for (const item of needsFetch) {
        const key = getCacheKey(item.type, item.id);
        if (!uniqueRequests.has(key)) {
            uniqueRequests.set(key, { type: item.type, id: item.id });
        }
    }

    const uniqueList = Array.from(uniqueRequests.entries());
    const resolvedMap = new Map();
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 5. Batch processing with budget check
    for (let i = 0; i < uniqueList.length; i += batchSize) {
        const now = Date.now();
        if (now >= deadline) {
            // Budget expired! Stop calling TMDB and degrade remaining items
            break;
        }

        const remainingMs = deadline - now;
        const batch = uniqueList.slice(i, i + batchSize);

        await Promise.all(batch.map(async ([key, req]) => {
            const endpoint = getEndpointForType(req.type);
            if (!endpoint) return;

            try {
                const requestTimeout = Math.max(100, Math.min(1000, remainingMs));
                const res = await client.get(`${endpoint}/${req.id}`, { timeout: requestTimeout });
                if (res?.data?.name) {
                    const resolvedName = String(res.data.name).trim();
                    resolvedMap.set(key, resolvedName);
                    await dnaNamesCache.set(key, resolvedName);
                } else {
                    const fallback = getReadableFallback(req.type, req.id);
                    resolvedMap.set(key, fallback);
                    await dnaNamesCache.set(key, fallback);
                }
            } catch (err) {
                const fallback = getReadableFallback(req.type, req.id);
                resolvedMap.set(key, fallback);
                await dnaNamesCache.set(key, fallback);
            }
        }));

        // Delay between batches if more batches remain and budget allows
        if (i + batchSize < uniqueList.length) {
            const timeAfterBatch = Date.now();
            if (timeAfterBatch + batchDelayMs >= deadline) {
                break;
            }
            await delay(batchDelayMs);
        }
    }

    // 6. Apply resolved names or readable fallbacks
    for (const item of needsFetch) {
        const key = getCacheKey(item.type, item.id);
        if (resolvedMap.has(key)) {
            item.name = resolvedMap.get(key);
        } else {
            item.name = getReadableFallback(item.type, item.id);
        }
    }

    return validItems;
}

/**
 * Resolves a single DNA item.
 * Returns null if the item is a retired keyword.
 *
 * @param {{id: string|number, type: string, name?: string}} item
 * @param {object} [options]
 * @returns {Promise<{id: string, type: string, name: string}|null>}
 */
async function resolveDnaItem(item, options = {}) {
    if (!item) return null;
    const results = await resolveDnaNames([item], options);
    return results[0] || null;
}

/**
 * Clears the underlying DNA names cache.
 * Useful for tests.
 */
async function clearDnaNamesCache() {
    await dnaNamesCache.clear();
}

module.exports = {
    resolveDnaNames,
    resolveDnaItem,
    isPlaceholderName,
    getReadableFallback,
    getEndpointForType,
    getCacheKey,
    clearDnaNamesCache,
    GENRE_ID_TO_NAME
};
