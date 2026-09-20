const SystemLog = require('../models/SystemLog');

// Su server casalingo i log vanno su console Docker (Atlas M0 ha quote strette).
// SYSTEM_LOG=mongo ripristina la scrittura su database.
const LOG_TO_MONGO = process.env.SYSTEM_LOG === 'mongo';

/**
 * Registra un errore o evento: sempre su console, su MongoDB solo con SYSTEM_LOG=mongo.
 * Ignora silenziosamente gli errori di scrittura per non bloccare l'applicazione.
 * 
 * @param {string} context Il componente che ha generato l'errore (es. 'TMDB', 'Trakt', 'Mistral')
 * @param {string} message Il messaggio dell'errore
 * @param {Object} [meta] Dati opzionali aggiuntivi
 * @param {string} [level='error'] Livello di gravità: 'info', 'warning', 'error'
 */
async function logError(context, message, meta = {}, level = 'error') {
    const line = `[${level}] ${context}: ${message}`;
    if (level === 'error') {
        console.error(line, meta);
    } else {
        console.warn(line, meta);
    }

    if (!LOG_TO_MONGO) return;

    try {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // Scade dopo 7 giorni

        await SystemLog.create({
            context,
            message,
            level,
            meta,
            expiresAt
        });
    } catch (err) {
        console.error(`[Logger] Failed to write log for ${context}: ${err.message}`);
    }
}

module.exports = {
    logError
};
