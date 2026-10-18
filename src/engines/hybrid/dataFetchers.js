const TasteProfile = require('../../models/TasteProfile');
const { accountDi } = require('../../configurazione');
const AddonConfig = require('../../models/AddonConfig');
const { traktClient } = require('../../clients/trakt');
const { normalizeContentId } = require('../../catalog/contentId');
const DuckDbProvider = require('../../catalog/providers/DuckDbProvider');
const { applyKidsMode } = require('../../catalog/kidsModeFilters');
const { isItemAnime } = require('../../anime');

// Ticket 21: ampliato a 260 per consentire il pool allargato a monte (250) nei contesti stretti
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

function getDateSortValue(item) {
    const raw = item?.release_date || item?.first_air_date || item?.last_air_date;
    if (!raw) return Number.NEGATIVE_INFINITY;
    const timestamp = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
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
    // Ticket 07: vincolo di durata minima (60') per i film nei fallback hero
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

// Estrazione contesto profilo (spostata in src/profile, Ticket 41 - Fetta 1)
const { fetchProfileContext } = require('../../profile/profileContext');

// Estrazione fatti Trakt (spostata in src/library, Ticket 41 - Fetta 1)
const {
    safeTraktFetchDetailed,
    safeTraktFetch,
    fetchRecentHistory,
    fetchRecentRatings
} = require('../../library/traktFetchers');

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
    // Ticket 07: vincolo di durata minima (60') per i film nei fallback popolari hero gestito in fetchFallbackRows
    const results = await fetchFallbackRows(filters, type, limit, isKidsMode, typeSelectors);
    return mapStableFallbackIds(
        results,
        limit,
        (a, b) => (getNumericSortValue(b, 'popularity') - getNumericSortValue(a, 'popularity'))
            || (getNumericSortValue(b, 'vote_average') - getNumericSortValue(a, 'vote_average'))
    );
}

module.exports = {
    fetchProfileContext,
    safeTraktFetch,
    safeTraktFetchDetailed,
    fetchRecentHistory,
    fetchRecentRatings,
    fetchPopularFallbackIds
};
