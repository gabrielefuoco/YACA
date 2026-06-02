const TasteProfile = require('../models/TasteProfile');
const WatchHistory = require('../models/WatchHistory');
const AddonConfig = require('../db/models/AddonConfig');
const UserAccount = require('../db/models/UserAccount');
const TmdbScoringData = require('../models/TmdbScoringData');
const { extractActiveDNAFromTmdbData, computeFinalDNA } = require('../utils/dnaExtractor');

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
     * Updates syncStatus in BOTH TasteProfile and AddonConfig concurrently.
     * @param {String} owner - userId of the user
     * @param {String} context - profileId/context of the profile
     * @param {Object} statusUpdate - Fields to set in syncStatus
     */
    static async _updateSyncStatus(owner, context, statusUpdate) {
        try {
            const isSyncing = statusUpdate.isSyncing !== undefined ? statusUpdate.isSyncing : statusUpdate['syncStatus.isSyncing'];
            const total = statusUpdate.total !== undefined ? statusUpdate.total : statusUpdate['syncStatus.total'];
            const current = statusUpdate.current !== undefined ? statusUpdate.current : statusUpdate['syncStatus.current'];
            const lastSync = statusUpdate.lastSync !== undefined ? statusUpdate.lastSync : statusUpdate['syncStatus.lastSync'];

            const cleanStatus = {};
            if (isSyncing !== undefined) cleanStatus.isSyncing = isSyncing;
            if (total !== undefined) cleanStatus.total = total;
            if (current !== undefined) cleanStatus.current = current;
            if (lastSync !== undefined) cleanStatus.lastSync = lastSync;

            // 1. Update TasteProfile syncStatus
            await TasteProfile.updateOne(
                { owner, context },
                { $set: { syncStatus: cleanStatus } },
                { upsert: true }
            );

            // 2. Update AddonConfig syncStatus
            const uuid = await ProfileBuilder._resolveAddonUuid(owner);
            if (uuid) {
                const addonUpdate = {};
                if (isSyncing !== undefined) addonUpdate['syncStatus.isSyncing'] = isSyncing;
                if (total !== undefined) addonUpdate['syncStatus.total'] = total;
                if (current !== undefined) addonUpdate['syncStatus.current'] = current;
                if (lastSync !== undefined) addonUpdate['syncStatus.lastSync'] = lastSync;

                await AddonConfig.updateOne({ uuid }, { $set: addonUpdate });
            }
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

        // --- Delta Update DNA ---
        ProfileBuilder._updateVectorsAsync(owner, context, tmdbId, type).catch(err => {
            console.error('[ProfileBuilder] Delta DNA Error:', err.message);
        });
    }

    /**
     * Esegue in background l'estrazione del DNA dall'item guardato, 
     * lo somma al V_active e ricalcola il V_final.
     */
    static async _updateVectorsAsync(owner, context, tmdbId, type) {
        // Cerca i dati in cache
        const tmdbData = await TmdbScoringData.findOne({ tmdbId, type }).lean();
        if (!tmdbData) return; // Se non abbiamo i dati TMDB pronti in cache, lo farà il sync globale

        const itemDNA = extractActiveDNAFromTmdbData(tmdbData, 100);
        if (Object.keys(itemDNA).length === 0) return;

        const profile = await TasteProfile.findOne({ owner, context }).lean();
        if (!profile) return;

        const vActive = profile.compiledVectors?.V_active || {};
        const vStatic = profile.compiledVectors?.V_static || {};
        
        // Aggiungi pesi al V_active
        for (const [key, value] of Object.entries(itemDNA)) {
            vActive[key] = (vActive[key] || 0) + value;
        }

        // Recuperiamo il conteggio totale dello storico per pesare V_final
        const totalInteractions = await WatchHistory.countDocuments({ owner, context });
        
        const vFinal = computeFinalDNA(vStatic, vActive, totalInteractions);

        await TasteProfile.updateOne(
            { owner, context },
            { 
                $set: { 
                    "compiledVectors.V_active": vActive,
                    "compiledVectors.V_final": vFinal
                } 
            }
        );
    }

    /**
     * Entry point semplificato per la sincronizzazione Trakt.
     * Salva solo i dati grezzi. Il calcolo dei vettori avverrà al prossimo login/refresh del client.
     */
    static async syncUserHistory(owner, context, traktHistory) {
        if (!owner || !traktHistory?.length) return;

        await ProfileBuilder._updateSyncStatus(owner, context, {
            isSyncing: true,
            total: traktHistory.length,
            current: 0
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
                    await ProfileBuilder._updateSyncStatus(owner, context, {
                        current: i + 1
                    });
                }
            }

            await ProfileBuilder._updateSyncStatus(owner, context, {
                isSyncing: false,
                lastSync: new Date()
            });
        } catch (err) {
            console.error('[ProfileBuilder] Trakt Sync Error:', err.message);
            await ProfileBuilder._updateSyncStatus(owner, context, { isSyncing: false });
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

        await ProfileBuilder._updateSyncStatus(owner, context, {
            isSyncing: true,
            total: allItems.length,
            current: 0
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
                    await ProfileBuilder._updateSyncStatus(owner, context, {
                        current: i + 1
                    });
                }
            }

            await ProfileBuilder._updateSyncStatus(owner, context, {
                isSyncing: false,
                lastSync: new Date()
            });
        } catch (err) {
            console.error('[ProfileBuilder] Stremio Sync Error:', err.message);
            await ProfileBuilder._updateSyncStatus(owner, context, { isSyncing: false });
        }
    }
}

module.exports = ProfileBuilder;
