// src/catalog/providers/HybridProvider.js

/**
 * Provider dei cataloghi basati sul profilo (Taste-based / Hero) (Ticket 41 - Decisione 26).
 *
 * Riceve la richiesta di serving dal CatalogRouter e orchestra:
 * - Profilo & Staleness: verifica lastUpdated e sync incrementale (modulo profile + modulo library)
 * - Cache a 7 giorni: lettura/scrittura/invalidazione SWR (modulo cache)
 * - Composizione righe candidate: delega al pool (modulo pool/composer)
 * - Idratazione card: risolve metadati e impagina (modulo indice)
 * - Impressioni: registra visualizzazioni al primo giro (modulo profile)
 */

const { HERO_CATALOG_IDS_SET } = require('../registry');
const { ITEMS_PER_PAGE, RECOMMENDATIONS_CACHE_TTL_MS } = require('../../config');
const cache = require('../../cache');

const TASTE_BASED_IDS = HERO_CATALOG_IDS_SET;

/**
 * Servizio di orchestrazione del catalogo ibrido/hero per Stremio.
 */
async function serveHybridCatalog(catalogId, skip, traktToken, tmdbApiKey, userId, activeProfileId = 'global', userConfig = null) {
    const { getPresets } = require('../presets');
    const presetsList = getPresets();
    const matchedPreset = presetsList.find(p => p.id === catalogId);
    let mediaType = (catalogId.includes('series') || catalogId.includes('tv')) ? 'series' : 'movie';
    if (matchedPreset && matchedPreset.type) {
        mediaType = matchedPreset.type === 'series' ? 'series' : 'movie';
    }

    const { contestoDi } = require('../../profile/context');
    const { getTasteProfile, isProfileSyncDue, registraImpressioni } = require('../../profile');
    const { syncIncrementalRecommendations } = require('../../library');
    const { composeCandidateIds, fetchPopularFallbackIds } = require('../../pool/composer');
    const { idrataEImpaginaCandidati } = require('../../indice/idratazione');
    const { isHeroCatalogId } = require('../registry');

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
        profile = await getTasteProfile(userId, context);
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
        ttl: RECOMMENDATIONS_CACHE_TTL_MS || 7 * 24 * 60 * 60 * 1000 // 7 giorni
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
        recommendationIds = await composeCandidateIds({
            catalogId,
            userId,
            context,
            mediaType,
            traktToken,
            tmdbApiKey,
            isKidsMode,
            userConfig,
            effectiveTypeSelectors,
            effectiveSliders,
            matchedPreset
        });
        console.log(`[HeroPool] ${catalogId}: ${recommendationIds.length} assigned IDs`);
    } else {
        const buildRecommendIds = async () => {
            const ids = await composeCandidateIds({
                catalogId,
                userId,
                context,
                mediaType,
                traktToken,
                tmdbApiKey,
                isKidsMode,
                userConfig,
                effectiveTypeSelectors,
                effectiveSliders,
                matchedPreset
            });
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

/**
 * Provider dei cataloghi basati sul profilo (Taste-based / Hero).
 */
async function getEngineHybridCatalog(baseId, type, skip, userConfig, tmdbApiKey, activeProfileSettings) {
    const traktToken = userConfig.apiKeys?.trakt;
    const effectiveConfig = {
        ...userConfig,
        activeProfileSettings: activeProfileSettings || userConfig?.activeProfileSettings
    };
    let targetCatalogId = baseId;
    if (!baseId.endsWith('_movies') && !baseId.endsWith('_series')) {
        const suffix = (type === 'series' || type === 'tv') ? '_series' : '_movies';
        const candidate = `${baseId}${suffix}`;
        if (HERO_CATALOG_IDS_SET.has(candidate)) {
            targetCatalogId = candidate;
        }
    }
    const { getHybridCatalog } = require('../../pool/composer');
    const pageResults = await getHybridCatalog(targetCatalogId, skip, traktToken, tmdbApiKey, userConfig.userId, userConfig.activeProfileId, effectiveConfig);
    return pageResults || [];
}

module.exports = {
    TASTE_BASED_IDS,
    getEngineHybridCatalog,
    serveHybridCatalog,
    getHybridCatalog: serveHybridCatalog
};
