/**
 * aggregate.js
 * Unifica i record AnimeUnity (sub e doppiato, anche multi-stagione)
 * in un unico documento di stato conforme al contratto di YACA (schemaVersion: 1).
 */

/**
 * Tipi media ammessi nel documento `anime_airing_state`.
 * `mediaType` dichiara il tipo COSI' COME LO DICHIARA LA FONTE (Fribb, AniBridge,
 * bridge TVDB->TMDB). Non e' un default: se la fonte non distingue film e serie
 * il campo resta ASSENTE, ed e' un'assenza informazione ("la fonte non lo dice"),
 * non un "tv" da correggere piu' avanti.
 */
const MEDIA_TYPES = ['movie', 'tv'];

/**
 * Normalizza un tipo media in 'movie' | 'tv', o null se assente/irriconoscibile.
 * @param {*} value
 * @returns {'movie'|'tv'|null}
 */
function normalizeMediaType(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim().toLowerCase();
    return MEDIA_TYPES.includes(v) ? v : null;
}

function cleanTitle(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return '';
    return rawTitle
        .replace(/\s*\b\d+\b/g, '') // rimuove numeri di stagione nel titolo tipo "Dandadan 2" -> "Dandadan"
        .replace(/\s*\((?:ITA|DUB|SUB)\)\s*$/i, '')
        .trim();
}

/**
 * Titolo di un record del portale, con ripiego sui campi alternativi.
 * I record solo-doppiati hanno spesso `title: null` e il titolo in `title_eng`/`title_it`:
 * senza questo ripiego il documento uscirebbe con `title: ""`.
 */
function recordTitle(record) {
    if (!record) return '';
    return record.title || record.title_eng || record.title_it || record.slug || '';
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

function extractRealEpisode(record, type, title) {
    if (!record) return null;
    const raw = record.real_episodes_count;
    if (raw === undefined || raw === null || raw === '') {
        console.warn(`[AnimeSource] real_episodes_count mancante per "${title}" (${type}, id ${record.id})`);
        return null;
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
        console.warn(`[AnimeSource] real_episodes_count non numerico ("${raw}") per "${title}" (${type}, id ${record.id})`);
        return null;
    }
    return num;
}

function toIsoDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return !isNaN(val.getTime()) ? val.toISOString() : null;
    }
    if (typeof val === 'number') {
        const d = new Date(val);
        return !isNaN(d.getTime()) ? d.toISOString() : null;
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return null;
        if (trimmed.includes('T') && (trimmed.endsWith('Z') || trimmed.includes('+') || (trimmed.lastIndexOf('-') > 10))) {
            const d = new Date(trimmed);
            if (!isNaN(d.getTime())) return d.toISOString();
        }
        const withT = trimmed.replace(' ', 'T');
        const dt = new Date(withT.endsWith('Z') || withT.includes('+') ? withT : withT + 'Z');
        if (!isNaN(dt.getTime())) {
            return dt.toISOString();
        }
        const fallback = new Date(trimmed);
        if (!isNaN(fallback.getTime())) {
            return fallback.toISOString();
        }
    }
    return null;
}

/**
 * Aggrega i record AnimeUnity in un documento conforme a anime_airing_state.
 * Supporta input a singola stagione o multi-stagione.
 *
 * @param {Object} params
 * @param {Array<Object>} [params.seasons] Lista di stagioni [{ season, subRecord, dubRecord, identity }]
 * @param {Object} [params.subRecord] Record archivio per sub (fallback singola stagione)
 * @param {Object} [params.dubRecord] Record archivio per doppiato
 * @param {string|Date|number} [params.subAiredAt] Data messa in onda ultimo episodio sub
 * @param {string|Date|number} [params.dubAiredAt] Data messa in onda ultimo episodio doppiato
 * @param {Object} [params.identity] Identità { tmdbId, kitsuId, anilistId, malId, season, mediaType }
 * @param {number} [params.orderIndex] Indice posizionale nella lista sorgente
 * @param {string|Date|number} [params.listSeenAt] Data/ora in cui la serie è stata riscontrata nella lista in corso
 * @param {Date} [params.now] Timestamp opzionale
 * @returns {Object|null}
 */
function buildAiringStateDocument({
    seasons = null,
    subRecord = null,
    dubRecord = null,
    subAiredAt = null,
    dubAiredAt = null,
    identity = null,
    orderIndex = null,
    listSeenAt = null,
    now = new Date()
} = {}) {
    let seasonList = [];
    if (Array.isArray(seasons) && seasons.length > 0) {
        seasonList = seasons;
    } else if (subRecord || dubRecord) {
        seasonList = [{
            season: (identity && identity.season) || 1,
            subRecord,
            dubRecord,
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

    const titleSource = recordTitle(seasonList[0].subRecord) || recordTitle(seasonList[0].dubRecord);
    const title = cleanTitle(titleSource);

    // Tipo dichiarato dalla fonte per l'identita' principale (null se la fonte
    // non lo dichiara: in quel caso il documento non porta il campo).
    const mediaType = normalizeMediaType(primaryIdentity && primaryIdentity.mediaType);

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

        const subStatus = subRec?.status;
        const dubStatus = dubRec?.status;
        if (subStatus === 'In corso' || subStatus === 'In Corso' || dubStatus === 'In corso' || dubStatus === 'In Corso') {
            anyInCorso = true;
        }

        if (subRec) {
            latestSubStatus = subRec.status;
            const epNum = extractRealEpisode(subRec, 'sub', title);
            const airedAt = toIsoDate(s.subAiredAt || subRec.airedAt || subAiredAt) || null;
            const subCand = { season: seasonNum, episode: epNum, airedAt };
            if (compareEpisodes(subCand, maxSubLatest) > 0) {
                maxSubLatest = subCand;
            }
            sources.push({
                provider: 'animeunity',
                animeId: subRec.id,
                dub: 0,
                season: seasonNum,
                title: recordTitle(subRec),
                status: subRec.status,
                episodesCount: epNum,
                latest: subCand,
                confidence: 1.0,
                updatedAt: nowIso
            });
        }

        if (dubRec) {
            latestDubStatus = dubRec.status;
            const epNum = extractRealEpisode(dubRec, 'dub', title);
            const airedAt = toIsoDate(s.dubAiredAt || dubRec.airedAt || dubAiredAt) || null;
            const dubCand = { season: seasonNum, episode: epNum, airedAt };
            if (compareEpisodes(dubCand, maxDubLatest) > 0) {
                maxDubLatest = dubCand;
            }
            sources.push({
                provider: 'animeunity',
                animeId: dubRec.id,
                dub: 1,
                season: seasonNum,
                title: recordTitle(dubRec),
                status: dubRec.status,
                episodesCount: epNum,
                latest: dubCand,
                confidence: 1.0,
                updatedAt: nowIso
            });
        }
    }

    const isSimuldub = Boolean(
        anyInCorso && maxSubLatest && maxDubLatest
    );

    const doc = {
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
        sources,
        updatedAt: nowIso
    };

    // Solo se la fonte lo dichiara: assente resta "non dichiarato", non "tv".
    if (mediaType) {
        doc.mediaType = mediaType;
    }

    if (orderIndex !== null && orderIndex !== undefined && Number.isFinite(orderIndex)) {
        doc.orderIndex = orderIndex;
    }

    if (listSeenAt) {
        doc.listSeenAt = listSeenAt instanceof Date
            ? listSeenAt.toISOString()
            : (typeof listSeenAt === 'number' ? new Date(listSeenAt).toISOString() : String(listSeenAt));
    }

    if (maxSubLatest) {
        doc.sub = maxSubLatest;
    }
    if (maxDubLatest) {
        doc.dub = maxDubLatest;
    }

    doc.italian = {
        sub: maxSubLatest ? {
            latest: maxSubLatest,
            status: latestSubStatus
        } : null,
        dub: maxDubLatest ? {
            latest: maxDubLatest,
            status: latestDubStatus,
            isSimuldub
        } : null
    };

    return doc;
}

/**
 * Fonde due documenti anime_airing_state (ad es. per aggiornamenti incrementali multi-stagione)
 */
function mergeAiringDocuments(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;

    /**
     * Copia la base conservando la data di uscita nota (anche se la base non
     * l'ha). Se nessuno dei due ha una data non aggiunge la chiave, cosi' i
     * documenti legacy restano identici a prima.
     */
    const withAiredAt = (base, first, second) => {
        const airedAt = (first && first.airedAt) || (second && second.airedAt) || null;
        return airedAt ? { ...base, airedAt } : { ...base };
    };

    /**
     * Il ciclo "In corso" (unico percorso che scrive listSeenAt) e' autorevole:
     * il numero di episodi della lista vince sul valore precedente, che spesso
     * arriva da logiche vecchie e resta gonfio. Le scritture parziali (controllo
     * doppiati, passata archivio) continuano a fondersi col massimo.
     */
    const freshWins = Boolean(incoming.listSeenAt);
    const hasEpisode = (v) => Boolean(v) && Number(v.episode) > 0;

    const mergedTitle = incoming.title || existing.title;
    const mergedIds = {
        tmdb: incoming.ids?.tmdb || existing.ids?.tmdb,
        kitsu: existing.ids?.kitsu || incoming.ids?.kitsu,
        anilist: existing.ids?.anilist || incoming.ids?.anilist,
        mal: existing.ids?.mal || incoming.ids?.mal
    };

    const subIncoming = incoming.sub || incoming.italian?.sub?.latest;
    const subExisting = existing.sub || existing.italian?.sub?.latest;
    let subLatest = null;
    if (subIncoming && subExisting) {
        const cmp = compareEpisodes(subIncoming, subExisting);
        if (freshWins && hasEpisode(subIncoming)) {
            subLatest = withAiredAt(subIncoming, subIncoming, subExisting);
        } else if (cmp > 0) {
            subLatest = withAiredAt(subIncoming, subIncoming, subExisting);
        } else if (cmp < 0) {
            // Il documento esistente resta avanti come numero, ma la data del ciclo
            // corrente va conservata: i doc legacy non hanno airedAt.
            subLatest = withAiredAt(subExisting, subIncoming, subExisting);
        } else {
            subLatest = withAiredAt({ ...subExisting, ...subIncoming }, subIncoming, subExisting);
        }
    } else {
        subLatest = subIncoming || subExisting || null;
    }

    const dubIncoming = incoming.dub || incoming.italian?.dub?.latest;
    const dubExisting = existing.dub || existing.italian?.dub?.latest;
    let dubLatest = null;
    if (dubIncoming && dubExisting) {
        const cmp = compareEpisodes(dubIncoming, dubExisting);
        if (freshWins && hasEpisode(dubIncoming)) {
            dubLatest = withAiredAt(dubIncoming, dubIncoming, dubExisting);
        } else if (cmp > 0) {
            dubLatest = withAiredAt(dubIncoming, dubIncoming, dubExisting);
        } else if (cmp < 0) {
            dubLatest = withAiredAt(dubExisting, dubIncoming, dubExisting);
        } else {
            dubLatest = withAiredAt({ ...dubExisting, ...dubIncoming }, dubIncoming, dubExisting);
        }
    } else {
        dubLatest = dubIncoming || dubExisting || null;
    }

    const isSimuldub = Boolean(
        (incoming.italian?.dub?.isSimuldub || existing.italian?.dub?.isSimuldub) ||
        (subLatest && dubLatest && (incoming.schedule?.status === 'In corso' || existing.schedule?.status === 'In corso'))
    );
    const anyInCorso = incoming.schedule?.status === 'In corso' || existing.schedule?.status === 'In corso';

    // Merge sources
    const sourcesMap = new Map();
    for (const s of (existing.sources || [])) {
        sourcesMap.set(`${s.animeId}_${s.dub}`, s);
    }
    for (const s of (incoming.sources || [])) {
        sourcesMap.set(`${s.animeId}_${s.dub}`, s);
    }

    // Merge episodes se presenti (retrocompatibilità per doc storici)
    let mergedEpisodes = undefined;
    if ((existing.episodes && existing.episodes.length > 0) || (incoming.episodes && incoming.episodes.length > 0)) {
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

        if (seasonsPresent.size > 1) {
            mergedEpisodes = [];
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
    }

    const mergedDoc = {
        _id: String(mergedIds.tmdb),
        schemaVersion: 1,
        ids: mergedIds,
        title: mergedTitle,
        schedule: {
            status: anyInCorso ? 'In corso' : (incoming.schedule?.status || existing.schedule?.status || 'Terminato'),
            nextEpisode: null
        },
        sources: Array.from(sourcesMap.values()),
        updatedAt: incoming.updatedAt || new Date().toISOString()
    };

    // Il merge ricostruisce il documento da zero: `mediaType` va nella whitelist
    // qui come in buildAiringStateDocument, altrimenti sparisce a ogni merge.
    // incoming vince quando la dichiara, existing fa da ripiego, nessuno dei due
    // -> nessuna chiave (mai inventata).
    const mergedMediaType = normalizeMediaType(incoming.mediaType) || normalizeMediaType(existing.mediaType);
    if (mergedMediaType) {
        mergedDoc.mediaType = mergedMediaType;
    }

    if (mergedEpisodes !== undefined) {
        mergedDoc.episodes = mergedEpisodes;
    }

    let mergedListSeenAt = undefined;
    if (incoming.listSeenAt && existing.listSeenAt) {
        const timeInc = new Date(incoming.listSeenAt).getTime();
        const timeExist = new Date(existing.listSeenAt).getTime();
        mergedListSeenAt = timeInc >= timeExist ? incoming.listSeenAt : existing.listSeenAt;
    } else if (incoming.listSeenAt) {
        mergedListSeenAt = incoming.listSeenAt;
    } else if (existing.listSeenAt) {
        mergedListSeenAt = existing.listSeenAt;
    }

    if (mergedListSeenAt) {
        mergedDoc.listSeenAt = mergedListSeenAt;
    }

    const orderIndex = incoming.orderIndex !== undefined && incoming.orderIndex !== null
        ? incoming.orderIndex
        : existing.orderIndex;
    if (orderIndex !== undefined && orderIndex !== null && Number.isFinite(orderIndex)) {
        mergedDoc.orderIndex = orderIndex;
    }

    if (subLatest) {
        mergedDoc.sub = subLatest;
    }
    if (dubLatest) {
        mergedDoc.dub = dubLatest;
    }

    mergedDoc.italian = {
        sub: subLatest ? {
            latest: subLatest,
            status: incoming.italian?.sub?.status || existing.italian?.sub?.status || null
        } : null,
        dub: dubLatest ? {
            latest: dubLatest,
            status: incoming.italian?.dub?.status || existing.italian?.dub?.status || null,
            isSimuldub
        } : null
    };

    return mergedDoc;
}

module.exports = {
    buildAiringStateDocument,
    mergeAiringDocuments,
    compareEpisodes,
    cleanTitle,
    normalizeMediaType,
    toIsoDate
};
