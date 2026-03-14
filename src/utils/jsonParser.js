/**
 * Utility to robustly parse JSON from LLM responses.
 * Handles markdown code blocks, trailing commas, and extra text.
 */

/**
 * Extracts and parses JSON from a string.
 * @param {string} text The string containing JSON
 * @returns {any} The parsed JSON or null if parsing fails
 */
function safeJsonParse(text) {
    if (!text || typeof text !== 'string') return null;

    let jsonStr = text.trim();

    // 1. Try to extract JSON from markdown code blocks
    const codeBlockMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/) || jsonStr.match(/```\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
    }

    // 2. If no code blocks, try to find the start and end of a JSON object or array
    if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
        const startIdx = jsonStr.search(/[{[]/);
        if (startIdx !== -1) {
            // Find the last matching closing brace/bracket
            const lastEndIdx = Math.max(jsonStr.lastIndexOf('}'), jsonStr.lastIndexOf(']'));
            if (lastEndIdx > startIdx) {
                jsonStr = jsonStr.substring(startIdx, lastEndIdx + 1);
            }
        }
    }

    try {
        // Direct parse first
        return JSON.parse(jsonStr);
    } catch (e) {
        // 3. Last resort: simple cleanup (trailing commas, comments)
        try {
            const cleaned = jsonStr
                .replace(/\/\/.*$/gm, '') // Remove single-line comments
                .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
                .replace(/,\s*([}\]])/g, '$1'); // Remove trailing commas
            return JSON.parse(cleaned);
        } catch (e2) {
            console.warn('[JSONParser] Failed to parse JSON even after cleanup:', e2.message);
            return null;
        }
    }
}

module.exports = { safeJsonParse };
