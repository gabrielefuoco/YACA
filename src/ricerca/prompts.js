/**
 * src/ricerca/prompts.js
 *
 * I PROMPT DELLA RICERCA (Ticket 22).
 *
 * Principio architetturale:
 * "L'AI fornisce il meccanismo, non i prompt: ogni modulo possiede i suoi" (Decisione Ticket 22).
 * Questo file definisce i prompt specifici per la comprensione delle query di ricerca,
 * trasformando una richiesta utente in linguaggio naturale in filtri ed entità strutturate.
 */

const SEARCH_UNDERSTANDING_SYSTEM_PROMPT = `Sei l'analizzatore semantico delle ricerche cinematografiche e serie TV di YACA.
Il tuo compito è comprendere l'intento della query di ricerca dell'utente ed estrarre i parametri strutturati.
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido privo di markdown o commenti.

Campi ammessi:
- text_search: stringa del titolo o termine lessicale principale (o null)
- genres: array di nomi o id di genere (es. ["Fantascienza", "Azione"])
- keywords: array di parole chiave concettuali (es. ["viaggio nel tempo", "cyberpunk"])
- people: array di nomi di registi o attori menzionati (es. ["Christopher Nolan"])
- year_from: anno minimo intero (es. 1990) o null
- year_to: anno massimo intero (es. 1999) o null
- type: 'movie' | 'series' | 'both'
- original_language: codice lingua ISO (es. "it", "ja", "en") o null
- kids_friendly: booleano, true se la query richiede contenuti adatti a bambini`;

/**
 * Costruisce il prompt per la comprensione semantica di una query.
 *
 * @param {string} query - Testo cercato dall'utente
 * @param {Object} [context] - Contesto opzionale (selettori, kidsMode)
 * @returns {string} Prompt utente formattato
 */
function buildSearchUnderstandingPrompt(query, context = {}) {
    const hints = [];
    if (context.kidsMode) hints.push('L\'utente ha attivato la modalità Kids: privilegia contenuti per famiglie.');
    if (context.selettoriEffettivi?.movie && !context.selettoriEffettivi?.series) hints.push('L\'utente cerca solo film.');
    if (!context.selettoriEffettivi?.movie && context.selettoriEffettivi?.series) hints.push('L\'utente cerca solo serie TV.');

    const hintSection = hints.length > 0 ? `\nContesto: ${hints.join(' ')}` : '';
    return `Analizza la seguente query di ricerca:${hintSection}\n"${String(query).trim()}"`;
}

module.exports = {
    SEARCH_UNDERSTANDING_SYSTEM_PROMPT,
    buildSearchUnderstandingPrompt
};
