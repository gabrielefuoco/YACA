/**
 * src/ricerca/registry.js
 *
 * IL REGISTRO DELLE FONTI (Ticket 22).
 *
 * Confine architetturale:
 * Le sei fonti del catalogo e della ricerca (DuckDB/Indice, Hybrid/Pool, Trakt,
 * Watchlist, AiringState, AI Discovery) diventano voci con un CONTRATTO ESPLICITO:
 * - chi è (id, name)
 * - che specie di fonte è (kind: index, recommendation, external_api, user_library, external_state, semantic)
 * - quando si applica (appliesToCatalog, appliesToSearch)
 * - come si interroga (serveCatalog, search)
 * - le sue capacità dichiarate (capabilities, conforme a capabilities.js)
 *
 * Ha DUE consumatori:
 * 1. Il Servire (src/catalog/CatalogRouter.js) che consulta il registro per servire un catalogo
 * 2. La Ricerca (src/ricerca/door.js) che consulta il registro per recuperare i candidati
 */

const {
    duckdbSource,
    hybridSource,
    traktSource,
    watchlistSource,
    airingStateSource,
    aiDiscoverySource
} = require('../catalog/capabilities');

const { mergeLocalWithTier2 } = require('./fusione');

/**
 * Validatore e factory di un'entrata nel registro delle fonti.
 */
function defineSourceEntry(spec) {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('Specifica fonte non valida');
    }
    if (!spec.id || typeof spec.id !== 'string') {
        throw new TypeError('id della fonte obbligatorio');
    }
    if (typeof spec.appliesToCatalog !== 'function') {
        throw new TypeError(`appliesToCatalog mancante per la fonte ${spec.id}`);
    }
    if (typeof spec.serveCatalog !== 'function') {
        throw new TypeError(`serveCatalog mancante per la fonte ${spec.id}`);
    }

    return Object.freeze({
        id: spec.id,
        name: spec.name || spec.id,
        kind: spec.kind || 'generic',
        capabilities: spec.capabilities || null,
        appliesToCatalog: spec.appliesToCatalog,
        serveCatalog: spec.serveCatalog,
        appliesToSearch: spec.appliesToSearch || (() => false),
        search: spec.search || (async () => [])
    });
}

// ============================================
// LE SEI FONTI CONTRATTUALIZZATE
// ============================================

// 1. DuckDB / Local Index
const duckDbSourceEntry = defineSourceEntry({
    id: 'duckdb',
    name: 'DuckDB Local Index (Discovery)',
    kind: 'index',
    capabilities: duckdbSource,

    appliesToCatalog(ctx) {
        const baseId = String(ctx.baseId || ctx.id || '');
        if (ctx.search && baseId === 'yaca_search_standard') return true;
        if (ctx.effectiveMeta?.where) return true;
        if (ctx.effectiveMeta?._provider === 'duckdb') return true;
        if (ctx.directFilters?._search) return true;
        return false;
    },

    async serveCatalog(ctx) {
        const DuckDbProvider = require('../catalog/providers/DuckDbProvider');

        // SCENARIO 1: Ricerca standard (locale + Tier 2 + nomi appresi)
        if (ctx.search) {
            const { getDuckDbCatalogFromFilters } = DuckDbProvider;
            const { searchTier2, searchLearnedTitles, LEARNED_PAGE_SIZE } = require('../catalog/tier2Search');
            const { enrichTier2Items } = require('../catalog/tier2Enrich');

            const PRESET_PAGE_SIZE = 20;
            const localItems = await getDuckDbCatalogFromFilters(
                { _search: ctx.search },
                ctx.type,
                ctx.skip || 0,
                PRESET_PAGE_SIZE,
                ctx.activeProfileSettings
            );

            const tier2Items = searchTier2(ctx.search, { type: ctx.type, limit: PRESET_PAGE_SIZE });
            const merged = mergeLocalWithTier2(localItems, tier2Items);

            const learnedItems = await searchLearnedTitles(ctx.search, { type: ctx.type, limit: LEARNED_PAGE_SIZE });
            return await enrichTier2Items(mergeLocalWithTier2(merged, learnedItems), { apiKey: ctx.tmdbApiKey });
        }

        // SCENARIO 2: SQL Diretto da preset/where
        let presetToRun = ctx.effectiveMeta;
        if (ctx.sortBy) {
            const { applySortWithTieBreakers } = require('../catalog/catalogSorting');
            presetToRun = {
                ...ctx.effectiveMeta,
                orderBy: applySortWithTieBreakers(ctx.effectiveMeta, ctx.sortBy, ctx.effectiveMeta.type || ctx.type)
            };
        }
        const isPresetCatalog = ctx.baseId.startsWith('preset_') || String(ctx.effectiveMeta?.id || '').startsWith('preset_');
        return await DuckDbProvider.getDuckDbCatalogFromPreset(
            presetToRun,
            ctx.skip || 0,
            isPresetCatalog ? 20 : 100,
            { kidsMode: Boolean(ctx.activeProfileSettings?.kidsMode) }
        );
    },

    appliesToSearch(searchCtx) {
        const tipo = searchCtx.tipo;
        return !tipo || tipo === 'titolo' || tipo === 'multi' || tipo === 'movie' || tipo === 'series';
    },

    async search(searchCtx) {
        try {
            const DuckDbProvider = require('../catalog/providers/DuckDbProvider');
            const { searchTier2, searchLearnedTitles, LEARNED_PAGE_SIZE } = require('../catalog/tier2Search');

            const limit = searchCtx.cap || 20;
            const type = searchCtx.tipo === 'series' ? 'series' : 'movie';

            const localItems = await DuckDbProvider.getDuckDbCatalogFromFilters(
                { _search: searchCtx.q },
                type,
                0,
                limit,
                searchCtx.contesto
            ).catch(() => []);

            const tier2Items = searchTier2(searchCtx.q, { type, limit });
            const learnedItems = await searchLearnedTitles(searchCtx.q, { type, limit: LEARNED_PAGE_SIZE }).catch(() => []);

            return mergeLocalWithTier2(mergeLocalWithTier2(localItems, tier2Items), learnedItems);
        } catch (_) {
            return [];
        }
    }
});

// 2. Hybrid / Hero Recommendation Engine
const hybridSourceEntry = defineSourceEntry({
    id: 'hybrid',
    name: 'Hybrid Recommendation Engine (Hero Rows)',
    kind: 'recommendation',
    capabilities: hybridSource,

    appliesToCatalog(ctx) {
        const { TASTE_BASED_IDS } = require('../catalog/providers/HybridProvider');
        const { isHeroCatalogId, HERO_SYSTEM_CATALOGS } = require('../catalog/registry');
        const id = ctx.id || ctx.baseId || '';
        const baseId = ctx.baseId || ctx.id || '';
        const isBaseHero = Array.isArray(HERO_SYSTEM_CATALOGS) && HERO_SYSTEM_CATALOGS.some(r => r.idBase === baseId || r.idBase === id);

        return TASTE_BASED_IDS.has(baseId) ||
            TASTE_BASED_IDS.has(id) ||
            isHeroCatalogId(baseId) ||
            isHeroCatalogId(id) ||
            isBaseHero ||
            ctx.effectiveMeta?._provider === 'hybrid' ||
            ctx.effectiveMeta?.system?.provider === 'hybrid';
    },

    async serveCatalog(ctx) {
        const { getEngineHybridCatalog } = require('../catalog/providers/HybridProvider');
        return await getEngineHybridCatalog(
            ctx.baseId,
            ctx.type,
            ctx.skip || 0,
            ctx.userConfig,
            ctx.tmdbApiKey,
            ctx.activeProfileSettings
        );
    },

    appliesToSearch() {
        return false;
    },

    async search() {
        return [];
    }
});

// 3. Trakt (Community / Trending)
const traktSourceEntry = defineSourceEntry({
    id: 'trakt',
    name: 'Trakt Lists & Community',
    kind: 'external_api',
    capabilities: traktSource,

    appliesToCatalog(ctx) {
        const baseId = String(ctx.baseId || ctx.id || '');
        return baseId.startsWith('trakt_') || ctx.catalogMeta?._provider === 'trakt';
    },

    async serveCatalog(ctx) {
        const { getTraktCatalog } = require('../catalog/providers/TraktProvider');
        return await getTraktCatalog(ctx.baseId, ctx.skip || 0, ctx.userConfig, ctx.tmdbApiKey, ctx.extra?.hostUrl);
    },

    appliesToSearch() {
        return false;
    },

    async search() {
        return [];
    }
});

// 4. Watchlist (User Library Sync)
const watchlistSourceEntry = defineSourceEntry({
    id: 'watchlist',
    name: 'User Watchlist / Personal Library',
    kind: 'user_library',
    capabilities: watchlistSource,

    appliesToCatalog(ctx) {
        const id = String(ctx.id || ctx.baseId || '');
        return id === 'yaca_watchlist_movies' ||
            id === 'yaca_watchlist_series' ||
            id === 'yaca_watchlist_anime' ||
            id.startsWith('yaca_watchlist_');
    },

    async serveCatalog(ctx) {
        const { getWatchlistCatalog } = require('../catalog/providers/WatchlistProvider');
        return await getWatchlistCatalog(ctx.id, ctx.type, ctx.skip || 0, ctx.userConfig, ctx.activeProfileSettings);
    },

    appliesToSearch() {
        return false;
    },

    async search() {
        return [];
    }
});

// 5. Airing State (Anime Simulcast)
const airingStateSourceEntry = defineSourceEntry({
    id: 'airing_state',
    name: 'Anime Airing State (Simulcast)',
    kind: 'external_state',
    capabilities: airingStateSource,

    appliesToCatalog(ctx) {
        const baseId = String(ctx.baseId || ctx.id || '');
        return baseId === 'preset_anime_simulcast' ||
            ctx.catalogMeta?._provider === 'airing_state' ||
            ctx.catalogMeta?._provider === 'anilist_simulcast';
    },

    async serveCatalog(ctx) {
        const { getAiringStateCatalog } = require('../catalog/providers/AiringStateProvider');
        return await getAiringStateCatalog(ctx.skip || 0);
    },

    appliesToSearch() {
        return false;
    },

    async search() {
        return [];
    }
});

// 6. AI Discovery & Universal Pipeline
const aiDiscoverySourceEntry = defineSourceEntry({
    id: 'ai_discovery',
    name: 'AI Discovery & Universal Pipeline',
    kind: 'semantic',
    capabilities: aiDiscoverySource,

    appliesToCatalog(ctx) {
        const baseId = String(ctx.baseId || ctx.id || '');
        if (ctx.search && baseId !== 'yaca_search_standard') return true;
        if (ctx.catalogMeta || ctx.directFilters) return true;
        return false;
    },

    async serveCatalog(ctx) {
        const { executeCombinedSearch, executeUniversalPipeline } = require('../catalog/providers/AiDiscoveryProvider');
        const { normalizeToUniversalSchema } = require('../utils/resultMerger');

        if (ctx.search) {
            return await executeCombinedSearch(
                ctx.search,
                ctx.userConfig,
                ctx.type,
                ctx.skip || 0,
                ctx.activeProfileSettings,
                ctx.tmdbFetchOptions
            );
        }

        if (ctx.catalogMeta || ctx.directFilters) {
            const universalCatalog = normalizeToUniversalSchema(ctx.catalogMeta, ctx.directFilters);
            if (ctx.sortBy && universalCatalog.queries) {
                for (const q of universalCatalog.queries) {
                    q.sort_by = ctx.sortBy;
                }
            }
            const noFallback = ctx.extra?.noFallback || false;
            return await executeUniversalPipeline(
                universalCatalog,
                ctx.tmdbClient,
                ctx.tmdbApiKey,
                ctx.type,
                ctx.skip || 0,
                { ...ctx.activeProfileSettings, noFallback },
                ctx.tmdbFetchOptions
            );
        }

        return [];
    },

    appliesToSearch(searchCtx) {
        return Boolean(searchCtx.deepAi || searchCtx.semantic || searchCtx.useAi);
    },

    async search(searchCtx) {
        try {
            const { executeCombinedSearch } = require('../catalog/providers/AiDiscoveryProvider');
            return await executeCombinedSearch(
                searchCtx.q,
                searchCtx.userConfig || {},
                searchCtx.type || 'movie',
                0,
                searchCtx.contesto || {},
                {}
            );
        } catch (_) {
            return [];
        }
    }
});

// ============================================
// IL REGISTRO E LE SUE FUNZIONI
// ============================================

const SOURCES_MAP = new Map([
    ['duckdb', duckDbSourceEntry],
    ['hybrid', hybridSourceEntry],
    ['trakt', traktSourceEntry],
    ['watchlist', watchlistSourceEntry],
    ['airing_state', airingStateSourceEntry],
    ['ai_discovery', aiDiscoverySourceEntry]
]);

// Ordine di valutazione per CatalogRouter
const CATALOG_EVALUATION_ORDER = [
    duckDbSourceEntry,     // Cattura yaca_search_standard se search presente
    aiDiscoverySourceEntry,// Cattura altre ricerche se search presente
    hybridSourceEntry,     // Taste-based cataloghi
    traktSourceEntry,      // trakt_*
    watchlistSourceEntry,  // yaca_watchlist_*
    airingStateSourceEntry,// simulcast
    duckDbSourceEntry,     // Preset SQL con .where
    aiDiscoverySourceEntry // Universal legacy pipeline
];

function registerSource(sourceEntry) {
    if (!sourceEntry || !sourceEntry.id) throw new TypeError('Voce fonte non valida');
    SOURCES_MAP.set(sourceEntry.id, sourceEntry);
}

function getSource(sourceId) {
    return SOURCES_MAP.get(sourceId) || null;
}

function getAllSources() {
    return Array.from(SOURCES_MAP.values());
}

/**
 * Consumatore 1: il Servire (CatalogRouter).
 * Trova la fonte competente per una richiesta di catalogo.
 *
 * @param {Object} requestContext
 * @returns {Object|null} Entry della fonte o null
 */
function findSourceForCatalog(requestContext) {
    for (const source of CATALOG_EVALUATION_ORDER) {
        if (source.appliesToCatalog(requestContext)) {
            return source;
        }
    }
    return null;
}

/**
 * Consumatore 2: la Ricerca (door).
 * Trova le fonti applicabili per una query di ricerca.
 *
 * @param {Object} searchContext
 * @returns {Array<Object>} Entries delle fonti abilitate alla ricerca
 */
function findSourcesForSearch(searchContext) {
    const applicable = [];
    for (const source of SOURCES_MAP.values()) {
        if (source.appliesToSearch(searchContext)) {
            applicable.push(source);
        }
    }
    return applicable;
}

module.exports = {
    defineSourceEntry,
    registerSource,
    getSource,
    getAllSources,
    findSourceForCatalog,
    findSourcesForSearch,
    // Le sei fonti esposte singolarmente
    duckDbSourceEntry,
    hybridSourceEntry,
    traktSourceEntry,
    watchlistSourceEntry,
    airingStateSourceEntry,
    aiDiscoverySourceEntry
};
