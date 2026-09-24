const fs = require('fs');
const path = require('path');

// === HELPER INTERNI ===
const jsonHas = (col, id) => `("${col}" LIKE '%"id":${id},%' OR "${col}" LIKE '%"id":${id}}%' OR "${col}" LIKE '%"id": ${id},%' OR "${col}" LIKE '%"id": ${id}}%')`;
const jsonHasStr = (col, val) => `"${col}" LIKE '%"${val}"%'`;

// === FILTRI CONTENUTO (F) ===
const F = {
    // --- Generi ---
    genre: (...ids) => `(${ids.map(id => jsonHas('genres', id)).join(' OR ')})`,
    genreStr: (...strs) => {
        const flatStrs = strs.flat(Infinity);
        return `(${flatStrs.map(s => {
            const strVal = String(s).trim();
            if (/^\d+$/.test(strVal)) {
                return jsonHas('genres', strVal);
            }
            return `"genres" ILIKE '%"name":"${strVal.replace(/'/g, "''")}"%'`;
        }).join(' OR ')})`;
    },
    allGenres: (...ids) => `(${ids.map(id => jsonHas('genres', id)).join(' AND ')})`,
    notGenre: (...ids) => `(${ids.map(val => {
        const strVal = String(val).trim();
        if (/^\d+$/.test(strVal)) return `NOT ${jsonHas('genres', strVal)}`;
        return `"genres" NOT ILIKE '%"name":"${strVal.replace(/'/g, "''")}"%'`;
    }).join(' AND ')})`,
    
    // --- Keywords ---
    keyword: (...ids) => `(${ids.map(id => jsonHas('keywords', id)).join(' OR ')})`,
    keywordStr: (...strs) => `(${strs.map(s => {
        const strVal = String(s).trim();
        if (/^\d+$/.test(strVal)) {
            return jsonHas('keywords', strVal);
        }
        return `"keywords" ILIKE '%"${strVal.replace(/'/g, "''")}"%'`;
    }).join(' OR ')})`,
    allKeywords: (...ids) => `(${ids.map(id => jsonHas('keywords', id)).join(' AND ')})`,
    notKeyword: (...ids) => `(${ids.map(val => {
        const strVal = String(val).trim();
        if (/^\d+$/.test(strVal)) return `NOT ${jsonHas('keywords', strVal)}`;
        return `"keywords" NOT ILIKE '%"${strVal.replace(/'/g, "''")}"%'`;
    }).join(' AND ')})`,
    
    // --- Persone ---
    director: (id) => jsonHas('directors', id),
    actor: (id) => jsonHas('cast', id),
    crew: (id) => `(${jsonHas('directors', id)} OR ${jsonHas('writers', id)})`,
    company: (...ids) => `(${ids.map(id => jsonHas('production_companies', id)).join(' OR ')})`,
    network: (...ids) => `(${ids.map(id => jsonHas('networks', id)).join(' OR ')})`,
    collections: (...ids) => {
        const validIds = ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0);
        return validIds.length > 0 ? `"collection_id" IN (${validIds.join(',')})` : '1=0';
    },
    
    // --- Lingua e Paese ---
    lang: (code) => `"original_language" = '${code}'`,
    notLang: (...codes) => codes.map(c => `"original_language" != '${c}'`).join(' AND '),
    country: (code) => jsonHasStr('production_countries', code),
    
    // --- Soglie ---
    minVotes: (n) => `"vote_count" >= ${n}`,
    maxVotes: (n) => `"vote_count" <= ${n}`,
    minScore: (n) => `"vote_average" >= ${n}`,
    maxPopularity: (n) => `"popularity" <= ${n}`,
    minRuntime: (m) => `"runtime" >= ${m}`,
    
    // --- Date ---
    releasedAfter: (d) => `"release_date" >= '${d}'`,
    releasedBefore: (d) => `"release_date" <= '${d}'`,
    releasedBetween: (from, to) => `"release_date" BETWEEN '${from}' AND '${to}'`,
    airedAfter: (d) => `"first_air_date" >= '${d}'`,
    airedBefore: (d) => `"first_air_date" <= '${d}'`,
    releasedInYear: (y) => `"release_date" BETWEEN '${y}-01-01' AND '${y}-12-31'`,
    airedInYear: (y) => `"first_air_date" BETWEEN '${y}-01-01' AND '${y}-12-31'`,
    
    // --- Watch Providers ---
    // Le colonne sono regionali: non usare il catalogo IT per un preset US.
    provider: (id, region = 'IT') => {
        const column = String(region).toUpperCase() === 'US' ? 'watch_providers_us' : 'watch_providers_it';
        return `("${column}" LIKE '%"provider_id":${id},%' OR "${column}" LIKE '%"provider_id":${id}}%' OR "${column}" LIKE '%"provider_id": ${id},%' OR "${column}" LIKE '%"provider_id": ${id}}%')`;
    },
    
    // --- Identity / Speciali ---
    // Regola canonica in SQL: store OR (genere 16 AND original_language = 'ja').
    // Le keyword non vengono valutate in SQL per evitare fragilità e falsi positivi (es. "anime-inspired").
    anime: `("id" IN (SELECT "tmdb_id" FROM anime_mappings) OR (${jsonHas('genres', 16)} AND "original_language" = 'ja'))`,
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
    score: '"vote_average" DESC, "vote_count" DESC',
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
    // Utilità di conversione cross-type (TMDB Movie ↔ TV).
    // Le tabelle sono reciproche: ogni equivalenza usata dal VSM può quindi
    // essere percorsa anche nella direzione inversa senza casi speciali.
    // 10759 (TV Action & Adventure) include Action (28) e Adventure (12).
    // 10765 (TV Sci-Fi & Fantasy) include Sci-Fi (878) e Fantasy (14).
    // 10768 (TV War & Politics) include War (10752).
    // Thriller movie è classificato Mystery TV; Romance movie è classificato Drama TV.
    _movieToTv: {
        28: [10759], 12: [10759], 878: [10765], 14: [10765], 10752: [10768],
        53: [9648], 10749: [18]
    },
    _tvToMovie: {
        10759: [28, 12], 10765: [878, 14], 10768: [10752],
        9648: [53], 18: [10749]
    },

    getEquivalentGenreIds: (genreId) => {
        const num = Number(genreId);
        if (isNaN(num)) return [];
        const result = new Set();
        if (G._tvToMovie && G._tvToMovie[num]) {
            const m = G._tvToMovie[num];
            if (Array.isArray(m)) m.forEach(id => result.add(id));
            else result.add(m);
        }
        if (G._movieToTv && G._movieToTv[num]) {
            const t = G._movieToTv[num];
            if (Array.isArray(t)) t.forEach(id => result.add(id));
            else result.add(t);
        }
        return Array.from(result);
    },

    mapGenre: (genre, targetType) => {
        const isTv = targetType === 'tv' || targetType === 'series';
        if (isTv) {
            const num = Number(genre);
            if (!isNaN(num) && G._movieToTv[num]) {
                return Array.isArray(G._movieToTv[num]) ? G._movieToTv[num][0] : G._movieToTv[num];
            }
            const str = String(genre).trim();
            if (/^\d+$/.test(str) && G._movieToTv[Number(str)]) {
                const res = G._movieToTv[Number(str)];
                return Array.isArray(res) ? res[0] : res;
            }
            const lower = str.toLowerCase();
            if (lower === 'action' || lower === 'adventure') return 'Action & Adventure';
            if (lower === 'science fiction' || lower === 'sci-fi' || lower === 'fantasy') return 'Sci-Fi & Fantasy';
            if (lower === 'war' || lower === 'war & politics') return 'War & Politics';
            if (lower === 'thriller' || lower === 'mystery') return 'Mystery';
            if (lower === 'romance' || lower === 'drama') return 'Drama';
            return genre;
        } else {
            const num = Number(genre);
            if (!isNaN(num) && G._tvToMovie[num]) {
                const res = G._tvToMovie[num];
                return Array.isArray(res) ? res : [res];
            }
            const str = String(genre).trim();
            if (/^\d+$/.test(str) && G._tvToMovie[Number(str)]) {
                const res = G._tvToMovie[Number(str)];
                return Array.isArray(res) ? res : [res];
            }
            const lower = str.toLowerCase();
            if (lower === 'action & adventure') return ['Action', 'Adventure'];
            if (lower === 'sci-fi & fantasy') return ['Science Fiction', 'Fantasy'];
            if (lower === 'war & politics') return 'War';
            if (lower === 'mystery') return ['Mystery', 'Thriller'];
            if (lower === 'drama') return ['Drama', 'Romance'];
            return genre;
        }
    },
    mapGenres: (genres, targetType) => (genres || []).flatMap(g => {
        const res = G.mapGenre(g, targetType);
        return Array.isArray(res) ? res : [res];
    })
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
