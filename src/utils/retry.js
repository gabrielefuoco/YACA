/**
 * Ritentativo generico per operazioni che possono fallire per cause transitorie.
 *
 * Non sa niente di alcun servizio in particolare: decide solo guardando
 * il codice di sistema, lo status HTTP o il messaggio dell'errore.
 * Un errore non transitorio (autenticazione, dati non validi, logica)
 * viene propagato subito, senza consumare tentativi.
 */

/** Codici di sistema Node che valgono la pena ritentare: rete e DNS instabili. */
const TRANSIENT_SYSTEM_CODES = new Set([
    'EAI_AGAIN',        // lookup DNS temporaneamente fallito
    'ESERVFAIL',        // nameserver che non risolve il nome
    'EAI_FAIL',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENETDOWN',
    'EPIPE',
    'EADDRINUSE'
]);

/** Status HTTP che di norma si risolvono da soli. */
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Frammenti di messaggio per errori transitori senza codice riconoscibile. */
const TRANSIENT_MESSAGES = [
    'eservfail',
    'eai_again',
    'servfail',
    'temporary failure in name resolution',
    'getaddrinfo',
    'enotfound',        // solo per lookup: un host che non risolve può tornare su
    'socket hang up',
    'timeout',
    'timed out',
    'network',
    'temporarily unavailable'
];

/** Frammenti di messaggio che indicano un errore non transitorio. */
const NON_TRANSIENT_MESSAGES = [
    'invalid',
    'unauthor',
    'forbidden',
    'credential',
    'token',
    'permission',
    'non valido',
    'non validi'
];

/** Errore con cui chiude `withRetry` quando il tetto di tentativi si esaurisce. */
class RetryLimitError extends Error {
    constructor(attempts, lastError) {
        super(`Operazione fallita dopo ${attempts} tentativi: ${describe(lastError)}`);
        this.name = 'RetryLimitError';
        this.attempts = attempts;
        this.cause = lastError;
    }
}

function describe(error) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch (_e) {
        return String(error);
    }
}

function statusOf(error) {
    if (!error || typeof error !== 'object') return null;
    if (typeof error.status === 'number') return error.status;
    const response = error.response;
    if (response && typeof response.status === 'number') return response.status;
    if (typeof error.statusCode === 'number') return error.statusCode;
    return null;
}

function messageOf(error) {
    if (!error) return '';
    if (typeof error === 'string') return error.toLowerCase();
    if (typeof error.message === 'string') return error.message.toLowerCase();
    if (typeof error === 'object' && error.code && typeof error.code === 'string') return error.code.toLowerCase();
    return '';
}

/**
 * Dice se un errore vale la pena ritentare.
 * Un flag `transient` esplicito sull'errore vince su ogni euristica.
 *
 * @param {*} error
 * @returns {boolean}
 */
function isTransientError(error) {
    if (!error) return false;
    if (typeof error === 'object' && typeof error.transient === 'boolean') return error.transient;
    if (typeof error !== 'object') return false;

    if (typeof error.code === 'string' && TRANSIENT_SYSTEM_CODES.has(error.code)) return true;

    const status = statusOf(error);
    if (status !== null) return TRANSIENT_STATUS.has(status);

    const testo = messageOf(error);
    if (!testo) return false;
    if (NON_TRANSIENT_MESSAGES.some((frammento) => testo.includes(frammento))) return false;
    return TRANSIENT_MESSAGES.some((frammento) => testo.includes(frammento));
}

function delay(ms, sleep) {
    if (sleep) return sleep(ms);
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Esegue `operation` ritentando i soli errori transitori.
 *
 * @param {() => Promise<*>} operation operazione da eseguire
 * @param {object} [options]
 * @param {number} [options.maxAttempts=3] tetto di tentativi totali (1 = nessun ritentativo)
 * @param {number} [options.delayMs=250] attesa prima del primo ritentativo
 * @param {number} [options.backoffFactor=2] moltiplicatore dell'attesa fra un tentativo e il successivo
 * @param {number} [options.maxDelayMs=2000] tetto per l'attesa
 * @param {(info: {attempt: number, error: *, delayMs: number}) => void} [options.onRetry]
 * @param {(ms: number) => Promise<void>} [options.sleep] attesa iniettabile (test)
 * @param {(error: *) => boolean} [options.isTransient] predicato custom
 * @returns {Promise<*>} il valore dell'operazione
 */
async function withRetry(operation, options = {}) {
    if (typeof operation !== 'function') {
        throw new TypeError('withRetry richiede una funzione da eseguire');
    }

    const {
        maxAttempts = 3,
        delayMs = 250,
        backoffFactor = 2,
        maxDelayMs = 2000,
        onRetry = null,
        sleep = null,
        isTransient = isTransientError
    } = options;

    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
        throw new TypeError('maxAttempts deve essere un intero >= 1');
    }

    let tentativi = 0;
    for (;;) {
        tentativi += 1;
        try {
            return await operation(tentativi);
        } catch (error) {
            const transitorio = Boolean(isTransient(error));
            if (!transitorio) throw error;
            if (tentativi >= maxAttempts) throw new RetryLimitError(tentativi, error);
            const attesa = Math.min(delayMs * Math.pow(backoffFactor, tentativi - 1), maxDelayMs);
            if (typeof onRetry === 'function') {
                try {
                    onRetry({ attempt: tentativi, error, delayMs: attesa });
                } catch (_e) {
                    // un listener difettoso non deve interrompere il ritentativo
                }
            }
            await delay(attesa, sleep);
        }
    }
}

module.exports = { withRetry, isTransientError, RetryLimitError, TRANSIENT_STATUS, TRANSIENT_SYSTEM_CODES };