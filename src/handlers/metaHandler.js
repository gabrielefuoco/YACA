const { getTmdbMetaDetails, fetchTmdbEpisodes, createTmdbClient, resolveImdbId } = require('../clients/tmdb');
const { translateImdbToTmdb } = require('../id_mapping/id_cache');
const CacheManager = require('../cache/CacheManager');
const animeMappingStore = require('../data/animeMappingStore');
const { getDuckDbMetaDetails } = require('../catalog/providers/DuckDbProvider');
const { schedulePromotion } = require('../db/tier1LazyPromotion');
const { normalizeAnimeMarker, extractAnimeTmdbId } = require('../utils/animeIdentity');
const duckDbStore = require('../db/duckDbStore');
const itaAnnotations = require('../data/itaAnnotations');
const animeAiringState = require('../data/animeAiringState');

// Cache per l'oggetto meta finale combinato
const finalMetaCache = new CacheManager('final_meta_cache', { ramMax: 300, ramTtlMs: 3600000, swrMs: 600000 });

// --- Monitoraggio e Statistiche Kitsu Mapping (bounded in RAM) ---
const MAX_TRACKED_KEYS = 200; // Tetto massimo chiavi in memoria per il container (1536MB)
const LOG_INTERVAL_MISSES = 50; // Soglia log aggregato: ogni 50 miss
const LOG_INTERVAL_COLLISIONS = 10; // Soglia log aggregato: ogni 10 collisioni
const LOG_INTERVAL_MS = 10 * 60 * 1000; // Frequenza temporale massima per log: 10 minuti

const kitsuStats = {
    totalMisses: 0,
    totalCollisions: 0,
    misses: new Map(), // key: `${tmdbId}:${season}` -> count
    collisions: new Map() // key: targetId (`kitsu:${kitsuId}:${kitsuEpisode}`) -> count
};

let lastLoggedMisses = 0;
let lastLoggedCollisions = 0;
let lastLogTime = Date.now();

/**
 * Incrementa il contatore in una Map con tetto massimo (MAX_TRACKED_KEYS).
 * Scelta di limitazione memoria: se la mappa è piena, espelle la prima chiave con frequenza minima
 * (minVal <= 1) per accogliere nuove chiavi emergenti; se tutte le 200 chiavi hanno già occorrenze
 * ripetute (> 1), smette di aggiungere nuove chiavi per prevenire thrashing da miss isolati.
 * In entrambi i casi i contatori globali (totalMisses, totalCollisions) continuano a salire.
 */
function incrementBoundedMap(map, key) {
    if (map.has(key)) {
        map.set(key, map.get(key) + 1);
        return;
    }

    if (map.size < MAX_TRACKED_KEYS) {
        map.set(key, 1);
        return;
    }

    let minKey = null;
    let minVal = Infinity;
    for (const [k, v] of map) {
        if (v < minVal) {
            minVal = v;
            minKey = k;
            if (minVal <= 1) break; // Ottimizzazione: non può scendere sotto 1
        }
    }

    if (minVal <= 1 && minKey !== null) {
        map.delete(minKey);
        map.set(key, 1);
    }
}

function getTopEntries(map, limit = 5) {
    if (map.size === 0) return '';
    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([k, v]) => `${k} (${v})`)
        .join(', ');
}

function checkAndLogAggregatedStats() {
    try {
        const missDiff = kitsuStats.totalMisses - lastLoggedMisses;
        const collDiff = kitsuStats.totalCollisions - lastLoggedCollisions;
        const now = Date.now();
        const timeDiff = now - lastLogTime;

        const shouldLog =
            missDiff >= LOG_INTERVAL_MISSES ||
            collDiff >= LOG_INTERVAL_COLLISIONS ||
            ((missDiff > 0 || collDiff > 0) && timeDiff >= LOG_INTERVAL_MS);

        if (shouldLog) {
            lastLoggedMisses = kitsuStats.totalMisses;
            lastLoggedCollisions = kitsuStats.totalCollisions;
            lastLogTime = now;

            const topMisses = getTopEntries(kitsuStats.misses, 5);
            const topCollisions = getTopEntries(kitsuStats.collisions, 5);

            console.warn(
                `[KitsuMapping Stats] Misses: ${kitsuStats.totalMisses} (top: ${topMisses || 'nessuno'}), ` +
                `Collisioni: ${kitsuStats.totalCollisions} (top: ${topCollisions || 'nessuna'})`
            );
        }
    } catch (_e) {
        // Nessun errore nei log deve propagarsi o interrompere la richiesta
    }
}

function recordMiss(tmdbId, season) {
    if (tmdbId === null || tmdbId === undefined) return;
    const cleanSeason = season !== undefined && season !== null ? season : 1;
    const key = `${tmdbId}:${cleanSeason}`;

    kitsuStats.totalMisses++;
    incrementBoundedMap(kitsuStats.misses, key);
    checkAndLogAggregatedStats();
}

function recordCollision(targetId) {
    if (!targetId) return;
    const key = String(targetId);

    kitsuStats.totalCollisions++;
    incrementBoundedMap(kitsuStats.collisions, key);
    checkAndLogAggregatedStats();
}

function getKitsuMappingStats() {
    return {
        totalMisses: kitsuStats.totalMisses,
        totalCollisions: kitsuStats.totalCollisions,
        missesCount: kitsuStats.misses.size,
        collisionsCount: kitsuStats.collisions.size,
        misses: new Map(kitsuStats.misses),
        collisions: new Map(kitsuStats.collisions)
    };
}

function resetKitsuMappingStats() {
    kitsuStats.totalMisses = 0;
    kitsuStats.totalCollisions = 0;
    kitsuStats.misses.clear();
    kitsuStats.collisions.clear();
    lastLoggedMisses = 0;
    lastLoggedCollisions = 0;
    lastLogTime = Date.now();
}

async function applyKitsuMappingToMeta(meta, tmdbId) {
    if (!meta) return;

    // Stesso resolver e stesso default del catalogo. Un marker assente senza
    // prove diventa false e non avvia enrichment Kitsu.
    const isAnime = normalizeAnimeMarker(meta);
    if (!isAnime) return;

    if (meta.type === 'movie') {
        const kitsuId = animeMappingStore.resolveKitsuMovie(tmdbId);
        if (kitsuId) {
            meta.behaviorHints = meta.behaviorHints || {};
            meta.behaviorHints.defaultVideoId = `kitsu:${kitsuId}`;
        } else if (meta._isAnime) {
            console.log(`[Mapping Fallback] Film Anime TMDB ${tmdbId} non ha Kitsu ID. Usa ID TMDB nativo.`);
        }
        return;
    }

    if (meta.type === 'series' && Array.isArray(meta.videos)) {
        let fallbackCount = 0;
        const usedKitsuIds = new Set();

        for (const video of meta.videos) {
            const mapped = animeMappingStore.resolveKitsu(tmdbId, video.season, video.episode);
            
            if (mapped && mapped.success) {
                const targetId = `kitsu:${mapped.kitsuId}:${mapped.kitsuEpisode}`;
                // Se questo Kitsu ID è già stato assegnato a un altro episodio TMDB, c'è una collisione in Anibridge.
                // Invece di far sparire l'episodio da Stremio (che deduplica gli id), facciamo fallback all'ID TMDB nativo.
                if (usedKitsuIds.has(targetId)) {
                    fallbackCount++;
                    recordCollision(targetId);
                } else {
                    usedKitsuIds.add(targetId);
                    video.id = targetId;
                }
            } else if (isAnime) {
                fallbackCount++;
                recordMiss(tmdbId, video.season);
            }
        }
        if (fallbackCount > 0) {
             console.log(`[Mapping Fallback] Serie Anime TMDB ${tmdbId} ha ${fallbackCount} episodi non mappati (mantenuto ID nativo).`);
        }
    }
}



/**
 * Gli id degli episodi vanno in forma IMDb (`tt…:S:E`), se l'id IMDb è noto.
 *
 * PERCHÉ SEMPRE IMDb, e non "la forma della richiesta": l'umano apre le serie dai nostri
 * cataloghi, che danno id `tmdb:` (misurato in produzione il 03/10/2026: 20 card su 20).
 * Stremio poi chiede gli stream **agli altri addon** con gli id che trova in `meta.videos`,
 * e gli addon non capiscono la forma `tmdb:`. Misurato su Torrentio: `tt0108778:1:1` → 53
 * stream, `tmdb:1668:1:1` → 0 stream. Con la forma della richiesta gli episodi restavano
 * `tmdb:` (che è la forma con cui l'umano apre) e il sintomo era "una sorgente su tre" con
 * l'episodio sempre uguale. L'id IMDb, invece, è *sempre* la forma che le fonti capiscono:
 * quindi si usa quando si può, e si cade al comportamento di prima solo quando non si può.
 *
 * Il fallback resta la forma della richiesta: senza l'id IMDb non c'è niente di meglio da
 * mettere, e cambiare `meta.id` (che è la forma della richiesta per costruzione) non è
 * un'opzione — Stremio tiene libreria e stato "visto" del titolo su quell'id.
 *
 * ATTENZIONE — la trappola: `meta.videos` arriva da `tvEpisodesCache`, cioè è lo stesso
 * array (e gli stessi oggetti video) conservati in cache. Riscrivere ids *sull'oggetto
 * ricevuto* avvelenerebbe la cache. Qui si lavora quindi su una copia e si restituisce una
 * meta nuova, lasciando intatti l'oggetto in cache e l'array degli episodi.
 *
 * Gli anime non si toccano: hanno già il loro percorso (`kitsu:...`) e il fallback sugli
 * id nativi TMDB è voluto. Gli id `kitsu:` dentro la lista non si toccano per lo stesso
 * motivo, e nessun altro campo del video viene scritto.
 *
 * @param {Object} meta Scheda (non viene mutata).
 * @param {string} requestedId Id come richiesto da Stremio, senza il suffisso `_ita_offset`.
 * @param {string} [imdbIdPerEpisodi] Id IMDb del titolo, se risolto (forma `tt…`).
 * @returns {Object} Scheda con gli id allineati (la stessa se non c'è nulla da fare).
 */
function alignVideoIdsToRequestedForm(meta, requestedId, imdbIdPerEpisodi) {
    if (!meta) return meta;
    if (!Array.isArray(meta.videos) || meta.videos.length === 0) return meta;
    if (normalizeAnimeMarker(meta)) return meta;

    // L'id IMDb quando è noto; altrimenti la forma della richiesta, se è già IMDb.
    const prefisso =
        typeof imdbIdPerEpisodi === 'string' && imdbIdPerEpisodi.startsWith('tt')
            ? imdbIdPerEpisodi
            : typeof requestedId === 'string' && requestedId.startsWith('tt')
                ? requestedId
                : null;

    // Né id IMDb né richiesta in forma IMDb: gli id degli episodi restano quelli che hanno.
    if (!prefisso) return meta;

    let rewritten = false;
    const videos = meta.videos.map((video) => {
        if (!video || typeof video.id !== 'string') return video;

        const parts = video.id.split(':');
        // Id episodio = <prefisso>:<stagione>:<episodio> (o `kitsu:<kitsuId>:<episodio>`).
        if (parts.length < 3 || video.id.startsWith('kitsu:')) return video;

        const season = video.season !== undefined && video.season !== null ? video.season : parts[parts.length - 2];
        const episode = video.episode !== undefined && video.episode !== null ? video.episode : parts[parts.length - 1];

        const alignedId = `${prefisso}:${season}:${episode}`;
        if (alignedId === video.id) return video;

        rewritten = true;
        return { ...video, id: alignedId };
    });

    if (!rewritten) return meta;
    return { ...meta, videos };
}

/**
 * Id IMDb del titolo per gli id degli episodi, prima dal dump e poi dalla cache dedicata.
 *
 * L'ORDINE È IL PUNTO. Prima `resolveImdbId`, cioè la cache `tmdb_imdb_id`, che al primo giro
 * chiama TMDB via rete (`/external_ids`). Ma il dump ha già la colonna `imdb_id`: se il titolo
 * è in Tier 1 l'id è lì, e chiederlo alla rete è una richiesta che il dump rende inutile
 * (che è il motivo per cui il dump esiste: *non* dover fare mai richieste di rete). Quindi:
 *
 *   1. dump (DuckDB, `movies`/`tv`, colonna `imdb_id`) → zero rete per i titoli di Tier 1;
 *   2. cache `tmdb_imdb_id` + rete, solo per la coda lunga (Tier 2, non nel dump).
 *
 * Entrambe le strade degradano a `null` senza mai far fallire la risposta: se il dump non c'è,
 * se la cartella non esiste, se la colonna manca o se la query solleva, si comporta come prima.
 *
 * NON `external_ids` dai dettagli TMDB: quelli arrivano dentro `append_to_response`, chiesti
 * **solo a cache dei dettagli vuota** — dalla seconda richiesta in poi la scheda non li porta
 * più. È la trappola che ha fatto restare gli episodi in forma `tmdb:` anche quando l'id IMDb
 * c'era.
 *
 * @param {Object} meta Scheda (non viene mutata).
 * @param {Object} params
 * @param {string} params.requestedId Id come richiesto da Stremio, senza il suffisso `_ita_offset`.
 * @param {string} params.tmdbId Id TMDB del titolo.
 * @param {string} params.type `movie` o `series`.
 * @param {string} params.apiKey Chiave TMDB.
 * @returns {Promise<string|null>} Id IMDb (`tt…`) o `null`.
 */
async function resolveImdbIdPerEpisodi(meta, { requestedId, tmdbId, type, apiKey }) {
    if (!meta || !Array.isArray(meta.videos) || meta.videos.length === 0) return null;
    // Boundary anime letto su una copia: `normalizeAnimeMarker` *scrive* `_isAnime` e qui
    // l'oggetto è l'ingresso di cache, che non si tocca mai. Stesso verdetto che darà
    // `buildResponseMeta` sulla copia che sta per costruire.
    if (normalizeAnimeMarker({ ...meta })) return null;
    // Richiesta già in forma IMDb: il prefisso degli episodi è l'id della richiesta, nessuna
    // risoluzione (e nessuna rete) serve.
    if (typeof requestedId === 'string' && requestedId.startsWith('tt')) return null;
    if (!tmdbId) return null;

    // 1) Il dump: nessuna rete quando il titolo è in Tier 1.
    const dalDump = await resolveImdbIdFromDump(tmdbId, type);
    if (dalDump) return dalDump;

    // 2) Coda lunga (Tier 2): cache dedicata, e rete solo se proprio non c'è.
    try {
        const imdbId = await resolveImdbId(String(tmdbId), type === 'movie' ? 'movie' : 'tv', apiKey);
        return typeof imdbId === 'string' && imdbId.startsWith('tt') ? imdbId : null;
    } catch (_e) {
        return null;
    }
}

/**
 * Id IMDb di un titolo letto dal dump (parquet DuckDB, colonna `imdb_id`).
 * `null` quando il titolo non è nel dump, quando il dump non è disponibile, o quando la
 * lettura solleva: in tutti e tre i casi il chiamante cade sulla strada di prima.
 *
 * @param {string|number} tmdbId
 * @param {string} type `movie` o `series`.
 * @returns {Promise<string|null>} Id IMDb (`tt…`) o `null`.
 */
async function resolveImdbIdFromDump(tmdbId, type) {
    try {
        if (!duckDbStore || typeof duckDbStore.resolveTmdbToImdb !== 'function') return null;
        const mapping = await duckDbStore.resolveTmdbToImdb([String(tmdbId)], type === 'movie' ? 'movie' : 'tv');
        if (!mapping || typeof mapping !== 'object') return null;
        const imdbId = mapping[String(tmdbId)] ?? mapping[String(Number(tmdbId))];
        return typeof imdbId === 'string' && imdbId.startsWith('tt') ? imdbId : null;
    } catch (_e) {
        return null;
    }
}

/**
 * La lista episodi che vede Stremio: nessun episodio imposto, gli speciali in fondo.
 *
 * 1. **NESSUN `defaultVideoId` sulle serie.** Decisione testuale dell'umano: «stremio non deve
 *    aprirmi nessun episodio quando apro una serie. deve darmi la lista e basta. è l'user che
 *    sceglie che episodio vedere». Oggi nessun codice lo scrive sulle serie (solo sui film, dove
 *    il video è uno solo e non è una scelta): qui non lo si scrive e, se una voce di cache ne
 *    portasse uno (entry vecchia, o altro writer), sulla **copia** di risposta viene tolto.
 * 2. **Gli speciali (stagione 0) in fondo alla lista**, non tolti. `fetchTmdbEpisodes` riempie
 *    le stagioni in ordine 0..N, quindi la lista comincia dagli speciali — misurato su dati
 *    veri il 03/10/2026: Game of Thrones ha 314 voci in stagione 0, Friends 39 su 267. Sono in
 *    gran parte duplicati e robaccia, e finivano in cima. Non è che gli speciali siano sbagliati:
 *    è che sono la coda, non l'inizio. Stremio raggruppa per stagione, quindi per chi cerca
 *    davvero uno speciale la sua posizione in coda non cambia nulla (sono lì, etichettati
 *    "Stagione 0"); l'ordine conta per il primo elemento della lista, che è quello che Stremio
 *    aprirebbe in mancanza di un default.
 *
 * L'ordine relativo di tutto il resto è invariato: è una partizione stabile, non un sort.
 * I film non hanno video e non ci passano; gli anime sono esclusi perché il loro percorso
 * (`kitsu:`) funziona e l'ordine di oggi è voluto.
 *
 * ATTENZIONE — la trappola: `meta.videos` è l'array conservato in cache (`tvEpisodesCache`, e
 * dentro `finalMetaCache`). Qui si costruisce un array NUOVO con gli stessi oggetti video:
 * nessuna scrittura, quindi la cache resta quella di prima.
 *
 * @param {Object} meta Scheda (non viene mutata).
 * @param {Object} params
 * @param {string} params.type Tipo della scheda.
 * @param {boolean} params.isAnime Se la scheda è un anime (percorso Kitsu: da lasciare com'è).
 * @returns {Object} Scheda pronta per la risposta.
 */
function preparaListaEpisodi(meta, { type, isAnime }) {
    if (!meta || type !== 'series' || isAnime) return meta;

    let risposta = meta;

    // Nessun episodio imposto: se la voce di cache porta un `defaultVideoId` (non dovrebbe,
    // sulle serie non lo scrive nessuno) la risposta non lo espone — è la copia, quindi
    // l'oggetto in cache non viene toccato.
    if (risposta.behaviorHints && risposta.behaviorHints.defaultVideoId !== undefined) {
        const behaviorHints = { ...risposta.behaviorHints };
        delete behaviorHints.defaultVideoId;
        risposta = { ...risposta, behaviorHints };
    }

    const videos = risposta.videos;
    if (!Array.isArray(videos) || videos.length < 2) return risposta;

    const normali = [];
    const speciali = [];
    for (const video of videos) {
        const season = video && video.season !== undefined && video.season !== null ? Number(video.season) : null;
        (season === 0 ? speciali : normali).push(video);
    }

    // Nessuno speciale da spostare, o lista composta solo da speciali (l'ordine non cambierebbe):
    // si restituisce la scheda com'è, senza copie inutili.
    if (speciali.length === 0 || normali.length === 0) return risposta;

    return { ...risposta, videos: [...normali, ...speciali] };
}

/**
 * Costruisce la scheda da restituire a partire dall'ingresso di cache, senza mutarlo.
 *
 * `cachedMeta` è l'oggetto che `finalMetaCache` conserva per riferimento, e la chiave di
 * cache (`meta_<tmdbId>_<type>`) non contiene la forma con cui è arrivata la richiesta:
 * `tt0108778` e `tmdb:1668` leggono e scrivono **la stessa voce**. Scrivere quindi
 * `meta.id` o `behaviorHints.defaultVideoId` sull'ingresso significa che la richiesta
 * successiva — con l'altra forma — erediti i segni di questa, e `defaultVideoId` (il campo
 * con cui Stremio sceglie il video da aprire) resterebbe appiccicoso sulla forma sbagliata.
 *
 * Stessa forma della correzione di `alignVideoIdsToRequestedForm`: si lavora su una copia.
 * La copia è **superficiale**, e va bene: gli unici due campi scritti qui (`id` e
 * `behaviorHints`) stanno al primo livello, quindi copiare `behaviorHints` è sufficiente a
 * non toccare l'oggetto in cache. `videos` resta condiviso, ed è già così per costruzione:
 * `alignVideoIdsToRequestedForm` ne copia i singoli episodi quando li riscrive.
 *
 * @param {Object} cachedMeta Scheda in cache (non viene mutata).
 * @param {Object} params
 * @param {string} params.requestedId Id come richiesto da Stremio, senza il suffisso `_ita_offset`.
 * @param {string} params.originalId Id grezzo come richiesto, con l'eventuale `_ita_offset`.
 * @param {string} params.type `movie` o `series`.
 * @param {string} [params.imdbIdPerEpisodi] Id IMDb del titolo, se risolto (forma `tt…`).
 * @returns {Object} Scheda pronta per la risposta.
 */
function buildResponseMeta(cachedMeta, { requestedId, originalId, type, imdbIdPerEpisodi }) {
    const risposta = { ...cachedMeta };

    // `behaviorHints` è annidato: copiarlo è obbligatorio, altrimenti la scrittura qui sotto
    // muterebbe comunque l'oggetto conservato in cache.
    if (cachedMeta.behaviorHints && typeof cachedMeta.behaviorHints === 'object') {
        risposta.behaviorHints = { ...cachedMeta.behaviorHints };
    }

    // Anche il boundary anime normalizza sulla copia: il marker di questa risposta non
    // viene più scritto nell'oggetto in cache.
    normalizeAnimeMarker(risposta);

    // Per richieste con tmdb: ID, manteniamo l'IMDB ID risolto per compatibilità streaming
    if (requestedId.startsWith('tmdb:') && risposta.id && risposta.id.startsWith('tt')) {
        if (risposta.behaviorHints && type === 'movie') {
            risposta.behaviorHints.defaultVideoId = risposta.id;
        }
    } else if (!requestedId.startsWith('tmdb:')) {
        // Per kitsu: e altri ID (non tradotti), forziamo l'ID originale
        risposta.id = requestedId;
    }

    // Ripristina l'ID richiesto originale per Stremio (incluso eventuale _ita_offset)
    risposta.id = originalId;

    // Gli id degli episodi vanno in forma IMDb (`tt…:S:E`) quando l'id IMDb è noto; altrimenti
    // restano nella forma della richiesta. `meta.id` invece non si tocca: resta quella della
    // richiesta, perché su quell'id Stremio tiene libreria e stato "visto" del titolo.
    const allineata = alignVideoIdsToRequestedForm(risposta, requestedId, imdbIdPerEpisodi);

    // Sui film `defaultVideoId` è il film stesso (c'è un video solo, non è una scelta: lasciare
    // il campo vuoto aprirebbe un id diverso da quello su cui è costruita la scheda). Sulle
    // serie la decisione è l'opposta: nessun episodio imposto, e gli speciali in fondo alla lista.
    return preparaListaEpisodi(allineata, { type, isAnime: risposta._isAnime === true });
}

/**
 * "Questo titolo è doppiato", per il solo file del poster in cache.
 *
 * PERCHÉ SERVE SULLA SCHEDA: i file con badge esistono **solo** per i titoli doppiati
 * (`tmdb-movie-27205_ITA.jpg`). Nella griglia dei cataloghi a saperlo è `applyPostCacheBadges`,
 * che mette `_itaBadge` sulla card e da lì il formatter vede `badgeText === 'ITA'`. Sulla scheda
 * quel badge non viene mostrato, quindi niente informava il formatter e il file giusto non veniva
 * neppure cercato: la scheda restava sul poster di TMDB proprio sui titoli italiani.
 *
 * RIUSO, NON SECONDA STRADA: stessa lettura dei cataloghi (`applyPostCacheBadges` chiama
 * `itaAnnotations.getSnapshot()`), cioè uno snapshot in RAM con TTL di 60 s condiviso da tutto il
 * processo — non una query per titolo. La chiave `(tipo, id TMDB)` la scheda la porta già
 * (`_tmdbId`, altrimenti `rawTMDB.id` o il suo stesso id `tmdb:`): nessuna rete, nessun DB.
 *
 * NON è un badge: il chiamante lo usa solo per scegliere il file in cache
 * (`itaCacheBadge` in `sanitizeCatalogMeta`), quindi sulla scheda non compare nulla di nuovo.
 * `null` (omonimia irrisolta) e `false` (nessuna traccia) valgono `false`, come per i cataloghi;
 * se il file delle annotazioni manca o è rotto lo snapshot è vuoto e il poster resta quello di oggi.
 *
 * TICKET 50 — fallback a due tipi, e perché serve anche qui: senza, la scheda di *Jin-Roh*
 * (annotato `tv`) non trovava `tmdb-movie-823_ITA.jpg` e restava sul poster di TMDB, cioè la metà
 * del difetto che i cataloghi riparano. La guardia è la stessa dei cataloghi: le due prove di
 * `animeAiringState.isDubbedFilmDocForCard` (documento = film doppiato, e id TMDB = film secondo
 * la mappa certificata). Per non caricare lo snapshot delle annotazioni anime quando non serve,
 * la prova si chiede **dopo** il miss della chiave primaria — che è anche l'unico caso in cui il
 * fallback potrebbe cambiare la risposta.
 *
 * @param {Object} meta Scheda (non viene mutata).
 * @param {string} type `movie` o `series`.
 * @returns {Promise<boolean>} `true` solo se le annotazioni dicono "doppiato".
 */
async function isMetaDubbed(meta, type) {
    try {
        const tmdbId = extractAnimeTmdbId(meta);
        if (!tmdbId) return false;
        const snapshot = await itaAnnotations.getSnapshot();
        const tipo = type === 'movie' ? 'movie' : 'tv';
        // Chiave `(tipo, id)` presente: è la risposta, il fallback non si guarda nemmeno.
        if (itaAnnotations.getStatus(snapshot, tipo, tmdbId) !== false) {
            return itaAnnotations.isDubbed(snapshot, tipo, tmdbId);
        }
        const doc = await findAiringDocByTmdbId(tmdbId);
        return itaAnnotations.isDubbed(snapshot, tipo, tmdbId, {
            allowTypeFallback: animeAiringState.isDubbedFilmDocForCard(doc, tmdbId, animeMappingStore)
        });
    } catch (_e) {
        return false; // degrado deciso: nessun badge, nessuna eccezione sul percorso di risposta
    }
}

/** Documento `anime_airing_state` di un id TMDB, o `null` (stato assente/rotto: mai un'eccezione). */
async function findAiringDocByTmdbId(tmdbId) {
    try {
        const state = await animeAiringState.getSnapshot();
        if (!state || !state.byTmdbId) return null;
        return state.byTmdbId.get(String(tmdbId)) || null;
    } catch (_e) {
        return null;
    }
}

async function resolveAnimeEpisodes(metaObj, tmdbId, tmdbApiKey) {
    if (metaObj._numberOfSeasons) {
        const source = metaObj._isAnime ? 'Anime' : 'TMDB';
        console.log(`[${source}] Carico episodi TMDB per ${tmdbId}`);
        const tmdbClient = createTmdbClient(tmdbApiKey);
        metaObj.videos = await fetchTmdbEpisodes(
            tmdbClient,
            tmdbId,
            metaObj._numberOfSeasons,
            metaObj.id.startsWith('tt') ? metaObj.id : null,
            metaObj._originalLanguage || null
        );
    }
}

/**
 * Gestisce la richiesta di metadati dettagliati quando l'utente clicca su un titolo
 */
async function metaHandler(args, userConfig) {
    try {
        const { type, id: originalId } = args;
        const id = typeof originalId === 'string' ? originalId.replace('_ita_offset', '') : originalId;

        if (!userConfig) throw new Error("Configurazione utente mancante");

        const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
        if (!tmdbApiKey) throw new Error("TMDB API key mancante");
        let meta = null;
        let tmdbId = null;

        // Fetch metadata via TMDB
        if (id.startsWith('tmdb:') || id.startsWith('tt') || id.startsWith('kitsu:')) {
            if (id.startsWith('tmdb:')) {
                tmdbId = id.replace('tmdb:', '');
            } else if (id.startsWith('tt')) {
                const tmdbIdResult = await translateImdbToTmdb(id, tmdbApiKey);
                tmdbId = tmdbIdResult?.id;
            } else if (id.startsWith('kitsu:')) {
                const kitsuId = id.split(':')[1];
                tmdbId = animeMappingStore.resolveTmdbFromKitsu(kitsuId);
            }

            if (tmdbId) {
                const cacheKey = `meta_${tmdbId}_${type}`;

                // Use getWithStatus for SWR support
                const { value: cachedMeta, status: cacheStatus } = await finalMetaCache.getWithStatus(cacheKey);



                if (cacheStatus === 'fresh') {
                    meta = cachedMeta;
                } else {
                    // If stale, return cached data and trigger background revalidation
                    if (cacheStatus === 'stale' && cachedMeta) {
                        meta = cachedMeta;
                        // Fire-and-forget background revalidation
                        (async () => {
                            try {
                                const bgMeta = await getDuckDbMetaDetails(tmdbId, type);
                                
                                // Fallback live TMDB solo se DuckDB fallisce
                                let finalBgMeta = bgMeta;
                                if (!finalBgMeta) {
                                    finalBgMeta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, type, {});
                                }

                                if (finalBgMeta) {
                                    if (type === 'series') {
                                        await resolveAnimeEpisodes(finalBgMeta, tmdbId, tmdbApiKey);
                                    }
                                    
                                    await applyKitsuMappingToMeta(finalBgMeta, tmdbId);

                                    delete finalBgMeta._keywordNames;
                                    delete finalBgMeta._numberOfSeasons;
                                    delete finalBgMeta._originalLanguage;
                                    await finalMetaCache.set(cacheKey, finalBgMeta);
                                }
                            } catch (_e) { /* silent background revalidation */ }
                        })();
                    } else {
                        meta = await getDuckDbMetaDetails(tmdbId, type);
                        
                        // Fallback API live SOLO se non lo troviamo nel DB offline e i fallback non sono disabilitati.
                        if (!meta) {
                             meta = await getTmdbMetaDetails(tmdbApiKey, tmdbId, type, {});

                             // DuckDB non l'ha servito ⇒ il titolo non è (ancora) in Tier 1: è il
                             // momento giusto per scaricare i dettagli e promuoverlo (ticket 42).
                             // Fire-and-forget e dentro un try/catch: la promozione **non** può mai
                             // cambiare (o rallentare) la scheda che l'utente sta aprendo.
                             if (meta) {
                                 try {
                                     schedulePromotion({ tmdbId, type, apiKey: tmdbApiKey });
                                 } catch (_e) { /* promozione mai sul percorso di risposta */ }
                             }
                        }
                        
                        if (meta) {
                            // Anime series: fetch Kitsu episodes (TMDB episodes were skipped)
                            if (type === 'series') {
                                // Lazy fetch episodi per serie tv normali e anime
                                await resolveAnimeEpisodes(meta, tmdbId, tmdbApiKey);
                            }

                            await applyKitsuMappingToMeta(meta, tmdbId);

                            delete meta._keywordNames;
                            delete meta._numberOfSeasons;
                            delete meta._originalLanguage;

                            await finalMetaCache.set(cacheKey, meta);
                        }
                    }
                }
            }
        }


        if (meta) {
            // `meta` qui è l'ingresso di cache: non lo si riscrive, lo si *deriva*.
            // Anche una entry dalla cache storica deve rispettare il boundary
            // corrente prima di raggiungere formatter e consumer.
            const imdbIdPerEpisodi = await resolveImdbIdPerEpisodi(meta, {
                requestedId: id,
                tmdbId,
                type,
                apiKey: tmdbApiKey
            });
            return { meta: buildResponseMeta(meta, { requestedId: id, originalId, type, imdbIdPerEpisodi }) };
        }

        return { meta: null };

    } catch (err) {
        console.error("Errore Meta Handler:", err.message);
        return { meta: null };
    }
}

module.exports = {
    metaHandler,
    isMetaDubbed,
    applyKitsuMappingToMeta,
    alignVideoIdsToRequestedForm,
    preparaListaEpisodi,
    buildResponseMeta,
    getKitsuMappingStats,
    resetKitsuMappingStats
};
