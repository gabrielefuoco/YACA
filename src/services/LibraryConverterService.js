const UserLibraryItem = require('../db/models/UserLibraryItem');
const UserAccount = require('../db/models/UserAccount');
const AddonConfig = require('../db/models/AddonConfig');
const { stremioClient } = require('../clients/stremio');
const { createTmdbClient } = require('../clients/tmdb');
const { sanitizeCatalogMeta } = require('../catalog/formatters/StremioFormatter');
const { buildStremioLibraryPayload } = require('../utils/stremioAddon');

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

            const tmdbClient = createTmdbClient(user.apiKeys.tmdb || process.env.TMDB_API_KEY);
            const userConfig = await AddonConfig.findOne({ uuid: user.addonUuid }).lean();

            // Find items that are not mapped yet
            const unmappedItems = await UserLibraryItem.find({
                addonUuid: user.addonUuid,
                mapped: false,
                removed: false
            }).limit(BATCH_SIZE);

            if (unmappedItems.length === 0) {
                console.log(`[LibraryConverter] No unmapped items found for user ${userId}.`);
                return;
            }

            console.log(`[LibraryConverter] Processing ${unmappedItems.length} items...`);
            const changes = [];

            for (const item of unmappedItems) {
                try {
                    let tmdbId = item.tmdbId;
                    let tmdbData = null;
                    const strId = String(item._id);
                    const isImdb = strId.startsWith('tt');
                    const isTmdb = strId.startsWith('tmdb:');
                    
                    if (isImdb && !tmdbId) {
                        const searchRes = await tmdbClient.get(`/find/${strId}`, {
                            params: { external_source: 'imdb_id', language: 'it-IT' }
                        });
                        if (searchRes.data.movie_results?.length > 0) {
                            tmdbData = searchRes.data.movie_results[0];
                            tmdbId = tmdbData.id;
                        } else if (searchRes.data.tv_results?.length > 0) {
                            tmdbData = searchRes.data.tv_results[0];
                            tmdbId = tmdbData.id;
                        }
                    } else if (isTmdb && !tmdbId) {
                        tmdbId = strId.split(':').pop();
                    }

                    if (tmdbId && !tmdbData) {
                        try {
                            const endpoint = item.type === 'series' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
                            const detailRes = await tmdbClient.get(endpoint, { params: { language: 'it-IT' } });
                            tmdbData = detailRes.data;
                        } catch (e) {
                            console.warn(`[LibraryConverter] Failed to fetch TMDB details for ${tmdbId}`);
                        }
                    }

                    // We proceed even if tmdbData is null, to apply badges to Kitsu or fallback items!
                    let meta = {
                        id: item._id, // Keep the original stremio id
                        tmdbId: tmdbId,
                        type: item.type,
                        name: tmdbData?.title || tmdbData?.name || item.name,
                        poster: tmdbData?.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : item.poster,
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
                        item.tmdbId = tmdbId;
                        item.mapped = true;
                        item.name = meta.name;
                        item.poster = meta.poster;
                        await item.save();
                    
                    // Small delay to avoid rate limit
                    await new Promise(r => setTimeout(r, 200));

                } catch (err) {
                    console.error(`[LibraryConverter] Error processing item ${item._id}:`, err.message);
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

            console.log(`[LibraryConverter] Conversion batch finished for user ${userId}`);

        } catch (error) {
            console.error(`[LibraryConverter] Fatal error:`, error.message);
        }
    }
}

module.exports = LibraryConverterService;
