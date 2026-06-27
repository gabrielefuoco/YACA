const axios = require('axios');

// In-memory cache for ERDB image availability
// Key: string (erdb url), Value: { exists: boolean, timestamp: number }
const erdbHeadCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours for successful hits
const MISS_TTL = 1000 * 60 * 60 * 2; // 2 hours for misses

async function checkErdbExists(url) {
    const now = Date.now();
    
    if (erdbHeadCache.has(url)) {
        const cached = erdbHeadCache.get(url);
        const ttl = cached.exists ? CACHE_TTL : MISS_TTL;
        if (now - cached.timestamp < ttl) {
            return cached.exists;
        }
        // Cache expired, remove it
        erdbHeadCache.delete(url);
    }

    try {
        await axios.head(url, { timeout: 3000 }); // Fast 3-second timeout
        erdbHeadCache.set(url, { exists: true, timestamp: now });
        return true;
    } catch (e) {
        // If 404 or timeout, we assume it doesn't exist
        erdbHeadCache.set(url, { exists: false, timestamp: now });
        return false;
    }
}

module.exports = { checkErdbExists };
