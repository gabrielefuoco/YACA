const mongoose = require('mongoose');
const UserLibraryItem = require('../../db/models/UserLibraryItem');
const LibrarySyncService = require('../../services/LibrarySyncService');
const UserAccount = require('../../db/models/UserAccount');
const AddonConfig = require('../../db/models/AddonConfig');

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

async function getWatchlistCatalog(id, type, skip, userConfig, activeProfileSettings) {
    const uuid = userConfig.addonUuid || userConfig.uuid;

    // 1. Fire async sync if interval passed
    triggerSyncIfNeeded(uuid);

    // 2. Map catalog ID to stremio types
    let targetType = 'movie'; // Default to movie
    if (id === 'yaca_watchlist_movies') {
        targetType = 'movie';
    } else if (id === 'yaca_watchlist_series') {
        targetType = 'series';
    } else if (id === 'yaca_watchlist_anime') {
        // In Stremio, anime can be series or movie, but sometimes they have type 'anime'.
        // Or we might need to query for both type: 'anime' or maybe type in ['series', 'movie'] and some anime flag?
        // Usually stremio cinemeta sets type='series' but hanime/kitsu sets 'anime' or 'series'
        targetType = 'anime'; // We will assume kitsu/anilist uses 'anime' or 'series'
    }

    // Prepare query for UserLibraryItem
    let query = {
        addonUuid: uuid,
        removed: false,
        itemId: { $ne: null, $exists: true }
    };

    if (id === 'yaca_watchlist_anime') {
        // Anime might be identified by source (kitsu:, hanime:, etc.) or type.
        // NB: niente `$regex` su `_id`: nel modello è un ObjectId e Mongoose lancia
        // "Can't use $regex", facendo fallire l'INTERA query (catalogo sempre vuoto).
        // Gli id di Stremio vivono in `itemId`.
        query.$or = [
            { type: 'anime' },
            { itemId: { $regex: /^(kitsu|hanime|anilist):/ } }
        ];
    } else {
        query.type = targetType;
        // Exclude anime from standard series/movies if possible by removing known anime prefixes
        query.itemId = { $ne: null, $exists: true, $not: { $regex: /^(kitsu|hanime|anilist):/ } };
    }

    const pageSize = 100;
    
    // 3. Query the DB
    const items = await UserLibraryItem.find(query)
        .sort({ _mtime: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean();

    if (!items || items.length === 0) {
        return [];
    }

    // 4. Transform to Stremio meta objects
    const catalog = [];
    
    for (const item of items) {
        // If it's a native Stremio item, it already has poster, name, etc.
        // We can just return it mostly as is, or try to enrich it.
        // For watchlist, Stremio client usually just needs standard meta preview.
        const effectiveId = item.itemId || item._id;
        let metaItem = {
            id: effectiveId,
            type: item.type,
            name: item.name || 'Unknown',
            poster: item.poster,
            posterShape: item.posterShape || 'poster',
            background: item.background,
            logo: item.logo,
            year: item.year,
            releaseInfo: item.year ? String(item.year) : item.year
        };

        catalog.push(metaItem);
    }

    return catalog;
}

module.exports = {
    getWatchlistCatalog
};
