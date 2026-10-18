/**
 * src/pool/composer.js
 *
 * Compositore di righe candidate del Pool (Ticket 41 - Decisione 26).
 *
 * Il pool mantiene ESCLUSIVAMENTE la composizione delle righe:
 * - composeCandidateIds: risoluzione degli ID candidati (Hero pool, preset o fallback popolare)
 * - buildDirectPresetCatalog: composizione da preset DuckDB
 * - fetchPopularFallbackIds: composizione fallback con tie-breakers e dedup regista/collezione
 *
 * Tutte le responsabilità di serving (staleness, sync, cache a 7 giorni, idratazione, impressioni)
 * sono state dissolte e riallocate ai rispettivi proprietari di dominio in src/catalog/providers/HybridProvider.js.
 */

const { isHeroCatalogId } = require('../catalog/registry');
const { normalizeContentId } = require('../catalog/contentId');
const { isItemInappropriateForKids, applyKidsMode } = require('../catalog/kidsModeFilters');
const { isItemAnime } = require('../anime');
const indice = require('../indice');

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
        pending = indice.getCatalogFromFilters(effectiveFilters, type, 0, fetchLimit, {});
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

function matchesTypeSelectors(item, typeSelectors, tipo) {
    if (!typeSelectors) return true;
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
            const results = await indice.getCatalogFromFilters(
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
 * Composizione pura delle righe di candidati per un catalogo del pool.
 */
async function composeCandidateIds({
    catalogId,
    userId,
    context,
    mediaType,
    traktToken,
    tmdbApiKey,
    isKidsMode = false,
    userConfig = null,
    effectiveTypeSelectors = null,
    effectiveSliders = null,
    matchedPreset = null
}) {
    if (isHeroCatalogId(catalogId)) {
        const { getHeroPool } = require('./index');
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
        return poolResults[catalogId] || poolResults.catalogs?.[catalogId] || [];
    }

    if (matchedPreset) {
        const ids = await buildDirectPresetCatalog(
            catalogId,
            userId,
            context,
            tmdbApiKey,
            mediaType,
            isKidsMode,
            effectiveTypeSelectors
        );
        if (ids.length > 0) return ids;
    }

    return [];
}

/**
 * Delegatore sottile per compatibilità verso HybridProvider (Ticket 41 - Decisione 26).
 */
async function getHybridCatalog(...args) {
    const { getHybridCatalog: serve } = require('../catalog/providers/HybridProvider');
    return serve(...args);
}

module.exports = {
    composeCandidateIds,
    fetchPopularFallbackIds,
    buildDirectPresetCatalog,
    getHybridCatalog
};
