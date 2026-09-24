const RESOLUTION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RESOLUTION_CACHE_MAX_ENTRIES = 256;

// La cache è volutamente locale al processo: i ID TMDB di keyword/persone sono
// globali e non dipendono dall'utente. Cache anche i miss evita di ripetere una
// ricerca che ha già restituito zero risultati.
const resolutionCache = new Map();
const pendingResolutions = new Map();

function clearAiFilterResolutionCache() {
    resolutionCache.clear();
    pendingResolutions.clear();
}

function cacheKeyFor(endpoint, name) {
    return `${endpoint}:${name.trim().toLocaleLowerCase()}`;
}

function readResolutionCache(key) {
    const cached = resolutionCache.get(key);
    if (!cached) return { hit: false, id: null };

    if (cached.expiresAt <= Date.now()) {
        resolutionCache.delete(key);
        return { hit: false, id: null };
    }
    return { hit: true, id: cached.id };
}

function writeResolutionCache(key, id) {
    // Map mantiene l'ordine di inserimento: il primo elemento è la-voce più vecchia.
    if (resolutionCache.size >= RESOLUTION_CACHE_MAX_ENTRIES && !resolutionCache.has(key)) {
        const oldestKey = resolutionCache.keys().next().value;
        resolutionCache.delete(oldestKey);
    }
    resolutionCache.delete(key);
    resolutionCache.set(key, { id: id || null, expiresAt: Date.now() + RESOLUTION_CACHE_TTL_MS });
}

function validTmdbId(id) {
    const value = Number(id);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function pickSearchResult(results, name) {
    if (!Array.isArray(results) || results.length === 0) return null;

    const expected = name.trim().toLocaleLowerCase();
    const validResults = results.filter(result => validTmdbId(result?.id));
    const exact = validResults.find(result => String(result.name || '').trim().toLocaleLowerCase() === expected);
    return exact || validResults[0] || null;
}

async function resolveTmdbName(tmdbClient, endpoint, name) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return null;

    const key = cacheKeyFor(endpoint, cleanName);
    const cached = readResolutionCache(key);
    if (cached.hit) return cached.id;

    if (pendingResolutions.has(key)) return pendingResolutions.get(key);
    if (typeof tmdbClient?.get !== 'function') return null;

    const pending = (async () => {
        try {
            const response = await Promise.resolve().then(() =>
                tmdbClient.get(`/search/${endpoint}`, { params: { query: cleanName } })
            );
            const match = pickSearchResult(response?.data?.results, cleanName);
            const id = validTmdbId(match?.id);
            writeResolutionCache(key, id);
            return id;
        } catch (error) {
            // Un errore di rete non viene messo in cache: un tentativo successivo
            // potrebbe recuperare il resolver senza attendere la scadenza del TTL.
            console.warn(
                `[AiQueryNormalizer] TMDB /search/${endpoint} non riuscito per "${cleanName}": ${error?.message || String(error)}`
            );
            return null;
        } finally {
            pendingResolutions.delete(key);
        }
    })();

    pendingResolutions.set(key, pending);
    return pending;
}

function splitNames(value) {
    const rawValues = Array.isArray(value) ? value : [value];
    return rawValues
        .filter(item => item !== null && item !== undefined)
        .flatMap(item => String(item).split(/[,|]/))
        .map(name => name.trim())
        .filter(Boolean);
}

function normalizeIds(value) {
    const rawValues = Array.isArray(value) ? value : String(value ?? '').split(/[,|]/);
    const ids = rawValues
        .map(id => validTmdbId(String(id).trim()))
        .filter(Boolean);
    return [...new Set(ids)];
}

function uniqueIds(ids) {
    return [...new Set(ids.filter(Boolean))];
}

async function resolveNames(tmdbClient, endpoint, names, label) {
    const resolved = await Promise.all(names.map(name => resolveTmdbName(tmdbClient, endpoint, name)));
    names.forEach((name, index) => {
        if (!resolved[index]) {
            console.warn(
                `[AiQueryNormalizer] ${label} "${name}" non risolto tramite TMDB /search/${endpoint}; scartato.`
            );
        }
    });
    return resolved;
}

function normalizeYearBoundary(value, endOfYear) {
    const year = String(value ?? '').trim();
    if (!/^\d{4}$/.test(year)) return null;
    return `${year}-${endOfYear ? '12-31' : '01-01'}`;
}

function normalizeLanguage(value) {
    if (Array.isArray(value)) return value.join('|');
    return String(value ?? '').trim();
}

async function normalizeAiQuery(query, { type, tmdbClient } = {}) {
    if (!query || typeof query !== 'object' || Array.isArray(query)) return null;

    const normalized = { ...query };
    if (normalized._keywordNames === undefined && normalized.keyword) {
        normalized._keywordNames = normalized.keyword;
    }

    const genreIds = normalizeIds(normalized.genre_ids);
    if (genreIds.length > 0) normalized.with_genres = genreIds.join('|');

    const withoutGenreIds = normalizeIds(normalized.without_genre_ids);
    if (withoutGenreIds.length > 0) normalized.without_genres = withoutGenreIds.join('|');

    const language = normalizeLanguage(normalized.original_language);
    if (language) normalized.with_original_language = language;

    const isTv = type === 'tv' || type === 'series' || type === 'anime';
    const fromDate = normalizeYearBoundary(normalized.year_from, false);
    const toDate = normalizeYearBoundary(normalized.year_to, true);
    const datePrefix = isTv ? 'first_air_date' : 'primary_release_date';
    if (fromDate) normalized[`${datePrefix}.gte`] = fromDate;
    if (toDate) normalized[`${datePrefix}.lte`] = toDate;

    if (normalized.strategy !== 'discovery') return normalized;

    let requestedNames = 0;
    let resolvedNames = 0;

    for (const field of ['keyword', 'without_keyword']) {
        const names = splitNames(normalized[field]);
        if (names.length === 0) continue;
        requestedNames += names.length;

        const ids = await resolveNames(tmdbClient, 'keyword', names, 'Keyword');
        resolvedNames += ids.filter(Boolean).length;
        const targetField = field === 'keyword' ? 'with_keywords' : 'without_keywords';
        const unique = uniqueIds(ids);
        if (unique.length > 0) normalized[targetField] = unique.join('|');
    }

    const people = splitNames(normalized.people_list);
    if (people.length > 0) {
        requestedNames += people.length;
        const ids = await resolveNames(tmdbClient, 'person', people, 'Persona');
        resolvedNames += ids.filter(Boolean).length;
        const unique = uniqueIds(ids);
        if (unique.length > 0) normalized.with_cast = unique.join('|');
    }

    // Se ogni nome richiesto è fallito, non trasformare la discovery priva di
    // vincoli in un catalogo popolare generico. Un eventuale campo interno già
    // risolto viene invece conservato.
    const hasResolvedInternalNames = Boolean(normalized.with_keywords || normalized.with_cast);
    if (requestedNames > 0 && resolvedNames === 0 && !hasResolvedInternalNames) {
        console.warn(
            `[AiQueryNormalizer] Query discovery esclusa: nessun nome è stato risolto (${requestedNames} tentativi).`
        );
        return null;
    }

    return normalized;
}

/**
 * Unico boundary fra lo schema JSON prodotto dal planner e quello del provider
 * DuckDB. Non modifica i campi nativi già corretti.
 */
async function normalizeAiDiscoveryQueries(queries, options = {}) {
    if (!Array.isArray(queries)) return [];
    const normalized = await Promise.all(queries.map(query => normalizeAiQuery(query, options)));
    return normalized.filter(Boolean);
}

module.exports = {
    RESOLUTION_CACHE_MAX_ENTRIES,
    RESOLUTION_CACHE_TTL_MS,
    clearAiFilterResolutionCache,
    normalizeAiDiscoveryQueries,
    normalizeAiQuery
};
