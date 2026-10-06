/**
 * libraryWatchedService.js
 *
 * Ticket 20 — "Rimuovi titoli visti" dalla Libreria utente.
 *
 * È un'azione utente esplicita e sincrona: NON fa parte del giro batch di
 * `LibraryConverterService` (asincrono) e NON incrocia `WatchHistory`, che è il
 * seme del DNA (svuotarlo azzera il profilo).
 *
 * Regole:
 * 1. Fonte del "visto": solo lo stato Stremio (`state.timesWatched > 0` oppure
 *    `state.flaggedWatched === 1`). Un `WatchHistory` con segnale `watched` non
 *    conta: un film visto al cinema e scrobbilato su Trakt ha `timesWatched == 0`.
 * 2. Serie in corso protette: per le serie Stremio aggiorna `season`/`episode` a
 *    ogni puntata ma alza `timesWatched` solo a serie completata. Quindi "guardare
 *    un episodio" non basta: serve `timesWatched > 0` (completata) oppure
 *    `flaggedWatched === 1` (marcata a mano). La stessa regola vale per gli anime.
 * 3. Scrittura: soft-delete locale (`removed: true`) **più** push a Stremio. Un
 *    `deleteMany` farebbe risuscitare i titoli al sync successivo, perché Stremio
 *    è la fonte e li riscarica.
 * 4. `_mtime` **fresco** (monotono crescente): il merge del datastore Stremio
 *    tiene il nuovo item solo quando `new_item.mtime > item.mtime`
 *    (`stremio-core/src/types/library/library_bucket.rs`). Per una rimozione
 *    bisogna quindi vincere il confronto con un timestamp più recente — l'opposto
 *    del retrodatare usato dal riordino.
 * 5. Duplicati: i documenti secondari (`duplicateOf`) dello stesso titolo seguono
 *    il primario nella rimozione, anche quando è il secondario ad avere lo stato
 *    "visto". L'anteprima conta i titoli visibili, il push copre tutti i record.
 */

const UserLibraryItem = require('../db/models/UserLibraryItem');
const { stremioClient } = require('../clients/stremio');
const LibrarySyncService = require('./LibrarySyncService');
const libraryIdentity = require('../utils/libraryIdentity');

/** Stremio accetta `datastorePut` a blocchi: stesso limite già usato dal riordino. */
const STREMIO_PUSH_CHUNK_SIZE = 100;

/**
 * Chiave identità di un item: la stessa regola di scrittura del sync
 * (`normalizeSyncItemId` → `normalizeLibraryId`). Se il modulo identità non è
 * disponibile in questo processo si ripiega sull'id ripulito dagli spazi: nessun
 * id viene inventato e il confronto resta sui valori reali dell'archivio.
 *
 * @param {*} rawId
 * @returns {string}
 */
function normalizeItemKey(rawId) {
    const raw = String(rawId ?? '').trim();
    if (!raw) return '';
    if (typeof libraryIdentity.normalizeLibraryId !== 'function') return raw;
    return LibrarySyncService.normalizeSyncItemId(raw) || raw;
}

/**
 * Un item è "visto" quando lo stato Stremio lo dice: riproduzione completata
 * (`timesWatched > 0`) o marcatura manuale (`flaggedWatched === 1`).
 *
 * Vale per film, serie e anime: per le serie `timesWatched` è la serie intera,
 * non la singola puntata, quindi la protezione del Continue Watching è intrinseca.
 *
 * @param {Object} item documento di libreria (con `state`)
 * @returns {boolean}
 */
function isWatchedItem(item) {
    const state = item && item.state;
    if (!state || typeof state !== 'object') return false;
    const timesWatched = Number(state.timesWatched);
    if (Number.isFinite(timesWatched) && timesWatched > 0) return true;
    return Number(state.flaggedWatched) === 1;
}

/**
 * Risolve il capostipite di un item seguendo la catena `duplicateOf` (che
 * `applyDuplicateMarks` tiene sempre lunga un salto: secondario → primario).
 * Una catena rotta (primario assente dal set) si ferma all'ultimo documento noto,
 * così il gruppo non viene perso.
 *
 * @param {Object} item
 * @param {Map<string, Object>} byKey
 * @returns {string} chiave del capostipite
 */
function resolveRootKey(item, byKey) {
    let key = normalizeItemKey(item.itemId);
    const visited = new Set();
    while (key && !visited.has(key)) {
        visited.add(key);
        const current = byKey.get(key);
        const parentRaw = current && current.duplicateOf;
        if (!parentRaw) return key;
        const parentKey = normalizeItemKey(parentRaw);
        if (!parentKey || !byKey.has(parentKey)) return key;
        key = parentKey;
    }
    return key;
}

/**
 * Partiziona gli item attivi in titoli visibili e record da rimuovere.
 *
 * - Un gruppo (primario + secondari con `duplicateOf`) è visto se **almeno un**
 *   membro lo è: se lo stato "visto" vive sul duplicato kitsu, sparisce comunque
 *   la card del primario.
 * - `visibleItems` sono i capostipiti dei gruppi visti: è il numero che l'utente
 *   vede sparire dal pannello.
 * - `allItemsToRemove` sono tutti i record dei gruppi visti (inclusi i duplicati
 *   nascosti): sono quelli da soft-deletare e da pushare a Stremio.
 *
 * L'ordine di input è preservato (la griglia è ordinata, l'anteprima deve
 * rispecchiarla).
 *
 * @param {Array<Object>} items documenti attivi (idealmente già filtrati su `removed`)
 * @returns {{visibleItems: Array<Object>, allItemsToRemove: Array<Object>, count: number}}
 */
function findWatchedItems(items = []) {
    const list = (Array.isArray(items) ? items : [])
        .filter(item => item && item.removed !== true && String(item.itemId ?? '').trim());

    const byKey = new Map();
    for (const item of list) {
        const key = normalizeItemKey(item.itemId);
        if (key && !byKey.has(key)) byKey.set(key, item);
    }

    const groups = new Map(); // rootKey → { members: Array<Object>, watched: boolean }
    for (const item of list) {
        const rootKey = resolveRootKey(item, byKey);
        if (!rootKey) continue;
        if (!groups.has(rootKey)) groups.set(rootKey, { members: [], watched: false });
        const group = groups.get(rootKey);
        group.members.push(item);
        if (isWatchedItem(item)) group.watched = true;
    }

    const visibleItems = [];
    const allItemsToRemove = [];
    const emittedRoots = new Set();

    for (const item of list) {
        const rootKey = resolveRootKey(item, byKey);
        const group = rootKey ? groups.get(rootKey) : null;
        if (!group || !group.watched) continue;

        allItemsToRemove.push(item);
        if (rootKey && !emittedRoots.has(rootKey)) {
            emittedRoots.add(rootKey);
            const root = byKey.get(rootKey);
            if (root) visibleItems.push(root);
        }
    }

    return { visibleItems, allItemsToRemove, count: visibleItems.length };
}

/**
 * Legge la libreria attiva di un addon (i soft-deleted non sono più "visti da
 * rimuovere": è la garanzia di idempotenza).
 *
 * @param {String} addonUuid
 * @returns {Promise<Array<Object>>}
 */
function loadActiveLibraryItems(addonUuid) {
    return UserLibraryItem.find({ addonUuid, removed: { $ne: true } }).lean();
}

/**
 * Anteprima read-only: quanti titoli visibili l'azione rimuoverebbe e quali.
 * Non scrive su MongoDB e non chiama Stremio.
 *
 * @param {{addonUuid: String}} params
 * @returns {Promise<{count: number, items: Array<Object>, totalRecords: number}>}
 */
async function previewWatchedLibrary({ addonUuid } = {}) {
    if (!addonUuid) return { count: 0, items: [], totalRecords: 0 };
    const items = await loadActiveLibraryItems(addonUuid);
    const { visibleItems, allItemsToRemove, count } = findWatchedItems(items);
    return { count, items: visibleItems, totalRecords: allItemsToRemove.length };
}

/**
 * Timestamp di rimozione: fresco e strettamente maggiore dell'`_mtime` noto di
 * ogni record toccato, così il merge lato Stremio (`new_item.mtime > item.mtime`)
 * accetta il tombstone. Un solo timestamp per l'intera operazione.
 *
 * @param {Array<Object>} items
 * @returns {Date}
 */
function freshRemovalMtime(items = []) {
    const now = Date.now();
    let latestKnown = 0;
    for (const item of items) {
        const stored = new Date(item && item._mtime ? item._mtime : 0).getTime();
        if (Number.isFinite(stored) && stored > latestKnown) latestKnown = stored;
    }
    return new Date(Math.max(now, latestKnown + 1));
}

/**
 * Esegue l'azione: soft-delete locale di tutti i record dei gruppi visti e push
 * a Stremio a blocchi di 100. Idempotente: se non c'è nulla da rimuovere non
 * scrive e non chiama Stremio.
 *
 * @param {{addonUuid: String, stremioAuthKey?: String}} params
 * @returns {Promise<{success: boolean, count: number, removedItemsCount: number}>}
 */
async function removeWatchedLibrary({ addonUuid, stremioAuthKey } = {}) {
    if (!addonUuid) throw new Error('addonUuid is required');

    const items = await loadActiveLibraryItems(addonUuid);
    const { allItemsToRemove, count } = findWatchedItems(items);
    if (allItemsToRemove.length === 0) {
        return { success: true, count: 0, removedItemsCount: 0 };
    }

    // Gli id locali restano quelli in archivio (il filtro deve agganciarli);
    // il push usa lo stesso id che Stremio conosce, altrimenti il tombstone
    // finirebbe su un documento nuovo e l'originale risusciterebbe al sync.
    const itemIds = [...new Set(allItemsToRemove.map(item => String(item.itemId).trim()).filter(Boolean))];
    const mtime = freshRemovalMtime(allItemsToRemove);

    await UserLibraryItem.updateMany(
        { addonUuid, itemId: { $in: itemIds } },
        { $set: { removed: true, _mtime: mtime } }
    );

    if (stremioAuthKey && itemIds.length > 0) {
        const changes = itemIds.map(itemId => ({ _id: itemId, removed: true, _mtime: mtime }));
        for (let i = 0; i < changes.length; i += STREMIO_PUSH_CHUNK_SIZE) {
            await stremioClient.post('/api/datastorePut', {
                authKey: stremioAuthKey,
                collection: 'libraryItem',
                changes: changes.slice(i, i + STREMIO_PUSH_CHUNK_SIZE)
            }, { timeout: 15000 });
        }
    }

    return { success: true, count, removedItemsCount: allItemsToRemove.length };
}

module.exports = {
    isWatchedItem,
    findWatchedItems,
    previewWatchedLibrary,
    removeWatchedLibrary
};
