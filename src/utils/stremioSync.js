const User = require('../db/models/User');
const { fetchTraktCatalog } = require('../clients/trakt'); // We'll need to extend trakt client for POST
const { stremioClient, stremioLikesClient } = require('../clients/stremio');

const LIKES_ADDON_URL = 'https://likes.stremio.com/addons/liked/movies-shows';
const LOVED_ADDON_URL = 'https://likes.stremio.com/addons/loved/movies-shows';

/**
 * Fetches data from Stremio (Likes, Loves, Library) and syncs to Global Taste Profile.
 * Also pushes new interactions to Trakt.
 */
async function syncAllStremioData(userId, authKey) {
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

        // 3. Update Global Taste Profile via ProfileBuilder
        const ProfileBuilder = require('../profile/ProfileBuilder');
        const user = await User.findOne({ userId });
        await ProfileBuilder.syncStremioData(userId, stremioData, user?.apiKeys?.tmdb);

        // 4. Push to Trakt (Two-Way Sync)
        await pushToTrakt(userId, stremioData);

        // 5. Update lastSync timestamp with randomization logic
        await updateSyncTimestamp(userId);

        console.log(`[StremioSync] Sync completed successfully for user ${userId}`);
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

async function updateSyncTimestamp(userId) {
    // 8 hours base + random offset between -2h and +2h (± 120 minutes)
    const randomOffsetMs = (Math.floor(Math.random() * 241) - 120) * 60 * 1000;
    const nextSyncInterval = (8 * 60 * 60 * 1000) + randomOffsetMs;

    await User.findOneAndUpdate(
        { userId },
        {
            $set: {
                'config.lastStremioSync': new Date(),
                'config.nextSyncInterval': nextSyncInterval
            }
        },
        { returnDocument: 'after' }
    );
}

module.exports = { syncAllStremioData };
