const mongoose = require('mongoose');
const { leggiWatchlist, WATCHLIST_PAGE_SIZE } = require('../../library');
const { accountPerAddonUuid } = require('../../configurazione');
const AddonConfig = require('../../models/AddonConfig');
const { mapDuckDbRowToMeta, queryRaw } = require('../../indice');
const { normalizeLegacyPosterHost } = require('../../library');
const { isItemInappropriateForKids } = require('../../catalog/kidsModeFilters');

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Trigger background sync if needed.
 */
async function triggerSyncIfNeeded(addonUuid) {
    if (mongoose.connection.readyState !== 1) return;
    try {
        const addonConfig = await AddonConfig.findOne({ uuid: addonUuid });
        if (!addonConfig) return;
        
        const lastSync = addonConfig.syncStatus?.lastLibrarySync;
        const now = new Date();
        
        if (!lastSync || (now.getTime() - lastSync.getTime() > SYNC_INTERVAL_MS)) {
            // Find user id to trigger sync
            const user = await accountPerAddonUuid(addonUuid);
            if (user) {
                // Fire and forget
                // La porta della libreria, non il servizio interno (decisione 29: i moduli si
                // parlano dalle porte; la libreria possiede l'ingestione).
                const { syncLibraryForUser } = require('../../library');
                syncLibraryForUser(user.userId).catch(e => console.error(e));
            }
        }
    } catch (error) {
        console.error('[WatchlistProvider] Error checking sync status:', error.message);
    }
}

function positiveTmdbId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Adds the genre/keyword safety metadata kept in the local TMDB dump.
 * The library document only stores the TMDB id, so kidsMode cannot make a safe
 * decision from name/poster alone. Lookup failures deliberately leave the item
 * unenriched: the shared kids filter will then hide it (fail closed).
 */
async function enrichWatchlistItemsWithTmdbMetadata(items) {
    const movieIds = new Set();
    const tvIds = new Set();

    for (const item of items) {
        const tmdbId = positiveTmdbId(item.tmdbId);
        if (!tmdbId) continue;
        if (item.type === 'movie') movieIds.add(tmdbId);
        else if (item.type === 'series') tvIds.add(tmdbId);
        else {
            // Kitsu/Anime library ids can map to either a TMDB movie or TV row.
            movieIds.add(tmdbId);
            tvIds.add(tmdbId);
        }
    }

    if (movieIds.size === 0 && tvIds.size === 0) return items;

    const fetchRows = async (table, ids) => {
        if (ids.size === 0) return [];
        const idList = Array.from(ids).join(',');
        return queryRaw(`SELECT * FROM ${table} WHERE id IN (${idList})`);
    };

    let movieRows;
    let tvRows;
    try {
        [movieRows, tvRows] = await Promise.all([
            fetchRows('movies', movieIds),
            fetchRows('tv', tvIds)
        ]);
    } catch (error) {
        console.error('[WatchlistProvider] Errore metadata TMDB per kidsMode:', error.message);
        return items;
    }

    const metadataByTable = new Map();
    const indexRows = (rows, table) => {
        const byId = new Map();
        for (const row of rows || []) {
            const id = positiveTmdbId(row.id);
            if (id) byId.set(id, mapDuckDbRowToMeta(row, table === 'movies'));
        }
        return byId;
    };
    metadataByTable.set('movies', indexRows(movieRows, 'movies'));
    metadataByTable.set('tv', indexRows(tvRows, 'tv'));

    return items.map(item => {
        const tmdbId = positiveTmdbId(item.tmdbId);
        if (!tmdbId) return item;

        let metadata;
        if (item.type === 'movie') {
            metadata = metadataByTable.get('movies').get(tmdbId);
        } else if (item.type === 'series') {
            metadata = metadataByTable.get('tv').get(tmdbId);
        } else {
            metadata = metadataByTable.get('movies').get(tmdbId)
                || metadataByTable.get('tv').get(tmdbId);
        }
        if (!metadata) return item;

        return {
            ...item,
            genres: metadata.genres,
            genre_ids: metadata.genre_ids,
            keywords: metadata.keywords,
            rawTMDB: metadata.rawTMDB
        };
    });
}

function transformWatchlistItemToMeta(item) {
    const effectiveId = item.itemId || item._id;
    return {
        id: effectiveId,
        type: item.type,
        name: item.name || 'Unknown',
        poster: normalizeLegacyPosterHost(item.poster, process.env.HOST_URL),
        posterShape: item.posterShape || 'poster',
        background: item.background,
        logo: item.logo,
        year: item.year,
        releaseInfo: item.year ? String(item.year) : item.year,
        genres: item.genres,
        genre_ids: item.genre_ids,
        keywords: item.keywords,
        rawTMDB: item.rawTMDB
    };
}

async function getWatchlistCatalog(id, type, skip, userConfig, activeProfileSettings) {
    const uuid = userConfig.addonUuid || userConfig.uuid;

    // 1. Fire async sync if interval passed
    triggerSyncIfNeeded(uuid);

    if (!activeProfileSettings?.kidsMode) {
        // 2. Query library reading port (percorso deterministico standard)
        const items = await leggiWatchlist({
            addonUuid: uuid,
            catalogId: id,
            skip,
            limit: WATCHLIST_PAGE_SIZE
        });

        if (!items || items.length === 0) {
            return [];
        }

        return items.map(transformWatchlistItemToMeta);
    }

    // Modalità Bambini: i filtri agiscono PRIMA del taglio.
    // Paginazione a monte da MongoDB con arricchimento progressivo finché la pagina non è piena o la libreria è esausta.
    const targetCount = (Number(skip) || 0) + WATCHLIST_PAGE_SIZE;
    const safeCatalog = [];
    const BATCH_SIZE = WATCHLIST_PAGE_SIZE;
    const MAX_WATCHLIST_PAGES = 5; // Limite: max 5 batch (100 elementi)
    let currentMongoSkip = 0;
    let pagesFetched = 0;

    while (safeCatalog.length < targetCount && pagesFetched < MAX_WATCHLIST_PAGES) {
        pagesFetched++;
        const batch = await leggiWatchlist({
            addonUuid: uuid,
            catalogId: id,
            skip: currentMongoSkip,
            limit: BATCH_SIZE
        });
        if (!batch || batch.length === 0) break;

        const enrichedBatch = await enrichWatchlistItemsWithTmdbMetadata(batch);
        for (const item of enrichedBatch) {
            const metaItem = transformWatchlistItemToMeta(item);
            if (!isItemInappropriateForKids(metaItem)) {
                safeCatalog.push(metaItem);
                if (safeCatalog.length >= targetCount) break;
            }
        }

        if (safeCatalog.length >= targetCount) break;
        if (batch.length < BATCH_SIZE) break;
        currentMongoSkip += batch.length;
    }

    const safeSkip = Number(skip) || 0;
    return safeCatalog.slice(safeSkip, safeSkip + WATCHLIST_PAGE_SIZE);
}

module.exports = {
    getWatchlistCatalog,
    WATCHLIST_PAGE_SIZE
};
