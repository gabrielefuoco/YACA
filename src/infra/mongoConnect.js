/**
 * Connessione a MongoDB (Atlas) con ritentativo sui soli errori transitori.
 *
 * PERCHÉ ESISTE: i giri da timer (backup con `mongodump`, script di manutenzione)
 * aprono una connessione per volta. Un singhiozzo DNS — `ESERVFAIL` sul lookup SRV,
 * uno shard non risolvibile per qualche secondo — non è un guasto: ritentare una volta
 * costa qualche secondi, mentre rinunciare lascia il giro chiuso come fallimento
 * da notare a mano.
 *
 * Il classificatore è quello generico di `src/utils/retry.js`: un errore di
 * autenticazione o di URI malformato non viene ritentato (ritentarlo non serve
 * a nulla e nasconderebbe la causa), e dopo il tetto l'errore esce con
 * `RetryLimitError`, che dice quanti tentativi sono stati fatti.
 */

const { withRetry, RetryLimitError } = require('./retry');

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 250;

function messaggio(error) {
    if (error instanceof Error) return error.message;
    return String(error);
}

/**
 * Apre la connessione mongoose ritentando gli errori transitori.
 *
 * @param {string} uri
 * @param {object} [options]
 * @param {object} [options.mongoose] modulo mongoose iniettabile (test)
 * @param {object} [options.connectOptions] opzioni passate a `mongoose.connect`
 * @param {object} [options.logger] dove scrivere la riga di log (default `console`)
 * @param {number} [options.maxAttempts=3]
 * @param {number} [options.delayMs=250]
 * @param {object} [options.retry] altre opzioni passate a `withRetry`
 * @returns {Promise<*>} la connessione di mongoose
 */
async function connectMongo(uri, options = {}) {
    const {
        mongoose = require('mongoose'),
        connectOptions = {},
        logger = console,
        maxAttempts = DEFAULT_MAX_ATTEMPTS,
        delayMs = DEFAULT_DELAY_MS,
        retry = {}
    } = options;

    return withRetry(() => mongoose.connect(uri, connectOptions), {
        maxAttempts,
        delayMs,
        ...retry,
        onRetry: ({ attempt, error, delayMs: attesa }) => {
            const messaggioLog =
                `[Mongo] connessione Atlas fallita (${messaggio(error)}): ` +
                `ritento fra ${attesa}ms (tentativo ${attempt + 1}/${maxAttempts})`;
            if (logger && typeof logger.warn === 'function') logger.warn(messaggioLog);
            else if (typeof retry.onRetry === 'function') retry.onRetry({ attempt, error, delayMs: attesa });
        }
    });
}

module.exports = { connectMongo, RetryLimitError, DEFAULT_MAX_ATTEMPTS, DEFAULT_DELAY_MS };