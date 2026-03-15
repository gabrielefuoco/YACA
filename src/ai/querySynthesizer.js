const { Mistral } = require('@mistralai/mistralai');
const { aiDiscoveryCache } = require('../cache/cacheInstances');

// ============================================
// SYSTEM PROMPTS FOR QUERY SYNTHESIS
// ============================================

const TRUE_BLEND_SYSTEM_PROMPT = `You are a TMDB Query Architect. Your job is to decompose a user's Taste DNA into multiple discovery queries. Current Year: ${new Date().getFullYear()}.

### DECISION LOGIC (FOLLOW STRICTLY):
1. **STRATEGY: "discovery_array"** - TRIGGER: You receive a user's Taste DNA (Top Genres and Top Keywords).
   - ACTION: You MUST generate an ARRAY of exactly 2 or 3 distinct "discovery" query objects.
   - GOAL: Each object must represent a specific "vibe" or macro-theme present in the user's DNA. Do NOT mix conflicting genres in the same object.

### PARAMETER EXTRACTION RULES:
- **LOGIC OPERATORS (CRITICAL)**:
   - Use **pipe ('|')** for **OR** logic (e.g., "cyberpunk|neon" means either one).
   - Use **comma (',')** for **AND** logic (e.g., "zombie,samurai" means both must be present).
   - For True Blend, PREFER the pipe ('|') in the keyword field to create a broader pool of discovery.
- **KEYWORDS**: You MUST output descriptive English nouns. Do NOT use numerical IDs for keywords. Translate Italian concepts to the closest simple English noun.
- **GENRES**: Map genres to their respective numerical IDs in an array (e.g., "Action" -> 28, "Sci-Fi" -> 878).

### EXAMPLES (FEW-SHOT):
- User DNA: 
  Genres: Sci-Fi, Action, Romance. 
  Keywords: Cyberpunk, Neon, First Love.
- Output:
[
  {
    "vibe": "Action Sci-Fi Cyberpunk",
    "genre_ids": [878, 28],
    "keyword": "cyberpunk|neon"
  },
  {
    "vibe": "Romantic",
    "genre_ids": [10749],
    "keyword": "first love"
  }
]

### RESPONSE FORMAT (JSON ARRAY ONLY):
[
  {
    "vibe": "string (brief description of the vibe)",
    "genre_ids": [12, 16] | null,
    "keyword": "string (descriptive nouns separated by | or ,)" | null
  }
]`;

const HIDDEN_GEMS_SYSTEM_PROMPT = `You are a TMDB Query Architect specialized in finding niche, hidden gems. Current Year: ${new Date().getFullYear()}.

### DECISION LOGIC (FOLLOW STRICTLY):
1. **STRATEGY: "niche_discovery_array"** - TRIGGER: You receive a user's Taste DNA (Top Genres and Top Keywords).
   - ACTION: You MUST generate an ARRAY of exactly 3 or 4 distinct "discovery" query objects.
    - GOAL: Find niche, indie, or experimental combinations that have low visibility. You MUST avoid mainstream blockbuster titles.
    - PREFER: Combinations that would result in titles with low vote counts (e.g. < 500) or low popularity scores on TMDB.

### PARAMETER EXTRACTION RULES:
- **LOGIC OPERATORS (CRITICAL)**:
    - Use **comma (',')** for **AND** logic (e.g., "snow,serial killer").
    - Use **pipe ('|')** for **OR** logic.
    - For Hidden Gems, you MUST heavily prefer the comma (',') operator to narrow down the search surgically and find specific niche crossovers.
- **KEYWORDS**: You MUST output descriptive English nouns. Do NOT use numerical IDs for keywords. You can infer 1-2 new related keywords to find niche titles.
- **GENRES**: Map genres to their respective numerical IDs in an array (Max 2 genres per object).

### EXAMPLES (FEW-SHOT):
- User DNA: 
  Genres: Horror, Thriller. 
  Keywords: Serial Killer, Snow, Isolation.
- Output:
[
  {
    "vibe": "Isolated Winter Thriller",
    "genre_ids": [53],
    "keyword": "snow,serial killer,isolation"
  },
  {
    "vibe": "Pure Horror Isolation",
    "genre_ids": [27],
    "keyword": "isolation,ghost"
  }
]

### RESPONSE FORMAT (JSON ARRAY ONLY):
[
  {
    "vibe": "string (brief description of the niche)",
    "genre_ids": [12, 16] | null,
    "keyword": "string (descriptive nouns separated by , or |)" | null
  }
]`;

// ============================================
// GENRE ID MAP (standard TMDB genre IDs)
// ============================================
const GENRE_NAME_TO_ID = {
    action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80,
    documentary: 99, drama: 18, family: 10751, fantasy: 14, history: 36,
    horror: 27, music: 10402, mystery: 9648, romance: 10749, 'science fiction': 878,
    'sci-fi': 878, 'tv movie': 10770, thriller: 53, war: 10752, western: 37
};

// ============================================
// CONSTANTS
// ============================================
const MISTRAL_TIMEOUT_MS = 25000;
const { safeJsonParse } = require('../utils/jsonParser');

/**
 * Parses and validates a Mistral response that should be a JSON array of discovery queries.
 * Defends against malformed output and prompt injection.
 * @param {string} content Raw Mistral response text
 * @returns {Array} Validated array of query objects
 */
function parseQuerySynthesizerResponse(content) {
    const parsed = safeJsonParse(content);
    if (!parsed) return [];

    let queries = parsed;

    // Handle object-wrapped arrays (json_object format may produce {"queries": [...]})
    if (!Array.isArray(queries) && queries && typeof queries === 'object') {
        const values = Object.values(queries);
        const arrayValue = values.find(v => Array.isArray(v));
        if (arrayValue) {
            queries = arrayValue;
        } else {
            return [];
        }
    }

    if (!Array.isArray(queries)) return [];

    const ALLOWED_FIELDS = new Set(['vibe', 'genre_ids', 'keyword']);

    return queries
        .filter(item => item && typeof item === 'object')
        .map(item => {
            // Remove non-whitelisted fields
            const clean = {};
            for (const key of Object.keys(item)) {
                if (ALLOWED_FIELDS.has(key)) clean[key] = item[key];
            }

            // Validate genre_ids
            if (clean.genre_ids && (!Array.isArray(clean.genre_ids) || !clean.genre_ids.every(id => Number.isInteger(id)))) {
                delete clean.genre_ids;
            }

            // Validate keyword is a string
            if (clean.keyword && typeof clean.keyword !== 'string') {
                delete clean.keyword;
            }

            return clean;
        })
        .filter(item => item.genre_ids || item.keyword || item.vibe); // Must have at least one useful field or vibe
}

/**
 * Builds a natural language DNA description from profile data for Mistral.
 * Incorporates both inferred scores and manual/suggested DNA filters.
 * 
 * @param {Object} profile TasteProfile document (scores)
 * @param {Object} user User document (contains manualDNA)
 * @param {string} context Profile ID
 * @param {number} topN Number of top items to include
 * @returns {string} DNA description string
 */
function buildDnaDescription(profile, user, context, topN = 5) {
    const parts = [];
    const { getProfileDnaFilters } = require('../utils/helpers');

    // 1. Collect Manual DNA (Highest Priority)
    const dnaFilters = getProfileDnaFilters(user, context);
    const manualGenres = dnaFilters.filter(f => f.type === 'genre').map(f => f.name || `Genre ${f.id}`);
    const manualKeywords = dnaFilters.filter(f => f.type === 'keyword').map(f => f.name || `Keyword ${f.id}`);

    if (manualGenres.length > 0) parts.push(`User Manual Genres: ${manualGenres.join(', ')}`);
    if (manualKeywords.length > 0) parts.push(`User Manual Keywords: ${manualKeywords.join(', ')}`);

    // 2. Collect Inferred DNA (Scores)
    if (profile) {
        // Top genres from scores
        if (profile.genreScores && profile.genreScores.size > 0) {
            const topGenres = [...profile.genreScores.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, topN);
            
            if (topGenres.length > 0) {
                const idToName = {};
                for (const [name, id] of Object.entries(GENRE_NAME_TO_ID)) {
                    idToName[String(id)] = name;
                }
                const genreNames = topGenres.map(([id, score]) => {
                    let name = profile.idNames ? profile.idNames.get(String(id)) : null;
                    if (!name) name = idToName[String(id)] || `Genre ${id}`;
                    return `${name}`;
                });
                parts.push(`Inferred Preferred Genres: ${genreNames.join(', ')}`);
            }
        }

        // Top keywords from scores
        if (profile.keywordScores && profile.keywordScores.size > 0) {
            const topKeywords = [...profile.keywordScores.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, topN);
            
            if (topKeywords.length > 0) {
                const kwNames = topKeywords.map(([id, score]) => {
                    const name = profile.idNames ? profile.idNames.get(String(id)) : `Keyword ${id}`;
                    return `${name}`;
                });
                parts.push(`Inferred Preferred Keywords: ${kwNames.join(', ')}`);
            }
        }
    }

    return parts.join('. ');
}

/**
 * Generates multi-query discovery arrays using Mistral AI.
 * @param {Object} profile TasteProfile document (active profile only)
 * @param {string} mistralKey Mistral API key
 * @param {'trueBlend'|'hiddenGems'} mode Which prompt template to use
 * @param {Object} user User document for manualDNA context
 * @param {string} context profileId
 * @param {boolean} [isBackgroundRefresh=false] True when revalidating a stale cache entry
 * @returns {Array} Array of discovery query objects [{genre_ids, keyword, vibe}]
 */
async function generateDiscoveryQueries(profile, mistralKey, mode = 'trueBlend', user = null, context = 'global', isBackgroundRefresh = false) {
    if (!mistralKey || (!profile && !user)) return [];

    const dnaDescription = buildDnaDescription(profile, user, context);
    if (!dnaDescription) return [];

    const systemPrompt = mode === 'hiddenGems' ? HIDDEN_GEMS_SYSTEM_PROMPT : TRUE_BLEND_SYSTEM_PROMPT;
    const cacheKey = `qs_${mode}_${dnaDescription}`.toLowerCase().trim();

    try {
        // Check cache first
        const { value: rawCached, status: cacheStatus } = await aiDiscoveryCache.getWithStatus(cacheKey);
        if (rawCached && cacheStatus !== 'miss') {
            if (cacheStatus === 'stale' && !isBackgroundRefresh) {
                // Background refresh
                generateDiscoveryQueries(profile, mistralKey, mode, user, context, true).catch(() => { });
            }

            const cached = rawCached.queries || rawCached;
            if (Array.isArray(cached) && cached.length > 0) return cached;
        }

        const client = new Mistral({ apiKey: mistralKey, timeout: MISTRAL_TIMEOUT_MS });

        const response = await client.chat.complete({
            model: 'mistral-small-latest',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Analyze this user's Taste DNA and generate discovery queries:\n${dnaDescription}` }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3
        });

        const rawJson = response.choices?.[0]?.message?.content;
        if (!rawJson) {
            console.error('[QuerySynthesizer] Empty Mistral response');
            return [];
        }

        const queries = parseQuerySynthesizerResponse(rawJson);

        // Cache the result
        if (queries.length > 0) {
            await aiDiscoveryCache.set(cacheKey, { queries });
        }

        return queries;
    } catch (err) {
        console.error(`[QuerySynthesizer] Error (${mode}):`, err.message);
        return [];
    }
}

module.exports = {
    generateDiscoveryQueries,
    buildDnaDescription,
    parseQuerySynthesizerResponse,
    TRUE_BLEND_SYSTEM_PROMPT,
    HIDDEN_GEMS_SYSTEM_PROMPT,
    GENRE_NAME_TO_ID
};
