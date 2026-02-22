const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { Mistral } = require('@mistralai/mistralai');
const axios = require('axios');

// ==================== CONFIGURAZIONE ====================
const CONFIG = {
    TMDB_KEY: process.env.TMDB_KEY,
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY, 
    PORT: process.env.PORT || 7000,
    PAGES_PER_REQUEST: 2,
    ITEMS_PER_PAGE: 20,
    MAX_RESULTS: 80,
    TMDB_TIMEOUT: 15000,
    AI_TIMEOUT: 25000,
    RATE_LIMIT: { TMDB: 40, WINDOW: 10000 },
    LOG_LEVEL: 'info',
    DEFAULT_REGION: 'IT',
    SEARCH_MEMORY_TTL: 2 * 60 * 1000 
};

// ==================== DATI HARDCODED (GENERI) ====================
const HARDCODED_GENRES = {
    MOVIE: [
        { "id": 28, "name": "Azione" },
        { "id": 12, "name": "Avventura" },
        { "id": 16, "name": "Animazione" },
        { "id": 35, "name": "Commedia" },
        { "id": 80, "name": "Crime" },
        { "id": 99, "name": "Documentario" },
        { "id": 18, "name": "Dramma" },
        { "id": 10751, "name": "Famiglia" },
        { "id": 14, "name": "Fantasy" },
        { "id": 36, "name": "Storia" },
        { "id": 27, "name": "Horror" },
        { "id": 10402, "name": "Musica" },
        { "id": 9648, "name": "Mistero" },
        { "id": 10749, "name": "Romance" },
        { "id": 878, "name": "Fantascienza" },
        { "id": 10770, "name": "televisione film" },
        { "id": 53, "name": "Thriller" },
        { "id": 10752, "name": "Guerra" },
        { "id": 37, "name": "Western" }
    ],
    TV: [
        { "id": 10759, "name": "Action & Adventure" },
        { "id": 16, "name": "Animazione" },
        { "id": 35, "name": "Commedia" },
        { "id": 80, "name": "Crime" },
        { "id": 99, "name": "Documentario" },
        { "id": 18, "name": "Dramma" },
        { "id": 10751, "name": "Famiglia" },
        { "id": 10762, "name": "Kids" },
        { "id": 9648, "name": "Mistero" },
        { "id": 10763, "name": "News" },
        { "id": 10764, "name": "Reality" },
        { "id": 10765, "name": "Sci-Fi & Fantasy" },
        { "id": 10766, "name": "Soap" },
        { "id": 10767, "name": "Talk" },
        { "id": 10768, "name": "War & Politics" },
        { "id": 37, "name": "Western" }
    ]
};

// MAPPATURA DIRETTA MOVIE -> TV
const MOVIE_TO_TV_MAP = {
    28: 10759,    // Azione -> Action & Adventure
    12: 10759,    // Avventura -> Action & Adventure
    16: 16,       // Animazione -> Animazione
    35: 35,       // Commedia -> Commedia
    80: 80,       // Crime -> Crime
    99: 99,       // Docu -> Docu
    18: 18,       // Dramma -> Dramma
    10751: 10751, // Famiglia -> Famiglia
    14: 10765,    // Fantasy -> Sci-Fi & Fantasy
    36: 10768,    // Storia -> War & Politics
    27: 10765,    // Horror -> Sci-Fi & Fantasy
    10402: 18,    // Musica -> Dramma
    9648: 9648,   // Mistero -> Mistero
    10749: 18,    // Romance -> Dramma
    878: 10765,   // Sci-Fi -> Sci-Fi & Fantasy
    53: 80,       // Thriller -> Crime (o Mistero)
    10752: 10768, // Guerra -> War & Politics
    37: 37        // Western -> Western
};

// ==================== COLORI TERMINALE ====================
const COLORS = {
    reset: "\x1b[0m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", 
    yellow: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m"
};

// ==================== LOGGER ====================
class ColorLogger {
    constructor(level = 'info') {
        this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
        this.currentLevel = this.levels[level] || 0;
    }
    _timestamp() { return new Date().toISOString().split('T')[1].slice(0, -1); }
    log(level, tag, msg, data = null) {
        if (this.levels[level] < this.currentLevel) return;
        const ts = `${COLORS.dim}${this._timestamp()}${COLORS.reset}`;
        let tagColor = COLORS.cyan, msgColor = COLORS.reset;
        switch (level) {
            case 'debug': tagColor = COLORS.magenta; msgColor = COLORS.dim; break;
            case 'info': tagColor = COLORS.blue; msgColor = COLORS.reset; break;
            case 'warn': tagColor = COLORS.yellow; msgColor = COLORS.yellow; break;
            case 'error': tagColor = COLORS.red; msgColor = COLORS.red; break;
        }
        console.log(`${ts} ${tagColor}[${tag.padEnd(10)}]${COLORS.reset} ${msgColor}${msg}${COLORS.reset}`);
        if (data) console.log(`${COLORS.dim}${JSON.stringify(data, null, 2).split('\n').map(l=>'      '+l).join('\n')}${COLORS.reset}`);
    }
    debug(tag, msg, data) { this.log('debug', tag, msg, data); }
    info(tag, msg, data) { this.log('info', tag, msg, data); }
    warn(tag, msg, data) { this.log('warn', tag, msg, data); }
    error(tag, msg, data) { this.log('error', tag, msg, data); }
}
const logger = new ColorLogger(CONFIG.LOG_LEVEL);

// ==================== RATE LIMITER & CACHE ====================
const tmdbLimiter = {
    tokens: CONFIG.RATE_LIMIT.TMDB,
    lastRefill: Date.now(),
    async acquire() {
        const now = Date.now();
        if (now - this.lastRefill > CONFIG.RATE_LIMIT.WINDOW) {
            this.tokens = CONFIG.RATE_LIMIT.TMDB;
            this.lastRefill = now;
        }
        if (this.tokens <= 0) {
            const wait = Math.max(0, CONFIG.RATE_LIMIT.WINDOW - (now - this.lastRefill) + 100);
            logger.warn('LIMITER', `🛑 Rate limit pieno! Pausa di ${wait}ms...`);
            await new Promise(r => setTimeout(r, wait));
            this.tokens = CONFIG.RATE_LIMIT.TMDB; 
            this.lastRefill = Date.now();
        }
        this.tokens--;
    }
};

const idCache = new Map();
const mistralClient = new Mistral({ apiKey: CONFIG.MISTRAL_API_KEY });

// ==================== MEMORIA ULTIMA RICERCA (FIX MOBILE) ====================
let globalLastSearch = {
    query: null,
    timestamp: 0,
    type: null // 'movie' o 'series'
};

// ==================== NETWORK ====================
async function fetchWithRetry(url, params, retries = 2) {
    await tmdbLimiter.acquire();
    for (let i = 1; i <= retries; i++) {
        try {
            const res = await axios.get(url, { params, timeout: CONFIG.TMDB_TIMEOUT, validateStatus: s => s < 500 });
            if (res.status === 404) return null;
            if (res.data) return res.data;
        } catch (e) {
            if (i === retries) logger.error('TMDB_ERR', `❌ Errore ${url}: ${e.message}`);
            await new Promise(r => setTimeout(r, 1000 * i));
        }
    }
    return null;
}

async function fetchMultiplePages(url, baseParams, startPage, count) {
    const reqs = Array.from({ length: count }, (_, i) => fetchWithRetry(url, { ...baseParams, page: startPage + i }));
    const results = await Promise.allSettled(reqs);
    
    const items = [];
    results.forEach(r => { if (r.status === 'fulfilled' && r.value?.results) items.push(...r.value.results); });
    
    const unique = new Map();
    items.forEach(i => i.id && unique.set(i.id, i));
    return Array.from(unique.values()).slice(0, CONFIG.MAX_RESULTS);
}

async function getIdByName(endpoint, query) {
    if (!query) return null;
    const cacheKey = `${endpoint}:${query.toLowerCase()}`;
    if (idCache.has(cacheKey)) return idCache.get(cacheKey);

    const res = await fetchWithRetry(`https://api.themoviedb.org/3/search/${endpoint}`, { 
        api_key: CONFIG.TMDB_KEY, query: query 
    });
    
    const id = res?.results?.[0]?.id || null;
    if (id) idCache.set(cacheKey, id);
    return id;
}

// ==================== UTILS: GENRE RESOLVER ====================
function resolveGenreIds(genreIds, type) {
    if (!genreIds || genreIds.length === 0) return '';
    if (type === 'movie') return genreIds.join(',');

    // Mapping per TV Series
    const mapped = genreIds.map(id => {
        const tvId = MOVIE_TO_TV_MAP[id];
        return tvId;
    }).filter(id => id !== undefined);
    
    return [...new Set(mapped)].join(',');
}

// ==================== AI LOGIC (V3 - STRICT KEYWORDS + EXAMPLES) ====================
async function parseQueryWithAI(userQuery) {
    const year = new Date().getFullYear();
    const systemPrompt = `You are a TMDB Query Architect. Your job is to convert user input into precise API parameters. Current Year: ${year}.

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

- **MOOD/GENRE**: Map adjectives to GENRE IDs (e.g., "divertente" -> 35, "ansia" -> 53/27).
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
- Query: "Film coreani di zombie recenti" -> { 
    "strategy": "discovery", 
    "keyword": "zombie", 
    "genre_ids": [27], 
    "original_language": "ko", 
    "year_from": "2020" 
}

// 5. Discovery: Studio/Compagnia + Epoca
- Query: "Cartoni Disney anni 50" -> { 
    "strategy": "discovery", 
    "company_name": "Walt Disney Pictures", 
    "genre_ids": [16], 
    "year_from": "1950", 
    "year_to": "1959" 
}

// 6. Discovery: Provider Streaming + Mood
- Query: "Commedie romantiche su Netflix" -> { 
    "strategy": "discovery", 
    "genre_ids": [35, 10749], 
    "watch_provider": "netflix"
}

// 7. Discovery: Durata (Brevi) + Tema
- Query: "Documentari brevi sugli animali" -> { 
    "strategy": "discovery", 
    "genre_ids": [99], 
    "keyword": "animal", 
    "runtime_lte": 60 
}

// 8. Discovery: Inferenza genere da descrizione
- Query: "Film che fanno piangere ambientati in guerra" -> { 
    "strategy": "discovery", 
    "genre_ids": [18, 10752], 
    "keyword": "war" 
}

// 9. Language: Documentari tradotti vs Documentari Italiani
- Query: "Documentari tradotti in italiano sulle balene" -> { 
    "strategy": "discovery", 
    "genre_ids": [99], 
    "keyword": "whale", 
    "language": "it-IT" 
}

// 10. Language: Richiesta esplicita metadati in Inglese
- Query: "Commedie americane con titoli in inglese" -> { 
    "strategy": "discovery", 
    "genre_ids": [35], 
    "original_language": "en", 
    "language": "en-US" 
}

// 11. Combinazione Complessa: Anime con titoli italiani
- Query: "Anime robot anni 80 in italiano" -> { 
    "strategy": "discovery", 
    "genre_ids": [16], 
    "keyword": "robot", 
    "year_from": "1980", 
    "year_to": "1989", 
    "original_language": "ja", 
    "language": "it-IT"
}

### RESPONSE FORMAT (JSON ONLY):
{
  "strategy": "discovery" | "multi_search" | "similar",
  "similar_to": string | null,
  "text_search": string | null, (Only for multi_search)
  "genre_ids": [int] | null,
  "people_list": [string] | null,
  "year_from": "YYYY" | null,
  "year_to": "YYYY" | null,
  "runtime_lte": int | null, 
  "company_name": string | null,
  "watch_provider": "netflix" | "amazon" | "disney" | "apple" | null,
  "keyword": string | null, (English keyword for discovery)
  "original_language": "en" | "it" | "ja" | "ko" | null,
  "language": "it-IT" | "en-US" | "es-ES" | "fr-FR" | null
}`;

    try {
        logger.info('AI_START', `🤖 Mistral Analysis: "${userQuery}"`);
        const res = await Promise.race([
            mistralClient.chat.complete({
                model: "mistral-small-2506", 
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `QUERY: "${userQuery}"` }],
                responseFormat: { type: "json_object" },
                temperature: 0.0
            }),
            new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), CONFIG.AI_TIMEOUT))
        ]);
        
        let content = res.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) content = jsonMatch[0];

        const parsed = JSON.parse(content);

        // Safeguards
        if (parsed.strategy === 'discovery' && !parsed.keyword && !parsed.genre_ids && !parsed.people_list && parsed.text_search) {
             parsed.keyword = parsed.text_search;
        }
        if (parsed.strategy === 'multi_search' && (userQuery.includes(' con ') || userQuery.includes(' di '))) {
            parsed.strategy = 'discovery';
            if (!parsed.people_list) {
                const name = userQuery.split(/ con | di /i)[1];
                if (name) parsed.people_list = [name.trim()];
            }
        }

        logger.debug('AI_RAW', 'Risposta:', parsed);
        return parsed;
    } catch (e) {
        logger.error('AI_FAIL', `Fallback: ${e.message}`);
        return { strategy: "multi_search", text_search: userQuery };
    }
}

// ==================== ADDON DEFINITION ====================
const builder = new addonBuilder({
    id: 'org.mistral.final.v13', // Bump version
    version: '1.9.2',
    name: 'Mistral Search Ultimate',
    description: 'AI Powered Search for Stremio (Similar, People, Mood)',
    resources: [
        'catalog',
        {
            name: 'meta',
            types: ['movie', 'series'],
            idPrefixes: ['tmdb:']
        }
    ],
    types: ['movie', 'series'],
    idPrefixes: ['tmdb:'],
    catalogs: [
        { type: 'movie', id: 'ai_movie', name: '🎬 AI Movies', extra: [{ name: 'search', isRequired: false }, { name: 'skip' }] },
        { type: 'series', id: 'ai_series', name: '📺 AI Series', extra: [{ name: 'search', isRequired: false }, { name: 'skip' }] }
    ]
});

// ==================== CATALOG HANDLER ====================
builder.defineCatalogHandler(async (args) => {
    const start = Date.now();
    let { search, skip } = args.extra || {};
    const type = args.type;
    const page = Math.floor((skip || 0) / CONFIG.ITEMS_PER_PAGE) + 1;
    const endpoint = type === 'series' ? 'tv' : 'movie';

    console.log(`\n${'─'.repeat(40)}`);

    // === LOGICA SMART MEMORY ===
    if (search) {
        globalLastSearch = {
            query: search,
            timestamp: Date.now(),
            type: type
        };
    } else {
        const isRecent = (Date.now() - globalLastSearch.timestamp) < CONFIG.SEARCH_MEMORY_TTL;
        
        if (globalLastSearch.query && isRecent) {
            search = globalLastSearch.query;
            logger.info('MEMORY', `🧠 Ripristino ricerca mobile: "${search}"`);
        } else {
            logger.info('REQ', `🔥 POPULAR ${type.toUpperCase()} (Pg ${page})`);
            try {
                const results = await fetchMultiplePages(
                    `https://api.themoviedb.org/3/${endpoint}/popular`,
                    { api_key: CONFIG.TMDB_KEY, language: 'it-IT', include_adult: false },
                    page, CONFIG.PAGES_PER_REQUEST
                );
                
                const metas = results.map(i => ({
                    id: `tmdb:${i.id}`,
                    type: type,
                    name: i.title || i.name,
                    poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}` : null,
                    description: i.overview,
                    releaseInfo: (i.release_date || i.first_air_date || '').substring(0, 4)
                }));
                return { metas };
            } catch(e) {
                logger.error('CRASH', `Popolari falliti: ${e.message}`);
                return { metas: [] };
            }
        }
    }

    // GESTIONE RICERCA AI (Standard)
    logger.info('REQ', `🔎 ${type.toUpperCase()} "${search}" (Pg ${page})`);

    try {
        const aiParams = await parseQueryWithAI(search);
        let results = [];
        const STREAMING_PROVIDERS = { "netflix": 8, "amazon": 119, "prime": 119, "disney": 337, "apple": 350 };
        const searchType = type === 'series' ? 'tv' : 'movie';

        // === STRATEGIA 1: RICERCA TESTUALE MULTIPLA ===
        if (aiParams.strategy === "multi_search") {
            const raw = await fetchMultiplePages(
                'https://api.themoviedb.org/3/search/multi',
                { api_key: CONFIG.TMDB_KEY, query: aiParams.text_search || search, include_adult: false },
                page, CONFIG.PAGES_PER_REQUEST
            );
            results = raw.filter(i => (type === 'movie' ? i.media_type === 'movie' : i.media_type === 'tv'));
        } 
        
        // === STRATEGIA 2: SIMILARITÀ ===
        else if (aiParams.strategy === "similar" && aiParams.similar_to) {
            logger.info('STRATEGY', `🔄 Cerco titoli simili a: "${aiParams.similar_to}"`);
            const targetId = await getIdByName(searchType, aiParams.similar_to);

            if (targetId) {
                results = await fetchMultiplePages(
                    `https://api.themoviedb.org/3/${searchType}/${targetId}/recommendations`,
                    { api_key: CONFIG.TMDB_KEY, language: 'it-IT' },
                    page, CONFIG.PAGES_PER_REQUEST
                );
            } else {
                logger.warn('SIMILAR', `❌ Titolo di riferimento non trovato: ${aiParams.similar_to}. Fallback su search.`);
                results = [];
            }
        }

        // === STRATEGIA 3: DISCOVERY ===
        else {
            const tmdbParams = {
                api_key: CONFIG.TMDB_KEY,
                include_adult: false,
                sort_by: aiParams.sort_by || 'popularity.desc',
                'vote_count.gte': 5,
                // Gestione lingua dinamica (Fallback su it-IT)
                language: aiParams.language || 'it-IT', 
                with_original_language: aiParams.original_language
            };

            // === FIX GENERI + HARDCODE ===
            if (aiParams.genre_ids?.length) {
                const finalGenres = resolveGenreIds(aiParams.genre_ids, type);
                if (finalGenres) {
                    tmdbParams.with_genres = finalGenres;
                    logger.debug('GENRES', `Generi applicati (${type}): ${finalGenres}`);
                }
            }

            // Override Anime/Kdrama
            const lowerQ = search.toLowerCase();
            if (lowerQ.includes('anime')) {
                tmdbParams.with_genres = '16'; 
                tmdbParams.with_original_language = 'ja';
            } else if (lowerQ.includes('kdrama') || lowerQ.includes('k-drama')) {
                tmdbParams.with_original_language = 'ko';
                tmdbParams.with_genres = '18';
            }
            
            if (aiParams.year_from) {
                const dateField = type === 'movie' ? 'primary_release_date' : 'first_air_date';
                tmdbParams[`${dateField}.gte`] = `${aiParams.year_from}-01-01`;
                if (aiParams.year_to) tmdbParams[`${dateField}.lte`] = `${aiParams.year_to}-12-31`;
            }

            if (aiParams.runtime_lte && type === 'movie') tmdbParams['with_runtime.lte'] = aiParams.runtime_lte;
            if (aiParams.runtime_gte && type === 'movie') tmdbParams['with_runtime.gte'] = aiParams.runtime_gte;

            if (aiParams.people_list && aiParams.people_list.length > 0) {
                const peopleIds = [];
                for (const name of aiParams.people_list) {
                    const pid = await getIdByName('person', name);
                    if (pid) peopleIds.push(pid);
                }
                if (peopleIds.length > 0) tmdbParams.with_people = peopleIds.join(',');
            }

            if (aiParams.company_name) {
                const cid = await getIdByName('company', aiParams.company_name);
                if (cid) tmdbParams.with_companies = cid;
            }

            if (aiParams.watch_provider) {
                const pid = STREAMING_PROVIDERS[aiParams.watch_provider.toLowerCase()];
                if (pid) { tmdbParams.with_watch_providers = pid; tmdbParams.watch_region = 'IT'; }
            }

            if (aiParams.keyword && aiParams.keyword !== 'kdrama') {
                const kid = await getIdByName('keyword', aiParams.keyword);
                if (kid) tmdbParams.with_keywords = kid;
            }

            results = await fetchMultiplePages(
                `https://api.themoviedb.org/3/discover/${endpoint}`,
                tmdbParams, page, CONFIG.PAGES_PER_REQUEST
            );
        }

        const metas = results.map(i => ({
            id: `tmdb:${i.id}`,
            type: type,
            name: i.title || i.name,
            poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}` : null,
            description: i.overview,
            releaseInfo: (i.release_date || i.first_air_date || '').substring(0, 4)
        }));

        logger.info('DONE', `🏁 ${metas.length} risultati in ${Date.now() - start}ms`);
        if(metas.length > 0) console.log(`${COLORS.green}   ► ${metas[0].name}${COLORS.reset}`);

        return { metas };

    } catch (e) {
        logger.error('CRASH', e.message);
        return { metas: [] };
    }
});

// ==================== META HANDLER ====================
builder.defineMetaHandler(async (args) => {
    if (!args.id.startsWith('tmdb:')) return { meta: {} };

    const tmdbId = args.id.split(':')[1];
    const type = args.type === 'series' ? 'tv' : 'movie';
    logger.info('META', `📥 Dettagli: ${type} ${tmdbId}`);

    try {
        const details = await fetchWithRetry(
            `https://api.themoviedb.org/3/${type}/${tmdbId}`, 
            { api_key: CONFIG.TMDB_KEY, language: 'it-IT', append_to_response: 'external_ids,credits' }
        );

        if (!details) throw new Error('Dettagli non trovati');

        const imdbId = details.external_ids?.imdb_id;

        const meta = {
            id: args.id,
            type: args.type,
            name: details.title || details.name,
            poster: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            background: details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : null,
            description: details.overview || "Nessuna descrizione disponibile.",
            releaseInfo: (details.release_date || details.first_air_date || '').substring(0, 4),
            imdbRating: details.vote_average ? details.vote_average.toFixed(1) : null,
            genres: details.genres ? details.genres.map(g => g.name) : [],
            cast: details.credits?.cast ? details.credits.cast.slice(0, 5).map(c => c.name) : [],
            director: details.credits?.crew ? details.credits.crew.filter(c => c.job === 'Director').map(d => d.name) : [],
            imdb_id: imdbId, 
            behaviorHints: { defaultVideoId: imdbId ? imdbId : null }
        };

        if (type === 'tv' || args.type === 'series') {
            meta.videos = [];
        }

        if (type === 'tv' && details.seasons) {
            const seasonsToFetch = details.seasons.slice(0, 10);
            
            const seasonPromises = seasonsToFetch.map(s => 
                fetchWithRetry(
                    `https://api.themoviedb.org/3/tv/${tmdbId}/season/${s.season_number}`,
                    { api_key: CONFIG.TMDB_KEY, language: 'it-IT' }
                )
            );

            const seasonsData = await Promise.all(seasonPromises);

            seasonsData.forEach(season => {
                if (!season || !season.episodes) return;
                season.episodes.forEach(ep => {
                    meta.videos.push({
                        id: imdbId ? `${imdbId}:${season.season_number}:${ep.episode_number}` : `tmdb:${tmdbId}:${season.season_number}:${ep.episode_number}`,
                        title: ep.name || `Episodio ${ep.episode_number}`,
                        released: ep.air_date ? new Date(ep.air_date).toISOString() : new Date().toISOString(),
                        season: season.season_number,
                        episode: ep.episode_number,
                        overview: ep.overview,
                        thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null
                    });
                });
            });
            meta.videos.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
            logger.info('META_TV', `✅ Episodi caricati: ${meta.videos.length}`);
        }

        return { meta };
    } catch (e) {
        logger.error('META_ERR', `Errore meta ${args.id}: ${e.message}`);
        return { meta: {} };
    }
});

const port = CONFIG.PORT;
serveHTTP(builder.getInterface(), { port });
logger.info('SYS', `🚀 Server avviato: http://localhost:${port}`);