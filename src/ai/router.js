const { Mistral } = require('@mistralai/mistralai');
const AICache = require('../models/AICache');

// ============================================
// SYSTEM PROMPTS
// ============================================

const ADVANCED_AI_SYSTEM_PROMPT = `You are a TMDB Query Architect. Your job is to convert user input into precise API parameters. Current Year: ${new Date().getFullYear()}.

### DECISION LOGIC (FOLLOW STRICTLY):
1. **STRATEGY: "similar"**
   - TRIGGER: User asks for recommendations similar to a specific title.
   - KEYWORDS: "tipo", "simile a", "stile", "like", "similar to", "se mi piace".
   - ACTION: Extract the reference title into 'similar_to'.

2. **STRATEGY: "discovery"** (The Builder)
   - TRIGGER: User describes attributes (Genre, Actor, Year, Plot, Vibe) BUT does not name a specific movie title to watch.
   - INDICATORS:
     - Genre mentions ("Horror", "Comedy", "Anime").
     - People mentions ("con Brad Pitt", "di Nolan").
     - Time periods ("anni 80", "2023", "vecchi").
     - Plot keywords ("sui viaggi nel tempo", "alieni").
   - ACTION: Map all constraints to filters (genre_ids, people_list, year_from, etc).

3. **STRATEGY: "multi_search"** (The Finder)
   - TRIGGER: User provides a specific Name/Title and wants to find THAT exact entity.
   - EXAMPLES: "Matrix", "Breaking Bad", "Stranger Things", "Il Padrino".

### PARAMETER EXTRACTION RULES:
- **LOGIC OPERATORS**:
   - Use **pipe ('|')** for **OR** logic (e.g., "romance|comedy" means either one).
   - Use **comma (',')** for **AND** logic (e.g., "zombie,samurai" means both must be present).
   - APPLY this to genre_ids and keyword fields.

- **KEYWORDS**: You MUST map specific Italian concepts to these EXACT English keywords. Do NOT invent new ones.
   - "natalizia", "natale" -> "christmas"
   - "balene" -> "whale"
   - "isekai" -> "isekai"
   - "anime" -> "anime"
   - "kdrama", "k-drama" -> "kdrama"
   - "zodiacali", "zodiaco" -> "zodiac"
   - "robot", "mecha" -> "robot"
   - "alieni", "alieno" -> "alien"
   - "fantasmi", "fantasma" -> "ghost"
   - "maghi", "mago" -> "wizard"
   - "draghi", "drago" -> "dragon"
   - "mostri", "mostro" -> "monster"
   - "animali" -> "animal"
   - "bambini" -> "children"
   - "zombie" -> "zombie"
   - "viaggi nel tempo" -> "time travel"
   - "cyberpunk" -> "cyberpunk"
   - "steampunk" -> "steampunk"
   - "squali", "squalo" -> "shark"
   - "vampiri", "vampiro" -> "vampire"
   - "pirati", "pirata" -> "pirate"
   - "apocalisse", "post-apocalittico" -> "apocalypse"
   - "ninja" -> "ninja"
   - "samurai" -> "samurai"
   - "spionaggio", "spie" -> "spy"
   - "supereroi", "supereroe" -> "superhero"
   - For other topics, translate to the closest simple English noun.

- **MOOD/GENRE**: Map adjectives to GENRE IDs (e.g., "divertente" -> 35, "azione" -> 28, "avventura" -> 12, "animazione" -> 16).
- **PEOPLE**: Remove prepositions like "con", "di", "starring" before extracting names.

- **LANGUAGE PREFERENCE**:
   - "in inglese", "in english" (metadata/audio) -> "language": "en-US"
   - "tradotti in italiano", "in italiano" (metadata) -> "language": "it-IT"
   - "film italiani" (production) -> "original_language": "it"
   - "film americani" (production) -> "original_language": "en"

### EXAMPLES (FEW-SHOT):
// 1. Similarità diretta
- Query: "Film tipo Interstellar" -> { "strategy": "similar", "similar_to": "Interstellar" }

// 2. Ricerca specifica (Titolo esatto)
- Query: "Breaking Bad" -> { "strategy": "multi_search", "text_search": "Breaking Bad" }

// 3. Discovery Complessa: Genere + Anno + Attore
- Query: "Film thriller anni 90 con Brad Pitt" -> { 
    "strategy": "discovery", 
    "genre_ids": [53], 
    "people_list": ["Brad Pitt"], 
    "year_from": "1990", 
    "year_to": "1999" 
}

// 4. Discovery: Keyword + Lingua (Nicchia)
- Query: "Film coreani di zombie samurai" -> { 
    "strategy": "discovery", 
    "keyword": "zombie,samurai", 
    "genre_ids": [27], 
    "original_language": "ko", 
    "year_from": "2020" 
}

// 5. Discovery: Provider Streaming + Mood
- Query: "Commedie romantiche su Netflix" -> { 
    "strategy": "discovery", 
    "genre_ids": [35, 10749], 
    "watch_provider": "netflix"
}

### RESPONSE FORMAT (JSON ONLY):
{
  "strategy": "discovery" | "multi_search" | "similar",
  "similar_to": "string" | null,
  "text_search": "string" | null,
  "genre_ids": [12, 16] | null,
  "people_list": ["string"] | null,
  "year_from": "YYYY" | null,
  "year_to": "YYYY" | null,
  "runtime_lte": 120 | null, 
  "company_name": "string" | null,
  "watch_provider": "netflix" | "amazon" | "disney" | "apple" | null,
  "keyword": "string" (descriptive nouns separated by comma) | null,
  "original_language": "en" | "it" | "ja" | "ko" | null,
  "language": "it-IT" | "en-US" | "es-ES" | "fr-FR" | null,
  "target": "tmdb" | "kitsu" | "trakt"
}`;

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

function parseMistralResponse(content, originalPrompt) {
    let jsonContent = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonContent = jsonMatch[0];

    try {
        const parsed = JSON.parse(jsonContent);

        // Rimuovi campi non previsti (difesa da prompt injection)
        for (const key of Object.keys(parsed)) {
            if (!ALLOWED_AI_FIELDS.has(key)) {
                delete parsed[key];
            }
        }

        // Valida i campi critici
        if (!ALLOWED_STRATEGIES.has(parsed.strategy)) {
            parsed.strategy = 'multi_search';
        }
        if (parsed.target && !ALLOWED_TARGETS.has(parsed.target)) {
            parsed.target = 'tmdb';
        }
        if (parsed.genre_ids && (!Array.isArray(parsed.genre_ids) || !parsed.genre_ids.every(id => Number.isInteger(id)))) {
            delete parsed.genre_ids;
        }
        if (parsed.people_list && (!Array.isArray(parsed.people_list) || !parsed.people_list.every(p => typeof p === 'string'))) {
            delete parsed.people_list;
        }

        // Safeguards
        if (parsed.strategy === 'discovery' && !parsed.keyword && !parsed.genre_ids && !parsed.people_list && parsed.text_search) {
            parsed.keyword = parsed.text_search;
        }
        if (parsed.strategy === 'multi_search' && (originalPrompt.includes(' con ') || originalPrompt.includes(' di '))) {
            parsed.strategy = 'discovery';
            if (!parsed.people_list) {
                const name = originalPrompt.split(/ con | di /i)[1];
                if (name) parsed.people_list = [name.trim()];
            }
        }

        // Determina il target primario a meno che non sia esplicito l'anime
        if (!parsed.target) {
            const isAnime = originalPrompt.toLowerCase().includes('anime') || originalPrompt.toLowerCase().includes('manga');
            parsed.target = isAnime ? 'kitsu' : 'tmdb';
        }

        return parsed;
    } catch (err) {
        console.error("Errore Parsing JSON Mistral:", err.message);
        return { strategy: "multi_search", text_search: originalPrompt, target: "tmdb" };
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
async function generateTmdbFiltersFromPrompt(prompt, mistralKey, isBackground = false) {
    if (!mistralKey) {
        return { strategy: "multi_search", text_search: prompt, target: "tmdb" };
    }
    try {
        // 1. Check Cache
        const cacheKey = prompt.toLowerCase().trim();
        const rawCached = await AICache.get(cacheKey);
        if (rawCached) {
            const age = Date.now() - (rawCached.updatedAt || 0);
            const isStale = age > 1000 * 60 * 10; // 10 minutes SWR
            console.log(`[AICache] Hit per: "${prompt}" (Stale: ${isStale})`);

            if (isStale) {
                // Background refresh
                generateTmdbFiltersFromPrompt(prompt, mistralKey, true).catch(() => { });
            }

            return rawCached.filters || rawCached;
        }

        const client = new Mistral({ apiKey: mistralKey, timeout: 25000 });

        const response = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [
                { role: "system", content: ADVANCED_AI_SYSTEM_PROMPT },
                { role: "user", content: `QUERY: "${prompt}"` }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1 // Manteniamo la confidenza alta e le allucinazioni basse
        });

        const rawJson = response.choices?.[0]?.message?.content;
        if (!rawJson) {
            console.error("Risposta Mistral vuota o malformata");
            return { strategy: "multi_search", text_search: prompt, target: "tmdb" };
        }
        const parsed = parseMistralResponse(rawJson, prompt);

        // 2. Set Cache
        await AICache.set(cacheKey, { filters: parsed, updatedAt: Date.now() });

        return parsed;
    } catch (err) {
        console.error("Errore Fallback in AI (ritorno parametri base):", err.message);
        return { strategy: "discovery", sort_by: "popularity.desc", target: "tmdb" };
    }
}

/**
 * Utilizzato durante la live search di Stremio per decidere dove instradare la query AI Libera.
 * Abbiamo unificato la logica usando l'ADVANCED prompt perché ci dà anche le keywords e le strategie, 
 * ma manteniamo questa firma di funzione isolando solo target e query base per retrocompatibilità.
 */
async function routeLiveStremioSearch(searchQuery, mistralKey) {
    const filters = await generateTmdbFiltersFromPrompt(searchQuery, mistralKey);

    // Convertiamo i filtri avanzati nel formato target/query atteso dal catalogHandler
    return {
        target: filters.target || "tmdb",
        query: filters.text_search || filters.keyword || searchQuery,
        filters: filters // Passiamo anche i filtri avanzati per future integrazioni nel client tmdb.js
    };
}

module.exports = {
    generateTmdbFiltersFromPrompt,
    routeLiveStremioSearch
};
