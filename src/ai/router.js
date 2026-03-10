const { Mistral } = require('@mistralai/mistralai');
const { aiPromptCache } = require('../cache/cacheInstances');
const { buildAiPrompt } = require('./prompts');

// ============================================
// FUNCTIONS
// ============================================

/**
 * Pulisce la risposta JSON di Mistral da markdown e fallback.
 * Valida la struttura per difendersi da prompt injection.
 */
const ALLOWED_AI_FIELDS = new Set([
    'strategy', 'similar_to', 'text_search', 'genre_ids', 'people_list',
    'year_from', 'year_to', 'runtime_lte', 'company_name', 'watch_provider',
    'keyword', 'original_language', 'language', 'target'
]);
const ALLOWED_STRATEGIES = new Set(['discovery', 'multi_search', 'similar']);
const ALLOWED_TARGETS = new Set(['tmdb', 'kitsu', 'trakt']);

function sanitizeSingleQuery(parsed, fallbackPrompt) {
    const clean = {};

    for (const key of Object.keys(parsed || {})) {
        if (ALLOWED_AI_FIELDS.has(key)) {
            clean[key] = parsed[key];
        }
    }

    if (!ALLOWED_STRATEGIES.has(clean.strategy)) {
        clean.strategy = 'multi_search';
    }
    if (clean.target && !ALLOWED_TARGETS.has(clean.target)) {
        clean.target = 'tmdb';
    }
    if (clean.genre_ids && (!Array.isArray(clean.genre_ids) || !clean.genre_ids.every(id => Number.isInteger(id)))) {
        delete clean.genre_ids;
    }
    if (clean.people_list && (!Array.isArray(clean.people_list) || !clean.people_list.every(p => typeof p === 'string'))) {
        delete clean.people_list;
    }
    if (!clean.target) {
        clean.target = 'tmdb';
    }
    if (clean.strategy === 'multi_search' && !clean.text_search) {
        clean.text_search = fallbackPrompt;
    }

    return clean;
}

function buildFallbackResponse(originalPrompt, taskType = 'single_query') {
    const fallbackQuery = { strategy: 'multi_search', text_search: originalPrompt, target: 'tmdb' };
    return taskType === 'multi_query'
        ? { queries: [fallbackQuery] }
        : fallbackQuery;
}

function parseMistralResponse(content, originalPrompt, taskType = 'single_query') {
    let jsonContent = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonContent = jsonMatch[0];

    try {
        const parsed = JSON.parse(jsonContent);

        if (taskType === 'multi_query') {
            const rawQueries = Array.isArray(parsed?.queries) ? parsed.queries : [];
            const queries = rawQueries
                .filter(item => item && typeof item === 'object')
                .map(item => sanitizeSingleQuery(item, originalPrompt))
                .filter(item => item.strategy !== 'multi_search' || item.text_search);

            if (queries.length === 0) {
                return buildFallbackResponse(originalPrompt, taskType);
            }

            return { queries };
        }

        return sanitizeSingleQuery(parsed, originalPrompt);
    } catch (err) {
        console.error("Errore Parsing JSON Mistral:", err.message);
        return buildFallbackResponse(originalPrompt, taskType);
    }
}

/**
 * Utilizzato durante la fase di CONFIG per le liste custom e anche per live search di Stremio.
 * Mappa la richiesta libera dell'utente ai parametri TMDB basandosi sulle regole avanzate.
 * 
 * @param {string} prompt "Film horror anni 80 sulle navi"
 * @param {string} mistralKey La chiave mistral dell'utente
 * @returns Object (Filtri JSON intelligenti)
 */
async function generateTmdbFiltersFromPrompt(prompt, mistralKey, isBackground = false, taskType = 'single_query') {
    if (!mistralKey) {
        return buildFallbackResponse(prompt, taskType);
    }
    try {
        // 1. Check Cache
        const cacheKey = `${taskType}:${prompt.toLowerCase().trim()}`;
        const { value: rawCached, status: cacheStatus } = await aiPromptCache.getWithStatus(cacheKey);
        if (rawCached && cacheStatus !== 'miss') {
            console.log(`[AICache] Hit per: "${prompt}" (Stale: ${cacheStatus === 'stale'})`);

            if (cacheStatus === 'stale' && !isBackground) {
                // Background refresh
                generateTmdbFiltersFromPrompt(prompt, mistralKey, true, taskType).catch(() => { });
            }

            return rawCached.filters || rawCached;
        }

        const client = new Mistral({ apiKey: mistralKey, timeout: 25000 });

        const response = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [
                { role: "system", content: buildAiPrompt(taskType) },
                { role: "user", content: `QUERY: "${prompt}"` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1 // Manteniamo la confidenza alta e le allucinazioni basse
        });

        const rawJson = response.choices?.[0]?.message?.content;
        if (!rawJson) {
            console.error("Risposta Mistral vuota o malformata");
            return buildFallbackResponse(prompt, taskType);
        }
        const parsed = parseMistralResponse(rawJson, prompt, taskType);

        // 2. Set Cache
        await aiPromptCache.set(cacheKey, { filters: parsed });

        return parsed;
    } catch (err) {
        console.error("Errore Fallback in AI (ritorno parametri base):", err.message);
        return buildFallbackResponse(prompt, taskType);
    }
}

/**
 * Utilizzato durante la live search di Stremio per decidere dove instradare la query AI Libera.
 * Abbiamo unificato la logica usando l'ADVANCED prompt perché ci dà anche le keywords e le strategie, 
 * ma manteniamo questa firma di funzione isolando solo target e query base per retrocompatibilità.
 */
async function routeLiveStremioSearch(searchQuery, mistralKey) {
    const filters = await generateTmdbFiltersFromPrompt(searchQuery, mistralKey, false, 'multi_query');

    // Convertiamo i filtri avanzati nel formato target/query atteso dal catalogHandler
    const firstQuery = Array.isArray(filters?.queries) ? filters.queries[0] : filters;
    return {
        target: firstQuery?.target || "tmdb",
        query: firstQuery?.text_search || firstQuery?.keyword || searchQuery,
        filters: filters // Passiamo anche i filtri avanzati per future integrazioni nel client tmdb.js
    };
}

module.exports = {
    generateTmdbFiltersFromPrompt,
    routeLiveStremioSearch,
    parseMistralResponse
};
