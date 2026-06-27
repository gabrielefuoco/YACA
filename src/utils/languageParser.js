/**
 * Regex patterns per il riconoscimento della lingua italiana.
 * Basato sul parser di AIOStreams / IlCorsaroViola.
 */

// Helper per creare regex che matcha solo parole intere e non sottostringhe
function createRegex(pattern) {
    return new RegExp(`(?<![^\\s\\[(_\\-.,])(${pattern})(?=[\\s\\)\\]_./\\-,]|$)`, 'i');
}

// Helper per regex di lingua: ESCLUDE esplicitamente se seguito da "sub", "subs", "subtitle"
function createLanguageRegex(pattern) {
    return createRegex(`${pattern}(?![ .\\-_]?sub(title)?s?)`);
}

// Regex per l'Italiano (Dubbed)
// Matcha: italian, italiano, italia, ital, ita
// MA fallisce se subito dopo c'è "sub" (es. ita sub, italian subs)
const italianAudioRegex = createLanguageRegex('italian|italiano|italia|ital|ita');

// Riconosce i vecchi pattern di subs espliciti che potremmo voler filtrare prima
const subFilters = [
    /\[[^\]]*?subs?[^\]]*?\]/gi,                       // [Subs: Eng, Ita] o [Multi-Subs]
    /\([^)]*?subs?[^)]*?\)/gi,                         // (Subs: Eng, Ita) o (Multi-Subs)
    /\b(?:SUB\s*ITA|ITA\s*SUB)\b/gi,                    // SUB ITA, ITA SUB
    /\b(?:SUBTITLES?|SUBS?)[\s\-_]*(?:ITA|ITALIANO?)\b/gi, // Subtitles Ita, Sub-Ita
    /\b(?:ITA|ITALIANO?)[\s\-_]*(?:SUBTITLES?|SUBS?)\b/gi, // Ita-Subs, Italian-Sub
    /sub[.\\s\\-_]?ita/gi                                // sub ita, sub-ita, sub.ita
];

/**
 * Analizza un array di stream restituiti da Torrentio o ICV.
 * Cerca la lingua italiana con precisione, scartando i sottotitoli.
 * @param {Array} streams 
 * @returns {boolean} true se c'è almeno un flusso doppiato in italiano
 */
function hasItaLanguage(streams) {
    if (!Array.isArray(streams)) return false;

    for (const s of streams) {
        // Prendi solo la prima riga del titolo (spesso il filename reale in Torrentio)
        const titleFirstLine = (s.title || '').split('\n')[0];
        
        let textToTest = `${titleFirstLine} ${s.name || ''} ${s.description || ''}`;
        
        // Rimuovi prima tutte le occorrenze evidenti di sottotitoli italiani
        for (const regex of subFilters) {
            textToTest = textToTest.replace(regex, '');
        }

        // Dopo aver purgato i subs, controlliamo se rimane un match puro per la lingua italiana audio
        if (italianAudioRegex.test(textToTest)) {
            return true;
        }
        
        // Fallback: se è Torrentio e il provider ha flaggato esplicitamente la lingua (es. nei metadati avanzati)
        if (s.behaviorHints && s.behaviorHints.bingeGroup) {
             if (italianAudioRegex.test(s.behaviorHints.bingeGroup)) {
                 return true;
             }
        }
    }

    return false;
}

module.exports = {
    hasItaLanguage,
    italianAudioRegex
};
