const { EPISODE_CATALOG_IDS } = require('../constants');

function getEpisodeBadgeText(item) {
    if (!item?.poster) return null;

    if (item._forceEpisode) {
        const isKitsu = item.id && (item.id.startsWith('kitsu:') || item.id.includes(':absolute:'));
        const season = item._forceSeason || 1;
        const episode = item._forceEpisode;
        return (isKitsu || season <= 1)
            ? `Ep ${episode}`
            : `S${season} E${episode}`;
    }

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

    const strId = String(item.id || '').replace('_ita_offset', '');

    // The user explicitly requested to always pass the Kitsu ID to ERDB for all Kitsu items
    if (strId.startsWith('kitsu:')) {
        return strId;
    }

    // 2. Prefer explicitly saved tmdbId (useful for TMDB native items)
    if (item.tmdbId) {
        const tmdbType = item.type === 'movie' ? 'movie' : 'tv';
        return `tmdb:${tmdbType}:${item.tmdbId}`;
    }

    if (!item.id) return '';
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
    let badgeText = shouldApplyEpisodeBadge ? getEpisodeBadgeText(item) : null;

    if (item._itaBadge) {
        if (badgeText) {
            badgeText = `ITA - ${badgeText}`;
        } else {
            badgeText = `ITA`;
        }
    }

    // Resolve ERDB config
    const activeProfile = userConfig?.profiles?.find(p => p.id === userConfig.activeProfileId);
    const erdbConfig = activeProfile?.settings?.erdbConfig || process.env.ERDB_CONFIG;

    let sourceImage = item.poster;
    let finalPosterShape = item.posterShape || 'poster';

    let tlBadge = null;
    let baseName = item.name || '';
    const isKitsu = item.id && (item.id.startsWith('kitsu:') || item.id.includes(':absolute:'));
    
    if (isKitsu) {
        let actualSeason = item.tmdbSeason || null;
        if (!actualSeason && Array.isArray(item.videos) && item.videos.length > 0) {
            const sampleVideo = item.videos.find(v => v.tmdbSeason) || item.videos[0];
            actualSeason = sampleVideo.tmdbSeason || sampleVideo.season;
        }

        // Se non abbiamo trovato la stagione nei video (es. serie in arrivo senza episodi), proviamo dal titolo
        if (!actualSeason) {
            const seasonMatch = baseName.match(/(?:Stagione|Season)\s*(\d+)/i);
            if (seasonMatch) {
                actualSeason = parseInt(seasonMatch[1], 10);
            }
        }

        if (actualSeason > 1) {
            tlBadge = `S${actualSeason}`;
        } else if (actualSeason === 1) {
            // Heuristic for Kitsu: if it has <= 50 episodes, it's likely a seasonal anime (so S1 makes sense to distinguish it from S2).
            // If it has > 50 episodes, it's a long-running anime (like Hunter x Hunter, One Piece) and shouldn't get S1.
            const isLongRunning = Array.isArray(item.videos) && item.videos.length > 50;
            if (item.tmdbTotalSeasons > 1 || (!isLongRunning && item.type !== 'movie')) {
                tlBadge = `S1`;
            }
        } else if (!actualSeason && (baseName.toLowerCase().includes('stagione') || baseName.toLowerCase().includes('season'))) {
            // Se non c'è numero ma c'è scritto season (es. Final Season), mettiamo un badge generico o nulla
            // Preferibile non mettere nulla per evitare "Snull"
            tlBadge = null;
        }

        const partMatch = baseName.match(/(?:-|–|—)?\s*(?:Parte|Part|Cour)\s*(\d+)/i);
        if (partMatch) {
            const partBadge = `Pt${partMatch[1]}`;
            if (tlBadge) {
                tlBadge = `${tlBadge} - ${partBadge}`;
            } else {
                tlBadge = partBadge;
            }
            // Rimuoviamo "Parte X" dal titolo
            baseName = baseName.replace(/(?:-|–|—)?\s*(?:Parte|Part|Cour)\s*\d+/i, '').trim();
        }
    }

    // Clean up baseName to remove "- Stagione X" or "(Stagione X)" if present, since we use badges now
    baseName = baseName.replace(/\s*(?:-|–|—)?\s*\(?\s*(Stagione|Season)\s*\d+\s*\)?\s*/gi, '').trim();

    if (isLandscapeEnabled) {
        let erdbId = erdbConfig ? getErdbId(item) : null;
        if (erdbConfig && erdbId) {
            const erdbUrl = `https://easyratingsdb.com/${erdbConfig}/backdrop/${erdbId}.jpg`;
            if (options.hostUrl && !badgeText && !tlBadge) {
                sourceImage = `${options.hostUrl}/images/fallback?url=${encodeURIComponent(erdbUrl)}&fallback=${encodeURIComponent(item.background || item.poster || '')}`;
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
            if (options.hostUrl && !badgeText && !tlBadge) {
                sourceImage = `${options.hostUrl}/images/fallback?url=${encodeURIComponent(erdbUrl)}&fallback=${encodeURIComponent(item.poster || '')}`;
            } else {
                sourceImage = erdbUrl;
            }
        } else {
            sourceImage = item.poster;
        }
    }

    let background = item.background;
    let erdbBgId = erdbConfig ? getErdbId(item) : null;
    let logo = item.logo;
    let videos = item.videos;

    if (erdbConfig && erdbBgId) {
        background = `https://easyratingsdb.com/${erdbConfig}/backdrop/${erdbBgId}.jpg`;
        const erdbLogoUrl = `https://easyratingsdb.com/${erdbConfig}/logo/${erdbBgId}.png`;
        logo = erdbLogoUrl;

        if (Array.isArray(videos) && videos.length > 0) {
            videos = videos.map(v => {
                if (v && v.season !== undefined && v.episode !== undefined) {
                    let episodeErdbId = `${erdbBgId}:${v.season}:${v.episode}`;
                    let thumbnail = `https://easyratingsdb.com/${erdbConfig}/thumbnail/${episodeErdbId}.jpg`;
                    if (options.hostUrl && v.thumbnail) {
                        thumbnail = `${options.hostUrl}/images/fallback?url=${encodeURIComponent(thumbnail)}&fallback=${encodeURIComponent(v.thumbnail)}`;
                    }
                    return {
                        ...v,
                        thumbnail: thumbnail
                    };
                }
                return v;
            });
        }
    }



    let poster = sourceImage;
    const BADGE_IMG_VERSION = 19; // Bump to force Stremio to re-download badge images
    if ((badgeText || tlBadge) && hostUrl && sourceImage) {
        const typeParam = item.type || 'series';
        const idParam = item.id || 'unknown';
        const fallbackPoster = encodeURIComponent(item.poster || sourceImage);
        const episodeParam = badgeText ? encodeURIComponent(badgeText) : '_';
        poster = `${hostUrl}/images/poster/${typeParam}/${encodeURIComponent(idParam)}/${episodeParam}?original=${encodeURIComponent(sourceImage)}&fallback=${fallbackPoster}&bv=${BADGE_IMG_VERSION}`;
        if (tlBadge) {
            poster += `&tlBadge=${encodeURIComponent(tlBadge)}`;
        }
    } else if (badgeText) {
        // Log why poster URL wasn't rewritten (only first time to avoid spam)
        if (!sanitizeCatalogMeta._loggedOnce) {
            // console.warn(`[Badge] Poster URL NOT rewritten! badgeText="${badgeText}", hostUrl="${hostUrl}", sourceImage="${sourceImage ? sourceImage.substring(0, 60) : 'null'}"`);
            sanitizeCatalogMeta._loggedOnce = true;
        }
    }



    let nameSuffix = badgeText;
    if (nameSuffix && nameSuffix.startsWith('ITA - ')) {
        nameSuffix = nameSuffix.substring(6);
    } else if (nameSuffix === 'ITA') {
        nameSuffix = null;
    }

    const name = (nameSuffix && baseName)
        ? `${baseName} - ${nameSuffix}`
        : baseName;

    return {
        ...item,
        name,
        poster,
        posterShape: finalPosterShape,
        background: background,
        logo: logo,
        videos: videos
    };
}

/**
 * Funzione di formattazione finale pura: non esegue più fetch/hydrate (!).
 * Da richiamare DOPO che MetadataHydrator ha finito il suo lavoro.
 */
function formatStremioCatalog(results, id, type, userConfig, isLandscapeEnabled, hostUrl, catalogMeta) {
    if (!Array.isArray(results)) return { metas: [] };

    const baseId = (id || '').startsWith('yaca_preset_') ? id.replace('yaca_preset_', '') : (id || '');
    const shouldApplyEpisodeBadge = (type === 'series' || type === 'anime') && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId));

    // One-shot diagnostic log
    if (!formatStremioCatalog._loggedOnce && (type === 'series' || type === 'anime')) {
        // console.log(`[Badge] formatStremioCatalog: id=${id}, type=${type}, hostUrl="${hostUrl}", shouldBadge=${shouldApplyEpisodeBadge}, resultsCount=${results.length}`);
        if (results.length > 0) {
            const sample = results[0];
            // console.log(`[Badge] Sample item: id=${sample.id}, hasRawTMDB=${!!sample.rawTMDB}, videosCount=${Array.isArray(sample.videos) ? sample.videos.length : 0}, poster=${sample.poster ? sample.poster.substring(0, 80) : 'null'}`);
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
    formatStremioCatalog,
    sanitizeCatalogMeta
};
