/**
 * animeAiringState.js
 *
 * Lettore lato YACA della collezione `anime_airing_state` scritta dal modulo esterno
 * `services/anime-source` (contratto: ticket `07`, consumo: ticket `13`).
 *
 * IL CATALOGO "Simulcast (Nuovi Episodi)" LEGGE `homeReleases` (ticket 52, 04/10/2026):
 * chi ha un episodio uscito nelle ultime due settimane, secondo la HOME di AnimeUnity
 * paginata. `EP n` è il campo `number` dell'item della home, `ITA n` è l'omonimo canale
 * dichiarato da `anime.dub`. La finestra l'ha già applicata la fonte, sul dato della fonte
 * (`created_at`): qui NON c'è nessuna finestra sui nostri campi, nessuna `AIRING_FRESHNESS_HOURS`
 * e nessun `listSeenAt`/`updatedAt`. Un solo dato di freschezza resta, ed è sempre della
 * fonte: `homeReleases.checkedAt`, quando l'abbiamo visto l'ultima volta (`HOME_MAX_AGE_DAYS`).
 *
 * Cosa resta in vita e perché (non è tutto morto):
 *  - `sub`/`dub`/`italian` e `episodes[]` restano letti per i DUE consumatori che non sono
 *    il simulcast: il backfill di novità (`getNoveltyEntries`, vedi `scripts/backfill-airing-anime.js`)
 *    e l'unione delle annotazioni ITA (`services/doppiaggi-source`, che legge `dub`/`episodes[]`
 *    e il `mediaType` dichiarato).
 *  - `_id` = TMDB id in stringa (chiave di dedup/lookup);
 *  - `schemaVersion` = 1; i documenti con versione più alta vengono IGNORATI (degrado, mai crash);
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
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Quanto può essere vecchia la conferma della fonte (`homeReleases.checkedAt`) prima che il
 * lettore smetta di considerare il titolo "in simulcast".
 *
 * PERCHÉ UN LIMITE E NON ZERO: se il servizio `anime-source` resta fermo (rete, container,
 * deploy) la collezione non si azzera — e servire una lista di due settimane fa come "le
 * ultime due settimane" è la bugia più economica da raccontare. Dopo tre giorni di silenzio
 * il catalogo vuoto è la risposta onesta: non sappiamo, e non inventiamo. Tre giorni, non uno,
 * perché il giro completo è giornaliero: due passate perse di fila devono poter passare.
 */
const HOME_MAX_AGE_DAYS = 3;

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
    homeReleases: 1,
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
        homeInWindow: 0,
        homeStale: 0,
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
 * Una voce `homeReleases`: cosa ha visto la fonte su quell'anime.
 * `{ checkedAt, sub: {episode, airedAt}|null, dub: {episode, airedAt}|null }`
 *
 * Un episodio senza numero non è un episodio (0, assente, non numerico → `null`), quindi la
 * serie annunciata — che sulla home non c'è, e qui non c'è neppure — non può produrre un
 * `EP 0`: non avrebbe niente da mostrare.
 */
function normalizeHomeReleases(value) {
    if (!value || typeof value !== 'object') return null;

    const episodeOf = (raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const episode = toFiniteNumber(raw.episode);
        if (episode === null || episode <= 0) return null;
        const airedAt = normalizeTimestamp(raw.airedAt);
        return airedAt === null ? { episode } : { episode, airedAt };
    };

    const sub = episodeOf(value.sub);
    const dub = episodeOf(value.dub);
    if (!sub && !dub) return null;

    return {
        checkedAt: normalizeTimestamp(value.checkedAt),
        sub,
        dub
    };
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
            home: normalizeHomeReleases(raw.homeReleases),
            listSeenAt: normalizeTimestamp(raw.listSeenAt),
            updatedAt: normalizeTimestamp(raw.updatedAt)
        }
    };
}

function buildSnapshot(rawDocs) {
    const snapshot = emptySnapshot();
    const nowMs = Date.now();
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
        if (isHomeStale(result.doc.home, nowMs)) {
            snapshot.homeStale++;
        } else if (result.doc.home) {
            snapshot.homeInWindow++;
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
            : `ok:${snapshot.docs.length}:${snapshot.ignoredSchema}:${snapshot.invalid}:${snapshot.homeInWindow}:${snapshot.homeStale}`;

        if (cache.lastLogKey === key && now - cache.lastLogAt < CACHE_TTL_MS) return;
        cache.lastLogKey = key;
        cache.lastLogAt = now;

        if (error) {
            const served = snapshot.docs.length > 0 ? `${snapshot.docs.length} serie dall'ultimo stato noto` : 'catalogo vuoto';
            console.warn(`[AnimeAiringState] Lettura ${COLLECTION_NAME} fallita (${error.message}); servo ${served}.`);
            return;
        }
        if (snapshot.ignoredSchema > 0 || snapshot.invalid > 0 || snapshot.homeStale > 0) {
            console.warn(
                `[AnimeAiringState] ${snapshot.docs.length} serie valide; ` +
                `${snapshot.ignoredSchema} ignorate (schemaVersion > ${SUPPORTED_SCHEMA_VERSION}); ` +
                `${snapshot.invalid} scartate (documento malformato); ` +
                `home: ${snapshot.homeInWindow} in finestra, ${snapshot.homeStale} con conferma più vecchia di ${HOME_MAX_AGE_DAYS} giorni.`
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

/**
 * La conferma della fonte è troppo vecchia per essere ancora "le ultime due settimane"?
 * `checkedAt` assente non è un "vecchio": è "non lo sappiamo", e la dichiarazione vale
 * (è comunque la fonte a scrivere quel campo; se manca è un bug del writer, non del lettore).
 */
function isHomeStale(home, nowMs) {
    if (!home) return false;
    if (home.checkedAt === null) return false;
    return (nowMs - home.checkedAt) > HOME_MAX_AGE_DAYS * DAY_MS;
}

/**
 * LA REGOLA DEL CATALOGO NOVITÀ (ticket 52, 04/10/2026): nel catalogo sta chi ha un episodio
 * uscito nelle ultime due settimane, e lo dice la HOME di AnimeUnity (`homeReleases`).
 *
 * Un posto solo, due usi: l'appartenenza alla lista (`getAiringEntries`) e il numero sui
 * badge (`getCardInfo`). Una regola sola vuol dire che non possono divergere: è la stessa
 * domanda, "la fonte ha detto che questo episodio è uscito?", con la stessa risposta.
 *
 * - `sub`/`dub` null → niente: la card non entra, e non nasce nessun `EP 0`;
 * - conferma più vecchia di `HOME_MAX_AGE_DAYS` → non entra (la fonte non parla da troppo);
 * - `lastAiredAt` = la data dell'ultimo episodio che la fonte ha visto, che è anche l'ordine
 *   della lista (più recente in testa), e adesso VERO perché viene dalla fonte.
 *
 * Non guarda `episodes[]`, non guarda `listSeenAt`, non guarda `updatedAt`: sono i nostri
 * campi, e non c'entrano con l'essere in onda.
 *
 * @returns {{hasSub: boolean, hasDub: boolean, sub: Object|null, dub: Object|null, lastAiredAt: number|null, checkedAt: number|null}|null}
 */
function getHomeInfo(doc, options = {}) {
    if (!doc || !doc.home) return null;

    const opts = normalizeOptions(options);
    const nowMs = Number.isFinite(opts.now) ? opts.now : Date.now();
    const maxAgeDays = Number.isFinite(opts.maxAgeDays) && opts.maxAgeDays > 0 ? opts.maxAgeDays : HOME_MAX_AGE_DAYS;

    const home = doc.home;
    if (!home.sub && !home.dub) return null;
    if (home.checkedAt !== null && (nowMs - home.checkedAt) > maxAgeDays * DAY_MS) return null;

    const lastAiredAt = Math.max(
        home.sub && home.sub.airedAt !== null && home.sub.airedAt !== undefined ? home.sub.airedAt : null,
        home.dub && home.dub.airedAt !== null && home.dub.airedAt !== undefined ? home.dub.airedAt : null
    );

    return {
        hasSub: Boolean(home.sub),
        hasDub: Boolean(home.dub),
        sub: home.sub ? { episode: home.sub.episode } : null,
        dub: home.dub ? { episode: home.dub.episode } : null,
        lastAiredAt: Number.isFinite(lastAiredAt) ? lastAiredAt : null,
        checkedAt: home.checkedAt
    };
}

/**
 * Flag della finestra per un documento: c'è un sub/ITA uscito negli ultimi N giorni?
 * `lastAiredAt` = data (ms) dell'episodio disponibile più recente nella finestra.
 * Se episodes[] è assente o vuoto ma sub/dub ci sono, considerali disponibili
 * (la "finestra" non è più una data: è la presenza nella lista).
 *
 * Serve al **backfill di novità** (`getNoveltyEntries`, `scripts/backfill-airing-anime.js`),
 * NON al catalogo simulcast: per il catalogo vale `getHomeInfo`, cioè la home.
 */
function getWindowInfo(doc, options = {}) {
    if (!doc) return { hasSub: false, hasDub: false, lastAiredAt: null };

    // Documenti nuovi senza episodes[]: la presenza nella lista certifica la disponibilità
    if (!Array.isArray(doc.episodes) || doc.episodes.length === 0) {
        const hasSub = Boolean(doc.sub);
        const hasDub = Boolean(doc.dub);
        let lastAiredAt = null;
        for (const value of [doc.sub && doc.sub.airedAt, doc.dub && doc.dub.airedAt]) {
            const at = normalizeTimestamp(value);
            if (at !== null && (lastAiredAt === null || at > lastAiredAt)) lastAiredAt = at;
        }
        return {
            hasSub,
            hasDub,
            lastAiredAt: lastAiredAt || doc.listSeenAt || doc.updatedAt || null
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

/**
 * Informazioni per le due card di un documento: la STESSA regola che decide l'appartenenza
 * al catalogo (`getHomeInfo`), letta sul campo che la fonte scrive.
 * - `sub`: `EP {episode}` dalla home, presente se la fonte ha visto un episodio sub in finestra;
 * - `dub`: `ITA {episode}`, presente se la fonte ha visto un episodio doppiato in finestra.
 *
 * Ritorna null quando il documento non porta episodi di home, ed è anche l'esito giusto per
 * una serie **annunciata**: non è sulla home, quindi non entra e non mostra niente.
 * Nessun `EP 0`: il numero viene dalla fonte e, se la fonte non dà un numero, la card non
 * porta quel canale.
 */
function getCardInfo(doc, options = {}) {
    return getHomeInfo(doc, options);
}

/**
 * Lista delle novità (finestra 14 giorni) ordinata per data dell'ultimo episodio
 * disponibile, più recente in testa.
 *
 * CONSUMATORE DIVERSO, STESSI DOCUMENTI: questa lista risponde a "quali titoli sono una
 * novità per il backfill TMDB", e per quello continua a usare `episodes[]` e le nostre date.
 * Il catalogo simulcast non passa di qui (vedi `getAiringEntries`).
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
 * LE VOCI DEL CATALOGO "Simulcast (Nuovi Episodi)": chi ha un episodio uscito nelle ultime
 * due settimane, secondo la HOME di AnimeUnity. Ordine: l'ultimo episodio uscito, prima.
 *
 * È tutta la regola in un posto solo (`getHomeInfo`): niente `listSeenAt`, niente
 * `updatedAt`, niente `AIRING_FRESHNESS_HOURS`, niente `episodes[]`, niente `orderIndex`.
 * Non è una scelta estetica: sono i campi con cui il simulcast di oggi decideva, e nessuno
 * dei due dice "essere in onda" (il `listSeenAt` vuol dire "essere nella lista In corso",
 * l'`updatedAt` vuol dire "quando l'abbiamo scritto"). La home sì: la sua data è la data
 * dell'uscita.
 *
 * Cosa è morto con la regola vecchia: la finestra di 14 giorni sui nostri campi, le 12 ore
 * di freschezza, `sub.latest`/`dub.latest` come fonte del badge, e il ramo `normalizeLatest`
 * con il caso zero — la serie annunciata non è sulla home, quindi non entra, e `EP 0` non
 * esiste più nemmeno come possibilità.
 *
 * @returns {Array<{doc, tmdbId, kitsuId, subEpisode, dubEpisode, hasSub, hasDub, lastAiredAt}>}
 */
function getAiringEntries(snapshot, options = {}) {
    const docs = snapshot && Array.isArray(snapshot.docs) ? snapshot.docs : [];
    const entries = [];

    for (const doc of docs) {
        const home = getHomeInfo(doc, options);
        if (!home) continue;

        entries.push({
            doc,
            tmdbId: doc.tmdbId,
            kitsuId: doc.kitsuId,
            hasSub: home.hasSub,
            hasDub: home.hasDub,
            subEpisode: home.sub ? home.sub.episode : null,
            dubEpisode: home.dub ? home.dub.episode : null,
            lastAiredAt: home.lastAiredAt
        });
    }

    // Più recente prima; a parità di data l'ordine è stabile (titolo): due titoli usciti
    // lo stesso giorno non devono cambiare posto a ogni richiesta.
    entries.sort((a, b) => {
        const delta = (b.lastAiredAt || 0) - (a.lastAiredAt || 0);
        if (delta !== 0) return delta;
        return String((a.doc && a.doc.title) || '').localeCompare(String((b.doc && b.doc.title) || ''));
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
 *
 * PERCHE' IL RIFERIMENTO VIENE DA `sub`/`dub` E NON DA `homeReleases`: qui si risolve
 * l'IDENTITÀ, non l'appartenenza. La mappa Anibridge è per `(tmdb, stagione, episodio TMDB)` e
 * la stagione la sa il ciclo dell'archivio, non la home (l'item della home non porta la
 * stagione). È l'unico pezzo che questo disegno non toglie, ed è rimasto com'era.
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
    HOME_MAX_AGE_DAYS,
    getSnapshot,
    getNoveltyEntries,
    getAiringEntries,
    getCardInfo,
    getCardInfoForId,
    getWindowInfo,
    getHomeInfo,
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
