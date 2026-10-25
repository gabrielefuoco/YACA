# 08 — Library, watch history e progress come segnale di gusto

**Ticket**: [08 — Library, watch history e progress come segnale di gusto](../issues/08-library-storia-segnale.md) · **Punti**: P13, P22
**Ricerca**: 20/10/2026 · **Natura**: solo ricerca, nessuna modifica al prodotto
**Commit YACA**: `58784c5` (working tree 20/10/2026) · **NuvioTV**: `f062601` (`dev`, 20/10/2026)

## La domanda, in una riga

Nuvio può diventare la **fonte del gusto** di YACA — library, watch history, watch progress — senza
passare da Stremio o Trakt? La risposta breve: **sì per il “cosa ho guardato” e il “cosa ho salvato”,
no per il “cosa mi è piaciuto”**. Nuvio non ha né Love né Like né voti **dell’utente**: la sua library
è un bookmark, la sua history è un fatto di visione. Può sostituire la *cronologia* di Trakt e la *libreria* di
Stremio, non la loro *preferenza esplicita*. Il valore vero è la granularità per episodio, l’isolamento
per profilo e i delta con `delete`; il costo vero è l’identità (gli id non sono TMDB) e l’autenticazione
(una sessione account intera, senza scope).

## Fonti e stato dell’evidenza

Legenda usata in tutta la nota:

- **[D] documentato** — scritto in una fonte pubblica che lo possiede.
- **[O] osservato** — letto nel codice client o nei file YACA; comportamento reale, non promessa.
- **[T] da testare** — plausibile ma non provato su un’istanza Nuvio/YACA.
- **[P] proposta** — scelta di design discussa qui, non presente nel prodotto.

| Fonte | Versione / commit | Cosa copre | Stato |
|---|---|---|---|
| Nuvio public API | v1.3, last updated 20/08/2026 — <https://nuvio.tv/docs/nuvio-public-api.md> | library, watch progress, watch history, delta, profili, delete | [D] |
| Nuvio FAQ | <https://nuvio.tv/faq> (letto 20/10/2026) | cosa sincronizza Nuvio Sync, cancellazione profilo/account, cadenza | [D] |
| NuvioTV `LibraryRepositoryImpl.kt` | `f062601` — `app/src/main/java/com/nuvio/tv/data/repository/LibraryRepositoryImpl.kt` | id scritto in library, source mode, mapping a `SavedLibraryItem` | [O] |
| NuvioTV `LibrarySyncService.kt` + `LibrarySyncPaging.kt` | `f062601` | bootstrap cursore → snapshot → delta, page size 500 | [O] |
| NuvioTV `SupabaseLibrarySyncRemoteDataSource.kt` | `f062601` | RPC reali, DTO, campi | [O] |
| NuvioTV `WatchProgressRepositoryImpl.kt` / `WatchProgress.kt` | `f062601` | soglia 90%, progress key, watched item al completamento | [O] |
| NuvioTV `WatchProgressSyncService.kt` / `WatchedItemsSyncService.kt` | `f062601` | delta 900, snapshot history 900, cursor per profilo | [O] |
| NuvioTV `StartupSyncService.kt` / `TraktSettingsDataStore.kt` | `f062601` | cadenza 15 min, default Trakt, skip Nuvio se provider attivo | [O] |
| YACA `src/library/*`, `src/profile/*` | `58784c5` | modelli, seed, DNA, ingestione Stremio/Trakt | [O] |
| YACA `src/stremio/collection.js` | `58784c5` | cosa YACA legge davvero da Stremio | [O] |
| Kaptain (`nuvio-push.js`, snapshot) | — | **non presente nel workspace**; non usato come fonte | assente |

> **Buco documentale da mettere agli atti.** La docs v1.3 documenta `content_id` con l’esempio
> `tmdb:550`, ma **non** dice che il server accetta `tt…`, `kitsu:`, `anilist:` o `mal:`. Il client
> NuvioTV scrive l’id del meta addon **così com’è** (`LibraryRepositoryImpl.kt:357-373`,
> `HomeViewModelLibraryActions.kt:464-490`, `MetaDetailsViewModel.kt:2790-2815`), con l’eccezione
> dell’overlay poster, che prova a convertire `tmdb:` in `tt` prima di scrivere
> (`PosterOptionsController.kt:170-179`). I commenti del resolver poster elencano proprio `tt`,
> `tmdb:`, `kitsu:`, `anilist:`, `mal:` (`CustomPosterUrlResolver.kt:11-13`). Quindi: **lato client
> è osservato**, **lato server è da testare**. Tutta la parte identità dipende da questo test.

---

## 1. Cosa espone Nuvio, esattamente

**Stato**: campi e tipi [D]; semantica della “source” interna [O]; accettazione server degli id
non-TMDB [T].

### 1.1 Library: un bookmark, non un voto

La docs è esplicita: «The library stores content that each profile has **bookmarked or favorited**»
(`nuvio-public-api.md:507`). Non è una watchlist separata, non è un “loved”, non è un rating. È l’unico
segnale esplicito che Nuvio offre, ed è debole.

| Campo | Tipo | Note | Uso YACA |
|---|---|---|---|
| `content_id` | string | id del meta addon; esempio `tmdb:550` | `UserLibraryItem.itemId` + risoluzione a `tmdbId` |
| `content_type` | string | `movie` o `series` (docs:584) | `UserLibraryItem.type`; `series` → `tv` in history |
| `name` | string | titolo | `UserLibraryItem.name` |
| `poster` | string\|null | URL | `UserLibraryItem.poster` |
| `poster_shape` | string | `POSTER`, `LANDSCAPE`, `SQUARE` | `UserLibraryItem.posterShape` |
| `background` | string\|null | URL | `UserLibraryItem.background` |
| `description` | string\|null | sinossi | **non c’è campo** in `UserLibraryItem` |
| `release_info` | string\|null | anno o range | `UserLibraryItem.year` (parse) |
| `imdb_rating` | float\|null | voto IMDb, **non** dell’utente | solo display: non è un segnale di gusto |
| `genres` | string[] | nomi, non id TMDB | **non c’è campo**; usabile solo in staging |
| `addon_base_url` | string\|null | addon di provenienza | **non c’è campo**; irrilevante per il DNA |
| `added_at` | integer | epoch ms | `_ctime`/`_mtime` (la watchlist ordina per `_mtime`) |
| `created_at`/`updated_at` | timestamp | record lato server | audit |

Fonte: docs `nuvio-public-api.md:550-590`; modello client `SavedLibraryItem.kt:3-17`; schema YACA
`src/library/models/UserLibraryItem.js:8-35`.

**Conseguenza 1.** YACA non ha dove mettere `description`, `imdb_rating`, `genres`, `addon_base_url`.
O si aggiungono campi, o si tiene una tabella di staging Nuvio separata. Per il DNA i campi utili sono
solo `content_id`, `content_type`, `genres` (fallback) e `added_at`; per la card bastano
`name`, `poster`, `year`.

**Conseguenza 2.** `imdb_rating` non è il voto dell’utente. Non va confuso con i rating Trakt (1-10) né
con `vote_average` TMDB usato dallo scorer. È solo un’etichetta da mostrare.

**Conseguenza 3.** `genres` sono **nomi**, non `genre_ids`: possono essere localizzati dall’addon e i
generi TV hanno id diversi dai film (es. `Action` 28 vs `Action & Adventure` 10759). Non vanno
passati a `extractActiveDNAFromTmdbData` come se fossero id: per il DNA serve la risoluzione TMDB e
la lettura del parquet.

**Conseguenza 4.** La docs dice `content_type` = `movie`/`series`, ma il client passa `apiType`, che
per gli anime può essere `anime` (`HomeViewModelLibraryActions.kt:464-490`). Se il server conserva
`anime`, YACA deve normalizzarlo a `tv` nella history e a `anime` nella library. [T]

### 1.2 Watch progress: il “continue watching”

| Campo | Tipo | Note |
|---|---|---|
| `content_id` | string | id del titolo padre |
| `content_type` | string | `movie` o `series` |
| `video_id` | string | id dell’item di playback (episodio) |
| `season`/`episode` | int\|null | solo serie |
| `progress_key` | string | `{content_id}` o `{content_id}_s{season}e{episode}` |
| `position` | integer | ms |
| `duration` | integer | ms |
| `last_watched` | integer | epoch ms |

Fonte: docs `nuvio-public-api.md:920-929`, `1809-1817`; modello client `WatchProgress.kt:14-31`;
calcolo della chiave in `WatchProgressRepositoryImpl.kt:1236-1242`.

NuvioTV considera **completato** ciò che raggiunge il **90%** (`WatchProgress.kt:48-49`), e al salvataggio
di un progress completato crea anche un `WatchedItem` locale (`WatchProgressRepositoryImpl.kt:785-797`).
Il server fa la stessa cosa sui push: con `duration >= 60000` e `position >= 90%` upserta anche la
watch history (`nuvio-public-api.md:1072`). Quindi **progress e history si sovrappongono**: è il primo
punto dove YACA può contare due volte.

### 1.3 Watch history: un fatto per episodio

| Campo | Tipo | Note |
|---|---|---|
| `content_id` | string | id del titolo padre |
| `content_type` | string | `movie` o `series` |
| `title` | string | titolo (a volte con `S01E01` nel nome) |
| `season`/`episode` | int\|null | solo serie |
| `watched_at` | integer | epoch ms |
| `created_at` | timestamp | record lato server |

Fonte: docs `nuvio-public-api.md:1150-1178`; modello client `WatchedItem.kt:3-18`.

**La history è per episodio, non per titolo.** Una stagione da 10 episodi produce 10 righe. Questo è
il dato migliore che Nuvio offre per il gusto, ma va aggregato: YACA ragiona per `tmdbId` di titolo.
Il modello `WatchedItem` non ha `timesWatched` né un contatore di repliche: la chiave è
`(content_id, season, episode)` (`WatchedItem.kt:24-33`), quindi **non si può inferire un rewatch**
dal numero di righe. Il client tratta quella chiave come unica e il push è un merge non distruttivo
(`nuvio-public-api.md:1118-1121`, `1269-1300`): una seconda visione aggiorna `watched_at`, non crea
una riga nuova. Che il server non lasci comunque duplicati è da confermare. [O] + [T]

### 1.4 Profili: il dato è per profilo, l’autenticazione no

La docs dice che `profile_id` “scopes every documented data resource” (`nuvio-public-api.md:1779-1783`).
I profili sono fino a 6, con `profile_index` 1-6, `id` uuid, `name`, `created_at`, `updated_at`,
`pin_enabled`, `pin_locked_until` (`nuvio-public-api.md:300-330`). **Attenzione:** `p_profile_id`
nelle RPC è l’**indice 1-6**, non l’uuid `id`; l’uuid serve solo come identità stabile del profilo.
Salvare entrambi, ma usare l’indice per le chiamate.

Il punto che conta per la privacy: **il PIN non è applicato dall’API pubblica**. La docs dice
esplicitamente che la gestione PIN “is an app-specific Nuvio flow and is not part of the public API”
(`nuvio-public-api.md:380`), e `pin_enabled`/`pin_locked_until` sono campi **read-only** per i client.
Con un token account si possono leggere tutti i profili passando `p_profile_id`; il PIN è una
convenzione del client, non un’autorizzazione server-side. **YACA non deve trattare il PIN come
consenso.** [T] sul comportamento server: la docs non descrive alcun controllo PIN nelle RPC.

### 1.5 La trappola delle “source” dentro Nuvio

NuvioTV ha una scelta locale di sorgente per library e progress:

- `WatchProgressSource`: `TRAKT`, `SIMKL`, `MDBLIST`, `NUVIO_SYNC` (`TraktSettingsDataStore.kt:25-29`).
- `LibrarySourceMode`: `LOCAL`, `TRAKT`, `SIMKL`, `MDBLIST` (`LibraryModels.kt:59-64`).
- Default: `TRAKT` per entrambe (`TraktSettingsDataStore.kt:56-57`), **ma** se il provider non è
  autenticato la sorgente effettiva degrada a `NUVIO_SYNC`/`LOCAL`
  (`TrackingSources.kt:22-35`).

Quando la sorgente è un provider esterno, Nuvio **salta** il pull della library Nuvio
(`StartupSyncService.kt:645-670`) e salta il pull di progress/history Supabase
(`StartupSyncService.kt:306-330`). In altre parole: **se l’utente usa Trakt dentro Nuvio, i dati
Nuvio possono essere vuoti o non aggiornati**, e l’API non espone la scelta della sorgente. YACA non
può sapere se Nuvio è la fonte o uno specchio di Trakt/Simkl/MDBList. Lo può solo inferire dai conteggi
(`get_sync_overview`, `nuvio-public-api.md:1706-1740`) o chiederlo all’utente.

---

## 2. Bootstrap e delta: l’ordine che regge

**Stato**: ordine, RPC e parametri [D]; page size e comportamento client [O]; tenuta dello snapshot
sotto scritture concorrenti [T].

### 2.1 La regola documentata

La docs è chiara per library, progress e history (`nuvio-public-api.md:1798-1807`):

1. chiamare `sync_get_*_delta_cursor` e catturare l’event id;
2. scaricare **tutte** le pagine dello snapshot;
3. chiamare `sync_pull_*_delta` dal cursore catturato;
4. applicare in ordine crescente di `event_id` e salvare l’id più alto.

Il cursore va catturato **prima** dello snapshot: così i cambi avvenuti durante lo snapshot finiscono
nel delta. Il delta è l’unico modo per vedere i `delete` (`nuvio-public-api.md:1789-1796`).

### 2.2 Library

| Passo | RPC | Parametri | Note |
|---|---|---|---|
| cursore | `sync_get_library_delta_cursor` | `p_profile_id` | 0 se nessun evento |
| snapshot | `sync_pull_library` | `p_limit=500`, `p_offset=k*500` | ordinato `added_at DESC`; stop a pagina corta |
| delta | `sync_pull_library_delta` | `p_since_event_id`, `p_limit<=1000` | ordinato `event_id ASC`; upsert/delete |
| identità | — | `(content_type, content_id)` | docs:518 |

Fonti: `nuvio-public-api.md:505-518`, `540-548`, `596-700`. NuvioTV fa esattamente questo, con
`LIBRARY_SNAPSHOT_PAGE_SIZE = 500` e `LIBRARY_DELTA_PAGE_SIZE = 500`
(`LibrarySyncPaging.kt:3-4`, `LibrarySyncService.kt:65-100`).

Pseudo-algoritmo YACA:

```
C0 = get_library_cursor(profile)
offset = 0
repeat:
    page = pull_library(profile, limit=500, offset)
    apply_snapshot_page(page)          # replace-by-identity, non append
    offset += 500
until page.size < 500
cursor = C0
repeat:
    events = pull_library_delta(profile, since=cursor, limit=500)
    for e in events ordered by event_id:
        apply(e)                       # upsert o delete
        cursor = e.event_id
    persist(cursor)                    # dopo ogni pagina, non a fine giro
until events.size < 500
```

### 2.3 Watch history

| Passo | RPC | Parametri | Note |
|---|---|---|---|
| cursore | `sync_get_watched_items_delta_cursor` | `p_profile_id` | |
| snapshot | `sync_pull_watched_items` | `p_page=1..N`, `p_page_size=500/900` | ordinato `watched_at DESC` |
| delta | `sync_pull_watched_items_delta` | `p_since_event_id`, `p_limit<=1000` | upsert/delete per episodio |

Fonti: `nuvio-public-api.md:1118-1179`, `1181-1237`; NuvioTV usa 900 per entrambi
(`WatchedItemsSyncService.kt:31-32`, `185-227`, `274-362`). La docs dà `p_page_size` con default
100000, ma il client usa 900: meglio restare piccoli, per non fare una singola risposta enorme.

### 2.4 Watch progress: il buco dei 200

Questo è il punto meno simmetrico. `sync_pull_watch_progress`:

- senza `p_since_last_watched` restituisce le ultime **200** righe, in `last_watched DESC`
  (`nuvio-public-api.md:860-877`);
- con `p_since_last_watched` filtra per timestamp, ma **non ha offset** e non è documentato un limite
  massimo; si potrebbe provare a paginare per timestamp, ma è un cursore non stabile (ties, stesso ms)
  e non è documentato come tale [T];
- il delta invece ha `event_id` e i `delete`.

Quindi **non esiste uno snapshot paginato di progress**. NuvioTV accetta il limite: al primo sync
prende le ultime 200, poi usa il delta (`WatchProgressSyncService.kt:336-368`, `494-518`). Per YACA
questa è la scelta giusta, ma con una correzione: **non usare il progress come fonte storica del
gusto**. La history copre già i completati; il progress serve solo per:
1. il “continue watching” (esclusione dalle raccomandazioni, non peso DNA);
2. il completamento quando la history non è ancora arrivata;
3. la recency dell’ultima visione, se serve.

Se si vuole comunque provare a recuperare tutto il progress, c’è un test da fare: chiamare
`sync_pull_watch_progress` con `p_since_last_watched=0` e `p_limit` grande. La docs non dice che
con il timestamp il cap 200 resti; **potrebbe** restituire tutto. Finché non è provato, la nota
considera il cap 200 come un limite reale. [T]

### 2.5 Cursori: cosa salvare

Per ogni `(yacaUserId, nuvioUserId, nuvioProfileId)` e per ogni risorsa:

| Campo | Perché |
|---|---|
| `library_cursor` | `event_id` più alto applicato |
| `history_cursor` | idem |
| `progress_cursor` | idem |
| `library_snapshot_at` | quando è stato fatto l’ultimo snapshot completo |
| `history_snapshot_at` | idem |
| `profile_created_at` | rilevare un profilo ricreato con lo stesso indice |
| `profile_name` | mostrare il profilo nel consenso |
| `status` | `active`, `paused`, `revoked`, `orphaned` |
| `last_error` | 401/429/5xx, per il backoff |

Regole:

- **Mai avanzare il cursore prima di aver applicato la pagina.** Se il processo muore tra apply e
  persist, si riapplica: le operazioni devono essere idempotenti per chiave naturale.
- **Mai assumere che `event_id` sia globale.** La docs lo dice “monotonically increasing” per la
  risorsa, ma il cursore è per profilo (`nuvio-public-api.md:596-627`). Salvare per profilo.
- **Se `event_id` non cresce**, fermarsi e fare uno snapshot completo; NuvioTV ha un
  `check(nextCursor > cursor)` proprio per non loopare (`LibrarySyncPaging.kt:23-40`).
- **Se arriva un `operation` sconosciuto**, fermarsi e riconciliare; non ignorarlo.

### 2.6 I tre modi in cui lo snapshot può mentire

1. **Offset + scritture concorrenti.** `sync_pull_library` ordina per `added_at DESC` e pagina per
   offset. Se un item viene aggiunto o rimosso durante lo snapshot, una riga può scivolare da una
   pagina all’altra e essere saltata. Il delta copre i cambi con `event_id > C0`, ma **non** una riga
   preesistente saltata che ha event id `< C0`. Mitigazione: confrontare il numero di item dello
   snapshot con `get_sync_overview.library_items[profile]` e, se diverso, rifare lo snapshot; oppure
   fare uno snapshot completo periodico. [T]
2. **Snapshot stantio che resuscita un delete.** Se lo snapshot viene letto da una replica non
   aggiornata, una riga cancellata può ricomparire. YACA deve tenere un tombstone
   `(content_id, content_type, deleted_at)` e non riapplicare uno snapshot che precede il tombstone.
   NuvioTV non ha questo problema perché lo snapshot viene applicato solo al primo bootstrap e poi
   solo delta (`LibrarySyncService.kt:65-100`); YACA, se fa snapshot periodici, ce l’ha.
3. **Progress senza snapshot.** Un item in progress da mesi, fuori dalle ultime 200, non è
   recuperabile via `sync_pull_watch_progress`. Non è un problema per il DNA (non è completato), ma
   è un problema se si vuole costruire un “continue watching” completo. La history non lo copre.

### 2.7 Cosa fa NuvioTV e dove YACA deve differire

NuvioTV:

- bootstrap solo se `!deltaInitialized`, poi solo delta (`LibrarySyncService.kt:65-100`);
- snapshot library con `applySnapshot` che **sostituisce** la lista locale, preservando solo le
  mutazioni pendenti (`LibrarySyncReducer.kt:101-156`);
- delta progress/history con merge e delete;
- page size 500/900;
- cursore per profilo in DataStore (`LibraryPreferences.kt:39-40`,
  `WatchProgressPreferences.kt:69-70`).

YACA deve differire in tre punti:

1. **niente push**: Nuvio è fonte, non destinazione (la mappa lo mette fuori scope, `map.md:238-240`);
2. **snapshot periodico di riconciliazione**, non solo bootstrap, perché YACA non ha un datastore
   locale che “possiede” la lista e deve correggere derive;
3. **tombstone espliciti** per non far resuscitare i delete.

---

## 3. Identità: `tmdb:`, `tt`, `kitsu:` e i loro fratelli

**Stato**: formati id lato client [O]; risoluzione YACA [O]; accettazione server e comportamento su
`anilist:`/`mal:` [T]; estensione del resolver [P].

### 3.1 La tabella degli id

| Id Nuvio | Come si risolve in YACA | Tipo | Fallimento |
|---|---|---|---|
| `tmdb:550` | prefisso diretto (`libraryIdentityResolution.js:52-56`) | da `content_type` | nessuno |
| `tt0137523` | `resolveImdbIds` su DuckDB, `movies` ∪ `tv` (`duckDbStore.js:748-785`) | dal parquet (`movie`/`tv`) | fallback `translateImdbToTmdb`, poi non risolto |
| `550` (numerico) | `normalizeLibraryId` lo tratta come `tmdb:550` (`identity.js:45-57`) | da `content_type` | attenzione: film e serie condividono lo spazio numerico |
| `kitsu:7442` | `animeMappingStore.kitsuToTmdb` + `kitsuToTmdbType` (`mapping.js:607-625`) | dalla mappa | non risolto → park |
| `anilist:123` | **nessun ramo** in `libraryIdentityResolution.js` | — | `unsupported` → park |
| `mal:123` | **nessun ramo**, anche se `malToTmdb` esiste (`mapping.js:643`) | — | `unsupported` → park |
| `trakt:...` | nessun ramo | — | `unsupported` → park |

Il resolver del convertitore conosce solo `tt`, `tmdb:` e `kitsu:`
(`libraryIdentityResolution.js:31-34`, `48-115`). `anilist:` e `mal:` non sono “dati mancanti”: la
mappa Fribb ha gli indici `anilist` e `mal` (`mapping.js:76`, `377-387`) e `malToTmdb` esiste
(`mapping.js:643`); manca il **codice** che li collega. Sarebbe un’estensione piccola, ma è una
modifica al prodotto e qui resta [P]. Un id non risolto non viene droppato: resta in coda e, dopo 3
tentativi, viene parcheggiato (`conversionStateMachine.js:86`, `MAX_CONVERSION_ATTEMPTS`); quindi non
si perde, ma non entra né nel DNA né nei seed finché non viene risolto o riportato in coda.

### 3.2 Dove va a finire l’id

- **Library** → `UserLibraryItem.itemId` (normalizzato) + `UserLibraryItem.tmdbId` (numerico) +
  `mapped: true`. La conversione è `LibraryConverterService` → `resolveTmdbIdentity`
  (`LibraryConverterService.js:121-149`).
- **History** → `WatchHistory.tmdbId` (numerico, obbligatorio). `WatchHistory` non ha un campo
  `itemId`: l’id originale si perde. Per questo serve una tabella di staging che conservi
  `(content_id, content_type) → tmdbId` per poter applicare i `delete`.
- **Seeds** → `seeds.js` legge solo `doc.tmdbId` (`seeds.js:130`), quindi tutto il resto è
  irrilevante per il gusto.

### 3.3 Il buco grosso: `WatchHistory` non ha il tipo nella chiave

`WatchHistory` ha indice unico `{owner, context, tmdbId}` (`WatchHistory.js:27`). Ma i namespace
numerici di TMDB per film e serie **si sovrappongono**: `identity.js:131-137` cita proprio il caso
`12477` (film *La tomba delle lucciole* vs serie *Fourth Reading*). Con la chiave attuale, se un
profilo guarda il film e la serie con lo stesso numero TMDB, il secondo documento **sovrascrive** il
primo (o l’upsert fallisce per duplicato). Nuvio fornisce `content_type`, quindi il dato per
distinguere c’è; manca la chiave composta `(tmdbId, type)` o un id canonico che includa il tipo.
Questo va risolto **prima** di ingerire Nuvio, altrimenti l’ingestione può perdere titoli in modo
silenzioso. [O] + [P]

### 3.4 Duplicati e forme canoniche

YACA ha già una buona macchina per la library:

- `normalizeLibraryId` pulisce spazi, maiuscole, `tmdb: 12477 ` → `tmdb:12477`, `TT…` → `tt…`
  (`identity.js:45-57`);
- `resolveCanonicalKeys` preferisce `tt…`, poi `tmdb:<id>` (`identity.js:142-205`);
- `planDuplicateMarks` raggruppa per chiave canonica e, se non risolve, per titolo+anno
  (`identity.js:213-337`);
- `applyDuplicateMarks` non cancella: marca `duplicateOf` (`identity.js:345-386`).

Attenzione: **Nuvio non deduplica per TMDB**. La sua identità è `(content_type, content_id)`
(`LibrarySyncModels.kt:44`), quindi `tt0137523` e `tmdb:550` sono due item distinti nella sua library.
YACA li deve unire dopo la risoluzione, con `resolveCanonicalKeys`/`planDuplicateMarks`.

Per Nuvio funziona **solo se** gli item entrano in `UserLibraryItem` con un `addonUuid`. Ma
`UserLibraryItem` è per definizione la libreria Stremio dell’account (`UserLibraryItem.js:8-9,42`), e
la chiave unica è `{addonUuid, itemId}`. Non c’è un `source`. **Nuvio e Stremio non possono convivere
nella stessa collezione senza un discriminante**: o si aggiunge `source` (e si cambia l’indice), o si
crea una collezione `NuvioLibraryItem` separata, o si usa un `addonUuid` sintetico per Nuvio (ma poi
`leggiWatchlist` e `seeds.js`, che filtrano per `addonUuid`, non lo vedono). Questo è il primo vero
blocco architetturale della nota.

### 3.5 Il buco nell’history Stremio

`ProfileBuilder.syncStremioData` risolve `tt…`, numerico e `tmdb:` (`ProfileBuilder.js:516-536`), ma
**non ha un ramo `kitsu:`**. Se si riusa quella funzione per Nuvio, tutti gli anime con `kitsu:`
vengono scartati in silenzio. La library ha il ramo kitsu nel convertitore, la history no. Per Nuvio
bisogna usare `resolveTmdbIdentity` (che conosce kitsu) anche nel percorso history, o un resolver
unico condiviso. [O]

---

## 4. Segnale: quali eventi diventano Love/Like/Watch

**Stato**: modelli e pesi YACA [O]; mappatura Nuvio → segnale e regole anti-doppio [P]; delete e
retraction [O] + [P].

### 4.1 Il modello YACA, in due righe

`WatchHistory` è un documento per `(owner, context, tmdbId)` con un array di segnali
`{type, source, at, value}`; i tipi ammessi sono `watched`, `liked`, `loved`, `negative`, `library`
(`WatchHistory.js:8-13`). I pesi:

| Segnale | Peso nei seed | Peso nel DNA | Note |
|---|---|---|---|
| `loved` | 4 | 400 × decay | solo Stremio/Trakt |
| `liked` | 3 | 300 × decay | solo Stremio/Trakt |
| `watched` | `max(0.20, 0.5^(giorni/60))` | 200 × decay (half-life 24 mesi) | Nuvio può produrlo |
| `library` | 1 | 100 × decay | Nuvio può produrlo |
| `negative` | 0 | 0 | solo Trakt (<5) |

Fonti: `seeds.js:13-14,182-200`; `ProfileBuilder.js:225-246`; `dnaEngine.js:59-66`.
**Attenzione: ci sono due orologi.** I seed usano half-life 60 giorni e floor 0.20; il DNA usa
half-life 24 mesi e floor 0.01. Lo stesso evento “visto” vale molto di più nel grafo che nel DNA.
Non è un bug di Nuvio, ma è un’incoerenza che qualsiasi peso Nuvio eredita. I tetti in codice sono
`loved 20`, `liked 15`, `library 15` (`seeds.js:14`); `watched` non ha tetto. La doc
`docs/LIBRARY_MODULE.md:52` parla di “max 60”: è **stale**, il codice è la fonte.

### 4.2 La mappa evento → segnale

| Evento Nuvio | Segnale YACA | Peso | Condizione |
|---|---|---|---|
| library add (`added_at`) | `library` | 1 | sempre, se la library è la fonte |
| history row (`watched_at`) | `watched` | 2 × decay | sempre; una sola riga per titolo, non per episodio |
| progress ≥ 90% e `duration ≥ 60000` | `watched` | 2 × decay | **solo se** la history non ha già quel titolo/episodio |
| progress 2%-90% | nessuno (o `started`, [P]) | 0 | non è un gusto, è un’intenzione |
| progress < 2% | nessuno | 0 | rumore |
| delete | retract | — | richiede provenance (vedi 4.6) |
| rating / loved / liked | **non disponibile** | — | Nuvio non li ha |

**Love/Like non esistono in Nuvio.** Non c’è un campo “rating”, non c’è un flag “favorite”, non c’è
un catalogo “loved”. La library è “bookmarked or favorited” (`nuvio-public-api.md:507`), ma è un
unico booleano di appartenenza: non distingue “mi piace” da “lo voglio vedere”. Se YACA vuole la
scala 4/3/2/1, deve continuare a leggere Stremio (loved/liked) o Trakt (rating ≥9 / ≥7). Nuvio può
solo fornire `watched` e `library`.

### 4.3 Episodio vs film: perché non moltiplicare

Nuvio dà una riga per episodio. Se YACA creasse un segnale `watched` per ogni episodio:

- `seeds.js` **non** esploderebbe: il bucket `watched` è una `Map<id, timestamp>` e
  `keepMostRecentSeed` tiene solo il timestamp più recente per titolo (`seeds.js:41-44,128-148`),
  quindi 10 episodi = 1 seme con l’ultima data;
- `ProfileBuilder.recomputeVectorsForUser` **esploderebbe**: somma `200 × decay` per **ogni** segnale
  (`ProfileBuilder.js:234-241`), quindi 10 episodi = 2000 × decay, 10 volte un film.

Questa asimmetria è pericolosa: lo stesso dato produrrebbe un grafo corretto e un DNA gonfiato.
Regola proposta [P]:

> **Un solo segnale `watched` per `(tmdbId, type, source='nuvio')`, con `at = max(watched_at)` e
> `episodesWatched = numero distinto di (season, episode)`.**

Questo allinea Nuvio a Trakt (che già deduplica per `type + source`, `ProfileBuilder.js:420-431`) e a
Stremio (`564-576`), mantenendo il comportamento di entrambi i consumatori. `episodesWatched` è già nel modello
(`WatchHistory.js:20`) ma oggi è incrementato, non impostato: `registraVisione` fa `$inc`
(`reader.js:188-195`) e `syncUserHistory` fa `$inc: 1` a ogni entry (`ProfileBuilder.js:437-439`).
Per un sync incrementale idempotente va **impostato** al conteggio esatto, non incrementato, altrimenti
un replay del delta gonfia il contatore. [O] + [P]

**E il peso episodio vs film?** Oggi YACA non ha un moltiplicatore: un film e una serie da 50 episodi
pesano uguale, perché il segnale è per titolo. Il motore Python del grafo ha una curva per le serie
(`1 + 2*(plays/NEP)`), ma il pool **non manda `plays`**: `convertiSemiPerGrafo` restituisce solo
`tmdbId`, `medium`, `tipo`, `recente` (`pool/index.js:224-290`; la curva è dichiarata a
`pool/index.js:210-214`), e `bolle.js` manda `peso: v.peso`
che però non esiste nel documento (`bolle.js:58-68`). Quindi la curva delle serie oggi non riceve il
dato. Aggiungere un moltiplicatore episodico è una decisione di prodotto, non un dettaglio di
ingestione. La prima versione dovrebbe **non** inventarlo: mantenere la parità con Trakt, salvare
`episodesWatched`, e misurare. [P]

### 4.4 Progress incompleto: non è un “mi piace”, è un “ci sono dentro”

Un item al 40% non è un gusto: è un’intenzione in corso. Mapparlo a `watched` falsa il profilo (come
se l’utente avesse finito), mapparlo a `negative` è peggio (non è un rifiuto). Le opzioni sono:

1. **ignorarlo del tutto** (scelta minima, consigliata per la prima versione);
2. usarlo solo come **esclusione** dalle raccomandazioni (“non suggerire ciò che sta guardando”);
3. introdurre un tipo `started` con peso 0 o 0.5, e testare se migliora o inquina.

Oggi `WatchHistory` non ha `started`; aggiungerlo cambia la matematica del DNA e la semantica dei
seed. Non è necessario per il primo GO. [P]

### 4.5 Doppio conteggio: i cinque casi

| Caso | Cosa succede | Regola |
|---|---|---|
| progress ≥90% **e** history | il server crea entrambi | history vince; progress non aggiunge un secondo `watched` |
| library + history dello stesso titolo | due fatti diversi (bookmark + visione) | si sommano, ma la library vale 1: accettabile |
| stessa serie, 10 episodi | 10 righe history | un solo segnale `watched`, `episodesWatched=10` |
| Nuvio + Trakt specchiati | stessi eventi, due fonti | non ingerire Nuvio se la source è Trakt; o dedupe per `(tmdbId, season, episode, ±finestra)` |
| Nuvio + Stremio | Stremio non dà history per episodio, ma può dare loved/liked | Stremio fornisce la preferenza esplicita; Nuvio fornisce la visione; se un titolo ha `loved`/`liked`, non aggiungere `watched` Nuvio (sussume) |

Il precedente in YACA esiste già: `syncUserHistory` salta il rating Trakt se l’item ha già un segnale
Stremio (`ProfileBuilder.js:408-413`). È una regola “Stremio-first” per i rating; per Nuvio la regola
analoga è “explicit-first”: se c’è un segnale esplicito (loved/liked/negative) da Stremio o Trakt,
Nuvio non deve aggiungere un `watched` per lo stesso titolo. La library Nuvio può restare, perché è
un fatto diverso, ma va pesata 1.

### 4.6 Delete: il punto che YACA oggi non sa fare

Nuvio manda `delete` per library, progress e history (`nuvio-public-api.md:1789-1796`). YACA deve
rimuovere il segnale corrispondente. Ma `WatchHistory.signals` non ha un `event_id`, un `sourceKey` o
un `removedAt`: ha solo `type`, `source`, `at`, `value` (`WatchHistory.js:8-13`). Una volta scritto
`watched`, non si sa **quale** evento lo ha prodotto. Le opzioni:

- **A. Append-only, delete ignorati.** Semplice, ma sbagliato per privacy: l’utente cancella un
  titolo in Nuvio e YACA continua a usarlo per il DNA. Da evitare.
- **B. Staging event-sourced.** Una collezione `NuvioEvent` con
  `{profile, resource, event_id, operation, content_id, season, episode, watched_at, deleted_at}`;
  `WatchHistory` viene **ricalcolato** dai soli eventi attivi. È la strada corretta per delete,
  retention e audit. [P]
- **C. Provenance sui segnali.** Aggiungere `sourceKey`/`eventId` a `signalSchema` e una passata di
  retract. Più leggero della B, ma le cancellazioni di un episodio richiedono comunque di ricalcolare
  il conteggio e la data del titolo.

La B è la sola che rende idempotente anche il replay del delta. La C è un compromesso. In ogni caso,
**non** si può fare “delete = niente” e chiamarlo privacy.

### 4.7 Algoritmo di ingestione proposto

```
per ogni profile Nuvio collegato:
    # 1. history (fonte primaria del gusto)
    per ogni evento history (upsert):
        tmdb = resolve(content_id, content_type)   # tt/tmdb/kitsu
        se non risolve: park, non droppare
        aggrega per (tmdb, type):
            episodes += 1 se season/episode non null
            latest = max(latest, watched_at)
    per ogni titolo aggregato:
        upsert WatchHistory(owner, context, tmdb, type)
            signals = [watched @ latest, source='nuvio']
            episodesWatched = episodes
            lastWatchedAt = latest
    per ogni evento delete:
        rimuovi l’episodio dal raw; ricalcola aggregato
        se episodes == 0: rimuovi il segnale watched
    # 2. library (segnale debole + watchlist)
    per ogni evento library (upsert):
        upsert UserLibraryItem/NuvioLibraryItem con tmdbId, added_at
        upsert segnale library @ added_at (peso 1)
    per ogni delete:
        soft-delete + rimuovi segnale library
    # 3. progress (solo completamento residuo)
    per ogni progress ≥90% e duration≥60s:
        se history non ha già (tmdb, season, episode):
            trattalo come watched (una volta)
    # 4. ricalcolo
    recomputeVectorsForUser(owner, context)
```

---

## 5. Cosa YACA può calcolare, e cosa manca rispetto a Stremio/Trakt

**Stato**: capacità e limiti YACA [O]; confronto con Stremio/Trakt [D] + [O]; pesi episodio [P].

### 5.1 Cosa può calcolare davvero

Con Nuvio **history** risolta a TMDB:

- **seed pesati** (`semiDi`): `watched` con decay 60 giorni, più `library` se c’è anche la library.
  Niente loved/liked: la scala parte da 2, non da 4.
- **tipi dei seed** (`tipi`): solo `watched` e `library`; il tipo più forte vince
  (`seeds.js:174-199`).
- **recency** (`ultimaVisione`): da `watched_at`, utile per `recente` nel payload del grafo.
- **DNA** (`V_active`, `V_final`): solo dopo risoluzione a `tmdbId`, perché
  `_fetchDnaItemsFromDuckDb` legge `genres`, `keywords`, `cast`, `directors` dal parquet
  (`ProfileBuilder.js:129-182`) e `extractActiveDNAFromTmdbData` costruisce chiavi `g:` e `k:`
  (`dnaEngine.js:637-674`); le chiavi `o:` esistono nella funzione ma questo percorso non seleziona
  `origin_country`, quindi in pratica non vengono prodotte. Nuvio non porta keyword: senza
  TMDB/DuckDB, il DNA non si può fare.
- **watchlist**: dalla library, ma serve il discriminante di fonte (vedi 3.4). `leggiWatchlist`
  filtra per `addonUuid`, `removed:false`, `duplicateOf:null` (`reader.js:37-58`): Nuvio library
  deve quindi o condividere l’`addonUuid` o avere un lettore dedicato.
- **flatness metrics**: `calculateFlatnessMetrics(vFinal)` è già calcolato
  (`ProfileBuilder.js:302`); può fare da quality gate (“questo profilo è troppo piatto per essere
  usato”). [P]

Con Nuvio **library** soltanto:

- `seeds.js` non legge `UserLibraryItem` se il profilo non ha alcun documento in `WatchHistory`:
  `profiloHaCronologiaReale(historyDocs)` (`seeds.js:54-56,150-169`). Ma l’ingestione Stremio scrive
  la library **anche** come segnale `library` dentro `WatchHistory` (`ProfileBuilder.js:477`), quindi
  un profilo con sola library non è freddo: ottiene seed di **peso 1**. Il “freddo” vero è un profilo
  senza alcun documento (es. creato dopo l’ultimo sync). Per Nuvio è una scelta: se la library resta
  solo in `UserLibraryItem`, viene ignorata dai seed; se diventa segnale `library`, è un cold-start
  **debole**.
- `recomputeVectorsForUser` invece legge la library anche senza history
  (`ProfileBuilder.js:248-269`), ma `calculateWeightedInteractions` esclude `library`
  (`dnaEngine.js:707-722`), quindi con un `V_static` già presente e `T=0` il `V_final` è **solo
  statico** (`computeFinalDNA`, `dnaEngine.js:726-780`). In pratica: la library da sola non scalda
  il DNA finale di un profilo che ha già un onboarding statico.
- Quindi **la library Nuvio, da sola, non è un buon cold-start**: al massimo un seed di peso 1 e
  nessun contributo a `T`. Non sostituisce la history; può solo accompagnarla.

### 5.2 Cosa manca rispetto a Stremio e Trakt

| Capacità | Stremio | Trakt | Nuvio |
|---|---|---|---|
| Preferenza esplicita | **loved / liked** (cataloghi likes) | **rating 1-10** → loved/liked/watched/negative | **no** |
| Segnale negativo | no | sì (<5) | no |
| Library/watchlist | sì (`libraryItem`, `state`) | watchlist + liste personali | sì, ma “bookmark/favorited” |
| History per episodio | no (solo `state` ultimo) | **sì** (`/users/me/history`) | **sì** (una riga per episodio) |
| Progress per episodio | `state.timeOffset`/`timeAsPercentage` | playback progress | **sì** (`position`/`duration`) |
| Rewatch | `state.timesWatched` | history/plays | **no** |
| Flag “visto a mano” | `state.flaggedWatched` | rating/history | no |
| Delta con delete | no (datastore pieno) | paginato, non event-cursor | **sì** (`event_id` + delete) |
| Isolamento per profilo | no (library account-level) | no (account-level) | **sì** (profile_id) |
| Identità | `tt`/`tmdb:`/`kitsu:` | `trakt`/`tmdb`/`imdb` | id meta grezzo (`tt`/`tmdb:`/`kitsu:`/…) |
| Auth | `authKey` lunga | OAuth token | email/password, access 1h + refresh |

Fonti: Stremio `src/stremio/collection.js:147-159,195-207`; Trakt `src/library/traktFetchers.js:110-116`
e `ProfileBuilder.js:371-395`; Nuvio docs sezioni 1.1-1.3; NuvioTV `WatchedItem.kt:24-33`.

**Il vantaggio Nuvio** non è la preferenza: è la **history per episodio** e l’**isolamento per
profilo**. Stremio dà una library account-level e uno `state` per titolo; YACA la fa esplodere su
tutti i contesti (`ProfileBuilder.js:481-484`), quindi ogni profilo eredita la stessa library. Nuvio,
se mappato 1:1, permette di tenere i profili separati. Questo è il vero motivo per usarlo.

**Il difetto Nuvio** è che senza loved/liked/negative il profilo è più piatto: il DNA impara i generi
e le keyword dei titoli visti, ma non la preferenza relativa. Un utente che guarda tutto non viene
distinto da uno che ama poco e sceglie molto.

### 5.3 Cosa YACA perde rispetto a Stremio

- `state.timesWatched`: Nuvio non ha un contatore di repliche.
- `state.flaggedWatched`: Nuvio non ha un flag manuale “visto”.
- `state.timeOffset`/`timeAsPercentage` sulla library: Nuvio li tiene nel progress, non nella library.
- La library Stremio è una fotografia completa con `removed`/`temp`; Nuvio ha i delete nel delta, ma
  lo snapshot non ha un flag `removed` (un’assenza è un’assenza).

### 5.4 Cosa YACA perde rispetto a Trakt

- Rating e quindi `negative`.
- Liste personali (Nuvio non le espone: l’API pubblica ha `library`, non le liste dell’utente).
- `plays`/rewatch.
- Un `watched_at` per episodio già “pulito” e un’identità `trakt`/`tmdb`/`imdb` stabile.

---

## 6. Privacy, consenso, retention

**Stato**: auth, profili e delete [D]; PIN non applicato dall’API [D] + [O]; retention e consenso [P].

### 6.1 L’autenticazione è il vero no-go

Nuvio non ha OAuth con scope, non ha una API key read-only, non ha un token per singolo profilo.
L’unica auth documentata è email/password → `access_token` (1h) + `refresh_token`
(`nuvio-public-api.md:190-245`). Chi tiene il refresh token può leggere **tutto** l’account: library,
history, progress, addons, collections, settings, tutti i profili. Non esiste un endpoint di export
documentato; la docs dice esplicitamente che non copre “destructive account flows”
(`nuvio-public-api.md:13`).

Conseguenze:

- **Non chiedere la password.** Chiedere email/password a un utente per un servizio terzo è un
  pessimo UX e un rischio legale. Se si fa, deve essere un flusso una tantum, con password mai
  persistita, e solo su istanza self-hosted.
- **Meglio il refresh token**, cifrato a riposo, con revoca e cancellazione immediate. Ma resta un
  token account-wide.
- **Il “sync code” non è una soluzione pubblica.** NuvioTV ha `generate_sync_code` / `claim_sync_code`
  (`SyncRepositoryImpl.kt:23-70`), ma è dietro un flag di debug (`DebugSettingsDataStore.kt:29-37`,
  `DebugSettingsScreen.kt:134-139`) e non è nella docs pubblica. Può diventare un device-link in
  futuro; oggi è [O] interno e instabile, non una base contrattuale.

### 6.2 Profili e PIN: chiedere, non assumere

- Elencare i profili con `sync_pull_profiles` e **far scegliere** quali collegare. Default: nessuno.
- Non iterare `1..6` in automatico. Un profilo “Kids” o “Ospiti” non è consenso.
- Non trattare `pin_enabled` come autorizzazione: la docs dice che il PIN è app-specific e non è
  nell’API (`nuvio-public-api.md:380`). Un profilo con PIN è leggibile con il token account. [T]
- Se il profilo viene cancellato e ricreato con lo stesso `profile_index`, `created_at` cambia:
  rilevarlo e **non** riusare cursori e storia del profilo precedente. Salvare `profile_created_at`
  e `profile_name`.
- Se l’account viene cancellato, l’API restituisce 401/404: marcare `orphaned`, fermare i pull e
  avviare la purge.

### 6.3 Cosa chiedere all’utente (checklist di consenso)

1. “Nuvio è un servizio terzo: YACA legge i tuoi dati, non scrive nulla.”
2. “Quali profili vuoi collegare?” (lista nomi; nessun default).
3. “Cosa vuoi importare?” — history (consigliato), library (consigliato), progress (opzionale).
4. “Come vuoi aggiornarlo?” — una tantum / giornaliero / manuale.
5. “Quanto teniamo i dati grezzi?” — 30/90 giorni / finché collegato.
6. “Puoi revocare quando vuoi; cancelliamo token e dati derivati.”
7. Per profili kids/condivisi: conferma separata, o esclusione.
8. Mostrare i conteggi prima di importare: `get_sync_overview` dà `library_items`,
   `watch_progress`, `watched_items` per profilo (`nuvio-public-api.md:1706-1740`). Serve anche a
   capire se la source è vuota perché è Trakt/Simkl/MDBList.

### 6.4 Cosa leggere e cosa non leggere

**Leggere (minimo):**

- `sync_pull_profiles`: solo id/name/created_at per la lista di scelta;
- `sync_pull_library`: `content_id`, `content_type`, `added_at`, `name`, `genres` (per staging);
- `sync_pull_watched_items`: `content_id`, `content_type`, `season`, `episode`, `watched_at`;
- `sync_pull_watch_progress`: `content_id`, `content_type`, `season`, `episode`, `position`,
  `duration`, `last_watched`;
- `get_sync_overview`: conteggi.

**Non leggere (fuori scope o sensibile):**

- `sync_pull_profile_settings_blob` (tema, player, preferenze UI);
- `sync_pull_home_catalog_settings` (layout home);
- `sync_pull_collections` / `sync_push_collections` (collezioni);
- addons (`/rest/v1/addons`);
- avatar, supporter wall, `linked_devices`;
- profili non selezionati;
- `description`, `poster`, `background` se servono solo al DNA: sono peso inutile e superficie di
  dati in più. Per la watchlist servono, ma si possono leggere solo per gli item visibili.

**Non scrivere mai:** nessun `sync_push_*`, nessun `sync_delete_*`. La mappa lo mette fuori scope
(`map.md:238-240`); qui diventa un invariante di prodotto: Nuvio è **read-only** per YACA.

### 6.5 Retention

| Dato | Dove | Retention proposta | Cancellazione |
|---|---|---|---|
| `access_token` / `refresh_token` | store cifrato | finché collegato | immediata su disconnect |
| `nuvioUserId`, `profileId`, `profileCreatedAt` | link table | finché collegato | immediata |
| raw library / history / progress events | staging Nuvio | 30 giorni (configurabile 90) | job su disconnect |
| segnali derivati in `WatchHistory` | Mongo | finché collegato + 30 giorni | purge + recompute |
| `TasteProfile` (DNA) | Mongo | finché collegato + 30 giorni | recompute dopo purge |
| log applicativi | log | 30 giorni, **solo conteggi** | rotazione |
| backup | backup Mongo | secondo la retention del backup | documentare il ritardo |

La FAQ Nuvio dice che cancellare un profilo rimuove library, history, settings, collections e addons;
cancellare l’account rimuove tutto e “treat both actions as permanent”
(`nuvio.tv/faq`, sezione “What happens if I delete a profile or account?”). Nuvio **non** dice per
quanto tiene i dati prima di cancellarli, e non c’è un endpoint di export. YACA deve colmare questo
buco con la propria retention, non assumere quella di Nuvio.

### 6.6 Cancellazione e orfani

- **Disconnect volontario:** cancellare token, link, raw events e segnali Nuvio; ricalcolare il DNA
  senza Nuvio; conservare solo aggregati anonimi se l’utente li accetta.
- **Profilo Nuvio cancellato:** il prossimo `sync_pull_profiles` non lo restituisce; marcare
  `orphaned`, purge dopo 7 giorni di grazia (per evitare falsi positivi di un errore transitorio).
- **Account cancellato/401 persistente:** `revoked`, purge dopo 7 giorni.
- **Backup:** se la purge non attraversa i backup, dichiararlo. Un backup a 30 giorni significa che
  il dato può riapparire per 30 giorni; va scritto nel consenso.
- **Export:** offrire un JSON dei raw event e dei segnali derivati per profilo. Non è richiesto dalla
  docs Nuvio, ma è necessario per i diritti dell’utente.

### 6.7 Ownership e termini

La docs Nuvio ha un notice esplicito: la licenza del progetto open source **non** concede diritti sui
nomi, loghi, branding o sull’accesso al servizio hosted; “separate terms, trademark rules, or service
restrictions may apply” (`nuvio-public-api.md:9-13`). Quindi:

- YACA non può presentarsi come “integrazione ufficiale Nuvio” senza accordo.
- L’API è un servizio hosted: può cambiare, rate-limitare o chiudere. YACA deve trattare i dati Nuvio
  come **cache/snapshot**, non come system of record.
- La copia canonica resta su Nuvio; YACA non può garantire che un delete Nuvio si propaghi se non
  polling.
- Per un’istanza multi-tenant servono DPA/consenso/retention; per un’istanza self-hosted single-user
  il rischio è molto più basso.

---

## 7. Sync: una tantum, periodico, on-demand

**Stato**: cadenza Nuvio [D] + [O]; matrice di coesistenza [P]; detection della source [T].

### 7.1 Tre modalità, tre contratti

| Modalità | Quando | Cosa fare | Costo |
|---|---|---|---|
| **Una tantum** | onboarding, “importa e basta” | snapshot library+history, risoluzione, calcolo, poi disconnect | alto una volta, zero nel tempo |
| **Periodico** | utente attivo | delta giornaliero (o 6-12h) + profile check + token refresh | basso: 3 RPC per profilo |
| **On-demand** | prima di generare un catalogo, se stale | delta in background, non bloccare la risposta | basso, ma serve un lock |

Nuvio stesso non è realtime: la FAQ dice che sincronizza “in batches”, all’apertura, al ritorno in
foreground, al cambio profilo o su refresh manuale (`nuvio.tv/faq`, “Why is my sync not realtime?”).
NuvioTV ha un pull periodico di 15 minuti e un minimo di 2 minuti tra i pull foreground
(`StartupSyncService.kt:35-36,125-133`). Polling più frequente di 15 minuti non porta dati nuovi:
**giornaliero o 6-12h è sufficiente**. YACA già usa 8h ± 2h per Stremio
(`collection.js:339-355`); per Nuvio si può usare la stessa finestra, con jitter.

### 7.2 Cosa succede se l’utente usa Nuvio e Stremio insieme

| Configurazione Nuvio | Cosa leggere da Nuvio | Cosa leggere da Stremio/Trakt | Regola |
|---|---|---|---|
| library `LOCAL`, progress `NUVIO_SYNC` | library + history | Stremio loved/liked; Trakt rating se c’è | Nuvio = visione; Stremio/Trakt = preferenza |
| library `TRAKT`, progress `TRAKT` | **niente** (è uno specchio) | Trakt | evitare doppio conteggio |
| library `LOCAL`, progress `TRAKT` | solo library | Trakt per history/rating | Nuvio library è un fatto in più |
| library `TRAKT`, progress `NUVIO_SYNC` | solo history/progress | Trakt per library | Nuvio history è il fatto in più |
| `SIMKL`/`MDBLIST` | dipende: quei provider non sono la fonte YACA | YACA non li legge | trattare Nuvio come specchio, non come fonte |

La tabella è una **proposta** [P], perché l’API non espone la source. Per rilevarla:

- `get_sync_overview`: se `library_items`/`watched_items` sono 0 ma l’utente dice di usare Nuvio,
  probabilmente la source è esterna;
- confronto con Trakt: se l’80% degli eventi coincide per titolo/episodio entro una finestra,
  Nuvio è uno specchio;
- domanda diretta nel consenso: “Nuvio usa Trakt/Simkl/MDBList per library o progress?”
- in futuro, se Nuvio esporrà la setting, leggerla.

### 7.3 Se Nuvio e Stremio hanno lo stesso titolo

- **Library:** `UserLibraryItem` non può tenere due fonti (vedi 3.4). Serve `source` o collezione
  separata. La deduplica per `tmdbId` evita due card, ma non due segnali.
- **History:** `WatchHistory` è già multi-fonte via `signals[].source`; la chiave `tmdbId` unisce.
  Il rischio è il doppio `watched`: se Nuvio e Trakt descrivono la stessa visione, va tenuto un solo
  segnale (o uno con `source='nuvio+trakt'`).
- **Preferenza:** Stremio loved/liked e Trakt rating restano la fonte più forte. Nuvio non deve
  sovrascriverli; al massimo aggiunge `library`.
- **Profili:** non riusare il fan-out di `syncStremioData`/`syncUserHistory`
  (`ProfileBuilder.js:356-357,481-484`): Nuvio è già per profilo; il fan-out annullerebbe il vantaggio
  e mescolerebbe i gusti di profili diversi.

### 7.4 Cosa fare se l’utente cambia configurazione

- Cambio di profilo Nuvio → reset cursori e rebuild del contesto YACA mappato.
- Cambio di source dentro Nuvio (Trakt → Nuvio Sync) → i dati Nuvio possono passare da vuoti a pieni;
  fare un full snapshot e un rebuild, non fidarsi del delta.
- Disconnect Nuvio → purge e recompute; non lasciare segnali orfani.
- Cambio di account Nuvio → è un’identità nuova: purge del vecchio, nuovi cursori.

---

## 8. Go / No-Go

**Stato**: sintesi e decisione [P], basata sulle evidenze delle sezioni 1-7.

### GO — casi in cui conviene

1. **Utente Nuvio-only** (nessun Trakt/Stremio) che usa `NUVIO_SYNC`/`LOCAL` e vuole raccomandazioni
   YACA. È il caso in cui Nuvio è l’unica fonte e porta un dato che oggi YACA non ha.
2. **Utente con più profili Nuvio** che vuole gusti separati: Nuvio è l’unica fonte, tra quelle
   disponibili, che isola la history per profilo.
3. **Import una tantum** della history per il cold start, poi disconnect: costo di privacy minimo,
   beneficio immediato.
4. **Self-hosted single-user** che accetta di conservare un refresh token cifrato e vuole il
   “continue watching”/history senza Trakt.

### NO-GO — casi in cui non conviene

1. **Nuvio con source Trakt/Simkl/MDBList** per library o progress: l’API può essere vuota o
   specchiare dati che YACA già legge da Trakt. Doppio conteggio garantito.
2. **Utente che non vuole condividere un token account-wide** e non esiste ancora uno scope/device
   link pubblico. Non forzare la password.
3. **Profilo kids o account condiviso** senza consenso esplicito: il PIN non protegge l’API.
4. **Aspettativa di Love/Like/negative**: Nuvio non li ha; se il prodotto promette “gusti come
   Stremio/Trakt”, non è vero.
5. **YACA multi-tenant senza cifratura, retention e purge**: il dato di visione è sensibile e il
   token è account-wide.
6. **Library come unico segnale di cold start**: pesa 1, non entra in `T`, e se resta fuori da
   `WatchHistory` viene ignorata dai seed; non sostituisce la history.

### CONDITIONAL — cosa deve esistere prima

- una **dimensione `source`** nella library (o una collezione Nuvio separata);
- una **tabella eventi/raw** per history/progress, con `event_id` e tombstone;
- la chiave di `WatchHistory` che include il **tipo** (movie/tv);
- un resolver unico che conosca `tt`, `tmdb:`, `kitsu:` e, se si vuole, `anilist:`/`mal:`;
- un consenso per profilo e una retention scritta;
- un test di non-regressione che dimostri che Nuvio non scrive mai su Nuvio (nessun push).

---

## Appendice A — Test plan minimo

| Test | Cosa prova | Come |
|---|---|---|
| **T1 — namespace** | il server accetta id non-TMDB | account di prova, un item `tt…`, uno `tmdb:…`, uno `kitsu:…`, leggere library/history via API |
| **T2 — progress cap** | il cap 200 è reale o solo senza timestamp | `sync_pull_watch_progress` con `p_since_last_watched=0`, `p_limit` grande, contare le righe |
| **T3 — delete** | il delta porta i delete e lo snapshot non li resuscita | cancellare library/history/progress, leggere delta, poi snapshot, verificare |
| **T4 — profili** | il token legge profili non selezionati / PIN | account di prova con due profili, uno con PIN, leggere `p_profile_id=2` senza selezionarlo |
| **T5 — source** | Nuvio con Trakt è vuoto/specchio | account con Trakt, `get_sync_overview`, poi passare a Nuvio Sync e riconfrontare |
| **T6 — coerenza** | snapshot e delta non perdono righe | scrivere durante lo snapshot, confrontare conteggi con `get_sync_overview` |
| **T7 — idempotenza** | riapplicare un delta non gonfia | applicare due volte lo stesso page, verificare `episodesWatched` e i pesi |
| **T8 — cancellazione profilo** | YACA rileva l’orfano | cancellare un profilo Nuvio, chiamare `sync_pull_profiles`, verificare l’assenza |

## Appendice B — RPC usate (solo lettura)

| RPC | Uso | Note |
|---|---|---|
| `sync_pull_profiles` | lista profili per il consenso | no body |
| `sync_get_library_delta_cursor` | cursore library | per profilo |
| `sync_pull_library` | snapshot library | offset 500 |
| `sync_pull_library_delta` | delta library | `event_id` |
| `sync_get_watched_items_delta_cursor` | cursore history | per profilo |
| `sync_pull_watched_items` | snapshot history | page/page_size |
| `sync_pull_watched_items_delta` | delta history | delete per episodio |
| `sync_get_watch_progress_delta_cursor` | cursore progress | per profilo |
| `sync_pull_watch_progress` | ultimi 200 / timestamp | **non** paginato |
| `sync_pull_watch_progress_delta` | delta progress | delete per `progress_key` |
| `get_sync_overview` | conteggi pre-import | per profilo |

**Mai chiamare:** `sync_push_*`, `sync_delete_*`, `sync_push_profiles`, `sync_push_addons`,
`sync_push_collections`, `sync_push_profile_settings_blob`, `sync_push_home_catalog_settings`.

## Appendice C — Mappa campo Nuvio → destinazione YACA

| Campo Nuvio | Destinazione YACA | Trasformazione |
|---|---|---|
| `library.content_id` | `UserLibraryItem.itemId` + `tmdbId` | `normalizeLibraryId`, poi `resolveTmdbIdentity` |
| `library.content_type` | `UserLibraryItem.type` / `WatchHistory.type` | `series` → `tv` nella history |
| `library.name` | `UserLibraryItem.name` | diretto |
| `library.poster` / `poster_shape` / `background` | `UserLibraryItem.poster` / `posterShape` / `background` | diretto; normalizzare `POSTER` → `poster` |
| `library.release_info` | `UserLibraryItem.year` | parse dell’anno |
| `library.added_at` | `_ctime` / `_mtime` + `signal.at` | epoch ms → Date |
| `library.genres` | staging / fallback | nomi, non id; non entra nel DNA senza mapping |
| `library.imdb_rating` | display | non è un rating utente |
| `history.content_id` + `season`/`episode` | `WatchHistory.tmdbId` + `episodesWatched` | resolve; conteggio distinto episodi |
| `history.watched_at` | `WatchHistory.lastWatchedAt` + `signal.at` | epoch ms → Date; max per titolo |
| `progress.progress_key` | chiave di deduplica raw | non è un campo YACA |
| `progress.position` / `duration` | staging / `state` | non è un segnale DNA |
| `progress.last_watched` | recency / `state` | solo se completato o per UI |

---

## 9. Cosa significa per YACA

**Nuvio è una fonte di fatti, non di preferenze.** La library dice “l’ho salvato”, la history dice
“l’ho finito”, il progress dice “ci sono dentro”. Nessuno dei tre dice “mi è piaciuto” o “non mi è
piaciuto”. Per il DNA di YACA questo basta a costruire un profilo di **consumo** (generi, keyword,
recenza), ma non un profilo di **gusto relativo**: senza loved/liked/negative, un utente onnivoro e
uno selettivo che hanno visto gli stessi titoli risultano uguali. La scala 4/3/2/1 resta appesa a
Stremio e Trakt; Nuvio può sostituire la parte “watched”, non la parte “loved”.

**Il dato più prezioso è la history per episodio, non la library.** La library è un bookmark unico e
ambiguo (“favorito” o “da vedere”?), e in YACA è già la sorgente più debole: peso 1, nessun contributo
a `T`, e se resta fuori da `WatchHistory` viene ignorata dai seed. La history dà un fatto per episodio,
con `watched_at`, e permette di
distinguere “ho visto la serie” da “ho visto un episodio”. È l’unico pezzo che Nuvio fa meglio di
Stremio (che ha solo lo `state` dell’ultimo episodio); rispetto a Trakt non aggiunge granularità, ma
dà un conteggio episodi che Stremio non ha. **La prima fetta giusta è history-first**, non
library-first.

**Il collo di bottiglia non è l’API, è il modello di YACA.** `UserLibraryItem` è Stremio-shaped
(`addonUuid`, `itemId`, `state`) e non ha una fonte; `WatchHistory` è title-shaped (`tmdbId` senza
tipo) e non ha un event id; `episodesWatched` è incrementale e non idempotente. Inserire Nuvio senza
toccare questi tre punti produce: library mescolate, titoli film/serie che si sovrascrivono, contatori
gonfiati e delete che non cancellano. Il lavoro di ricerca non è “come chiamare le RPC”, è **come
rendere il dominio libreria multi-fonte e event-sourced**.

**La privacy è il gate, non una nota a piè di pagina.** Nuvio non ha OAuth con scope, non ha token
read-only, non ha export; il PIN non è applicato dall’API; un refresh token legge tutti i profili.
Questo va bene per un’istanza self-hosted single-user, molto meno per un servizio multi-tenant. Se
YACA vuole Nuvio come fonte per tutti, deve prima ottenere (o costruire) un consenso per profilo,
una retention e una purge che attraversi i backup. Altrimenti il rischio non vale il guadagno: la
history di Nuvio è un buon dato, ma non un dato per cui chiedere la password dell’account.

**Verdetto operativo.** GO condizionato a un primo esperimento **read-only, history-first, per un solo
profilo, con import una tantum o giornaliero**, su utenti Nuvio-only. La library può seguire quando
esiste la dimensione `source`; il progress serve solo per il “continue watching” e per il completamento
residuo, non come segnale DNA. NO-GO per gli utenti che usano Nuvio come specchio di Trakt/Simkl/
MDBList, per gli account condivisi e per chi si aspetta la stessa fedeltà di Stremio/Trakt.

---

## 10. Domande aperte

1. **Il server Nuvio accetta davvero `tt…`, `kitsu:`, `anilist:`, `mal:` in `content_id`?** La docs
   documenta solo `tmdb:550`; il client scrive l’id grezzo. Serve un test su un account di prova con
   un item per namespace. [T]
2. **`sync_pull_watch_progress` con `p_since_last_watched=0` e `p_limit` grande restituisce tutto o
   applica il cap 200?** Se restituisce tutto, lo snapshot progress è recuperabile; se no, history è
   l’unica fonte storica. [T]
3. **`event_id` è globale o per profilo/risorsa? Ci sono buchi dopo i delete?** La docs dice
   “monotonically increasing” ma il cursore è per profilo; serve un test con due profili e delete
   incrociati. [T]
4. **Snapshot e delta sono transazionalmente coerenti?** Uno snapshot può resuscitare un item
   cancellato? YACA deve tenere tombstone o fidarsi del server? [T]
5. **Esiste un modo pubblico per ottenere un token scoped/read-only o un device link?** Il
   `sync_code` è dietro flag di debug e non è in docs; chiedere a Nuvio se diventerà pubblico. [T]
6. **L’API espone la source (Trakt/Simkl/MDBList vs Nuvio Sync)?** No, e non è nella docs. YACA può
   solo inferirla o chiederla all’utente. [D] + [P]
7. **Il `profile_index` può essere riusato dopo la cancellazione?** Se sì, `created_at`/`name` sono
   l’unica difesa; serve una conferma. [T]
8. **La library Nuvio contiene anche le liste personali o solo la lista default?** La docs parla di
   “library”, non di liste; NuvioTV ha `LibraryListTab` e provider Trakt/MDBList separati. [O] + [T]
9. **Che semantica ha la library: watchlist o preferiti?** La docs dice “bookmarked or favorited”,
   ma non distingue. Per YACA è un `library` di peso 1; non va promossa a “loved”. [D] + [P]
10. **Come pesare un episodio rispetto a un film?** Oggi YACA non lo fa; il grafo ha una curva per
    le serie ma non riceve `plays`. Serve una decisione di prodotto e una misura, non un’invenzione
    nell’ingestione. [P]
11. **Il progress incompleto è un segnale?** Oggi non c’è `started`; aggiungerlo cambia la matematica
    del DNA. La prima versione può ignorarlo e usarlo solo come esclusione. [P]
12. **Come si cancella un segnale derivato quando Nuvio manda `delete`?** Serve una tabella eventi o
    una provenance sui segnali; `WatchHistory` oggi non lo consente. [O] + [P]
13. **La chiave di `WatchHistory` deve includere `type`?** Sì, se si vuole evitare la collisione
    film/serie sullo stesso numero TMDB; è un cambio di schema con migrazione. [O] + [P]
14. **Che retention/DPA offre Nuvio?** La FAQ dice che la cancellazione è permanente, ma non dice per
    quanto tiene i dati né offre export. YACA deve definire la propria. [D] + [P]
15. **Kaptain usa library/history?** Non è nel workspace e non è stato letto; se esiste una copia
    altrove, va verificato separatamente. [—]


