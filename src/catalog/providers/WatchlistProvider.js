const mongoose = require('mongoose');
const { leggiWatchlist, WATCHLIST_PAGE_SIZE } = require('../../library');
const LibrarySyncService = require('../../library/ingestion/LibrarySyncService');
const UserAccount = require('../../db/models/UserAccount');
const AddonConfig = require('../../db/models/AddonConfig');
const duckDbStore = require('../../indice/duckDbStore');
const { mapDuckDbRowToMeta } = require('./DuckDbProvider');
const { normalizeLegacyPosterHost } = require('../../library');

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
            const user = await UserAccount.findOne({ addonUuid });
            if (user) {
                // Fire and forget
                LibrarySyncService.syncLibraryForUser(user.userId).catch(e => console.error(e));
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
        return duckDbStore.query(`SELECT * FROM ${table} WHERE id IN (${idList})`);
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

async function getWatchlistCatalog(id, type, skip, userConfig, activeProfileSettings) {
    const uuid = userConfig.addonUuid || userConfig.uuid;

    // 1. Fire async sync if interval passed
    triggerSyncIfNeeded(uuid);

    // 2. Query library reading port
    const items = await leggiWatchlist({
        addonUuid: uuid,
        catalogId: id,
        skip,
        limit: WATCHLIST_PAGE_SIZE
    });

    if (!items || items.length === 0) {
        return [];
    }

    // 4. Transform to Stremio meta objects. In kids mode, enrich the bare
    // library rows before catalogHandler applies the hard safety filter.
    const enrichedItems = activeProfileSettings?.kidsMode
        ? await enrichWatchlistItemsWithTmdbMetadata(items)
        : items;
    const catalog = [];
    
    for (const item of enrichedItems) {
        // If it's a native Stremio item, it already has poster, name, etc.
        // We can just return it mostly as is, or try to enrich it.
        // For watchlist, Stremio client usually just needs standard meta preview.
        const effectiveId = item.itemId || item._id;
        let metaItem = {
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

        catalog.push(metaItem);
    }

    return catalog;
}

module.exports = {
    getWatchlistCatalog,
    WATCHLIST_PAGE_SIZE
};
