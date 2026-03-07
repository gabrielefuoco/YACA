const crypto = require('crypto');

/**
 * Genera un hash deterministico per una richiesta TMDB.
 * Regola d'oro: le chiavi vengono ordinate alfabeticamente per garantire
 * che due richieste identiche con parametri in ordine diverso producano lo stesso hash.
 *
 * @param {string} endpoint - L'endpoint TMDB (es. "/discover/movie")
 * @param {object} params   - Parametri della query (senza api_key)
 * @param {number} skip     - Offset di paginazione Stremio
 * @param {string} type     - "movie" o "series"
 * @returns {string} Hash SHA-256 esadecimale
 */
function generateRequestHash(endpoint, params, skip, type) {
    // Costruiamo l'oggetto normalizzato. Aggiungiamo 'v' per invalidare la cache se necessario.
    const normalized = { endpoint, type, skip: skip || 0, v: "1.0.4" };

    // Copia tutti i parametri, escludendo api_key (la cache è condivisa tra utenti)
    if (params && typeof params === 'object') {
        for (const [key, value] of Object.entries(params)) {
            if (key === 'api_key') continue;
            if (value !== undefined && value !== null && value !== '') {
                normalized[key] = value;
            }
        }
    }

    // Ordina le chiavi alfabeticamente
    const sortedKeys = Object.keys(normalized).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
        sortedObj[key] = normalized[key];
    }

    const jsonString = JSON.stringify(sortedObj);
    return crypto.createHash('sha256').update(jsonString).digest('hex');
}

module.exports = { generateRequestHash };
