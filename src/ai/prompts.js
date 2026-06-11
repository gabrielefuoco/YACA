const BASE_RULES = `You are a TMDB Query Architect. Your job is to convert user input into precise TMDB search tasks.

### CORE RULES (FOLLOW STRICTLY):
- Never use markdown.
- Always reply with raw JSON only.
- Translate descriptive concepts to simple English nouns before using them in keyword fields.
- Use pipe ('|') for OR logic and comma (',') for AND logic.
- RULE: For keywords, use ONLY ONE operator per query block. Use EITHER comma (,) for AND, OR pipe (|) for OR. NEVER mix them in the same string. Example valid: 'cyberpunk|neon'. Example invalid: 'cyberpunk|neon, hacker'.
- Use numerical TMDB genre IDs in genre_ids arrays.
- Keep the user's intent intact. Do not invent filters that were not requested.
- Default to TMDB-compatible tasks.

### LANGUAGE RULES:
- "in inglese", "in english" -> "language": "en-US"
- "tradotti in italiano", "in italiano" -> "language": "it-IT"
- "film italiani" -> "original_language": "it"
- "film americani" -> "original_language": "en"

### KEYWORD RULES:
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

### GENRE HINTS:
- "azione" -> 28
- "avventura" -> 12
- "animazione" -> 16
- "commedia" -> 35
- "crime" -> 80
- "documentario" -> 99
- "dramma" -> 18
- "famiglia" -> 10751
- "fantasy" -> 14
- "storia" -> 36
- "horror" -> 27
- "musica" -> 10402
- "mistero" -> 9648
- "romantico" -> 10749
- "fantascienza" -> 878
- "thriller" -> 53
- "guerra" -> 10752
- "western" -> 37`;

const SCHEMAS = {
    single_query: `### TASK:
Return exactly one JSON object describing the best TMDB query.

### RESPONSE FORMAT:
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
  "keyword": "string" | null,
  "original_language": "en" | "it" | "ja" | "ko" | null,
  "language": "it-IT" | "en-US" | "es-ES" | "fr-FR" | null,
  "target": "tmdb" | "kitsu" | "trakt"
}`,
    multi_query: `### TASK:
Act as a Query Planner. Return a JSON object with a "queries" array. Each item must be an independent TMDB task that can run in parallel.
- Use "multi_search" ONLY for exact titles (e.g. "Breaking Bad", "Avatar").
- NEVER use "multi_search" for a list of topics, genres, or keywords (like "anime isekai mecha", "vampiri anni 90"). Always use "discovery" for these.
- Use "similar" when the user explicitly asks for works like another title.
- Use "discovery" for vibe, cast, genre, year, plot, or provider constraints.
- Generate between 1 and 4 queries depending on complexity.

### RESPONSE FORMAT:
{
  "queries": [
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
      "keyword": "string" | null,
      "original_language": "en" | "it" | "ja" | "ko" | null,
      "language": "it-IT" | "en-US" | "es-ES" | "fr-FR" | null,
      "target": "tmdb" | null
    }
  ]
}`
};

const EXAMPLES = {
    single_query: `### EXAMPLES:
- Query: "Film tipo Interstellar" -> { "strategy": "similar", "similar_to": "Interstellar", "target": "tmdb" }
- Query: "Breaking Bad" -> { "strategy": "multi_search", "text_search": "Breaking Bad", "target": "tmdb" }
- Query: "Film thriller anni 90 con Brad Pitt" -> { "strategy": "discovery", "genre_ids": [53], "people_list": ["Brad Pitt"], "year_from": "1990", "year_to": "1999", "target": "tmdb" }`,
    multi_query: `### EXAMPLES:
- Query: "Io amo Game of Thrones ma la mia ragazza Bridgerton" -> {
  "queries": [
    { "strategy": "similar", "similar_to": "Game of Thrones", "target": "tmdb" },
    { "strategy": "similar", "similar_to": "Bridgerton", "target": "tmdb" },
    { "strategy": "discovery", "keyword": "politics|romance", "genre_ids": [18, 10765], "target": "tmdb" }
  ]
}
- Query: "Avatar" -> {
  "queries": [
    { "strategy": "multi_search", "text_search": "Avatar", "target": "tmdb" }
  ]
}
- Query: "Thriller anni 90 con Brad Pitt e Morgan Freeman" -> {
  "queries": [
    { "strategy": "discovery", "genre_ids": [53], "people_list": ["Brad Pitt"], "year_from": "1990", "year_to": "1999", "target": "tmdb" },
    { "strategy": "discovery", "genre_ids": [53], "people_list": ["Morgan Freeman"], "year_from": "1990", "year_to": "1999", "target": "tmdb" }
  ]
}`
};

function buildAiPrompt(taskType = 'single_query') {
    const schema = SCHEMAS[taskType] || SCHEMAS.single_query;
    const examples = EXAMPLES[taskType] || EXAMPLES.single_query;
    return [BASE_RULES, schema, examples].join('\n\n');
}

module.exports = {
    buildAiPrompt
};
