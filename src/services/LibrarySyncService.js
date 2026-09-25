const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const UserLibraryItem = require('../db/models/UserLibraryItem');
const { stremioClient } = require('../clients/stremio');
const { isAnimeContent } = require('../utils/animeIdentity');
const { resolvePoster } = require('../utils/posterResolver');
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
            const items = await UserLibraryItem.find({ addonUuid }).sort({ removed: 1, mapped: -1, _mtime: -1 });
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

            const bulkOps = await Promise.all(items.map(async item => {
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
                    itemId: item._id,
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
                        filter: { addonUuid: user.addonUuid, itemId: item._id },
                        update: { $set: updateFields },
                        upsert: true
                    }
                };
            }));

            if (bulkOps.length > 0) {
                await LibrarySyncService.preserveExistingPosters(user.addonUuid, bulkOps);
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
