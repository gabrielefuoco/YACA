const TasteProfile = require('../models/TasteProfile');
const {
    storiaDi,
    leggiLibreriaPerProfilo,
    registraVisione,
    backfillCronologia,
    trovaCronologiaPerIds,
    scriviBatchCronologia
} = require('../library');
const AddonConfig = require('../models/AddonConfig');
const { accountDi } = require('../configurazione');

class ProfileBuilder {
    /**
     * Resolves the addon UUID for a given owner (userId).
     * @param {String} owner - userId of the user
     * @returns {Promise<String|null>} The addon UUID, or null if not found
     */
    static async _resolveAddonUuid(owner) {
        try {
            const account = await accountDi(owner);
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

        await registraVisione({
            owner,
            context,
            tmdbId,
            type,
            episodesWatched,
            lastWatchedAt,
            source
        });
    }

    static async _updateAndSaveActiveVectors() {
        return { vActive: {}, vFinal: {}, flatnessMetrics: null, scritto: false };
    }

    /**
     * Risolve tutti i contesti attivi per un utente (global + profili AddonConfig).
     */
    static async _resolveAllContexts(owner) {
        const contexts = new Set(['global']);
        try {
            const account = await accountDi(owner);
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
        await backfillCronologia({ owner, targetContext });
    }

    static async recomputeVectorsForUser(_owner, _context, _options = {}) {
        return {
            vActive: {},
            vFinal: {},
            flatnessMetrics: null,
            scritto: false
        };
    }

    static async _updateVectorsAsync() {}

    static async _bulkUpdateVectorsAsync() {}

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
                const existingDocs = await trovaCronologiaPerIds({ owner, context: ctx, tmdbIds });
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
                    await scriviBatchCronologia(bulkOps);
                }

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
                    const { resolveImdbIds } = require('../indice');
                    duckDbResolved = await resolveImdbIds(imdbIds);
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
                        // Fallback idMapping / Mongo
                        try {
                            const { translateImdbToTmdb } = require('../clients');
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
                const existingDocs = await trovaCronologiaPerIds({ owner, context: ctx, tmdbIds });
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
                    await scriviBatchCronologia(bulkOps);
                }

                // Esegue anche backfill per contesti che non avevano storico
                await ProfileBuilder.backfillProfileWatchHistory(owner, ctx);

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
