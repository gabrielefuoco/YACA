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
                    filter: { addonUuid: user.addonUuid, _id: item._id },
                    update: {
                        $set: {
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
                await UserLibraryItem.bulkWrite(bulkOps);
            }

            // Update sync status
            addonConfig.syncStatus.lastLibrarySync = new Date();
            await addonConfig.save();

            console.log(`[LibrarySync] Sync completed for user ${userId}`);
        } catch (error) {
            console.error(`[LibrarySync] Error syncing library for user ${userId}:`, error.message);
        }
    }
}

module.exports = LibrarySyncService;
