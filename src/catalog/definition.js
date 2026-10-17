// src/catalog/definition.js

/**
 * DEFINIZIONE DEL TIPO CATALOGO (Ticket 23).
 *
 * Unica natura di catalogo per tutto il prodotto:
 * sia la riga hero di sistema sia il preset utente condividono la stessa forma dichiarativa.
 *
 * Campi del tipo:
 * - id: identificatore univoco del catalogo
 * - name: nome utente / etichetta visibile
 * - emoji: icona o emoji del catalogo
 * - mediaSet: Array<'film' | 'serie'> (sottoinsieme non vuoto)
 * - anime: asse anime ('yes' | 'no' | 'mixed' | 'agnostic')
 * - filters: oggetto dichiarativo dei filtri (ingresso per il compilatore dell'indice, Ticket 22)
 * - sort: configurazione dell'ordinamento ({ by, orderBy, sortable, presentation_strategy })
 * - system: proprietà di sistema ({ isSystem, userModifiable, priority, additive, alwaysVisible, strategy, uiType, idBase, label, desc, category, provider })
 */

const ALLOWED_MEDIA_SET_VALUES = Object.freeze(['film', 'serie']);
const ALLOWED_ANIME_AXIS = Object.freeze(['yes', 'no', 'mixed', 'agnostic']);

/**
 * Normalizza il mediaSet da input eterogenei (es. type: 'movie' -> ['film']).
 *
 * @param {Array<string>|string} mediaSetOrType
 * @returns {Array<'film' | 'serie'>}
 */
function normalizeMediaSet(mediaSetOrType) {
    if (Array.isArray(mediaSetOrType) && mediaSetOrType.length > 0) {
        const cleaned = mediaSetOrType
            .map(s => String(s).trim().toLowerCase())
            .filter(s => ALLOWED_MEDIA_SET_VALUES.includes(s));
        if (cleaned.length > 0) {
            return Array.from(new Set(cleaned));
        }
    }
    const str = String(mediaSetOrType || '').trim().toLowerCase();
    if (str === 'movie' || str === 'film') return ['film'];
    if (str === 'series' || str === 'serie' || str === 'tv') return ['serie'];
    if (str === 'both') return ['film', 'serie'];
    return ['film']; // fallback default
}

/**
 * Deriva la stringa Stremio / canonical `type` da un `mediaSet`.
 *
 * @param {Array<string>} mediaSet
 * @returns {'movie' | 'series' | 'both'}
 */
function mediaSetToType(mediaSet) {
    const hasFilm = mediaSet.includes('film');
    const hasSerie = mediaSet.includes('serie');
    if (hasFilm && hasSerie) return 'both';
    if (hasSerie) return 'series';
    return 'movie';
}

/**
 * Normalizza l'asse anime.
 *
 * @param {'yes' | 'no' | 'mixed' | 'agnostic' | boolean} anime
 * @returns {'yes' | 'no' | 'mixed' | 'agnostic'}
 */
function normalizeAnimeAxis(anime) {
    if (typeof anime === 'boolean') {
        return anime ? 'yes' : 'no';
    }
    const str = String(anime || '').trim().toLowerCase();
    if (ALLOWED_ANIME_AXIS.includes(str)) {
        return str;
    }
    return 'no';
}

/**
 * Costruisce e normalizza un oggetto definizione catalogo conforme al tipo unificato.
 *
 * @param {Object} rawDef
 * @returns {Object} Definizione catalogo conforme al tipo unificato
 */
function defineCatalog(rawDef = {}) {
    if (!rawDef || typeof rawDef !== 'object') {
        throw new TypeError('La definizione del catalogo deve essere un oggetto.');
    }

    const id = String(rawDef.id || '').trim();
    const name = String(rawDef.name || '').trim();
    const emoji = rawDef.emoji ? String(rawDef.emoji).trim() : '📁';

    // Risoluzione mediaSet e tipo
    const mediaSet = normalizeMediaSet(rawDef.mediaSet || rawDef.type);
    const type = mediaSetToType(mediaSet);

    // Risoluzione asse anime
    const anime = normalizeAnimeAxis(
        rawDef.anime !== undefined
            ? rawDef.anime
            : (rawDef.isAnime ? 'yes' : 'no')
    );

    // Filtri: ingresso per il compilatore (Ticket 22)
    const rawFilters = rawDef.filters || {};
    const queries = Array.isArray(rawFilters.queries)
        ? rawFilters.queries
        : (Array.isArray(rawDef.queries) ? rawDef.queries : []);

    const filters = {
        ...rawFilters,
        queries,
        where: rawFilters.where || rawDef.where || undefined
    };

    // Proprietà di sistema (distinzione tra offerta di sistema e richiesta utente)
    const rawSystem = rawDef.system || {};
    const isSystem = rawSystem.isSystem !== undefined
        ? Boolean(rawSystem.isSystem)
        : Boolean(rawDef.isSystem || rawDef.priority !== undefined);

    const userModifiable = rawSystem.userModifiable !== undefined
        ? Boolean(rawSystem.userModifiable)
        : (rawDef.userModifiable !== undefined ? Boolean(rawDef.userModifiable) : !isSystem);

    const priority = rawSystem.priority !== undefined
        ? rawSystem.priority
        : (rawDef.priority !== undefined ? rawDef.priority : null);

    const additive = rawSystem.additive !== undefined
        ? Boolean(rawSystem.additive)
        : Boolean(rawDef.additive);

    const provider = rawSystem.provider || rawDef.provider || rawDef._provider || (isSystem ? 'hybrid' : (queries[0]?.provider || (id === 'preset_anime_simulcast' ? 'airing_state' : 'duckdb')));

    // Ordinamento: usa i default della famiglia di catalogo (Ticket 18)
    let defaultSortBy = 'popularity.desc';
    if (provider === 'airing_state') defaultSortBy = 'lastAiredAt';
    else if (provider === 'hybrid' || isSystem) defaultSortBy = 'affinity_score';
    else if (provider === 'watchlist') defaultSortBy = '_mtime DESC';

    const rawSort = rawDef.sort || {};
    const sort = {
        by: rawSort.by || rawDef.sort_by || queries[0]?.sort_by || defaultSortBy,
        orderBy: rawSort.orderBy || rawDef.orderBy || undefined,
        sortable: rawSort.sortable !== undefined
            ? Boolean(rawSort.sortable)
            : (rawDef.sortable !== undefined ? Boolean(rawDef.sortable) : (provider !== 'airing_state' && !isSystem)),
        presentation_strategy: rawSort.presentation_strategy || rawDef.presentation_strategy || 'popularity'
    };

    const alwaysVisible = rawSystem.alwaysVisible !== undefined
        ? Boolean(rawSystem.alwaysVisible)
        : Boolean(rawDef.alwaysVisible);

    const strategy = rawSystem.strategy !== undefined
        ? rawSystem.strategy
        : (rawDef.strategy !== undefined ? rawDef.strategy : null);

    const uiType = rawSystem.uiType || rawDef.uiType || (isSystem ? 'algo' : null);
    const idBase = rawSystem.idBase || rawDef.idBase || (id.replace(/_(movies|series)$/, ''));
    const label = rawSystem.label || rawDef.label || name.replace(/^[^\w\s]+\s*/, '');
    const desc = rawSystem.desc || rawDef.desc || '';
    const category = rawSystem.category || rawDef.category || (isSystem ? '⭐ Raccomandazioni YACA' : 'Generale');

    const system = {
        isSystem,
        userModifiable,
        priority,
        additive,
        alwaysVisible,
        strategy,
        uiType,
        idBase,
        label,
        desc,
        category,
        provider
    };

    // Crea l'oggetto definizione con struttura canonica + compatibilità retroattiva
    const definition = {
        id,
        name,
        emoji,
        mediaSet,
        anime,
        filters,
        sort,
        system,

        // --- Proprietà piatte per retrocompatibilità con i consumatori esistenti ---
        type,
        isAnime: anime === 'yes',
        category,
        queries,
        where: filters.where,
        orderBy: sort.orderBy,
        sortable: sort.sortable,
        presentation_strategy: sort.presentation_strategy,
        _provider: provider,
        priority,
        additive,
        userModifiable,
        alwaysVisible,
        strategy,
        uiType,
        idBase,
        label,
        desc,
        ...(rawDef.showEpisodeBadge !== undefined ? { showEpisodeBadge: rawDef.showEpisodeBadge } : {}),
        ...(rawDef.weights !== undefined ? { weights: rawDef.weights } : {})
    };

    return definition;
}

module.exports = {
    ALLOWED_MEDIA_SET_VALUES,
    ALLOWED_ANIME_AXIS,
    normalizeMediaSet,
    mediaSetToType,
    normalizeAnimeAxis,
    defineCatalog,
    createCatalogDefinition: defineCatalog
};
