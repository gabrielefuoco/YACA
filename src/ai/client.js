const { Mistral } = require('@mistralai/mistralai');

/**
 * Shared mechanism for creating AI clients (Map Decision 22).
 * The AI module owns the mechanism (client, timeout, budget),
 * while consumer modules own their own prompts.
 *
 * @param {object} options
 * @param {string} options.apiKey
 * @param {number} [options.timeout=25000]
 * @returns {Mistral}
 */
function createAiClient({ apiKey, timeout = 25000 } = {}) {
    if (!apiKey) {
        throw new Error('API key richiesta per creare il client AI');
    }
    return new Mistral({ apiKey, timeout });
}

module.exports = {
    createAiClient
};
