/**
 * seeds.js
 *
 * Estrazione pesata dei seed di libreria e cronologia (ex collectRealSeeds).
 * Modulo Libreria (Ticket 15).
 */

const { WatchHistory, UserLibraryItem } = require('./models');

const getLibraryModel = () => (UserLibraryItem.getModel && UserLibraryItem.getModel()) || UserLibraryItem;
const getHistoryModel = () => (WatchHistory.getModel && WatchHistory.getModel()) || WatchHistory;

const SEED_SIGNAL_WEIGHTS = Object.freeze({ loved: 4, liked: 3, watched: 2, library: 1, trakt: 3, dna: 2 });
const SEED_SIGNAL_LIMITS = Object.freeze({ loved: 20, liked: 15, watched: 15, library: 15 });

function toSeedMediaType(type) {
    return (type === 'tv' || type === 'series' || type === 'anime') ? 'tv' : 'movie';
}

function normalizeSeedId(rawId) {
    if (rawId === null || rawId === undefined) return null;
    const id = String(rawId).trim();
    if (!id || ['undefined', 'null', 'nan'].includes(id.toLowerCase())) return null;
    return id;
}

function getSeedTimestamp(...values) {
    for (const value of values) {
        if (!value) continue;
        const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
        if (Number.isFinite(time)) return time;
    }
    return 0;
}

function keepMostRecentSeed(map, id, at) {
    const previous = map.get(id);
    if (previous === undefined || at > previous) map.set(id, at);
}

/**
 * Regola di dominio della porta: un profilo mai sincronizzato resta freddo.
 * La libreria Stremio è a livello di account (UserLibraryItem), mentre la cronologia
 * è specifica per profilo (owner + context).
 * Se il profilo non ha alcuno storico reale registrato in WatchHistory, NON andiamo
 * a leggere gli item di libreria dell'account, garantendo che un profilo secondario
 * o mai sincronizzato rimanga freddo finché non ha vera attività.
 */
function profiloHaCronologiaReale(historyDocs) {
    return Array.isArray(historyDocs) && historyDocs.length > 0;
}

/**
 * Confine di dominio Account: risoluzione dell'addonUuid.
 * L'addonUuid appartiene al dominio Account (UserAccount), non al dominio Libreria.
 * Viene normalmente fornito dall'invocante via oggetto user (`user.uuid` o `user.addonUuid`).
 * In caso di assenza, la libreria tenta il recupero tramite UserAccount come degradazione
 * di compatibilità; se fallisce o non è configurato, degrada a null: la lettura della
 * libreria viene ignorata, ma i semi da cronologia (WatchHistory) rimangono intatti.
 */
async function risolviAddonUuid({ userId, user }) {
    let addonUuid = user?.uuid || user?.addonUuid || null;
    if (!addonUuid && userId) {
        try {
            const { accountDi } = require('../configurazione');
            const account = await accountDi(userId);
            addonUuid = account?.addonUuid || null;
        } catch (_e) {
            addonUuid = null;
        }
    }
    return addonUuid;
}

/**
 * semiDi — Porta di lettura dei seed reali.
 * Contratto invariato rispetto a collectRealSeeds:
 * restituisce { seeds: Map<string, number>, counts: { loved, liked, watched, library } }
 * Pesi: loved 4, liked 3, library 1, watched con decadimento temporale:
 * max(0.20, 0.5^(giorni / 60)).
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} [params.profileId]
 * @param {string} [params.context] - Alias di profileId per compatibilità
 * @param {string} [params.medium] - 'movie' o 'tv'/'series'
 * @param {string} [params.mediaType] - Alias di medium per compatibilità
 * @param {Object} [params.user] - Dati utente opzionali per addonUuid
 */
async function semiDi({ userId, profileId, context, medium, mediaType, user = null }) {
    const ctx = context || profileId || 'global';
    const rawType = medium || mediaType || 'movie';
    const targetType = rawType === 'movie' ? 'movie' : 'tv';

    const buckets = {
        loved: new Map(),
        liked: new Map(),
        watched: new Map(),
        library: new Map()
    };

    let historyDocs = [];
    try {
        const HistoryModel = getHistoryModel();
        historyDocs = await HistoryModel.find({ owner: userId, context: ctx }).lean();
        if (!Array.isArray(historyDocs)) historyDocs = [];
    } catch (_e) {
        historyDocs = [];
    }

    for (const doc of historyDocs) {
        if (toSeedMediaType(doc.type) !== targetType) continue;
        const id = normalizeSeedId(doc.tmdbId);
        if (!id) continue;
        const fallbackAt = getSeedTimestamp(doc.lastWatchedAt, doc.createdAt)
            || (typeof doc.daysAgo === 'number' ? Date.now() - doc.daysAgo * 86400000 : 0);
        const signals = Array.isArray(doc.signals) && doc.signals.length > 0
            ? doc.signals
            : [{ type: 'watched', at: doc.lastWatchedAt, daysAgo: doc.daysAgo }];
        for (const signal of signals) {
            const bucket = buckets[signal?.type];
            if (!bucket) continue;
            const signalAt = getSeedTimestamp(signal.at)
                || (typeof signal.daysAgo === 'number' ? Date.now() - signal.daysAgo * 86400000 : 0);
            keepMostRecentSeed(bucket, id, signalAt || fallbackAt);
        }
    }

    // Regola esplicita: se il profilo non ha cronologia reale, resta freddo (niente lettura libreria)
    if (profiloHaCronologiaReale(historyDocs)) {
        try {
            const addonUuid = await risolviAddonUuid({ userId, user });
            if (addonUuid) {
                const LibraryModel = getLibraryModel();
                const libraryDocs = await LibraryModel.find({
                    addonUuid,
                    removed: { $ne: true },
                    tmdbId: { $exists: true, $ne: null }
                }).lean();
                for (const lib of Array.isArray(libraryDocs) ? libraryDocs : []) {
                    if (toSeedMediaType(lib.type) !== targetType) continue;
                    const id = normalizeSeedId(lib.tmdbId);
                    if (!id) continue;
                    keepMostRecentSeed(buckets.library, id, getSeedTimestamp(lib._mtime, lib.addedAt, lib.createdAt));
                }
            }
        } catch (_e) {}
    }

    const seeds = new Map();
    const counts = { loved: 0, liked: 0, watched: 0, library: 0 };
    const now = Date.now();
    for (const [type, bucket] of Object.entries(buckets)) {
        if (type === 'watched') {
            const selected = [...bucket.entries()].sort((a, b) => b[1] - a[1]);
            counts.watched = selected.length;
            for (const [id, timestamp] of selected) {
                const days = timestamp > 0 ? Math.max(0, (now - timestamp) / 86400000) : Infinity;
                const weight = Math.max(0.20, Math.pow(0.5, days / 60));
                seeds.set(id, (seeds.get(id) || 0) + weight);
            }
        } else {
            const limit = SEED_SIGNAL_LIMITS[type] ?? 0;
            const selected = [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
            counts[type] = selected.length;
            for (const [id] of selected) {
                seeds.set(id, (seeds.get(id) || 0) + SEED_SIGNAL_WEIGHTS[type]);
            }
        }
    }

    return { seeds, counts };
}

const collectRealSeeds = semiDi;

module.exports = {
    semiDi,
    collectRealSeeds,
    profiloHaCronologiaReale,
    risolviAddonUuid,
    SEED_SIGNAL_WEIGHTS,
    SEED_SIGNAL_LIMITS,
    toSeedMediaType,
    normalizeSeedId,
    getSeedTimestamp,
    keepMostRecentSeed
};
