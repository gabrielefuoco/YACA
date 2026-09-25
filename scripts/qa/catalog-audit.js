#!/usr/bin/env node
/**
 * scripts/qa/catalog-audit.js
 *
 * CLI offline e deterministica per l'audit di qualità, pertinenza e overlap
 * dei cataloghi YACA (preset e ricette hero deterministiche).
 *
 * Legge esclusivamente i Parquet locali di produzione via DuckDB in-memory.
 * Nessuna chiamata di rete, nessuna connessione ad Atlas o Redis, nessun LLM.
 *
 * Riferimenti:
 * - Issue 11: .scratch/motore-raccomandazioni/issues/11-task-catalog-audit.md
 * - Decisione 03: .scratch/motore-raccomandazioni/issues/03-grilling-qa-audit-cli.md
 * - Design e misurazioni: .scratch/brainstorm/q2-catalog-qa.md
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const store = require('../../src/db/duckDbStore');
const { getPresets } = require('../../src/data/presets');
const { getDuckDbCatalogFromPreset, buildPresetFromFilters } = require('../../src/catalog/providers/DuckDbProvider');
const { F, S, G } = require('../../src/data/filters');

// --- Helper numerici e statistici ---
const norm = v => (typeof v === 'bigint' ? Number(v) : v);
const num = v => {
    const n = Number(norm(v));
    return Number.isFinite(n) ? n : null;
};

function quantile(sorted, q) {
    if (!sorted.length) return null;
    const i = (sorted.length - 1) * q;
    const lo = Math.floor(i), hi = Math.ceil(i);
    if (lo === hi) return sorted[lo];
    return +(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)).toFixed(2);
}

function formatRunDirName(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${y}-${m}-${d}-${h}${min}`;
}

function monthsAgo(m, refDate = new Date()) {
    const d = new Date(refDate);
    d.setUTCMonth(d.getUTCMonth() - m);
    return d.toISOString().slice(0, 10);
}

function daysAgo(days, refDate = new Date()) {
    const d = new Date(refDate);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

function getGitCommit() {
    try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
}

// --- Soglie Hero (allineate a catalogStrategies.js e dataFetchers.js senza import Mongoose) ---
const HIDDEN_GEMS_MAX_POPULARITY = 20;
const HIDDEN_GEMS_MAX_VOTES = 1000;
const TOP_RATED_FALLBACK_MONTHS = 60;
const DISCOVERY_FALLBACK_MONTHS = Object.freeze({ movie: 12, series: 24 });

function getHeroRecipes(type, refDate = new Date()) {
    const isMovie = type === 'movie';
    return [
        {
            id: `hero_true_blend_fallback_${type}`,
            name: `Hero True Blend Fallback (${type})`,
            note: 'fetchPopularFallbackIds (cold path, dataFetchers.js:203)',
            type,
            where: [F.minVotes(50)],
            orderBy: S.POPULAR
        },
        {
            id: `hero_true_blend_warm_base_${type}`,
            name: `Hero True Blend Warm Base (${type})`,
            note: 'baseFilters buildTopGenresMixCatalog (catalogStrategies.js:597): F.minVotes(1000)',
            type,
            where: [F.minVotes(1000)],
            orderBy: S.POPULAR
        },
        {
            id: `hero_seed_network_fallback_${type}`,
            name: `Hero Seed Network Fallback (${type})`,
            note: 'fetchTopRatedPeriodFallbackIds (dataFetchers.js:216): ultimi 60 mesi, voti>=100, media>=6.5',
            type,
            where: [
                isMovie ? F.releasedAfter(monthsAgo(TOP_RATED_FALLBACK_MONTHS, refDate)) : F.airedAfter(monthsAgo(TOP_RATED_FALLBACK_MONTHS, refDate)),
                F.minVotes(100),
                F.minScore(6.5)
            ],
            orderBy: S.TOP_RATED
        },
        {
            id: `hero_hidden_gems_builder_${type}`,
            name: `Hero Hidden Gems Builder (${type})`,
            note: 'builder warm (catalogStrategies.js:812): 6.5+/50-1000 voti/pop<=20' + (isMovie ? '/runtime>=60' : ''),
            type,
            where: [
                F.minScore(6.5),
                F.minVotes(50),
                F.maxVotes(HIDDEN_GEMS_MAX_VOTES),
                F.maxPopularity(HIDDEN_GEMS_MAX_POPULARITY),
                ...(isMovie ? [F.minRuntime(60)] : [])
            ],
            orderBy: S.TOP_RATED
        },
        {
            id: `hero_hidden_gems_fallback_${type}`,
            name: `Hero Hidden Gems Fallback (${type})`,
            note: 'fetchHiddenGemsFallbackIds (dataFetchers.js:252): media>=7.0, 50-1000 voti, pop<=20',
            type,
            where: [
                F.minVotes(50),
                F.maxVotes(HIDDEN_GEMS_MAX_VOTES),
                F.minScore(7.0),
                F.maxPopularity(HIDDEN_GEMS_MAX_POPULARITY)
            ],
            orderBy: S.TOP_RATED
        },
        {
            id: `hero_trakt_fallback_${type}`,
            name: `Hero Trakt Fallback (${type})`,
            note: `fetchUndiscoveredFallbackIds (dataFetchers.js:234): ultimi ${DISCOVERY_FALLBACK_MONTHS[type]} mesi, voti>=${isMovie ? 10 : 20}, media>=5.5`,
            type,
            where: [
                isMovie ? F.releasedAfter(monthsAgo(DISCOVERY_FALLBACK_MONTHS[type], refDate)) : F.airedAfter(monthsAgo(DISCOVERY_FALLBACK_MONTHS[type], refDate)),
                F.minVotes(isMovie ? 10 : 20),
                F.minScore(5.5)
            ],
            orderBy: isMovie ? S.NEWEST_MOVIE : S.NEWEST_TV
        }
    ];
}

// Famiglie architetturali
const FAMILIES = {
    netflix: ['preset_netflix', 'preset_netflix_movies'],
    hbo: ['preset_hbo', 'preset_hbo_max_series', 'preset_hbo_max_movies'],
    amazon: ['preset_amazon', 'preset_amazon_movies'],
    disney: ['preset_disney_plus', 'preset_disney_movies', 'preset_disney_animation'],
    anime: ['preset_pop_anime', 'preset_anime_shonen', 'preset_anime_seinen', 'preset_anime_shoujo', 'preset_anime_slice_of_life', 'preset_anime_mecha', 'preset_anime_isekai', 'preset_anime_dark', 'preset_anime_action', 'preset_anime_sports', 'preset_anime_classic', 'preset_anime_00s', 'preset_ghibli', 'preset_anime_movies_top', 'preset_anime_movies_romance'],
    top: ['preset_pop_movies', 'preset_top_rated_movies', 'preset_top_current_year', 'preset_blockbusters', 'preset_oscar_winners', 'preset_cult_classics'],
    docs: ['preset_nature_docs', 'preset_nature_series_docs', 'preset_space_docs', 'preset_sea_movie_docs', 'preset_sea_series_docs'],
    kids: ['preset_pixar', 'preset_dreamworks', 'preset_disney_animation', 'preset_family_movies_live', 'preset_kids_series', 'preset_anime_kids_movies', 'preset_anime_kids_series']
};

function getFamily(id) {
    for (const [f, members] of Object.entries(FAMILIES)) {
        if (members.includes(id)) return f;
    }
    return null;
}

// --- Normalizzazione Item e Calcolo Qualità ---
function compactItem(it) {
    const raw = it.rawTMDB || {};
    return {
        id: num(it._tmdbId ?? String(it.id || '').replace(/^tmdb:/i, '')),
        name: it.name || it.title || raw.title || raw.name || 'Unknown',
        year: it.releaseInfo || (raw.release_date ? raw.release_date.slice(0, 4) : null) || (raw.first_air_date ? raw.first_air_date.slice(0, 4) : null),
        votes: num(it.vote_count ?? raw.vote_count),
        score: raw.vote_average !== undefined && raw.vote_average !== null ? Number(raw.vote_average) : (it.imdbRating ? Number(it.imdbRating) : null),
        pop: num(it.popularity ?? raw.popularity),
        genres: (raw.genres || []).map(g => (g && typeof g === 'object' ? Number(g.id) : Number(g))).filter(Number.isFinite),
        kw: (it.keywords || raw.keywords?.results || raw.keywords?.keywords || []).map(k => (k && typeof k === 'object' ? Number(k.id) : Number(k))).filter(Number.isFinite),
        lang: raw.original_language || null,
        poster: Boolean(it.poster || raw.poster_path),
        type: it.type || (raw.release_date ? 'movie' : 'series'),
        adult: raw.adult === true
    };
}

function qualityOf(items) {
    const votes = items.map(i => i.votes).filter(v => v !== null).sort((a, b) => a - b);
    const scores = items.map(i => i.score).filter(v => v !== null).sort((a, b) => a - b);
    const pops = items.map(i => i.pop).filter(v => v !== null).sort((a, b) => a - b);
    const ids = items.map(i => i.id);
    const dupes = ids.length - new Set(ids).size;
    const kwEmpty = items.filter(i => !i.kw || i.kw.length === 0).length;
    const gEmpty = items.filter(i => !i.genres || i.genres.length === 0).length;
    const noScore = items.filter(i => i.score === null).length;
    const noYear = items.filter(i => !i.year).length;
    const noPoster = items.filter(i => !i.poster).length;
    const zeroVotes = votes.filter(v => v === 0).length;
    const lowVotes = votes.filter(v => v < 50).length;
    const lowScore = scores.filter(v => v < 6.0).length;
    const n = items.length || 1;
    return {
        n: items.length,
        votes: {
            min: votes[0] ?? null,
            p10: quantile(votes, 0.1),
            med: quantile(votes, 0.5),
            p90: quantile(votes, 0.9),
            max: votes[votes.length - 1] ?? null
        },
        score: {
            p10: quantile(scores, 0.1),
            med: quantile(scores, 0.5),
            p90: quantile(scores, 0.9)
        },
        pop: {
            med: quantile(pops, 0.5),
            p90: quantile(pops, 0.9)
        },
        dupes,
        kwEmpty,
        kwEmptyPct: +(100 * kwEmpty / n).toFixed(1),
        gEmpty,
        gEmptyPct: +(100 * gEmpty / n).toFixed(1),
        noScorePct: +(100 * noScore / n).toFixed(1),
        noYearPct: +(100 * noYear / n).toFixed(1),
        noPosterPct: +(100 * noPoster / n).toFixed(1),
        zeroVotesPct: +(100 * zeroVotes / n).toFixed(1),
        lowVotesPct: +(100 * lowVotes / n).toFixed(1),
        lowScorePct: +(100 * lowScore / n).toFixed(1)
    };
}

async function queryPoolCount(preset) {
    const table = preset.type === 'movie' ? 'movies' : 'tv';
    const where = ['adult = false', ...(preset.where || [])].join(' AND ');
    const r = await store.query(`SELECT count(*) AS n FROM ${table} WHERE ${where}`);
    return num(r[0]?.n);
}

// --- CLI Parsing ---
function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        preset: 'all',
        type: 'all',
        dumpDir: null,
        outDir: null,
        compare: null,
        run: null,
        gate: false,
        json: false,
        k: 40,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') opts.help = true;
        else if (arg === '--preset' && args[i + 1]) opts.preset = args[++i];
        else if (arg === '--type' && args[i + 1]) opts.type = args[++i];
        else if (arg === '--dump-dir' && args[i + 1]) opts.dumpDir = args[++i];
        else if (arg === '--out-dir' && args[i + 1]) opts.outDir = args[++i];
        else if (arg === '--compare' && args[i + 1]) opts.compare = args[++i];
        else if (arg === '--run' && args[i + 1]) opts.run = args[++i];
        else if (arg === '--gate') opts.gate = true;
        else if (arg === '--json') opts.json = true;
        else if (arg === '--k' && args[i + 1]) opts.k = Number(args[++i]) || 40;
    }
    return opts;
}

function resolveDumpDir(custom) {
    if (custom && fs.existsSync(custom)) return path.resolve(custom);
    const p1 = path.resolve(__dirname, '../../.cache/tmdb');
    if (fs.existsSync(path.join(p1, 'movies.parquet'))) return p1;
    const p2 = path.resolve(__dirname, '../../.scratch/brainstorm/data');
    if (fs.existsSync(path.join(p2, 'movies.parquet'))) return p2;
    return p1;
}

// --- Funzioni Principali dell'Audit ---
async function main() {
    const opts = parseArgs();
    if (opts.help) {
        console.log(`
Uso: node scripts/qa/catalog-audit.js [opzioni]

Opzioni:
  --preset <id|all>    Audit su un singolo preset o 'all' (default: all)
  --type <movie|tv|all> Filtra per media type (default: all)
  --dump-dir <path>    Percorso directory file parquet (default: .cache/tmdb)
  --out-dir <path>     Cartella output (default: .scratch/motore-raccomandazioni/runs/audit/<data>)
  --compare <file>     Percorso audit.json precedente per calcolo diff (se omesso cerca l'ultima run)
  --run <dir>          Verifica conformità payload serviti estratti da simulate.js fetch
  --k <20|40|100>      Profondità analisi (default: 40)
  --gate               Arma il gate (esce con codice 1 se presenti finding 'blocking')
                       NOTA: Il gate è DISATTIVATO per default (modalità report)
  --json               Stampa esclusivamente JSON su stdout
  --help, -h           Mostra questo messaggio di aiuto
`);
        process.exit(0);
    }

    const tStart = Date.now();
    const runTimestamp = new Date();
    const runDirName = formatRunDirName(runTimestamp);
    const gitCommit = getGitCommit();

    // 1. Inizializzazione Store DuckDB
    const dumpDir = resolveDumpDir(opts.dumpDir);
    store.basePath = dumpDir;
    store.moviesParquetPath = path.join(dumpDir, 'movies.parquet');
    store.tvParquetPath = path.join(dumpDir, 'tv.parquet');

    const tDuckInit0 = Date.now();
    await store.init();
    const duckDbInitMs = Date.now() - tDuckInit0;

    // Congelamento date di run
    const frozenDates = {
        referenceTimestamp: runTimestamp.toISOString(),
        referenceDate: runTimestamp.toISOString().slice(0, 10),
        newMoviesWindow: {
            start: '2026-07-25',
            end: '2026-09-25'
        },
        newSeriesWindow: {
            start: '2026-03-25',
            end: '2026-09-25'
        },
        newSeriesEpsWindow: {
            start: '2026-09-11',
            end: '2026-09-25'
        },
        heroRollingWindows: {
            topRatedFallbackMonths: TOP_RATED_FALLBACK_MONTHS,
            topRatedFallbackStart: monthsAgo(TOP_RATED_FALLBACK_MONTHS, runTimestamp),
            discoveryMovieMonths: DISCOVERY_FALLBACK_MONTHS.movie,
            discoveryMovieStart: monthsAgo(DISCOVERY_FALLBACK_MONTHS.movie, runTimestamp),
            discoverySeriesMonths: DISCOVERY_FALLBACK_MONTHS.series,
            discoverySeriesStart: monthsAgo(DISCOVERY_FALLBACK_MONTHS.series, runTimestamp)
        }
    };

    // 2. Caricamento Preset e Ricette Hero
    const rawPresets = getPresets();
    const skippedPresets = [];
    const targetPresets = [];

    for (const p of rawPresets) {
        if (p.id === 'preset_anime_simulcast' || p._provider === 'airing_state' || p._provider === 'anilist_simulcast') {
            skippedPresets.push({
                id: p.id,
                name: p.name,
                reason: `provider=${p._provider || 'airing_state'} (catalogo dinamico streaming non-SQL)`
            });
            continue;
        }
        if (!Array.isArray(p.where)) {
            skippedPresets.push({
                id: p.id,
                name: p.name,
                reason: 'no where array'
            });
            continue;
        }
        if (opts.type !== 'all') {
            const matchType = opts.type === 'series' || opts.type === 'tv' ? (p.type === 'tv' || p.type === 'series') : p.type === opts.type;
            if (!matchType) continue;
        }
        if (opts.preset !== 'all' && p.id !== opts.preset) {
            continue;
        }
        targetPresets.push(p);
    }

    const heroCatalogs = [];
    if (opts.preset === 'all') {
        const types = opts.type === 'all' ? ['movie', 'series'] : [(opts.type === 'movie' ? 'movie' : 'series')];
        for (const tp of types) {
            heroCatalogs.push(...getHeroRecipes(tp, runTimestamp));
        }
    }

    // 3. Esecuzione Preset & Cattura Metriche di Base
    const catalogs = [];
    const catalogsById = new Map();

    for (const p of targetPresets) {
        const t0 = Date.now();
        let items = [];
        let err = null;
        try {
            items = await getDuckDbCatalogFromPreset({ type: p.type, where: p.where, orderBy: p.orderBy }, 0, 120);
        } catch (e) {
            err = e.message;
        }
        const msQuery = Date.now() - t0;
        let pool = null;
        if (!err) {
            try {
                pool = await queryPoolCount(p);
            } catch (e) {
                pool = null;
                err = e.message;
            }
        }
        const compact = items.map(compactItem);
        const q = qualityOf(compact);
        const record = {
            kind: 'preset',
            id: p.id,
            name: `${p.emoji || ''} ${p.name}`.trim(),
            type: p.type,
            category: p.category,
            queries: p.queries,
            where: p.where,
            orderBy: p.orderBy,
            pool,
            itemsCount: compact.length,
            msQuery,
            quality: q,
            error: err,
            items: compact
        };
        catalogs.push(record);
        catalogsById.set(p.id, record);
    }

    // Esecuzione Ricette Hero
    for (const h of heroCatalogs) {
        const t0 = Date.now();
        let items = [];
        let err = null;
        try {
            items = await getDuckDbCatalogFromPreset({ type: h.type, where: h.where, orderBy: h.orderBy }, 0, 120);
        } catch (e) {
            err = e.message;
        }
        const msQuery = Date.now() - t0;
        const compact = items.map(compactItem);
        const q = qualityOf(compact);
        const record = {
            kind: 'hero-recipe',
            id: h.id,
            name: h.name,
            note: h.note,
            type: h.type,
            category: 'Hero Fallback / Builder',
            where: h.where,
            orderBy: h.orderBy,
            pool: compact.length,
            itemsCount: compact.length,
            msQuery,
            quality: q,
            error: err,
            items: compact
        };
        catalogs.push(record);
        catalogsById.set(h.id, record);
    }

    // --- CONTROLLI DI AUDIT & GENERAZIONE FINDING ---
    const findings = [];
    const addFinding = (level, code, preset, message, metrics = {}) => {
        findings.push({
            level, // 'blocking' | 'warning'
            code,
            preset,
            message,
            metrics
        });
    };

    // Controllo 4: Drift queries[0] <-> where e orderBy
    for (const p of targetPresets) {
        const q0 = (p.queries || [])[0];
        if (!q0) {
            addFinding('blocking', 'DRIFT_NO_QUERY', p.id, 'Preset privo di queries[0]');
            continue;
        }
        let built;
        try {
            built = buildPresetFromFilters({ ...q0 }, p.type);
        } catch (e) {
            addFinding('blocking', 'DRIFT_COMPILATION_ERROR', p.id, `Errore buildPresetFromFilters: ${e.message}`);
            continue;
        }

        const whereStored = (p.where || []).join(' AND ');
        const whereCompiled = (built.where || []).join(' AND ');
        if (whereStored !== whereCompiled) {
            addFinding('blocking', 'DRIFT_WHERE_MISMATCH', p.id,
                `Drift tra intent dichiarato in queries[0] e preset.where memorizzato`,
                { stored: whereStored, compiled: whereCompiled }
            );
        }

        const orderStored = p.orderBy || '';
        const orderCompiled = built.orderBy || '';
        if (orderStored !== orderCompiled) {
            const isKnownBurton = p.id === 'preset_burton';
            addFinding('warning', 'DRIFT_ORDER_BY_MISMATCH', p.id,
                `Drift su orderBy tra queries[0] e memorizzato${isKnownBurton ? ' (tie-breaker intenzionale su burton)' : ''}`,
                { stored: orderStored, compiled: orderCompiled, intentional: isKnownBurton }
            );
        }
    }

    // Controllo 1 & 2: Dead Keywords, Resa Marginale e Ridondanza
    const KW_RE = /"id":\s*(\d+)/g;
    const referencedKw = new Map(); // kwId -> { positive: Set, negative: Set }

    for (const p of targetPresets) {
        for (const clause of (p.where || [])) {
            if (!/keywords/i.test(clause)) continue;
            const isNeg = /\bNOT\b/i.test(clause);
            KW_RE.lastIndex = 0;
            let m;
            while ((m = KW_RE.exec(clause)) !== null) {
                const id = Number(m[1]);
                if (!referencedKw.has(id)) referencedKw.set(id, { positive: new Set(), negative: new Set() });
                const rec = referencedKw.get(id);
                (isNeg ? rec.negative : rec.positive).add(p.id);
            }
        }
    }

    // Calcolo frequenza globale keyword su dump
    const kwIdList = [...referencedKw.keys()].sort((a, b) => a - b);
    const kwNames = new Map();
    const kwGlobalFreq = new Map();

    if (kwIdList.length > 0) {
        const inList = kwIdList.join(',');
        for (const table of ['movies', 'tv']) {
            const q = `
                SELECT kwid, any_value(kwname) AS kwname, count(*) AS n FROM (
                    SELECT CAST(json_extract_string(kw,'$.id') AS BIGINT) AS kwid,
                           json_extract_string(kw,'$.name') AS kwname
                    FROM ${table} t, unnest(CAST(json_extract(t.keywords,'$[*]') AS JSON[])) AS u(kw)
                ) WHERE kwid IN (${inList}) GROUP BY kwid`;
            try {
                const rows = await store.query(q);
                for (const r of rows) {
                    const id = Number(num(r.kwid));
                    if (r.kwname && !kwNames.has(id)) kwNames.set(id, r.kwname);
                    kwGlobalFreq.set(id, (kwGlobalFreq.get(id) || 0) + Number(num(r.n)));
                }
            } catch (e) {
                // dump query error
            }
        }
    }

    // Valutazione marginale per ogni gruppo OR di keyword
    const marginalStats = [];
    const deadKeywordsSummary = [];
    const redundantKeywordsSummary = [];
    const lowYieldKeywordsSummary = [];

    for (const p of targetPresets) {
        const table = p.type === 'movie' ? 'movies' : 'tv';
        let presetTotalKwOccurrences = 0;
        let presetDeadKwCount = 0;

        const clauses = p.where || [];
        for (let idx = 0; idx < clauses.length; idx++) {
            const clause = clauses[idx];
            if (!/keywords/i.test(clause) || /\bNOT\b/i.test(clause)) continue;
            KW_RE.lastIndex = 0;
            const ids = [...new Set([...clause.matchAll(KW_RE)].map(m => Number(m[1])))];
            if (ids.length === 0) continue;

            presetTotalKwOccurrences += ids.length;
            const others = clauses.filter((_, i) => i !== idx);
            const baseWhere = ['adult = false', ...others].join(' AND ');
            const conds = ids.map(id => F.keyword(id));
            const clauseExpr = `(${conds.join(' OR ')})`;

            const sums = [];
            ids.forEach((id, i) => {
                const rest = conds.filter((_, j) => j !== i);
                sums.push(`sum(CASE WHEN ${conds[i]} THEN 1 ELSE 0 END) AS p${i}`);
                sums.push(rest.length ? `sum(CASE WHEN ${conds[i]} AND NOT (${rest.join(' OR ')}) THEN 1 ELSE 0 END) AS e${i}` : `count(*) AS e${i}`);
            });

            const sql = `SELECT count(*) AS pool, ${sums.join(', ')} FROM ${table} WHERE ${baseWhere} AND ${clauseExpr}`;
            try {
                const rows = await store.query(sql);
                const row = rows[0] || {};
                const pool = Number(num(row.pool) || 0);

                const perKw = ids.map((id, i) => {
                    const present = Number(num(row['p' + i]) || 0);
                    const exclusive = Number(num(row['e' + i]) || 0);
                    const kwName = kwNames.get(id) || String(id);
                    const globalCount = kwGlobalFreq.get(id) || 0;

                    if (present === 0) {
                        presetDeadKwCount++;
                        deadKeywordsSummary.push({ preset: p.id, kwId: id, name: kwName, globalFreq: globalCount });
                    } else if (exclusive === 0) {
                        redundantKeywordsSummary.push({ preset: p.id, kwId: id, name: kwName, present, pool });
                        addFinding('warning', 'KEYWORD_REDUNDANT', p.id,
                            `Keyword ${id} ('${kwName}') ridondante al 100% (presente in ${present} item, esclusivi=0 su pool=${pool})`,
                            { kwId: id, name: kwName, present, exclusive: 0, pool }
                        );
                    } else if (pool > 0 && (exclusive / pool) < 0.05) {
                        lowYieldKeywordsSummary.push({ preset: p.id, kwId: id, name: kwName, exclusive, pool, pct: +(100 * exclusive / pool).toFixed(1) });
                        addFinding('warning', 'KEYWORD_LOW_MARGINAL_YIELD', p.id,
                            `Keyword ${id} ('${kwName}') a bassa resa marginale: solo ${exclusive}/${pool} item esclusivi (${(100 * exclusive / pool).toFixed(1)}% < 5%)`,
                            { kwId: id, name: kwName, exclusive, pool, pct: +(100 * exclusive / pool).toFixed(1) }
                        );
                    }

                    return { kwId: id, name: kwName, present, exclusive, pool };
                });

                marginalStats.push({ preset: p.id, clauseIdx: idx, ids, pool, perKw });
            } catch (e) {
                // query error su clausola
            }
        }

        // Severità Dead Keywords per preset
        if (presetTotalKwOccurrences > 0 && presetDeadKwCount > 0) {
            const deadRatio = presetDeadKwCount / presetTotalKwOccurrences;
            const isBlocking = deadRatio > 0.30;
            const deadInThis = deadKeywordsSummary.filter(d => d.preset === p.id);

            deadInThis.forEach(d => {
                addFinding(
                    isBlocking ? 'blocking' : 'warning',
                    'DEAD_KEYWORD',
                    p.id,
                    `Keyword morta ${d.kwId} ('${d.name}') porta 0 item nel pool del preset (frequenza globale dump: ${d.globalFreq})${isBlocking ? ' [BLOCCANTE: >30% keyword morte nel preset]' : ''}`,
                    { kwId: d.kwId, name: d.name, globalFreq: d.globalFreq, deadRatio: +(deadRatio * 100).toFixed(1) }
                );
            });
        }
    }

    // Controllo 3: Keyword Alienata via co-occorrenza genere <-> keyword sul dump
    if (kwIdList.length > 0) {
        const inList = kwIdList.join(',');
        for (const table of ['movies', 'tv']) {
            const coocSql = `
                SELECT CAST(json_extract_string(kw,'$.id') AS BIGINT) AS kwid,
                       CAST(json_extract_string(jw,'$.id') AS BIGINT) AS gid,
                       count(*) AS n
                FROM ${table} t,
                     unnest(CAST(json_extract(t.keywords,'$[*]') AS JSON[])) AS u(kw),
                     unnest(CAST(json_extract(t.genres,'$[*]') AS JSON[])) AS g(jw)
                WHERE CAST(json_extract_string(kw,'$.id') AS BIGINT) IN (${inList})
                GROUP BY 1, 2`;

            const totalSql = `
                SELECT CAST(json_extract_string(kw,'$.id') AS BIGINT) AS kwid, count(*) AS total
                FROM ${table} t, unnest(CAST(json_extract(t.keywords,'$[*]') AS JSON[])) AS u(kw)
                WHERE CAST(json_extract_string(kw,'$.id') AS BIGINT) IN (${inList})
                GROUP BY 1`;

            try {
                const [coocRows, totalRows] = await Promise.all([store.query(coocSql), store.query(totalSql)]);
                const totals = new Map();
                for (const r of totalRows) totals.set(Number(num(r.kwid)), Number(num(r.total)));

                const coocMap = new Map(); // kwId -> Map(gid -> count)
                for (const r of coocRows) {
                    const kid = Number(num(r.kwid));
                    const gid = Number(num(r.gid));
                    if (!coocMap.has(kid)) coocMap.set(kid, new Map());
                    coocMap.get(kid).set(gid, Number(num(r.n)));
                }

                // Verifica per preset corrispondenti a questa tabella
                const expectedType = table === 'movies' ? 'movie' : 'series';
                for (const p of targetPresets.filter(x => x.type === expectedType)) {
                    // Estrai generi target del preset
                    const targetGids = new Set();
                    if (p.queries && p.queries[0]?.with_genres) {
                        String(p.queries[0].with_genres).split(/[|,]/).forEach(g => {
                            const n = Number(g.trim());
                            if (Number.isFinite(n) && n > 0) targetGids.add(n);
                        });
                    }
                    for (const cl of (p.where || [])) {
                        if (/genres/i.test(cl) && !/\bNOT\b/i.test(cl)) {
                            KW_RE.lastIndex = 0;
                            let m;
                            while ((m = KW_RE.exec(cl)) !== null) targetGids.add(Number(m[1]));
                        }
                    }

                    if (targetGids.size === 0) continue;

                    // Controlla le keyword positive dichiarate in questo preset
                    for (const cl of (p.where || [])) {
                        if (!/keywords/i.test(cl) || /\bNOT\b/i.test(cl)) continue;
                        KW_RE.lastIndex = 0;
                        let m;
                        while ((m = KW_RE.exec(cl)) !== null) {
                            const kid = Number(m[1]);
                            const tot = totals.get(kid) || 0;
                            if (tot < 100) continue; // solo su volume significativo nel dump

                            const gCounts = coocMap.get(kid) || new Map();
                            let matched = 0;
                            for (const tg of targetGids) {
                                matched += gCounts.get(tg) || 0;
                            }
                            const pCooc = matched / tot;
                            if (pCooc < 0.15) {
                                const kwName = kwNames.get(kid) || String(kid);
                                addFinding('warning', 'SEMANTIC_DIVERGENCE', p.id,
                                    `Keyword ${kid} ('${kwName}') presenta divergenza semantica: co-occorrenza con generi target [${[...targetGids].join(',')}] sul dump globale è solo ${(100 * pCooc).toFixed(1)}% (< 15%) su ${tot} titoli`,
                                    { kwId: kid, name: kwName, totalDump: tot, matchedTarget: matched, pCooc: +(pCooc * 100).toFixed(1), targetGenres: [...targetGids] }
                                );
                            }
                        }
                    }
                }
            } catch (e) {
                // ignore
            }
        }
    }

    // Controllo 5: Verifica Item <-> Where (con finestra date congelata)
    for (const cat of catalogs) {
        if (!cat.items || cat.items.length === 0 || !cat.where) continue;
        const ids = cat.items.map(i => i.id).filter(Boolean);
        if (ids.length === 0) continue;

        const table = cat.type === 'movie' ? 'movies' : 'tv';
        const fullWhere = ['adult = false', ...cat.where].join(' AND ');
        const testSql = `SELECT id FROM ${table} WHERE id IN (${ids.join(',')}) AND NOT (${fullWhere})`;
        try {
            const violated = await store.query(testSql);
            if (violated.length > 0) {
                const badIds = violated.map(v => Number(num(v.id)));
                addFinding('blocking', 'WHERE_VIOLATION', cat.id,
                    `${badIds.length} item restituiti dal catalogo violano la clausola WHERE congelata nel run`,
                    { violatedIds: badIds, table, referenceDate: frozenDates.referenceDate }
                );
            }
        } catch (e) {
            // where verification query error
        }
    }

    // Verifica facoltativa di una run esterna passata con --run
    if (opts.run) {
        const runPath = path.resolve(opts.run);
        if (fs.existsSync(runPath)) {
            // Audit dei payload serviti da simulate.js
            console.log(`[catalog-audit] Verifica payload serviti in run: ${runPath}`);
            const rawDir = path.join(runPath, 'raw');
            if (fs.existsSync(rawDir)) {
                for (const prof of fs.readdirSync(rawDir)) {
                    const profDir = path.join(rawDir, prof);
                    if (!fs.statSync(profDir).isDirectory()) continue;
                    for (const f of fs.readdirSync(profDir)) {
                        const m = /^yaca_preset_(preset_[a-z0-9_]+)-(movie|series)\.json$/.exec(f);
                        if (!m) continue;
                        const presetId = m[1];
                        const preset = catalogsById.get(presetId);
                        if (!preset || !preset.where) continue;
                        try {
                            const rawJson = JSON.parse(fs.readFileSync(path.join(profDir, f), 'utf8'));
                            const itemIds = (rawJson.rawPages || []).flatMap(p => (p.data?.metas || []).map(it => Number(String(it.id).replace(/^tmdb:/, '')))).filter(Boolean);
                            if (itemIds.length > 0) {
                                const table = preset.type === 'movie' ? 'movies' : 'tv';
                                const fullWhere = ['adult = false', ...preset.where].join(' AND ');
                                const violRows = await store.query(`SELECT id FROM ${table} WHERE id IN (${itemIds.join(',')}) AND NOT (${fullWhere})`);
                                if (violRows.length > 0) {
                                    addFinding('blocking', 'SERVED_PAYLOAD_WHERE_VIOLATION', presetId,
                                        `${violRows.length} item serviti in produzione (run ${prof}) violano il WHERE congelato`,
                                        { run: opts.run, profile: prof, violatedIds: violRows.map(r => Number(num(r.id))) }
                                    );
                                }
                            }
                        } catch (e) {}
                    }
                }
            }
        }
    }

    // Controllo 6: Igiene Metadati (duplicati, tipo errato, poster, anno, generi)
    for (const cat of catalogs) {
        if (!cat.quality) continue;
        const q = cat.quality;

        // Duplicati intra-catalogo
        if (q.dupes > 0) {
            addFinding('blocking', 'INTRA_CATALOG_DUPLICATES', cat.id,
                `Presenza di ${q.dupes} item duplicati all'interno dei primi ${q.n} item del catalogo`,
                { dupes: q.dupes, totalItems: q.n }
            );
        }

        // Tipo errato
        const wrongTypeItems = cat.items.filter(it => it.type && it.type !== (cat.type === 'series' || cat.type === 'tv' ? 'series' : 'movie'));
        if (wrongTypeItems.length > 0) {
            addFinding('blocking', 'WRONG_MEDIA_TYPE', cat.id,
                `${wrongTypeItems.length} item con media type disallineato rispetto al catalogo (${cat.type})`,
                { wrongCount: wrongTypeItems.length }
            );
        }

        // Mancanza poster > 1%
        if (q.noPosterPct > 1.0) {
            addFinding('warning', 'MISSING_POSTER', cat.id,
                `${q.noPosterPct}% degli item privi di poster/copertina (soglia tolleranza: 1.0%)`,
                { noPosterPct: q.noPosterPct }
            );
        }

        // Mancanza anno
        if (q.noYearPct > 0) {
            addFinding('warning', 'MISSING_YEAR', cat.id,
                `${q.noYearPct}% degli item privi di anno/data di uscita`,
                { noYearPct: q.noYearPct }
            );
        }

        // Mancanza generi > 5%
        if (q.gEmptyPct > 5.0) {
            addFinding('warning', 'MISSING_GENRES', cat.id,
                `${q.gEmptyPct}% degli item privi di generi assegnati`,
                { gEmptyPct: q.gEmptyPct }
            );
        }

        // Mancanza keyword > 10%
        if (q.kwEmptyPct > 10.0) {
            addFinding('warning', 'MISSING_KEYWORDS', cat.id,
                `${q.kwEmptyPct}% degli item privi di keyword TMDB (compromette l'alimentazione del TasteProfile VSM)`,
                { kwEmptyPct: q.kwEmptyPct }
            );
        }
    }

    // Controllo 7: Coda Lunga vs Mainstream e Volumetria Pool
    for (const cat of catalogs) {
        if (cat.kind !== 'preset') continue;
        const pool = cat.pool;
        if (pool !== null && typeof pool === 'number') {
            if (pool < 10) {
                addFinding('blocking', 'POOL_CRITICAL_TOO_SMALL', cat.id,
                    `Pool di soli ${pool} item (inferiore alla soglia vitale minima di 10 item)`,
                    { pool }
                );
            } else if (pool < 20) {
                addFinding('warning', 'POOL_LOW', cat.id,
                    `Pool ridotto di ${pool} item (inferiore a 1 pagina Stremio completa da 20 item)`,
                    { pool }
                );
            }
        }

        // Score mediano < 6.0
        if (cat.quality?.score?.med !== null && cat.quality.score.med < 6.0) {
            addFinding('warning', 'SCORE_MEDIAN_LOW', cat.id,
                `Score mediano insufficiente: ${cat.quality.score.med} (< 6.0)`,
                { scoreMed: cat.quality.score.med }
            );
        }

        // Mediana voti troppo bassa per cataloghi Popolari / Blockbuster
        const isMainstream = /pop_|blockbuster|marvel|dc|oscar/i.test(cat.id);
        if (isMainstream && cat.quality?.votes?.med !== null && cat.quality.votes.med < 500) {
            addFinding('warning', 'MAINSTREAM_VOTES_ANOMALY', cat.id,
                `Catalogo catalogato come Popolare/Mainstream con mediana voti anomala (${cat.quality.votes.med} < 500)`,
                { votesMed: cat.quality.votes.med }
            );
        }
    }

    // --- MATRICE DI OVERLAP (Jaccard & Containment @20, 40, 100) ---
    const allSets = catalogs.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type === 'tv' ? 'series' : c.type,
        kind: c.kind,
        category: c.category,
        ids: c.items.map(i => `tmdb:${i.id}`),
        s20: new Set(c.items.slice(0, 20).map(i => `tmdb:${i.id}`)),
        s40: new Set(c.items.slice(0, 40).map(i => `tmdb:${i.id}`)),
        s100: new Set(c.items.slice(0, 100).map(i => `tmdb:${i.id}`))
    }));

    function calcInter(sA, sB, arrA) {
        let n = 0;
        for (let i = 0; i < arrA.length; i++) {
            if (sB.has(arrA[i])) n++;
        }
        return n;
    }

    const overlapPairs = [];
    for (let i = 0; i < allSets.length; i++) {
        for (let j = i + 1; j < allSets.length; j++) {
            const A = allSets[i];
            const B = allSets[j];
            if (A.type !== B.type) continue; // separate tables = 0 overlap

            const lenA = A.ids.length;
            const lenB = B.ids.length;
            if (Math.min(lenA, lenB) < 10) continue;

            const n20A = Math.min(20, lenA), n20B = Math.min(20, lenB);
            const inter20 = calcInter(A.s20, B.s20, A.ids.slice(0, n20A));
            const j20 = (n20A + n20B - inter20) > 0 ? +(inter20 / (n20A + n20B - inter20)).toFixed(3) : 0;

            const n40A = Math.min(40, lenA), n40B = Math.min(40, lenB);
            const inter40 = calcInter(A.s40, B.s40, A.ids.slice(0, n40A));
            const j40 = (n40A + n40B - inter40) > 0 ? +(inter40 / (n40A + n40B - inter40)).toFixed(3) : 0;

            const n100A = Math.min(100, lenA), n100B = Math.min(100, lenB);
            const inter100 = calcInter(A.s100, B.s100, A.ids.slice(0, n100A));
            const j100 = (n100A + n100B - inter100) > 0 ? +(inter100 / (n100A + n100B - inter100)).toFixed(3) : 0;

            const cAinB40 = n40A > 0 ? +(inter40 / n40A).toFixed(3) : 0;
            const cBinA40 = n40B > 0 ? +(inter40 / n40B).toFixed(3) : 0;
            const maxCont = Math.max(cAinB40, cBinA40);

            const pair = {
                a: A.id,
                b: B.id,
                type: A.type,
                kindA: A.kind,
                kindB: B.kind,
                j20,
                j40,
                j100,
                cAinB40,
                cBinA40,
                maxCont,
                inter40
            };
            overlapPairs.push(pair);

            // Valutazione severità overlap
            const famA = getFamily(A.id);
            const famB = getFamily(B.id);
            const isSameFamily = famA && famA === famB;

            if (j40 >= 0.70) {
                addFinding('blocking', 'HIGH_OVERLAP_CRITICAL', `${A.id} <-> ${B.id}`,
                    `Overlap critico tra ${A.id} e ${B.id} (${A.type}): J@40=${j40} (intersezione ${inter40}/40 item, containment ${maxCont})`,
                    pair
                );
            } else if (j40 >= 0.30 && !isSameFamily) {
                addFinding('warning', 'HIGH_OVERLAP_WARNING', `${A.id} <-> ${B.id}`,
                    `Overlap rilevante tra ${A.id} e ${B.id} (${A.type}): J@40=${j40} (intersezione ${inter40}/40 item, containment ${maxCont})`,
                    pair
                );
            }
        }
    }

    // Clustering Union-Find su J@40 >= 0.30
    const parent = {};
    const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const union = (a, b) => {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    };
    for (const s of allSets) parent[s.id] = s.id;
    for (const p of overlapPairs) {
        if (p.j40 >= 0.30) union(p.a, p.b);
    }
    const clustersMap = {};
    for (const s of allSets) {
        const r = find(s.id);
        (clustersMap[r] = clustersMap[r] || []).push(s.id);
    }
    const clusters = Object.values(clustersMap).filter(c => c.length > 1).sort((a, b) => b.length - a.length);

    // --- CONFRONTO DIFF VS RUN PRECEDENTE ---
    const runsBaseDir = path.resolve(__dirname, '../../.scratch/motore-raccomandazioni/runs/audit');
    let previousAudit = null;
    let previousRunId = null;

    if (opts.compare && fs.existsSync(opts.compare)) {
        try {
            previousAudit = JSON.parse(fs.readFileSync(opts.compare, 'utf8'));
            previousRunId = previousAudit.runId || path.basename(path.dirname(opts.compare));
        } catch (e) {}
    } else if (fs.existsSync(runsBaseDir)) {
        // Cerca l'ultima run completata con audit.json
        const subdirs = fs.readdirSync(runsBaseDir)
            .filter(d => d !== runDirName && fs.statSync(path.join(runsBaseDir, d)).isDirectory())
            .sort()
            .reverse();
        for (const sd of subdirs) {
            const auditJsonPath = path.join(runsBaseDir, sd, 'audit.json');
            if (fs.existsSync(auditJsonPath)) {
                try {
                    previousAudit = JSON.parse(fs.readFileSync(auditJsonPath, 'utf8'));
                    previousRunId = sd;
                    break;
                } catch (e) {}
            }
        }
    }

    let diff = null;
    if (previousAudit) {
        const prevBlockCount = previousAudit.summary?.blockingCount ?? 0;
        const prevWarnCount = previousAudit.summary?.warningCount ?? 0;
        const currBlockCount = findings.filter(f => f.level === 'blocking').length;
        const currWarnCount = findings.filter(f => f.level === 'warning').length;

        const prevFindingsSet = new Set((previousAudit.findings || []).map(f => `${f.level}:${f.code}:${f.preset}`));
        const currFindingsSet = new Set(findings.map(f => `${f.level}:${f.code}:${f.preset}`));

        const newFindings = findings.filter(f => !prevFindingsSet.has(`${f.level}:${f.code}:${f.preset}`));
        const resolvedFindings = (previousAudit.findings || []).filter(f => !currFindingsSet.has(`${f.level}:${f.code}:${f.preset}`));

        diff = {
            previousRunId,
            deltaBlocking: currBlockCount - prevBlockCount,
            deltaWarning: currWarnCount - prevWarnCount,
            newFindingsCount: newFindings.length,
            resolvedFindingsCount: resolvedFindings.length,
            newFindings: newFindings.slice(0, 20),
            resolvedFindings: resolvedFindings.slice(0, 20)
        };
    }

    // --- COMPILAZIONE RISULTATI TOTALI ---
    const totalAuditMs = Date.now() - tStart;
    const blockingFindings = findings.filter(f => f.level === 'blocking');
    const warningFindings = findings.filter(f => f.level === 'warning');
    const highOverlapCritical = overlapPairs.filter(p => p.j40 >= 0.70);

    const auditOutput = {
        timestamp: runTimestamp.toISOString(),
        runId: runDirName,
        gitCommit,
        environment: {
            parquetDir: dumpDir,
            duckDbInitMs,
            totalAuditMs
        },
        frozenDates,
        summary: {
            presetsAudited: targetPresets.length,
            heroesAudited: heroCatalogs.length,
            skippedPresets,
            blockingCount: blockingFindings.length,
            warningCount: warningFindings.length,
            gateArmed: opts.gate,
            gateStatus: opts.gate ? (blockingFindings.length > 0 ? 'FAILED' : 'PASSED') : 'DISARMED_REPORT_MODE',
            deadKeywordsTotal: deadKeywordsSummary.length,
            highOverlapCriticalPairs: highOverlapCritical.length
        },
        findings,
        overlap: {
            pairsEvaluated: overlapPairs.length,
            highOverlapCritical,
            clusters
        },
        catalogs: catalogs.map(c => ({
            id: c.id,
            name: c.name,
            kind: c.kind,
            type: c.type,
            category: c.category,
            pool: c.pool,
            itemsCount: c.itemsCount,
            msQuery: c.msQuery,
            quality: c.quality,
            error: c.error
        })),
        diff
    };

    // Scrittura artefatti su disco
    const targetOutDir = opts.outDir ? path.resolve(opts.outDir) : path.join(runsBaseDir, runDirName);
    fs.mkdirSync(targetOutDir, { recursive: true });

    const jsonPath = path.join(targetOutDir, 'audit.json');
    fs.writeFileSync(jsonPath, JSON.stringify(auditOutput, null, 2), 'utf8');

    const mdPath = path.join(targetOutDir, 'audit.md');
    const markdownContent = renderMarkdownReport(auditOutput, deadKeywordsSummary, redundantKeywordsSummary, lowYieldKeywordsSummary);
    fs.writeFileSync(mdPath, markdownContent, 'utf8');

    if (opts.json) {
        console.log(JSON.stringify(auditOutput, null, 2));
    } else {
        console.log(`
========================================================================
 YACA CATALOG AUDIT REPORT (${runDirName})
========================================================================
 Git Commit:       ${gitCommit}
 Parquet Path:     ${dumpDir}
 Preset Esaminati: ${targetPresets.length} (Skipped: ${skippedPresets.length})
 Hero Analizzati:  ${heroCatalogs.length}
 Durata Esecuzione:${(totalAuditMs / 1000).toFixed(1)}s (DuckDB Init: ${(duckDbInitMs / 1000).toFixed(1)}s)
 Finestra Date:    ${frozenDates.referenceDate} (CONGELATA)
------------------------------------------------------------------------
 RISULTATI CHIAVE:
  - Finding Blocking:  ${blockingFindings.length}
  - Finding Warning:   ${warningFindings.length}
  - Coppie J@40 >= 0.7: ${highOverlapCritical.length}
  - Keyword Morte:     ${deadKeywordsSummary.length}
------------------------------------------------------------------------
 STATO DEL GATE: ${opts.gate ? (blockingFindings.length > 0 ? 'NON SUPERATO (ERR)' : 'SUPERATO (OK)') : 'DISATTIVATO (Modalità Report)'}
 File Generati:
  - ${jsonPath}
  - ${mdPath}
========================================================================
`);
    }

    if (opts.gate && blockingFindings.length > 0) {
        process.exit(1);
    }
    process.exit(0);
}

// --- Generazione Report Markdown ---
function renderMarkdownReport(audit, deadKw, redundantKw, lowYieldKw) {
    const s = audit.summary;
    const f = audit.findings;
    const blocking = f.filter(x => x.level === 'blocking');
    const warning = f.filter(x => x.level === 'warning');

    const md = [];
    md.push(`# Report Audit Automatico dei Cataloghi YACA`);
    md.push(`\n**Run ID**: \`${audit.runId}\`  `);
    md.push(`**Data e Ora**: \`${audit.timestamp}\`  `);
    md.push(`**Git Commit**: \`${audit.gitCommit}\`  `);
    md.push(`**Parquet Dump**: \`${audit.environment.parquetDir}\`  `);
    md.push(`**Tempo Totale**: \`${(audit.environment.totalAuditMs / 1000).toFixed(1)}s\` (Init DuckDB: \`${(audit.environment.duckDbInitMs / 1000).toFixed(1)}s\`)  `);
    md.push(`**Finestra Temporale Riferimento**: \`${audit.frozenDates.referenceDate}\` (Date CONGELATE nel run per prevenire falsi positivi)  `);

    md.push(`\n## 1. Executive Summary & Stato del Gate`);
    md.push(`\n| Metrica | Valore | Note |`);
    md.push(`|---|---|---|`);
    md.push(`| **Preset Esaminati** | **${s.presetsAudited}** | Tutti i preset SQL-based |`);
    md.push(`| **Preset Esclusi** | **${s.skippedPresets.length}** | \`${s.skippedPresets.map(x => x.id).join(', ')}\` |`);
    md.push(`| **Ricette Hero Analizzate** | **${s.heroesAudited}** | Fallback e builder deterministici (movie + series) |`);
    md.push(`| **Finding Bloccanti (BLOCKING)** | **${s.blockingCount}** | Gate soglia = 0 per deploy |`);
    md.push(`| **Finding di Avviso (WARNING)** | **${s.warningCount}** | Anomalie da inserire nel backlog di rifinitura |`);
    md.push(`| **Coppie Jaccard@40 $\\ge 0.70$** | **${s.highOverlapCriticalPairs}** | Quasi-duplicati critici (same-type) |`);
    md.push(`| **Keyword Morte (present = 0)** | **${s.deadKeywordsTotal}** | Clausole OR con resa nulla |`);
    md.push(`| **Stato Gate** | **${s.gateStatus}** | Gate pronto ma **non armato** di default (decisione ticket 03) |`);

    if (s.skippedPresets.length > 0) {
        md.push(`\n> [!NOTE]`);
        md.push(`> **Preset Escluso**: \`preset_anime_simulcast\` opera mediante provider proprietario \`airing_state\` collegato a un modulo runtime e non transita dallo storage relazionale SQL di DuckDB. È formalmente escluso da questo audit.`);
    }

    md.push(`\n## 2. Finding Bloccanti (Severity: BLOCKING)`);
    if (blocking.length === 0) {
        md.push(`\nNessun finding bloccante riscontrato.`);
    } else {
        md.push(`\nI seguenti **${blocking.length}** finding impedirebbero il passaggio del gate pre-deploy quando armato:\n`);
        md.push(`| Preset / Entità | Codice Anomalia | Dettaglio e Causa Radice |`);
        md.push(`|---|---|---|`);
        blocking.forEach(b => {
            md.push(`| \`${b.preset}\` | \`${b.code}\` | ${b.message.replace(/\|/g, '-')} |`);
        });
    }

    md.push(`\n## 3. Matrice di Overlap & Cluster Critici`);
    md.push(`\nSono state analizzate **${audit.overlap.pairsEvaluated}** coppie dello stesso tipo (movie vs movie, series vs series).\n`);

    const highPairs = audit.overlap.highOverlapCritical || [];
    if (highPairs.length > 0) {
        md.push(`### Coppie con Jaccard@40 $\\ge 0.70$ (Quasi-Duplicati Bloccanti)`);
        md.push(`| Catalogo A | Catalogo B | Tipo | J@20 | J@40 | J@100 | Containment Max | Item Condivisi (@40) |`);
        md.push(`|---|---|---|---|---|---|---|---|`);
        highPairs.forEach(p => {
            md.push(`| \`${p.a}\` | \`${p.b}\` | \`${p.type}\` | ${p.j20} | **${p.j40}** | ${p.j100} | ${p.maxCont} | **${p.inter40} / 40** |`);
        });
    }

    md.push(`\n### Cluster di Risonanza (Union-Find con J@40 $\\ge 0.30$)`);
    (audit.overlap.clusters || []).forEach((c, idx) => {
        md.push(`- **Cluster ${idx + 1} (${c.length} cataloghi)**: \`${c.join('`, `')}\``);
    });

    md.push(`\n## 4. Analisi Keyword: Dead Keywords, Ridondanza e Co-occorrenza`);
    md.push(`\n- **Keyword completamente morte (present = 0)**: **${deadKw.length}** occorrenze individuate.`);
    if (deadKw.length > 0) {
        md.push(`\nTop keyword morte riscontrate:`);
        deadKw.slice(0, 20).forEach(d => {
            md.push(`  - \`${d.preset}\`: kw \`${d.kwId}\` (*${d.name}*) — Frequenza globale dump: ${d.globalFreq}`);
        });
    }

    md.push(`\n- **Keyword ridondanti al 100% (exclusive = 0, present > 0)**: **${redundantKw.length}** occorrenze.`);
    if (redundantKw.length > 0) {
        redundantKw.slice(0, 10).forEach(r => {
            md.push(`  - \`${r.preset}\`: kw \`${r.kwId}\` (*${r.name}*) — Presente in ${r.present} item ma già interamente coperta da altre clausole OR`);
        });
    }

    md.push(`\n- **Keyword a bassa resa marginale (< 5% del pool)**: **${lowYieldKw.length}** occorrenze.`);

    md.push(`\n## 5. Coda Lunga, Dimensioni Pool e Igiene Metadati`);
    const smallPools = audit.catalogs.filter(c => c.kind === 'preset' && typeof c.pool === 'number' && c.pool < 20).sort((a, b) => a.pool - b.pool);
    md.push(`\n### Cataloghi Sottodimensionati (Pool < 20 item)`);
    if (smallPools.length > 0) {
        md.push(`| Preset | Tipo | Pool Reale | Categoria | Valutazione |`);
        md.push(`|---|---|---|---|---|`);
        smallPools.forEach(c => {
            const isRegista = /director|autori|nolan|tarantino|scorsese|spielberg|kubrick|villeneuve|fincher|burton|wesanderson|lynch|scott/i.test(c.id + c.category);
            md.push(`| \`${c.id}\` | \`${c.type}\` | **${c.pool}** | ${c.category || ''} | ${c.pool < 10 ? '🚨 CRITICO (< 10)' : (isRegista ? 'Filmografia autore ridotta (Fisiologico)' : 'Filtro iper-restrittivo')} |`);
        });
    }

    md.push(`\n## 6. Diff vs Run Precedente`);
    if (!audit.diff) {
        md.push(`\nNessuna esecuzione precedente trovata. Questa è la prima run baseline congelata.`);
    } else {
        const d = audit.diff;
        md.push(`\nConfronto effettuato con la run precedente: \`${d.previousRunId}\`\n`);
        md.push(`- **Variazione Finding Bloccanti**: ${d.deltaBlocking >= 0 ? '+' : ''}${d.deltaBlocking}`);
        md.push(`- **Variazione Warning**: ${d.deltaWarning >= 0 ? '+' : ''}${d.deltaWarning}`);
        md.push(`- **Nuovi Finding Emersi**: ${d.newFindingsCount}`);
        md.push(`- **Finding Risolti / Bonificati**: ${d.resolvedFindingsCount}`);
    }

    md.push(`\n## 7. Piano Operativo di Bonifica a Lotti Proposto`);
    md.push(`
Per abilitare l'armamento del pre-deploy gate (\`--gate\`), è necessario azzerare tutti i finding \`blocking\`. Si propone il seguente piano di intervento a 4 lotti sequenziali:

### Lotto 1: Bonifica delle Dead Keyword & Correzione Anomalie Gravi
1. **Snellimento \`preset_tv_dystopia\`**: Rimuovere le 14 keyword morte (\`2137\`, \`290902\`, \`374271\`, \`220486\`, ecc.) che portano zero titoli e ingolfano il query plan DuckDB.
2. **Snellimento altri preset tematici**: Rimozione delle keyword morte in \`preset_mindfuck_series\` (4 kw), \`preset_zombies\` (3 kw), \`preset_slapstick_comedy\`, \`preset_anime_dark\`.
3. **Correzione semantica \`preset_asian_action\`**: Rimuovere o sostituire la keyword aliena errata \`18034\` (*desert*, co-occorrenza marziale < 15%) lasciando le sole keyword marziali (\`779\`, \`780\`, \`9826\`).

### Lotto 2: Disaccoppiamento dei Cluster a Più Alto Overlap
1. **Disaccoppiare \`preset_pop_series\` da \`hero_true_blend_fallback_series\` ($J@40 = 0.905$)**: Introdurre un tie-breaker per vote average o rotazione casuale seedata nel fallback serie freddo anziché ordinamento puro per sola popolarità decrescente.
2. **Disaccoppiare \`preset_pop_movies\` da \`hero_true_blend_fallback_movie\` ($J@40 = 0.778$)**: Differenziare la ricetta del fallback freddo film.
3. **Divergere le ricette \`hero_hidden_gems_builder\` e \`hero_hidden_gems_fallback\` ($J@40 = 1.000$)**: Introdurre filtri o soglie distinte per evitare che il fallback serie sia un clone al 100% del builder.
4. **Diversificare \`preset_blockbusters\` vs \`preset_big_sagas\` ($J@40 = 0.600$) e \`preset_pop_anime\` vs \`preset_anime_action\` ($J@40 = 0.633$)**.

### Lotto 3: Irrobustimento Cataloghi Sottodimensionati (Pool < 20)
1. **Risoluzione \`preset_new_series_eps\` (pool = 9, unico catalogo < 10)**: Allargare la finestra temporale da 14 a 30 giorni o abbassare la soglia di voti per portare il catalogo sopra i 25 item.
2. **Tuning cataloghi documentari e di genere corto**: Rivedere i filtri per \`preset_doc_tech_future\` (12), \`preset_sea_series_docs\` (16), \`preset_teen_drama_comedy\` (16), \`preset_sports_underdog\` (17).
3. **Esplicita marcatura registi d'autore**: Inserire \`_limitedFilmography: true\` per i registi d'autore (Villeneuve, Fincher, Tarantino, Kubrick, Nolan, Lynch) affinché non sollevino falsi allarmi nel report.

### Lotto 4: Armamento del Pre-Deploy Gate
1. Verificare con \`node scripts/qa/catalog-audit.js\` che i finding \`blocking\` siano scesi esattamente a **0**.
2. Aggiungere il controllo in CI (\`npm run test:audit\` con flag \`--gate\`).
3. Da quel momento, qualsiasi regressione introdotta nei preset o nei fallback hero bloccherà automaticamente il rilascio.
`);

    return md.join('\n');
}

if (require.main === module) {
    main().catch(err => {
        console.error('[catalog-audit] Errore fatale:', err);
        process.exit(1);
    });
}
