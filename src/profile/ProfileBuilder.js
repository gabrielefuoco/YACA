const TasteProfile = require('../models/TasteProfile');
const WatchHistory = require('../models/WatchHistory');
const AddonConfig = require('../db/models/AddonConfig');
const UserAccount = require('../db/models/UserAccount');
const { extractActiveDNAFromTmdbData, computeFinalDNA, calculateWeightedInteractions } = require('../utils/dnaExtractor');
const { computeTimeDecay, applyLogSaturation, calculateProfileRelevance, calculateFlatnessMetrics } = require('../utils/dnaRarity');

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
     * Ricomputo puro di V_active e V_final dai segnali (funzione pura, niente accumulo incrementale).
     */
    static async _updateAndSaveActiveVectors(owner, context) {
        return ProfileBuilder.recomputeVectorsForUser(owner, context);
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
                const directorsCol = table === 'movies' ? 'directors' : 'created_by AS directors';
                const sql = `SELECT id, genres, keywords, "cast", ${directorsCol}, original_language FROM ${table} WHERE id IN (${chunk.join(',')})`;
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
        const weightMap = new Map(items.map(i => [Number(i.tmdbId), i.weight || 100]));
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
                weight: weightMap.get(Number(row.id)) || 100,
                genre_ids: genres.map(g => g.id || g),
                keyword_ids: keywords.map(k => k.id || k),
                cast_ids: cast.slice(0, 5).map(c => c.id || c),
                director_ids: directors.map(d => d.id || d)
            };
        });
    }

    /**
     * Risolve tutti i contesti attivi per un utente (global + profili AddonConfig).
     */
    static async _resolveAllContexts(owner) {
        const contexts = new Set(['global']);
        try {
            const account = await UserAccount.findOne({ userId: owner }).lean();
            if (account?.addonUuid) {
                const config = await AddonConfig.findOne({ uuid: account.addonUuid }).lean();
                for (const p of (config?.profiles || [])) {
                    if (p.id) contexts.add(p.id);
                }
            }
        } catch (e) {
            console.warn('[ProfileBuilder] Error resolving contexts:', e.message);
        }
        return Array.from(contexts);
    }

    /**
     * Backfill della cronologia/segnali da global a un contesto secondario se vuoto.
     */
    static async backfillProfileWatchHistory(owner, targetContext) {
        if (!owner || !targetContext || targetContext === 'global') return;
        try {
            const count = await WatchHistory.countDocuments({ owner, context: targetContext });
            if (count > 0) return;
            const globalDocs = await WatchHistory.find({ owner, context: 'global' }).lean();
            if (globalDocs.length === 0) return;

            const bulkOps = globalDocs.map(doc => {
                const copy = { ...doc, context: targetContext };
                delete copy._id;
                delete copy.createdAt;
                delete copy.updatedAt;
                return {
                    updateOne: {
                        filter: { owner, context: targetContext, tmdbId: copy.tmdbId },
                        update: { $set: copy },
                        upsert: true
                    }
                };
            });
            await WatchHistory.bulkWrite(bulkOps, { ordered: false });
        } catch (err) {
            console.warn(`[ProfileBuilder] Backfill error for ${targetContext}:`, err.message);
        }
    }

    /**
     * Ricalcola V_active e V_final dai segnali reali (WatchHistory + UserLibraryItem).
     * Pesi: loved 4, liked 3, visto 2, libreria 1.
     */
    static async recomputeVectorsForUser(owner, context) {
        if (!owner || !context) return;
        const profile = await TasteProfile.findOne({ owner, context }).lean();
        if (!profile) return;

        const vStatic = profile.compiledVectors?.V_static || {};

        // 1. Legge cronologia e segnali
        const historyDocs = await WatchHistory.find({ owner, context }).lean();
        const itemMap = new Map(); // tmdbId -> { tmdbId, type, weight }

        for (const doc of historyDocs) {
            const tmdbId = Number(doc.tmdbId);
            if (!tmdbId) continue;
            let weight = 0;
            const signals = doc.signals || [];
            if (signals.length === 0) {
                const decay = computeTimeDecay(doc.lastWatchedAt || doc.createdAt);
                weight = 200 * decay; // default visto (peso 2 con decadimento)
            } else {
                for (const s of signals) {
                    const signalDate = s.at || doc.lastWatchedAt || doc.createdAt;
                    const decay = computeTimeDecay(signalDate);
                    if (s.type === 'loved') weight += 400 * decay;      // loved 4
                    else if (s.type === 'liked') weight += 300 * decay; // liked 3
                    else if (s.type === 'watched') weight += 200 * decay; // visto 2
                    else if (s.type === 'library') weight += 100 * decay; // libreria 1
                }
            }
            if (weight > 0) {
                itemMap.set(tmdbId, { tmdbId, type: doc.type || 'movie', weight });
            }
        }

        // 2. Legge UserLibraryItem dell'account (libreria = peso 100 = 1)
        const addonUuid = await ProfileBuilder._resolveAddonUuid(owner);
        if (addonUuid) {
            try {
                const UserLibraryItem = require('../db/models/UserLibraryItem');
                const libraryDocs = await UserLibraryItem.find({
                    addonUuid,
                    removed: { $ne: true },
                    tmdbId: { $exists: true, $ne: null }
                }).lean();

                for (const lib of libraryDocs) {
                    const tmdbId = Number(lib.tmdbId);
                    if (!tmdbId) continue;
                    const libType = (lib.type === 'series' || lib.type === 'tv') ? 'tv' : 'movie';
                    const decay = computeTimeDecay(lib.addedAt || lib.createdAt);
                    const libWeight = 100 * decay;
                    if (itemMap.has(tmdbId)) {
                        itemMap.get(tmdbId).weight += libWeight;
                    } else {
                        itemMap.set(tmdbId, { tmdbId, type: libType, weight: libWeight });
                    }
                }
            } catch (err) {
                console.warn('[ProfileBuilder] Warning reading UserLibraryItem:', err.message);
            }
        }

        const items = Array.from(itemMap.values());
        if (items.length === 0) return;

        // 3. Estrae metadati da DuckDB locale
        const duckDbDnaData = await ProfileBuilder._fetchDnaItemsFromDuckDb(items);
        const rawActive = {};

        for (const data of duckDbDnaData) {
            const itemDna = extractActiveDNAFromTmdbData(data, 100);
            const relevanceFactor = calculateProfileRelevance(itemDna, vStatic, context);
            const effectiveWeight = (data.weight || 100) * relevanceFactor;
            for (const [key, value] of Object.entries(itemDna)) {
                rawActive[key] = (rawActive[key] || 0) + (value * (effectiveWeight / 100));
            }
        }

        // Anti-flat: saturazione logaritmica per chiave (rendimenti decrescenti)
        const vActive = applyLogSaturation(rawActive, 100);

        const totalInteractions = calculateWeightedInteractions(historyDocs);
        const vFinal = computeFinalDNA(vStatic, vActive, totalInteractions);
        const flatnessMetrics = calculateFlatnessMetrics(vFinal);

        await TasteProfile.updateOne(
            { owner, context },
            {
                $set: {
                    "compiledVectors.V_active": vActive,
                    "compiledVectors.V_final": vFinal,
                    flatnessMetrics
                }
            },
            { upsert: true }
        );
    }

    /**
     * Aggiorna V_active e V_final in background (singolo elemento).
     */
    static async _updateVectorsAsync(owner, context, tmdbId, type) {
        await ProfileBuilder.recomputeVectorsForUser(owner, context);
    }

    /**
     * Aggiorna V_active e V_final in background (bulk elementi).
     */
    static async _bulkUpdateVectorsAsync(owner, context, items) {
        if (!items || items.length === 0) return;
        await ProfileBuilder.recomputeVectorsForUser(owner, context);
    }

    /**
     * Entry point per la sincronizzazione Trakt (ottimizzato Bulk + fasce + dedup Stremio-first + fan-out).
     */
    static async syncUserHistory(owner, context, traktHistory) {
        if (!owner || !traktHistory?.length) return;

        const allContexts = await ProfileBuilder._resolveAllContexts(owner);
        const targetContexts = allContexts.includes(context) ? allContexts : [context, ...allContexts];

        for (const ctx of targetContexts) {
            await ProfileBuilder._updateSyncStatus(owner, ctx, {
                isSyncing: true,
                total: traktHistory.length,
                current: 0
            });
        }

        try {
            const parsedEntries = [];
            for (let i = 0; i < traktHistory.length; i++) {
                const entry = traktHistory[i];
                const tmdbId = entry.movie?.ids?.tmdb || entry.show?.ids?.tmdb;
                const type = entry.movie ? 'movie' : 'tv';
                if (!tmdbId) continue;

                let signalType = 'watched';
                let isRating = false;
                let ratingVal = null;

                if (typeof entry.rating === 'number') {
                    isRating = true;
                    ratingVal = entry.rating;
                    if (entry.rating >= 9) signalType = 'loved';
                    else if (entry.rating >= 7) signalType = 'liked';
                    else if (entry.rating >= 5) signalType = 'watched';
                    else signalType = 'negative';
                }

                parsedEntries.push({
                    tmdbId: Number(tmdbId),
                    type,
                    signalType,
                    isRating,
                    ratingVal,
                    at: entry.watched_at || entry.rated_at || new Date()
                });
            }

            const tmdbIds = [...new Set(parsedEntries.map(e => e.tmdbId))];

            for (const ctx of targetContexts) {
                const existingDocs = await WatchHistory.find({ owner, context: ctx, tmdbId: { $in: tmdbIds } }).lean();
                const existingMap = new Map(existingDocs.map(d => [d.tmdbId, d]));

                const bulkOps = [];
                for (const item of parsedEntries) {
                    const existing = existingMap.get(item.tmdbId);
                    const existingSignals = existing?.signals || [];
                    const hasStremioSignal = existingSignals.some(s => s.source === 'stremio' || s.source?.startsWith('stremio'));

                    // Dedup Stremio-first: se l'item ha già un segnale Stremio, non contare il rating Trakt
                    if (item.isRating && hasStremioSignal) {
                        continue;
                    }

                    const signals = [...existingSignals];
                    if (signals.length === 0 && existing?.source) {
                        signals.push({ type: 'watched', source: existing.source, at: existing.lastWatchedAt || new Date() });
                    }

                    const signalIdx = signals.findIndex(s => s.type === item.signalType && s.source === 'trakt');
                    if (signalIdx >= 0) {
                        signals[signalIdx].at = item.at;
                        if (item.ratingVal !== null) signals[signalIdx].value = item.ratingVal;
                    } else {
                        signals.push({
                            type: item.signalType,
                            source: 'trakt',
                            at: item.at,
                            ...(item.ratingVal !== null ? { value: item.ratingVal } : {})
                        });
                    }

                    bulkOps.push({
                        updateOne: {
                            filter: { owner, context: ctx, tmdbId: item.tmdbId },
                            update: {
                                $set: { type: item.type, lastWatchedAt: item.at, source: 'trakt', signals },
                                $inc: { episodesWatched: 1 }
                            },
                            upsert: true
                        }
                    });
                }

                if (bulkOps.length > 0) {
                    await WatchHistory.bulkWrite(bulkOps, { ordered: false });
                }

                await ProfileBuilder.recomputeVectorsForUser(owner, ctx);
                await ProfileBuilder._updateSyncStatus(owner, ctx, {
                    isSyncing: false,
                    current: traktHistory.length,
                    lastSync: new Date()
                });
            }
        } catch (err) {
            console.error('[ProfileBuilder] Trakt Sync Error:', err.message);
            for (const ctx of targetContexts) {
                await ProfileBuilder._updateSyncStatus(owner, ctx, { isSyncing: false });
            }
        }
    }

    /**
     * Entry point per la sincronizzazione Stremio (ottimizzato Bulk + DuckDB IMDb resolution + fan-out).
     */
    static async syncStremioData(owner, stremioData, context = 'global') {
        if (!owner || !stremioData) return;

        let allItems = [];
        if (Array.isArray(stremioData)) {
            allItems = stremioData.map(item => ({ item, signalType: 'watched', source: 'manual' }));
        } else {
            allItems = [
                ...(stremioData.loved || []).map(item => ({ item, signalType: 'loved', source: 'stremio' })),
                ...(stremioData.liked || []).map(item => ({ item, signalType: 'liked', source: 'stremio' })),
                ...(stremioData.library || []).map(item => ({ item, signalType: 'library', source: 'stremio' }))
            ];
        }

        const allContexts = await ProfileBuilder._resolveAllContexts(owner);
        const targetContexts = allContexts.includes(context) ? allContexts : [context, ...allContexts];

        for (const ctx of targetContexts) {
            await ProfileBuilder._updateSyncStatus(owner, ctx, {
                isSyncing: true,
                total: allItems.length,
                current: 0
            });
        }

        try {
            // 1. Risolve gli ID IMDb (tt...) via DuckDB in-memory a zero chiamate di rete
            const imdbIds = allItems
                .map(({ item }) => String(item.id || item._id || item.itemId || '').trim())
                .filter(id => /^tt\d+$/.test(id));

            let duckDbResolved = {};
            if (imdbIds.length > 0) {
                try {
                    const duckDbStore = require('../db/duckDbStore');
                    duckDbResolved = await duckDbStore.resolveImdbIds(imdbIds);
                } catch (e) {
                    console.warn('[ProfileBuilder] DuckDB resolveImdbIds error:', e.message);
                }
            }

            // 2. Mappa ogni item al proprio tmdbId numerico
            const resolvedItems = [];
            for (const entry of allItems) {
                const { item, signalType, source } = entry;
                const rawId = String(item.id || item._id || item.itemId || '').trim();
                let tmdbId = null;
                let type = (item.type === 'series' || item.type === 'tv') ? 'tv' : 'movie';

                if (/^tt\d+$/.test(rawId)) {
                    if (duckDbResolved[rawId]) {
                        tmdbId = duckDbResolved[rawId].tmdbId;
                        type = duckDbResolved[rawId].type;
                    } else {
                        // Fallback id_cache / Mongo
                        try {
                            const { translateImdbToTmdb } = require('../id_mapping/id_cache');
                            const res = await translateImdbToTmdb(rawId);
                            if (res?.id) {
                                tmdbId = Number(res.id.replace('tmdb:', ''));
                                if (res.type) type = res.type === 'series' ? 'tv' : 'movie';
                            }
                        } catch (_e) {}
                    }
                } else if (/^\d+$/.test(rawId)) {
                    tmdbId = parseInt(rawId, 10);
                } else if (rawId.startsWith('tmdb:')) {
                    const parsed = parseInt(rawId.replace(/^tmdb:/, ''), 10);
                    if (!isNaN(parsed)) tmdbId = parsed;
                }

                if (tmdbId && !isNaN(tmdbId) && tmdbId > 0) {
                    resolvedItems.push({
                        tmdbId,
                        type,
                        signalType,
                        source,
                        at: item._ctime ? new Date(item._ctime) : (item.lastWatched ? new Date(item.lastWatched) : new Date())
                    });
                }
            }

            const tmdbIds = [...new Set(resolvedItems.map(i => i.tmdbId))];

            // 3. Fan-out su tutti i contesti del profilo
            for (const ctx of targetContexts) {
                const existingDocs = await WatchHistory.find({ owner, context: ctx, tmdbId: { $in: tmdbIds } }).lean();
                const existingMap = new Map(existingDocs.map(d => [d.tmdbId, d]));

                const bulkOps = [];
                for (const item of resolvedItems) {
                    const existing = existingMap.get(item.tmdbId);
                    const signals = existing?.signals ? [...existing.signals] : [];
                    if (signals.length === 0 && existing?.source) {
                        signals.push({ type: 'watched', source: existing.source, at: existing.lastWatchedAt || new Date() });
                    }

                    const signalIdx = signals.findIndex(s => s.type === item.signalType && s.source === item.source);
                    if (signalIdx >= 0) {
                        signals[signalIdx].at = item.at;
                    } else {
                        signals.push({ type: item.signalType, source: item.source, at: item.at });
                    }

                    bulkOps.push({
                        updateOne: {
                            filter: { owner, context: ctx, tmdbId: item.tmdbId },
                            update: {
                                $set: { type: item.type, lastWatchedAt: item.at, source: item.source, signals },
                                $inc: { episodesWatched: 1 }
                            },
                            upsert: true
                        }
                    });
                }

                if (bulkOps.length > 0) {
                    await WatchHistory.bulkWrite(bulkOps, { ordered: false });
                }

                // Esegue anche backfill per contesti che non avevano storico
                await ProfileBuilder.backfillProfileWatchHistory(owner, ctx);

                // Ricalcola vettori completi (WatchHistory + UserLibraryItem)
                await ProfileBuilder.recomputeVectorsForUser(owner, ctx);

                await ProfileBuilder._updateSyncStatus(owner, ctx, {
                    isSyncing: false,
                    current: allItems.length,
                    lastSync: new Date()
                });
            }
        } catch (err) {
            console.error('[ProfileBuilder] Stremio Sync Error:', err.message);
            for (const ctx of targetContexts) {
                await ProfileBuilder._updateSyncStatus(owner, ctx, { isSyncing: false });
            }
        }
    }
}

module.exports = ProfileBuilder;
