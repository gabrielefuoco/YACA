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
    const airedEpisodes = item.videos.filter(v => v.released && new Date(v.released) <= now);
    if (airedEpisodes.length === 0) return null;

    airedEpisodes.sort((a, b) => new Date(b.released) - new Date(a.released));
    const latest = airedEpisodes[0];
    const isKitsu = item.id && (item.id.startsWith('kitsu:') || item.id.includes(':absolute:'));
    const season = latest.season || 0;
    const episode = latest.episode || 1;

    return (isKitsu || season <= 1)
        ? `Ep ${episode}`
        : `S ${season} Ep ${episode}`;
}

function getErdbId(id, type) {
    if (!id) return '';
    const strId = String(id);

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
            const tmdbType = type === 'movie' ? 'movie' : 'tv';
            return `tmdb:${tmdbType}:${numericPart}`;
        }
        return strId; // already has type (e.g. tmdb:tv:1399)
    }

    // Bare numeric TMDB IDs
    if (/^\d+$/.test(strId)) {
        const tmdbType = type === 'movie' ? 'movie' : 'tv';
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
        if (erdbConfig && item.id) {
            const erdbId = getErdbId(item.id, item.type);
            sourceImage = `https://easyratingsdb.com/${erdbConfig}/backdrop/${erdbId}.jpg`;
        } else {
            sourceImage = item.background || item.poster;
        }
        finalPosterShape = 'landscape';
    } else {
        if (erdbConfig && item.id) {
            const erdbId = getErdbId(item.id, item.type);
            sourceImage = `https://easyratingsdb.com/${erdbConfig}/poster/${erdbId}.jpg`;
        } else {
            sourceImage = item.poster;
        }
    }

    let background = item.background;
    if (erdbConfig && item.id) {
        const erdbId = getErdbId(item.id, item.type);
        background = `https://easyratingsdb.com/${erdbConfig}/backdrop/${erdbId}.jpg`;
    }

    let poster = sourceImage;
    if (badgeText && hostUrl && sourceImage) {
        const typeParam = item.type || 'series';
        const idParam = item.id || 'unknown';
        poster = `${hostUrl}/images/poster/${typeParam}/${encodeURIComponent(idParam)}/${encodeURIComponent(badgeText)}?original=${encodeURIComponent(sourceImage)}`;
    }

    const baseName = item.name;
    const name = (badgeText && baseName)
        ? `${baseName} • ${badgeText}`
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
function formatStremioCatalog(results, id, type, userConfig, isLandscapeEnabled, hostUrl) {
    if (!Array.isArray(results)) return { metas: [] };

    const baseId = (id || '').startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : (id || '');
    const shouldApplyEpisodeBadge = type === 'series' && EPISODE_CATALOG_IDS.has(baseId);

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
