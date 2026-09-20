const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const UserLibraryItem = require('../db/models/UserLibraryItem');
const { stremioClient } = require('../clients/stremio');

class LibrarySyncService {
    /**
     * Sincronizza la libreria Stremio dell'utente e la salva in locale.
     * @param {String} userId - L'ID dell'utente in UserAccount.
     */
    static async syncLibraryForUser(userId) {
        const user = await UserAccount.findOne({ userId });
        if (!user || !user.apiKeys || !user.apiKeys.stremio) {
            console.warn(`[LibrarySync] No Stremio API key for user ${userId}`);
            return;
        }

        const addonConfig = await AddonConfig.findOne({ uuid: user.addonUuid });
        if (!addonConfig) return;

        try {
            console.log(`[LibrarySync] Fetching library for user ${userId}...`);
            const response = await stremioClient.post('/api/datastoreGet', {
                authKey: user.apiKeys.stremio,
                collection: 'libraryItem',
                all: true
            });

            if (!response.data || !response.data.result) {
                console.error(`[LibrarySync] Invalid response from Stremio for user ${userId}`);
                return;
            }

            const items = response.data.result;
            console.log(`[LibrarySync] Found ${items.length} items for user ${userId}`);

            const bulkOps = items.map(item => ({
                updateOne: {
                    filter: { addonUuid: user.addonUuid, itemId: item._id },
                    update: {
                        $set: {
                            itemId: item._id,
                            type: item.type,
                            name: item.name,
                            poster: item.poster,
                            posterShape: item.posterShape,
                            background: item.background,
                            logo: item.logo,
                            year: item.year,
                            removed: item.removed,
                            temp: item.temp,
                            _ctime: item._ctime,
                            _mtime: item._mtime,
                            state: item.state
                        }
                    },
                    upsert: true
                }
            }));

            if (bulkOps.length > 0) {
                await UserLibraryItem.bulkWrite(bulkOps, { ordered: false });
            }

            // Update sync status
            addonConfig.syncStatus.lastLibrarySync = new Date();
            await addonConfig.save();

            console.log(`[LibrarySync] Sync completed for user ${userId}`);
        } catch (error) {
            console.error(`[LibrarySync] Error syncing library for user ${userId}:`, error.message);
        }
    }

    /**
     * Sincronizza la watchlist Trakt dell'utente e la salva in locale in UserLibraryItem.
     * @param {String} userId - L'ID dell'utente in UserAccount.
     */
    static async syncTraktLibraryForUser(userId) {
        const user = await UserAccount.findOne({ userId });
        if (!user || !user.apiKeys || !user.apiKeys.trakt) {
            return;
        }

        const addonConfig = await AddonConfig.findOne({ uuid: user.addonUuid });
        if (!addonConfig) return;

        try {
            const { traktClient } = require('../clients/trakt');
            console.log(`[LibrarySync] Fetching Trakt library for user ${userId}...`);
            const [moviesRes, showsRes] = await Promise.allSettled([
                traktClient.get('/sync/watchlist/movies', {
                    headers: { 'Authorization': `Bearer ${user.apiKeys.trakt}` }
                }),
                traktClient.get('/sync/watchlist/shows', {
                    headers: { 'Authorization': `Bearer ${user.apiKeys.trakt}` }
                })
            ]);

            const bulkOps = [];
            if (moviesRes.status === 'fulfilled' && Array.isArray(moviesRes.value?.data)) {
                for (const entry of moviesRes.value.data) {
                    const m = entry.movie;
                    if (!m) continue;
                    const itemId = m.ids?.imdb || (m.ids?.tmdb ? `tmdb:${m.ids.tmdb}` : null);
                    if (!itemId) continue;
                    bulkOps.push({
                        updateOne: {
                            filter: { addonUuid: user.addonUuid, itemId },
                            update: {
                                $set: {
                                    itemId,
                                    type: 'movie',
                                    name: m.title,
                                    year: m.year,
                                    tmdbId: m.ids?.tmdb || null,
                                    _mtime: entry.listed_at ? new Date(entry.listed_at).getTime() : Date.now(),
                                    removed: false
                                }
                            },
                            upsert: true
                        }
                    });
                }
            }

            if (showsRes.status === 'fulfilled' && Array.isArray(showsRes.value?.data)) {
                for (const entry of showsRes.value.data) {
                    const s = entry.show;
                    if (!s) continue;
                    const itemId = s.ids?.imdb || (s.ids?.tmdb ? `tmdb:${s.ids.tmdb}` : null);
                    if (!itemId) continue;
                    bulkOps.push({
                        updateOne: {
                            filter: { addonUuid: user.addonUuid, itemId },
                            update: {
                                $set: {
                                    itemId,
                                    type: 'series',
                                    name: s.title,
                                    year: s.year,
                                    tmdbId: s.ids?.tmdb || null,
                                    _mtime: entry.listed_at ? new Date(entry.listed_at).getTime() : Date.now(),
                                    removed: false
                                }
                            },
                            upsert: true
                        }
                    });
                }
            }

            if (bulkOps.length > 0) {
                await UserLibraryItem.bulkWrite(bulkOps, { ordered: false });
            }

            console.log(`[LibrarySync] Trakt sync completed for user ${userId} (${bulkOps.length} items)`);
        } catch (error) {
            console.error(`[LibrarySync] Error syncing Trakt library for user ${userId}:`, error.message);
        }
    }
}

module.exports = LibrarySyncService;
