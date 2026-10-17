/**
 * reader.js
 *
 * Porta di lettura del dominio Libreria (Ticket 15).
 * Espone le interrogazioni su libreria, watchlist, cronologia e stato per titolo.
 */

const { WatchHistory, UserLibraryItem } = require('./models');

const getLibraryModel = () => (UserLibraryItem.getModel && UserLibraryItem.getModel()) || UserLibraryItem;
const getHistoryModel = () => (WatchHistory.getModel && WatchHistory.getModel()) || WatchHistory;

const WATCHLIST_PAGE_SIZE = 20;

/**
 * Legge gli elementi della watchlist paginati e ordinati stabilmente.
 *
 * @param {Object} params
 * @param {string} params.addonUuid
 * @param {string} [params.catalogId] - es. 'yaca_watchlist_movies', 'yaca_watchlist_series', 'yaca_watchlist_anime'
 * @param {string} [params.type] - 'movie', 'series', 'anime'
 * @param {number} [params.skip=0]
 * @param {number} [params.limit=WATCHLIST_PAGE_SIZE]
 */
async function leggiWatchlist({ addonUuid, catalogId, type, skip = 0, limit = WATCHLIST_PAGE_SIZE }) {
    let targetType = 'movie';
    if (catalogId === 'yaca_watchlist_movies') {
        targetType = 'movie';
    } else if (catalogId === 'yaca_watchlist_series') {
        targetType = 'series';
    } else if (catalogId === 'yaca_watchlist_anime') {
        targetType = 'anime';
    } else if (type) {
        targetType = type;
    }

    const query = {
        addonUuid,
        removed: false,
        itemId: { $ne: null, $exists: true },
        duplicateOf: null
    };

    if (catalogId === 'yaca_watchlist_anime' || targetType === 'anime') {
        query.$or = [
            { type: 'anime' },
            { itemId: { $regex: /^(kitsu|hanime|anilist):/ } }
        ];
    } else {
        query.type = targetType;
        query.itemId = { $ne: null, $exists: true, $not: { $regex: /^(kitsu|hanime|anilist):/ } };
    }

    return getLibraryModel().find(query)
        .sort({ _mtime: -1, itemId: 1 })
        .skip(skip)
        .limit(limit)
        .lean();
}

/**
 * Legge le informazioni di un singolo titolo in libreria.
 * Restituisce stato, voto/segnali, date (_ctime, _mtime), duplicateOf e stato macchina di conversione (parked*).
 *
 * @param {Object} params
 * @param {string} params.addonUuid
 * @param {string} params.itemId
 */
async function leggiTitolo({ addonUuid, itemId }) {
    if (!addonUuid || !itemId) return null;
    const cleanId = String(itemId).trim();
    const doc = await getLibraryModel().findOne({
        addonUuid,
        $or: [{ itemId: cleanId }, { _id: cleanId }]
    }).lean();

    if (!doc) return null;

    return {
        itemId: doc.itemId,
        type: doc.type,
        name: doc.name,
        state: doc.state || null,
        rating: doc.state?.rating || null,
        flaggedWatched: doc.state?.flaggedWatched ?? null,
        timesWatched: doc.state?.timesWatched ?? null,
        _ctime: doc._ctime,
        _mtime: doc._mtime,
        mapped: doc.mapped,
        tmdbId: doc.tmdbId,
        duplicateOf: doc.duplicateOf || null,
        conversionAttempts: doc.conversionAttempts || 0,
        parkedAt: doc.parkedAt || null,
        parkedReason: doc.parkedReason || null
    };
}

/**
 * Trova il documento UserLibraryItem per ID (per operazioni di aggiornamento/salvataggio/cancellazione).
 */
async function trovaItemLibreria({ addonUuid, itemId }) {
    if (!addonUuid || !itemId) return null;
    const cleanId = String(itemId).trim();
    return getLibraryModel().findOne({
        addonUuid,
        $or: [{ itemId: cleanId }, { _id: cleanId }]
    });
}

/**
 * Salva un nuovo documento UserLibraryItem.
 */
async function salvaItemLibreria(doc) {
    return getLibraryModel().create(doc);
}

/**
 * Marca un elemento come rimosso (soft-delete).
 */
async function marcaRimossoLibreria({ addonUuid, itemId }) {
    const item = await trovaItemLibreria({ addonUuid, itemId });
    if (item) {
        item.removed = true;
        item._mtime = new Date();
        await item.save();
        return item;
    }
    return null;
}

/**
 * Legge l'intera libreria visibile (senza duplicati) per un account.
 */
async function leggiLibreria({ addonUuid, includeDuplicates = false }) {
    if (!addonUuid) return [];
    const query = {
        addonUuid,
        removed: false
    };
    if (!includeDuplicates) {
        query.duplicateOf = null;
    }
    return getLibraryModel().find(query)
        .sort({ _ctime: -1 })
        .lean();
}

/**
 * Conta gli elementi ancora da mappare/convertire per un account.
 */
async function contaDaConvertire({ addonUuid }) {
    if (!addonUuid) return 0;
    return getLibraryModel().countDocuments({
        addonUuid,
        mapped: false,
        removed: false
    });
}

/**
 * Legge la cronologia grezza (WatchHistory) di un profilo.
 */
async function storiaDi({ userId, profileId, limit = null }) {
    const owner = userId;
    const context = profileId || 'global';
    const HistoryModel = getHistoryModel();
    if (!HistoryModel || typeof HistoryModel.find !== 'function') {
        return [];
    }
    let query = HistoryModel.find({ owner, context });
    if (query && typeof query.sort === 'function') {
        query = query.sort({ lastWatchedAt: -1 });
    }
    if (limit && Number.isFinite(limit) && query && typeof query.limit === 'function') {
        query = query.limit(limit);
    }
    return (query && typeof query.lean === 'function') ? query.lean() : (Array.isArray(query) ? query : []);
}

const cronologiaDi = storiaDi;

/**
 * Registra o incrementa una voce nella cronologia di visione.
 */
async function registraVisione({ owner, context, tmdbId, type, episodesWatched = 1, lastWatchedAt = new Date(), source = 'manual' }) {
    const HistoryModel = getHistoryModel();
    if (!tmdbId || !type || !HistoryModel || typeof HistoryModel.findOneAndUpdate !== 'function') return null;
    return HistoryModel.findOneAndUpdate(
        { owner, context, tmdbId },
        { 
            $set: { type, lastWatchedAt, source },
            $inc: { episodesWatched } 
        },
        { upsert: true }
    );
}

/**
 * Esegue il backfill della cronologia da global a un contesto secondario vuoto.
 */
async function backfillCronologia({ owner, targetContext }) {
    const HistoryModel = getHistoryModel();
    if (!owner || !targetContext || targetContext === 'global' || !HistoryModel) return;
    try {
        if (typeof HistoryModel.countDocuments !== 'function' || typeof HistoryModel.find !== 'function') return;
        const count = await HistoryModel.countDocuments({ owner, context: targetContext });
        if (count > 0) return;
        const globalDocsQuery = HistoryModel.find({ owner, context: 'global' });
        const globalDocs = (globalDocsQuery && typeof globalDocsQuery.lean === 'function') ? await globalDocsQuery.lean() : await globalDocsQuery;
        if (!globalDocs || globalDocs.length === 0) return;

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
        if (typeof HistoryModel.bulkWrite === 'function') {
            await HistoryModel.bulkWrite(bulkOps, { ordered: false });
        }
    } catch (err) {
        console.warn(`[Library] Backfill error for ${targetContext}:`, err.message);
    }
}

/**
 * Trova le voci di cronologia per una lista di tmdbId.
 */
async function trovaCronologiaPerIds({ owner, context, tmdbIds }) {
    const HistoryModel = getHistoryModel();
    if (!HistoryModel || typeof HistoryModel.find !== 'function') return [];
    const res = HistoryModel.find({ owner, context, tmdbId: { $in: tmdbIds } });
    return (res && typeof res.lean === 'function') ? res.lean() : res;
}

/**
 * Scrive un batch di operazioni bulk su WatchHistory.
 */
async function scriviBatchCronologia(bulkOps) {
    const HistoryModel = getHistoryModel();
    if (!bulkOps || bulkOps.length === 0 || !HistoryModel || typeof HistoryModel.bulkWrite !== 'function') return null;
    return HistoryModel.bulkWrite(bulkOps, { ordered: false });
}

/**
 * Legge gli elementi della libreria necessari all'estrazione degli studi di produzione.
 */
async function leggiItemPerStudi(addonUuid) {
    const LibraryModel = getLibraryModel();
    if (!addonUuid || !LibraryModel) return [];
    if (LibraryModel.collection && typeof LibraryModel.collection.find === 'function') {
        const cursor = LibraryModel.collection.find({ addonUuid, removed: { $ne: true } });
        if (cursor && typeof cursor.toArray === 'function') {
            return cursor.toArray();
        }
    }
    if (typeof LibraryModel.find === 'function') {
        const res = LibraryModel.find({ addonUuid, removed: { $ne: true } });
        return (res && typeof res.lean === 'function') ? res.lean() : res;
    }
    return [];
}

/**
 * Legge gli elementi della libreria necessari al ricalcolo dei vettori del profilo.
 */
async function leggiLibreriaPerProfilo({ addonUuid }) {
    const LibraryModel = getLibraryModel();
    if (!addonUuid || !LibraryModel || typeof LibraryModel.find !== 'function') return [];
    const res = LibraryModel.find({
        addonUuid,
        removed: { $ne: true },
        tmdbId: { $exists: true, $ne: null }
    });
    return (res && typeof res.lean === 'function') ? res.lean() : res;
}

/**
 * Inizializza gli indici della libreria in sicurezza.
 */
async function ensureLibraryIndexesSafe() {
    const LibraryModel = getLibraryModel();
    if (LibraryModel && typeof LibraryModel.ensureIndexesSafe === 'function') {
        return LibraryModel.ensureIndexesSafe();
    }
}

/**
 * Legge l'ordine personalizzato della libreria per un profilo (Ticket 21).
 *
 * Spostato nel dominio libreria: legge da UserLibraryOrder.
 * Fallback transitorio per una release: se assente in UserLibraryOrder, legge da
 * AddonConfig.profiles.$.raw_ui_state.libraryOrder (dato dell'utente, non si butta).
 *
 * @param {{addonUuid: string, profileId?: string}} params
 * @returns {Promise<string[]>}
 */
async function leggiOrdineLibreria({ addonUuid, profileId = 'global' }) {
    if (!addonUuid) return [];

    try {
        const UserLibraryOrder = require('./models/UserLibraryOrder');
        const orderDoc = await UserLibraryOrder.findOne({ addonUuid, profileId }).lean();
        if (orderDoc && Array.isArray(orderDoc.itemIds) && orderDoc.itemIds.length > 0) {
            return orderDoc.itemIds;
        }

        // Fallback per una release: lettura dal vecchio campo AddonConfig
        const AddonConfig = require('../models/AddonConfig');
        const addonConfig = await AddonConfig.findOne({ uuid: addonUuid }).lean();
        const profile = (addonConfig?.profiles || []).find(p => (p.id || p._id?.toString()) === profileId)
            || (profileId === 'global' ? addonConfig?.profiles?.[0] : null);

        if (profile?.raw_ui_state?.libraryOrder && Array.isArray(profile.raw_ui_state.libraryOrder)) {
            return profile.raw_ui_state.libraryOrder;
        }

        return orderDoc?.itemIds || [];
    } catch (_err) {
        return [];
    }
}

/**
 * Salva l'ordine personalizzato della libreria per un profilo (Ticket 21).
 *
 * Scrive primariamente su UserLibraryOrder.
 * Mantiene la scrittura speculare su AddonConfig durante la release di transizione.
 *
 * @param {{addonUuid: string, profileId?: string, itemIds: string[]}} params
 * @returns {Promise<string[]>}
 */
async function salvaOrdineLibreria({ addonUuid, profileId = 'global', itemIds = [] }) {
    if (!addonUuid) throw new Error('addonUuid obbligatorio per salvare l\'ordine libreria');
    const cleanOrder = [...new Set((itemIds || []).map(String))];

    try {
        const UserLibraryOrder = require('./models/UserLibraryOrder');
        await UserLibraryOrder.findOneAndUpdate(
            { addonUuid, profileId },
            { $set: { itemIds: cleanOrder } },
            { upsert: true, returnDocument: 'after' }
        );
    } catch (err) {
        console.warn('[LibraryReader] Notice on UserLibraryOrder save:', err.message);
    }

    try {
        const AddonConfig = require('../models/AddonConfig');
        await AddonConfig.updateOne(
            { uuid: addonUuid, 'profiles.id': profileId },
            { $set: { 'profiles.$.raw_ui_state.libraryOrder': cleanOrder } }
        );
    } catch (_err) {}

    return cleanOrder;
}

module.exports = {
    WATCHLIST_PAGE_SIZE,
    leggiWatchlist,
    leggiTitolo,
    trovaItemLibreria,
    salvaItemLibreria,
    marcaRimossoLibreria,
    leggiLibreria,
    contaDaConvertire,
    storiaDi,
    cronologiaDi,
    registraVisione,
    backfillCronologia,
    trovaCronologiaPerIds,
    scriviBatchCronologia,
    leggiItemPerStudi,
    leggiLibreriaPerProfilo,
    ensureLibraryIndexesSafe,
    leggiOrdineLibreria,
    salvaOrdineLibreria
};

