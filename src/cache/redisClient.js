const Redis = require('ioredis');

// Connettiti al demone locale sulla porta standard
const redisClient = new Redis('redis://127.0.0.1:6379', {
    // Configura per non bloccarsi se Redis non è disponibile (fail-fast)
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy(times) {
        if (times > 3) {
            console.warn('[Redis] Connessione fallita troppe volte. Fallback in-memory attivato.');
            return null; // Ferma i retry
        }
        return Math.min(times * 100, 3000); // Riprova fino a 3 secondi
    }
});

let isAvailable = false;

redisClient.on('connect', () => {
    isAvailable = true;
    console.log('[Redis] Connesso correttamente a 127.0.0.1:6379');
});

redisClient.on('error', (err) => {
    isAvailable = false;
    console.warn('[Redis] Errore di connessione:', err.message);
});

redisClient.on('close', () => {
    isAvailable = false;
});

// Aggiungiamo un flag al client per controllarne lo stato
Object.defineProperty(redisClient, 'isAvailable', {
    get: () => isAvailable
});

module.exports = redisClient;
