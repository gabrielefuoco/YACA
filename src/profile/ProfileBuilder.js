const TasteProfile = require('../models/TasteProfile');
const WatchHistory = require('../models/WatchHistory');
const AddonConfig = require('../db/models/AddonConfig');
const UserAccount = require('../db/models/UserAccount');

class ProfileBuilder {
    /**
     * Resolves the addon UUID for a given owner (userId).
     * @param {String} owner - userId of the user
     * @returns {Promise<String|null>} The addon UUID, or null if not found
     */
    static async _resolveAddonUuid(owner) {
        try {
            const account = await UserAccount.findOne({ userId: owner }).lean();
            return account?.addonUuid || null;
        } catch (err) {
            console.warn('[ProfileBuilder] Failed to resolve addonUuid:', err.message);
            return null;
        }
    }

    /**
     * Updates syncStatus in AddonConfig using the anonymous UUID join.
     * @param {String} owner - userId of the user
     * @param {Object} statusUpdate - Fields to $set in syncStatus
     */
    static async _updateSyncStatus(owner, statusUpdate) {
        try {
            const uuid = await ProfileBuilder._resolveAddonUuid(owner);
            if (!uuid) return;
            await AddonConfig.updateOne(
                { uuid },
                { $set: statusUpdate }
            );
        } catch (err) {
            console.warn('[ProfileBuilder] Failed to update sync status:', err.message);
        }
    }

    /**
     * Aggiunge o aggiorna un elemento nella cronologia di visione (WatchHistory).
     * Non effettua calcoli di scoring (delegati al client).
     */
    static async appendToHistory(owner, context, item) {
        const { tmdbId, type, episodesWatched = 1, lastWatchedAt = new Date(), source = 'manual' } = item;
        
        if (!tmdbId || !type) return;

        await WatchHistory.findOneAndUpdate(
            { owner, context, tmdbId },
            { 
                $set: { type, lastWatchedAt, source },
                $inc: { episodesWatched: episodesWatched } 
            },
            { upsert: true }
        );
    }

    /**
     * Entry point semplificato per la sincronizzazione Trakt.
     * Salva solo i dati grezzi. Il calcolo dei vettori avverrà al prossimo login/refresh del client.
     */
    static async syncUserHistory(owner, context, traktHistory) {
        if (!owner || !traktHistory?.length) return;

        await ProfileBuilder._updateSyncStatus(owner, {
            'syncStatus.isSyncing': true,
            'syncStatus.total': traktHistory.length,
            'syncStatus.current': 0
        });

        try {
            for (let i = 0; i < traktHistory.length; i++) {
                const entry = traktHistory[i];
                const tmdbId = entry.movie?.ids?.tmdb || entry.show?.ids?.tmdb;
                const type = entry.movie ? 'movie' : 'tv';
                
                if (tmdbId) {
                    await ProfileBuilder.appendToHistory(owner, context, {
                        tmdbId,
                        type,
                        lastWatchedAt: entry.watched_at || new Date(),
                        source: 'trakt',
                        episodesWatched: type === 'tv' ? 1 : 1 // Su Trakt ogni entry è spesso un episodio o un play
                    });
                }

                if (i % 20 === 0) {
                    await ProfileBuilder._updateSyncStatus(owner, {
                        'syncStatus.current': i + 1
                    });
                }
            }

            await ProfileBuilder._updateSyncStatus(owner, {
                'syncStatus.isSyncing': false,
                'syncStatus.lastSync': new Date()
            });
        } catch (err) {
            console.error('[ProfileBuilder] Trakt Sync Error:', err.message);
            await ProfileBuilder._updateSyncStatus(owner, { 'syncStatus.isSyncing': false });
        }
    }

    /**
     * Entry point semplificato per la sincronizzazione Stremio.
     * Salva i metadati grezzi (Liked/Library) in WatchHistory per il VSM.
     */
    static async syncStremioData(owner, stremioData, context = 'global') {
        if (!owner || !stremioData) return;

        let allItems = [];
        if (Array.isArray(stremioData)) {
            allItems = stremioData.map(item => ({ item, source: 'manual' }));
        } else {
            allItems = [
                ...(stremioData.loved || []).map(item => ({ item, source: 'stremio' })),
                ...(stremioData.liked || []).map(item => ({ item, source: 'stremio' })),
                ...(stremioData.library || []).map(item => ({ item, source: 'stremio' }))
            ];
        }

        await ProfileBuilder._updateSyncStatus(owner, {
            'syncStatus.isSyncing': true,
            'syncStatus.total': allItems.length,
            'syncStatus.current': 0
        });

        try {
            for (let i = 0; i < allItems.length; i++) {
                const { item, source } = allItems[i];
                const tmdbId = item.id || item._id; // Assumiamo siano già stati tradotti o siano TMDB
                const type = item.type === 'series' ? 'tv' : 'movie';

                if (tmdbId && !isNaN(tmdbId)) {
                    await ProfileBuilder.appendToHistory(owner, context, {
                        tmdbId: parseInt(tmdbId),
                        type,
                        lastWatchedAt: new Date(),
                        source
                    });
                }

                if (i % 20 === 0) {
                    await ProfileBuilder._updateSyncStatus(owner, {
                        'syncStatus.current': i + 1
                    });
                }
            }

            await ProfileBuilder._updateSyncStatus(owner, {
                'syncStatus.isSyncing': false,
                'syncStatus.lastSync': new Date()
            });
        } catch (err) {
            console.error('[ProfileBuilder] Stremio Sync Error:', err.message);
            await ProfileBuilder._updateSyncStatus(owner, { 'syncStatus.isSyncing': false });
        }
    }
}

module.exports = ProfileBuilder;
