/**
 * catalogSorting.js
 *
 * UNICA FONTE DI VERITÀ PER IL VOCABOLARIO E GLI ORDINAMENTI DEI CATALOGHI (Ticket 18).
 *
 * -----------------------------------------------------------------------------
 * DEFAULT DICHIARATI PER FAMIGLIA (UNICO PUNTO DI DOCUMENTAZIONE):
 * -----------------------------------------------------------------------------
 * 1. DISCOVERY (DuckDB preset / search SQL):
 *    - Default: Popolarità decrescente (`S.POPULAR` -> "popularity" DESC NULLS LAST).
 *    - Tie-breaker deterministico garantito a livello SQL da queryBuilder: `id ASC`.
 *    - Ordinabile dall'utente: SÌ (sortable: true, espone options nel manifest).
 *
 * 2. SIMULCAST (Anime Novità / anime_airing_state):
 *    - Default: Data dell'ultimo episodio uscito (`lastAiredAt` DESC, doc.title ASC).
 *    - Fonte esterna (AnimeUnity home / snapshot Mongo), non colonne DuckDB.
 *    - Ordinabile dall'utente: NO (sortable: false, manifest extra: [{ name: 'skip' }]).
 *
 * 3. WATCHLIST (Libreria utente Stremio / UserLibraryItem):
 *    - Default: Ultima modifica decrescente (`_mtime: -1`, con tie-breaker `itemId: 1`).
 *    - Basato sullo stato di sincronizzazione utente in MongoDB.
 *    - Ordinabile dall'utente: NO (sortable: false, manifest extra: [{ name: 'skip' }]).
 *
 * 4. HERO (Raccomandazioni dinamiche ibride VSM: true_blend, seed_network, hidden_gems, trakt_filtered):
 *    - Default: Score di affinità vettoriale del profilo utente (calcolato dal ProfileScorer).
 *    - Reranker matematico interno VSM in RAM (con tie-breaker compareContentIds).
 *    - Il DNA resta un reranker interno: nessuna voce "Per te" nel vocabolario utente.
 *    - Ordinabile dall'utente: NO (sortable: false, manifest extra: [{ name: 'skip' }]).
 * -----------------------------------------------------------------------------
 */

const { S } = require('../data/filters');

/**
 * Default dichiarati per famiglia di catalogo.
 */
const FAMILY_SORT_DEFAULTS = Object.freeze({
    discovery: Object.freeze({
        family: 'discovery',
        sort: 'popularity.desc',
        sql: S.POPULAR,
        sortable: true,
        description: 'Popolarità decrescente (S.POPULAR) con tie-breaker deterministico id ASC'
    }),
    simulcast: Object.freeze({
        family: 'simulcast',
        sort: 'lastAiredAt',
        sortable: false,
        description: 'Data ultimo episodio in simulcast (lastAiredAt DESC, doc.title ASC)'
    }),
    watchlist: Object.freeze({
        family: 'watchlist',
        sort: '_mtime DESC',
        mongoSort: Object.freeze({ _mtime: -1, itemId: 1 }),
        sortable: false,
        description: 'Data ultima sincronizzazione decrescente (_mtime: -1, itemId: 1)'
    }),
    hero: Object.freeze({
        family: 'hero',
        sort: 'affinity_score',
        sortable: false,
        description: 'Score di affinità vettoriale DNA (reranker interno, non esposto)'
    })
});

/**
 * Vocabolario utente Stremio (visibile nelle UI e nel manifest dei cataloghi ordinabili).
 * Il DNA resta un reranker interno: niente "Per te".
 */
const SORT_OPTIONS = Object.freeze([
    'Popolarità',
    'Voto Medio',
    'Data di Uscita',
    'Incassi'
]);

/**
 * Mappatura chiavi utente Stremio -> TMDB sort_by canonico.
 */
const USER_SORT_MAP = Object.freeze({
    'Popolarità': 'popularity.desc',
    'Voto Medio': 'vote_average.desc',
    'Data di Uscita': null, // risolto dinamicamente in base a movie (primary_release_date.desc) vs tv (first_air_date.desc)
    'Incassi': 'revenue.desc'
});

/**
 * Insieme delle chiavi sort_by TMDB supportate (invariante storico DuckDbProvider).
 */
const SUPPORTED_SORT_BY = Object.freeze([
    'popularity.desc',
    'vote_average.desc',
    'revenue.desc',
    'primary_release_date.desc',
    'first_air_date.desc',
    'release_date.desc',
    'primary_release_date.asc',
    'first_air_date.asc',
    'release_date.asc'
]);

/**
 * Verifica se un valore appartiene al vocabolario supportato (voce Stremio o sort_by TMDB).
 */
function isMappedSortBy(s) {
    if (!s || typeof s !== 'string') return false;
    if (SUPPORTED_SORT_BY.includes(s)) return true;
    if (Object.prototype.hasOwnProperty.call(USER_SORT_MAP, s)) return true;
    return false;
}

/**
 * Determina se un catalogo supporta l'ordinamento configurabile dall'utente.
 */
function isCatalogSortable(catalogMeta) {
    if (!catalogMeta) return true;
    if (catalogMeta.sortable === false) return false;
    if (catalogMeta._provider === 'airing_state' || catalogMeta._provider === 'anilist_simulcast') return false;
    const id = String(catalogMeta.id || '');
    if (id === 'preset_anime_simulcast' || id === 'yaca_preset_preset_anime_simulcast') return false;
    if (id.startsWith('yaca_watchlist_')) return false;
    if (id.startsWith('yaca_true_blend_') || id.startsWith('yaca_seed_network_') ||
        id.startsWith('yaca_hidden_gems_') || id.startsWith('yaca_trakt_filtered_')) {
        return false;
    }
    return true;
}

/**
 * Funzione unica di traduzione del vocabolario di ordinamento.
 * Traduce una voce (etichetta UI Stremio o parametro TMDB sort_by) in clausola SQL,
 * comparatore JavaScript in-memory e chiave canonica.
 *
 * @param {string} sortVoice Voce utente ('Popolarità', 'Voto Medio'...) o chiave TMDB ('popularity.desc'...)
 * @param {Object|string} options Opzioni o stringa tipo ('movie'|'tv'|'series')
 * @returns {Object|string|Function} A seconda di options.target: oggetto completo, stringa SQL o comparatore
 */
function translateSort(sortVoice, options = {}) {
    const opts = typeof options === 'string' ? { type: options } : (options || {});
    const type = opts.type || 'movie';
    const isTv = type === 'tv' || type === 'series';

    let resolvedKey = sortVoice;
    if (!resolvedKey) {
        resolvedKey = 'popularity.desc';
    } else if (Object.prototype.hasOwnProperty.call(USER_SORT_MAP, resolvedKey)) {
        if (resolvedKey === 'Data di Uscita') {
            resolvedKey = isTv ? 'first_air_date.desc' : 'primary_release_date.desc';
        } else {
            resolvedKey = USER_SORT_MAP[resolvedKey];
        }
    }

    let canonicalKey = 'POPULARITY_DESC';
    let tmdbSortBy = 'popularity.desc';
    let sql = S.POPULAR;
    let comparator = (a, b) => (Number(b?.popularity ?? b?.rawTMDB?.popularity ?? 0) - Number(a?.popularity ?? a?.rawTMDB?.popularity ?? 0));

    if (resolvedKey === 'popularity.desc') {
        canonicalKey = 'POPULARITY_DESC';
        tmdbSortBy = 'popularity.desc';
        sql = S.POPULAR;
        comparator = (a, b) => (Number(b?.popularity ?? b?.rawTMDB?.popularity ?? 0) - Number(a?.popularity ?? a?.rawTMDB?.popularity ?? 0));
    } else if (resolvedKey === 'vote_average.desc') {
        canonicalKey = 'RATING_DESC';
        tmdbSortBy = 'vote_average.desc';
        sql = S.TOP_RATED;
        comparator = (a, b) => {
            const scoreA = Number(a?.vote_average ?? a?.imdbRating ?? a?.rawTMDB?.vote_average ?? 0);
            const scoreB = Number(b?.vote_average ?? b?.imdbRating ?? b?.rawTMDB?.vote_average ?? 0);
            if (scoreB !== scoreA) return scoreB - scoreA;
            const countA = Number(a?.vote_count ?? a?.rawTMDB?.vote_count ?? 0);
            const countB = Number(b?.vote_count ?? b?.rawTMDB?.vote_count ?? 0);
            return countB - countA;
        };
    } else if (resolvedKey === 'revenue.desc') {
        canonicalKey = 'REVENUE_DESC';
        tmdbSortBy = 'revenue.desc';
        sql = isTv ? S.POPULAR : S.REVENUE;
        comparator = (a, b) => (Number(b?.revenue ?? b?.rawTMDB?.revenue ?? 0) - Number(a?.revenue ?? a?.rawTMDB?.revenue ?? 0));
    } else if (resolvedKey === 'primary_release_date.desc' || resolvedKey === 'first_air_date.desc' || resolvedKey === 'release_date.desc') {
        canonicalKey = 'RELEASE_DATE_DESC';
        tmdbSortBy = isTv ? 'first_air_date.desc' : 'primary_release_date.desc';
        sql = isTv ? S.NEWEST_TV : S.NEWEST_MOVIE;
        comparator = (a, b) => {
            const dateA = String(a?.release_date ?? a?.first_air_date ?? a?.year ?? a?.releaseInfo ?? '');
            const dateB = String(b?.release_date ?? b?.first_air_date ?? b?.year ?? b?.releaseInfo ?? '');
            return dateB.localeCompare(dateA);
        };
    } else if (resolvedKey === 'primary_release_date.asc' || resolvedKey === 'first_air_date.asc' || resolvedKey === 'release_date.asc') {
        canonicalKey = 'RELEASE_DATE_ASC';
        tmdbSortBy = isTv ? 'first_air_date.asc' : 'primary_release_date.asc';
        sql = isTv ? '"first_air_date" ASC NULLS LAST' : '"release_date" ASC NULLS LAST';
        comparator = (a, b) => {
            const dateA = String(a?.release_date ?? a?.first_air_date ?? a?.year ?? a?.releaseInfo ?? '');
            const dateB = String(b?.release_date ?? b?.first_air_date ?? b?.year ?? b?.releaseInfo ?? '');
            return dateA.localeCompare(dateB);
        };
    } else {
        canonicalKey = String(resolvedKey).toUpperCase();
        tmdbSortBy = resolvedKey;
        sql = String(resolvedKey).replace('.desc', ' DESC NULLS LAST').replace('.asc', ' ASC NULLS LAST');
        comparator = (a, b) => 0;
    }

    if (opts.target === 'sql') return sql;
    if (opts.target === 'comparator') return comparator;
    if (opts.target === 'tmdb') return tmdbSortBy;

    return {
        sql,
        comparator,
        canonicalKey,
        tmdbSortBy,
        toString() { return sql; }
    };
}

/**
 * Traduzione diretta a espressione SQL DuckDB (interfaccia compatibile DuckDbProvider).
 */
function mapSortBy(s, type = 'movie') {
    return translateSort(s, { type, target: 'sql' });
}

/**
 * Traduzione diretta a comparatore JavaScript in-memory.
 */
function getSortComparator(s, type = 'movie') {
    return translateSort(s, { type, target: 'comparator' });
}

/**
 * Traduzione da voce UI Stremio a parametro TMDB sort_by (interfaccia compatibile stremio.js).
 */
function getSortByValue(sortOption, type = 'movie') {
    if (!sortOption || !isMappedSortBy(sortOption)) return 'popularity.desc';
    return translateSort(sortOption, { type, target: 'tmdb' });
}

/**
 * Suddivide un'espressione ORDER BY SQL in singole clausole preservando le parentesi annidate.
 */
function splitSqlOrderClauses(orderStr) {
    if (!orderStr || typeof orderStr !== 'string') return [];
    const clauses = [];
    let current = '';
    let parenDepth = 0;
    for (let i = 0; i < orderStr.length; i++) {
        const char = orderStr[i];
        if (char === '(') {
            parenDepth++;
            current += char;
        } else if (char === ')') {
            if (parenDepth > 0) parenDepth--;
            current += char;
        } else if (char === ',' && parenDepth === 0) {
            if (current.trim().length > 0) {
                clauses.push(current.trim());
            }
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim().length > 0) {
        clauses.push(current.trim());
    }
    return clauses;
}

/**
 * Estrae il nome normalizzato della colonna da una clausola ORDER BY SQL.
 */
function normalizeClauseColumn(clause) {
    if (!clause || typeof clause !== 'string') return '';
    const match = clause.trim().match(/^"?([a-zA-Z0-9_]+)"?/);
    return match ? match[1].toLowerCase() : clause.trim();
}

/**
 * Estrae i tie-breaker secondari da un preset/catalogMeta.
 * Se un preset definisce un orderBy composto (es. preset_burton: popularity + vote_count + id),
 * separa la clausola primaria dai tie-breaker secondari.
 */
function extractSecondaryTieBreakers(catalogMeta, type = 'movie') {
    if (!catalogMeta) return [];

    // 1. Tie-breaker espliciti dichiarati su catalogMeta
    if (Array.isArray(catalogMeta.tieBreakers) && catalogMeta.tieBreakers.length > 0) {
        return catalogMeta.tieBreakers.map(s => String(s).trim()).filter(Boolean);
    }
    if (typeof catalogMeta.tieBreakers === 'string' && catalogMeta.tieBreakers.trim().length > 0) {
        return splitSqlOrderClauses(catalogMeta.tieBreakers);
    }
    if (typeof catalogMeta.tieBreaker === 'string' && catalogMeta.tieBreaker.trim().length > 0) {
        return splitSqlOrderClauses(catalogMeta.tieBreaker);
    }

    // 2. Estrazione da catalogMeta.orderBy
    const origOrder = catalogMeta.orderBy;
    if (!origOrder || typeof origOrder !== 'string') return [];

    const defaultSortBy = catalogMeta.queries?.[0]?.sort_by || 'popularity.desc';
    const defaultSql = mapSortBy(defaultSortBy, catalogMeta.type || type);

    if (origOrder.startsWith(defaultSql)) {
        const remainder = origOrder.slice(defaultSql.length).replace(/^[\s,]+/, '').trim();
        if (remainder.length > 0) {
            return splitSqlOrderClauses(remainder);
        }
        return [];
    }

    // Se non inizia esattamente con defaultSql, controlla se ci sono clausole multiple
    const clauses = splitSqlOrderClauses(origOrder);
    if (clauses.length > 1) {
        return clauses.slice(1);
    }
    return [];
}

/**
 * Applica il sortBy scelto dall'utente preservando i tie-breaker secondari del preset.
 * Corregge il bug di CatalogRouter.js:80-81 dove un nuovo sortBy piallava i tie-breaker dei preset.
 */
function applySortWithTieBreakers(catalogMeta, sortBy, type = 'movie') {
    if (!catalogMeta) {
        return mapSortBy(sortBy, type);
    }
    // Se il catalogo dichiara sortable: false, l'ordinamento è invariante e non si altera
    if (catalogMeta.sortable === false) {
        return catalogMeta.orderBy || mapSortBy(sortBy, type);
    }
    if (!sortBy) {
        return catalogMeta.orderBy || mapSortBy(null, type);
    }

    const newPrimary = mapSortBy(sortBy, catalogMeta.type || type);
    const tieBreakers = extractSecondaryTieBreakers(catalogMeta, type);

    if (tieBreakers.length === 0) {
        return newPrimary;
    }

    const newClauses = splitSqlOrderClauses(newPrimary);
    const existingNormalized = new Set(newClauses.map(c => normalizeClauseColumn(c)));

    const extraTieBreakers = [];
    for (const tb of tieBreakers) {
        const col = normalizeClauseColumn(tb);
        if (col && existingNormalized.has(col)) {
            continue; // Evita di duplicare la colonna già presente nel nuovo ordinamento primario
        }
        extraTieBreakers.push(tb);
    }

    if (extraTieBreakers.length === 0) {
        return newPrimary;
    }

    return `${newPrimary}, ${extraTieBreakers.join(', ')}`;
}

module.exports = {
    FAMILY_SORT_DEFAULTS,
    SORT_OPTIONS,
    USER_SORT_MAP,
    SORT_MAP: USER_SORT_MAP,
    SUPPORTED_SORT_BY,
    isMappedSortBy,
    isCatalogSortable,
    translateSort,
    mapSortBy,
    getSortComparator,
    getSortByValue,
    splitSqlOrderClauses,
    extractSecondaryTieBreakers,
    applySortWithTieBreakers
};
