const { ITEMS_PER_PAGE } = require('../config');
const TasteProfile = require('../models/TasteProfile');
const ProfileBuilder = require('../profile/ProfileBuilder');
const tmdb = require('../clients/tmdb');
const { prioritizeLocalizedImages } = require('../clients/tmdb');
const { hybridRecommendationsCache } = require('../cache/cacheInstances');
const { normalizeContentId } = require('../utils/contentId');
const { rateLimitedMap } = require('../utils/rateLimiter');
const { getPresets } = require('../data/presets');
const { getDuckDbMetaDetails } = require('../catalog/providers/DuckDbProvider');
const RecommendationImpression = require('../models/RecommendationImpression');
const mongoose = require('mongoose');

const { applyKidsMode, isItemInappropriateForKids } = require('../utils/kidsModeFilters');
const { resolveAnimePolicy, getEffectiveTypeSelectors, isItemAnime } = require('./hybrid/animePolicy');
const { isProfileSyncDue, isStremioSyncDue } = require('./profileStaleness');

function getActiveTypeSelectors(userConfig, context) {
    if (userConfig?.activeProfileSettings?.typeSelectors) {
        return userConfig.activeProfileSettings.typeSelectors;
    }
    if (userConfig?.typeSelectors) {
        return userConfig.typeSelectors;
    }
    const profiles = userConfig?.profiles ?? userConfig?.config?.profiles ?? [];
    const activeProfile = profiles.find(profile => profile.id === context);
    return activeProfile?.settings?.typeSelectors || activeProfile?.typeSelectors || null;
}

// Import from the new hybrid layer
const {
    fetchProfileContext,
    fetchRecentHistory,
    fetchRecentRatings,
    fetchTraktRecommendationsRaw,
    fetchTraktRecommendationsRawDetailed,
    fetchTmdbSimilarCounts,
    fetchPopularFallbackIds,
    fetchTopRatedPeriodFallbackIds,
    fetchUndiscoveredFallbackIds,
    fetchHiddenGemsFallbackIds
} = require('./hybrid/dataFetchers');
const { calculateHybridScore, computeTopGenres, computeTopKeywords } = require('./hybrid/scoringEngine');
const {
    buildDirectPresetCatalog,
    buildTopGenresMixCatalog,
    buildHybridCatalog,
    buildHiddenGemsCatalog,
    buildTraktFilteredCatalog,
    buildTraktFilteredCatalogWithMeta
} = require('./hybrid/catalogStrategies');

function getActiveKidsMode(userConfig, context) {
    if (typeof userConfig?.activeProfileSettings?.kidsMode === 'boolean') {
        return userConfig.activeProfileSettings.kidsMode;
    }
    if (typeof userConfig?.kidsMode === 'boolean') {
        return userConfig.kidsMode;
    }
    const profiles = userConfig?.profiles ?? userConfig?.config?.profiles ?? [];
    const activeProfile = profiles.find(profile => profile.id === context);
    return (activeProfile?.settings?.kidsMode ?? activeProfile?.kidsMode) === true;
}

const HERO_PRIORITY = Object.freeze(['true_blend', 'seed_network', 'hidden_gems', 'trakt_filtered']);
const HERO_CATALOG_IDS = new Map([
    ...HERO_PRIORITY.flatMap(slug => ['movie', 'series'].map(mediaType => [
        `yaca_${slug}_${mediaType === 'movie' ? 'movies' : 'series'}`,
        { slug, mediaType }
    ]))
]);
// Il nome della chiave `heroes_v1` fa parte del contratto del ticket 21.
// Lo schema interno versiona l'allocazione: 4 invalida i blocchi schema 3
// prodotti prima della garanzia pairwise verificata sul dataset completo.
// Bump v1 -> v2 (ticket 17): i pool dei hero cambiano composizione (quota anime
// dal ~10% all'80%+), ma senza il bump la cache servirebbe i risultati vecchi per
// tutto il TTL delle raccomandazioni (7 giorni).
const HERO_CACHE_KEY_VERSION = 'v2';
const HERO_CACHE_SCHEMA_VERSION = 6;
const HERO_MIN_FALLBACK_ITEMS = 10;
const HERO_MAX_ITEMS_PER_CATALOG = 100;
const activeHeroGroupBuilds = new Map();

function getHeroCatalogInfo(catalogId) {
    return HERO_CATALOG_IDS.get(catalogId) || null;
}

function getHeroCatalogId(slug, mediaType) {
    return `yaca_${slug}_${mediaType === 'movie' ? 'movies' : 'series'}`;
}

// La chiave NON contiene `configVersion`, ed è una decisione misurata, non un'omissione.
// `configVersion` è un nanoid rigenerato a ogni salvataggio della configurazione: rimetterlo qui
// significa orfanare TUTTA la cache hero a ogni salvataggio che non c'entra niente. In produzione
// il 02/10/2026: 18 tasti su 23 erano orfani, la stessa coppia utente+profilo+tipo ricostruita 9
// volte — ognuna da 21-42 secondi.
// A proteggere la cache bastano: il `context` (l'id del profilo attivo, che cambia quando cambia
// il profilo), `kidsMode`, i `typeSelectors` e `HERO_CACHE_KEY_VERSION` per i hero — che è
// l'interruttore giusto da alzare a mano quando cambia il modo in cui si costruiscono.
function buildRecommendationCacheKey({ userId, context, catalogId, kidsMode, typeSelectors }) {
    const animeSuffix = typeSelectors?.anime ? `_a_${typeSelectors.anime}` : '';
    return `${userId}_${context}_${catalogId}${kidsMode ? '_kids' : ''}${animeSuffix}`;
}

function buildSharedHeroCacheKey({ userId, context, mediaType, kidsMode, typeSelectors }) {
    const animeSuffix = typeSelectors?.anime ? `_a_${typeSelectors.anime}` : '';
    return `${userId}_${context}_heroes_${HERO_CACHE_KEY_VERSION}_${mediaType}${kidsMode ? '_kids' : ''}${animeSuffix}`;
}

function getRecommendationId(item) {
    const rawId = item && typeof item === 'object' ? item.id : item;
    const id = normalizeContentId(rawId ?? '');
    if (!id || ['undefined', 'null', 'nan'].includes(id.toLowerCase())) return '';
    return id;
}

/**
 * Assegna in modo esclusivo i candidati dei quattro hero. L'ordine dei blocchi
 * è il requisito di priorità, non l'ordine delle richieste HTTP.
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
            catalogIds.push(item);
            if (catalogIds.length >= maxItemsPerCatalog) break;
        }
        assigned[catalogId] = catalogIds;
    }

    return assigned;
}

function isSharedHeroCacheEntry(entry, mediaType) {
    if (!entry || entry.schemaVersion !== HERO_CACHE_SCHEMA_VERSION || entry.mediaType !== mediaType || !entry.catalogs) return false;
    if (!['movie', 'series'].includes(mediaType)) return false;

    // Il numero di schema garantisce la forma del payload, non la sua correttezza.
    // Un blocco allocato da una versione precedente può infatti contenere lo
    // stesso ID in due hero. Non deve mai essere servito né invalidare le pagine
    // già servite con un nuovo snapshot: lo scartiamo per ricostruire un solo
    // gruppo coerente e verificabile.
    const claimedIds = new Set();
    for (const slug of HERO_PRIORITY) {
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

/** Costruisce una sola volta tutti i pool e poi applica l'assegnazione disgiunta. */
async function buildSharedHeroCatalogs({ userId, context, mediaType, traktToken, tmdbApiKey, kidsMode, userConfig, typeSelectors }) {
    // Ticket 21: Determinazione del "contesto stretto".
    // Nei contesti ampi (generali), il bacino complessivo di titoli TMDB/DuckDB conta decine di migliaia di voci,
    // rendendo sufficiente un pool a monte di 160 candidati per catalogo hero: 4 x 50 = 200 titoli disgiunti
    // vengono raggiunti senza problemi di sovrapposizione e senza sprecare latenza TMDB/DuckDB.
    // Nei contesti stretti (es. profilo Otaku o quando animePolicy === 'only'), l'intero universo di anime TV
    // che superano il pavimento di qualità è ridotto a sole poche centinaia di titoli (~150-250 serie in DuckDB).
    // Con un pool a monte di 160, true_blend (primo nella priorità) consuma 50 item, impoverendo a cascata
    // seed_network, hidden_gems e trakt_filtered (che precipitavano a 17-19 item).
    // Allargando il pool di candidati a monte a 250 ESCLUSIVAMENTE nei contesti stretti, ciascun hero può servire ~50 titoli
    // preservando al 100% l'invariante di disgiunzione (0 sovrapposizioni tra i 4 cataloghi).
    const { profile, user } = await fetchProfileContext(userId, context).catch(() => ({}));
    const effectiveSelectors = typeSelectors
        || getActiveTypeSelectors(userConfig, context)
        || getActiveTypeSelectors(user, context);
    const animePolicy = resolveAnimePolicy(profile, effectiveSelectors, { isKidsMode: kidsMode });
    const isTightContext = (animePolicy === 'only' || effectiveSelectors?.anime === 'only');
    const heroCandidateLimit = isTightContext ? 250 : 160;

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

    const [trueBlendResult, seedResult, hiddenResult, traktResult] = await Promise.all([
        runPoolBuilder(
            buildTopGenresMixCatalog,
            () => fetchPopularFallbackIds(tmdbApiKey, mediaType, heroCandidateLimit, kidsMode, effectiveSelectors),
            'true_blend',
            [userId, context, tmdbApiKey, mediaType, kidsMode, effectiveSelectors, heroCandidateLimit]
        ),
        runPoolBuilder(
            buildHybridCatalog,
            seedFallback,
            'seed_network',
            [userId, context, traktToken, tmdbApiKey, mediaType, kidsMode, sharedTraktResult, effectiveSelectors, heroCandidateLimit]
        ),
        runPoolBuilder(
            buildHiddenGemsCatalog,
            () => fetchHiddenGemsFallbackIds(tmdbApiKey, mediaType, heroCandidateLimit, kidsMode, effectiveSelectors),
            'hidden_gems',
            [userId, context, tmdbApiKey, mediaType, kidsMode, effectiveSelectors, heroCandidateLimit]
        ),
        typeof buildTraktFilteredCatalogWithMeta === 'function'
            ? runPoolBuilder(
                buildTraktFilteredCatalogWithMeta,
                communityFallbackWithMeta,
                'trakt_filtered',
                [userId, context, traktToken, tmdbApiKey, mediaType, kidsMode, sharedTraktResult, effectiveSelectors, heroCandidateLimit]
            )
            : runPoolBuilder(
                buildTraktFilteredCatalog,
                communityFallbackWithMeta,
                'trakt_filtered',
                [userId, context, traktToken, tmdbApiKey, mediaType, kidsMode, sharedTraktResult, effectiveSelectors, heroCandidateLimit]
            )
    ]);

    const traktCatalogId = getHeroCatalogId('trakt_filtered', mediaType);
    const traktSourcedCount = traktResult?.traktSourcedCount ?? (Array.isArray(traktResult) ? traktResult.length : 0);
    const fallbackTopUpCount = traktResult?.fallbackTopUpCount ?? 0;
    const isDegradedFallback = traktResult?.isDegradedFallback ?? (traktSourcedCount === 0);
    const traktAvailable = traktResult?.traktAvailable === true;
    const fallbackUsed = traktResult?.fallbackUsed === true || isDegradedFallback;

    const rawTraktResult = {
        ids: normalizePoolResult(traktResult),
        traktAvailable,
        traktSourcedCount,
        fallbackTopUpCount,
        isDegradedFallback,
        fallbackUsed
    };
    const pools = {
        [getHeroCatalogId('true_blend', mediaType)]: normalizePoolResult(trueBlendResult),
        [getHeroCatalogId('seed_network', mediaType)]: normalizePoolResult(seedResult),
        [getHeroCatalogId('hidden_gems', mediaType)]: normalizePoolResult(hiddenResult),
        [traktCatalogId]: rawTraktResult.ids
    };
    const assigned = assignHeroPools(pools, mediaType);
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

async function buildAndCacheSharedHeroCatalogs(args, cacheKey) {
    if (activeHeroGroupBuilds.has(cacheKey)) return activeHeroGroupBuilds.get(cacheKey);

    const promise = (async () => {
        const group = await buildSharedHeroCatalogs(args);
        await hybridRecommendationsCache.set(cacheKey, group);
        return group;
    })();
    activeHeroGroupBuilds.set(cacheKey, promise);

    try {
        return await promise;
    } finally {
        if (activeHeroGroupBuilds.get(cacheKey) === promise) activeHeroGroupBuilds.delete(cacheKey);
    }
}

async function getSharedHeroCatalogs(args, cacheKey) {
    const { value, status } = await hybridRecommendationsCache.getWithStatus(cacheKey);
    if (isSharedHeroCacheEntry(value, args.mediaType)) {
        if (status === 'stale') {
            buildAndCacheSharedHeroCatalogs(args, cacheKey)
                .catch(error => console.error('[Hero-SWR] Error:', error?.message || error));
        }
        return value;
    }
    return buildAndCacheSharedHeroCatalogs(args, cacheKey);
}

/**
 * Main endpoint: handles request for a profiled hybrid catalog.
 */
async function getHybridCatalog(catalogId, skip, traktToken, tmdbApiKey, userId, activeProfileId = 'global', userConfig = null) {
    const presetsList = getPresets();
    const matchedPreset = presetsList.find(p => p.id === catalogId);
    let mediaType = (catalogId.includes('series') || catalogId.includes('tv')) ? 'series' : 'movie';
    if (matchedPreset && matchedPreset.type) {
        mediaType = matchedPreset.type === 'series' ? 'series' : 'movie';
    }
    const context = activeProfileId || 'global';
    const profile = await TasteProfile.findOne({ owner: userId, context });
    // kidsMode è un'impostazione del profilo YACA (AddonConfig), non del TasteProfile.
    const isKidsMode = getActiveKidsMode(userConfig, context);
    const typeSelectors = getActiveTypeSelectors(userConfig, context);
    const effectiveTypeSelectors = getEffectiveTypeSelectors(profile, typeSelectors, { isKidsMode });
    const heroInfo = getHeroCatalogInfo(catalogId);
    const cacheKey = heroInfo
        ? buildSharedHeroCacheKey({ userId, context, mediaType, kidsMode: isKidsMode, typeSelectors })
        : buildRecommendationCacheKey({ userId, context, catalogId, kidsMode: isKidsMode, typeSelectors });

    console.log(`[Hybrid Debug] getHybridCatalog called with catalogId=${catalogId}, userId=${userId}, context=${context}`);
    console.log(`[Hybrid Debug] profile loaded: ${!!profile}, isKidsMode=${isKidsMode}, cacheKey=${cacheKey}`);

    if (profile) {
        if (isProfileSyncDue(profile.lastUpdated, new Date())) {
            // console.log(`[Hybrid] Sincronizzazione profilo per ${userId} (${context})...`);
            syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context, userConfig).then(async (synced) => {
                if (synced) {
                    await hybridRecommendationsCache.delete(cacheKey);
                }
            }).catch(err => console.error("Errore check stale profile:", err.message));
        }
    }

    let recommendationIds;
    if (heroInfo) {
        const sharedGroup = await getSharedHeroCatalogs({
            userId,
            context,
            mediaType,
            traktToken,
            tmdbApiKey,
            kidsMode: isKidsMode,
            userConfig,
            typeSelectors: effectiveTypeSelectors
        }, cacheKey);
        recommendationIds = sharedGroup.catalogs[catalogId] || [];
        console.log(`[HeroPool] ${catalogId}: ${recommendationIds.length} assigned IDs (group=${cacheKey})`);
    } else {
        const buildRecommendIds = async () => {
            if (matchedPreset) {
                const ids = await buildDirectPresetCatalog(catalogId, userId, context, tmdbApiKey, mediaType, isKidsMode, effectiveTypeSelectors);
                if (ids.length > 0) {
                    await hybridRecommendationsCache.set(cacheKey, { ids });
                    return ids;
                }
            }
            const ids = [];
            await hybridRecommendationsCache.set(cacheKey, { ids });
            return ids;
        };

        const { value: cachedEntry, status: cacheStatus } = await hybridRecommendationsCache.getWithStatus(cacheKey);
        console.log(`[Hybrid Debug] cache status for ${cacheKey}: ${cacheStatus}`);
        if (cacheStatus !== 'miss' && Array.isArray(cachedEntry?.ids)) {
            recommendationIds = cachedEntry.ids;
            console.log(`[Hybrid Debug] returning ${recommendationIds.length} IDs from cache`);
            if (cacheStatus === 'stale') {
                console.log(`[Hybrid-SWR] Revalidando catalogo ${catalogId} in background...`);
                buildRecommendIds().catch(e => console.error('[Hybrid-SWR] Error:', e.message));
            }
        }

        if (!recommendationIds) {
            console.log(`[Hybrid Debug] building new recommend IDs for ${catalogId}`);
            recommendationIds = await buildRecommendIds();
        }

        if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
            recommendationIds = await fetchPopularFallbackIds(tmdbApiKey, mediaType, 160, isKidsMode);
            if (recommendationIds.length > 0) {
                await hybridRecommendationsCache.set(cacheKey, { ids: recommendationIds });
            }
        }
    }

    const pageIds = recommendationIds.slice(skip, skip + ITEMS_PER_PAGE);
    if (pageIds.length === 0) return [];

    let tmdbClient;
    const results = await rateLimitedMap(
        pageIds,
        async (recItem) => {
            try {
                const isObj = typeof recItem === 'object' && recItem !== null;
                const tmdbId = isObj ? recItem.id : recItem;
                const matchScore = isObj ? recItem.matchScore : null;
                const itemFallbackUsed = isObj ? recItem.fallbackUsed : undefined;
                const itemTraktAvailable = isObj ? recItem.traktAvailable : undefined;

                const normalizedId = normalizeContentId(tmdbId);
                const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
                let item = null;
                try {
                    const duckMeta = await getDuckDbMetaDetails(normalizedId, tmdbType);
                    if (duckMeta && duckMeta.rawTMDB) {
                        item = duckMeta.rawTMDB;
                    }
                } catch (_e) {}

                if (!item) {
                    item = await tmdb.getTmdbMovieDetails(tmdbApiKey, normalizedId, tmdbType, { cacheOnly: true });
                }

                if (!item) {
                    if (!tmdbClient) tmdbClient = tmdb.createTmdbClient(tmdbApiKey);
                    const endpoint = mediaType === 'movie' ? `/movie/${normalizedId}` : `/tv/${normalizedId}`;
                    const res = await tmdbClient.get(endpoint, {
                        params: {
                            append_to_response: 'images,keywords',
                            include_image_language: 'it,en,null'
                        }
                    });
                    item = res.data;
                }

                if (!item) return null;
                if (isKidsMode && isItemInappropriateForKids(item)) return null;

                let logoUrl = null;
                if (item.images && item.images.logos && item.images.logos.length > 0) {
                    const bestLogoArray = prioritizeLocalizedImages(item.images.logos);
                    const bestLogoObj = bestLogoArray.length > 0 ? bestLogoArray[0] : null;
                    if (bestLogoObj && bestLogoObj.file_path) {
                        logoUrl = `https://image.tmdb.org/t/p/w500${bestLogoObj.file_path}`;
                    }
                }

                let releaseYear = '';
                try {
                    const rawDate = item.release_date || item.first_air_date;
                    if (rawDate instanceof Date) {
                        releaseYear = !isNaN(rawDate.getTime()) ? rawDate.toISOString().substring(0, 4) : '';
                    } else if (typeof rawDate === 'string') {
                        releaseYear = rawDate.substring(0, 4);
                    } else if (rawDate !== null && rawDate !== undefined) {
                        releaseYear = String(rawDate).substring(0, 4);
                    }
                } catch (_e) {
                    releaseYear = '';
                }

                let imdbRating;
                if (item.vote_average !== null && item.vote_average !== undefined) {
                    const num = Number(item.vote_average);
                    if (!isNaN(num)) imdbRating = num.toFixed(1);
                }

                const genre_ids = Array.isArray(item.genre_ids)
                    ? item.genre_ids
                    : (Array.isArray(item.genres) ? item.genres.map(g => g.id).filter(id => id !== null && id !== undefined) : []);
                const keywords = Array.isArray(item.keywords)
                    ? item.keywords
                    : (item.keywords?.results || item.keywords?.keywords || []);

                return {
                    id: `tmdb:${normalizedId}`,
                    type: mediaType === 'movie' ? 'movie' : 'series',
                    name: item.title || item.name || 'Unknown',
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                    posterShape: 'poster',
                    background: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
                    logo: logoUrl,
                    description: item.overview || '',
                    releaseInfo: releaseYear,
                    imdbRating,
                    genre_ids,
                    // Il boundary catalogo classifica `_isAnime`: conservare le
                    // prove evita che il ramo hero classifichi come non-anime un
                    // payload Animazione + keyword "anime*" (es. animesque).
                    original_language: item.original_language || item.originalLanguage || null,
                    keywords,
                    _yacaMatch: matchScore,
                    ...(itemFallbackUsed !== undefined ? { fallbackUsed: itemFallbackUsed } : {}),
                    ...(itemTraktAvailable !== undefined ? { traktAvailable: itemTraktAvailable } : {})
                };
            } catch (err) {
                console.error(`[Hybrid] Errore risoluzione item ${recItem?.id || recItem}:`, err?.message || err);
                return null;
            }
        },
        { batchSize: 3, delayMs: 150 }
    );

    // Warm-up subsequent pages in the background (limit to next page slice to avoid N+1 hammering)
    const nextBatchIds = recommendationIds.slice(skip + ITEMS_PER_PAGE, skip + (ITEMS_PER_PAGE * 2));
    if (nextBatchIds.length > 0) {
        global.setImmediate(() => {
            rateLimitedMap(
                nextBatchIds,
                async (recItem) => {
                    try {
                        const isObj = typeof recItem === 'object' && recItem !== null;
                        const tmdbId = isObj ? recItem.id : recItem;
                        const normalizedId = normalizeContentId(tmdbId);
                        const tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
                        const duckMeta = await getDuckDbMetaDetails(normalizedId, tmdbType);
                        if (!duckMeta || !duckMeta.rawTMDB) {
                            await tmdb.getTmdbMovieDetails(tmdbApiKey, normalizedId, tmdbType);
                        }
                    } catch (_e) { }
                },
                { batchSize: 2, delayMs: 150 }
            ).catch(err => console.error("[Background-Warmup] Error:", err.message));
        });
    }

    let cleanResults = results.filter(Boolean);
    if (isKidsMode) {
        cleanResults = applyKidsMode(cleanResults);
    }
    if (effectiveTypeSelectors?.anime === 'only') {
        cleanResults = cleanResults.filter(isItemAnime);
    } else if (effectiveTypeSelectors?.anime === 'exclude') {
        cleanResults = cleanResults.filter(item => !isItemAnime(item));
    }
    if (skip === 0 && cleanResults.length > 0) {
        const currentDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const RecommendationImpression = require('../models/RecommendationImpression');
        
        const ops = cleanResults.map(item => {
            const normalizedId = item.id.replace('tmdb:', '');
            return {
                updateOne: {
                    filter: {
                        owner: userId,
                        profileId: context,
                        catalogId: catalogId,
                        tmdbId: normalizedId
                    },
                    update: {
                        $addToSet: { seenDates: currentDateStr }
                    },
                    upsert: true
                }
            };
        });

        if (process.env.NODE_ENV !== 'test' && mongoose.connection?.readyState === 1) {
            global.setImmediate(() => {
                RecommendationImpression.bulkWrite(ops).catch(err => {
                    console.error("[Impression-Tracking] Error during bulkWrite:", err.message);
                });
            });
        }
    }

    return cleanResults;
}

/**
 * La parte Stremio (likes/loved) ha una cadenza PROPRIA, scritta sulla configurazione a
 * ogni sync (`config.lastStremioSync` + `config.nextSyncInterval`, 8 ore ± jitter).
 * Prima veniva governata dalla staleness del profilo, che è mossa anche dal sync Trakt:
 * il campo si scriveva e nessuno lo leggeva. Qui la decisione è isolata e si legge il
 * campo. Intervallo assente o non sensato → default di 8 ore.
 *
 * @param {object|null} userConfig configurazione risolta che porta il bookkeeping del sync
 * @returns {boolean} true se il sync Stremio è dovuto adesso
 */
function isStremioSyncDueForUser(userConfig) {
    const config = userConfig?.config || userConfig || {};
    return isStremioSyncDue(config.lastStremioSync, new Date(), config.nextSyncInterval);
}

/**
 * Incremental user profile synchronization from Trakt history.
 */
async function syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context = 'global', userConfig = null) {
    if (!userId || !traktToken || !tmdbApiKey) return false;

    try {
        // La parte Stremio non è più legata alla staleness del profilo: la chiama la sua
        // stessa cadenza. Dopo un sync, la richiesta successiva non la riaccende.
        const stremioKey = userConfig?.apiKeys?.stremio || userConfig?.stremioKey;
        let stremioKeyToUse = stremioKey;
        if (!stremioKeyToUse) {
            try {
                const UserAccount = require('../db/models/UserAccount');
                const account = await UserAccount.findOne({ userId }).lean();
                stremioKeyToUse = account?.apiKeys?.stremio;
            } catch (_e) {}
        }
        if (stremioKeyToUse && isStremioSyncDueForUser(userConfig)) {
            try {
                const { syncAllStremioData } = require('../utils/stremioAddon');
                await syncAllStremioData(userId, stremioKeyToUse, context);
            } catch (sErr) {
                console.warn(`[Hybrid] Stremio periodic likes sync failed:`, sErr.message);
            }
        }

        const traktType = mediaType === 'movie' ? 'movies' : 'shows';
        const [history, ratings] = await Promise.all([
            fetchRecentHistory(traktToken, traktType, 40, userConfig),
            fetchRecentRatings(traktToken, traktType, 40, userConfig)
        ]);
        const combined = [...(history || []), ...(ratings || [])];

        // Se non ci sono nuove interazioni (es. Trakt vuoto o errore 403),
        // aggiorniamo comunque lastUpdated per non ripetere il check ad ogni richiesta
        // ed evitiamo di invalidare inutilmente la cache delle raccomandazioni (BUG-3)
        if (combined.length === 0) {
            if (typeof TasteProfile.updateOne === 'function') {
                await TasteProfile.updateOne({ owner: userId, context }, { $set: { lastUpdated: new Date() } });
            }
            return false;
        }

        const syncResult = await ProfileBuilder.syncUserHistory(userId, context, combined, tmdbApiKey);
        if (typeof TasteProfile.updateOne === 'function') {
            await TasteProfile.updateOne({ owner: userId, context }, { $set: { lastUpdated: new Date() } });
        }
        return syncResult !== false;
    } catch (err) {
        console.error(`[Hybrid] syncIncrementalRecommendations failed for ${userId}/${context}:`, err.message);
        return false;
    }
}

module.exports = {
    getHybridCatalog,
    isStremioSyncDueForUser,
    getActiveKidsMode,
    buildRecommendationCacheKey,
    buildSharedHeroCacheKey,
    assignHeroPools,
    buildSharedHeroCatalogs,
    getSharedHeroCatalogs,
    syncIncrementalRecommendations,
    fetchRecentHistory,
    fetchTraktRecommendationsRaw,
    fetchTmdbSimilarCounts,
    calculateHybridScore,
    computeTopGenres,
    computeTopKeywords,
    fetchPopularFallbackIds,
    buildDirectPresetCatalog,
    buildHybridCatalog,
    buildTopGenresMixCatalog,
    recommendationsCache: hybridRecommendationsCache
};
