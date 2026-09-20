const TasteProfile = require('../models/TasteProfile');
const WatchHistory = require('../models/WatchHistory');
const AddonConfig = require('../db/models/AddonConfig');
const UserAccount = require('../db/models/UserAccount');
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
    static async _updateAndSaveActiveVectors(owner, context, dnaList) {
        const profile = await TasteProfile.findOne({ owner, context }).lean();
        if (!profile) return;

        const vActive = profile.compiledVectors?.V_active || {};
        const vStatic = profile.compiledVectors?.V_static || {};

        for (const itemDNA of dnaList) {
            for (const [key, value] of Object.entries(itemDNA)) {
                vActive[key] = (vActive[key] || 0) + value;
            }
        }

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
     * Recupera i dati DNA per una lista di elementi da DuckDB locale.
     */
    static async _fetchDnaItemsFromDuckDb(items) {
        if (!items || items.length === 0) return [];
        const duckDbStore = require('../db/duckDbStore');

        const movieItems = items.filter(i => !i.type || i.type === 'movie');
        const tvItems = items.filter(i => i.type === 'tv' || i.type === 'series');

        const queryTable = async (table, targetItems) => {
            const ids = [...new Set(targetItems.map(i => Number(i.tmdbId)).filter(id => !isNaN(id) && id > 0))];
            if (ids.length === 0) return [];

            const chunkSize = 500;
            let rows = [];
            for (let i = 0; i < ids.length; i += chunkSize) {
                const chunk = ids.slice(i, i + chunkSize);
                const sql = `SELECT id, genres, keywords, "cast", directors, original_language FROM ${table} WHERE id IN (${chunk.join(',')})`;
                try {
                    const res = await duckDbStore.query(sql);
                    if (res && res.length > 0) rows.push(...res);
                } catch (err) {
                    console.warn(`[ProfileBuilder] Errore query DuckDB per ${table}:`, err.message);
                }
            }
            return rows;
        };

        const [movieRows, tvRows] = await Promise.all([
            queryTable('movies', movieItems),
            queryTable('tv', tvItems)
        ]);

        const allRows = [...movieRows, ...tvRows];
        return allRows.map(row => {
            let genres = [];
            let keywords = [];
            let cast = [];
            let directors = [];
            try { if (row.genres) genres = typeof row.genres === 'string' ? JSON.parse(row.genres) : row.genres; } catch(e){}
            try { if (row.keywords) keywords = typeof row.keywords === 'string' ? JSON.parse(row.keywords) : row.keywords; } catch(e){}
            try { if (row.cast) cast = typeof row.cast === 'string' ? JSON.parse(row.cast) : row.cast; } catch(e){}
            try { if (row.directors) directors = typeof row.directors === 'string' ? JSON.parse(row.directors) : row.directors; } catch(e){}

            return {
                tmdbId: Number(row.id),
                genre_ids: genres.map(g => g.id || g),
                keyword_ids: keywords.map(k => k.id || k),
                cast_ids: cast.slice(0, 5).map(c => c.id || c),
                director_ids: directors.map(d => d.id || d)
            };
        });
    }

    /**
     * Aggiorna V_active e V_final in background (singolo elemento).
     */
    static async _updateVectorsAsync(owner, context, tmdbId, type) {
        await ProfileBuilder._bulkUpdateVectorsAsync(owner, context, [{ tmdbId, type }]);
    }

    /**
     * Aggiorna V_active e V_final in background (bulk elementi).
     */
    static async _bulkUpdateVectorsAsync(owner, context, items) {
        if (!items || items.length === 0) return;

        // 1. Prelievo DNA primario da DuckDB
        const duckDbDnaData = await ProfileBuilder._fetchDnaItemsFromDuckDb(items);
        const dnaList = duckDbDnaData.map(data => extractActiveDNAFromTmdbData(data, 100));

        if (dnaList.length > 0) {
            await ProfileBuilder._updateAndSaveActiveVectors(owner, context, dnaList);
        }
    }

    /**
     * Entry point per la sincronizzazione Trakt (ottimizzato Bulk).
     */
    static async syncUserHistory(owner, context, traktHistory) {
        if (!owner || !traktHistory?.length) return;

        await ProfileBuilder._updateSyncStatus(owner, context, {
            isSyncing: true,
            total: traktHistory.length,
            current: 0
        });

        try {
            const bulkOps = [];
            const itemsForDna = [];

            for (let i = 0; i < traktHistory.length; i++) {
                const entry = traktHistory[i];
                const tmdbId = entry.movie?.ids?.tmdb || entry.show?.ids?.tmdb;
                const type = entry.movie ? 'movie' : 'tv';
                
                if (tmdbId) {
                    bulkOps.push({
                        updateOne: {
                            filter: { owner, context, tmdbId },
                            update: { 
                                $set: { type, lastWatchedAt: entry.watched_at || new Date(), source: 'trakt' },
                                $inc: { episodesWatched: 1 } 
                            },
                            upsert: true
                        }
                    });
                    itemsForDna.push({ tmdbId, type });
                }
            }

            if (bulkOps.length > 0) {
                // Batch write to DB
                await WatchHistory.bulkWrite(bulkOps, { ordered: false });
                await ProfileBuilder._updateSyncStatus(owner, context, { current: traktHistory.length });
                // Bulk DNA Extraction
                await ProfileBuilder._bulkUpdateVectorsAsync(owner, context, itemsForDna);
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
     * Entry point per la sincronizzazione Stremio (ottimizzato Bulk).
     */
    static async syncStremioData(owner, stremioData, context = 'global') {
        if (!owner || !stremioData) return;

        let allItems;
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
            const bulkOps = [];
            const itemsForDna = [];

            for (let i = 0; i < allItems.length; i++) {
                const { item, source } = allItems[i];
                const tmdbId = item.id || item._id;
                const type = item.type === 'series' ? 'tv' : 'movie';

                if (tmdbId && !isNaN(tmdbId)) {
                    bulkOps.push({
                        updateOne: {
                            filter: { owner, context, tmdbId: parseInt(tmdbId) },
                            update: { 
                                $set: { type, lastWatchedAt: new Date(), source },
                                $inc: { episodesWatched: 1 } 
                            },
                            upsert: true
                        }
                    });
                    itemsForDna.push({ tmdbId: parseInt(tmdbId), type });
                }
            }

            if (bulkOps.length > 0) {
                // Batch write to DB
                await WatchHistory.bulkWrite(bulkOps, { ordered: false });
                await ProfileBuilder._updateSyncStatus(owner, context, { current: allItems.length });
                // Bulk DNA Extraction
                await ProfileBuilder._bulkUpdateVectorsAsync(owner, context, itemsForDna);
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
