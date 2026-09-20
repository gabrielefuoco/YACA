const Redis = require('ioredis');

let isAvailable = false;
let redisClient;

if (process.env.NODE_ENV === 'test') {
    // In ambiente di test Jest, disattiva i socket di rete per evitare memory leak ed ECONNREFUSED
    redisClient = {
        get: async () => null,
        set: async () => null,
        del: async () => null,
        keys: async () => [],
        flushdb: async () => null,
        quit: async () => null,
        disconnect: () => {}
    };
} else {
    // Redis è un container separato (docker-compose.yml): l'URL arriva da REDIS_URL.
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy(times) {
            // Backoff continuo fino a 3s: in compose Redis può partire dopo l'app.
            return Math.min(times * 100, 3000);
        }
    });

    redisClient.on('connect', () => {
        isAvailable = true;
        console.log(`[Redis] Connesso correttamente a ${redisUrl}`);
    });

    redisClient.on('error', (err) => {
        isAvailable = false;
        // Evita di inquinare i log in dev locale se Redis non è avviato
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        console.warn('[Redis] Errore di connessione:', err.message);
    });

    redisClient.on('close', () => {
        isAvailable = false;
    });
}

// Aggiungiamo il flag isAvailable al client per controllarne lo stato
Object.defineProperty(redisClient, 'isAvailable', {
    get: () => isAvailable,
    configurable: true
});

module.exports = redisClient;

