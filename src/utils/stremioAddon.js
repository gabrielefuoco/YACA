const { stremioClient, stremioLikesClient } = require('../clients/stremio');
const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const { executeUniversalPipeline } = require('../catalog/providers/AiDiscoveryProvider');
const { createTmdbClient } = require('../clients/tmdb');
const { getPresets } = require('../data/presets');
const { isAllowedUrl } = require('./helpers');

const ADDON_ID = 'org.stremio.yaca.catalog';
const STREMIO_TIMEOUT = 10000;
const LIKES_ADDON_URL = 'https://likes.stremio.com/addons/liked/movies-shows';
const LOVED_ADDON_URL = 'https://likes.stremio.com/addons/loved/movies-shows';
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function validateAndNormalizeSafeId(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return SAFE_ID_REGEX.test(trimmed) ? trimmed : null;
}

function validateManifestUrl(manifestUrl) {
    if (typeof manifestUrl !== 'string') return false;
    try {
        const parsed = new URL(manifestUrl);
        if (!parsed.pathname.endsWith('/manifest.json')) return false;

        const explicitHost = process.env.HOST_URL || process.env.RENDER_EXTERNAL_URL;
        const spaceHost = process.env.SPACE_HOST ? `https://${process.env.SPACE_HOST}` : null;
        const localDefault = 'http://localhost:7000';
        const allowedOrigin = explicitHost || spaceHost || localDefault;
        const allowedHost = new URL(allowedOrigin).hostname;

        return isAllowedUrl(parsed.href, [allowedHost]);
    } catch (_e) {
        return false;
    }
}

async function updateStremioAddonCollection(authKey, manifestUrl) {
    if (!validateManifestUrl(manifestUrl)) {
        return { success: false, error: 'URL manifest non consentito' };
    }

    const getRes = await stremioClient.post('/api/addonCollectionGet', {
        type: 'AddonCollectionGet',
        authKey,
        update: true,
        addFromURL: []
    }, { timeout: STREMIO_TIMEOUT });

    const addons = getRes.data?.result?.addons;
    if (!addons || !Array.isArray(addons)) {
        return { success: false, error: 'Impossibile recuperare la collezione addon' };
    }

    const existingIdx = addons.findIndex(a => a.manifest?.id === ADDON_ID);
    const manifestRes = await stremioClient.get(manifestUrl, { timeout: STREMIO_TIMEOUT });
    const manifest = manifestRes.data;

    if (existingIdx !== -1) {
        addons[existingIdx].transportUrl = manifestUrl;
        addons[existingIdx].manifest = manifest;
    } else {
        addons.push({
            transportUrl: manifestUrl,
            transportName: 'http',
            manifest,
            flags: { official: false, protected: false }
        });
    }

    const setRes = await stremioClient.post('/api/addonCollectionSet', {
        type: 'AddonCollectionSet',
        authKey,
        addons
    }, { timeout: STREMIO_TIMEOUT });

    if (setRes.data?.result?.success) {
        return { success: true };
    }
    return { success: false, error: setRes.data?.result?.error || 'Errore aggiornamento collezione' };
}

async function syncAllStremioData(userId, authKey, profileId = 'global') {
    const safeUserId = validateAndNormalizeSafeId(userId);
    const safeProfileId = validateAndNormalizeSafeId(profileId) || 'global';
    if (!safeUserId) {
        return { success: false, error: 'Invalid user id' };
    }

    try {
        console.log(`[StremioSync] Starting full sync for user ${safeUserId}...`);

        const addonKeyRes = await stremioLikesClient.get(`/getAddonKey?key=${authKey}`);
        const addonKey = addonKeyRes.data;
        if (!addonKey) throw new Error('Failed to retrieve Stremio AddonKey');

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
            library
        };

        const ProfileBuilder = require('../profile/ProfileBuilder');
        const account = await UserAccount.findOne({ userId: safeUserId }).lean();
        const tmdbKey = account?.apiKeys?.tmdb;

        const addonConfig = account?.addonUuid
            ? await AddonConfig.findOne({ uuid: account.addonUuid }).lean()
            : null;

        if (safeProfileId === 'global') {
            await ProfileBuilder.syncStremioData(safeUserId, stremioData, 'global');
        } else {
            const profile = (addonConfig?.profiles || []).find(p => p.id === safeProfileId);
            if (profile) {
                console.log(`[StremioSync] Resolving catalogs for profile ${profile.name || safeProfileId}...`);
                const catalogItems = await syncCatalogData(profile.catalogs, tmdbKey, profile.settings || {});
                const formattedData = { liked: catalogItems, loved: [], library: [] };
                await ProfileBuilder.syncStremioData(safeUserId, formattedData, safeProfileId);
            }
        }

        if (safeProfileId === 'global') {
            await pushToTrakt(safeUserId, stremioData);
        }
        await updateSyncTimestamp(safeUserId, safeProfileId);

        const TasteProfile = require('../models/TasteProfile');
        const updatedProfile = await TasteProfile.findOne({ owner: safeUserId, context: safeProfileId });

        console.log(`[StremioSync] Sync completed successfully for user ${safeUserId} (${safeProfileId})`);
        return { success: true, profile: updatedProfile };
    } catch (error) {
        console.error(`[StremioSync] Error syncing data for user ${safeUserId}:`, error.message);
        return { success: false, error: error.message };
    }
}

async function fetchStremioCatalog(baseUrl, addonKey, type, catalogId) {
    try {
        const url = `${baseUrl}/user=${addonKey}/catalog/${type}/${catalogId}.json`;
        const res = await stremioLikesClient.get(url, { timeout: STREMIO_TIMEOUT });
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
    const safeUserId = validateAndNormalizeSafeId(userId);
    if (!safeUserId) return;

    const account = await UserAccount.findOne({ userId: safeUserId }).lean();
    const traktToken = account?.apiKeys?.trakt;
    if (!traktToken) return;

    const { syncTraktRatings } = require('../clients/trakt');

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

    const allPresets = getPresets();
    const presetMap = new Map(allPresets.map(p => [p.id, p]));
    const tmdbClient = createTmdbClient(tmdbApiKey);

    let allItems = [];
    for (const cat of catalogs) {
        if (cat.items && Array.isArray(cat.items) && cat.items.length > 0) {
            allItems = [...allItems, ...cat.items];
            continue;
        }

        try {
            const baseId = (cat.id || '').startsWith('yaca_preset_') ? cat.id.replace('yaca_preset_', '') : (cat.id || '');
            const safeListId = validateAndNormalizeSafeId(cat.id || '');
            let catalogMeta = presetMap.get(baseId);

            if (!catalogMeta && safeListId) {
                const UserList = require('../models/UserList');
                catalogMeta = await UserList.findOne({ listId: safeListId }).lean();
            }

            if (catalogMeta) {
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
    const safeUserId = validateAndNormalizeSafeId(userId);
    if (!safeUserId) return;

    const safeProfileId = validateAndNormalizeSafeId(profileId) || 'global';
    const randomOffsetMs = (Math.floor(Math.random() * 241) - 120) * 60 * 1000;
    const nextSyncInterval = (8 * 60 * 60 * 1000) + randomOffsetMs;

    const account = await UserAccount.findOne({ userId: safeUserId }).lean();
    if (!account?.addonUuid) return;

    const update = {
        $set: {
            'config.lastStremioSync': new Date(),
            'config.nextSyncInterval': nextSyncInterval
        }
    };

    if (safeProfileId !== 'global') {
        update.$set[`profiles.$[elem].settings.lastSync`] = new Date();
    }

    await AddonConfig.findOneAndUpdate(
        { uuid: account.addonUuid },
        update,
        {
            arrayFilters: [{ 'elem.id': safeProfileId }],
            returnDocument: 'after'
        }
    );
}

module.exports = {
    updateStremioAddonCollection,
    syncAllStremioData
};
