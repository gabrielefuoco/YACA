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
 * 1. Il Servire (src/stremio/CatalogRouter.js) che consulta il registro per servire un catalogo
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

/**
 * Un catalogo **scritto in sintassi** (`testo`) o già compilato (`intenti`).
 *
 * È il formato nuovo dei cataloghi personalizzati: il testo è la verità leggibile, gli `intenti`
 * sono lo snapshot stabile. Stesso parser/compilatore della ricerca — cambia solo chi li invoca.
 * Non solleva: un testo che non produce piani è una riga vuota con il motivo nei log.
 */
async function serveCatalogoScritto({ testo, intenti, ctx }) {
    try {
        const { compilaIntenti, eseguiPiani } = require('./compilatore');
        let elenco = Array.isArray(intenti) && intenti.length > 0 ? intenti : null;
        let motivi = [];

        if (!elenco && testo) {
            const { pianifica } = require('./pianificatore');
            const { creaRisolutori } = require('./risolutori');
            const analisi = await pianifica(testo, {
                risolutori: creaRisolutori({ type: ctx.type, contesto: ctx.activeProfileSettings })
            });
            elenco = analisi.intenti;
            motivi = analisi.motivi;
        }

        const compilato = compilaIntenti(elenco || [], { type: ctx.type });
        const esecuzione = await eseguiPiani(compilato.piani, {
            type: ctx.type,
            skip: ctx.skip || 0,
            cap: 20,
            contesto: ctx.activeProfileSettings
        });

        const tutti = [...motivi, ...compilato.motivi, ...(esecuzione.motivi || [])];
        if (tutti.length > 0) {
            console.log(`[CatalogoScritto] ${ctx.baseId || ctx.id}: ${tutti.join(' | ')}`);
        }
        return esecuzione.items || [];
    } catch (err) {
        console.error(`[CatalogoScritto] ${ctx.baseId || ctx.id}: ${err.message}`);
        return [];
    }
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
        // SCENARIO 1: Ricerca (locale + AI quando serve). Un solo percorso per la Ricerca Veloce
        // e per la Deep Search: la decisione se chiedere il piano AI vive in `ricercaUnificata`.
        if (ctx.search) {
            const { cercaUnificata } = require('./ricercaUnificata');
            return await cercaUnificata({
                q: ctx.search,
                type: ctx.type,
                skip: ctx.skip || 0,
                activeProfileSettings: ctx.activeProfileSettings,
                tmdbApiKey: ctx.tmdbApiKey
            });
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
        return await require('../indice').getDuckDbCatalogFromPreset(
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
        // Un solo estrattore di candidati locali per la porta e per il servire: se cambia la
        // fusione Tier 1/Tier 2/nomi appresi, cambia per entrambi (o per nessuno).
        const { candidatiLocali } = require('./ricercaUnificata');
        const type = searchCtx.tipo === 'series' ? 'series' : 'movie';
        return candidatiLocali({
            q: searchCtx.q,
            type,
            skip: 0,
            limit: searchCtx.cap || 20,
            contesto: searchCtx.contesto
        });
    }
});

// 2. Hybrid / Hero Recommendation Engine
const hybridSourceEntry = defineSourceEntry({
    id: 'hybrid',
    name: 'Hybrid Recommendation Engine (Hero Rows)',
    kind: 'recommendation',
    capabilities: hybridSource,

    appliesToCatalog(ctx) {
        const { TASTE_BASED_IDS } = require('../stremio/hybridServing');
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
        const { getEngineHybridCatalog } = require('../stremio/hybridServing');
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
        const { getTraktCatalog } = require('../stremio/providers/TraktProvider');
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
        const { getWatchlistCatalog } = require('../stremio/providers/WatchlistProvider');
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
        const { getAiringStateCatalog } = require('../stremio/providers/AiringStateProvider');
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
        const { executeUniversalPipeline } = require('../stremio/providers/AiDiscoveryProvider');
        const { normalizeToUniversalSchema } = require('../infra/resultMerger');

        // La ricerca non ha più due percorsi: `yaca_search_ai` e `yaca_search_standard` passano
        // dalla stessa funzione, che chiede il piano all'AI solo quando il locale non basta.
        if (ctx.search) {
            const { cercaUnificata } = require('./ricercaUnificata');
            return await cercaUnificata({
                q: ctx.search,
                type: ctx.type,
                skip: ctx.skip || 0,
                activeProfileSettings: ctx.activeProfileSettings,
                tmdbApiKey: ctx.tmdbApiKey
            });
        }

        if (ctx.catalogMeta || ctx.directFilters) {
            // Formato nuovo: il catalogo è scritto in sintassi (`testo`) o ha gli `intenti`.
            const testo = typeof ctx.catalogMeta?.testo === 'string'
                ? ctx.catalogMeta.testo
                : (typeof ctx.directFilters?.testo === 'string' ? ctx.directFilters.testo : null);
            const intenti = Array.isArray(ctx.catalogMeta?.intenti)
                ? ctx.catalogMeta.intenti
                : (Array.isArray(ctx.directFilters?.intenti) ? ctx.directFilters.intenti : null);
            if (testo || intenti) {
                return await serveCatalogoScritto({ testo, intenti, ctx });
            }

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

    // La ricerca non ha più un percorso AI: tutto passa dal parser della sintassi.
    appliesToSearch() {
        return false;
    },

    async search() {
        return [];
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
    hybridSourceEntry,     // Taste-based cataloghi
    traktSourceEntry,      // trakt_*
    watchlistSourceEntry,  // yaca_watchlist_*
    airingStateSourceEntry,// simulcast
    duckDbSourceEntry,     // Preset SQL con .where
    aiDiscoverySourceEntry // Ricerche residue e universal legacy pipeline
];

function registerSource(sourceEntry) {
    if (!sourceEntry || !sourceEntry.id) throw new TypeError('Voce fonte non valida');
    SOURCES_MAP.set(sourceEntry.id, sourceEntry);
    // Sostituisce la voce ANCHE nell'ordine di valutazione: `findSourceForCatalog` legge
    // l'array, non la mappa, quindi senza questo una fonte registrata resta invisibile al
    // dispatch dei cataloghi — ed e' il motivo per cui un test che registrava una fonte
    // «che solleva» passava per il motivo sbagliato: veniva servito dalla fonte vera.
    for (let i = 0; i < CATALOG_EVALUATION_ORDER.length; i++) {
        const corrente = CATALOG_EVALUATION_ORDER[i];
        if (corrente && corrente.id === sourceEntry.id) {
            CATALOG_EVALUATION_ORDER[i] = sourceEntry;
        }
    }
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
