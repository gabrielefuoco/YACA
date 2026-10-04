const { createTmdbClient } = require('../clients/tmdb');
const { getCacheConfig } = require('../cache/CacheManager');
const { catalogRequestCache } = require('../cache/cacheInstances');
const { getPresets } = require('../data/presets');
const { generateRequestHash } = require('../utils/requestHash');
const { EPISODE_CATALOG_IDS } = require('../catalog/constants');

const { routeCatalogRequest } = require('../catalog/CatalogRouter');
const { hydrateEpisodeBadgesFromCache } = require('../catalog/processors/MetadataHydrator');
const { formatStremioCatalog, sanitizeCatalogMeta, findLatestAiredEpisode } = require('../catalog/formatters/StremioFormatter');
const itaAnnotations = require('../data/itaAnnotations');
const duckDbStore = require('../db/duckDbStore');
const animeAiringState = require('../data/animeAiringState');
const { normalizeAnimeMarker, extractAnimeTmdbId } = require('../utils/animeIdentity');
const animeMappingStore = require('../data/animeMappingStore');
const { isCatalogConformant, isAlwaysVisible } = require('../catalog/catalogKind');
const { applyKidsMode } = require('../utils/kidsModeFilters');

const extractTmdbId = extractAnimeTmdbId;

/**
 * Consumer del contratto normalizzato. Il resolver è condiviso con i dettagli,
 * ma un payload già attraversato dal boundary non viene riclassificato.
 */
function isItemAnime(item) {
    return normalizeAnimeMarker(item) === true;
}

/**
 * Trova il documento airing-state della card. La card può usare un Kitsu ID
 * stagionale risolto da Anibridge, diverso da `doc.ids.kitsu`: in quel caso lo
 * riportiamo all'opera base TMDB prima della lookup snapshot.
 *
 * IL RIFERIMENTO CHE VIAGGIA CON LA CARD (`_airingDocTmdbId`) viene letto per primo, e chiude
 * un giro vizioso che nessuna delle tre lookup sotto può chiudere. Misurato il 04/10/2026:
 * la card è `kitsu:50024` (Black Clover) ma il documento ha `ids.kitsu = 13209` → nessun match
 * diretto; e il ritorno per TMDB (`resolveTmdbFromKitsu`) torna `null` perché l'indice inverso
 * di `animeMappingStore` si riempie solo per le voci Fribb che hanno un `themoviedb_id`, e quelle
 * non ce l'hanno. Perché l'id della card sia nato senza TMDB è il percorso normale: Anibridge →
 * anilist/mal → Fribb → kitsu, e quel giro non ha bisogno di TMDB. Il ritorno sì, ed è la
 * variante (a) non lo risolve: senza `themoviedb_id` non c'è un TMDB da mettere nell'indice.
 * Il provider (`AiringStateProvider`) sa già quale documento ha prodotto la card: glielo
 * facciamo scrivere sulla meta, come `_yacaMatch`, e non è un campo che finisce nel JSON
 * servito (`applyAiringStateBadges` lo toglie prima della risposta).
 */
function findAiringStateDocument(snapshot, item, mappingStore = animeMappingStore) {
    if (!snapshot || !item) return null;

    const viaggio = item._airingDocTmdbId;
    if (viaggio && snapshot.byTmdbId) {
        const byViaggio = snapshot.byTmdbId.get(String(viaggio));
        if (byViaggio) return byViaggio;
    }

    const direct = animeAiringState.findDocument(snapshot, item.id);
    if (direct) return direct;

    const tmdbId = extractTmdbId(item);
    if (tmdbId && snapshot.byTmdbId) {
        const byTmdbId = snapshot.byTmdbId.get(String(tmdbId));
        if (byTmdbId) return byTmdbId;
    }

    const itemId = String(item.id || '').replace(/_ita_offset$/, '');
    if (!itemId.startsWith('kitsu:')) return null;

    const kitsuId = itemId.slice('kitsu:'.length).split(':')[0];
    if (!/^\d+$/.test(kitsuId) || !mappingStore) return null;

    try {
        const mappedTmdbId = mappingStore.resolveTmdbFromKitsu(kitsuId);
        return mappedTmdbId && snapshot.byTmdbId
            ? snapshot.byTmdbId.get(String(mappedTmdbId)) || null
            : null;
    } catch (_error) {
        // Il fallback difensivo non deve mai far fallire il catalogo.
        return null;
    }
}

// Marker del provider/stato esterno. `anilist_simulcast` resta accettato per le
// configurazioni già installate prima della rimozione di AniList.
const AIRING_STATE_PROVIDERS = new Set(['airing_state', 'anilist_simulcast']);

function isAiringStateCatalog(baseId, catalogMeta) {
    return baseId === 'preset_anime_simulcast' || AIRING_STATE_PROVIDERS.has(catalogMeta?._provider);
}

// Interruttore GLOBALE dei cataloghi: si alza quando cambia il MODO in cui nascono
// badge e poster, e per scelta invalida tutte le chiavi. Resta nella chiave accanto
// all'impronta del singolo catalogo.
// 18: badge ITA dalle annotazioni (antoniogenna.net) invece che dalla collezione streambadges,
//     e politica episodi corretta (ITA secco fuori dal simulcast). Senza questo bump i cataloghi
//     già in cache — fino a 14 giorni — continuerebbero a servire i badge vecchi.
// 19: il poster viene ricalcolato anche per i titoli NON-anime doppiati (ticket 15). Prima la
//     card ri-formattava solo se era attivo il badge episodio, quindi nei cataloghi normali il
//     badge ITA restava un'etichetta che nessuno disegnava: Il Padrino e Breaking Bad doppiati,
//     e senza badge. Stesso motivo del 18: senza bump, le card in cache servono il poster vecchio.
// 20: i film escono con l'id IMDb (`allineaIdFilm`), o gli altri addon non rispondono alla richiesta
//     di stream. Le card in cache sono state formattate prima, quindi non portano `_imdbId`: senza
//     bump resterebbero con l'id `tmdb:` fino alla scadenza e la correzione sembrerebbe inerte.
// 21: la card del catalogo novità anime non ha più finestra temporale — è ITA se il documento
//     dichiara ALMENO UN episodio doppiato, a qualunque data (regola dell'utente del 04/10/2026) —
//     e la card porta con sé il riferimento al proprio documento (`_airingDocTmdbId`).
//     Senza bump, le pagine già in cache non avrebbero né la regola nuova né il riferimento:
//     continuerebbero a servire il poster nudo per giorni.
// 22: entra in catalogo anche la serie **annunciata** (la lista "In corso" la vede, ma nessun
//     episodio è ancora uscito: `sub = { season: 2, episode: 0 }`, normalizzato a `null`).
//     Sono DUE card in più nella pagina, quindi le chiavi già in cache continuerebbero a servire
//     una lista vecchia per 14 giorni: senza bump i titoli annunciati non si vedrebbero.
const BADGE_CATALOG_VERSION = 22;

/**
 * Serializza la definizione di un catalogo in forma canonica: chiavi ordinate,
 * array nel loro ordine. Due definizioni equivalenti producono la stessa stringa,
 * arrivino da un preset, da Mongo o da un oggetto inline. `JSON.stringify` da solo
 * dipenderebbe dall'ordine delle chiavi e la chiave di cache cambierebbe a ogni
 * salvataggio senza che il catalogo sia cambiato.
 */
function canonicalCatalogDefinition(definition) {
    const value = definition && typeof definition.toObject === 'function'
        ? definition.toObject()
        : definition;

    if (value === null || typeof value !== 'object') {
        const json = JSON.stringify(value); // `undefined` e funzioni diventano 'null'
        return json === undefined ? 'null' : json;
    }
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) return `[${value.map(canonicalCatalogDefinition).join(',')}]`;

    const entries = Object.keys(value)
        .filter(key => key !== '_id' && key !== '__v') // rumore di Mongo: non descrive il catalogo
        .sort()
        .map(key => `${JSON.stringify(key)}:${canonicalCatalogDefinition(value[key])}`);
    return `{${entries.join(',')}}`;
}

/**
 * Risolve la definizione del catalogo richiesto: prima i preset di codice, poi i
 * cataloghi del profilo attivo, infine i custom. `null` per i cataloghi "standard"
 * (ricerca, watchlist), la cui definizione vive nel router e non nella configurazione.
 */
function resolveCatalogDefinition(id, userConfig, baseId) {
    if (baseId === 'yaca_search_history') return null;

    const fromPresets = getPresets().find(p => p.id === baseId || p.id === id);
    if (fromPresets) return fromPresets;

    const activeProfile = userConfig?.profiles?.find(p => p.id === userConfig.activeProfileId);
    if (activeProfile && activeProfile.catalogs) {
        const fromProfile = activeProfile.catalogs.find(c => c.id === id);
        if (fromProfile) return fromProfile;
    }
    if (userConfig?.customCatalogs) {
        return userConfig.customCatalogs.find(c => c.id === id) || null;
    }

    return null;
}

/**
 * Gli id dei preset, per riconoscere un preset **vero** da un catalogo che gli somiglia.
 *
 * Non è una regex sul nome, e non è pignoleria: un catalogo custom o merged si chiama come vuole,
 * e un merged può avere come sorgente i cataloghi del profilo — anche una watchlist
 * (`CatalogRouter.js:101-103`). Quindi il suo contenuto **può** dipendere dall'utente, e una regex
 * lo condividerebbe. `getPresets()` è l'elenco esatto.
 *
 * Gli id sono statici: la data che `getPresets()` calcola a ogni chiamata sta dentro le query, non
 * negli id. Il Set si costruisce una volta sola.
 */
const PRESET_IDS = new Set(getPresets().map(p => p.id));




/**
 * Gli ingredienti del **contenuto**: cosa decide quali titoli entrano nel catalogo.
 *
 * Non c'è l'utente, e non è una dimenticanza: due profili che chiedono lo stesso preset devono
 * ricevere la stessa lista di titoli, e quindi poterla condividere. È la chiave del livello 1
 * (la **selezione**, ticket 47).
 */
function catalogContentParams({ type, extra, directFilters, catalogMeta, activeProfileSettings } = {}) {
    return {
        type,
        extra,
        directFilters,
        kidsMode: activeProfileSettings?.kidsMode,
        typeSelectors: activeProfileSettings?.typeSelectors,
        catalogDef: canonicalCatalogDefinition(catalogMeta)
    };
}

/**
 * La chiave del livello 1: la **selezione** dei titoli, condivisibile fra profili — ma solo dove
 * è sicuro condividerla. Per un catalogo non condiviso (watchlist, hero, custom, merged) l'utente
 * entra anche qui: senza, la chiave del contenuto sarebbe identica per due utenti diversi, e chi un
 * giorno la usasse per cachare la selezione condividererebbe una libreria personale senza
 * accorgersene.
 */
function buildCatalogContentKey({
    id,
    baseId,
    type,
    extra,
    directFilters,
    skip,
    catalogMeta,
    userConfig,
    activeProfileSettings
} = {}) {
    const condiviso = PRESET_IDS.has(baseId);
    return generateRequestHash(id, {
        ...catalogContentParams({ type, extra, directFilters, catalogMeta, activeProfileSettings }),
        ...(condiviso ? {} : {
            user: userConfig?.userId,
            profile: userConfig?.activeProfileId
        })
    }, skip, type);
}

/**
 * Chiave di cache della pagina di catalogo. Ci finisce tutto ciò che cambia il
 * risultato — e nient'altro.
 *
 * Al posto del vecchio `configVersion` c'è `catalogDef`: l'impronta canonica della
 * definizione di QUESTO catalogo (`where`, `orderBy`, `queries`, `isAnime`, provider…).
 * `configVersion` era un contatore rigenerato a ogni salvataggio: bastava salvare un
 * profilo per rendere orfane tutte le chiavi di tutti i cataloghi, anche quelli che
 * non erano cambiati.
 */
function buildCatalogCacheKey({
    id,
    baseId,
    type,
    extra,
    directFilters,
    skip,
    catalogMeta,
    userConfig,
    activeProfileSettings,
    badgeVersion = BADGE_CATALOG_VERSION
} = {}) {
    // Un **preset** non porta niente dell'utente: i campi per-utente (`_yacaMatch`,
    // `traktAvailable`) nascono solo nel motore ibrido, che costruisce hero e Trakt
    // (`hybridRecommendations.js:496`, `catalogStrategies.js:1440`). Quindi la sua chiave non deve
    // contenere `user`/`profile` — sono pura frammentazione, ed è da lì che nascono le **20 chiavi**
    // di `preset_adult_animation` e le 11 di `preset_ghibli` che contengono la stessa lista.
    //
    // Per tutto il resto la chiave resta per profilo, e non per prudenza: la watchlist è la
    // libreria personale, gli hero hanno il DNA, i custom e i merged possono avere come sorgente
    // una watchlist.
    const condiviso = PRESET_IDS.has(baseId);

    return generateRequestHash(id, {
        ...catalogContentParams({ type, extra, directFilters, catalogMeta, activeProfileSettings }),
        ...(condiviso ? {} : {
            user: userConfig?.userId,
            profile: userConfig?.activeProfileId
        }),
        // Il formatter sceglie poster orizzontale o verticale: è un interruttore del
        // profilo, quindi resta in chiave come `kidsMode` e `typeSelectors`.
        landscape: Boolean(activeProfileSettings?.isLandscapeEnabled),
        badgeV: badgeVersion
    }, skip, type);
}

/**
 * Il riferimento al documento viaggia con la meta per arrivare alla fase dei badge (che gira
 * DOPO la cache, quando la card ha perso l'id TMDB). Non è un dato da servire: qui viene tolto,
 * e la copia è perché l'oggetto in cache non va modificato sul posto.
 */
function senzaRiferimentoAiring(item) {
    if (!item || item._airingDocTmdbId === undefined) return item;
    const copia = { ...item };
    delete copia._airingDocTmdbId;
    return copia;
}

/**
 * Badge del catalogo novità anime: le due card (sub e ITA) leggono lo stato esterno
 * (`anime_airing_state`), non TMDB. Card sub -> `EP {italian.sub.latest.episode}`;
 * card ITA (clone `_ita_offset`) -> `ITA {italian.dub.latest.episode}`, presente se il
 * documento dichiara almeno un episodio doppiato (nessuna finestra: vedi `getDeclaredInfo`).
 * Entrambe condividono lo stesso id. Non lancia mai: in caso di problemi serve le card senza badge.
 */
async function applyAiringStateBadges(metas, {
    userConfig,
    hostUrl,
    catalogMeta,
    type,
    snapshot = null,
    mappingStore = animeMappingStore
} = {}) {
    if (!Array.isArray(metas) || metas.length === 0) return { metas: [] };

    try {
        const state = snapshot || await animeAiringState.getSnapshot(); // getSnapshot non lancia mai
        const activeProfileSettings = userConfig?.profiles?.find((p) => p.id === userConfig.activeProfileId)?.settings || {};
        const isLandscape = activeProfileSettings.isLandscapeEnabled || catalogMeta?.isLandscape || false;
        const sanitizeOptions = {
            shouldApplyEpisodeBadge: type === 'series' || type === 'anime',
            isLandscapeEnabled: isLandscape,
            userConfig,
            hostUrl
        };

        const processed = [];
        for (const item of metas) {
            if (String(item.id).endsWith('_ita_offset')) {
                processed.push(senzaRiferimentoAiring(item));
                continue;
            }
            const doc = findAiringStateDocument(state, item, mappingStore);
            const info = animeAiringState.getCardInfo(doc);
            if (!info) {
                // Nessuno stato per questa serie: la card resta, senza badge.
                //
                // Si ri-formattta invece di passare l'item così com'è, perché alla costruzione del
                // catalogo il badge episodio era già stato calcolato da TMDB (`showEpisodeBadge` è
                // true su questo preset): una serie **annunciata** — che è proprio il caso in cui
                // non c'è nessuno stato, perché `sub.episode = 0` viene normalizzato a `null` — si
                // porterebbe dietro un `S2 E1` inventato. Qui il badge del simulcast viene SEMPRE e
                // SOLO dallo stato esterno, quindi "nessuno stato" vuol dire "nessun badge".
                // Per chi oggi non ha badge il risultato è identico (l'URL del poster non cambia).
                processed.push(senzaRiferimentoAiring(sanitizeCatalogMeta({
                    ...item,
                    _itaBadge: false,
                    _itaOnlyBadge: true
                }, { ...sanitizeOptions, shouldApplyEpisodeBadge: false })));
                continue;
            }

            if (info.sub) {
                processed.push(senzaRiferimentoAiring(sanitizeCatalogMeta({
                    ...item,
                    _itaBadge: false,
                    _forceBadgeText: `EP ${info.sub.episode}`
                }, sanitizeOptions)));
            }

            if (info.dub) {
                processed.push(senzaRiferimentoAiring(sanitizeCatalogMeta({
                    ...item,
                    id: `${item.id}_ita_offset`,
                    _itaBadge: false,
                    _forceBadgeText: `ITA ${info.dub.episode}`
                }, sanitizeOptions)));
            }
        }

        return { metas: processed };
    } catch (error) {
        console.error('[Catalog] Errore badge stato anime:', error.message);
        return { metas };
    }
}

/**
 * Una riga sola, greppabile con la parola chiave fissa `[CatalogTiming]`:
 * quale catalogo, quanto ha costato (ms), quanti titoli ha prodotto, e se è stato
 * un HIT (servito dalla cache) o una BUILD (costruito davvero, ora).
 *
 * Fino a qui il costo di una costruzione non era misurabile: il codice scriveva
 * solo due `console.error` sui percorsi d'errore, quindi la domanda "la cache dei
 * cataloghi vale la pena?" si decideva alla cieca.
 */
function logCatalogTiming({ id, catalog, cache, ms, titles }) {
    const count = Array.isArray(titles) ? titles.length : (Number(titles) || 0);
    console.log(`[CatalogTiming] id=${id} catalog=${catalog} cache=${cache} ms=${ms} titles=${count}`);
}

function getLatestEpisodeInfo(item) {
    if (!item) return null;
    
    // Check rawTMDB
    if (item.rawTMDB && (item.type === 'series' || item.type === 'anime')) {
        const nextEp = item.rawTMDB.next_episode_to_air;
        const lastEp = item.rawTMDB.last_episode_to_air;
        if (nextEp?.episode_number) {
            return { season: nextEp.season_number || 1, episode: nextEp.episode_number };
        }
        if (lastEp?.episode_number) {
            return { season: lastEp.season_number || 1, episode: lastEp.episode_number };
        }
    }
    
    // Check item.videos
    const latest = findLatestAiredEpisode(item.videos);
    if (latest) {
        return { season: latest.season || 1, episode: latest.episode || 1 };
    }
    
    return null;
}

/**
 * Chiave dell'annotazione per una card: `(tipo, tmdb id)`.
 * `tmdb:…` è diretto; `tt…` passa dal ponte IMDb→TMDB in batch (nessuna chiamata API);
 * `kitsu:…` passa dal mapping anime. `null` quando non c'è modo di risalire all'id.
 */
function annotationKeyFor(item, imdbMap = {}) {
    const rawId = String(item.id || '').replace(/_ita_offset$/, '');
    const cardType = item.type === 'movie' ? 'movie' : 'tv';

    if (rawId.startsWith('tmdb:')) {
        const parts = rawId.split(':');
        // Forma piena: `tmdb:movie:123` / `tmdb:tv:123` — il tipo è nell'id.
        if (parts[1] === 'movie' || parts[1] === 'tv') {
            const id = Number(parts[2]);
            return Number.isFinite(id) ? { type: parts[1], id } : null;
        }
        // Forma legacy: `tmdb:123` (e `tmdb:123:1:2`) — il tipo lo dà la card.
        const legacyId = Number(parts[1]);
        return Number.isFinite(legacyId) ? { type: cardType, id: legacyId } : null;
    }

    if (rawId.startsWith('tt')) {
        const mapped = imdbMap[rawId];
        return mapped ? { type: mapped.type, id: mapped.id } : null;
    }

    if (rawId.startsWith('kitsu:')) {
        const kitsuId = rawId.slice('kitsu:'.length).split(':')[0];
        try {
            const tmdbId = /^\d+$/.test(kitsuId) ? animeMappingStore.resolveTmdbFromKitsu(kitsuId) : null;
            if (tmdbId) return { type: cardType, id: Number(tmdbId) };
        } catch (_e) {
            // difensivo: un mapping mancante non deve far fallire il catalogo
        }
        return null;
    }

    return null;
}

/** Ponte IMDb→TMDB per le card `tt…`: **una** query in batch, non una per card. */
async function resolveImdbMap(metas) {
    const ids = [...new Set(metas.map(item => String(item.id || '')).filter(id => id.startsWith('tt')))];
    if (ids.length === 0) return {};
    try {
        const mapping = await duckDbStore.resolveImdbIds(ids);
        const out = {};
        for (const [imdbId, value] of Object.entries(mapping || {})) {
            if (value && value.tmdbId) {
                out[imdbId] = { type: value.type === 'tv' ? 'tv' : 'movie', id: Number(value.tmdbId) };
            }
        }
        return out;
    } catch (_e) {
        return {};
    }
}

async function applyPostCacheBadges(cachedData, userConfig, hostUrl, catalogMeta, type, baseId, options = {}) {
    if (!cachedData || !Array.isArray(cachedData.metas) || cachedData.metas.length === 0) {
        return cachedData || { metas: [] };
    }

    // Clone metas to avoid modifying cached objects in place. La normalizzazione
    // difensiva copre anche cache creati prima dell'introduzione del marker.
    const metas = cachedData.metas.map(item => {
        const clone = { ...item };
        normalizeAnimeMarker(clone);
        return clone;
    });

    // Snapshot in RAM per gli anime (una sola lettura, cache TTL breve, non lancia mai)
    let animeSnapshot = options.snapshot || null;
    if (!animeSnapshot && metas.some(isItemAnime)) {
        try {
            animeSnapshot = await animeAiringState.getSnapshot();
        } catch (_e) {
            animeSnapshot = null;
        }
    }

    // Catalogo novità anime: i badge vengono dallo stato esterno (`anime_airing_state`).
    if (isAiringStateCatalog(baseId, catalogMeta)) {
        return await applyAiringStateBadges(metas, { userConfig, hostUrl, catalogMeta, type, snapshot: animeSnapshot });
    }

    const activeProfileSettings = userConfig?.profiles?.find((p) => p.id === userConfig.activeProfileId)?.settings || {};
    const isLandscape = activeProfileSettings.isLandscapeEnabled || catalogMeta?.isLandscape || false;
    const sanitizeOptions = {
        shouldApplyEpisodeBadge: (type === 'series' || type === 'anime') && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId)),
        isLandscapeEnabled: isLandscape,
        userConfig,
        hostUrl
    };

    // Annotazioni ITA dal file prodotto dal modulo `services/doppiaggi-source`: una lettura per finestra
    // (snapshot in RAM con TTL breve), non una query per item. Il core non scrive mai questo file.
    let itaSnapshot = options.itaSnapshot || null;
    if (!itaSnapshot) {
        try {
            itaSnapshot = await itaAnnotations.getSnapshot();
        } catch (_e) {
            itaSnapshot = null; // degrado deciso: nessun badge, nessuna eccezione
        }
    }

    const imdbMap = options.imdbMap || (await resolveImdbMap(metas.filter(item => !isItemAnime(item))));

    /**
     * Documento `anime_airing_state` di un id TMDB. Caricamento pigro e una volta sola: lo
     * snapshot resta quello in RAM (60 s), e senza il fallback nessuno chiede nulla.
     */
    let animeSnapshotPromise = null;
    async function animeDocFor(tmdbId) {
        if (tmdbId === null || tmdbId === undefined) return null;
        if (!animeSnapshot) {
            if (!animeSnapshotPromise) {
                animeSnapshotPromise = animeAiringState.getSnapshot()
                    .then(s => { animeSnapshot = s || animeSnapshot; return animeSnapshot; })
                    .catch(() => null); // degrado deciso: nessun badge, nessuna eccezione
            }
            await animeSnapshotPromise;
        }
        if (!animeSnapshot || !animeSnapshot.byTmdbId) return null;
        return animeSnapshot.byTmdbId.get(String(tmdbId)) || null;
    }

    /**
     * Badge ITA di una card: la chiave `(tipo, id)` e, **solo per i film**, il fallback all'altro
     * tipo del ticket 50.
     *
     * PERCHÉ IL FALLBACK È GUARDATO (e non può essere cieco): il writer delle annotazioni non
     * conosce il tipo dell'anime e lo ri-indovina (`tv` per default), quindi 35 film anime
     * doppiati — Howl, Totoro, Jin-Roh… — cercavano `movie:<id>` in uno snapshot che ha solo
     * `tv:<id>`: nessun badge, nessun poster `_ITA`. Ma 5.933 id TMDB vivono in entrambe le
     * tabelle: misurato il 04/10/2026 sull'istantanea di produzione, 4.539 card film avrebbero
     * preso il badge, quasi tutte non hanno niente a che fare con l'animazione (è il badge di
     * *Jin-Roh* che finisce su *WWF Superstars*). Le **due prove** che lo autorizzano stanno in
     * `animeAiringState.isDubbedFilmDocForCard`: il documento è un film doppiato, e quell'id TMDB
     * è un film secondo la mappa certificata. Restano 30 card su 4.539, tutte film anime veri.
     *
     * La prova è sull'**id**, non sulla card: la card può arrivare come `kitsu:…` o come film
     * senza genere, e la classificazione anime è troppo fragile per far da guardia.
     */
    async function itaDubbed(tipo, tmdbId) {
        if (tmdbId === null || tmdbId === undefined) return false;
        const conChiave = itaAnnotations.isDubbed(itaSnapshot, tipo, tmdbId);
        if (conChiave || tipo !== 'movie') return conChiave;
        const doc = await animeDocFor(tmdbId);
        return itaAnnotations.isDubbed(itaSnapshot, tipo, tmdbId, {
            allowTypeFallback: animeAiringState.isDubbedFilmDocForCard(doc, tmdbId, animeMappingStore)
        });
    }

    const processedMetas = [];

    for (let i = 0; i < metas.length; i++) {
        const item = metas[i];

        // Titolo anime: lo scanner torrent e i suoi badge/cloni non si applicano.
        // La verità ITA arriva dallo stato esterno (anime_airing_state).
        // Badge ITA ovunque se il titolo è doppiato (formato 'ITA n'), ma MAI cloni nei cataloghi standard.
        if (isItemAnime(item)) {
            // Fuori dal catalogo simulcast l'anime mostra SOLO il badge `ITA` secco (o niente):
            // niente numero di episodio, niente badge di stagione. La verità è la colonna `ita`,
            // che vale `true` anche per i doppiati solo AnimeUnity. L'unione NON la fa la build
            // del parquet: la fa `services/doppiaggi-source`, che legge `anime_airing_state`.
            // La build legge solo `ita_annotations.jsonl`: se quel passaggio salta, il badge ITA
            // degli anime sparisce da tutti i cataloghi senza che nessuno se ne accorga.
            //
            // Chiave: le card anime sono spesso `kitsu:…`, mentre l'annotazione è per TMDB id.
            // Lo stato anime è già in RAM ed è il ponte migliore (sa ids.tmdb di ciò che traccia);
            // `extractTmdbId` copre le card che un TMDB id ce l'hanno già.
            const doc = animeSnapshot ? findAiringStateDocument(animeSnapshot, item) : null;
            // `buildSnapshot` normalizza i documenti: il campo è `doc.tmdbId`.
            const animeTmdbId = (doc && doc.tmdbId) || extractTmdbId(item);
            const animeDubbed = await itaDubbed(item.type === 'movie' ? 'movie' : 'tv', animeTmdbId);
            const animeItem = { ...item, _itaBadge: animeDubbed, _itaOnlyBadge: true };

            if (sanitizeOptions.shouldApplyEpisodeBadge || animeDubbed) {
                processedMetas.push(sanitizeCatalogMeta(animeItem, sanitizeOptions));
            } else {
                processedMetas.push(animeItem);
            }
            continue;
        }

        // Un solo sguardo allo snapshot: `true` → badge, `null`/`false` → nessun badge.
        // Niente cloni e niente offset: l'episodio doppiato non ci interessa (ticket 04).
        const key = annotationKeyFor(item, imdbMap);
        const dubbed = key ? await itaDubbed(key.type, key.id) : false;
        const outItem = { ...item, _itaBadge: dubbed };

        // Il poster è già stato scelto quando la card è stata formattata e messa in cache, cioè
        // PRIMA che le annotazioni ITA venissero lette. Senza ri-formattare, `_itaBadge` resta
        // un'etichetta che nessuno disegna: il poster non viene più ricalcolato.
        // Gli anime lo facevano già (`|| animeDubbed` nel ramo sopra); i non-anime solo quando il
        // badge episodio è attivo — cioè quasi mai, perché basta `type === 'movie'` a escluderlo.
        // Risultato: Il Padrino e Breaking Bad doppiati e senza badge (ticket 15).
        if (dubbed || sanitizeOptions.shouldApplyEpisodeBadge) {
            processedMetas.push(sanitizeCatalogMeta(outItem, sanitizeOptions));
        } else {
            processedMetas.push(outItem);
        }
    }

    return { metas: processedMetas };
}

/**
 * Funzione principale (Orchestrator) che riceve la richiesta da Stremio ed elabora il catalogo.
 * Utilizza il pattern Strategy deferendo a CatalogRouter, Processors e Formatters.
 */
async function catalogHandler(args, userConfig, hostUrl) {
    const { id, type, extra, filters: directFilters } = args;
    const skip = extra?.skip || 0;
    
    // Resolve active profile settings directly from userConfig (instead of phantom SettingsManager)
    const activeProfileSettings = userConfig?.profiles?.find((p) => p.id === userConfig.activeProfileId)?.settings || {};
    
    // TMDB Client Initialization
    const tmdbApiKey = userConfig.apiKeys?.tmdb || process.env.TMDB_API_KEY;
    if (!tmdbApiKey) {
        throw new Error("Manca la TMDB API KEY nella configurazione.");
    }
    const tmdbClient = createTmdbClient(tmdbApiKey);
    const { cacheOptions: tmdbFetchOptions } = getCacheConfig(userConfig.ttl);

    let baseId = id;
    if (id && id.startsWith('yaca_preset_')) {
        baseId = id.replace('yaca_preset_', '');
    }

    const catalogMeta = resolveCatalogDefinition(id, userConfig, baseId);

    // GUARDIA SELETTORI DI TIPO (Ticket 09 / Spec 06):
    // Se il catalogo richiesto è un suggerimento non conforme ai selettori del profilo attivo -> { metas: [] }
    const targetCatalog = catalogMeta || { id, type };
    if (!isCatalogConformant(targetCatalog, activeProfileSettings?.typeSelectors)) {
        return { metas: [] };
    }

    // Check Full CACHE Request. La chiave nasce DOPO la risoluzione del catalogo,
    // perché la sua definizione è uno degli ingredienti.
    const requestCacheKey = buildCatalogCacheKey({
        id,
        baseId,
        type,
        extra,
        directFilters,
        skip,
        catalogMeta,
        userConfig,
        activeProfileSettings,
        badgeVersion: BADGE_CATALOG_VERSION
    });

    // managed SWR: Fetch or Revalidate
    const { ttl } = getCacheConfig(userConfig.ttl);

    // MISURA (solo log, nessun cambio di comportamento): quante volte, in questa
    // richiesta, il catalogo è stato davvero costruito. Se resta 0 la cache ha
    // risolto la richiesta e il tempo speso è quello di un HIT.
    let builds = 0;

    const fetchCatalog = async () => {
        builds += 1;
        const buildStartedAt = Date.now();
        // Titoli prodotti dalla costruzione: resta 0 se il ramo "nessun risultato"
        // o se la costruzione è esplosa (l'errore lo dice già la riga poco sotto).
        let builtMetas = 0;
        try {
            // Aggiungo hostUrl ad extra per essere passato ai provider se serve (es. Trakt)
            const routerArgs = { ...args, extra: { ...extra, hostUrl } };

            // 1. ROUTING: Determina il catalogo grezzo passando attraverso il Router
            let results = await routeCatalogRequest(routerArgs, userConfig, tmdbClient, tmdbApiKey, activeProfileSettings, tmdbFetchOptions, catalogMeta);
            // console.log('ROUTE RESULTS:', results?.length);

            // Boundary unico per i cataloghi: prima di selettori, kids e badge
            // ogni item espone un boolean, calcolato dal resolver condiviso.
            results = (results || []).map(item => {
                normalizeAnimeMarker(item);
                return item;
            });

            if (!results || results.length === 0) {
                return { metas: [] };
            }

            // 2. FILTRAGGIO POST-FETCH: Nasconde tipo sbagliato
            if (type === 'movie' || type === 'series') {
                results = results.filter(i => {
                    if (i.media_type) {
                        const expectedType = type === 'series' ? 'tv' : 'movie';
                        return i.media_type === expectedType || i.media_type === 'person';
                    }
                    return true;
                });
            }

            // console.log('POST MEDIA TYPE RESULTS:', results?.length);
            // 2.5 FILTRAGGIO POST-FETCH: guardia unica per genere + keyword.
            // I provider DuckDB applicano già i vincoli in SQL; questo secondo
            // livello copre preset, ricerche e fallback che possono perdere i campi
            // pesanti durante la normalizzazione.
            if (activeProfileSettings?.kidsMode) {
                results = applyKidsMode(results);
            }

            // 2.6 FILTRAGGIO POST-FETCH: Filtro Contenuti Anime (Ticket 13 / Spec 06 Sezione 6)
            // Perimetro: cataloghi di suggerimento (preset utente, 8 hero, custom/merged).
            // Le ricerche e la libreria personale (3 watchlist) non vengono filtrate.
            const animeSelector = activeProfileSettings?.typeSelectors?.anime;
            const isSubjectCatalog = !isAlwaysVisible(id) && !isAlwaysVisible(baseId) && !extra?.search;
            if (isSubjectCatalog && (animeSelector === 'exclude' || animeSelector === 'only')) {
                results = results.filter(item => {
                    const isAnime = isItemAnime(item);
                    if (animeSelector === 'exclude') {
                        return !isAnime;
                    }
                    if (animeSelector === 'only') {
                        return isAnime;
                    }
                    return true;
                });
            }

            const isAnimeCatalog = Boolean(
                catalogMeta?.isAnime ||
                targetCatalog?.isAnime ||
                catalogMeta?.filters?.isAnime ||
                directFilters?.isAnime ||
                directFilters?.filters?.isAnime
            );
            if (isAnimeCatalog) {
                results = results.filter(item => isItemAnime(item));
            }

            // 3. POST-PROCESSING
            let finalResults = results;
            
            const shouldBadge = type === 'series' && (catalogMeta?.showEpisodeBadge === true || EPISODE_CATALOG_IDS.has(baseId));
            if (shouldBadge) {
                await hydrateEpisodeBadgesFromCache(finalResults, tmdbApiKey);
            }

            // Deduplicate items by ID
            if (Array.isArray(finalResults) && finalResults.length > 0) {
                const seenIds = new Set();
                finalResults = finalResults.filter(item => {
                    const itemId = String(item?.id || item?.stremioId || '');
                    if (!itemId) return false;
                    if (seenIds.has(itemId)) return false;
                    seenIds.add(itemId);
                    return true;
                });
            }

            // 3.8 SIMULCAST SORTING (se applicabile)
            // Se il catalogo ha query basate su date di airing (es. Simulcast), ordiniamo per episodio più recente
            const hasAirDateFilter = catalogMeta?.queries?.some(q => q['air_date.gte'] || q['air_date.lte']) || false;
            if (hasAirDateFilter && type === 'series' && finalResults && finalResults.length > 0) {
                const nowStr = new Date().toISOString().split('T')[0];
                const nowMs = Date.now();
                
                finalResults.forEach(item => {
                    let latestDateStr = null;
                    
                    // 1. Prova da TMDB raw metadata
                    if (item.rawTMDB) {
                        const nextEp = item.rawTMDB.next_episode_to_air;
                        const lastEp = item.rawTMDB.last_episode_to_air;
                        
                        if (nextEp && nextEp.air_date && nextEp.air_date <= nowStr) {
                            latestDateStr = nextEp.air_date;
                        } else if (lastEp && lastEp.air_date && lastEp.air_date <= nowStr) {
                            latestDateStr = lastEp.air_date;
                        }
                    }
                    
                    // 2. Fallback su episodes (Kitsu o TMDB cache)
                    if (!latestDateStr && Array.isArray(item.videos) && item.videos.length > 0) {
                        const airedEpisodes = item.videos.filter(v => v.released && new Date(v.released).getTime() <= nowMs);
                        if (airedEpisodes.length > 0) {
                            airedEpisodes.sort((a, b) => new Date(b.released) - new Date(a.released));
                            latestDateStr = airedEpisodes[0].released.substring(0, 10);
                        }
                    }
                    
                    item._latestAirDate = latestDateStr;
                });
                
                finalResults.sort((a, b) => {
                    if (a._latestAirDate && b._latestAirDate) {
                        return b._latestAirDate.localeCompare(a._latestAirDate);
                    }
                    if (a._latestAirDate) return -1;
                    if (b._latestAirDate) return 1;
                    return 0; // maintain original relative order
                });
            }

            // console.log('POST DEDUPLICATION RESULTS:', finalResults?.length);
            // 4. FORMATTAZIONE (STREMIO)
            const isLandscape = activeProfileSettings.isLandscapeEnabled || catalogMeta?.isLandscape || false;
            const formattedData = formatStremioCatalog(
                finalResults,
                baseId,
                type,
                userConfig,
                isLandscape,
                hostUrl,
                catalogMeta
            );

            builtMetas = formattedData?.metas?.length || 0;
            return formattedData;
        } catch (e) {
            console.error(`[CATALOG] Error in catalog generation pipeline:`, e);
            throw e;
        } finally {
            // Copre tutti i punti di uscita della costruzione (risultati vuoti,
            // catalogo formattato, errore): una riga per costruzione, mai una per
            // richiesta.
            logCatalogTiming({
                id,
                catalog: baseId,
                cache: 'build',
                ms: Date.now() - buildStartedAt,
                titles: builtMetas
            });
        }
    };

    // I cataloghi watchlist sono il riflesso della libreria personale: cambiano quando
    // l'utente aggiunge o rimuove titoli. Con il TTL di default (giorni) restavano
    // congelati — ed è così che un titolo già unito continuava a comparire due volte.
    const WATCHLIST_TTL_MS = 2 * 60 * 1000;
    const isWatchlistCatalog = typeof id === 'string' && id.startsWith('yaca_watchlist');

    // Chiave che gira ogni giorno: sette preset la cui definizione contiene una
    // data, quindi la loro impronta (e la chiave di cache costruita da
    // `buildCatalogCacheKey`) cambia a mezzanotte. La voce di ieri non verrà più
    // riletta, ma con il TTL standard resterebbe in Redis per 14 giorni: una al
    // giorno per ogni utente, spazzatura che non serve a nessuno (~12 profili × 4
    // preset × 14 giorni ≈ 670 chiavi morte, la stessa ordine di grandezza delle
    // orfane ripulite il 2026-10-03).
    //
    // Le due ragioni per cui la data c'è sono diverse, ed è per questo che stanno
    // qui tutte e sette:
    //
    //  - I TRE "nuove uscite": la data È il filtro della query
    //    (`primary_release_date.lte`, `first_air_date.lte`, `air_date.lte` =
    //    `todayStr` in src/data/presets.js). Non si può toglierla: senza,
    //    "Film: Nuove Uscite" diventa "tutti i film per popolarità". La finestra
    //    resta giornaliera per definizione, e con lei la chiave.
    //
    //  - I QUATTRO anime tematici: la data NON è il filtro, è un valore derivato
    //    che finisce dentro `where` senza che la query lo nomini. `permissive_recent`
    //    (`F.permissiveFloor`, vedi buildPresetFromFilters) apre la fila ai titoli
    //    con `first_air_date >= (oggi - 6 mesi)` in modo che una serie uscita di
    //    recente entri anche sotto la soglia di voti. Tolta quella data la query
    //    cambierebbe, ma non per scelta: qui si accorcia solo la vita della voce.
    //
    // 36 ore coprono la giornata più qualche ora di richieste ritardate, e la
    // chiave inutile muore entro il giorno dopo invece di accumularsi.
    //
    // IL NOME È IMPRECISO, per ammetterlo: `DAILY_WINDOW` descrive il caso dei
    // tre "nuove uscite" (la finestra di novità è giornaliera) e non gli anime,
    // dove la finestra è semestrale: conta davvero solo al cambio di mese, ma il
    // valore è ricalcolato (`oggi - 6 mesi`) a ogni richiesta, quindi la stringa
    // cambia ogni giorno e la chiave con essa. Il vero criterio è "la chiave ruota
    // ogni giorno". Rinominarlo in qualcosa come `DAILY_ROTATING_CATALOG_IDS`
    // toccerebbe questo punto, i test e i due helper qui sotto: si è lasciato il
    // nome e si è scritto il perché.
    const DAILY_WINDOW_CATALOG_IDS = new Set([
        // --- data = filtro della query (finestra di novità) ---
        'preset_new_movies',      // Film: Nuove Uscite    (primary_release_date.lte = oggi)
        'preset_new_series',      // Serie TV: Novità     (first_air_date.lte = oggi)
        'preset_new_series_eps',  // Serie: Episodi Recenti (air_date.lte = oggi)
        // --- data = valore derivato in `where`, non filtro (permissive_recent) ---
        'preset_anime_shonen',    // Anime: Battle Shōnen  (first_air_date >= oggi - 6 mesi)
        'preset_anime_shoujo',    // Anime: Shōjo (Romantico)
        'preset_anime_mecha',     // Anime: Mecha & Robot
        'preset_anime_isekai'     // Anime: Isekai & Fantasy
    ]);
    const DAILY_WINDOW_TTL_MS = 36 * 60 * 60 * 1000; // 36 ore
    const isDailyWindowCatalog = typeof id === 'string' && DAILY_WINDOW_CATALOG_IDS.has(id);

    let effectiveTtl = ttl;
    if (isWatchlistCatalog) effectiveTtl = Math.min(effectiveTtl, WATCHLIST_TTL_MS);
    if (isDailyWindowCatalog) effectiveTtl = Math.min(effectiveTtl, DAILY_WINDOW_TTL_MS);

    // SWR handling. Il cronometro copre la sola parte costosa (cache + eventuale
    // costruzione), non i badge post-cache né la risposta HTTP.
    const requestStartedAt = Date.now();
    let responseData;
    if (extra?.search || baseId === 'yaca_search_history') {
        responseData = await fetchCatalog();
    } else if (extra?.warmupMode) {
        const cachedStatus = await catalogRequestCache.getWithStatus(requestCacheKey);
        if (cachedStatus.status === 'fresh') {
            // [OTTIMIZZAZIONE] Se il catalogo è intatto (fresh) e il demone sta solo riscaldando,
            // non ci serve eseguire applyPostCacheBadges (che costa migliaia di letture/scritture al DB).
            // Usciamo immediatamente restituendo il catalogo dalla cache.
            logCatalogTiming({
                id,
                catalog: baseId,
                cache: 'hit',
                ms: Date.now() - requestStartedAt,
                titles: cachedStatus.value?.metas
            });
            return cachedStatus.value;
        } else {
            const freshData = await fetchCatalog();
            await catalogRequestCache.set(requestCacheKey, freshData, effectiveTtl);
            responseData = freshData;
        }
    } else {
        responseData = await catalogRequestCache.getOrFetch(requestCacheKey, fetchCatalog, effectiveTtl);
    }

    // `fetchCatalog` non è mai partita: la cache ha servito il catalogo. Il costo
    // della BUILD l'ha già loggata lei, questa riga dice solo quanto costa il vuoto.
    // Non serve ricostruire la logica della cache: basta sapere se è partita.
    if (builds === 0) {
        logCatalogTiming({
            id,
            catalog: baseId,
            cache: 'hit',
            ms: Date.now() - requestStartedAt,
            titles: responseData?.metas
        });
    }

    return allineaIdFilm(await applyPostCacheBadges(responseData, userConfig, hostUrl, catalogMeta, type, baseId));
}

/**
 * Per un **film** l'id che Stremio consegna agli altri addon è quello della scheda: non c'è un video
 * separato come per le serie. L'ecosistema però parla IMDb, non `tmdb:`. Misurato il 04/10/2026 con
 * Torrentio: `movie/tt0068646` (Il Padrino) risponde **58 stream**, `movie/tmdb:238` risponde **0**.
 * Quindi un film aperto dal catalogo restava con il solo addon che capisce `tmdb:`.
 *
 * Le serie non c'entrano: lì Stremio usa l'id del **video**, che è già in forma IMDb.
 *
 * La sostituzione avviene **qui**, sull'output, e non nel provider: dentro il codice l'id `tmdb:`
 * serve a decine di ricerche (badge ITA, poster in cache, mappa IMDb) e cambiarle tutte sarebbe un
 * rischio senza vantaggio. A Stremio serve solo l'ultima parola.
 *
 * Il suffisso `_ita_offset` (clone doppiato del catalogo novità) si conserva: è parte dell'identità
 * della card, non dell'id.
 */
function allineaIdFilm(risposta) {
    if (!risposta || !Array.isArray(risposta.metas)) return risposta;
    for (const meta of risposta.metas) {
        if (!meta || meta.type !== 'movie' || !meta._imdbId) continue;
        const id = String(meta.id || '');
        if (id.startsWith('tt')) continue;
        const suffisso = id.endsWith('_ita_offset') ? '_ita_offset' : '';
        meta.id = `${meta._imdbId}${suffisso}`;
        if (meta.behaviorHints && meta.behaviorHints.defaultVideoId) {
            meta.behaviorHints.defaultVideoId = meta.id;
        }
    }
    return risposta;
}

module.exports = {
    catalogHandler,
    BADGE_CATALOG_VERSION,
    buildCatalogCacheKey,
    buildCatalogContentKey,
    allineaIdFilm,
    canonicalCatalogDefinition,
    resolveCatalogDefinition,
    applyAiringStateBadges,
    isAiringStateCatalog,
    applyPostCacheBadges,
    isItemAnime,
    extractTmdbId,
    findAiringStateDocument
};
