const UserLibraryItem = require('../../db/models/UserLibraryItem');
const { getTmdbClient } = require('../../clients/tmdb');
const { formatMovieToStremio, formatSeriesToStremio } = require('../formatters/StremioFormatter');
const LibrarySyncService = require('../../services/LibrarySyncService');
const UserAccount = require('../../db/models/UserAccount');
const AddonConfig = require('../../db/models/AddonConfig');

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Trigger background sync if needed.
 */
async function triggerSyncIfNeeded(addonUuid) {
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
    // 1. Fire async sync if interval passed
    triggerSyncIfNeeded(userConfig.uuid);

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
        addonUuid: userConfig.uuid,
        removed: false
    };

    if (id === 'yaca_watchlist_anime') {
        // Anime might be identified by source (kitsu:, hanime:, etc.) or type
        query.$or = [
            { type: 'anime' },
            { _id: { $regex: /^(kitsu|hanime|anilist):/ } }
        ];
    } else {
        query.type = targetType;
        // Exclude anime from standard series/movies if possible by removing known anime prefixes
        query._id = { $not: { $regex: /^(kitsu|hanime|anilist):/ } };
    }

    const pageSize = 50;
    
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
    const tmdbClient = getTmdbClient(activeProfileSettings?.tmdbKey);
    
    for (const item of items) {
        // If it's a native Stremio item, it already has poster, name, etc.
        // We can just return it mostly as is, or try to enrich it.
        // For watchlist, Stremio client usually just needs standard meta preview.
        let metaItem = {
            id: item._id,
            type: item.type,
            name: item.name || 'Unknown',
            poster: item.poster,
            posterShape: item.posterShape || 'poster',
            background: item.background,
            logo: item.logo,
            year: item.year
        };

        // Attempt basic ERDB badge formatting if it's a standard IMDB item and not anime
        if (targetType !== 'anime' && item._id.startsWith('tt')) {
            const isMovie = item.type === 'movie';
            // We fake a rawTMDB object to pass to formatter to get the badge!
            // But we don't have TMDB full data. We can just append the badge manually 
            // if we want, or do a lightweight lookup. 
            // For now, let's just return the item. If it has a badge, we could generate it 
            // using the ERDB formatting logic, but we need the badge generator URL.
            // A simple implementation for watchlist is to just return the item natively first.
            
            // To properly add badges, we'd need to parse it through StremioFormatter,
            // but StremioFormatter expects a `rawTMDB` object.
            
            // Actually, we can use the `poster` directly.
            // Let's rely on Stremio's native fallback if we don't enrich it immediately.
        }

        catalog.push(metaItem);
    }

    return catalog;
}

module.exports = {
    getWatchlistCatalog
};
