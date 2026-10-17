// src/catalog/index.js

/**
 * MODULO CATALOGO YACA (Ticket 23).
 *
 * Confine architetturale: "Il catalogo è un tipo, il feed è chi lo serve."
 *
 * Possiede:
 * 1. Il TIPO (una sola natura dichiarativa: nome, emoji, mediaSet, anime, filtri, ordinamento, proprietà di sistema)
 * 2. I DUE DATASET nella stessa forma (sistema: le 12 righe hero; utente: i preset)
 * 3. Le DERIVAZIONI (manifest, impronte, kind, pool spec, gruppi UI, registry hash)
 * 4. La VALIDAZIONE (intersezione lingua × capacità dichiarate delle fonti)
 * 5. Il CONTRATTO DELL'ANTEPRIMA (card con cap a 20 e forma della diagnosi)
 *
 * Non possiede: il servire (router, provider, handler, formatter).
 */

const {
    defineCatalog,
    createCatalogDefinition,
    normalizeMediaSet,
    mediaSetToType,
    normalizeAnimeAxis,
    ALLOWED_MEDIA_SET_VALUES,
    ALLOWED_ANIME_AXIS
} = require('./definition');

const {
    HERO_REGISTRY,
    HERO_SYSTEM_CATALOGS,
    HERO_PREFIXES,
    HERO_IDS,
    HERO_CATALOG_IDS_SET,
    getManifestHeroCatalogs,
    getHeroCatalogFingerprintRows,
    getHeroCatalogModes,
    getHeroPrefixes,
    isHeroCatalogId,
    getHeroCatalogKindMap,
    getHeroUiGroups,
    getHeroPoolSpec,
    getRegistryHash
} = require('./registry');

const {
    defineSourceCapabilities,
    getSourceCapabilities,
    getAllSourceCapabilities,
    registerSourceCapabilities,
    DUCKDB_SUPPORTED_FILTERS,
    duckdbSource,
    airingStateSource,
    hybridSource,
    watchlistSource
} = require('./capabilities');

const {
    validateCatalogDefinition,
    resolveTargetSource,
    LANGUAGE_RULES
} = require('./validation');

const {
    PREVIEW_CAP,
    DEFAULT_TAGLIATI_SHAPE,
    formatPreviewResponse,
    validatePreviewResponse
} = require('./previewContract');

const {
    getCatalogKind,
    isCatalogConformant,
    getIncompatibilityReason
} = require('./catalogKind');

const {
    FAMILY_SORT_DEFAULTS,
    SORT_OPTIONS,
    USER_SORT_MAP,
    SUPPORTED_SORT_BY,
    isMappedSortBy,
    isCatalogSortable,
    translateSort,
    mapSortBy,
    getSortComparator,
    getSortByValue,
    applySortWithTieBreakers
} = require('./catalogSorting');

module.exports = {
    // Tipo e factory
    defineCatalog,
    createCatalogDefinition,
    normalizeMediaSet,
    mediaSetToType,
    normalizeAnimeAxis,
    ALLOWED_MEDIA_SET_VALUES,
    ALLOWED_ANIME_AXIS,

    // Dataset di sistema (12 righe hero)
    SYSTEM_CATALOGS: HERO_SYSTEM_CATALOGS,
    HERO_SYSTEM_CATALOGS,
    HERO_REGISTRY,
    HERO_PREFIXES,
    HERO_IDS,
    HERO_CATALOG_IDS_SET,

    // Derivazioni
    getManifestHeroCatalogs,
    getHeroCatalogFingerprintRows,
    getHeroCatalogModes,
    getHeroPrefixes,
    isHeroCatalogId,
    getHeroCatalogKindMap,
    getHeroUiGroups,
    getHeroPoolSpec,
    getRegistryHash,

    // Validazione
    validateCatalogDefinition,
    resolveTargetSource,
    LANGUAGE_RULES,

    // Capacità fonti
    defineSourceCapabilities,
    getSourceCapabilities,
    getAllSourceCapabilities,
    registerSourceCapabilities,
    DUCKDB_SUPPORTED_FILTERS,
    duckdbSource,
    airingStateSource,
    hybridSource,
    watchlistSource,

    // Contratto anteprima
    PREVIEW_CAP,
    DEFAULT_TAGLIATI_SHAPE,
    formatPreviewResponse,
    validatePreviewResponse,

    // Kind e conformità
    getCatalogKind,
    isCatalogConformant,
    getIncompatibilityReason,

    // Ordinamento
    FAMILY_SORT_DEFAULTS,
    SORT_OPTIONS,
    USER_SORT_MAP,
    SUPPORTED_SORT_BY,
    isMappedSortBy,
    isCatalogSortable,
    translateSort,
    mapSortBy,
    getSortComparator,
    getSortByValue,
    applySortWithTieBreakers
};
