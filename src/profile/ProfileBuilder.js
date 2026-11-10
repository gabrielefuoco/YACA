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

        // Una copia sola. Prima si scriveva in OGNI contesto dell'account (profili vecchi,
        // profili di test, cinque modalità): lo stesso titolo diventava quindici documenti,
        // ognuno con il proprio contatore gonfiato a ogni sync.
        const { contestoCronologia } = require('../library/reader');
        const contestoUnico = contestoCronologia(context);
        const targetContexts = [contestoUnico];

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
     * I dati di visione che Stremio dichiara davvero su un elemento di libreria.
     *
     * Stremio mette `state.lastWatched` (ISO) e `state.timesWatched` (numero). Il codice
     * precedente li ignorava e scriveva `new Date()` e `+1` a ogni sync: da lì sono nate
     * cronologie con 30360 «visioni» e titoli «visti oggi». Qui si legge, non si inventa.
     *
     * @param {object} item elemento della libreria Stremio
     * @returns {{ultima: Date|null, conteggio: number|null}}
     */
    static datiVisioneDaStremio(item) {
        const stato = item && typeof item.state === 'object' && item.state !== null ? item.state : {};
        const candidata = stato.lastWatched || item?.lastWatched || null;
        const data = candidata ? new Date(candidata) : null;
        const ultima = data && !Number.isNaN(data.getTime()) ? data : null;

        const grezzo = stato.timesWatched ?? item?.timesWatched;
        const numero = Number(grezzo);
        const conteggio = Number.isFinite(numero) && numero >= 0 ? numero : null;

        return { ultima, conteggio };
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

        // Una copia sola. Prima si scriveva in OGNI contesto dell'account (profili vecchi,
        // profili di test, cinque modalità): lo stesso titolo diventava quindici documenti,
        // ognuno con il proprio contatore gonfiato a ogni sync.
        const { contestoCronologia } = require('../library/reader');
        const contestoUnico = contestoCronologia(context);
        const targetContexts = [contestoUnico];

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
                    const datiVisione = ProfileBuilder.datiVisioneDaStremio(item);
                    resolvedItems.push({
                        tmdbId,
                        type,
                        signalType,
                        source,
                        // Solo una data che la sorgente dichiara. `_ctime` è quando il titolo è
                        // entrato in libreria, non una visione: usarlo farebbe sembrare visto
                        // oggi ciò che è stato solo aggiunto. Se non c'è, resta `null`.
                        at: datiVisione.ultima,
                        // Il conteggio vero delle visioni, quando Stremio lo dichiara.
                        visioniDichiarate: datiVisione.conteggio
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

                    const signalIdx = signals.findIndex(s => s.type === item.signalType && s.source === item.source);
                    if (signalIdx >= 0) {
                        // Un segnale senza data non sovrascrive una data vera già registrata.
                        if (item.at) signals[signalIdx].at = item.at;
                    } else {
                        signals.push({
                            type: item.signalType,
                            source: item.source,
                            ...(item.at ? { at: item.at } : {})
                        });
                    }

                    // Le visioni si CONTANO dai segnali di visione, non si incrementano a ogni
                    // sincronizzazione: con `$inc: 1` il numero cresceva di uno per sync fino a
                    // valori impossibili (30360 visioni di un titolo), e l'interfaccia li mostrava.
                    const visioniDaiSegnali = new Set(
                        signals
                            .filter(s => s && s.type === 'watched' && s.at)
                            .map(s => new Date(s.at).getTime())
                    ).size;
                    // Se Stremio dichiara un conteggio, quello vince: è un dato suo, non una
                    // nostra deduzione. Altrimenti si contano i segnali di visione.
                    const visioniReali = Number.isFinite(item.visioniDichiarate) && item.visioniDichiarate !== null
                        ? Math.max(visioniDaiSegnali, item.visioniDichiarate)
                        : visioniDaiSegnali;

                    const setOperazione = {
                        type: item.type,
                        source: item.source,
                        signals,
                        episodesWatched: Math.max(1, visioniReali)
                    };
                    // `lastWatchedAt` si tocca solo quando c'è una data vera: prima ogni sync lo
                    // portava a «adesso» anche per un titolo solo messo in libreria.
                    if (item.at) setOperazione.lastWatchedAt = item.at;
                    else if (!existing) setOperazione.lastWatchedAt = new Date();

                    bulkOps.push({
                        updateOne: {
                            filter: { owner, context: ctx, tmdbId: item.tmdbId },
                            update: { $set: setOperazione },
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
