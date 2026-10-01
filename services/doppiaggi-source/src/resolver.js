/**
 * resolver.js
 * Risoluzione per TMDB ID delle schede di Antonio Genna rimaste senza candidato nel catalogo.
 *
 * Flusso e regole (secondo ticket 10 e ricerche/scala-di-match.md):
 * 1. GET /search/multi?query=<titolo AG>&language=it-IT
 * 2. Prova di identità obbligatoria:
 *    - Si accetta l'id SOLO se il titolo normalizzato di AG compare fra i nomi del record:
 *      (a) title / name (italiano)
 *      (b) original_title / original_name
 *      (c) alternative_titles (tramite GET /{type}/{id}?append_to_response=alternative_titles sui primi N)
 *    - L'anno esatto (mai +-1) e il tipo dalla zona (film -> movie, telefilm/anim/soap -> tv)
 *      valgono come seconda conferma quando il titolo è ambiguo (più candidati con lo stesso nome).
 *    - Senza conferma: nessuna annotazione.
 * 3. Cache su disco delle risposte TMDB, contatore chiamate, ripresa dal punto e budget.
 */

const fs = require('fs');
const path = require('path');
const { normBase, ARTICLES } = require('./parse');

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const DEFAULT_DELAY_MS = 120;
const MAX_ALTERNATIVE_CANDIDATES = 3;

/**
 * Recupera la chiave API di TMDB da opzioni, env o file .env senza mai esporla.
 * @param {object} [opts]
 * @returns {string|null}
 */
function getTmdbApiKey(opts = {}) {
    if (opts.apiKey) return opts.apiKey;
    if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY;

    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '..', '..', '.env'),
        path.resolve(__dirname, '..', '..', '..', '.env'),
        'C:/Users/gabri/APP/YACA/.env'
    ];

    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf8');
                const m = content.match(/^TMDB_API_KEY=(.+)$/m);
                if (m && m[1].trim()) return m[1].trim();
            }
        } catch (_) {}
    }
    return null;
}

/**
 * Calcola l'insieme dei nomi normalizzati validi per una scheda Antonio Genna:
 * - chiave normalizzata (es. "the old guard 2")
 * - versione pulita (es. "the old guard 2")
 * - versione senza inversione articolo (es. "old guard 2" per "Old Guard 2 (The)")
 * - titolo grezzo senza anno
 * @param {object} agEntry
 * @returns {Set<string>}
 */
function getAgNameVariants(agEntry) {
    const variants = new Set();
    if (!agEntry) return variants;

    if (agEntry.key) variants.add(agEntry.key);
    if (agEntry.cleanTitle) variants.add(normBase(agEntry.cleanTitle));

    const baseWithoutYear = String(agEntry.rawTitle || '')
        .replace(/\s*\(\d{4}\)\s*$/, '')
        .trim();

    if (baseWithoutYear) {
        variants.add(normBase(baseWithoutYear));
        const artRegex = new RegExp(`^(.*?)\\s*\\((${ARTICLES})\\)$`, 'i');
        const m = baseWithoutYear.match(artRegex);
        if (m) {
            variants.add(normBase(m[1]));
            variants.add(normBase(`${m[2]} ${m[1]}`));
        }
    }

    variants.delete('');
    return variants;
}

/**
 * Estrae l'anno a 4 cifre da un record TMDB.
 * @param {object} item
 * @returns {number|null}
 */
function getReleaseYear(item) {
    if (!item) return null;
    const dateStr = item.release_date || item.first_air_date;
    if (!dateStr) return null;
    const y = parseInt(String(dateStr).slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
}

/**
 * Genera il nome file di cache normalizzato (privo della chiave API).
 * @param {string} pathname
 * @returns {string}
 */
function buildSanitizedCacheFilename(pathname) {
    const withoutKey = String(pathname || '')
        .replace(/[?&]api_key=[^&]+/g, '')
        .replace(/\?&/, '?')
        .replace(/[?&]$/, '');
    return withoutKey.replace(/[^\w.-]/g, '_').slice(0, 180) + '.json';
}

/**
 * Cerca un file di cache esistente, sia in cacheDir che nelle cartelle di fallback,
 * verificando anche i formati legacy (con api_key nel nome file).
 * @param {string} pathname
 * @param {string} cacheDir
 * @param {string[]} [fallbackDirs=[]]
 * @param {string} [apiKey]
 * @returns {string|null} Percorso del file se esiste, altrimenti null
 */
function findExistingCacheFile(pathname, cacheDir, fallbackDirs = [], apiKey = '') {
    const sanitizedName = buildSanitizedCacheFilename(pathname);
    const candidateDirs = [cacheDir, ...fallbackDirs].filter(Boolean);

    const candidateFilenames = [sanitizedName];
    if (apiKey) {
        // Formato legacy usato dagli script di analisi gate (es. gate-risoluzione-id.js)
        const legacyWithKey = pathname.includes('api_key=')
            ? pathname.replace(/[^\w.-]/g, '_').slice(0, 180) + '.json'
            : pathname.replace(/\?/, `?api_key=${apiKey}&`).replace(/[^\w.-]/g, '_').slice(0, 180) + '.json';
        candidateFilenames.push(legacyWithKey);
    }

    for (const dir of candidateDirs) {
        for (const fname of candidateFilenames) {
            const p = path.join(dir, fname);
            if (fs.existsSync(p)) {
                return p;
            }
        }
    }

    return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Esegue una chiamata verso TMDB con cache su disco, rate limiting e budget.
 *
 * @param {string} pathname Percorso e query string (es. /search/multi?language=it-IT&query=...)
 * @param {object} options
 * @param {string} options.cacheDir Cartella cache primaria
 * @param {string[]} [options.fallbackDirs] Cartelle cache secondarie
 * @param {string} [options.apiKey] Chiave API TMDB
 * @param {number} [options.maxCalls=Infinity] Tetto massimo chiamate di rete consentite
 * @param {number} [options.delayMs=120] Attesa tra chiamate di rete
 * @param {object} options.stats Oggetto contatori { callsMade, cacheHits, budgetExceeded }
 * @param {Function} [options.fetchFn] Funzione fetch mock per test offline
 * @returns {Promise<object|null>} Risposta JSON o null se il budget è esaurito
 */
async function callTmdb(pathname, options) {
    const {
        cacheDir,
        fallbackDirs = [],
        apiKey = '',
        maxCalls = Infinity,
        delayMs = DEFAULT_DELAY_MS,
        stats = { callsMade: 0, cacheHits: 0, budgetExceeded: false },
        fetchFn = null
    } = options;

    if (cacheDir) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    // 1. Verifica cache su disco
    const existingFile = findExistingCacheFile(pathname, cacheDir, fallbackDirs, apiKey);
    if (existingFile) {
        try {
            const data = JSON.parse(fs.readFileSync(existingFile, 'utf8'));
            stats.cacheHits++;
            return data;
        } catch (_) {
            // Se il file è corrotto, procediamo con la chiamata
        }
    }

    // 2. Controllo budget chiamate
    if (stats.callsMade >= maxCalls) {
        stats.budgetExceeded = true;
        return null;
    }

    // 3. Esecuzione chiamata (mock o reale)
    stats.callsMade++;

    let fullUrl = pathname;
    if (!fetchFn) {
        const separator = pathname.includes('?') ? '&' : '?';
        const urlWithPath = pathname.startsWith('http') ? pathname : `${TMDB_API_BASE}${pathname}`;
        fullUrl = apiKey ? `${urlWithPath}${separator}api_key=${apiKey}` : urlWithPath;
    }

    try {
        let json;
        if (fetchFn) {
            json = await fetchFn(pathname);
        } else {
            const res = await fetch(fullUrl);
            json = await res.json();
        }

        // 4. Salvataggio in cache primaria con nome file sanificato
        if (cacheDir && json) {
            const saveFile = path.join(cacheDir, buildSanitizedCacheFilename(pathname));
            fs.writeFileSync(saveFile, JSON.stringify(json), 'utf8');
        }

        if (delayMs > 0 && !fetchFn) {
            await sleep(delayMs);
        }

        return json;
    } catch (err) {
        return null;
    }
}

/**
 * Cerca i candidati in TMDB tramite /search/multi.
 * @param {object} agEntry
 * @param {object} options
 * @returns {Promise<Array<object>>}
 */
async function searchCandidates(agEntry, options) {
    const raw = String(agEntry.rawTitle || '');
    const artRegex = new RegExp(`\\s*\\((${ARTICLES})\\)\\s*$`, 'i');
    let q = raw.replace(/\s*\(\d{4}\)\s*$/, '').replace(artRegex, '').trim();
    if (!q && agEntry.cleanTitle) {
        q = agEntry.cleanTitle;
    }
    if (!q) return [];

    const pathname = `/search/multi?language=it-IT&query=${encodeURIComponent(q)}`;
    const res = await callTmdb(pathname, options);
    if (!res || !Array.isArray(res.results)) return [];

    return res.results.filter((r) => r && (r.media_type === 'movie' || r.media_type === 'tv'));
}

/**
 * Recupera i dettagli con titoli alternativi per un candidato TMDB.
 * @param {object} cand
 * @param {object} options
 * @returns {Promise<object|null>}
 */
async function getAlternativeTitles(cand, options) {
    if (!cand || !cand.media_type || !cand.id) return null;
    const pathname = `/${cand.media_type}/${cand.id}?language=it-IT&append_to_response=alternative_titles`;
    return callTmdb(pathname, options);
}

/**
 * Risolve una singola scheda Antonio Genna provandone l'identità contro TMDB.
 *
 * @param {object} agEntry Scheda Antonio Genna
 * @param {object} options Opzioni con cacheDir, apiKey, maxCalls, stats, ecc.
 * @returns {Promise<{
 *   agEntry: object,
 *   confirmed: boolean,
 *   hit: { id: number, type: 'movie'|'tv', title: string, matchPath: 'titolo'|'originale'|'alternativo' } | null,
 *   reason: string
 * }>}
 */
async function resolveCard(agEntry, options) {
    const variants = getAgNameVariants(agEntry);
    if (!variants.size) {
        return { agEntry, confirmed: false, hit: null, reason: 'empty_variants' };
    }

    const cands = await searchCandidates(agEntry, options);
    if (options.stats && options.stats.budgetExceeded) {
        return { agEntry, confirmed: false, hit: null, reason: 'budget_exceeded' };
    }
    if (!cands || cands.length === 0) {
        return { agEntry, confirmed: false, hit: null, reason: 'no_search_results' };
    }

    const targetType = agEntry.type === 'movie' ? 'movie' : 'tv';

    // 1. Identità dal titolo italiano o dal titolo originale (con 1 sola chiamata di ricerca)
    const matchedTitle = [];
    const matchedOriginal = [];

    for (const cand of cands) {
        const itTitle = normBase(cand.title || cand.name || '');
        const origTitle = normBase(cand.original_title || cand.original_name || '');

        if (itTitle && variants.has(itTitle)) {
            matchedTitle.push(cand);
        } else if (origTitle && variants.has(origTitle)) {
            matchedOriginal.push(cand);
        }
    }

    const nameMatches = [...matchedTitle, ...matchedOriginal];

    if (nameMatches.length > 0) {
        let pool = nameMatches;

        // Seconda conferma quando il titolo è ambiguo:
        // (a) Anno esatto (mai +-1)
        if (agEntry.year !== null) {
            const byYear = pool.filter((c) => getReleaseYear(c) === agEntry.year);
            if (byYear.length > 0) {
                pool = byYear;
            } else {
                // Se l'anno era specificato da AG e nessun candidato coincide esattamente,
                // rifiutiamo per evitare remake errati (es. Tomb Raider 2001 vs 2018)
                const anyYearKnown = pool.some((c) => getReleaseYear(c) !== null);
                if (anyYearKnown) {
                    return { agEntry, confirmed: false, hit: null, reason: 'year_mismatch' };
                }
            }
        }

        // (b) Tipo dalla zona (film -> movie, telefilm/anim/soap -> tv)
        if (pool.length > 1) {
            const byType = pool.filter((c) => c.media_type === targetType);
            if (byType.length > 0) {
                pool = byType;
            }
        }

        if (pool.length === 1) {
            const hitCand = pool[0];
            const matchPath = matchedTitle.includes(hitCand) ? 'titolo' : 'originale';
            return {
                agEntry,
                confirmed: true,
                hit: {
                    id: hitCand.id,
                    type: hitCand.media_type,
                    title: hitCand.title || hitCand.name,
                    matchPath
                },
                reason: `confirmed_via_${matchPath}`
            };
        }

        // Omonimia residua non risolvibile: nessuna annotazione
        return { agEntry, confirmed: false, hit: null, reason: 'ambiguous_homonym' };
    }

    // 2. Identità dai titoli alternativi (richiede la chiamata di dettaglio sui primi N candidati)
    const inspectList = cands.slice(0, MAX_ALTERNATIVE_CANDIDATES);
    for (const cand of inspectList) {
        const detail = await getAlternativeTitles(cand, options);
        if (options.stats && options.stats.budgetExceeded) {
            return { agEntry, confirmed: false, hit: null, reason: 'budget_exceeded' };
        }
        if (!detail) continue;

        const altRaw = detail.alternative_titles?.titles || detail.alternative_titles?.results || [];
        const altNames = altRaw.map((x) => x.title || x.name).filter(Boolean);
        const allDetailNames = [
            detail.title,
            detail.name,
            detail.original_title,
            detail.original_name,
            ...altNames
        ].filter(Boolean);

        const hasMatch = allDetailNames.some((t) => variants.has(normBase(t)));
        if (hasMatch) {
            // Verifica anno se specificato
            if (agEntry.year !== null) {
                const y = getReleaseYear(detail) || getReleaseYear(cand);
                if (y !== null && y !== agEntry.year) {
                    continue; // Anno non combacia, prova il prossimo candidato
                }
            }

            return {
                agEntry,
                confirmed: true,
                hit: {
                    id: cand.id,
                    type: cand.media_type,
                    title: detail.title || detail.name || cand.title || cand.name,
                    matchPath: 'alternativo'
                },
                reason: 'confirmed_via_alternativo'
            };
        }
    }

    // Nessun nome coincide fra tutti i candidati ispezionati (es. caso Triple Z)
    return { agEntry, confirmed: false, hit: null, reason: 'no_name_match' };
}

/**
 * Risolve un insieme di schede residue con gestione del budget, limite e statistiche.
 *
 * @param {Array<object>} cards Elenco schede Antonio Genna da processare
 * @param {object} options
 * @param {number} [options.limit] Tetto schede da analizzare
 * @param {number} [options.maxCalls=Infinity] Budget massimo chiamate API
 * @param {Function} [options.onProgress] Callback di progresso
 * @returns {Promise<{
 *   totalExamined: number,
 *   confirmedCount: number,
 *   unconfirmedCount: number,
 *   callsMade: number,
 *   cacheHits: number,
 *   budgetExceeded: boolean,
 *   byPath: { titolo: number, originale: number, alternativo: number },
 *   resolvedRows: Array<{ t: 'movie'|'tv', id: number, ita: true }>,
 *   results: Array<object>
 * }>}
 */
async function resolveResidualCards(cards, options = {}) {
    const limit = options.limit && options.limit > 0 ? options.limit : cards.length;
    const targetCards = cards.slice(0, limit);

    const stats = {
        callsMade: 0,
        cacheHits: 0,
        budgetExceeded: false
    };

    const callOpts = {
        ...options,
        stats
    };

    const byPath = { titolo: 0, originale: 0, alternativo: 0 };
    const results = [];
    const resolvedRows = [];
    const seenKeys = new Set();

    let confirmedCount = 0;
    let unconfirmedCount = 0;

    for (let i = 0; i < targetCards.length; i++) {
        if (stats.budgetExceeded) {
            break;
        }

        const card = targetCards[i];
        const res = await resolveCard(card, callOpts);

        if (stats.budgetExceeded) {
            break;
        }

        results.push(res);

        if (res.confirmed && res.hit) {
            confirmedCount++;
            byPath[res.hit.matchPath] = (byPath[res.hit.matchPath] || 0) + 1;

            const rowKey = `${res.hit.type}:${res.hit.id}`;
            if (!seenKeys.has(rowKey)) {
                seenKeys.add(rowKey);
                resolvedRows.push({
                    t: res.hit.type,
                    id: res.hit.id,
                    ita: true
                });
            }
        } else {
            unconfirmedCount++;
        }

        if (typeof options.onProgress === 'function') {
            options.onProgress({
                index: i + 1,
                total: targetCards.length,
                card,
                result: res,
                confirmedCount,
                callsMade: stats.callsMade,
                cacheHits: stats.cacheHits,
                budgetExceeded: stats.budgetExceeded
            });
        }
    }

    return {
        totalExamined: results.length,
        confirmedCount,
        unconfirmedCount,
        callsMade: stats.callsMade,
        cacheHits: stats.cacheHits,
        budgetExceeded: stats.budgetExceeded,
        byPath,
        resolvedRows,
        results
    };
}

module.exports = {
    getTmdbApiKey,
    getAgNameVariants,
    getReleaseYear,
    buildSanitizedCacheFilename,
    findExistingCacheFile,
    callTmdb,
    searchCandidates,
    getAlternativeTitles,
    resolveCard,
    resolveResidualCards,
    MAX_ALTERNATIVE_CANDIDATES
};
