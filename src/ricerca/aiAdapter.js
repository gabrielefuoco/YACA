/**
 * src/ricerca/aiAdapter.js
 *
 * ADATTATORE AI PER IL MODULO RICERCA (Ticket 22).
 *
 * Forma della chiamata stabilita:
 * Un modulo che necessita di comprensione semantica invoca il servizio AI
 * passando I SUOI PROMPT e riceve una risposta strutturata:
 *   richiediComprensioneAI({ prompt, systemPrompt, options })
 *     -> Promise<{ comprensione: Object | null, raw: string | null, degraded: boolean, reason: string | null }>
 *
 * Oggi è un adattatore sottile: delega al meccanismo esistente (router Mistral o fallback)
 * senza che la ricerca possieda il meccanismo e senza che l'AI possieda i prompt.
 * Non solleva MAI eccezioni: degrado morbido garantito.
 */

const { SEARCH_UNDERSTANDING_SYSTEM_PROMPT, buildSearchUnderstandingPrompt } = require('./prompts');

/**
 * Shape della chiamata al modulo AI: prende i prompt della ricerca e restituisce una risposta strutturata.
 *
 * @param {Object} params
 * @param {string} [params.prompt] - Prompt utente (se omesso, costruito da params.query)
 * @param {string} [params.query] - Query grezza cercata
 * @param {string} [params.systemPrompt] - System prompt specialistico
 * @param {string} [params.mistralKey] - Chiave API opzionale
 * @param {Object} [params.context] - Contesto opzionale
 * @returns {Promise<{ comprensione: Object | null, raw: string | null, degraded: boolean, reason: string | null }>}
 */
async function richiediComprensioneAI({
    prompt = null,
    query = '',
    systemPrompt = SEARCH_UNDERSTANDING_SYSTEM_PROMPT,
    mistralKey = null,
    context = {}
} = {}) {
    const effectivePrompt = prompt || buildSearchUnderstandingPrompt(query, context);
    const apiKey = mistralKey || process.env.MISTRAL_API_KEY;

    if (!apiKey) {
        return {
            comprensione: null,
            raw: null,
            degraded: true,
            reason: 'chiave_ai_assente'
        };
    }

    try {
        // Tentativo con Mistral SDK se disponibile
        const { Mistral } = require('@mistralai/mistralai');
        const client = new Mistral({ apiKey });

        const response = await client.chat.complete({
            model: 'mistral-small-latest',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: effectivePrompt }
            ],
            responseFormat: { type: 'json_object' },
            temperature: 0.1
        });

        const raw = response.choices?.[0]?.message?.content || null;
        if (!raw) {
            return {
                comprensione: null,
                raw: null,
                degraded: true,
                reason: 'risposta_ai_vuota'
            };
        }

        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            return {
                comprensione: null,
                raw,
                degraded: true,
                reason: 'json_ai_invalido'
            };
        }

        return {
            comprensione: parsed,
            raw,
            degraded: false,
            reason: null
        };
    } catch (err) {
        return {
            comprensione: null,
            raw: null,
            degraded: true,
            reason: `errore_ai: ${err.message || 'sconosciuto'}`
        };
    }
}

module.exports = {
    richiediComprensioneAI
};
