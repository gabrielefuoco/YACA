const { ITEMS_PER_PAGE } = require('../config');
const TasteProfile = require('../models/TasteProfile');
const cache = require('../cache');
const { hybridRecommendationsCache } = require('../cache/cacheInstances');
const { isHeroCatalogId } = require('../catalog/registry');
const { normalizeContentId } = require('../catalog/contentId');
const { isItemInappropriateForKids, applyKidsMode } = require('../catalog/kidsModeFilters');

// Modulo profilo: staleness e vettori (Ticket 41 - Fetta 1)
const { isProfileSyncDue } = require('../profile/profileStaleness');
const { computeTopGenres, computeTopKeywords } = require('../profile/vectorElements');

// Modulo pool: compositore delle righe hero
const {
    getHeroPool,
    buildSharedHeroCatalogs,
    getSharedHeroCatalogs,
    buildSharedHeroCacheKey
} = require('../pool');

// Modulo libreria: sincronizzazione fatti e registrazione impressioni (Ticket 41 - Fetta 1)
const {
    isStremioSyncDueForUser,
    syncIncrementalRecommendations
} = require('../library/syncRecommendations');
const { fetchRecentHistory } = require('../library/traktFetchers');
const { registraImpressioni } = require('../library/impressions');

// Modulo indice: idratazione card, filtraggio e paginazione (Ticket 41 - Fetta 1)
const {
    resolveCardDetails,
    cardSurvivesFilters,
    idrataEImpaginaCandidati
} = require('../indice/idratazione');

const { isItemAnime } = require('../anime');
const DuckDbProvider = require('../catalog/providers/DuckDbProvider');

const MAX_HERO_FALLBACK_FETCH = 260;
const HERO_FALLBACK_LIMIT = 160;

function compareContentIds(a, b) {
    const idA = String(a ?? '');
    const idB = String(b ?? '');
    const numA = Number(idA);
    const numB = Number(idB);
    if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
}

function getNumericSortValue(item, field) {
    const value = Number(item?.[field]);
    return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function rollingDateStart(months) {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() - months);
    return date.toISOString().slice(0, 10);
}

async function fetchFallbackRows(filters, type, limit, isKidsMode, typeSelectors = null) {
    const fetchLimit = Math.min(MAX_HERO_FALLBACK_FETCH, Math.max(40, Number(limit) || 0));
    const effectiveFilters = { ...filters };
    if (typeSelectors?.anime === 'only') {
        effectiveFilters.isAnime = true;
    } else if (typeSelectors?.anime === 'exclude') {
        effectiveFilters.notAnime = true;
    }
    if (type === 'movie') {
        effectiveFilters['with_runtime.gte'] = 60;
    }
    let pending;
    try {
        pending = DuckDbProvider.getDuckDbCatalogFromFilters(effectiveFilters, type, 0, fetchLimit, {});
    } catch (_error) {
        return [];
    }
    const results = await Promise.resolve(pending).catch(() => []);
    if (!Array.isArray(results)) return [];
    let processed = isKidsMode ? applyKidsMode(results) : results;
    const tipo = type === 'movie' ? 'movie' : 'tv';
    if (typeSelectors?.anime === 'only') {
        processed = processed.filter(item => isItemAnime(item, tipo));
    } else if (typeSelectors?.anime === 'exclude') {
        processed = processed.filter(item => !isItemAnime(item, tipo));
    }
    return processed;
}

function getFallbackCollectionId(item) {
    const rawId = item?.collection_id
        ?? item?.belongs_to_collection?.id
        ?? item?.rawTMDB?.collection_id
        ?? item?.rawTMDB?.belongs_to_collection?.id;
    return rawId === null || rawId === undefined || String(rawId).trim() === '' ? null : String(rawId).trim();
}

function getFallbackDirectorIds(item) {
    const rawDirectors = item?.directors || item?.rawTMDB?.directors || item?.rawTMDB?.credits?.crew || [];
    const directors = Array.isArray(rawDirectors) ? rawDirectors : [];
    return [...new Set(directors
        .filter(person => person?.job === 'Director' && person?.id !== undefined)
        .map(person => String(person.id)))];
}

function mapStableFallbackIds(rows, limit, compareRows) {
    const seen = new Set();
    const candidates = [];
    for (const item of rows) {
        const rawId = item?._tmdbId ?? item?.id;
        const id = normalizeContentId(rawId);
        if (!id || ['undefined', 'null', 'nan'].includes(id.toLowerCase()) || seen.has(id)) continue;
        seen.add(id);
        candidates.push({ id, item });
    }
    candidates.sort((a, b) => compareRows(a.item, b.item) || compareContentIds(a.id, b.id));

    const maxItems = Math.max(0, Number(limit) || 0);
    if (maxItems === 0) return [];
    const seenCollections = new Set();
    const seenDirectors = new Set();
    const selected = [];
    for (const candidate of candidates) {
        const collectionId = getFallbackCollectionId(candidate.item);
        if (collectionId && seenCollections.has(collectionId)) continue;
        const directorIds = getFallbackDirectorIds(candidate.item);
        if (directorIds.some(directorId => seenDirectors.has(directorId))) continue;

        if (collectionId) seenCollections.add(collectionId);
        directorIds.forEach(directorId => seenDirectors.add(directorId));
        selected.push(candidate.id);
        if (selected.length >= maxItems) break;
    }
    return selected;
}

async function fetchPopularFallbackIds(tmdbApiKey, mediaType, limit = HERO_FALLBACK_LIMIT, isKidsMode = false, typeSelectors = null) {
    const type = mediaType === 'movie' ? 'movie' : 'series';
    const isMovie = type === 'movie';
    const baseFilters = {
        sort_by: 'popularity.desc',
        'vote_count.gte': isMovie ? 100 : 50,
        'vote_average.gte': isMovie ? 6.8 : 7.0,
        ...(isMovie ? { 'primary_release_date.gte': rollingDateStart(36) } : { 'first_air_date.gte': rollingDateStart(36) })
    };
    const filters = isKidsMode ? applyKidsMode(baseFilters) : baseFilters;
    const results = await fetchFallbackRows(filters, type, limit, isKidsMode, typeSelectors);
    return mapStableFallbackIds(
        results,
        limit,
        (a, b) => (getNumericSortValue(b, 'popularity') - getNumericSortValue(a, 'popularity'))
            || (getNumericSortValue(b, 'vote_average') - getNumericSortValue(a, 'vote_average'))
    );
}

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

function buildRecommendationCacheKey({ userId, context, catalogId, kidsMode, typeSelectors }) {
    const { chiave } = cache.deriva({
        nome: 'recommendations',
        dipendenze: {
            varia: {
                utente: userId,
                profilo: context,
                catalogo: catalogId,
                kids: kidsMode,
                selettori: typeSelectors
            }
        }
    });
    return chiave;
}

function matchesTypeSelectors(item, typeSelectors, tipo) {
    if (!typeSelectors) return true;
    const { isItemAnime } = require('../anime');
    const animeSelector = typeSelectors.anime;
    if (animeSelector === 'only') {
        return isItemAnime(item, tipo);
    }
    if (animeSelector === 'exclude') {
        return !isItemAnime(item, tipo);
    }
    return true;
}

async function buildDirectPresetCatalog(presetId, userId, context, tmdbApiKey, mediaType, isKidsMode = false, directTypeSelectors = null) {
    const { getPresets } = require('../catalog/presets');
    const presetsList = getPresets();
    const preset = presetsList.find(p => p.id === presetId);
    if (!preset || !preset.queries || preset.queries.length === 0) {
        return [];
    }

    const { getDuckDbCatalogFromFilters } = require('../catalog/providers/DuckDbProvider');
    const tmdbType = (preset.type === 'series' || mediaType === 'series') ? 'series' : 'movie';
    const existingIds = new Set();
    const pool = [];

    for (const query of preset.queries) {
        const params = { ...query };
        delete params.strategy;

        if (!params.sort_by) params.sort_by = 'popularity.desc';
        const finalParams = isKidsMode ? applyKidsMode(params) : params;

        for (let page = 1; page <= 3; page++) {
            const skip = (page - 1) * 40;
            const results = await getDuckDbCatalogFromFilters(
                finalParams,
                tmdbType,
                skip,
                40,
                {}
            ).catch(() => []);
            const presetTipo = tmdbType === 'movie' ? 'movie' : 'tv';
            for (const item of results) {
                if (isKidsMode && isItemInappropriateForKids(item)) continue;
                if (!matchesTypeSelectors(item, directTypeSelectors, presetTipo)) continue;
                const nId = normalizeContentId(item.id);
                if (nId && !existingIds.has(nId)) {
                    existingIds.add(nId);
                    pool.push(nId);
                }
            }
        }
    }

    return pool.slice(0, 100).map(id => ({ id: String(id), matchScore: null }));
}

/**
 * Main endpoint: handles request for a profiled hybrid catalog.
 */
async function getHybridCatalog(catalogId, skip, traktToken, tmdbApiKey, userId, activeProfileId = 'global', userConfig = null) {
    const { getPresets } = require('../catalog/presets');
    const presetsList = getPresets();
    const matchedPreset = presetsList.find(p => p.id === catalogId);
    let mediaType = (catalogId.includes('series') || catalogId.includes('tv')) ? 'series' : 'movie';
    if (matchedPreset && matchedPreset.type) {
        mediaType = matchedPreset.type === 'series' ? 'series' : 'movie';
    }

    const { contestoDi } = require('../profile/context');
    const ctx = userConfig?.context || await contestoDi({
        userId,
        profileId: activeProfileId,
        user: userConfig
    });
    const context = ctx.profileId;
    const isKidsMode = ctx.kidsMode;
    const effectiveTypeSelectors = ctx.selettoriEffettivi;
    const effectiveSliders = ctx.sliders || ctx.slider || userConfig?.activeProfileSettings?.sliders || userConfig?.activeProfileSettings?.slider;
    let profile = null;
    try {
        profile = await TasteProfile.findOne({ owner: userId, context });
    } catch (_e) {}
    const isHero = isHeroCatalogId(catalogId);
    console.log(`[Hybrid Debug] getHybridCatalog called with catalogId=${catalogId}, userId=${userId}, context=${context}`);
    console.log(`[Hybrid Debug] profile loaded: ${!!profile}, isKidsMode=${isKidsMode}`);

    const recDesc = {
        nome: 'recommendations',
        dipendenze: {
            varia: {
                utente: userId,
                profilo: context,
                catalogo: catalogId,
                kids: isKidsMode,
                selettori: effectiveTypeSelectors,
                ...(effectiveSliders ? { slider: effectiveSliders } : {})
            }
        },
        ttl: 7 * 24 * 60 * 60 * 1000 // 7 giorni
    };

    if (profile) {
        if (isProfileSyncDue(profile.lastUpdated, new Date())) {
            syncIncrementalRecommendations(userId, mediaType, traktToken, tmdbApiKey, context, userConfig).then(async (synced) => {
                if (synced) {
                    await cache.cancella(recDesc);
                }
            }).catch(err => console.error("Errore check stale profile:", err.message));
        }
    }

    let recommendationIds;
    if (isHero) {
        const poolResults = await getHeroPool({
            userId,
            context,
            mediaType,
            traktToken,
            tmdbApiKey,
            kidsMode: isKidsMode,
            userConfig,
            typeSelectors: effectiveTypeSelectors,
            sliders: effectiveSliders,
            slider: effectiveSliders
        });
        recommendationIds = poolResults[catalogId] || poolResults.catalogs?.[catalogId] || [];
        console.log(`[HeroPool] ${catalogId}: ${recommendationIds.length} assigned IDs`);
    } else {
        const buildRecommendIds = async () => {
            if (matchedPreset) {
                const ids = await buildDirectPresetCatalog(catalogId, userId, context, tmdbApiKey, mediaType, isKidsMode, effectiveTypeSelectors);
                if (ids.length > 0) {
                    await cache.scrivi(recDesc, { ids });
                    return ids;
                }
            }
            const ids = [];
            await cache.scrivi(recDesc, { ids });
            return ids;
        };

        const { value: cachedEntry, status: cacheStatus } = await cache.leggi(recDesc);
        console.log(`[Hybrid Debug] cache status for ${catalogId}: ${cacheStatus}`);
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
                await cache.scrivi(recDesc, { ids: recommendationIds });
            }
        }
    }

    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
        return [];
    }

    const pageResults = await idrataEImpaginaCandidati({
        recommendationIds,
        skip,
        limit: ITEMS_PER_PAGE,
        tmdbApiKey,
        mediaType,
        isKidsMode,
        effectiveTypeSelectors
    });

    if (skip === 0 && pageResults.length > 0) {
        registraImpressioni(userId, context, catalogId, pageResults);
    }

    return pageResults;
}

module.exports = {
    getHybridCatalog,
    isStremioSyncDueForUser,
    getActiveKidsMode,
    buildRecommendationCacheKey,
    buildSharedHeroCacheKey,
    buildSharedHeroCatalogs,
    getSharedHeroCatalogs,
    syncIncrementalRecommendations,
    fetchRecentHistory,
    computeTopGenres,
    computeTopKeywords,
    fetchPopularFallbackIds,
    buildDirectPresetCatalog,
    resolveCardDetails,
    cardSurvivesFilters,
    recommendationsCache: hybridRecommendationsCache
};
