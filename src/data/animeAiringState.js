/**
 * animeAiringState.js
 *
 * Lettore lato YACA della collezione `anime_airing_state` scritta dal modulo esterno
 * `services/anime-source` (contratto: ticket `07`, consumo: ticket `13`).
 *
 * Regole del contratto implementate qui:
 *  - `_id` = TMDB id in stringa (chiave di dedup/lookup);
 *  - `schemaVersion` = 1; i documenti con versione più alta vengono IGNORATI (degrado, mai crash);
 *  - `italian.sub.latest` / `italian.dub.latest` = `{ season, episode }`;
 *  - `episodes[]` = `{ season, episode, airedAt, subIta, dubIta }`;
 *  - validazione difensiva: leggiamo e normalizziamo SOLO i campi che usiamo, il resto è ignorato.
 *
 * Resilienza:
 *  - cache L1 in RAM con TTL breve (~60s): una query Mongo per snapshot, non una per item;
 *  - il refresh non lancia MAI: su errore mantiene l'ultimo snapshot noto (anche stantio) o vuoto;
 *  - log aggregato (una riga per refresh, non per documento/item).
 *
 * Nota: la collection è scritta col driver nativo `mongodb`; qui la leggiamo dalla connessione
 * mongoose già aperta dall'app (`mongoose.connection.db`), senza definire un model (non serve
 * e il driver nativo evita sorprese di casting sugli `_id` stringa).
 */

const mongoose = require('mongoose');

const COLLECTION_NAME = 'anime_airing_state';
const SUPPORTED_SCHEMA_VERSION = 1;
const CACHE_TTL_MS = 60 * 1000;
const NOVELTY_WINDOW_DAYS = 14;
const AIRING_FRESHNESS_HOURS = 12;
const LIST_WINDOW_DAYS = 14;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Proiezione: niente payload morto in RAM, solo i campi effettivamente consumati.
const PROJECTION = {
    _id: 1,
    schemaVersion: 1,
    'ids.kitsu': 1,
    title: 1,
    sub: 1,
    dub: 1,
    orderIndex: 1,
    italian: 1,
    episodes: 1,
    listSeenAt: 1,
    updatedAt: 1
};

function emptySnapshot() {
    return {
        docs: [],
        byTmdbId: new Map(),
        byKitsuId: new Map(),
        ignoredSchema: 0,
        invalid: 0,
        degraded: false,
        fetchedAt: 0,
        lastError: null
    };
}

const cache = {
    snapshot: null,
    fetchedAt: 0,
    inflight: null,
    lastLogKey: null,
    lastLogAt: 0
};

async function defaultDataSource() {
    const connection = mongoose.connection;
    if (!connection || connection.readyState !== 1 || !connection.db) {
        throw new Error('MongoDB non connesso');
    }
    return await connection.db
        .collection(COLLECTION_NAME)
        .find({}, { projection: PROJECTION })
        .toArray();
}

let dataSource = defaultDataSource;

// ─── Validazione difensiva ───────────────────────────────────────────────────

function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeLatest(value) {
    if (!value || typeof value !== 'object') return null;
    const season = toFiniteNumber(value.season);
    const normalizedSeason = season !== null && season > 0 ? season : 1;
    const episode = toFiniteNumber(value.episode);
    const airedAt = normalizeTimestamp(value.airedAt);
    const res = { season: normalizedSeason };
    if (episode !== null && episode > 0) {
        res.episode = episode;
    } else if (value.episode === null || value.episode === undefined) {
        res.episode = null;
    } else {
        return null;
    }
    if (airedAt !== null && airedAt !== undefined) {
        res.airedAt = airedAt;
    }
    return res;
}

function normalizeTimestamp(value) {
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string' || !value.trim()) return null;
    let time = Date.parse(value);
    if (!Number.isFinite(time) && value.includes(' ')) {
        const withT = value.trim().replace(' ', 'T');
        time = Date.parse(withT.endsWith('Z') || withT.includes('+') ? withT : withT + 'Z');
    }
    return Number.isFinite(time) ? time : null;
}

function normalizeEpisodes(value) {
    if (!Array.isArray(value)) return [];
    const episodes = [];
    for (const raw of value) {
        if (!raw || typeof raw !== 'object') continue;
        const episode = toFiniteNumber(raw.episode);
        if (episode === null || episode <= 0) continue;
        const season = toFiniteNumber(raw.season);
        episodes.push({
            season: season !== null && season > 0 ? season : 1,
            episode,
            airedAt: normalizeTimestamp(raw.airedAt),
            subIta: raw.subIta === true,
            dubIta: raw.dubIta === true
        });
    }
    return episodes;
}

/**
 * Normalizza un documento grezzo. Ritorna `{ doc }` oppure `{ reason: 'schema' | 'invalid' }`.
 * `schema` = versione non supportata (da ignorare senza interpretare i campi);
 * `invalid` = documento malformato (manca un `_id` TMDB valido).
 */
function validateDocument(raw) {
    if (!raw || typeof raw !== 'object') return { reason: 'invalid' };

    const version = toFiniteNumber(raw.schemaVersion);
    if (version === null || version > SUPPORTED_SCHEMA_VERSION) {
        return { reason: 'schema' };
    }

    const tmdbId = raw._id === null || raw._id === undefined ? '' : String(raw._id).trim();
    if (!/^\d+$/.test(tmdbId)) return { reason: 'invalid' };

    const kitsuRaw = raw.ids && raw.ids.kitsu !== null && raw.ids.kitsu !== undefined
        ? String(raw.ids.kitsu).trim()
        : '';

    return {
        doc: {
            tmdbId,
            kitsuId: /^\d+$/.test(kitsuRaw) ? kitsuRaw : null,
            title: typeof raw.title === 'string' ? raw.title : null,
            sub: normalizeLatest(raw.sub || (raw.italian && raw.italian.sub && raw.italian.sub.latest)),
            dub: normalizeLatest(raw.dub || (raw.italian && raw.italian.dub && raw.italian.dub.latest)),
            orderIndex: toFiniteNumber(raw.orderIndex),
            episodes: normalizeEpisodes(raw.episodes),
            listSeenAt: normalizeTimestamp(raw.listSeenAt),
            updatedAt: normalizeTimestamp(raw.updatedAt)
        }
    };
}

function buildSnapshot(rawDocs) {
    const snapshot = emptySnapshot();
    for (const raw of rawDocs) {
        const result = validateDocument(raw);
        if (result.reason === 'schema') {
            snapshot.ignoredSchema++;
            continue;
        }
        if (result.reason === 'invalid') {
            snapshot.invalid++;
            continue;
        }
        snapshot.docs.push(result.doc);
        snapshot.byTmdbId.set(result.doc.tmdbId, result.doc);
        if (result.doc.kitsuId) {
            snapshot.byKitsuId.set(result.doc.kitsuId, result.doc);
        }
    }
    return snapshot;
}

// ─── Log aggregato ───────────────────────────────────────────────────────────

function logRefresh(snapshot, error) {
    try {
        const now = Date.now();
        const key = error
            ? `err:${error.message}`
            : `ok:${snapshot.docs.length}:${snapshot.ignoredSchema}:${snapshot.invalid}`;

        if (cache.lastLogKey === key && now - cache.lastLogAt < CACHE_TTL_MS) return;
        cache.lastLogKey = key;
        cache.lastLogAt = now;

        if (error) {
            const served = snapshot.docs.length > 0 ? `${snapshot.docs.length} serie dall'ultimo stato noto` : 'catalogo vuoto';
            console.warn(`[AnimeAiringState] Lettura ${COLLECTION_NAME} fallita (${error.message}); servo ${served}.`);
            return;
        }
        if (snapshot.ignoredSchema > 0 || snapshot.invalid > 0) {
            console.warn(
                `[AnimeAiringState] ${snapshot.docs.length} serie valide; ` +
                `${snapshot.ignoredSchema} ignorate (schemaVersion > ${SUPPORTED_SCHEMA_VERSION}); ` +
                `${snapshot.invalid} scartate (documento malformato).`
            );
        }
    } catch (_e) {
        // Un log non deve mai propagare errori.
    }
}

// ─── Snapshot con cache L1 ───────────────────────────────────────────────────

async function refresh() {
    try {
        const rawDocs = await dataSource();
        const snapshot = buildSnapshot(Array.isArray(rawDocs) ? rawDocs : []);
        snapshot.fetchedAt = Date.now();
        snapshot.degraded = false;
        snapshot.lastError = null;
        cache.snapshot = snapshot;
        cache.fetchedAt = snapshot.fetchedAt;
        logRefresh(snapshot, null);
        return snapshot;
    } catch (error) {
        // Degrado: si serve l'ultimo stato noto (anche stantio), o il vuoto. Mai eccezioni.
        const fallback = cache.snapshot || emptySnapshot();
        fallback.degraded = true;
        fallback.lastError = error.message;
        cache.snapshot = fallback;
        // Negativa per un TTL: non martelliamo Mongo se è giù.
        cache.fetchedAt = Date.now();
        logRefresh(fallback, error);
        return fallback;
    }
}

/**
 * Snapshot validato dello stato, servito da cache L1 con TTL ~60s.
 * Non lancia mai: su errore ritorna lo snapshot precedente (degraded: true) o uno vuoto.
 * @returns {Promise<{docs: Array, byTmdbId: Map, byKitsuId: Map, ignoredSchema: number, invalid: number, degraded: boolean, fetchedAt: number}>}
 */
async function getSnapshot() {
    const now = Date.now();
    if (cache.snapshot && now - cache.fetchedAt < CACHE_TTL_MS) {
        return cache.snapshot;
    }
    if (cache.inflight) return cache.inflight;

    cache.inflight = refresh().finally(() => {
        cache.inflight = null;
    });
    return cache.inflight;
}

// ─── Helper puri sulla finestra temporale ────────────────────────────────────

function normalizeOptions(options) {
    return options && typeof options === 'object' ? options : {};
}

function resolveWindow(options) {
    const opts = normalizeOptions(options);
    const nowMs = Number.isFinite(opts.now) ? opts.now : Date.now();
    const days = Number.isFinite(opts.windowDays) && opts.windowDays > 0 ? opts.windowDays : NOVELTY_WINDOW_DAYS;
    return { nowMs, windowMs: days * DAY_MS };
}

function isInWindow(airedAt, nowMs, windowMs) {
    return airedAt !== null && airedAt <= nowMs && airedAt >= nowMs - windowMs;
}

function getDocAiredAt(doc) {
    if (!doc) return null;
    const subAired = normalizeTimestamp(doc.sub && doc.sub.airedAt);
    const dubAired = normalizeTimestamp(doc.dub && doc.dub.airedAt);
    if (subAired !== null && dubAired !== null) {
        return Math.max(subAired, dubAired);
    }
    if (subAired !== null) return subAired;
    if (dubAired !== null) return dubAired;
    if (Array.isArray(doc.episodes) && doc.episodes.length > 0) {
        let maxEp = null;
        for (const ep of doc.episodes) {
            const epAired = normalizeTimestamp(ep.airedAt);
            if (epAired !== null && (maxEp === null || epAired > maxEp)) {
                maxEp = epAired;
            }
        }
        return maxEp;
    }
    return null;
}

/**
 * Flag della finestra per un documento: c'è un sub/ITA uscito negli ultimi N giorni?
 * `lastAiredAt` = data (ms) dell'episodio disponibile più recente nella finestra.
 * Se episodes[] è assente o vuoto ma sub/dub ci sono, considerali disponibili
 * (la "finestra" non è più una data: è la presenza nella lista).
 */
function getWindowInfo(doc, options = {}) {
    if (!doc) return { hasSub: false, hasDub: false, lastAiredAt: null };

    // Documenti nuovi senza episodes[]: la presenza nella lista certifica la disponibilità
    if (!Array.isArray(doc.episodes) || doc.episodes.length === 0) {
        const hasSub = Boolean(doc.sub);
        const hasDub = Boolean(doc.dub);
        const airedAt = getDocAiredAt(doc);
        return {
            hasSub,
            hasDub,
            lastAiredAt: airedAt || doc.listSeenAt || doc.updatedAt || null
        };
    }

    // Documenti storici con episodes[]: verifica finestra temporale
    const { nowMs, windowMs } = resolveWindow(options);
    let hasSub = false;
    let hasDub = false;
    let lastAiredAt = null;

    for (const episode of doc.episodes) {
        if (!isInWindow(episode.airedAt, nowMs, windowMs)) continue;
        if (episode.subIta) hasSub = true;
        if (episode.dubIta) hasDub = true;
        if (lastAiredAt === null || episode.airedAt > lastAiredAt) {
            lastAiredAt = episode.airedAt;
        }
    }

    return { hasSub, hasDub, lastAiredAt };
}

function compareEpisodeRefs(a, b) {
    const seasonA = Number(a && a.season) || 1;
    const seasonB = Number(b && b.season) || 1;
    if (seasonA !== seasonB) return seasonA - seasonB;
    return (Number(a && a.episode) || 0) - (Number(b && b.episode) || 0);
}

function findNewestEpisode(doc, predicate, options = {}) {
    if (!doc || !Array.isArray(doc.episodes)) return null;
    const { nowMs, windowMs } = resolveWindow(options);
    let best = null;
    for (const episode of doc.episodes) {
        if (!isInWindow(episode.airedAt, nowMs, windowMs)) continue;
        if (!predicate(episode)) continue;
        if (
            !best ||
            episode.airedAt > best.airedAt ||
            (episode.airedAt === best.airedAt && compareEpisodeRefs(episode, best) > 0)
        ) {
            best = episode;
        }
    }
    return best;
}

/**
 * Informazioni per le due card di un documento.
 * - `sub`: episodio del badge sub (da `italian.sub.latest`, fallback all'ultimo sub in finestra);
 * - `dub`: episodio del badge ITA, presente SOLO se nella finestra è uscito un doppiato.
 * Ritorna null se il documento non ha nulla nella finestra.
 */
function getCardInfo(doc, options = {}) {
    if (!doc) return null;
    const windowInfo = getWindowInfo(doc, options);
    if (!windowInfo.hasSub && !windowInfo.hasDub) return null;

    let sub = null;
    if (windowInfo.hasSub) {
        if (doc.sub) {
            sub = doc.sub;
        } else {
            const episode = findNewestEpisode(doc, (ep) => ep.subIta, options);
            if (episode) sub = { season: episode.season, episode: episode.episode };
        }
    }

    let dub = null;
    if (windowInfo.hasDub) {
        if (doc.dub) {
            dub = doc.dub;
        } else {
            const episode = findNewestEpisode(doc, (ep) => ep.dubIta, options);
            if (episode) dub = { season: episode.season, episode: episode.episode };
        }
    }

    if (!sub && !dub) return null;

    return {
        sub,
        dub,
        hasSubInWindow: windowInfo.hasSub,
        hasDubInWindow: windowInfo.hasDub,
        lastAiredAt: windowInfo.lastAiredAt
    };
}

/**
 * Lista delle novità (finestra 14 giorni) ordinata per data dell'ultimo episodio
 * disponibile, più recente in testa.
 */
function getNoveltyEntries(snapshot, options = {}) {
    const docs = snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : [];
    const entries = [];

    for (const doc of docs) {
        const windowInfo = getWindowInfo(doc, options);
        if (!windowInfo.hasSub && !windowInfo.hasDub) continue;
        entries.push({
            doc,
            tmdbId: doc.tmdbId,
            kitsuId: doc.kitsuId,
            hasSubInWindow: windowInfo.hasSub,
            hasDubInWindow: windowInfo.hasDub,
            lastAiredAt: windowInfo.lastAiredAt
        });
    }

    entries.sort((a, b) => (b.lastAiredAt || 0) - (a.lastAiredAt || 0));
    return entries;
}

/**
 * Tutti i documenti con sub o dub presenti appartenenti alla lista "In corso" di AnimeUnity.
 * Regola di appartenenza (configurabile):
 * - se doc.listSeenAt c'è -> includi finché (now - listSeenAt) <= 14 giorni (default LIST_WINDOW_DAYS)
 * - se manca (transizione, doc legacy) -> includi solo se (now - updatedAt) <= 12 ore (default AIRING_FRESHNESS_HOURS)
 * Ordinati per orderIndex se presente, altrimenti per listSeenAt/updatedAt decrescente.
 */
function getAiringEntries(snapshot, options = {}) {
    const docs = snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : [];
    const entries = [];

    const opts = options && typeof options === 'object' ? options : {};
    const nowMs = Number.isFinite(opts.now) ? opts.now : Date.now();

    const listDays = Number.isFinite(opts.listWindowDays) && opts.listWindowDays > 0
        ? opts.listWindowDays
        : LIST_WINDOW_DAYS;
    const listMaxAgeMs = Number.isFinite(opts.listMaxAgeMs) && opts.listMaxAgeMs > 0
        ? opts.listMaxAgeMs
        : listDays * DAY_MS;

    const freshnessHours = Number.isFinite(opts.freshnessHours) && opts.freshnessHours > 0
        ? opts.freshnessHours
        : AIRING_FRESHNESS_HOURS;
    const legacyMaxAgeMs = Number.isFinite(opts.maxAgeMs) && opts.maxAgeMs > 0
        ? opts.maxAgeMs
        : freshnessHours * HOUR_MS;

    for (const doc of docs) {
        const hasSub = Boolean(doc.sub);
        const hasDub = Boolean(doc.dub);
        if (!hasSub && !hasDub) continue;

        let isIncluded = false;
        if (doc.listSeenAt !== null && doc.listSeenAt !== undefined) {
            isIncluded = (nowMs - doc.listSeenAt) <= listMaxAgeMs;
        } else {
            isIncluded = doc.updatedAt !== null && doc.updatedAt !== undefined && (nowMs - doc.updatedAt) <= legacyMaxAgeMs;
        }

        if (!isIncluded) {
            continue;
        }

        const windowInfo = getWindowInfo(doc);
        const docAiredAt = getDocAiredAt(doc);

        entries.push({
            doc,
            tmdbId: doc.tmdbId,
            kitsuId: doc.kitsuId,
            orderIndex: doc.orderIndex !== undefined && doc.orderIndex !== null ? doc.orderIndex : null,
            hasSubInWindow: windowInfo.hasSub,
            hasDubInWindow: windowInfo.hasDub,
            airedAt: docAiredAt,
            lastAiredAt: docAiredAt || windowInfo.lastAiredAt || doc.listSeenAt || doc.updatedAt || null
        });
    }

    entries.sort((a, b) => {
        const airedA = a.airedAt;
        const airedB = b.airedAt;
        const hasAiredA = Number.isFinite(airedA) && airedA > 0;
        const hasAiredB = Number.isFinite(airedB) && airedB > 0;

        if (hasAiredA && hasAiredB) {
            if (airedB !== airedA) {
                return airedB - airedA;
            }
        } else if (hasAiredA) {
            return -1;
        } else if (hasAiredB) {
            return 1;
        }

        // A parità o in mancanza di airedAt: listSeenAt decrescente
        const seenA = a.doc && Number.isFinite(a.doc.listSeenAt) && a.doc.listSeenAt > 0 ? a.doc.listSeenAt : null;
        const seenB = b.doc && Number.isFinite(b.doc.listSeenAt) && b.doc.listSeenAt > 0 ? b.doc.listSeenAt : null;
        const hasSeenA = seenA !== null;
        const hasSeenB = seenB !== null;

        if (hasSeenA && hasSeenB) {
            if (seenB !== seenA) {
                return seenB - seenA;
            }
        } else if (hasSeenA) {
            return -1;
        } else if (hasSeenB) {
            return 1;
        }

        // A parità o in mancanza di listSeenAt: orderIndex crescente
        const hasOrderA = Number.isFinite(a.orderIndex);
        const hasOrderB = Number.isFinite(b.orderIndex);

        if (hasOrderA && hasOrderB) {
            if (a.orderIndex !== b.orderIndex) {
                return a.orderIndex - b.orderIndex;
            }
        } else if (hasOrderA) {
            return -1;
        } else if (hasOrderB) {
            return 1;
        }

        // Ultimo fallback su updatedAt decrescente
        const updatedA = (a.doc && a.doc.updatedAt) || 0;
        const updatedB = (b.doc && b.doc.updatedAt) || 0;
        return updatedB - updatedA;
    });

    return entries;
}

/**
 * Trova il documento di stato a partire da un id item di catalogo
 * (`kitsu:123`, `kitsu:123_ita_offset`, `tmdb:456` o `456`).
 */
function findDocument(snapshot, itemId) {
    if (!snapshot || !itemId) return null;
    const raw = String(itemId).replace(/_ita_offset$/, '');
    const parts = raw.split(':');

    if (parts[0] === 'kitsu' && parts[1]) {
        return (snapshot.byKitsuId && snapshot.byKitsuId.get(parts[1])) || null;
    }
    if (parts[0] === 'tmdb') {
        if (/^\d+$/.test(parts[1])) {
            return (snapshot.byTmdbId && snapshot.byTmdbId.get(parts[1])) || null;
        }
        if (parts.length > 2 && /^\d+$/.test(parts[2])) {
            return (snapshot.byTmdbId && snapshot.byTmdbId.get(parts[2])) || null;
        }
    }
    if (/^\d+$/.test(raw)) {
        return (snapshot.byTmdbId && snapshot.byTmdbId.get(raw)) || null;
    }
    return null;
}

function getCardInfoForId(snapshot, itemId, options = {}) {
    return getCardInfo(findDocument(snapshot, itemId), options);
}

/**
 * Ritorna l'episodio doppiato più recente dal documento, oppure null se non è doppiato.
 * Legge `italian.dub.latest`, con fallback sull'episodio più recente con `dubIta: true`.
 */
function getDubEpisode(doc) {
    if (!doc) return null;
    if (doc.dub && Number.isFinite(doc.dub.episode) && doc.dub.episode > 0) {
        return doc.dub.episode;
    }
    if (Array.isArray(doc.episodes)) {
        let maxEp = 0;
        for (const ep of doc.episodes) {
            if (ep.dubIta && Number.isFinite(ep.episode) && ep.episode > maxEp) {
                maxEp = ep.episode;
            }
        }
        if (maxEp > 0) return maxEp;
    }
    return null;
}

/**
 * Soglia del veto: oltre, il documento è una serie. **Copia di `MOVIE_MAX_EPISODES`** in
 * `services/doppiaggi-source/src/anime.js` (il writer delle annotazioni): se le due soglie
 * divergono, il lettore e il writer non concordano più su cosa sia un film.
 */
const MOVIE_MAX_EPISODES = 3;

/**
 * Il documento è un **film doppiato**? È la prova che il lettore delle annotazioni esige prima di
 * accettare il fallback a due tipi (ticket 50: `allowTypeFallback` in `src/data/itaAnnotations.js`).
 *
 * PERCHÉ SERVE LA PROVA E NON BASTA `isAnime`: il badge si mette su una card, e un id TMDB film può
 * essere anche l'id di una serie (5.933 id vivono in entrambe le tabelle). Misurato il 04/10/2026
 * sull'istantanea di produzione: fra le card film che un fallback cieco avrebbe fatto diventare
 * "doppiate", 196 hanno un documento anime e **152 di quelle sono serie** — il badge sarebbe
 * finito su 152 film estranei. Il veto sugli episodi (lo stesso del writer) li tiene fuori: i film
 * veri hanno 1 episodio, le serie una corsa.
 *
 * @param {object} doc Documento normalizzato (`buildSnapshot`).
 * @returns {boolean}
 */
function isDubbedFilmDoc(doc) {
    if (!doc) return false;
    if (getDubEpisode(doc) === null) return false; // nessuna traccia di doppiaggio: nessun badge
    let maxEp = 0;
    for (const ep of Array.isArray(doc.episodes) ? doc.episodes : []) {
        const n = Number(ep && ep.episode);
        if (Number.isFinite(n) && n > maxEp) maxEp = n;
    }
    return maxEp <= MOVIE_MAX_EPISODES;
}

/**
 * LE DUE PROVE che autorizzano il fallback a due tipi del ticket 50 (il lettore delle annotazioni
 * pretende entrambe, cfr. `allowTypeFallback` in `src/data/itaAnnotations.js`).
 *
 *  1. **È un film doppiato**: lo dice il documento, col veto sugli episodi. Le serie restano fuori
 *     (una serie ha una corsa di episodi; un film ne ha uno).
 *  2. **Quell'id TMDB è davvero un film**: lo dice la mappa certificata, che tiene il tipo
 *     (`themoviedb_id.movie` di Fribb → `resolveKitsuMovie`). È la seconda metà della guardia,
 *     e non è un dettaglio: il documento anime porta un solo id, e per molti titoli è **l'id
 *     della serie** (TMDB cataloga anche film e serie con lo stesso numero, quindi l'id esiste in
 *     entrambe le tabelle). Se l'id è quello di una serie, la card `movie:<id>` è **un film
 *     estraneo** — misurato il 04/10/2026: dei 104 id che passano la prova 1, 74 non hanno il film
 *     e finirebbero col badge di *Jin-Roh*; con la prova 2 ne restano 30, e sono tutti film veri
 *     (Nausicaä, Totoro, Jin-Roh, Perfect Blue, Tokyo Godfathers…).
 *
 * La prova 2 è il tipo che il writer delle annotazioni conosce e butta via (ticket 50, punto 1):
 * qui non lo si ricostruisce, lo si legge dalla stessa fonte certificata.
 *
 * @param {object|null} doc Documento anime normalizzato della card.
 * @param {number|string} tmdbId Id TMDB della card (quello su cui il badge andrebbe).
 * @param {object} mappingStore `animeMappingStore` (iniettato: questo modulo non lo richiede).
 * @returns {boolean}
 */
function isDubbedFilmDocForCard(doc, tmdbId, mappingStore) {
    if (!isDubbedFilmDoc(doc)) return false;
    if (!mappingStore || typeof mappingStore.resolveKitsuMovie !== 'function') return false;
    const kitsuId = mappingStore.resolveKitsuMovie(tmdbId);
    return kitsuId !== null && kitsuId !== undefined && kitsuId !== '';
}

function getDubEpisodeForId(snapshot, itemId) {
    return getDubEpisode(findDocument(snapshot, itemId));
}

/**
 * Id Stremio della card. Le due card (sub e ITA) condividono lo stesso id:
 * preferiamo la risoluzione di YACA (`animeMappingStore`, la stessa lingua di metaHandler),
 * con fallback sull'`ids.kitsu` del documento e infine sul TMDB id.
 */
function resolveCardId(entry, mappingStore = null) {
    const doc = entry && entry.doc ? entry.doc : entry;
    if (!doc) return null;

    // Riferimento per la stagione: l'episodio badge più recente tra sub e doppiato.
    // Usiamo i `latest` del documento (non la finestra): l'identità non dipende dal tempo.
    const reference = doc.sub && doc.dub
        ? (compareEpisodeRefs(doc.dub, doc.sub) >= 0 ? doc.dub : doc.sub)
        : (doc.sub || doc.dub);

    if (mappingStore && reference) {
        try {
            const mapped = mappingStore.resolveKitsu(doc.tmdbId, reference.season, reference.episode);
            if (mapped && mapped.success && mapped.kitsuId) {
                return `kitsu:${mapped.kitsuId}`;
            }
        } catch (_e) {
            // Fallback sotto: il mapping non deve mai bloccare il catalogo.
        }
    }

    if (doc.kitsuId) return `kitsu:${doc.kitsuId}`;
    return `tmdb:${doc.tmdbId}`;
}

// ─── Hook di test (nessun Mongo vivo richiesto) ──────────────────────────────

function setDataSourceForTests(fn) {
    dataSource = typeof fn === 'function' ? fn : defaultDataSource;
    resetForTests(true);
}

function resetForTests(keepDataSource = false) {
    cache.snapshot = null;
    cache.fetchedAt = 0;
    cache.inflight = null;
    cache.lastLogKey = null;
    cache.lastLogAt = 0;
    if (!keepDataSource) dataSource = defaultDataSource;
}

module.exports = {
    COLLECTION_NAME,
    SUPPORTED_SCHEMA_VERSION,
    CACHE_TTL_MS,
    NOVELTY_WINDOW_DAYS,
    AIRING_FRESHNESS_HOURS,
    LIST_WINDOW_DAYS,
    getSnapshot,
    getNoveltyEntries,
    getAiringEntries,
    getDocAiredAt,
    getCardInfo,
    getCardInfoForId,
    getWindowInfo,
    findDocument,
    getDubEpisode,
    getDubEpisodeForId,
    isDubbedFilmDoc,
    isDubbedFilmDocForCard,
    resolveCardId,
    validateDocument,
    buildSnapshot,
    setDataSourceForTests,
    resetForTests
};
