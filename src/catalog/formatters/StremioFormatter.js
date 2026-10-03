const fs = require('fs');
const path = require('path');

const { EPISODE_CATALOG_IDS } = require('../constants');
const { normalizeAnimeMarker } = require('../../utils/animeIdentity');
// La convenzione del nome file NON viene riscritta qui: la produce il costruttore
// (scripts/erdb-builder/build.js) ed è la stessa che chiede la rotta `/erdb-poster/:file`.
// Un nome inventato qui produrrebbe file che la rotta non troverebbe mai: poster invisibile, zero errori.
const { posterFileName } = require('../../../scripts/erdb-builder/build');
// Unica fonte di verità sulla cartella dei poster: la stessa che serve la rotta statica e
// in cui scrive il drenatore. Se le due divergessero, nessun file sarebbe mai servito.
const { getCacheDir } = require('../../api/staticPosters');

// Etichetta del badge "doppiato" nella cache: la stessa costante del costruttore
// (scripts/erdb-builder/dump-list.js, BADGE_ITA). Non è un'invenzione: se non coincide,
// il nome col suffisso semplicemente non esiste e si resta con l'URL di oggi.
const BADGE_ITA = 'ITA';

function findLatestAiredEpisode(videos) {
    if (!Array.isArray(videos) || videos.length === 0) return null;

    const now = new Date();
    const airedEpisodes = videos.filter(v => {
        const isGenericTitle = !v.title || /^episod(e|io)\s+\d+$/i.test(v.title);
        const hasRealThumbnail = v.thumbnail && !v.thumbnail.includes('easyratingsdb.com') && !v.thumbnail.includes('poster-placeholder');
        if (!v.overview && !hasRealThumbnail && isGenericTitle) {
            return false;
        }

        if (!v.released) {
            // No release date? Include it and sort by episode number as fallback
            return true;
        }

        const releasedDate = new Date(v.released);
        return releasedDate <= now;
    });

    if (airedEpisodes.length === 0) {
        return null;
    }

    airedEpisodes.sort((a, b) => {
        if (a.released && b.released) {
            const dateDiff = new Date(b.released) - new Date(a.released);
            if (dateDiff !== 0) return dateDiff;
        }
        return (b.episode || 0) - (a.episode || 0);
    });

    return airedEpisodes[0];
}

function getEpisodeBadgeText(item) {
    if (!item?.poster) return null;

    // Badge pilotato dallo stato esterno (catalogo novità anime): `EP 12` / `ITA 8`.
    if (item._forceBadgeText) {
        return String(item._forceBadgeText);
    }

    // Anime fuori dal catalogo novità: solo il badge ITA (se doppiato), mai quello episodio.
    if (item._itaOnlyBadge) return null;

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

    const latest = findLatestAiredEpisode(item.videos);
    if (!latest) return null;

    return (item.type === 'anime' || (latest.season && latest.season <= 1))
        ? `Ep ${latest.episode || 1}`
        : `S${latest.season || 1} E${latest.episode || 1}`;
}

function getErdbId(item, context = 'default') {
    if (!item) return '';

    const strId = String(item.id || '').replace('_ita_offset', '');

    // Per gli item Kitsu, usiamo sempre il Kitsu ID per ERDB:
    // ERDB indicizza i poster Kitsu per stagione con copertine localizzate e specifiche.
    // Usare il TMDB ID darebbe il poster dell'ultima stagione (serie-wide), non quello
    // della stagione specifica. Casi sporadici di poster errati (es. Pokémon Horizons)
    // sono limitazioni del database ERDB, non risolvibili lato nostro.
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


/**
 * Il file del poster è nella cartella? Un file vuoto (download abortito) non conta:
 * sostituire un URL funzionante con un'immagine vuota sarebbe una regressione.
 * La cartella può non esistere (o non essere ancora montata): non è un errore.
 */
function esistePosterInCache(nomeFile) {
    try {
        const stats = fs.statSync(path.join(getCacheDir(), nomeFile));
        return stats.isFile() && stats.size > 0;
    } catch {
        return false;
    }
}

/**
 * URL del poster già composto, se il file c'è: `{host}/erdb-poster/{nomeFile}`.
 * Ritorna `null` in ogni altro caso (cartella vuota, nome non valido, file assente):
 * il chiamante deve allora tenere l'URL di oggi, identico.
 */
function urlPosterInCache(hostUrl, erdbId, badge) {
    if (!hostUrl || !erdbId) return null;

    let nomeFile;
    try {
        nomeFile = posterFileName({ erdbId, badge });
    } catch {
        return null; // erdbId non utilizzabile: nessun nome, nessun file
    }

    if (!esistePosterInCache(nomeFile)) return null;
    return `${hostUrl}/erdb-poster/${nomeFile}`;
}

/**
 * Logo su `image.tmdb.org`, se l'item ce l'ha in `rawTMDB.images.logos`.
 *
 * PERCHÉ: il meta che arriva da DuckDB (`getDuckDbMetaDetails`) non riempie `meta.logo`,
 * porta solo `rawTMDB.images.logos[].file_path` (TMDB ce l'ha già, in inglese o in italiano).
 * Prima li copriva l'URL di ERDB; togliendo ERDB, senza questo il logo sparisce dalla scheda.
 * Stessa scelta di `src/clients/tmdb.js`: logo italiano se c'è, altrimenti il primo.
 */
function logoTmdbDaRaw(item) {
    const logos = item?.rawTMDB?.images?.logos;
    if (!Array.isArray(logos) || logos.length === 0) return undefined;

    const itLogo = logos.find(l => l && l.iso_639_1 === 'it');
    const target = itLogo || logos.find(l => l && l.file_path);
    if (!target || !target.file_path) return undefined;

    return `https://image.tmdb.org/t/p/w500${target.file_path}`;
}

function sanitizeCatalogMeta(item, options = {}) {
    if (!item) return item;

    // Il formatter è il boundary di serializzazione: qui il marker non viene
    // più perso dalla seconda sanitizzazione/cache.
    normalizeAnimeMarker(item);

    // `userConfig` non serve più: l'immagine non dipende più dalla configurazione ERDB del profilo.
    const { shouldApplyEpisodeBadge, isLandscapeEnabled, hostUrl } = options;
    let badgeText = (shouldApplyEpisodeBadge || item._forceBadgeText) ? getEpisodeBadgeText(item) : null;

    if (item._itaBadge) {
        if (badgeText) {
            badgeText = `ITA - ${badgeText}`;
        } else {
            badgeText = `ITA`;
        }
    }

    let sourceImage;
    let finalPosterShape = item.posterShape || 'poster';
    // Id del poster verticale nella convenzione ERDB: serve SOLO come chiave per la cache
    // dei file già composti (`/erdb-poster/<nome>`). Non costruisce più nessuna URL remota:
    // le immagini non passano più dall'istanza ERDB pubblica.
    let posterErdbId = getErdbId(item, 'poster') || null;

    let tlBadge = null;
    let baseName = item._rawName || item.name || '';
    const isKitsu = item.id && (item.id.startsWith('kitsu:') || item.id.includes(':absolute:'));
    
    if (isKitsu) {
        // Per il badge visivo preferiamo la stagione Kitsu (dal titolo originale)
        // che riflette la numerazione più nota all'utente (es. "Season 4" di Bookworm),
        // rispetto alla stagione TMDB che può avere una struttura diversa (es. TMDB S2 = Kitsu S4)
        let actualSeason = item.kitsuSeason || item.tmdbSeason || null;
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

        if (item._kitsuPart) {
            const partBadge = `Pt${item._kitsuPart}`;
            if (tlBadge) {
                tlBadge = `${tlBadge} - ${partBadge}`;
            } else {
                tlBadge = partBadge;
            }
        } else {
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
    }

    // Clean up baseName to remove "- Stagione X" or "(Stagione X)" if present, since we use badges now
    baseName = baseName.replace(/\s*(?:-|–|—)?\s*\(?\s*(Stagione|Season)\s*\d+\s*\)?\s*/gi, '').trim();

    if (isLandscapeEnabled) {
        // Landscape = immagine orizzontale: il backdrop di TMDB, non il poster verticale.
        // I poster in cache sono verticali, quindi qui la cache non c'entra (vedi sotto).
        sourceImage = item.background || item._rawPoster || item.poster;
        finalPosterShape = 'landscape';
        posterErdbId = null;
    } else {
        sourceImage = item._rawPoster || item.poster;
    }

    // Save _rawPoster for idempotency on repeated formats (e.g. applyPostCacheBadges)
    const rawPoster = item._rawPoster || sourceImage;


    // Sfondo, logo e miniature: **non più ERDB**.
    // - `background` e `logo` arrivano già da TMDB (`src/clients/tmdb.js`, `image.tmdb.org`):
    //   qui non li si sovrascrive più, si usa quello che c'è. Il logo può mancare sul meta
    //   ricostruito da DuckDB (che porta solo `rawTMDB.images.logos`): in quel caso lo si
    //   ricava da lì, sempre da TMDB — togliere ERDB non deve far sparire il logo dalla scheda.
    // - `videos`: ogni episodio porta già il proprio `thumbnail` di TMDB (è il `still_path`,
    //   costruito in `fetchTmdbEpisodes`). Una scheda con 373 episodi non deve più fare 373
    //   richieste a un server remoto per disegnare le miniature.
    const background = item.background;
    const logo = item.logo || logoTmdbDaRaw(item);
    const videos = item.videos;


    // Anime fuori dal catalogo novità: fuori resta SOLO il badge ITA, quindi la stagione non si mostra.
    if (item._itaOnlyBadge) tlBadge = null;

    let poster = sourceImage;
    const BADGE_IMG_VERSION = 24; // Bump to force Stremio to re-download badge images
    if ((badgeText || tlBadge) && hostUrl && sourceImage) {
        const typeParam = item.type || 'series';
        const idParam = item.id || 'unknown';
        const fallbackPoster = encodeURIComponent(item._rawPoster || item.poster || sourceImage);
        const episodeParam = badgeText ? encodeURIComponent(badgeText) : '_';
        
        // Put BADGE_IMG_VERSION in the path so Stremio doesn't ignore query params for image caching
        poster = `${hostUrl}/images/poster/${typeParam}/${encodeURIComponent(idParam)}/${episodeParam}/${BADGE_IMG_VERSION}?original=${encodeURIComponent(sourceImage)}&fallback=${fallbackPoster}`;
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

    // ---- Cache dei poster già composti: si PREFERISCE il file, non si sostituisce la logica ----
    // I file arrivano da fuori: qui si guarda, e se il file c'è si serve quello (niente catena
    // di hop, niente sharp). Se non c'è, `poster` resta il poster di TMDB.
    //
    // Stessa regola dei cataloghi, invariata: il file può essere scelto solo se è la STESSA
    // immagine che comporrebbe la rotta `/images/poster/...`, cioè niente badge oppure il solo
    // badge ITA (l'unico che la cache contiene, con suffisso `_ITA`). Con badge episodio o
    // stagione la cache non può riprodurli: meglio l'URL che li disegna, che un poster senza
    // badge. Fuori dal ramo poster (landscape) la cache non c'entra: i file sono verticali.
    //
    // Nota: la cache è NOSTRA, non richiede ERDB pubblico (né configurato, né raggiungibile):
    // senza `erdbConfig` la cartella è semplicemente vuota e si resta sul poster di TMDB.
    if (hostUrl && posterErdbId && finalPosterShape === 'poster') {
        const soloIta = !tlBadge && badgeText === BADGE_ITA;
        const senzaBadge = !badgeText && !tlBadge;
        if (soloIta || senzaBadge) {
            const urlInCache = urlPosterInCache(hostUrl, posterErdbId, soloIta ? BADGE_ITA : null);
            if (urlInCache) poster = urlInCache;
        }
    }



    const name = baseName;

    const baseItem = {
        id: item.id,
        type: item.type,
        name,
        poster,
        posterShape: finalPosterShape,
        background: background,
        logo: logo,
        description: item.description,
        releaseInfo: item.releaseInfo,
        imdbRating: item.imdbRating,
        genre_ids: item.genre_ids,
        genres: item.genres,
        cast: item.cast,
        director: item.director,
        original_language: item.original_language || item.originalLanguage || item._originalLanguage || item.rawTMDB?.original_language,
        _isAnime: item._isAnime,
        _rawName: baseName, // Save raw base name for idempotency in applyPostCacheBadges
        _rawPoster: rawPoster, // Save raw poster to prevent nested proxies
    };

    if (item._yacaMatch !== undefined) {
        baseItem._yacaMatch = item._yacaMatch;
    }

    if (item._forceBadgeText !== undefined) {
        baseItem._forceBadgeText = item._forceBadgeText;
    }

    if (item._itaOnlyBadge !== undefined) {
        baseItem._itaOnlyBadge = item._itaOnlyBadge;
    }

    if (item._itaBadge !== undefined) {
        baseItem._itaBadge = item._itaBadge;
    }

    if (item.fallbackUsed !== undefined) {
        baseItem.fallbackUsed = item.fallbackUsed;
    }

    if (item.traktAvailable !== undefined) {
        baseItem.traktAvailable = item.traktAvailable;
    }

    if (options.isMetaDetail) {
        if (item.trailers) baseItem.trailers = item.trailers;
        if (videos) baseItem.videos = videos;
        if (item.behaviorHints) baseItem.behaviorHints = item.behaviorHints;
        if (item.links) baseItem.links = item.links;
        if (item.runtime) baseItem.runtime = item.runtime;
        if (item.certification) baseItem.certification = item.certification;
        if (item.website) baseItem.website = item.website;
        if (item.writer) baseItem.writer = item.writer;
        if (item.inTheaters !== undefined) baseItem.inTheaters = item.inTheaters;
    }

    return baseItem;
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
    sanitizeCatalogMeta,
    findLatestAiredEpisode,
    // Esportata perche' e' l'unica fonte di verita' degli id ERDB: anche gli script
    // offline (es. scripts/erdb-builder/dump-list.js) costruiscono cosi' le liste di poster.
    getErdbId
};
