const SystemLog = require('../models/SystemLog');

/**
 * Registra un errore o evento nel database (SystemLog).
 * Ignora silenziosamente gli errori di scrittura per non bloccare l'applicazione.
 * 
 * @param {string} context Il componente che ha generato l'errore (es. 'TMDB', 'Trakt', 'Mistral')
 * @param {string} message Il messaggio dell'errore
 * @param {Object} [meta] Dati opzionali aggiuntivi
 * @param {string} [level='error'] Livello di gravità: 'info', 'warning', 'error'
 */
async function logError(context, message, meta = {}, level = 'error') {
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
