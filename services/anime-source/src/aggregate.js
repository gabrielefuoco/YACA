/**
 * aggregate.js
 * Unifica i record AnimeUnity (sub e doppiato, anche multi-stagione)
 * in un unico documento di stato conforme al contratto di YACA (schemaVersion: 1).
 */

function cleanTitle(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return '';
    return rawTitle
        .replace(/\s*\b\d+\b/g, '') // rimuove numeri di stagione nel titolo tipo "Dandadan 2" -> "Dandadan"
        .replace(/\s*\((?:ITA|DUB|SUB)\)\s*$/i, '')
        .trim();
}

/**
 * Confronta due oggetti episodio { season, episode }
 * @returns {number} > 0 se a > b, < 0 se a < b, 0 se uguali
 */
function compareEpisodes(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    const aSeason = Number(a.season) || 1;
    const bSeason = Number(b.season) || 1;
    if (aSeason !== bSeason) {
        return aSeason - bSeason;
    }
    const aEp = Number(a.episode) || 0;
    const bEp = Number(b.episode) || 0;
    return aEp - bEp;
}

/**
 * Aggrega i record e gli episodi di AnimeUnity in un documento conforme a anime_airing_state.
 * Supporta input a singola stagione o multi-stagione.
 * 
 * @param {Object} params
 * @param {Array<Object>} [params.seasons] Lista di stagioni [{ season, subRecord, subEpisodes, dubRecord, dubEpisodes, identity }]
 * @param {Object} [params.subRecord] Record archivio per sub (fallback singola stagione)
 * @param {Array<Object>} [params.subEpisodes] Lista episodi da info_api sub
 * @param {Object} [params.dubRecord] Record archivio per doppiato
 * @param {Array<Object>} [params.dubEpisodes] Lista episodi da info_api doppiato
 * @param {Object} [params.identity] Identità { tmdbId, kitsuId, anilistId, malId, season }
 * @param {Date} [params.now] Timestamp opzionale
 * @returns {Object|null}
 */
function buildAiringStateDocument({
    seasons = null,
    subRecord = null,
    subEpisodes = [],
    dubRecord = null,
    dubEpisodes = [],
    identity = null,
    now = new Date()
} = {}) {
    let seasonList = [];
    if (Array.isArray(seasons) && seasons.length > 0) {
        seasonList = seasons;
    } else if (subRecord || dubRecord) {
        seasonList = [{
            season: (identity && identity.season) || 1,
            subRecord,
            subEpisodes: subEpisodes || [],
            dubRecord,
            dubEpisodes: dubEpisodes || [],
            identity
        }];
    } else {
        console.warn('[Aggregate] Nessuna stagione o record fornito per l\'aggregazione.');
        return null;
    }

    // Trova l'identità principale (preferibilmente stagione 1)
    const primaryIdentity = seasonList.find(s => s.season === 1)?.identity || seasonList[0].identity;
    if (!primaryIdentity || !primaryIdentity.tmdbId) {
        console.warn('[Aggregate] Impossibile aggregare: identity.tmdbId mancante.');
        return null;
    }

    const titleSource = seasonList[0].subRecord?.title || seasonList[0].dubRecord?.title || '';
    const title = cleanTitle(titleSource);

    const epMap = new Map();
    const sources = [];
    const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

    let maxSubLatest = null;
    let maxDubLatest = null;
    let anyInCorso = false;
    let latestSubStatus = null;
    let latestDubStatus = null;

    for (const s of seasonList) {
        const seasonNum = Number(s.season) || (s.identity && Number(s.identity.season)) || 1;
        const subRec = s.subRecord;
        const dubRec = s.dubRecord;
        const subEps = s.subEpisodes || [];
        const dubEps = s.dubEpisodes || [];

        if (subRec?.status === 'In corso' || dubRec?.status === 'In corso') {
            anyInCorso = true;
        }

        // Sub episodes
        let seasonMaxSubEp = 0;
        for (const ep of subEps) {
            const num = parseFloat(ep.number);
            if (isNaN(num)) continue;
            if (num > seasonMaxSubEp) seasonMaxSubEp = num;

            let airedAt = null;
            if (ep.created_at) {
                try {
                    airedAt = new Date(ep.created_at.replace(' ', 'T')).toISOString();
                } catch {
                    airedAt = null;
                }
            }

            const key = `${seasonNum}:${num}`;
            epMap.set(key, {
                season: seasonNum,
                episode: num,
                airedAt,
                subIta: true,
                dubIta: false
            });
        }
        if (subEps.length === 0 && subRec && subRec.episodes_count) {
            seasonMaxSubEp = Number(subRec.episodes_count) || 0;
        }

        if (subRec) {
            latestSubStatus = subRec.status;
            if (seasonMaxSubEp > 0) {
                const subCand = { season: seasonNum, episode: seasonMaxSubEp };
                if (compareEpisodes(subCand, maxSubLatest) > 0) {
                    maxSubLatest = subCand;
                }
            }
            sources.push({
                provider: 'animeunity',
                animeId: subRec.id,
                dub: 0,
                season: seasonNum,
                title: subRec.title,
                status: subRec.status,
                episodesCount: subRec.episodes_count !== undefined ? Number(subRec.episodes_count) : seasonMaxSubEp,
                latest: seasonMaxSubEp > 0 ? { season: seasonNum, episode: seasonMaxSubEp } : null,
                confidence: 1.0,
                updatedAt: nowIso
            });
        }

        // Dub episodes
        let seasonMaxDubEp = 0;
        for (const ep of dubEps) {
            const num = parseFloat(ep.number);
            if (isNaN(num)) continue;
            if (num > seasonMaxDubEp) seasonMaxDubEp = num;

            let airedAt = null;
            if (ep.created_at) {
                try {
                    airedAt = new Date(ep.created_at.replace(' ', 'T')).toISOString();
                } catch {
                    airedAt = null;
                }
            }

            const key = `${seasonNum}:${num}`;
            if (epMap.has(key)) {
                const existing = epMap.get(key);
                existing.dubIta = true;
                if (!existing.airedAt && airedAt) {
                    existing.airedAt = airedAt;
                }
            } else {
                epMap.set(key, {
                    season: seasonNum,
                    episode: num,
                    airedAt,
                    subIta: false,
                    dubIta: true
                });
            }
        }
        if (dubEps.length === 0 && dubRec && dubRec.episodes_count) {
            seasonMaxDubEp = Number(dubRec.episodes_count) || 0;
        }

        if (dubRec) {
            latestDubStatus = dubRec.status;
            if (seasonMaxDubEp > 0) {
                const dubCand = { season: seasonNum, episode: seasonMaxDubEp };
                if (compareEpisodes(dubCand, maxDubLatest) > 0) {
                    maxDubLatest = dubCand;
                }
            }
            sources.push({
                provider: 'animeunity',
                animeId: dubRec.id,
                dub: 1,
                season: seasonNum,
                title: dubRec.title,
                status: dubRec.status,
                episodesCount: dubRec.episodes_count !== undefined ? Number(dubRec.episodes_count) : seasonMaxDubEp,
                latest: seasonMaxDubEp > 0 ? { season: seasonNum, episode: seasonMaxDubEp } : null,
                confidence: 1.0,
                updatedAt: nowIso
            });
        }
    }

    const isSimuldub = Boolean(
        anyInCorso && maxSubLatest && maxDubLatest
    );

    const allEpisodes = Array.from(epMap.values());
    // Ordiniamo gli episodi per data decrescente per prendere la coda più recente (~12-24)
    // preservando al contempo la visibilità di entrambe le stagioni
    const seasonsPresent = new Set(allEpisodes.map(e => e.season));
    let recentQueue = [];

    if (seasonsPresent.size > 1) {
        // Multi-stagione: prendiamo gli episodi più recenti di ogni stagione
        for (const sNum of seasonsPresent) {
            const seasonEps = allEpisodes
                .filter(e => e.season === sNum)
                .sort((a, b) => a.episode - b.episode);
            const tail = seasonEps.length > 12 ? seasonEps.slice(-12) : seasonEps;
            recentQueue.push(...tail);
        }
    } else {
        recentQueue = allEpisodes.length > 12 ? allEpisodes.slice(-12) : allEpisodes;
    }

    // Ordina la coda cronologicamente per stagione ed episodio
    recentQueue.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
    });

    return {
        _id: String(primaryIdentity.tmdbId),
        schemaVersion: 1,
        ids: {
            tmdb: Number(primaryIdentity.tmdbId) || primaryIdentity.tmdbId,
            kitsu: primaryIdentity.kitsuId ? String(primaryIdentity.kitsuId) : null,
            anilist: primaryIdentity.anilistId ? Number(primaryIdentity.anilistId) : null,
            mal: primaryIdentity.malId ? Number(primaryIdentity.malId) : null
        },
        title,
        schedule: {
            status: anyInCorso ? 'In corso' : (latestSubStatus || latestDubStatus || 'Terminato'),
            nextEpisode: null
        },
        italian: {
            sub: {
                latest: maxSubLatest,
                status: latestSubStatus
            },
            dub: {
                latest: maxDubLatest,
                status: latestDubStatus,
                isSimuldub
            }
        },
        episodes: recentQueue,
        sources,
        updatedAt: nowIso
    };
}

/**
 * Fonde due documenti anime_airing_state (ad es. per aggiornamenti incrementali multi-stagione)
 */
function mergeAiringDocuments(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;

    const mergedTitle = incoming.title || existing.title;
    const mergedIds = {
        tmdb: incoming.ids?.tmdb || existing.ids?.tmdb,
        kitsu: existing.ids?.kitsu || incoming.ids?.kitsu,
        anilist: existing.ids?.anilist || incoming.ids?.anilist,
        mal: existing.ids?.mal || incoming.ids?.mal
    };

    // Merge episodes
    const epMap = new Map();
    for (const ep of (existing.episodes || [])) {
        epMap.set(`${ep.season}:${ep.episode}`, { ...ep });
    }
    for (const ep of (incoming.episodes || [])) {
        const key = `${ep.season}:${ep.episode}`;
        if (epMap.has(key)) {
            const cur = epMap.get(key);
            cur.subIta = cur.subIta || ep.subIta;
            cur.dubIta = cur.dubIta || ep.dubIta;
            if (ep.airedAt) cur.airedAt = ep.airedAt;
        } else {
            epMap.set(key, { ...ep });
        }
    }

    const allMerged = Array.from(epMap.values());
    const seasonsPresent = new Set(allMerged.map(e => e.season));
    let mergedEpisodes = [];

    if (seasonsPresent.size > 1) {
        for (const sNum of seasonsPresent) {
            const seasonEps = allMerged
                .filter(e => e.season === sNum)
                .sort((a, b) => a.episode - b.episode);
            const tail = seasonEps.length > 12 ? seasonEps.slice(-12) : seasonEps;
            mergedEpisodes.push(...tail);
        }
    } else {
        mergedEpisodes = allMerged.length > 12 ? allMerged.slice(-12) : allMerged;
    }

    mergedEpisodes.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
    });

    // Merge latest
    const subLatest = compareEpisodes(incoming.italian?.sub?.latest, existing.italian?.sub?.latest) >= 0
        ? incoming.italian?.sub?.latest
        : existing.italian?.sub?.latest;

    const dubLatest = compareEpisodes(incoming.italian?.dub?.latest, existing.italian?.dub?.latest) >= 0
        ? incoming.italian?.dub?.latest
        : existing.italian?.dub?.latest;

    const isSimuldub = Boolean(incoming.italian?.dub?.isSimuldub || existing.italian?.dub?.isSimuldub);
    const anyInCorso = incoming.schedule?.status === 'In corso' || existing.schedule?.status === 'In corso';

    // Merge sources
    const sourcesMap = new Map();
    for (const s of (existing.sources || [])) {
        sourcesMap.set(`${s.animeId}_${s.dub}`, s);
    }
    for (const s of (incoming.sources || [])) {
        sourcesMap.set(`${s.animeId}_${s.dub}`, s);
    }

    return {
        _id: String(mergedIds.tmdb),
        schemaVersion: 1,
        ids: mergedIds,
        title: mergedTitle,
        schedule: {
            status: anyInCorso ? 'In corso' : (incoming.schedule?.status || existing.schedule?.status || 'Terminato'),
            nextEpisode: null
        },
        italian: {
            sub: {
                latest: subLatest || null,
                status: incoming.italian?.sub?.status || existing.italian?.sub?.status || null
            },
            dub: {
                latest: dubLatest || null,
                status: incoming.italian?.dub?.status || existing.italian?.dub?.status || null,
                isSimuldub
            }
        },
        episodes: mergedEpisodes,
        sources: Array.from(sourcesMap.values()),
        updatedAt: incoming.updatedAt || new Date().toISOString()
    };
}

module.exports = {
    buildAiringStateDocument,
    mergeAiringDocuments,
    compareEpisodes,
    cleanTitle
};
