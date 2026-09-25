const mongoose = require('mongoose');
const UserLibraryItem = require('../../db/models/UserLibraryItem');
const LibrarySyncService = require('../../services/LibrarySyncService');
const UserAccount = require('../../db/models/UserAccount');
const AddonConfig = require('../../db/models/AddonConfig');
const duckDbStore = require('../../db/duckDbStore');
const { mapDuckDbRowToMeta } = require('./DuckDbProvider');
const { normalizeLegacyPosterHost } = require('../../utils/libraryIdentity');

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const WATCHLIST_PAGE_SIZE = 20;

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
        itemId: { $ne: null, $exists: true },
        // Un solo risultato per titolo: i duplicati con id diverso (tt… / tmdb:… / kitsu:…)
        // vengono marcati al sync e nascosti qui.
        duplicateOf: null
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

    // 3. Query the DB. itemId is unique within an addon and is the stable
    // tie-breaker when several library rows share the same _mtime timestamp.
    const items = await UserLibraryItem.find(query)
        .sort({ _mtime: -1, itemId: 1 })
        .skip(skip)
        .limit(WATCHLIST_PAGE_SIZE)
        .lean();

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
