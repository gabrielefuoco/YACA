/**
 * src/stremio/badges.js
 *
 * Applicazione badge post-cache (Ticket 41 - Serving su moduli).
 */

const { EPISODE_CATALOG_IDS } = require('../catalog/constants');
const itaAnnotations = require('../catalog/itaAnnotations');
const indice = require('../indice');
const {
    animeAiringState,
    animeMappingStore,
    normalizeAnimeMarker,
    extractAnimeTmdbId,
    isItemAnime,
    isAiringStateCatalog,
    applyAiringStateBadges,
    findAiringStateDocument
} = require('../anime');
const { sanitizeCatalogMeta } = require('../stremio/formatters/StremioFormatter');

const extractTmdbId = extractAnimeTmdbId;

/**
 * Chiave dell'annotazione per una card: `(tipo, tmdb id)`.
 */
function annotationKeyFor(item, imdbMap = {}) {
    const rawId = String(item.id || '').replace(/_ita_offset$/, '');
    const rawType = item.media_type || item.type;
    const cardType = (rawType === 'movie') ? 'movie' : 'tv';

    if (rawId.startsWith('tmdb:')) {
        const parts = rawId.split(':');
        if (parts[1] === 'movie' || parts[1] === 'tv' || parts[1] === 'series') {
            const id = Number(parts[2]);
            const resolvedType = parts[1] === 'movie' ? 'movie' : 'tv';
            return Number.isFinite(id) ? { type: resolvedType, id } : null;
        }
        const legacyId = Number(parts[1]);
        return Number.isFinite(legacyId) ? { type: cardType, id: legacyId } : null;
    }

    if (rawId.startsWith('tt')) {
        const mapped = imdbMap[rawId];
        return mapped ? { type: mapped.type === 'movie' ? 'movie' : 'tv', id: mapped.id } : null;
    }

    if (rawId.startsWith('kitsu:')) {
        const kitsuId = rawId.slice('kitsu:'.length).split(':')[0];
        try {
            const tmdbId = /^\d+$/.test(kitsuId) ? animeMappingStore.resolveTmdbFromKitsu(kitsuId) : null;
            if (tmdbId) return { type: cardType, id: Number(tmdbId) };
        } catch (_e) {
            // difensivo
        }
        return null;
    }

    return null;
}

/** Ponte IMDb->TMDB per le card `tt...`: una query in batch */
async function resolveImdbMap(metas) {
    const ids = [...new Set(metas.map(item => String(item.id || '')).filter(id => id.startsWith('tt')))];
    if (ids.length === 0) return {};
    try {
        const mapping = await indice.resolveImdbIds(ids);
        const out = {};
        for (const [imdbId, value] of Object.entries(mapping || {})) {
            if (value && value.tmdbId) {
                out[imdbId] = { type: value.type === 'tv' ? 'tv' : 'movie', id: Number(value.tmdbId) };
            }
        }
        return out;
    } catch (_e) {
        return {};
    }
}

async function applyPostCacheBadges(cachedData, userConfig, hostUrl, catalogMeta, type, baseId, options = {}) {
    if (!cachedData || !Array.isArray(cachedData.metas) || cachedData.metas.length === 0) {
        return cachedData || { metas: [] };
    }

    const metas = cachedData.metas.map(item => {
        const clone = { ...item };
        normalizeAnimeMarker(clone);
        return clone;
    });

    let animeSnapshot = options.snapshot || null;
    if (!animeSnapshot && metas.some(isItemAnime)) {
        try {
            animeSnapshot = await animeAiringState.getSnapshot();
        } catch (_e) {
            animeSnapshot = null;
        }
    }

    if (isAiringStateCatalog(baseId, catalogMeta)) {
        return await applyAiringStateBadges(metas, { userConfig, hostUrl, catalogMeta, type, snapshot: animeSnapshot });
    }

    const activeProfileSettings = userConfig?.profiles?.find((p) => p.id === userConfig.activeProfileId)?.settings || {};
    const isLandscape = activeProfileSettings.isLandscapeEnabled || catalogMeta?.isLandscape || false;
    const sanitizeOptions = {
        shouldApplyEpisodeBadge: (type === 'series' || type === 'anime') && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId)),
        isLandscapeEnabled: isLandscape,
        userConfig,
        hostUrl
    };

    let itaSnapshot = options.itaSnapshot || null;
    if (!itaSnapshot) {
        try {
            itaSnapshot = await itaAnnotations.getSnapshot();
        } catch (_e) {
            itaSnapshot = null;
        }
    }

    const imdbMap = options.imdbMap || (await resolveImdbMap(metas.filter(item => !isItemAnime(item))));

    let animeSnapshotPromise = null;
    async function animeDocFor(tmdbId) {
        if (tmdbId === null || tmdbId === undefined) return null;
        if (!animeSnapshot) {
            if (!animeSnapshotPromise) {
                animeSnapshotPromise = animeAiringState.getSnapshot()
                    .then(s => { animeSnapshot = s || animeSnapshot; return animeSnapshot; })
                    .catch(() => null);
            }
            await animeSnapshotPromise;
        }
        if (!animeSnapshot || !animeSnapshot.byTmdbId) return null;
        return animeSnapshot.byTmdbId.get(String(tmdbId)) || null;
    }

    async function itaDubbed(tipo, tmdbId) {
        if (tmdbId === null || tmdbId === undefined) return false;
        const conChiave = itaAnnotations.isDubbed(itaSnapshot, tipo, tmdbId);
        if (conChiave || tipo !== 'movie') return conChiave;
        const doc = await animeDocFor(tmdbId);
        return itaAnnotations.isDubbed(itaSnapshot, tipo, tmdbId, {
            allowTypeFallback: animeAiringState.isDubbedFilmDocForCard(doc, tmdbId, animeMappingStore)
        });
    }

    const processedMetas = [];

    for (let i = 0; i < metas.length; i++) {
        const item = metas[i];

        if (isItemAnime(item)) {
            const doc = animeSnapshot ? findAiringStateDocument(animeSnapshot, item) : null;
            const animeTmdbId = (doc && doc.tmdbId) || extractTmdbId(item);
            const animeDubbed = await itaDubbed(item.type === 'movie' ? 'movie' : 'tv', animeTmdbId);
            const animeItem = { ...item, _itaBadge: animeDubbed, _itaOnlyBadge: true };

            if (sanitizeOptions.shouldApplyEpisodeBadge || animeDubbed) {
                processedMetas.push(sanitizeCatalogMeta(animeItem, sanitizeOptions));
            } else {
                processedMetas.push(animeItem);
            }
            continue;
        }

        const key = annotationKeyFor(item, imdbMap);
        const dubbed = key ? await itaDubbed(key.type, key.id) : false;
        const outItem = { ...item, _itaBadge: dubbed };

        if (dubbed || sanitizeOptions.shouldApplyEpisodeBadge) {
            processedMetas.push(sanitizeCatalogMeta(outItem, sanitizeOptions));
        } else {
            processedMetas.push(outItem);
        }
    }

    return { metas: processedMetas };
}

module.exports = {
    annotationKeyFor,
    resolveImdbMap,
    applyPostCacheBadges
};
