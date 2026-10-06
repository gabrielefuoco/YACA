const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const UserLibraryItem = require('../db/models/UserLibraryItem');
const { stremioClient } = require('../clients/stremio');
const { isAnimeContent } = require('../utils/animeIdentity');
const { resolvePoster } = require('../utils/posterResolver');
const { normalizeLegacyPosterHost, normalizeLibraryId } = require('../utils/libraryIdentity');
const { refreshLibraryPoster } = require('../utils/libraryPosterRefresh');
let animeMappingStore = null;
try {
    animeMappingStore = require('../data/animeMappingStore');
} catch (_e) {
    animeMappingStore = null;
}

function extractGenreIdsFromItem(item) {
    if (!item) return [];
    if (Array.isArray(item.genre_ids) && item.genre_ids.length > 0) {
        return item.genre_ids;
    }
    const rawGenres = item.genres || item.genre;
    if (Array.isArray(rawGenres)) {
        return rawGenres.map(g => {
            if (typeof g === 'number') return g;
            if (typeof g === 'object' && g !== null && g.id) return g.id;
            if (typeof g === 'string') {
                const lower = g.toLowerCase().trim();
                if (lower === 'animation' || lower === 'animazione') return 16;
            }
            return g;
        });
    }
    if (typeof rawGenres === 'string') {
        const parts = rawGenres.split(',').map(s => s.trim().toLowerCase());
        if (parts.includes('animation') || parts.includes('animazione')) {
            return [16];
        }
    }
    return [];
}

function extractTmdbIdFromItem(item) {
    if (!item) return null;
    if (item.tmdbId) return String(item.tmdbId);
    if (item._tmdbId) return String(item._tmdbId);
    const rawId = String(item.itemId || item._id || item.id || '').trim();
    if (/^\d+$/.test(rawId)) return rawId;
    if (rawId.startsWith('tmdb:')) {
        const parts = rawId.split(':');
        if (/^\d+$/.test(parts[1])) return parts[1];
        if (parts.length > 2 && /^\d+$/.test(parts[2])) return parts[2];
    }
    return null;
}

function classifySyncItemType(item, resolvedTmdbId = null, mappingStore = animeMappingStore) {
    if (!item) return 'series';
    if (item.type === 'anime') return 'anime';

    const rawId = String(item.itemId || item._id || item.id || '').trim();
    if (rawId.startsWith('kitsu:') || rawId.startsWith('anilist:') || rawId.startsWith('hanime:')) {
        return 'anime';
    }

    const effectiveTmdbId = resolvedTmdbId || extractTmdbIdFromItem(item);
    const genreIds = extractGenreIdsFromItem(item);
    const originalLanguage = item.original_language || item.originalLanguage || item._originalLanguage;
    const rawGenres = item.genres || item.genre;
    const keywords = item.keywords || (Array.isArray(rawGenres) ? rawGenres : (typeof rawGenres === 'string' ? rawGenres.split(',') : []));

    const isAnime = isAnimeContent({
        tmdbId: effectiveTmdbId,
        genreIds,
        originalLanguage,
        keywords,
        mappingStore
    });

    if (isAnime) {
        return 'anime';
    }

    return item.type || 'series';
}

class LibrarySyncService {
    /**
     * Impedisce che una sincronizzazione degradi una copertina già presente.
     *
     * Gli upsert scrivono `poster: <risolto> || null`: se la risoluzione non trova
     * nulla (nessuna corrispondenza nel parquet locale e nessun client TMDB), il
     * valore salvato diventerebbe `null`, cancellando una copertina buona già in
     * archivio. Qui, a ops già costruite e con una sola query, ripristiniamo la
     * copertina esistente quando la nuova sarebbe vuota. Se invece la nuova
     * copertina è valorizzata, vince quella (migliora il dato, non lo degrada).
     *
     * @param {String} addonUuid
     * @param {Array} bulkOps ops nel formato `{ updateOne: { filter, update, upsert } }`
     * @returns {Promise<number>} quante copertine sono state preservate
     */
    static async preserveExistingPosters(addonUuid, bulkOps = []) {
        if (!addonUuid || bulkOps.length === 0) return 0;

        const ids = bulkOps
            .map(op => op?.updateOne?.filter?.itemId)
            .filter(id => typeof id === 'string' && id.length > 0);
        if (ids.length === 0) return 0;

        try {
            const existing = await UserLibraryItem
                .find({ addonUuid, itemId: { $in: ids }, poster: { $nin: [null, ''] } }, { itemId: 1, poster: 1 })
                .lean();

            if (!existing || existing.length === 0) return 0;

            const posterByItemId = new Map(
                existing
                    .filter(doc => doc && doc.itemId && typeof doc.poster === 'string' && doc.poster.trim().length > 0)
                    .map(doc => [String(doc.itemId), doc.poster])
            );
            if (posterByItemId.size === 0) return 0;

            let preserved = 0;
            for (const op of bulkOps) {
                const setId = String(op?.updateOne?.filter?.itemId || '');
                const set = op?.updateOne?.update?.$set;
                if (!setId || !set || !('poster' in set)) continue;
                if (set.poster) continue; // copertina nuova valida: la teniamo
                const previous = posterByItemId.get(setId);
                if (previous) {
                    set.poster = previous;
                    preserved++;
                }
            }

            if (preserved > 0) {
                console.log(`[LibrarySync] Copertine preservate da sovrascrittura: ${preserved}`);
            }
            return preserved;
        } catch (err) {
            console.warn('[LibrarySync] Preservazione copertine non-fatale:', err.message);
            return 0;
        }
    }

    /**
     * Id normalizzato per la scrittura: la stessa regola che l'app usa in lettura.
     * Se l'id non è normalizzabile (vuoto) si torna alla stringa grezza, così
     * nessun id viene inventato.
     *
     * @param {*} rawId
     * @returns {string}
     */
    static normalizeSyncItemId(rawId) {
        const raw = String(rawId ?? '').trim();
        if (!raw) return '';
        return normalizeLibraryId(raw) || raw;
    }

    /**
     * Aggancia i documenti già in archivio che hanno l'identificativo nella forma
     * sporca (spazi, maiuscole): li rinomina nella forma normalizzata, così
     * l'upsert del giro li aggiorna invece di crearne un duplicato.
     *
     * Va chiamata PRIMA del bulkWrite. Se il documento normalizzato esiste già
     * non si tocca nulla: le due forme in archivio sono un caso di duplicato che
     * spetta a `applyDuplicateMarks` (che segnala ma non cancella).
     *
     * @param {String} addonUuid
     * @param {Array} items item in arrivo da Stremio (con `_id`)
     * @returns {Promise<number>} quanti documenti sono stati rinominati
     */
    static async repairStoredItemIds(addonUuid, items = []) {
        if (!addonUuid) return 0;

        // id normalizzato → varianti sporche da agganciare (serve solo se diverse)
        const dirtyVariants = new Map();
        const addVariant = (value) => {
            // Il confronto è con la stringa ORIGINALE: uno `itemId: "tt0095327 "` è
            // sporco anche se lo `trim()` lo rende identico a quello normalizzato.
            const original = String(value ?? '');
            if (!original.trim()) return;
            const normalized = LibrarySyncService.normalizeSyncItemId(original);
            if (!normalized || normalized === original) return;
            if (!dirtyVariants.has(normalized)) dirtyVariants.set(normalized, new Set());
            dirtyVariants.get(normalized).add(original);
        };
        for (const item of (Array.isArray(items) ? items : [])) addVariant(item?._id ?? item?.itemId);

        // Letture e scritture passano dalla collection grezza: il modello non applica
        // le projection come qui (restituirebbe solo `_id`) e su questi documenti
        // l'`_id` può essere una stringa, che il modello casterebbe a ObjectId.
        const raw = UserLibraryItem.collection;
        const findIds = (itemIds) => raw
            .find({ addonUuid, itemId: { $in: itemIds } }, { projection: { itemId: 1 } })
            .toArray();

        // Gli id sporchi già in archivio entrano nello stesso piano: il giro sistema
        // anche quelli che Stremio non ha più rimandato, finché restano agganciabili.
        try {
            const storedDocs = await raw.find({ addonUuid }, { projection: { itemId: 1 } }).toArray();
            for (const doc of storedDocs) addVariant(doc?.itemId);
        } catch (err) {
            console.warn('[LibrarySync] Lettura id in archivio non-fatale:', err.message);
        }
        if (dirtyVariants.size === 0) return 0;

        let repaired = 0;
        for (const [normalized, variants] of dirtyVariants) {
            const candidates = Array.from(variants).sort();
            const stored = await findIds([...candidates, normalized]);

            if (stored.some(doc => doc && doc.itemId === normalized)) continue;

            // Solo il primo: le altre varianti sporche (se ci sono) restano in archivio
            // e vengono marcate come duplicate dal sync, non si uniscono a caso.
            const target = stored.find(doc => doc && doc.itemId && doc.itemId !== normalized);
            if (!target) continue;

            await raw.updateOne({ addonUuid, itemId: target.itemId }, { $set: { itemId: normalized } });
            repaired += 1;
        }

        if (repaired > 0) {
            console.log(`[LibrarySync] Identificativi normalizzati in archivio: ${repaired}`);
        }
        return repaired;
    }

    /**
     * Riscrive nelle ops le copertine che puntano a un host ritirato (vecchio HF
     * Space, vecchio nome tailnet) verso l'host corrente, con la stessa regola già
     * usata in lettura.
     *
     * Serve perché Stremio conserva in libreria gli URL così come sono: senza
     * normalizzare qui in scrittura, ogni giro di sync rimetterebbe in archivio le
     * copertine vecchie e annullerebbe la riparazione del giro precedente. Solo
     * `poster` viene riscritto: sfondo e logo restano come arrivano. Le copertine
     * di host esterni (TMDB, Kitsu, TVDB, easyratingsdb) non sono host legacy e
     * restano intatte.
     *
     * @param {Array} bulkOps ops nel formato `{ updateOne: { filter, update, upsert } }`
     * @returns {Promise<number>} quante copertine sono state riscritte
     */
    static async normalizeSyncPosterHosts(bulkOps = []) {
        if (!Array.isArray(bulkOps) || bulkOps.length === 0) return 0;
        const currentHost = process.env.HOST_URL;
        if (!currentHost) return 0;

        let normalized = 0;
        for (const op of bulkOps) {
            const set = op?.updateOne?.update?.$set;
            if (!set || typeof set.poster !== 'string' || !set.poster.trim()) continue;
            const fixed = normalizeLegacyPosterHost(set.poster, currentHost);
            if (fixed && fixed !== set.poster) {
                set.poster = fixed;
                normalized++;
            }
        }

        if (normalized > 0) {
            console.log(`[LibrarySync] Copertine normalizzate sull'host corrente: ${normalized}`);
        }
        return normalized;
    }

    /**
     * Riallinea le copertine COMPOSTE che Stremio ha in libreria.
     *
     * IL PROBLEMA CHE RISOLVE: per un item convertito, Stremio in libreria non ha l'URL
     * di TMDB ma l'URL che YACA stessa le ha spinto (`/images/poster/<tipo>/<id>/<episodio>/<versione>`).
     * Copiarlo verbatim — che è quello che fa la creazione delle ops — non cambia niente:
     * sarebbe la stessa URL vecchia, con la stessa versione, quindi l'immagine resta ferma
     * per sempre (era il caso degli item a `/ITA/23`). Qui il valore viene ricalcolato:
     * versione corrente nel percorso, sorgenti annidate risolte, `t` dei composti statici
     * riallineato all'`mtime` del file (vedi `src/utils/libraryPosterRefresh.js`).
     *
     * Vale per TUTTI gli item in arrivo, anche per i `mapped: true` che il convertitore
     * non visita più: il sync li rilegge a ogni giro.
     *
     * @param {Array} bulkOps ops nel formato `{ updateOne: { filter, update, upsert } }`
     * @returns {Promise<number>} quante copertine sono state riallineate
     */
    static async refreshSyncPosters(bulkOps = []) {
        if (!Array.isArray(bulkOps) || bulkOps.length === 0) return 0;

        let refreshed = 0;
        for (const op of bulkOps) {
            const set = op?.updateOne?.update?.$set;
            if (!set || typeof set.poster !== 'string' || !set.poster.trim()) continue;
            const fixed = refreshLibraryPoster(set.poster, { hostUrl: process.env.HOST_URL });
            if (fixed && fixed !== set.poster) {
                set.poster = fixed;
                refreshed++;
            }
        }

        if (refreshed > 0) {
            console.log(`[LibrarySync] Copertine composte riallineate: ${refreshed}`);
        }
        return refreshed;
    }

    /**
     * Confronta due item di libreria per l'elezione del primario tra duplicati.
     * Criteri in ordine di priorità:
     * 1. Non-rimosso prima: un documento attivo (removed: false / falsy) vince su uno rimosso (removed: true).
     * 2. Mappato prima: un documento già mappato con successo (mapped: true) vince su uno non mappato.
     * 3. Preferenza identificatore: gli ID IMDb (tt...) e gli item con risoluzione canonica hanno la precedenza per compatibilità Stremio.
     * 4. Più recente: timestamp Stremio (_ctime o _mtime più recente vince).
     * 5. Tie-breaker deterministico su itemId (localeCompare) per evitare instabilità/saltellamenti.
     *
     * @param {Object} a
     * @param {Object} b
     * @returns {number}
     */
    static compareLibraryItemsForPrimary(a, b) {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;

        // 1. Non-rimosso prima
        const aRemoved = Boolean(a.removed);
        const bRemoved = Boolean(b.removed);
        if (aRemoved !== bRemoved) {
            return aRemoved ? 1 : -1;
        }

        // 2. Mappato prima
        const aMapped = Boolean(a.mapped);
        const bMapped = Boolean(b.mapped);
        if (aMapped !== bMapped) {
            return bMapped ? 1 : -1;
        }

        // 3. Preferenza identificatore: IMDb (tt...) e canonico
        const aKey = String(a.itemId || a._id || a.itemKey || '');
        const bKey = String(b.itemId || b._id || b.itemKey || '');
        const aIsImdb = /^tt\d+/i.test(aKey);
        const bIsImdb = /^tt\d+/i.test(bKey);
        const aPref = (a.canonical ? 1 : 0) + (aIsImdb ? 1 : 0);
        const bPref = (b.canonical ? 1 : 0) + (bIsImdb ? 1 : 0);
        if (aPref !== bPref) {
            return bPref - aPref;
        }

        // 4. Timestamp più recente (_ctime o _mtime)
        const aTime = new Date(a._ctime || a._mtime || a.updatedAt || 0).getTime() || 0;
        const bTime = new Date(b._ctime || b._mtime || b.updatedAt || 0).getTime() || 0;
        if (aTime !== bTime) {
            return bTime - aTime;
        }

        // 5. Spareggio deterministico su itemId
        return aKey.localeCompare(bKey);
    }

    /**
     * Elegge l'item primario tra un gruppo di candidati duplicati.
     * @param {Array<Object>} candidates
     * @returns {Object|null}
     */
    static electPrimaryLibraryItem(candidates = []) {
        if (!Array.isArray(candidates) || candidates.length === 0) return null;
        const sorted = [...candidates].sort(LibrarySyncService.compareLibraryItemsForPrimary);
        return sorted[0];
    }

    /**
     * Consolida e deduplica gli elementi della libreria per un dato addonUuid.
     * Riconcilia documenti legacy senza itemId con i record unificati, mantenendo il record più ricco.
     *
     * @param {String} addonUuid
     * @returns {Promise<number>} numero di duplicati rimossi
     */
    static async deduplicateUserLibrary(addonUuid) {
        if (!addonUuid) return 0;
        try {
            // Priorità al documento da tenere: prima i NON rimossi (`removed: 1` con `false` prima di `true`),
            // poi i mappati, poi i più recenti. Senza `removed` in testa si rischiava di tenere
            // un documento rimosso ed eliminare quello che l'utente vede in libreria.
            const rawItems = await UserLibraryItem.find({ addonUuid }).sort({ removed: 1, mapped: -1, _mtime: -1 });
            const items = Array.isArray(rawItems) ? [...rawItems].sort(LibrarySyncService.compareLibraryItemsForPrimary) : [];
            const seen = new Map();
            const toDeleteIds = [];
            const legacyIds = [];

            for (const item of items) {
                const key = String(item.itemId || item._id).trim();
                if (!key) continue;

                if (seen.has(key)) {
                    toDeleteIds.push(item._id);
                } else {
                    seen.set(key, item);
                    if (!item.itemId) legacyIds.push(item._id);
                }
            }

            // I documenti legacy hanno `_id` di tipo String, mentre lo schema non dichiara `_id`
            // (mongoose assume ObjectId): ogni scrittura/filtro via modello verrebbe castato e
            // quindi NON toccherebbe nulla, in silenzio. Si passa dalla collection grezza, che
            // lavora sui valori reali (stringhe o ObjectId indifferentemente).
            const raw = UserLibraryItem.collection;

            if (legacyIds.length > 0) {
                await raw.updateMany(
                    { _id: { $in: legacyIds } },
                    [{ $set: { itemId: { $toString: '$_id' } } }]
                );
            }

            if (toDeleteIds.length > 0) {
                await raw.deleteMany({ _id: { $in: toDeleteIds } });
            }

            if (toDeleteIds.length > 0 || legacyIds.length > 0) {
                console.log(`[LibrarySync] Libreria consolidata per ${addonUuid}: ${toDeleteIds.length} duplicati rimossi, ${legacyIds.length} itemId assegnati`);
            }
            return toDeleteIds.length;
        } catch (err) {
            console.warn('[LibrarySync] Deduplicazione libreria non-fatale:', err.message);
            return 0;
        }
    }

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

            // Lookup batch per risolvere eventuali imdbId (Cinemeta tt...) in tmdbId
            const imdbIds = items
                .map(i => i._id)
                .filter(id => typeof id === 'string' && /^tt\d+$/.test(id));
            const imdbMap = new Map();
            if (imdbIds.length > 0) {
                try {
                    const ImdbToTmdbMapping = require('../db/models/ImdbToTmdbMapping');
                    const mappings = await ImdbToTmdbMapping.find({ imdbId: { $in: imdbIds } }).lean();
                    for (const m of mappings) {
                        if (m.imdbId && m.tmdbId) {
                            imdbMap.set(m.imdbId, String(m.tmdbId).replace(/^tmdb:/i, '').split(':')[0]);
                        }
                    }
                } catch (err) {
                    console.warn('[LibrarySync] ImdbToTmdbMapping batch lookup failed:', err.message);
                }
            }

            await LibrarySyncService.deduplicateUserLibrary(user.addonUuid);

            // Gli id che Stremio conserva come arrivano (`tmdb: 12477 `) vengono
            // normalizzati in scrittura: prima si aggancia il documento già in
            // archivio (rinominandolo), poi l'upsert lo aggiorna senza duplicarlo.
            await LibrarySyncService.repairStoredItemIds(user.addonUuid, items);

            const bulkOps = await Promise.all(items.map(async item => {
                const itemId = LibrarySyncService.normalizeSyncItemId(item._id);
                const resolvedTmdbId = imdbMap.get(item._id) || (item.tmdbId ? String(item.tmdbId) : null);
                const finalType = classifySyncItemType(item, resolvedTmdbId);
                let poster = item.poster;
                if (!poster) {
                    poster = await resolvePoster({
                        itemId: item._id,
                        tmdbId: resolvedTmdbId,
                        type: finalType,
                        name: item.name
                    });
                }

                const updateFields = {
                    itemId,
                    type: finalType,
                    name: item.name,
                    poster: poster || null,
                    posterShape: item.posterShape,
                    background: item.background,
                    logo: item.logo,
                    year: item.year,
                    removed: item.removed,
                    temp: item.temp,
                    _ctime: item._ctime,
                    _mtime: item._mtime,
                    state: item.state
                };
                if (resolvedTmdbId && !isNaN(Number(resolvedTmdbId))) {
                    updateFields.tmdbId = Number(resolvedTmdbId);
                }

                return {
                    updateOne: {
                        filter: { addonUuid: user.addonUuid, itemId },
                        update: { $set: updateFields },
                        upsert: true
                    }
                };
            }));

            if (bulkOps.length > 0) {
                // Ordine: prima si ripristina la copertina già in archivio quando quella in
                // arrivo è vuota, POI la si ripara/riallinea. Al contrario un poster
                // ripristinato (spento su Stremio, `resolvePoster` a vuoto) salterebbe sia
                // la normalizzazione dell'host sia il refresh dei composti, restando
                // stantio per sempre.
                await LibrarySyncService.preserveExistingPosters(user.addonUuid, bulkOps);
                await LibrarySyncService.normalizeSyncPosterHosts(bulkOps);
                await LibrarySyncService.refreshSyncPosters(bulkOps);
                await UserLibraryItem.bulkWrite(bulkOps, { ordered: false });
            }

            // Lo stesso titolo può arrivare con id diversi (tt… / tmdb:… / kitsu:…):
            // marchiamo i duplicati così dashboard e cataloghi ne mostrano uno solo.
            const { applyDuplicateMarks } = require('../utils/libraryIdentity');
            await applyDuplicateMarks(user.addonUuid);

            // Update sync status
            addonConfig.syncStatus.lastLibrarySync = new Date();
            await addonConfig.save();

            console.log(`[LibrarySync] Sync completed for user ${userId}`);
        } catch (error) {
            console.error(`[LibrarySync] Error syncing library for user ${userId}:`, error.message);
        }
    }

    /**
     * Sincronizza la watchlist Trakt dell'utente e la salva in locale in UserLibraryItem.
     * @param {String} userId - L'ID dell'utente in UserAccount.
     */
    static async syncTraktLibraryForUser(userId) {
        const user = await UserAccount.findOne({ userId });
        if (!user || !user.apiKeys || !user.apiKeys.trakt) {
            return;
        }

        const addonConfig = await AddonConfig.findOne({ uuid: user.addonUuid });
        if (!addonConfig) return;

        try {
            await LibrarySyncService.deduplicateUserLibrary(user.addonUuid);

            const { traktClient } = require('../clients/trakt');
            console.log(`[LibrarySync] Fetching Trakt library for user ${userId}...`);
            const [moviesRes, showsRes] = await Promise.allSettled([
                traktClient.get('/sync/watchlist/movies', {
                    headers: { 'Authorization': `Bearer ${user.apiKeys.trakt}` }
                }),
                traktClient.get('/sync/watchlist/shows', {
                    headers: { 'Authorization': `Bearer ${user.apiKeys.trakt}` }
                })
            ]);

            const bulkOps = [];
            if (moviesRes.status === 'fulfilled' && Array.isArray(moviesRes.value?.data)) {
                for (const entry of moviesRes.value.data) {
                    const m = entry.movie;
                    if (!m) continue;
                    const itemId = m.ids?.imdb || (m.ids?.tmdb ? `tmdb:${m.ids.tmdb}` : null);
                    if (!itemId) continue;
                    const tmdbId = m.ids?.tmdb || null;
                    const finalType = classifySyncItemType({
                        ...m,
                        itemId,
                        type: 'movie',
                        genres: m.genres,
                        originalLanguage: m.language
                    }, tmdbId ? String(tmdbId) : null);

                    const poster = await resolvePoster({
                        itemId,
                        tmdbId,
                        type: finalType,
                        name: m.title
                    });

                    bulkOps.push({
                        updateOne: {
                            filter: { addonUuid: user.addonUuid, itemId },
                            update: {
                                $set: {
                                    itemId,
                                    type: finalType,
                                    name: m.title,
                                    poster: poster || null,
                                    year: m.year,
                                    tmdbId: tmdbId || null,
                                    _mtime: entry.listed_at ? new Date(entry.listed_at).getTime() : Date.now(),
                                    removed: false
                                }
                            },
                            upsert: true
                        }
                    });
                }
            }

            if (showsRes.status === 'fulfilled' && Array.isArray(showsRes.value?.data)) {
                for (const entry of showsRes.value.data) {
                    const s = entry.show;
                    if (!s) continue;
                    const itemId = s.ids?.imdb || (s.ids?.tmdb ? `tmdb:${s.ids.tmdb}` : null);
                    if (!itemId) continue;
                    const tmdbId = s.ids?.tmdb || null;
                    const finalType = classifySyncItemType({
                        ...s,
                        itemId,
                        type: 'series',
                        genres: s.genres,
                        originalLanguage: s.language
                    }, tmdbId ? String(tmdbId) : null);

                    const poster = await resolvePoster({
                        itemId,
                        tmdbId,
                        type: finalType,
                        name: s.title
                    });

                    bulkOps.push({
                        updateOne: {
                            filter: { addonUuid: user.addonUuid, itemId },
                            update: {
                                $set: {
                                    itemId,
                                    type: finalType,
                                    name: s.title,
                                    poster: poster || null,
                                    year: s.year,
                                    tmdbId: tmdbId || null,
                                    _mtime: entry.listed_at ? new Date(entry.listed_at).getTime() : Date.now(),
                                    removed: false
                                }
                            },
                            upsert: true
                        }
                    });
                }
            }

            if (bulkOps.length > 0) {
                await LibrarySyncService.preserveExistingPosters(user.addonUuid, bulkOps);
                await UserLibraryItem.bulkWrite(bulkOps, { ordered: false });
            }

            console.log(`[LibrarySync] Trakt sync completed for user ${userId} (${bulkOps.length} items)`);
        } catch (error) {
            console.error(`[LibrarySync] Error syncing Trakt library for user ${userId}:`, error.message);
        }
    }
}

LibrarySyncService.classifySyncItemType = classifySyncItemType;

module.exports = LibrarySyncService;
