const UserLibraryItem = require('../db/models/UserLibraryItem');
const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const { stremioClient } = require('../clients/stremio');
const { createTmdbClient } = require('../clients/tmdb');
const { sanitizeCatalogMeta } = require('../catalog/formatters/StremioFormatter');
const { buildStremioLibraryPayload } = require('../utils/stremioAddon');
const duckDbStore = require('../db/duckDbStore');
const { resolvePoster, TMDB_IMAGE_BASE } = require('../utils/posterResolver');
const LibrarySyncService = require('./LibrarySyncService');
const { selectConvertibleItems } = require('./libraryConversionAdmission');
const { resolveTmdbIdentity } = require('./libraryIdentityResolution');
const {
    decideConversionOutcome,
    applyConversionOutcome,
    buildConversionState,
    summarizeUnresolvedRun
} = require('./libraryConversionOutcome');

// La mappatura Kitsu→TMDB che l'app già tiene in memoria (Anibridge + Fribb,
// ~8.2k chiavi, aggiornata da sola): qui è solo una lettura, nessuna rete e
// nessuna nuova fonte. Se il modulo non è disponibile, gli item Kitsu restano
// non risolti — non si finge niente.
let animeMappingStore = null;
try {
    animeMappingStore = require('../data/animeMappingStore');
} catch (_e) {
    animeMappingStore = null;
}

/** TMDB id di un Kitsu id, dalla mappatura condivisa. `null` se assente o store non pronto. */
function lookupKitsuIdInMapping(kitsuId) {
    if (!animeMappingStore) return null;
    try {
        const mapped = typeof animeMappingStore.resolveTmdbFromKitsu === 'function'
            ? animeMappingStore.resolveTmdbFromKitsu(kitsuId)
            : animeMappingStore.kitsuToTmdb?.get(String(kitsuId));
        return (mapped === null || mapped === undefined || mapped === '') ? null : mapped;
    } catch (_err) {
        return null;
    }
}

const BATCH_SIZE = 500; // Process all items

class LibraryConverterService {
    static async convertAll(userId, hostUrl) {
        try {
            console.log(`[LibraryConverter] Starting library conversion for user ${userId}`);
            const user = await UserAccount.findOne({ userId });
            if (!user || !user.apiKeys?.stremio) {
                console.error(`[LibraryConverter] Stremio API key missing for user ${userId}`);
                return;
            }

            // Deduplica preventivamente la libreria dell'utente prima della conversione
            await LibrarySyncService.deduplicateUserLibrary(user.addonUuid);

            const tmdbClient = createTmdbClient(user.apiKeys.tmdb || process.env.TMDB_API_KEY);
            const userConfig = await AddonConfig.findOne({ uuid: user.addonUuid }).lean();

            // Gli stessi criteri di sempre (non convertito, non rimosso, non un duplicato
            // marcato): la query è il pre-filo che non carica in memoria la libreria
            // intera, la decisione vera è `selectConvertibleItems` — i soli campi
            // dell'item, senza query annidate — così è verificabile da sola nei test.
            const candidates = await UserLibraryItem.find({
                addonUuid: user.addonUuid,
                mapped: false,
                removed: false,
                duplicateOf: null
            }).limit(BATCH_SIZE);
            const unmappedItems = selectConvertibleItems(candidates);

            if (unmappedItems.length === 0) {
                console.log(`[LibraryConverter] No unmapped items found for user ${userId}.`);
                return;
            }

            console.log(`[LibraryConverter] Processing ${unmappedItems.length} items...`);
            const changes = [];
            // Un item che il giro non risolve non viene dato per convertito: resta
            // eleggibile al giro dopo (la mappatura si aggiorna da sola). Alla fine
            // del giro lo diciamo in una riga sola, per l'operatore.
            const results = [];

            for (const item of unmappedItems) {
                try {
                    let tmdbId = item.tmdbId;
                    let tmdbData = null;
                    const strId = String(item.itemId || item._id);

                    // «Da questo id, quale TMDB id?» è una funzione alimentata dalle sue
                    // dipendenze: `tt…` via ricerca esterna, `tmdb:…` diretto,
                    // `kitsu:…` via la mappatura locale condivisa (nessuna rete in più),
                    // e verificabile da sola nei test. Se l'item ha già un tmdbId non si
                    // rileva nulla.
                    let identity = null;
                    if (!tmdbId) {
                        identity = await resolveTmdbIdentity(strId, {
                            lookupImdbId: async (imdbId) => {
                                const searchRes = await tmdbClient.get(`/find/${imdbId}`, {
                                    params: { external_source: 'imdb_id', language: 'it-IT' }
                                });
                                const results = searchRes.data.movie_results?.length > 0
                                    ? searchRes.data.movie_results
                                    : (searchRes.data.tv_results?.length > 0 ? searchRes.data.tv_results : null);
                                return results ? results[0] : null;
                            },
                            lookupKitsuId: lookupKitsuIdInMapping
                        });
                        tmdbId = identity.tmdbId || tmdbId;
                        tmdbData = identity.tmdbData || tmdbData;
                    }

                    // L'esito del giro per questo item: convertito sì o no, e con
                    // quale motivo se no. Da qui in poi `mapped` segue l'esito, non il
                    // fatto di essere passati dal ciclo.
                    const outcome = decideConversionOutcome({ tmdbId, identity });
                    tmdbId = outcome.resolved ? outcome.tmdbId : null;
                    results.push({ itemId: strId, outcome });
                    if (!outcome.resolved) {
                        console.log(`[LibraryConverter] Identity unresolved for ${strId}: ${outcome.reason}`);
                    }

                    if (tmdbId && !tmdbData) {
                        try {
                            const table = (item.type === 'series' || item.type === 'tv') ? 'tv' : 'movies';
                            const duckRows = await duckDbStore.query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [Number(tmdbId)]);
                            if (duckRows && duckRows.length > 0) {
                                tmdbData = duckRows[0];
                            }
                        } catch (_duckErr) {}

                        if (!tmdbData) {
                            try {
                                const endpoint = item.type === 'series' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
                                const detailRes = await tmdbClient.get(endpoint, { params: { language: 'it-IT' } });
                                tmdbData = detailRes.data;
                            } catch (e) {
                                console.warn(`[LibraryConverter] Failed to fetch TMDB details for ${tmdbId}`);
                            }
                        }
                    }

                    let posterCandidate = tmdbData?.poster_path
                        ? `${TMDB_IMAGE_BASE}${tmdbData.poster_path}`
                        : item.poster;

                    if (!posterCandidate) {
                        posterCandidate = await resolvePoster({
                            itemId: item.itemId || item._id,
                            tmdbId,
                            type: item.type,
                            name: item.name
                        }, { tmdbClient });
                    }

                    // We proceed even if tmdbData is null, to apply badges to Kitsu or fallback items!
                    let meta = {
                        id: item.itemId || item._id, // Keep the original stremio id
                        tmdbId: tmdbId,
                        type: item.type,
                        name: tmdbData?.title || tmdbData?.name || item.name,
                        poster: posterCandidate || item.poster || null,
                        posterShape: 'poster',
                        background: tmdbData?.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}` : item.background,
                        releaseInfo: (tmdbData?.release_date || tmdbData?.first_air_date || item.year || '').split('-')[0],
                        _itaBadge: true, // Force Italian badge
                        rawTMDB: tmdbData // Pass to formatter
                    };

                    const sanitizeOptions = {
                        userConfig,
                        hostUrl: hostUrl || process.env.BASE_URL || 'http://localhost:7000',
                        shouldApplyEpisodeBadge: false
                    };

                    meta = sanitizeCatalogMeta(meta, sanitizeOptions);

                    // Force cache bust on the poster so stremio re-downloads it
                    if (meta.poster) {
                        meta.poster = meta.poster.includes('?') 
                            ? `${meta.poster}&t=${Date.now()}` 
                            : `${meta.poster}?t=${Date.now()}`;
                    }

                    // Prepare for datastorePut
                    changes.push(buildStremioLibraryPayload(meta, item));

                    // Update db
                    item.itemId = item.itemId || item._id;
                    const written = applyConversionOutcome(item, outcome);
                    item.tmdbId = written.tmdbId;
                    item.mapped = written.mapped;
                    item.name = meta.name;
                    item.poster = meta.poster;
                    await item.save();
                    
                    // Small delay to avoid rate limit
                    await new Promise(r => setTimeout(r, 200));

                } catch (err) {
                    console.error(`[LibraryConverter] Error processing item ${item.itemId || item._id}:`, err.message);
                }
            }

            if (changes.length > 0) {
                console.log(`[LibraryConverter] Pushing ${changes.length} updates to Stremio Datastore...`);
                const res = await stremioClient.post('/api/datastorePut', {
                    type: 'DatastorePut',
                    authKey: user.apiKeys.stremio,
                    collection: 'libraryItem',
                    changes
                }, { timeout: 15000 });
                console.log('[LibraryConverter] Datastore update success:', res.data.success);
            }

            const { converted, unresolved } = buildConversionState(results);
            const unresolvedLine = summarizeUnresolvedRun(unresolved);
            if (unresolvedLine) {
                console.log(`[LibraryConverter] ${unresolvedLine}`);
            }

            console.log(`[LibraryConverter] Conversion batch finished for user ${userId} (${converted} convertiti, ${unresolved.length} rimasti in coda)`);

        } catch (error) {
            console.error(`[LibraryConverter] Fatal error:`, error.message);
        }
    }
}

module.exports = LibraryConverterService;
