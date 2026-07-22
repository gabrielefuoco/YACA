const fs = require('fs');
const path = require('path');

// === HELPER INTERNI ===
const jsonHas = (col, id) => `"${col}" LIKE '%"id":${id}%'`;
const jsonHasStr = (col, val) => `"${col}" LIKE '%"${val}"%'`;

// === FILTRI CONTENUTO (F) ===
const F = {
    // --- Generi ---
    genre: (...ids) => `(${ids.map(id => jsonHas('genres', id)).join(' OR ')})`,
    genreStr: (...strs) => `(${strs.map(s => `"genres" LIKE '%"name":"${s.replace(/'/g, "''")}"%'`).join(' OR ')})`,
    allGenres: (...ids) => `(${ids.map(id => jsonHas('genres', id)).join(' AND ')})`,
    notGenre: (...ids) => `(${ids.map(id => `"genres" NOT LIKE '%"id":${id}%'`).join(' AND ')})`,
    
    // --- Keywords ---
    keyword: (...ids) => `(${ids.map(id => jsonHas('keywords', id)).join(' OR ')})`,
    keywordStr: (...strs) => `(${strs.map(s => `"keywords" LIKE '%"${s.replace(/'/g, "''")}"%'`).join(' OR ')})`,
    allKeywords: (...ids) => `(${ids.map(id => jsonHas('keywords', id)).join(' AND ')})`,
    notKeyword: (...ids) => `(${ids.map(id => `"keywords" NOT LIKE '%"id":${id}%'`).join(' AND ')})`,
    
    // --- Persone ---
    director: (id) => jsonHas('directors', id),
    actor: (id) => jsonHas('cast', id),
    crew: (id) => `(${jsonHas('directors', id)} OR ${jsonHas('writers', id)})`,
    company: (id) => jsonHas('production_companies', id),
    network: (id) => jsonHas('networks', id),
    
    // --- Lingua e Paese ---
    lang: (code) => `"original_language" = '${code}'`,
    notLang: (...codes) => codes.map(c => `"original_language" != '${c}'`).join(' AND '),
    country: (code) => jsonHasStr('production_countries', code),
    
    // --- Soglie ---
    minVotes: (n) => `"vote_count" >= ${n}`,
    maxVotes: (n) => `"vote_count" <= ${n}`,
    minScore: (n) => `"vote_average" >= ${n}`,
    minRuntime: (m) => `"runtime" >= ${m}`,
    
    // --- Date ---
    releasedAfter: (d) => `"release_date" >= '${d}'`,
    releasedBefore: (d) => `"release_date" <= '${d}'`,
    releasedBetween: (from, to) => `"release_date" BETWEEN '${from}' AND '${to}'`,
    airedAfter: (d) => `"first_air_date" >= '${d}'`,
    airedBefore: (d) => `"first_air_date" <= '${d}'`,
    releasedInYear: (y) => `"release_date" LIKE '${y}%'`,
    
    // --- Watch Providers ---
    provider: (id) => `"watch_providers_it" LIKE '%"provider_id":${id}%'`,
    
    // --- Identity / Speciali ---
    anime: '"id" IN (SELECT "tmdb_id" FROM anime_mappings)',
    franchise: '"collection_id" IS NOT NULL',
    validBoxOffice: '"revenue" > 1000000 AND "budget" > 500000',
    shortFilm: '"runtime" BETWEEN 1 AND 45',

    // --- Speciali Pipeline (FTS, Similar, ecc) ---
    search: (query) => ({ _fts: true, query: query.replace(/'/g, "''") }),
    similarTo: (tmdbId) => ({ _similar: true, tmdbId }),

    // --- Helper per combinare OR espliciti tra gruppi ---
    any: (...clauses) => `(${clauses.join(' OR ')})`
};

// === ORDINAMENTI (bidirezionali) ===
const SortExpr = {
    popular: '"popularity"',
    score: '"vote_average" DESC, "vote_count"',
    bayesian: '("vote_average" * LOG10("vote_count"))',
    release: '"release_date"',
    airDate: '"first_air_date"',
    revenue: '"revenue"',
    roi: 'TRY_CAST("revenue" AS DOUBLE) / NULLIF(TRY_CAST("budget" AS DOUBLE), 0)',
};

const desc = (expr) => `${expr} DESC NULLS LAST`;
const asc = (expr) => `${expr} ASC NULLS LAST`;

const S = {
    POPULAR: desc(SortExpr.popular),
    TOP_RATED: SortExpr.score, // already descending logic embedded
    BAYESIAN: desc(SortExpr.bayesian),
    NEWEST_MOVIE: desc(SortExpr.release),
    NEWEST_TV: desc(SortExpr.airDate),
    REVENUE: desc(SortExpr.revenue),
};

// === GENERI (Statici) ===
const G = {
    Movie: {
        Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
        Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36,
        Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, SciFi: 878,
        TVMovie: 10770, Thriller: 53, War: 10752, Western: 37,
    },
    TV: {
        ActionAdventure: 10759, Animation: 16, Comedy: 35, Crime: 80,
        Documentary: 99, Drama: 18, Family: 10751, Kids: 10762, Mystery: 9648,
        News: 10763, Reality: 10764, SciFiFantasy: 10765, Soap: 10766,
        Talk: 10767, WarPolitics: 10768, Western: 37,
    },
    // Utilità di conversione cross-type
    _movieToTv: { 28: 10759, 878: 10765, 14: 10765, 10752: 10768 },
    _tvToMovie: { 10759: 28, 10765: 878, 10768: 10752 },
};

// === ENTITÀ DINAMICHE (Sync da DuckDB) ===
let C = {}, P = { directors: {}, actors: {} }, N = {}, K = {};

const entitiesPath = path.join(__dirname, 'entities.json');
if (fs.existsSync(entitiesPath)) {
    try {
        const data = JSON.parse(fs.readFileSync(entitiesPath, 'utf8'));
        C = data.companies || {};
        P = data.people || { directors: {}, actors: {} };
        N = data.networks || {};
        K = data.keywords || {};
    } catch (e) {
        console.error('[Filters] Errore caricamento entities.json:', e);
    }
}

module.exports = { F, S, SortExpr, desc, asc, G, C, P, N, K };
