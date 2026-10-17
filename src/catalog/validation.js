// src/catalog/validation.js

/**
 * VALIDAZIONE DEL TIPO CATALOGO (Ticket 23).
 *
 * La validazione è l'INTERSEZIONE di due dichiarazioni:
 * 1. La LINGUA (cosa un catalogo può dire: id, nome, mediaSet, anime, filtri ammessi, ordinamenti)
 * 2. Le CAPACITÀ DICHIARATE dal servire (quali filtri, mediaSet e ordinamenti ogni fonte sa servire).
 *
 * Il tipo non importa i provider di esecuzione né produce titoli: consulta solo le
 * capacità dichiarate (senza dipendere dal servire).
 */

const { ALLOWED_MEDIA_SET_VALUES, ALLOWED_ANIME_AXIS, defineCatalog } = require('./definition');
const { getSourceCapabilities } = require('./capabilities');
const { isHeroCatalogId } = require('./registry');
const { isMappedSortBy } = require('./catalogSorting');

/**
 * Regole sintattiche della lingua dei cataloghi.
 */
const LANGUAGE_RULES = Object.freeze({
    MAX_NAME_LENGTH: 100,
    ALLOWED_MEDIA_SETS: ALLOWED_MEDIA_SET_VALUES,
    ALLOWED_ANIME_AXES: ALLOWED_ANIME_AXIS
});

/**
 * Risolve la fonte deputata al servire del catalogo.
 *
 * @param {Object} def
 * @param {string} [overrideSourceId]
 * @returns {string} ID della fonte
 */
function resolveTargetSource(def, overrideSourceId) {
    if (overrideSourceId) return overrideSourceId;
    if (def.system?.provider) return def.system.provider;
    if (def._provider) return def._provider;

    const queryProvider = def.filters?.queries?.[0]?.provider || def.queries?.[0]?.provider;
    if (queryProvider) return queryProvider;

    const id = String(def.id || '');
    if (def.system?.isSystem || isHeroCatalogId(id)) return 'hybrid';
    if (id === 'preset_anime_simulcast' || id.endsWith('anime_simulcast')) return 'airing_state';
    if (id.startsWith('yaca_watchlist_')) return 'watchlist';

    return 'duckdb';
}

/**
 * Valida una definizione di catalogo rispetto alla lingua e alle capacità della fonte servente.
 *
 * @param {Object} rawCatalog - Definizione grezza o istanza di catalogo
 * @param {Object} [options] - Opzioni di validazione (es. sourceId esplicito)
 * @returns {{ valid: boolean, errors: Array<{ field: string, code: string, message: string }>, warnings: Array<{ field: string, code: string, message: string }> }}
 */
function validateCatalogDefinition(rawCatalog, options = {}) {
    const errors = [];
    const warnings = [];

    if (!rawCatalog || typeof rawCatalog !== 'object') {
        return {
            valid: false,
            errors: [{ field: 'root', code: 'ERR_INVALID_OBJECT', message: 'La definizione deve essere un oggetto.' }],
            warnings: []
        };
    }

    // 1. VERIFICA DELLA LINGUA (Well-formedness)

    // ID
    const id = String(rawCatalog.id || '').trim();
    if (!id) {
        errors.push({ field: 'id', code: 'ERR_EMPTY_ID', message: "L'identificatore del catalogo è obbligatorio." });
    } else if (!/^[a-zA-Z0-9_\-.:]+$/.test(id)) {
        errors.push({ field: 'id', code: 'ERR_INVALID_ID_CHARS', message: `L'ID "${id}" contiene caratteri non ammessi.` });
    }

    // Nome
    const name = String(rawCatalog.name || '').trim();
    if (!name) {
        errors.push({ field: 'name', code: 'ERR_EMPTY_NAME', message: 'Il nome del catalogo è obbligatorio.' });
    } else if (name.length > LANGUAGE_RULES.MAX_NAME_LENGTH) {
        errors.push({ field: 'name', code: 'ERR_NAME_TOO_LONG', message: `Il nome supera la lunghezza massima di ${LANGUAGE_RULES.MAX_NAME_LENGTH} caratteri.` });
    }

    // MediaSet
    const mediaSet = Array.isArray(rawCatalog.mediaSet) ? rawCatalog.mediaSet : (rawCatalog.type ? [rawCatalog.type === 'series' ? 'serie' : 'film'] : []);
    if (!mediaSet || mediaSet.length === 0) {
        errors.push({ field: 'mediaSet', code: 'ERR_EMPTY_MEDIASET', message: 'Il catalogo deve specificare un mediaSet non vuoto.' });
    } else {
        const invalidMedia = mediaSet.filter(m => !ALLOWED_MEDIA_SET_VALUES.includes(m));
        if (invalidMedia.length > 0) {
            errors.push({ field: 'mediaSet', code: 'ERR_INVALID_MEDIASET', message: `mediaSet contiene valori non ammessi: ${invalidMedia.join(', ')}.` });
        }
    }

    // Asse Anime
    const anime = rawCatalog.anime !== undefined
        ? rawCatalog.anime
        : (rawCatalog.isAnime ? 'yes' : 'no');
    if (!ALLOWED_ANIME_AXIS.includes(anime)) {
        errors.push({ field: 'anime', code: 'ERR_INVALID_ANIME_AXIS', message: `Asse anime non valido: "${anime}". Ammessi: ${ALLOWED_ANIME_AXIS.join(', ')}.` });
    }

    // Ordinamento (Lingua)
    const sortBy = rawCatalog.sort?.by || rawCatalog.sort_by || rawCatalog.queries?.[0]?.sort_by;
    if (sortBy && !isMappedSortBy(sortBy) && sortBy !== 'affinity_score' && sortBy !== 'lastAiredAt' && sortBy !== '_mtime DESC') {
        warnings.push({ field: 'sort.by', code: 'WARN_UNKNOWN_SORT', message: `Ordinamento non standard: "${sortBy}".` });
    }

    // Filtri: controllo sintattico valori numerici / date — su TUTTI i blocchi di query, non solo
    // il primo: una definizione con `queries[1]` non valida deve fallire (ticket 27).
    const blocchiQuery = (Array.isArray(rawCatalog.filters?.queries) && rawCatalog.filters.queries.length > 0)
        ? rawCatalog.filters.queries
        : ((Array.isArray(rawCatalog.queries) && rawCatalog.queries.length > 0)
            ? rawCatalog.queries
            : [rawCatalog.filters || {}]);
    for (const [indiceBlocco, query0] of blocchiQuery.entries()) {
        const suffisso = blocchiQuery.length > 1 ? `[${indiceBlocco}]` : '';
        if (query0['vote_count.gte'] !== undefined) {
            const vc = Number(query0['vote_count.gte']);
            if (isNaN(vc) || vc < 0) {
                errors.push({ field: `filters${suffisso}.vote_count.gte`, code: 'ERR_INVALID_FILTER_VALUE', message: 'vote_count.gte deve essere un numero non negativo.' });
            }
        }
        if (query0['vote_average.gte'] !== undefined) {
            const va = Number(query0['vote_average.gte']);
            if (isNaN(va) || va < 0 || va > 10) {
                errors.push({ field: `filters${suffisso}.vote_average.gte`, code: 'ERR_INVALID_FILTER_VALUE', message: 'vote_average.gte deve essere compreso tra 0 e 10.' });
            }
        }
    }

    // Se ci sono già errori sintattici gravissimi, ritorniamo
    if (errors.some(e => e.field === 'id' || e.field === 'mediaSet')) {
        return { valid: false, errors, warnings };
    }

    // 2. INTERSEZIONE CON LE CAPACITÀ DELLA FONTE

    const targetSourceId = resolveTargetSource(rawCatalog, options.sourceId);
    const sourceCaps = getSourceCapabilities(targetSourceId);

    if (!sourceCaps) {
        errors.push({
            field: 'source',
            code: 'ERR_UNKNOWN_SOURCE',
            message: `Fonte non registrata: "${targetSourceId}".`
        });
        return { valid: false, errors, warnings };
    }

    // Verifica compatibilità mediaSet con la fonte
    if (!sourceCaps.canServeMediaSet(mediaSet)) {
        errors.push({
            field: 'mediaSet',
            code: 'ERR_SOURCE_CANNOT_SERVE_MEDIASET',
            message: `La fonte "${sourceCaps.name}" non supporta il mediaSet [${mediaSet.join(', ')}].`
        });
    }

    // Verifica compatibilità asse anime con la fonte
    if (!sourceCaps.canServeAnime(anime)) {
        errors.push({
            field: 'anime',
            code: 'ERR_SOURCE_CANNOT_SERVE_ANIME',
            message: `La fonte "${sourceCaps.name}" non supporta l'asse anime "${anime}".`
        });
    }

    // Verifica ordinamento con la fonte
    if (sortBy && !sourceCaps.canServeSort(sortBy)) {
        // Se la fonte dichiara ordinamenti stretti (es. airing_state vuole solo lastAiredAt)
        if (sourceCaps.supportedSorts.length > 0 && !sourceCaps.canServeSort(sortBy)) {
            errors.push({
                field: 'sort.by',
                code: 'ERR_SOURCE_CANNOT_SERVE_SORT',
                message: `La fonte "${sourceCaps.name}" non supporta l'ordinamento "${sortBy}".`
            });
        }
    }

    // Verifica dei singoli filtri dichiarati rispetto alle capacità della fonte — su TUTTI i
    // blocchi: un filtro non supportato in `queries[1]` deve far fallire la definizione (ticket 27).
    for (const [indiceBlocco, blocco] of blocchiQuery.entries()) {
        const suffisso = blocchiQuery.length > 1 ? `[${indiceBlocco}]` : '';
        const filterKeys = Object.keys(blocco).filter(k => k !== 'strategy' && k !== 'sort_by' && k !== 'provider' && k !== 'queries' && k !== 'where');
        for (const key of filterKeys) {
            if (!sourceCaps.canServeFilter(key)) {
                errors.push({
                    field: `filters${suffisso}.${key}`,
                    code: 'ERR_SOURCE_UNSUPPORTED_FILTER',
                    message: `Il filtro "${key}" non è supportato dalla fonte "${sourceCaps.name}".`
                });
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

module.exports = {
    LANGUAGE_RULES,
    resolveTargetSource,
    validateCatalogDefinition
};
