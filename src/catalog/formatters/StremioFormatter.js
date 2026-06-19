const { EPISODE_CATALOG_IDS } = require('../constants');

function getEpisodeBadgeText(item) {
    if (!item?.poster) return null;

    if (item.rawTMDB && (item.type === 'series' || item.type === 'anime')) {
        const nextEp = item.rawTMDB.next_episode_to_air;
        const lastEp = item.rawTMDB.last_episode_to_air;
        const isEnded = item.rawTMDB.status === 'Ended' || item.rawTMDB.status === 'Canceled';

        if (nextEp?.episode_number) {
            return `S${nextEp.season_number || 1} E${nextEp.episode_number}`;
        }

        if (lastEp?.episode_number && !isEnded) {
            return `S${lastEp.season_number || 1} E${lastEp.episode_number}`;
        }
    }

    if (!Array.isArray(item.videos) || item.videos.length === 0) return null;

    const now = new Date();
    const airedEpisodes = item.videos.filter(v => {
        if (!v.released) return true; // Fallback: assume aired if no release date is known (e.g. Kitsu null airdate)
        return new Date(v.released) <= now;
    });
    if (airedEpisodes.length === 0) return null;

    airedEpisodes.sort((a, b) => {
        if (a.released && b.released) {
            const dateDiff = new Date(b.released) - new Date(a.released);
            if (dateDiff !== 0) return dateDiff;
        }
        return (b.episode || 0) - (a.episode || 0);
    });
    const latest = airedEpisodes[0];
    const isKitsu = item.id && (item.id.startsWith('kitsu:') || item.id.includes(':absolute:'));
    const season = latest.season || 0;
    const episode = latest.episode || 1;

    return (isKitsu || season <= 1)
        ? `Ep ${episode}`
        : `S ${season} Ep ${episode}`;
}

function getErdbId(item) {
    if (!item) return '';

    // Prefer explicitly saved tmdbId (useful for Kitsu items mapped to TMDB)
    if (item.tmdbId) {
        const tmdbType = item.type === 'movie' ? 'movie' : 'tv';
        return `tmdb:${tmdbType}:${item.tmdbId}`;
    }

    if (!item.id) return '';
    const strId = String(item.id);

    // IMDb IDs: ERDB expects bare tt... format (NOT imdb:tt...)
    if (strId.startsWith('tt')) {
        return strId;
    }

    // Kitsu / AniList / MAL / already-qualified IDs: pass through
    if (strId.startsWith('kitsu:') || strId.startsWith('anilist:') || strId.startsWith('mal:') || strId.startsWith('anidb:')) {
        return strId;
    }

    // TMDB with prefix: upgrade to typed format (tmdb:tv: or tmdb:movie:)
    if (strId.startsWith('tmdb:')) {
        const numericPart = strId.slice('tmdb:'.length);
        if (/^\d+$/.test(numericPart)) {
            const tmdbType = item.type === 'movie' ? 'movie' : 'tv';
            return `tmdb:${tmdbType}:${numericPart}`;
        }
        return strId; // already has type (e.g. tmdb:tv:1399)
    }

    // Bare numeric TMDB IDs
    if (/^\d+$/.test(strId)) {
        const tmdbType = item.type === 'movie' ? 'movie' : 'tv';
        return `tmdb:${tmdbType}:${strId}`;
    }

    return strId;
}

function sanitizeCatalogMeta(item, options = {}) {
    if (!item) return item;

    const { shouldApplyEpisodeBadge, isLandscapeEnabled, userConfig, hostUrl } = options;
    const badgeText = shouldApplyEpisodeBadge ? getEpisodeBadgeText(item) : null;

    // Resolve ERDB config
    const activeProfile = userConfig?.profiles?.find(p => p.id === userConfig.activeProfileId);
    const erdbConfig = activeProfile?.settings?.erdbConfig || process.env.ERDB_CONFIG;

    let sourceImage = item.poster;
    let finalPosterShape = item.posterShape || 'poster';

    if (isLandscapeEnabled) {
        let erdbId = erdbConfig ? getErdbId(item) : null;
        if (erdbConfig && erdbId) {
            const erdbUrl = `https://easyratingsdb.com/${erdbConfig}/backdrop/${erdbId}.jpg`;
            if (erdbId.startsWith('kitsu:') && hostUrl) {
                sourceImage = `${hostUrl}/images/fallback?url=${encodeURIComponent(erdbUrl)}&fallback=${encodeURIComponent(item.background || item.poster)}`;
            } else {
                sourceImage = erdbUrl;
            }
        } else {
            sourceImage = item.background || item.poster;
        }
        finalPosterShape = 'landscape';
    } else {
        let erdbId = erdbConfig ? getErdbId(item) : null;
        if (erdbConfig && erdbId) {
            const erdbUrl = `https://easyratingsdb.com/${erdbConfig}/poster/${erdbId}.jpg`;
            if (erdbId.startsWith('kitsu:') && hostUrl) {
                sourceImage = `${hostUrl}/images/fallback?url=${encodeURIComponent(erdbUrl)}&fallback=${encodeURIComponent(item.poster)}`;
            } else {
                sourceImage = erdbUrl;
            }
        } else {
            sourceImage = item.poster;
        }
    }

    let background = item.background;
    let erdbBgId = erdbConfig ? getErdbId(item) : null;
    if (erdbConfig && erdbBgId) {
        background = `https://easyratingsdb.com/${erdbConfig}/backdrop/${erdbBgId}.jpg`;
    }

    let poster = sourceImage;
    const BADGE_IMG_VERSION = 11; // Bump to force Stremio to re-download badge images
    if (badgeText && hostUrl && sourceImage) {
        const typeParam = item.type || 'series';
        const idParam = item.id || 'unknown';
        const fallbackPoster = encodeURIComponent(item.poster || sourceImage);
        poster = `${hostUrl}/images/poster/${typeParam}/${encodeURIComponent(idParam)}/${encodeURIComponent(badgeText)}?original=${encodeURIComponent(sourceImage)}&fallback=${fallbackPoster}&bv=${BADGE_IMG_VERSION}`;
    } else if (badgeText) {
        // Log why poster URL wasn't rewritten (only first time to avoid spam)
        if (!sanitizeCatalogMeta._loggedOnce) {
            console.warn(`[Badge] Poster URL NOT rewritten! badgeText="${badgeText}", hostUrl="${hostUrl}", sourceImage="${sourceImage ? sourceImage.substring(0, 60) : 'null'}"`);
            sanitizeCatalogMeta._loggedOnce = true;
        }
    }

    const baseName = item.name;
    const name = (badgeText && baseName)
        ? `${baseName} - ${badgeText}`
        : baseName;

    return {
        id: item.id,
        type: item.type,
        name,
        poster,
        posterShape: finalPosterShape,
        background: background,
        description: item.description,
        releaseInfo: item.releaseInfo,
        imdbRating: item.imdbRating,
        genres: item.genres,
        behaviorHints: item.behaviorHints
    };
}

/**
 * Funzione di formattazione finale pura: non esegue più fetch/hydrate (!).
 * Da richiamare DOPO che MetadataHydrator ha finito il suo lavoro.
 */
function formatStremioCatalog(results, id, type, userConfig, isLandscapeEnabled, hostUrl, catalogMeta) {
    if (!Array.isArray(results)) return { metas: [] };

    const baseId = (id || '').startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : (id || '');
    const shouldApplyEpisodeBadge = type === 'series' && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId));

    // One-shot diagnostic log
    if (!formatStremioCatalog._loggedOnce && type === 'series') {
        console.log(`[Badge] formatStremioCatalog: id=${id}, type=${type}, hostUrl="${hostUrl}", shouldBadge=${shouldApplyEpisodeBadge}, resultsCount=${results.length}`);
        if (results.length > 0) {
            const sample = results[0];
            console.log(`[Badge] Sample item: id=${sample.id}, hasRawTMDB=${!!sample.rawTMDB}, videosCount=${Array.isArray(sample.videos) ? sample.videos.length : 0}, poster=${sample.poster ? sample.poster.substring(0, 80) : 'null'}`);
        }
        formatStremioCatalog._loggedOnce = true;
    }

    const sanitizeOptions = {
        shouldApplyEpisodeBadge,
        isLandscapeEnabled,
        userConfig,
        hostUrl
    };

    return {
        metas: results.map(item => sanitizeCatalogMeta(item, sanitizeOptions))
    };
}

module.exports = {
    formatStremioCatalog
};
