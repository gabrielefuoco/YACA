// src/pool/index.js

/**
 * MODULO POOL DI YACA (Ticket 12).
 *
 * Incapsula l'intera logica di composizione e gestione del pool dei cataloghi hero:
 * - Porta unica di accesso per il feed (getHeroPool).
 * - HERO_PRIORITY e righe additive (SLUG_ADDITIVI) consumati da src/catalog/registry.js.
 * - Le 4 strategie storiche (trueBlend, seed_network, hiddenGems, trakt_filtered) più
 *   le righe del grafo sono voci di una lista (HERO_STRATEGIES).
 *   (Il ticket 08 sostituirà l'entry del grafo con la chiamata al servizio Python).
 * - Assegnazione esclusiva (pairwise disjoint / claimedIds).
 * - Limiti per catalogo (HERO_MAX_ITEMS_PER_CATALOG) e soglie di fallback (HERO_MIN_FALLBACK_ITEMS).
 * - Degrado Trakt (hiddenForInsufficientFallback).
 * - Cache di gruppo e dedup delle build concorrenti (HERO_CACHE_KEY_VERSION = 'v12').
 */

const cache = require('../cache');
const { hybridRecommendationsCache } = require('../cache/cacheInstances');
const { normalizeContentId } = require('../catalog/contentId');
const { getHeroPoolSpec } = require('../catalog/registry');
const {
    fetchProfileContext,
    fetchPopularFallbackIds,
    fetchTopRatedPeriodFallbackIds,
    fetchUndiscoveredFallbackIds,
    fetchHiddenGemsFallbackIds,
    fetchTraktRecommendationsRawDetailed
} = require('../engines/hybrid/dataFetchers');
const catalogStrategies = require('../engines/hybrid/catalogStrategies');
const {
    buildTopGenresMixCatalog,
    buildHybridCatalog,
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalog,
    buildTraktFilteredCatalogWithMeta
} = catalogStrategies;

const { heroPriority: HERO_PRIORITY, slugAdditivi: SLUG_ADDITIVI } = getHeroPoolSpec();
const graphClient = require('../clients/graphClient');
const { resolveAnimePolicy, isAnimeContent } = require('../anime');

const HERO_CATALOG_IDS = new Map([
    ...HERO_PRIORITY.flatMap(slug => ['movie', 'series'].map(mediaType => [
        `yaca_${slug}_${mediaType === 'movie' ? 'movies' : 'series'}`,
        { slug, mediaType }
    ]))
]);

const HERO_CACHE_KEY_VERSION = 'v14';
const HERO_CACHE_SCHEMA_VERSION = 7;
const HERO_MIN_FALLBACK_ITEMS = 10;
const HERO_MAX_ITEMS_PER_CATALOG = 100;
const activeHeroGroupBuilds = new Map();

function getHeroCatalogInfo(catalogId) {
    return HERO_CATALOG_IDS.get(catalogId) || null;
}

function getHeroCatalogId(slug, mediaType) {
    return `yaca_${slug}_${mediaType === 'movie' ? 'movies' : 'series'}`;
}

function buildSharedHeroCacheKey({ userId, context, mediaType, kidsMode, typeSelectors, graphVersions, slider, sliders }) {
    const versions = graphVersions !== undefined ? graphVersions : graphClient.getGraphHealthVersionsCached();
    const sl = sliders || slider;
    const { chiave } = cache.deriva({
        nome: 'heroes',
        versione: HERO_CACHE_KEY_VERSION,
        dipendenze: {
            varia: {
                utente: userId,
                profilo: context,
                media: mediaType,
                kids: kidsMode,
                selettori: typeSelectors,
                ...(isNewHiddenGemsActive() ? { nuova_catena_hidden_gems: 'true' } : {}),
                ...(sl ? { slider: sl } : {})
            },
            invalida: {
                artefatto: versions?.artefatto,
                ricetta: versions?.ricetta
            }
        }
    });
    return chiave;
}

function getRecommendationId(item) {
    const rawId = item && typeof item === 'object' ? item.id : item;
    const id = normalizeContentId(rawId ?? '');
    if (!id || ['undefined', 'null', 'nan'].includes(id.toLowerCase())) return '';
    return id;
}

function ensurePoolItem(item, mediaType) {
    const isObj = typeof item === 'object' && item !== null;
    const rawId = isObj ? (item.id || item.tmdbId) : item;
    const cleanId = normalizeContentId(rawId);
    const tmdbId = Number(cleanId);
    const defaultType = mediaType === 'movie' ? 'movie' : 'series';
    const defaultMediaType = mediaType === 'movie' ? 'movie' : 'tv';
    if (isObj) {
        return {
            ...item,
            id: item.id && String(item.id).startsWith('tmdb:') ? item.id : `tmdb:${cleanId}`,
            tmdbId: Number.isFinite(item.tmdbId) ? item.tmdbId : (Number.isFinite(tmdbId) ? tmdbId : cleanId),
            type: item.type || defaultType,
            media_type: item.media_type || (item.type === 'series' ? 'tv' : defaultMediaType),
            toString() { return this.id; }
        };
    }
    return {
        id: `tmdb:${cleanId}`,
        tmdbId: Number.isFinite(tmdbId) ? tmdbId : cleanId,
        type: defaultType,
        media_type: defaultMediaType,
        toString() { return this.id; }
    };
}

/**
 * Assegna in modo esclusivo i candidati dei quattro hero secondo priorità.
 */
function assignHeroPools(poolsByCatalog, mediaType, maxItemsPerCatalog = HERO_MAX_ITEMS_PER_CATALOG) {
    const assigned = {};
    const claimedIds = new Set();

    for (const slug of HERO_PRIORITY) {
        const catalogId = getHeroCatalogId(slug, mediaType);
        const pool = Array.isArray(poolsByCatalog?.[catalogId]) ? poolsByCatalog[catalogId] : [];
        const catalogIds = [];
        for (const item of pool) {
            const id = getRecommendationId(item);
            if (!id || claimedIds.has(id)) continue;
            claimedIds.add(id);
            catalogIds.push(ensurePoolItem(item, mediaType));
            if (catalogIds.length >= maxItemsPerCatalog) break;
        }
        assigned[catalogId] = catalogIds;
    }

    return assigned;
}

function isSharedHeroCacheEntry(entry, mediaType) {
    if (!entry || entry.schemaVersion !== HERO_CACHE_SCHEMA_VERSION || entry.mediaType !== mediaType || !entry.catalogs) return false;
    if (!['movie', 'series'].includes(mediaType)) return false;

    const claimedIds = new Set();
    for (const slug of HERO_PRIORITY) {
        if (SLUG_ADDITIVI.has(slug)) continue; // le righe del grafo non sono disgiunte, per scelta
        const pool = entry.catalogs[getHeroCatalogId(slug, mediaType)];
        if (!Array.isArray(pool)) return false;
        for (const item of pool) {
            const id = getRecommendationId(item);
            if (!id || claimedIds.has(id)) return false;
            claimedIds.add(id);
        }
    }
    return true;
}

function normalizePoolResult(result) {
    if (Array.isArray(result)) return result;
    return Array.isArray(result?.ids) ? result.ids : [];
}

async function runPoolBuilder(builder, fallbackBuilder, label, args) {
    try {
        return await builder(...args);
    } catch (error) {
        console.error(`[HeroPool] ${label} builder failed:`, error?.message || error);
        return fallbackBuilder();
    }
}

function isNewHiddenGemsActive() {
    return process.env.FLAG_NUOVA_CATENA_HIDDEN_GEMS === 'true';
}

function setFlagNewHiddenGems(val) {
    if (val === null || val === undefined) {
        delete process.env.FLAG_NUOVA_CATENA_HIDDEN_GEMS;
    } else {
        process.env.FLAG_NUOVA_CATENA_HIDDEN_GEMS = String(val);
    }
}

async function buildHiddenGemsOnNewProvider(ctx) {
    const indice = require('../indice');
    const resolvedContext = (ctx.context && typeof ctx.context === 'object' && ctx.context.selettoriEffettivi)
        ? {
            ...ctx.context,
            tasteProfile: ctx.tasteProfile || ctx.profile || ctx.context.tasteProfile || ctx.context.profile || null,
            profile: ctx.tasteProfile || ctx.profile || ctx.context.profile || null
        }
        : {
            userId: ctx.userId,
            profileId: typeof ctx.context === 'string' ? ctx.context : (ctx.context?.profileId || 'global'),
            addonUuid: ctx.userConfig?.uuid || ctx.userConfig?.addonUuid || null,
            selettoriEffettivi: ctx.effectiveSelectors || {},
            kidsMode: Boolean(ctx.kidsMode),
            sliders: ctx.sliders || ctx.slider || {},
            tasteProfile: ctx.tasteProfile || ctx.profile || null,
            profile: ctx.tasteProfile || ctx.profile || null
        };

    const result = await indice.candidati(resolvedContext, {
        mediaType: ctx.mediaType,
        strategia: 'hidden_gems',
        limit: ctx.heroCandidateLimit
    });

    if (result?.candidati && result.candidati.length > 0) {
        const items = result.candidati.map(c => ({
            id: String(c.id),
            matchScore: Math.min(100, Math.max(1, Math.round((c.punteggio || 0) * 10))),
            motivo: c.motivo,
            punteggio: c.punteggio,
            genres: c.genres
        }));
        items.ids = items;
        items.meta = { motivi: result.motivi || [] };
        return items;
    }

    return fetchHiddenGemsFallbackIds(ctx.tmdbApiKey, ctx.mediaType, ctx.heroCandidateLimit, ctx.kidsMode, ctx.effectiveSelectors);
}

/**
 * Definizione a lista delle strategie nel modulo pool.
 * Le quattro strategie hero producono candidati per l'assegnazione disgiunta.
 * La voce del grafo aggiunge righe additive DOPO l'assegnazione disgiunta.
 * (Ticket 08 sostituirà l'entry del grafo con la chiamata al servizio Python).
 */
const HERO_STRATEGIES = [
    {
        name: 'true_blend',
        slug: 'true_blend',
        additive: false,
        run: async (ctx) => {
            return await runPoolBuilder(
                buildTopGenresMixCatalog,
                () => fetchPopularFallbackIds(ctx.tmdbApiKey, ctx.mediaType, ctx.heroCandidateLimit, ctx.kidsMode, ctx.effectiveSelectors),
                'true_blend',
                [ctx.userId, ctx.context, ctx.tmdbApiKey, ctx.mediaType, ctx.kidsMode, ctx.effectiveSelectors, ctx.heroCandidateLimit]
            );
        }
    },
    {
        name: 'seed_network',
        slug: 'seed_network',
        additive: false,
        run: async (ctx) => {
            return await runPoolBuilder(
                buildHybridCatalog,
                ctx.seedFallback,
                'seed_network',
                [ctx.userId, ctx.context, ctx.traktToken, ctx.tmdbApiKey, ctx.mediaType, ctx.kidsMode, ctx.sharedTraktResult, ctx.effectiveSelectors, ctx.heroCandidateLimit]
            );
        }
    },
    {
        name: 'hidden_gems',
        slug: 'hidden_gems',
        additive: false,
        run: async (ctx) => {
            if (isNewHiddenGemsActive()) {
                return await buildHiddenGemsOnNewProvider(ctx);
            }
            return await runPoolBuilder(
                catalogStrategies.buildHiddenGemsCatalog,
                () => fetchHiddenGemsFallbackIds(ctx.tmdbApiKey, ctx.mediaType, ctx.heroCandidateLimit, ctx.kidsMode, ctx.effectiveSelectors),
                'hidden_gems',
                [ctx.userId, ctx.context, ctx.tmdbApiKey, ctx.mediaType, ctx.kidsMode, ctx.effectiveSelectors, ctx.heroCandidateLimit]
            );
        }
    },
    {
        name: 'trakt_filtered',
        slug: 'trakt_filtered',
        additive: false,
        run: async (ctx) => {
            const builder = typeof buildTraktFilteredCatalogWithMeta === 'function'
                ? buildTraktFilteredCatalogWithMeta
                : buildTraktFilteredCatalog;
            return await runPoolBuilder(
                builder,
                ctx.communityFallbackWithMeta,
                'trakt_filtered',
                [ctx.userId, ctx.context, ctx.traktToken, ctx.tmdbApiKey, ctx.mediaType, ctx.kidsMode, ctx.sharedTraktResult, ctx.effectiveSelectors, ctx.heroCandidateLimit]
            );
        }
    },
    {
        name: 'graph_rows',
        slug: 'graph_rows',
        additive: true,
        // =========================================================================
        // GANCI DEL GRAFO (Ticket 08: servizio Python persistente via HTTP)
        // =========================================================================
        run: async (ctx, { assigned, rawTraktResult, sharedState }) => {
            const med = ctx.mediaType === 'movie' ? 'movie' : 'series';
            const suffisso = ctx.mediaType === 'movie' ? 'movies' : 'series';
            const catMondi = `yaca_mondi_${suffisso}`;
            const catPasso = `yaca_passo_fuori_${suffisso}`;

            try {
                const { semiDi } = require('../library');
                const { seeds } = await semiDi({
                    userId: ctx.userId,
                    context: ctx.context,
                    mediaType: ctx.mediaType,
                    user: ctx.userConfig
                });
                const tipoSeed = med === 'movie' ? 'movie' : 'tv';
                const animePolicy = ctx.animePolicy
                    || ctx.effectiveSelectors?.anime
                    || ctx.userConfig?.activeProfileSettings?.typeSelectors?.anime
                    || ctx.userConfig?.typeSelectors?.anime;

                const isAnimeSeed = (id) => isAnimeContent({ tmdbId: Number(id), tipo: tipoSeed });

                const rawSeeds = [...seeds.entries()];
                const filteredSeeds = rawSeeds.filter(([id]) => {
                    if (animePolicy === 'exclude') return !isAnimeSeed(id);
                    if (animePolicy === 'only') return isAnimeSeed(id);
                    return true;
                });

                const semi = filteredSeeds.map(([id, w]) => {
                    const tmdbId = Number(id);
                    let tipo = 'watched';
                    if (w >= 4) tipo = 'loved';
                    else if (w >= 3) tipo = 'liked';
                    else if (w === 1) tipo = 'library';
                    return {
                        tmdbId,
                        medium: med,
                        tipo,
                        peso: w
                    };
                });
                const visti = new Set(semi.map((s) => s.tmdbId));
                let traktCount = 0;
                if (rawTraktResult?.traktAvailable) {
                    for (const voce of (rawTraktResult.ids || [])) {
                        const id = Number(typeof voce === 'object' && voce !== null ? voce.id : voce);
                        if (!Number.isFinite(id) || visti.has(id)) continue;
                        if (animePolicy === 'exclude' && isAnimeSeed(id)) continue;
                        if (animePolicy === 'only' && !isAnimeSeed(id)) continue;
                        visti.add(id);
                        semi.push({ tmdbId: id, medium: med, tipo: 'liked', peso: 3 });
                        traktCount++;
                    }
                }

                if (semi.length === 0) {
                    assigned[catMondi] = [];
                    assigned[catPasso] = [];
                    console.log(`[Mondi] ${ctx.mediaType}: seed da archivio 0, da Trakt 0 · mondi 0 · passo fuori 0`);
                    return;
                }

                const opzioni = ctx.sliders
                    || ctx.slider
                    || ctx.userConfig?.activeProfileSettings?.sliders
                    || ctx.userConfig?.activeProfileSettings?.slider
                    || ctx.userConfig?.activeProfileSettings?.graphOptions
                    || ctx.userConfig?.graphOptions
                    || undefined;
                const cap = ctx.cap || 60;

                const resGraph = await graphClient.raccomanda({
                    semi,
                    medium: med,
                    opzioni,
                    cap
                });

                const liste = resGraph?.liste || [];
                const listaMondi = liste.find((l) => l.ruolo === 'il_tuo_mondo');
                const listaPasso = liste.find((l) => l.ruolo === 'un_passo_fuori');

                assigned[catMondi] = (listaMondi?.titoli || []).map((t) => ensurePoolItem({
                    id: `tmdb:${t.tmdbId}`,
                    tmdbId: Number(t.tmdbId),
                    type: t.medium === 'movie' ? 'movie' : 'series',
                    media_type: t.medium === 'movie' ? 'movie' : 'tv',
                    punteggio: t.punteggio
                }, ctx.mediaType));

                assigned[catPasso] = (listaPasso?.titoli || []).map((t) => ensurePoolItem({
                    id: `tmdb:${t.tmdbId}`,
                    tmdbId: Number(t.tmdbId),
                    type: t.medium === 'movie' ? 'movie' : 'series',
                    media_type: t.medium === 'movie' ? 'movie' : 'tv',
                    punteggio: t.punteggio
                }, ctx.mediaType));

                const nMondi = (assigned[catMondi] || []).length;
                const nPasso = (assigned[catPasso] || []).length;
                console.log(`[Mondi] ${ctx.mediaType}: seed da archivio ${filteredSeeds.length}, da Trakt ${traktCount}` +
                    ` · mondi ${nMondi} · passo fuori ${nPasso}`);
                if (semi.length > 0 && nMondi === 0 && nPasso === 0) {
                    console.warn(`[Mondi] ATTENZIONE: ${semi.length} seed e ZERO titoli in entrambe le righe ` +
                        `(${ctx.mediaType}). O il grafo non conosce quei titoli, o l'id non si risolve a valle.`);
                }
            } catch (e) {
                assigned[catMondi] = [];
                assigned[catPasso] = [];
                if (sharedState) sharedState.graphCallFailed = true;
                console.warn(`[Mondi] motore non raggiungibile: ${e?.message || e}`);
            }
        }
    }
];

/**
 * Costruisce una sola volta tutti i pool e poi applica l'assegnazione disgiunta.
 */
async function buildSharedHeroCatalogs({ userId, context, mediaType, traktToken, tmdbApiKey, kidsMode, userConfig, typeSelectors, slider, sliders }) {
    const { profile, user } = await fetchProfileContext(userId, context).catch(() => ({}));
    const effectiveSelectors = (context && typeof context === 'object' && context.selettoriEffettivi)
        ? context.selettoriEffettivi
        : (typeSelectors || (context && typeof context === 'object' && context.typeSelectors) || {});
    const animePolicy = effectiveSelectors?.anime || 'neutral';
    const isTightContext = (animePolicy === 'only' || effectiveSelectors?.anime === 'only');
    const heroCandidateLimit = isTightContext ? 250 : 160;

    const resolvedSliders = slider
        || sliders
        || userConfig?.activeProfileSettings?.sliders
        || userConfig?.activeProfileSettings?.slider
        || userConfig?.context?.sliders
        || userConfig?.context?.slider
        || userConfig?.profiles?.find(p => p.id === (context || userConfig.activeProfileId))?.settings?.sliders
        || userConfig?.profiles?.find(p => p.id === (context || userConfig.activeProfileId))?.settings?.slider
        || user?.profiles?.find(p => p.id === context)?.settings?.sliders
        || user?.profiles?.find(p => p.id === context)?.settings?.slider
        || profile?.settings?.sliders
        || profile?.settings?.slider
        || undefined;

    const seedFallback = async () => {
        const fetcher = typeof fetchTopRatedPeriodFallbackIds === 'function'
            ? fetchTopRatedPeriodFallbackIds
            : fetchPopularFallbackIds;
        return fetcher(tmdbApiKey, mediaType, heroCandidateLimit, kidsMode, effectiveSelectors);
    };
    const communityFallback = async () => {
        const fetcher = typeof fetchUndiscoveredFallbackIds === 'function'
            ? fetchUndiscoveredFallbackIds
            : fetchPopularFallbackIds;
        return fetcher(tmdbApiKey, mediaType, heroCandidateLimit, kidsMode, effectiveSelectors);
    };
    const communityFallbackWithMeta = async () => {
        const fallbackIds = await communityFallback();
        return {
            ids: fallbackIds,
            traktAvailable: false,
            traktSourcedCount: 0,
            fallbackTopUpCount: fallbackIds.length,
            isDegradedFallback: true,
            fallbackUsed: true
        };
    };

    const hasDetailedTraktFetch = typeof fetchTraktRecommendationsRawDetailed === 'function';
    let sharedTraktResult = hasDetailedTraktFetch
        ? { items: [], available: false, fallbackUsed: true, reason: 'credentials' }
        : null;
    if (traktToken && hasDetailedTraktFetch) {
        let traktUser = {
            userId,
            apiKeys: userConfig?.apiKeys || userConfig?.config?.apiKeys || {}
        };
        if (!traktUser.apiKeys?.traktRefreshToken && typeof fetchProfileContext === 'function') {
            const profileContext = await fetchProfileContext(userId, context).catch(() => ({}));
            if (profileContext?.user) traktUser = profileContext.user;
        }
        sharedTraktResult = await fetchTraktRecommendationsRawDetailed(
            traktToken,
            mediaType === 'movie' ? 'movies' : 'shows',
            100,
            traktUser
        ).catch(error => {
            console.error('[HeroPool] Trakt fetch failed:', error?.message || error);
            return { items: [], available: false, fallbackUsed: true, reason: 'error' };
        });
    }

    const ctx = {
        userId,
        context,
        mediaType,
        traktToken,
        tmdbApiKey,
        kidsMode,
        userConfig,
        effectiveSelectors,
        animePolicy,
        heroCandidateLimit,
        seedFallback,
        communityFallbackWithMeta,
        sharedTraktResult,
        sliders: resolvedSliders,
        slider: resolvedSliders,
        tasteProfile: profile || null,
        profile: profile || null
    };

    // Eseguiamo le strategie esclusive in parallelo
    const exclusiveStrategies = HERO_STRATEGIES.filter(s => !s.additive);
    const results = await Promise.all(exclusiveStrategies.map(s => s.run(ctx)));

    const pools = {};
    let rawTraktResult = {
        ids: [],
        traktAvailable: false,
        traktSourcedCount: 0,
        fallbackTopUpCount: 0,
        isDegradedFallback: true,
        fallbackUsed: true
    };

    exclusiveStrategies.forEach((strat, idx) => {
        const res = results[idx];
        const catId = getHeroCatalogId(strat.slug, mediaType);
        if (strat.slug === 'trakt_filtered') {
            const traktSourcedCount = res?.traktSourcedCount ?? (Array.isArray(res) ? res.length : 0);
            const fallbackTopUpCount = res?.fallbackTopUpCount ?? 0;
            const isDegradedFallback = res?.isDegradedFallback ?? (traktSourcedCount === 0);
            const traktAvailable = res?.traktAvailable === true;
            const fallbackUsed = res?.fallbackUsed === true || isDegradedFallback;

            rawTraktResult = {
                ids: normalizePoolResult(res),
                traktAvailable,
                traktSourcedCount,
                fallbackTopUpCount,
                isDegradedFallback,
                fallbackUsed
            };
            pools[catId] = rawTraktResult.ids;
        } else {
            pools[catId] = normalizePoolResult(res);
        }
    });

    // Assegnazione esclusiva
    const assigned = assignHeroPools(pools, mediaType);

    // Eseguiamo le strategie additive (il grafo) DOPO l'assegnazione disgiunta
    const sharedState = { graphCallFailed: false };
    const additiveStrategies = HERO_STRATEGIES.filter(s => s.additive);
    for (const strat of additiveStrategies) {
        await strat.run(ctx, { assigned, rawTraktResult, sharedState });
    }

    // Degrado Trakt
    const traktCatalogId = getHeroCatalogId('trakt_filtered', mediaType);
    let hiddenForInsufficientFallback = false;
    console.log(`[HeroPool] Trakt status per ${traktCatalogId}: traktAvailable=${rawTraktResult.traktAvailable}, traktSourcedCount=${rawTraktResult.traktSourcedCount}, fallbackTopUpCount=${rawTraktResult.fallbackTopUpCount}, isDegradedFallback=${rawTraktResult.isDegradedFallback}, fallbackUsed=${rawTraktResult.fallbackUsed}`);
    if (rawTraktResult.isDegradedFallback) {
        console.warn(`[HeroPool] Degrado Trakt confermato per pool ${traktCatalogId}: traktAvailable=${rawTraktResult.traktAvailable}, traktSourcedCount=${rawTraktResult.traktSourcedCount}, fallbackTopUpCount=${rawTraktResult.fallbackTopUpCount}`);
    }
    if (rawTraktResult.fallbackUsed && assigned[traktCatalogId].length < HERO_MIN_FALLBACK_ITEMS) {
        assigned[traktCatalogId] = [];
        hiddenForInsufficientFallback = true;
    }

    return {
        schemaVersion: HERO_CACHE_SCHEMA_VERSION,
        mediaType,
        catalogs: assigned,
        graphCallFailed: !!sharedState.graphCallFailed,
        trakt: {
            available: rawTraktResult.traktAvailable,
            traktAvailable: rawTraktResult.traktAvailable,
            traktSourcedCount: rawTraktResult.traktSourcedCount,
            fallbackTopUpCount: rawTraktResult.fallbackTopUpCount,
            isDegradedFallback: rawTraktResult.isDegradedFallback,
            fallbackUsed: rawTraktResult.fallbackUsed,
            hiddenForInsufficientFallback
        }
    };
}

function toHeroDesc(args, keyOrDesc) {
    if (keyOrDesc && typeof keyOrDesc === 'object' && keyOrDesc.nome) {
        return keyOrDesc;
    }
    const sl = args?.sliders || args?.slider || args?.userConfig?.activeProfileSettings?.sliders || args?.userConfig?.activeProfileSettings?.slider;
    return {
        nome: 'heroes',
        versione: HERO_CACHE_KEY_VERSION,
        dipendenze: {
            varia: {
                utente: args?.userId,
                profilo: args?.context,
                media: args?.mediaType,
                kids: args?.kidsMode,
                selettori: args?.typeSelectors,
                ...(isNewHiddenGemsActive() ? { nuova_catena_hidden_gems: 'true' } : {}),
                ...(sl ? { slider: sl } : {})
            },
            invalida: {
                artefatto: args?.graphVersions?.artefatto,
                ricetta: args?.graphVersions?.ricetta
            }
        },
        ttl: 7 * 24 * 60 * 60 * 1000
    };
}

async function buildAndCacheSharedHeroCatalogs(args, keyOrDesc) {
    const heroDesc = toHeroDesc(args, keyOrDesc);
    const { chiave } = cache.deriva(heroDesc);
    if (activeHeroGroupBuilds.has(chiave)) return activeHeroGroupBuilds.get(chiave);

    const promise = (async () => {
        const group = await buildSharedHeroCatalogs(args);
        // E5: un guasto transitorio (timeout, 503, connessione rifiutata) non deve avvelenare
        // la cache di 7 giorni. Memorizziamo con TTL breve di 60 s.
        const descToWrite = {
            ...heroDesc,
            ttl: group && group.graphCallFailed ? (60 * 1000) : (7 * 24 * 60 * 60 * 1000)
        };
        await cache.scrivi(descToWrite, group);
        return group;
    })();
    activeHeroGroupBuilds.set(chiave, promise);

    try {
        return await promise;
    } finally {
        if (activeHeroGroupBuilds.get(chiave) === promise) activeHeroGroupBuilds.delete(chiave);
    }
}

async function getSharedHeroCatalogs(args, keyOrDesc) {
    const heroDesc = toHeroDesc(args, keyOrDesc);
    const { value, status } = await cache.leggi(heroDesc);
    if (isSharedHeroCacheEntry(value, args.mediaType)) {
        if (status === 'stale') {
            buildAndCacheSharedHeroCatalogs(args, heroDesc)
                .catch(error => console.error('[Hero-SWR] Error:', error?.message || error));
        }
        return value;
    }
    return buildAndCacheSharedHeroCatalogs(args, heroDesc);
}

/**
 * LA PORTA UNICA DEL MODULO POOL.
 * Riceve il contesto e restituisce l'assegnato {[catalogId]: items}.
 * Firma:
 * getHeroPool({ userId, context, mediaType, kidsMode, typeSelectors, traktToken, tmdbApiKey, userConfig, slider, sliders })
 * -> Promise<Object> dove result[catalogId] = Array<Item>
 */
async function getHeroPool(params) {
    const {
        userId,
        context = 'global',
        mediaType = 'movie',
        kidsMode = false,
        typeSelectors = null,
        traktToken = null,
        tmdbApiKey = null,
        userConfig = null,
        slider = null,
        sliders = null
    } = params;

    const resolvedSliders = slider
        || sliders
        || userConfig?.activeProfileSettings?.sliders
        || userConfig?.activeProfileSettings?.slider
        || userConfig?.context?.sliders
        || userConfig?.context?.slider
        || userConfig?.profiles?.find(p => p.id === (context || userConfig?.activeProfileId))?.settings?.sliders
        || userConfig?.profiles?.find(p => p.id === (context || userConfig?.activeProfileId))?.settings?.slider
        || undefined;

    const graphVersions = await graphClient.getGraphHealthVersions();
    const heroDesc = toHeroDesc({
        userId,
        context,
        mediaType,
        kidsMode,
        typeSelectors,
        graphVersions,
        sliders: resolvedSliders,
        slider: resolvedSliders
    });
    const sharedGroup = await getSharedHeroCatalogs({
        userId,
        context,
        mediaType,
        traktToken,
        tmdbApiKey,
        kidsMode,
        userConfig,
        typeSelectors,
        graphVersions,
        sliders: resolvedSliders,
        slider: resolvedSliders
    }, heroDesc);

    const assigned = sharedGroup?.catalogs || {};
    const catMondi = `yaca_mondi_${mediaType === 'movie' ? 'movies' : 'series'}`;
    const catPasso = `yaca_passo_fuori_${mediaType === 'movie' ? 'movies' : 'series'}`;
    const nMondi = (assigned[catMondi] || []).length;
    const nPasso = (assigned[catPasso] || []).length;
    console.log(`[Mondi] ${mediaType}: pool mondi ${nMondi} · passo fuori ${nPasso}`);

    return {
        ...assigned,
        catalogs: assigned,
        trakt: sharedGroup?.trakt,
        schemaVersion: sharedGroup?.schemaVersion,
        mediaType: sharedGroup?.mediaType
    };
}

module.exports = {
    getHeroPool,
    buildSharedHeroCatalogs,
    getSharedHeroCatalogs,
    buildSharedHeroCacheKey,
    assignHeroPools,
    ensurePoolItem,
    getRecommendationId,
    getHeroCatalogInfo,
    getHeroCatalogId,
    isSharedHeroCacheEntry,
    HERO_CACHE_KEY_VERSION,
    HERO_CACHE_SCHEMA_VERSION,
    HERO_PRIORITY,
    SLUG_ADDITIVI,
    HERO_STRATEGIES,
    graphClient,
    isNewHiddenGemsActive,
    setFlagNewHiddenGems,
    buildHiddenGemsOnNewProvider
};
