const User = require('../models/User');
const { fetchTraktCatalog } = require('../clients/trakt');
const { stremioClient, stremioLikesClient } = require('../clients/stremio');
const { executeUniversalPipeline } = require('../handlers/catalogHandler');
const { createTmdbClient } = require('../clients/tmdb');
const { getPresets } = require('../data/presets');

const LIKES_ADDON_URL = 'https://likes.stremio.com/addons/liked/movies-shows';
const LOVED_ADDON_URL = 'https://likes.stremio.com/addons/loved/movies-shows';

/**
 * Fetches data from Stremio (Likes, Loves, Library) and syncs to Global Taste Profile.
 * Also pushes new interactions to Trakt.
 * If a profileId is provided, it handles profile-specific sync.
 */
async function syncAllStremioData(userId, authKey, profileId = 'global') {
    try {
        console.log(`[StremioSync] Starting full sync for user ${userId}...`);

        // 1. Get Addon Key for Deep Sync
        const addonKeyRes = await stremioLikesClient.get(`/getAddonKey?key=${authKey}`);
        const addonKey = addonKeyRes.data;
        if (!addonKey) throw new Error('Failed to retrieve Stremio AddonKey');

        // 2. Fetch Liked/Loved/Library in parallel
        const [likedMovies, likedSeries, lovedMovies, lovedSeries, library] = await Promise.all([
            fetchStremioCatalog(LIKES_ADDON_URL, addonKey, 'movie', 'stremio-liked-movie'),
            fetchStremioCatalog(LIKES_ADDON_URL, addonKey, 'series', 'stremio-liked-series'),
            fetchStremioCatalog(LOVED_ADDON_URL, addonKey, 'movie', 'stremio-loved-movie'),
            fetchStremioCatalog(LOVED_ADDON_URL, addonKey, 'series', 'stremio-loved-series'),
            fetchStremioLibrary(authKey)
        ]);

        const stremioData = {
            liked: [...likedMovies, ...likedSeries],
            loved: [...lovedMovies, ...lovedSeries],
            library: library
        };

        // 3. Update Taste Profile via ProfileBuilder
        const ProfileBuilder = require('../profile/ProfileBuilder');
        const user = await User.findOne({ userId });
        const tmdbKey = user?.apiKeys?.tmdb;

        if (profileId === 'global') {
            await ProfileBuilder.syncStremioData(userId, stremioData, tmdbKey, 'global');
        } else {
            // Se è un profilo specifico, sincronizziamo i suoi cataloghi
            const profile = user.profiles.find(p => p.id === profileId);
            if (profile) {
                console.log(`[StremioSync] Resolving catalogs for profile ${profile.name || profileId}...`);
                const catalogItems = await syncCatalogData(profile.catalogs, tmdbKey, profile.settings || {});
                
                // Wrap in expected structure for ProfileBuilder
                const formattedData = {
                    liked: catalogItems,
                    loved: [],
                    library: []
                };
                
                await ProfileBuilder.syncStremioData(userId, formattedData, tmdbKey, profileId);
            }
        }

        // 4. Push to Trakt (Two-Way Sync) - Solo per Global o se desiderato
        if (profileId === 'global') {
            await pushToTrakt(userId, stremioData);
        }

        // 5. Update lastSync timestamp
        await updateSyncTimestamp(userId, profileId);

        console.log(`[StremioSync] Sync completed successfully for user ${userId} (${profileId})`);
        return { success: true };
    } catch (error) {
        console.error(`[StremioSync] Error syncing data for user ${userId}:`, error.message);
        return { success: false, error: error.message };
    }
}

async function fetchStremioCatalog(baseUrl, addonKey, type, catalogId) {
    try {
        const url = `${baseUrl}/user=${addonKey}/catalog/${type}/${catalogId}.json`;
        const res = await stremioLikesClient.get(url, { timeout: 10000 });
        return res.data?.metas || [];
    } catch (err) {
        console.warn(`[StremioSync] Failed to fetch catalog ${catalogId}:`, err.message);
        return [];
    }
}

async function fetchStremioLibrary(authKey) {
    try {
        const res = await stremioClient.post('/api/datastoreGet', {
            type: 'DatastoreGet',
            authKey,
            collection: 'libraryItem'
        });
        return res.data?.result || [];
    } catch (err) {
        console.warn(`[StremioSync] Failed to fetch library:`, err.message);
        return [];
    }
}

async function pushToTrakt(userId, data) {
    const user = await User.findOne({ userId });
    const traktToken = user?.apiKeys?.trakt;
    if (!traktToken) return;

    const { syncTraktRatings, syncTraktHistory } = require('../clients/trakt');

    // Logic to push Loved (10) and Liked (8)
    const ratings = [];
    data.loved.forEach(item => {
        const id = item.id.startsWith('tt') ? { imdb: item.id } : null;
        if (id) ratings.push({ rating: 10, [item.type]: { ids: id } });
    });
    data.liked.forEach(item => {
        const id = item.id.startsWith('tt') ? { imdb: item.id } : null;
        if (id && !ratings.find(r => r[item.type]?.ids?.imdb === id.imdb)) {
            ratings.push({ rating: 8, [item.type]: { ids: id } });
        }
    });

    if (ratings.length > 0) {
        await syncTraktRatings(traktToken, ratings);
    }
}

async function syncCatalogData(catalogs, tmdbApiKey, settings = {}) {
    if (!catalogs || !Array.isArray(catalogs) || !tmdbApiKey) return [];
    
    // Questa funzione estrae gli ID dai cataloghi assegnati al profilo
    // Supporta Preset, Liste Utente (AI/MDBList) e cataloghi con item pre-caricati
    const allPresets = getPresets();
    const presetMap = new Map(allPresets.map(p => [p.id, p]));
    const tmdbClient = createTmdbClient(tmdbApiKey);
    
    let allItems = [];
    
    for (const cat of catalogs) {
        // 1. Se il catalogo ha già gli item (raro per dynamic)
        if (cat.items && Array.isArray(cat.items) && cat.items.length > 0) {
            allItems = [...allItems, ...cat.items];
            continue;
        }

        // 2. Risoluzione Dinamica (Preset o Liste)
        try {
            const baseId = (cat.id || '').startsWith('yaca_preset_') ? cat.id.replace('yaca_preset_', '') : (cat.id || '');
            let catalogMeta = presetMap.get(baseId);
            
            if (!catalogMeta) {
                 // Potrebbe essere una lista personalizzata a DB (AI Search o MDBList)
                 const UserList = require('../models/UserList');
                 catalogMeta = await UserList.findOne({ listId: cat.id }).lean();
            }

            if (catalogMeta) {
                // Fetch limitato (prime 20 posizioni) per fare seeding del DNA veloce e rappresentativo
                const results = await executeUniversalPipeline(
                    catalogMeta, 
                    tmdbClient, 
                    tmdbApiKey, 
                    catalogMeta.type || 'movie', 
                    0, 
                    settings, 
                    { cacheTtlMs: 3600000 } 
                );
                
                if (results && results.length > 0) {
                    allItems = [...allItems, ...results];
                }
            }
        } catch (err) {
            console.warn(`[StremioSync] Failed to resolve catalog ${cat.id || 'unknown'}:`, err.message);
        }
    }
    
    return allItems;
}

async function updateSyncTimestamp(userId, profileId) {
    // 8 hours base + random offset between -2h and +2h (± 120 minutes)
    const randomOffsetMs = (Math.floor(Math.random() * 241) - 120) * 60 * 1000;
    const nextSyncInterval = (8 * 60 * 60 * 1000) + randomOffsetMs;

    const update = {
        $set: {
            'config.lastStremioSync': new Date(),
            'config.nextSyncInterval': nextSyncInterval
        }
    };

    if (profileId !== 'global') {
        update.$set[`profiles.$[elem].settings.lastSync`] = new Date();
    }

    await User.findOneAndUpdate(
        { userId },
        update,
        { 
            arrayFilters: [{ 'elem.id': profileId }],
            returnDocument: 'after' 
        }
    );
}

module.exports = { syncAllStremioData, syncCatalogData };
