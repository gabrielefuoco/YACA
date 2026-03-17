const Redis = require('ioredis');

let redisClient = null;
let isConnected = false;

/**
 * Returns the singleton Redis client.
 * Falls back gracefully if Redis is unavailable (e.g. local dev without Redis).
 */
function getRedisClient() {
    if (redisClient) return redisClient;

    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

    redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
            if (times > 15) return null; // stop retrying
            return Math.min(times * 500, 2000);
        },
        lazyConnect: true,
        enableOfflineQueue: false
    });

    redisClient.on('connect', () => {
        isConnected = true;
        console.log(`[Redis] Connected to ${redisUrl}`);
    });

    redisClient.on('error', (err) => {
        if (isConnected) {
            console.error('[Redis] Connection error:', err.message);
        }
        isConnected = false;
    });

    redisClient.on('close', () => {
        isConnected = false;
    });

    // Attempt connection (non-blocking)
    redisClient.connect().catch(() => {
        console.warn('[Redis] Not available, falling back to in-memory LRU for L1.');
    });

    return redisClient;
}

/**
 * Returns true if Redis is currently connected and responsive.
 */
function isRedisAvailable() {
    return isConnected && redisClient && redisClient.status === 'ready';
}

/**
 * Waits briefly for Redis to become ready after process startup.
 * Returns true when ready, false on timeout.
 */
async function waitForRedisReady(timeoutMs = 8000, pollMs = 100) {
    const client = getRedisClient();
    const deadline = Date.now() + timeoutMs;

    while (true) {
        if (client.status === 'ready') return true;
        if (Date.now() >= deadline) return false;
        await new Promise(resolve => setTimeout(resolve, pollMs));
    }
}

/**
 * Gracefully disconnect Redis on shutdown.
 */
async function disconnectRedis() {
    if (redisClient) {
        try {
            await redisClient.quit();
            console.log('[Redis] Disconnected.');
        } catch (err) {
            console.error('[Redis] Error during disconnect:', err.message);
        }
        redisClient = null;
        isConnected = false;
    }
}

module.exports = { getRedisClient, isRedisAvailable, waitForRedisReady, disconnectRedis };
