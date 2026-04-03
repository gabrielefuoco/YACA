const { EPISODE_CATALOG_IDS } = require('../constants');
const EPISODE_BADGE_SEPARATOR = ' • ';

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

function sanitizeCatalogMeta(item, options = {}) {
    if (!item) return item;

    const { shouldApplyEpisodeBadge, isLandscapeEnabled } = options;
    const badgeText = shouldApplyEpisodeBadge ? getEpisodeBadgeText(item) : null;

    // Se è abilitato il formato landscape, usiamo il backdrop (background) invece del poster portrait
    let sourceImage = item.poster;
    let finalPosterShape = item.posterShape || 'poster';

    if (isLandscapeEnabled) {
        // Fallback: se non c'è background, usiamo il poster ma forziamo il formato widescreen
        sourceImage = item.background || item.poster;
        finalPosterShape = 'landscape';
    }

    const poster = sourceImage;
    const name = (badgeText && item?.name)
        ? `${item.name}${EPISODE_BADGE_SEPARATOR}${badgeText}`
        : item.name;

    return {
        id: item.id,
        type: item.type,
        name,
        poster,
        posterShape: finalPosterShape,
        background: item.background,
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
function formatStremioCatalog(results, id, type, userConfig, isLandscapeEnabled) {
    if (!Array.isArray(results)) return { metas: [] };

    const baseId = (id || '').startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : (id || '');
    const shouldApplyEpisodeBadge = type === 'series' && EPISODE_CATALOG_IDS.has(baseId);

    const sanitizeOptions = {
        shouldApplyEpisodeBadge,
        isLandscapeEnabled
    };

    return {
        metas: results.map(item => sanitizeCatalogMeta(item, sanitizeOptions))
    };
}

module.exports = {
    formatStremioCatalog
};
