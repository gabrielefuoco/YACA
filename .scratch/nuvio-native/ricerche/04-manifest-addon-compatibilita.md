# 04 — Manifest addon e compatibilità Nuvio: paginazione, tipi, ID, meta

**Ricerca del 20/10/2026.** Nessuna modifica al prodotto, nessun cambio di stato del ticket.
Fonti primarie lette quel giorno: codice YACA, codice NuvioTV (`dev`, commit
`f062601cc6b9561c4a50aa7ab7464d7ddc555c5e`), codice NuvioMobile (`cmp-rewrite`, commit
`324afcffb962f1f7df45c5fa951131acec5a15a7`), specifica Stremio, Nuvio Public API v1.3, manifest
live di Torrentio e Cinemeta, `getManifest.ts` di AIOMetadata, JS di Kaptain.

Legenda delle fonti:

- **[D]** documentato in una specifica o doc pubblica.
- **[O]** osservato nel codice o in una risposta live.
- **[T]** dedotto ma da verificare su device.

Shorthand dei path:

| Sigla | Base |
|---|---|
| `YACA` | repository locale `C:\Users\gabri\APP\YACA` |
| `TV` | `https://github.com/NuvioMedia/NuvioTV/blob/f062601cc6b9561c4a50aa7ab7464d7ddc555c5e/` |
| `MOB` | `https://github.com/NuvioMedia/NuvioMobile/blob/324afcffb962f1f7df45c5fa951131acec5a15a7/` |

---

## Risposta in breve

1. **Il mismatch 20 vs 100 è reale, ma non rompe il “load more” della home.** Nuvio calcola il
   prossimo `skip` come `skip + numero di item realmente tornati` (`TV
   app/src/main/java/com/nuvio/tv/data/repository/CatalogRepositoryImpl.kt:99-104`), quindi con
   YACA chiede 20, poi 40, poi 60. Il punto che si rompe è **Discover su Nuvio TV**, che usa
   `(pagina - 1) * skipStep` con `skipStep = 100` quando il manifest non dichiara `pageSize`
   (`TV app/src/main/java/com/nuvio/tv/ui/screens/search/SearchViewModel.kt:1078-1082`).
2. **`pageSize` è la correzione giusta e va messo a 20 per i cataloghi che paginano davvero a 20.**
   Non va messo a 100 “per far contento Nuvio”: peggiorerebbe lo stesso salto.
3. **`showInHome` assente significa “sì” su Nuvio TV.** YACA oggi non lo dichiara: i suoi 20 hero +
   3 watchlist (23 cataloghi non-search) sono automaticamente eleggibili come righe home su TV (le
   righe vuote possono non comparire). Su mobile il campo non viene nemmeno letto: tutte le 23
   restano eleggibili.
4. **`anime` e `other` diventano `ContentType.UNKNOWN` su TV, ma il tipo grezzo è preservato** e le
   richieste partono comunque con `type=anime` / `type=other`
   (`TV …/domain/model/ContentType.kt:11-17`, `…/domain/model/Addon.kt:47-48`). Non è un blocco
   funzionale osservato; è un rischio UI/test.
5. **Gli ID sono il punto più delicato.** I film YACA diventano `tt…` quando c’è l’IMDb; le serie
   restano `tmdb:…`; gli anime in simulcast usano `kitsu:…`. Torrentio dichiara stream per
   `tt` e `kitsu` (non `tmdb:`), Cinemeta solo `tt`: una serie YACA con id `tmdb:` non viene
   risolta da quegli addon finché Nuvio non converte l’id a IMDb nel dettaglio.
6. **`meta`: YACA vince per le proprie righe per default**, non per ordine di installazione. Il
   “conflitto” con AIOMetadata/Cinemeta esiste solo per item non-YACA o quando l’utente accende
   “prefer external meta”. Il catalog-only è sensato per film/serie con ID IMDb; è rischioso per
   gli anime Kitsu se non c’è AIOMetadata.
7. **`sortBy` non viene mai inviato da Nuvio.** Gli extra che Nuvio usa davvero sono `skip`,
   `search` e — solo da collection/Discover — `genre`. `options`, `default`, `optionsLimit` sono
   parsati ma non guidano una UI generica.
8. **Versioning:** la `version` dinamica va bene; **non** va emesso `configVersion` come stringa
   (Nuvio lo tipizza `Long`). TV fa refresh del manifest non più spesso di ogni 6 ore; mobile lo
   rifetcha a ogni avvio.

---

## 1. Matrice del manifest, campo per campo

Riferimenti NuvioTV: DTO in `TV app/src/main/java/com/nuvio/tv/data/remote/dto/AddonManifestDto.kt:7-35`,
mapping in `TV app/src/main/java/com/nuvio/tv/data/mapper/AddonMapper.kt:15-52`. Riferimento Stremio:
`https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md`.

### 1.1 Campi di primo livello

| Campo | Chi lo legge | Obbligo | YACA oggi | Verdetto |
|---|---|---|---|---|
| `id` | TV, mobile, Kaptain | **Sì** (Moshi non-null; Kaptain) | `org.stremio.yaca.catalog` (`YACA src/stremio/manifest.js:170`) | **Must.** Attenzione: è lo stesso per tutti i profili; Nuvio lo usa come `Addon.id` e le collection lo usano come chiave (`TV …/ui/screens/collection/FolderDetailViewModel.kt:751`). |
| `name` | tutti | **Sì** | sì (`manifest.js:172`) | Must. |
| `version` | tutti | **Sì** | `1.0.4` o `1.0.4+<configVersion>` (`manifest.js:78-79,171`) | Must. Dinamica, ma vedi §7. |
| `description` | TV/mobile, UI addon | Stremio sì; Nuvio opzionale | sì (`manifest.js:173`) | Ok. |
| `logo` | TV/mobile | No | sì (`manifest.js:174`) | Ok. |
| `background` | TV lo legge ma non risulta usato; mobile lo ignora | No | assente | Nice. |
| `resources` | TV/mobile | **Sì** | `["catalog","meta"]` (`manifest.js:175-178`) | Must. Valuta resource object per limitare `meta` (§6). |
| `types` | TV/mobile | **Sì** | `["movie","series","anime","other"]` (`manifest.js:179`) | Must, ma `other` è dichiarato senza cataloghi: toglierlo (§3). |
| `idPrefixes` | TV/mobile per meta/stream | No | `["tt","tmdb:","kitsu:"]` (`manifest.js:181`) | Should: allineare agli ID realmente emessi; `anilist:`/`mal:` non sono coperti. |
| `catalogs` | TV/mobile | **Sì** | 27 con config vuota (verifica runtime) | Must. |
| `behaviorHints` | TV/mobile parsano `configurable`/`configurationRequired`, ma **non** guidano un flusso di configurazione in Nuvio | No | `configurable:true`, `configurationRequired:false` (`manifest.js:182-185`) | Innocuo. Non aspettarti un bottone “Configure” in Nuvio. |
| `contactEmail` | **Non è nel DTO TV** | No | presente (`manifest.js:186`) | Ignorato da Nuvio; utile per Stremio. |
| `configurationURL` | **Non è nel DTO TV né nel parser mobile** | No | presente (`manifest.js:187`) | Ignorato da Nuvio. La configurazione passa dall’URL completo che l’utente installa. |
| `language` | TV lo legge e lo usa solo nella firma cache | No | assente | Nice (`"it-IT"`), nessun effetto UI osservato. |
| `configVersion` | TV: `Long?`, solo firma cache | No | **assente** (YACA lo mette nella `version`) | **Non emetterlo come stringa**: Moshi si aspetta un numero (`AddonManifestDto.kt:21`). |
| `_timestamp` | TV: `Long?`, non usato nel confronto cache | No | assente | Ignora. |
| `stremioAddonsConfig` | TV lo legge, non risulta usato | No | assente | Ignora (solo firma Stremio). |
| `config`, `addonCatalogs` | Non parsati da TV/mobile | No | assenti | Fuori perimetro. |

**Sintesi [D]/[O]:** il manifest minimo che Nuvio accetta davvero è `id`, `name`, `version`,
`catalogs` (anche vuoto) e almeno una risorsa o un catalogo per Kaptain. `description`, `logo`,
`background`, `contactEmail`, `configurationURL` non sono richiesti da Nuvio.

**Nomi localizzati [O]:** Nuvio non traduce né `name` né `catalogs[].name`: mostra la stringa del
manifest così com’è. `language` non attiva alcuna localizzazione (entra solo nella firma cache).
YACA oggi serve nomi italiani, coerenti col pubblico a cui punta; per un utente non italiano
servirebbe un manifest per lingua/config, non un campo. AIOMetadata lo fa lato server con le sue
`translations.json` prima di generare il manifest (`getManifest.ts:9,58-69,922`).

### 1.2 Campi del catalogo

| Campo | Chi lo legge | Obbligo | YACA oggi | Verdetto |
|---|---|---|---|---|
| `type` | TV/mobile; tipo grezzo preservato | **Sì** | sì | Must. |
| `id` | TV/mobile | **Sì** | sì | Must. |
| `name` | TV/mobile | **Sì** (Moshi non-null) | sì | Must. |
| `extra` | TV/mobile | No | sì | Must per search/skip. |
| `pageSize` | **Solo TV** (`AddonManifestDto.kt:31`, `CatalogDescriptorExtensions.kt:22-39`); mobile non lo legge | No (se assente, Nuvio deriva 100) | **assente** | **Must** per i cataloghi a 20 (§2). |
| `showInHome` | **Solo TV** (`AddonManifestDto.kt:32`, `AddonMapper.kt:47-48`); mobile non lo legge | No (assente = visibile) | **assente** | **Should** per la cura della home (§2.4). |
| `extraSupported` / `extraRequired` | TV (forma corta legacy); mobile **no** | No | non usati (YACA usa `extra` completa) | Ok. |
| `genres` (legacy) | non parsato | No | assente | Ignora. |

**Estensioni Nuvio, non Stremio [D/O]:** `pageSize` e `showInHome` **non compaiono** nella
specifica manifest dello Stremio Addon SDK. Sono campi letti da NuvioTV e emessi da AIOMetadata
(`https://github.com/cedya77/aiometadata/blob/dev/addon/lib/getManifest.ts:128-141`), quindi sono
un’estensione de facto dell’ecosistema Nuvio. `configVersion` e `language` sono nella stessa
categoria (tipizzati `Long`/`String` solo dal DTO Nuvio).

---

## 2. Paginazione: il mismatch 20 vs 100

### 2.1 Cosa fa YACA

| Catalogo | Pagina effettiva | Fonte |
|---|---|---|
| Preset DuckDB con id `preset_…` (inclusi i preset utente) | **20** | `YACA src/ricerca/registry.js:114-119` (`isPresetCatalog ? 20 : 100`) |
| Custom DuckDB **non** `preset_…` | **100** | stessa riga, ramo `100` |
| Ricerca standard | **20 locali + 20 Tier 2 + 5 learned**, deduplicati → fino a ~45 | `YACA src/ricerca/registry.js:89-102`; `src/ricerca/tier2Search.js:28-32` |
| Watchlist | **20** | `YACA src/library/reader.js:13` |
| Trakt | **20** (troncato dopo il fetch) | `YACA src/stremio/providers/TraktProvider.js:29-35` |
| Anime airing | **20** | `YACA src/stremio/providers/AiringStateProvider.js:22,82-88` |
| AI Discovery | **20** | `YACA src/stremio/providers/AiDiscoveryProvider.js:30,238` |
| Hero ibridi | **20** (`ITEMS_PER_PAGE`) | `YACA src/config.js:8`; `src/stremio/idratazione.js:136-143` |

Nota: `PRESET_PAGE_SIZE = 20` è dichiarato in `YACA src/stremio/CatalogRouter.js:15` ma **non
viene usato** in quel file; il limite effettivo vive in `registry.js`. Non esiste un’unica fonte
di verità per il 20: è un dettaglio da tenere presente quando si genera `pageSize`.

`skip` è sempre un **offset**, non un numero di pagina: viene passato a DuckDB (`getTitles(...,
{skip, limit})`), a `leggiWatchlist({skip})`, a Trakt e allo slice di `idratazione.js:197`. Quindi
`skip=20` significa “dammi dal ventunesimo titolo”, non “pagina 20”.

Eccezione interna: il provider Trakt converte l’offset in pagina con `Math.floor(skip / 20) + 1`
(`YACA src/clients/trakt.js:491`), quindi funziona solo se `skip` è un multiplo di 20. Una pagina
Trakt filtrata a meno di 20 elementi farebbe tornare `nextSkip` a un valore non multiplo e il
provider rileggerebbe la pagina 1. **[T]** con liste Trakt corte o molto filtrate.

### 2.2 Cosa fa Nuvio TV

- `skipStep` = `pageSize` se dichiarato e > 0; altrimenti deduce il passo dalle `options` di
  `skip`; altrimenti **100** (`TV …/domain/model/CatalogDescriptorExtensions.kt:3,22-39`).
- Prima richiesta sempre `skip=0` (`TV …/ui/screens/home/HomeViewModelCatalogPipeline.kt:431-436`;
  `…/collection/FolderDetailViewModel.kt:790-800`).
- Dopo la prima pagina, `nextSkip = skip + rawItemCount`, dove `rawItemCount` è il numero di
  `metas` realmente tornate (`TV …/data/repository/CatalogRepositoryImpl.kt:73,99-104`).
- Il “load more” usa `row.nextCatalogSkip()`, che preferisce `nextSkip` e solo in fallback usa
  `(currentPage + 1) * skipStep` (`TV …/domain/model/CatalogRow.kt:73-76`).
- `currentPage = skip / skipStep` (`CatalogRepositoryImpl.kt:100`).

**Conseguenza [O]:** sulla home, nelle folder e nella ricerca il load-more **non** chiede 100:
chiede 20, poi 40, poi 60. Il sospetto “Nuvio salta 100 titoli” non è vero in questi percorsi.

### 2.3 Dove il mismatch morde davvero

**Discover di Nuvio TV.** La lista dei cataloghi Discover include tutti i cataloghi tranne quelli
con `search` obbligatoria (`TV …/ui/screens/search/SearchViewModel.kt:905-933`). YACA ci finisce
con i suoi preset. Il fetch di Discover è **a pagina**, non a offset:

```kotlin
val currentPage = if (reset) 1 else state.discoverPage + 1
val skip = if (currentPage <= 1) 0 else (currentPage - 1) * selectedCatalog.skipStep
```

`TV …/ui/screens/search/SearchViewModel.kt:1078-1082`

Con `pageSize` assente, `skipStep = 100`: pagina 2 → `skip=100`, mentre YACA restituisce i titoli
101–120. I titoli 21–100 non vengono mai mostrati. È un salto visibile, non un errore HTTP.

`currentPage` è sbagliato anche altrove (`20/100 = 0`, `40/100 = 0`, `100/100 = 1`), ma per i
sorgenti addon è quasi solo cosmetico: il fallback `(currentPage+1)*skipStep` non viene usato
finché `nextSkip > 0`.

### 2.4 Effetto collaterale: `hasMore` e filtri post-pagina

- `hasMore = supportsSkip && rawItemCount > 0` (`CatalogRepositoryImpl.kt:99`): l’ultima pagina
  piena dice ancora “c’è altro”; serve una richiesta vuota in più per chiudere. Minore.
- YACA filtra **dopo** aver preso la pagina (tipo, kids, selettore anime):
  `YACA src/stremio/catalogHandler.js:139-188`. Se una pagina di 20 viene filtrata a 5, Nuvio
  avanza di 5 (`nextSkip = 0 + 5`), ricade sugli stessi titoli e ne aggiunge pochi nuovi. Se una
  pagina viene filtrata a 0, `hasMore` diventa `false` e la paginazione si chiude in anticipo.
  **[T]** con Kids Mode e selettore anime `only`/`exclude`.

### 2.5 Come dichiarare `pageSize`

- **Must:** `pageSize: 20` su ogni catalogo che restituisce 20 e che dichiara `skip` (preset, hero,
  watchlist, Trakt, airing). Sui custom DuckDB a 100: `pageSize: 100`.
- Non mettere `pageSize` uguale al default 100 su un catalogo che ne restituisce 20: Discover
  continuerebbe a saltare.
- L’alternativa “`options` di `skip` a `[0,20,40,…]`” funziona (Nuvio deduce il passo minimo,
  `CatalogDescriptorExtensions.kt:24-38`) ma espone una lista di opzioni finta nella UI Stremio.
  `pageSize` è più pulito.
- La ricerca YACA **non dichiara `skip`** (`YACA src/stremio/manifest.js:11,116-119`). Nuvio quindi
  non pagina la ricerca: mostra la prima pagina e basta. Va bene finché Tier 2 e “learned” non
  onorano `skip`: aggiungere `skip` alla ricerca farebbe ripetere gli stessi Tier 2 a ogni pagina.

---

## 3. Tipi: `movie`, `series`, `anime`, `other`

### 3.1 Mappatura Nuvio

| Tipo manifest | `ContentType` TV | `rawType` / `apiType` | Richiesta HTTP |
|---|---|---|---|
| `movie` | `MOVIE` | `movie` | `type=movie` |
| `series` | `SERIES` | `series` | `type=series` |
| `channel` | `CHANNEL` | `channel` | `type=channel` |
| `tv` | `TV` | `tv` | `type=tv` |
| `anime` | **`UNKNOWN`** | **`anime` preservato** | **`type=anime`** |
| `other` | **`UNKNOWN`** | **`other` preservato** | **`type=other`** |

Fonti: `TV …/domain/model/ContentType.kt:11-17`; `TV …/domain/model/Addon.kt:37,47-48`;
`TV …/data/mapper/CatalogMapper.kt:11-15`. Mobile non ha un enum: usa la stringa grezza
(`MOB composeApp/src/commonMain/kotlin/com/nuvio/app/features/addons/AddonModels.kt:35-40`).

**Cosa non si rompe [O]:** `apiType` è usato per costruire l’URL e per le chiavi stabili
(`catalogTypeKey` restituisce il grezzo quando `ContentType` è `UNKNOWN`,
`TV …/domain/model/CatalogReference.kt:3-7`). Non c’è un `when` su `ContentType.UNKNOWN` che
scarti il catalogo: la ricerca nel codice TV non trova rami di scarto.

**Cosa può rompersi [T]:** etichette/suffissi di tipo, filtri UI e qualche schermata che si aspetta
movie/series. Da provare con la watchlist anime e con un catalogo `other`.

### 3.2 Cosa dichiara YACA

- `types` di manifest: `movie`, `series`, `anime`, `other` (`YACA src/stremio/manifest.js:179`).
- Cataloghi reali: search movie/series; watchlist movie/series/**anime**; 20 hero movie/series
  (`manifest.js:115-124`; verifica runtime: 20 hero, tipi `movie`/`series`).
- **Nessun catalogo `other`.** Il tipo è supportato dal resolver (`resolveCatalogType`,
  `manifest.js:48-55`) ma non prodotto oggi.
- Il tipo della **card** non è il tipo del catalogo: `sanitizeCatalogMeta` restituisce
  `item.type`, che per DuckDB è `movie`/`series` (`YACA src/indice/duckDbProvider.js:283,414-424`).
  Quindi un catalogo `anime` può contenere card `series`; è il caso della simulcast
  (`YACA src/catalog/presets.js:235`).
- `resources` è in forma stringa, quindi Nuvio assegna a **tutte** le risorse i `types` del
  manifest (`TV …/data/mapper/AddonMapper.kt:54-64`): YACA è candidato meta anche per `anime` e
  `other` a livello di tipo. L’ID deve comunque rispettare i prefissi top-level
  (`tt`/`tmdb:`/`kitsu:`), quindi un `other` con ID arbitrario non viene chiamato; uno con ID
  `tt…` sì, e YACA risponde `meta:null`.

**Raccomandazione:** togliere `other` da `types` finché non esiste un catalogo `other` e una
strategia meta per i suoi ID. Tenere `anime` solo se serve la watchlist anime. Se in futuro si
dichiara `meta` come resource object, limitare i suoi `types` a quelli realmente serviti.

---

## 4. ID: IMDb, TMDB, Kitsu

### 4.1 Cosa emette YACA

| Contenuto | ID card | Dove nasce | Note |
|---|---|---|---|
| Film con IMDb noto | **`tt…`** | `YACA src/stremio/meta.js:500-513` | `allineaIdFilm` riscrive l’id alla fine della pipeline (`catalogHandler.js:295`). |
| Film senza IMDb | `tmdb:<id>` | `YACA src/indice/duckDbProvider.js:283` | `idPrefixes` copre `tmdb:`. |
| Serie (normale) | **`tmdb:<id>`** | `duckDbProvider.js:283,414-424` | `allineaIdFilm` salta tutto ciò che non è `movie` (`meta.js:503`). |
| Serie da watchlist | id salvato dalla libreria (`tt…`, `tmdb:` o `kitsu:`) | `YACA src/stremio/providers/WatchlistProvider.js:151` | Dipende dall’item salvato. |
| Anime simulcast / airing | **`kitsu:<id>`** | `YACA src/stremio/providers/AiringStateProvider.js:68-75` | Episodi `kitsu:<id>:<ep>` (`YACA src/stremio/meta.js:181`). |
| Anime fuori dal catalogo airing | `tmdb:<id>` | `duckDbProvider.js:283` | La marcatura `_isAnime` non cambia l’id. |

`idPrefixes` dichiarati: `["tt","tmdb:","kitsu:"]` (`manifest.js:181`). Il formatter conosce anche
`anilist:`, `mal:`, `anidb:` (`YACA src/stremio/formatters/StremioFormatter.js:128`), ma non sono
dichiarati: se un giorno venissero emessi, Nuvio non li userebbe per il meta di YACA. **[O]**

### 4.2 Cosa fanno gli addon esterni (prova live, 20/10/2026)

| Addon | `resources[].types` | `idPrefixes` | Conseguenza per YACA |
|---|---|---|---|
| Torrentio (`https://torrentio.strem.fun/manifest.json`) | `movie`, `series`, `anime` | `tt`, `kitsu` | Risolve `tt…` e `kitsu:…`; **non** risolve `tmdb:…`. |
| Cinemeta (`https://v3-cinemeta.strem.io/manifest.json`) | movie, series | `tt` | Meta solo per `tt…`; **non** per `tmdb:` o `kitsu:`. |
| AIOMetadata (`getManifest.ts`) | movie, series, anime, `anime.movie`, `anime.series`, … | `tmdb:`, `tt`, `tvdb:`, `mal:`, `tvmaze:`, `kitsu:`, `anidb:`, `anilist:`, … | Copre anche `tmdb:` e `kitsu:` se installato. |

Fonte del filtro Nuvio: `TV …/core/streams/PlaybackAvailability.kt:8-20` e
`TV …/data/repository/StreamRepositoryImpl.kt:197-199`. Nuvio non ha una lista hardcoded di
addon: chiede a ogni addon che dichiara `stream`, il tipo giusto e un prefisso compatibile. Un
addon `tt`-only non riceve mai una card `tmdb:` o `kitsu:`.

### 4.3 Il ponte IMDb di Nuvio

Quando si apre il dettaglio di un id `tmdb:`, Nuvio prova a convertirlo in IMDb prima del meta:

`TV …/ui/screens/detail/MetaDetailsViewModel.kt:895-911`

Se la conversione riesce, `_effectiveContentId` diventa `tt…` e gli stream vengono chiesti con
l’id IMDb (`MetaDetailsViewModel.kt:771,918-926`). Questo mitiga il caso “serie YACA con card
`tmdb:`”, ma solo dopo l’apertura del dettaglio e solo se il servizio TMDB di Nuvio risponde. Un
play diretto dalla card, o un’apertura senza dettaglio, può restare `tmdb:` e non trovare stream
`tt`-only. **[T]**

### 4.4 Strategia raccomandata

1. **Film:** mantenere IMDb-first. È già così.
2. **Serie:** estendere la riscrittura IMDb anche alle serie, allo stesso boundary di
   `allineaIdFilm` (dopo cache, prima della risposta). Il dump TV ha `imdb_id`
   (`YACA src/indice/duckDbStore.js:765-767`), quindi il dato c’è. Questo massimizza Cinemeta,
   Torrentio e i meta addon `tt`-only, senza toccare gli id interni `tmdb:` usati da badge/poster.
3. **Anime:** `kitsu:` è la lingua franca degli addon anime (Torrentio lo dichiara). Per la
   simulcast è già così. Per gli altri cataloghi anime, valutare il mapping Kitsu anche sui film
   (`resolveKitsuMovie`, `YACA src/stremio/meta.js:162-169`) e sulle serie; se non c’è mapping,
   restare `tmdb:` e accettare che serva un meta addon che lo supporti.
4. **Non dichiarare prefissi che non emetti** e, viceversa, aggiungere `kitsu:`/`tt` solo se le
   card li usano davvero.

---

## 5. Extras: cosa Nuvio legge, cosa manda, cosa ignora

YACA dichiara tre forme (`YACA src/stremio/manifest.js:9-11`):

- preset/custom con sort: `sortBy` (opzionale, `options` italiane) + `skip`;
- hero, watchlist, airing: solo `skip`;
- search: `search` **required**, senza `skip`.

| Extra | Nuvio lo legge? | Nuvio lo invia? | Dove | Verdetto per YACA |
|---|---|---|---|---|
| `skip` | Sì, `supportsExtra("skip")` | Sì, come offset | Home/folder/search load-more; Discover | **Must.** È il paginatore reale. |
| `search` | Sì, `isSearchOnlyCatalog()` | Sì, solo nella schermata Search | `TV …/ui/screens/search/SearchViewModel.kt:1172-1191` | **Must.** Required = catalogo search-only, nascosto dalla home. |
| `genre` | Sì, come `options` | Solo da collection source o Discover | `TV …/collection/FolderDetailViewModel.kt:1224-1227`; `SearchViewModel.kt:1083` | YACA **non lo dichiara**; se lo aggiungi, va implementato davvero. Oggi `genre` viene aliasato a `sortBy` (`YACA src/api/stremio.js:220-223`) e un valore tipo “Action” finisce su `popularity.desc`. |
| `sortBy` | Sì, parsato | **Mai** (nessun percorso Nuvio lo mette in `extraArgs`) | grep TV/mobile: solo `search`, `genre`, `skip` | In Nuvio è **dead weight**. Resta utile per Stremio. |
| `default` | Sì, parsato in `CatalogExtra` | No | `TV …/data/mapper/AddonMapper.kt:110-120` | Non guidare la UI con questo. |
| `optionsLimit` | Sì, parsato | No | stessa | Solo firma cache. |

**Ricerca [O]:** le 4 entry search di YACA (2 id × movie/series) sono tutte `search` required,
quindi `isSearchOnlyCatalog()` true: non entrano nella home TV, non entrano nelle definizioni home
mobile (`MOB …/features/home/HomeCatalogDefinitions.kt:50-51`) e vengono interrogate solo dalla
schermata Search. Non hanno `skip`: una sola pagina. Se vuoi la paginazione della ricerca, prima
bisogna far onorare `skip` anche a Tier 2 e ai nomi “learned”, altrimenti ogni pagina ripete gli
stessi 25 titoli.

**Collection:** una source addon in una collection può passare solo `genre`
(`TV …/domain/model/Collection.kt:17-22`; `FolderDetailViewModel.kt:1224-1227`). `sortBy` non è
rappresentabile nello schema collection di Nuvio. Quindi, dentro Nuvio, YACA serve sempre l’ordine
di default, qualunque cosa dichiari nel manifest.

---

## 6. Meta e catalog-only

### 6.1 Chi vince quando YACA dichiara `meta`

Nuvio TV ha due percorsi:

1. **Dettaglio di un item che viene da un catalogo YACA.** Il default è “preferisci l’addon che ha
   fornito il catalogo”: `getMeta(addonBaseUrl = preferredAddonBaseUrl, …)`
   (`TV …/ui/screens/detail/MetaDetailsViewModel.kt:809-819`). Quindi **YACA vince anche se
   AIOMetadata o Cinemeta sono installati prima**. Se la chiamata fallisce, si passa a
   `getMetaFromAllAddons` (`MetaDetailsViewModel.kt:820-826`).
2. **Item da library, continue-watching, un altro catalogo, o utente con “prefer external meta”.**
   Si usa `getMetaFromAllAddons`, che ordina i candidati per tipo + prefisso e poi per ordine di
   installazione (`TV …/data/repository/MetaRepositoryImpl.kt:281-315`). Qui l’ordine conta: se
   YACA è sopra AIOMetadata ed entrambi supportano `kitsu:`/`tmdb:`, vince YACA.
   C’è però una scorciatoia: se `getMetaFromAllAddons` riceve `sourceAddonBaseUrl` e il candidato è
   proprio l’addon sorgente, Nuvio non chiama nessun meta e considera sufficiente la card del
   catalogo (`MetaRepositoryImpl.kt:402-413`). È il caso dell’enrichment delle card home: il meta
   YACA serve al dettaglio, non a quella fase.

Il setting “prefer external” è default `false` (`TV …/ui/screens/settings/LayoutSettingsViewModel.kt:82`)
e inverte il punto 1: prima i meta addon, poi l’addon sorgente
(`MetaDetailsViewModel.kt:773-807`).

**Quindi [O]:** non è vero che “AIOMetadata/Cinemeta sopra” scavalcano sempre YACA. Per le righe
YACA, il default è YACA. Il conflitto si vede su library/continue-watching e quando l’utente
attiva il setting. L’ordine è una leva concreta: Kaptain (`nuvio-push.js`, `pushAddons`) e l’API
Nuvio salvano `sort_order` dalla posizione nella lista; Nuvio usa quell’ordine per i candidati
meta/stream.

### 6.2 Cosa serve davvero al meta YACA

- Anime/Kitsu: è quello che applica i mapping Kitsu → TMDB di YACA, costruisce gli episodi
  `kitsu:…` e imposta `defaultVideoId` (`YACA src/stremio/meta.js:156-198,308-330`). AIOMetadata
  può fare lo stesso se installato, ma non conosce i mapping/ITA di YACA.
- ITA: badge/poster localizzati e `_itaBadge` viaggiano nel meta YACA, non in Cinemeta.
- ID `tmdb:` non coperti da Cinemeta: YACA li risolve; senza YACA serve AIOMetadata.
- Film/serie con `tt…`: Cinemeta basta; il meta YACA è un extra, non un requisito.

### 6.3 Catalog-only: specifica minima

Un manifest catalog-only per Nuvio può essere:

```json
{
  "id": "org.stremio.yaca.catalog",
  "version": "1.0.4+<configVersion>",
  "name": "YACA 🇮🇹 (Yet Another Catalog Addon)",
  "description": "Catalogo Intelligente Potenziato da AI",
  "logo": "https://host/fiamma_yaca.png",
  "resources": ["catalog"],
  "types": ["movie", "series", "anime"],
  "catalogs": [
    {
      "type": "movie",
      "id": "yaca_preset_…",
      "name": "…",
      "pageSize": 20,
      "showInHome": false,
      "extra": [{ "name": "skip" }]
    }
  ],
  "idPrefixes": ["tt", "tmdb:", "kitsu:"],
  "behaviorHints": { "configurable": true, "configurationRequired": false }
}
```

Regole:

- **Niente `meta` in `resources`** e, se si vuole davvero non servirlo, **niente route
  `/meta/...`**. Su Nuvio TV il percorso “addon sorgente” chiama `getMeta` anche se la risorsa
  `meta` non è dichiarata: `getMeta` verifica solo il tipo, non i prefissi
  (`MetaRepositoryImpl.kt:178-203`). Quindi togliere `meta` dal manifest non basta a spegnere la
  route: toglie YACA dal pool globale, non dal fetch diretto.
- **ID compatibili con i meta addon esterni.** Catalog-only regge per film/serie con `tt…`
  (Cinemeta) e, se la conversione TMDB→IMDb di Nuvio riesce, anche per le serie `tmdb:`; per
  `kitsu:` serve AIOMetadata. Per gli anime Kitsu senza AIOMetadata, catalog-only = dettaglio
  senza episodi. **[T]**
- **`types` solo quelli con cataloghi.** `other` fuori.
- **`showInHome`/`pageSize`** come sopra.
- **`configurationRequired:false`** e URL di configurazione restano per Stremio; Nuvio li ignora.

AIOMetadata è il riferimento migliore: ha un `config.catalogModeOnly` che rimuove `meta` dalle
risorse (`aiometadata getManifest.ts:1731-1736`) e dichiara una lista di `types`/`idPrefixes`
molto più larga della YACA attuale (`:1771-1772`).

---

## 7. Versioning e cache

| Aspetto | Nuvio TV | Nuvio mobile |
|---|---|---|
| Cache manifest | SharedPreferences `addon_manifest_cache` / `manifests_v2`; refresh automatico non più spesso di **6 ore** (`MANIFEST_CACHE_TTL_MS`), ma la cache non ha una scadenza propria (`TV …/data/repository/AddonRepositoryImpl.kt:82-87,195-212`) | Nessuna cache manifest: rifetch a ogni `initialize` e `refreshAll` (`MOB …/features/addons/AddonRepository.kt:85-91,276-283`) |
| Quando rilegge | cache miss, primo avvio dopo TTL, refresh manuale (`fetchAddon`) | avvio app, refresh manuale |
| Cosa considera “cambiato” | `id`, `name`, `version`, `description`, `logo`, `background`, `baseUrl`, `catalogs`, `types`, `rawTypes`, `resources`, `idPrefixes`, `behaviorHints`, `stremioAddonsConfig`, `manifestLanguage`, `configVersion` (`AddonRepositoryImpl.kt:506-522`) | confronto implicito: rimpiazza sempre il manifest |
| `version` | stringa opaca, nessun parsing semver | idem |
| `configVersion` | `Long?`; solo firma cache | non parsato |
| `_timestamp` | parsato, non confrontato | non parsato |

**YACA oggi [O]:** `version = 1.0.4` oppure `1.0.4+<configVersion>` con `_` → `-`
(`YACA src/stremio/manifest.js:78-79`). `configVersion` è un nanoid(8) e cambia quando cambia il
fingerprint del manifest (profili, preset, custom catalog;
`YACA src/stremio/reconciler.js:33-52`). Va bene: Nuvio non interpreta la semver, la confronta.

**Trappole:**

1. **Non emettere `configVersion` come stringa nel manifest.** Il DTO è `Long?`
   (`AddonManifestDto.kt:21`); una stringa nanoid è un type mismatch Moshi, non una coercizione.
   YACA fa bene a tenerla nell’URL e nella `version`. **[O/T]**
2. **`version` non è l’unico trigger.** Nuvio TV confronta anche `catalogs`, `types`, `resources`:
   aggiungere/togliere una riga aggiorna la cache anche a parità di `version`. Ma solo al prossimo
   fetch: fino a 6 ore.
3. **Config change ≠ refresh immediato.** Se l’utente cambia profilo/preset, il manifest nuovo ha
   una `version` diversa, ma TV può servire quello vecchio finché non scatta il prossimo refresh
   (minimo 6 ore, o refresh manuale).
   Le righe possono apparire vuote perché `catalogHandler` risponde `{metas: []}` ai cataloghi non
   conformi (`YACA src/stremio/catalogHandler.js:84-89`). Da mettere nel test plan.
4. **URL versionato vs non versionato.** YACA espone sia `/<handle>/manifest.json` sia
   `/<handle>/<configVersion>/manifest.json` (`YACA src/api/stremio.js:181-195`). Per Nuvio conviene
   distribuire l’URL **non versionato**: la configurazione corrente resta raggiungibile anche dopo
   un bump; la `version` nel manifest fa comunque da segnale di cambiamento.
5. **`configurationURL` non serve a Nuvio.** Non è nel DTO TV né nel parser mobile: l’unico modo
   per installare la configurazione giusta è dare all’utente l’URL completo `/<handle>/manifest.json`.
   La root manifest (`/manifest.json`, `resources: []`, `catalogs: []`) è volutamente vuota
   (`YACA src/stremio/manifest.js:57-75`): se installata, produce un addon senza righe e Kaptain la
   rifiuta (`https://kaptain.stream/addon-core.js`, `validateManifest`). **[O]**

---

## 8. Raccomandazioni per un manifest Nuvio-ready

### Must

1. **`pageSize` per catalogo**, uguale alla pagina reale: 20 su preset/hero/watchlist/Trakt/airing,
   100 sui custom DuckDB non-preset. Risolve Discover TV e rende corretto `currentPage`.
2. **Non aggiungere `skip` alla ricerca** finché Tier 2 e “learned” non rispettano l’offset.
3. **Tenere `search` required** sulle cataloghi di ricerca: è ciò che li nasconde dalla home e li
   rende search-only.
4. **IMDb-first anche per le serie**, non solo per i film: è il singolo intervento che massimizza
   Cinemeta, Torrentio e i meta addon `tt`-only.
5. **Non emettere `configVersion` come stringa.** Restare su `version` + URL.
6. **Install URL = `/<handle>/manifest.json`**, mai la root.

### Should

1. **`showInHome:false` sui 20 hero** (o su tutti tranne 2–4 righe flagship). Oggi Nuvio TV
   auto-aggiunge 23 righe; l’utente può disattivarle, ma il default è “tutte accese”
   (`TV …/core/sync/HomeCatalogSyncSupport.kt:74-120,136-176`). Su mobile il campo è ignorato:
   le 23 righe restano eleggibili (`MOB …/features/home/HomeCatalogDefinitions.kt:50-71`;
   default `enabled = true` in `HomeCatalogSettingsRepository.kt:357,375,388`). **[O]**
2. **Restringere la risorsa `meta`** a un oggetto:
   `{ "name": "meta", "types": ["movie","series","anime"], "idPrefixes": ["tmdb:","kitsu:"] }`
   (o solo `kitsu:`), per non competere sui `tt` con Cinemeta e per non essere chiamato su `other`.
   Attenzione: il percorso “addon sorgente” di TV ignora comunque i prefissi; lo scoping serve al
   pool globale, non al dettaglio delle righe YACA.
3. **Togliere `other` da `types`** finché non esiste un catalogo `other`.
4. **Allineare `idPrefixes`** a ciò che si emette davvero; aggiungere `anilist:`/`mal:` solo se
   prima si emettono quegli ID.
5. **Rimuovere `sortBy` dal manifest Nuvio-facing** o accettare che sia inerte; non usare `genre`
   come alias di `sortBy`.
6. **Dichiarare `language: "it-IT"`** (innocuo; Nuvio lo usa solo nella firma cache) e valutare
   `background` (ignorato da Nuvio, utile ad altri client).
7. **Per l’anime:** valutare `kitsu:` anche per film/serie anime, non solo per la simulcast; in
   alternativa, tenere `meta` per i `kitsu:` e documentare che serve AIOMetadata per il resto.

### Nice

1. `behaviorHints.newEpisodeNotifications` (parsato, non usato da Nuvio).
2. `logo`/`background` curati.
3. `contactEmail` (ignorato da Nuvio, standard Stremio).
4. `stremioAddonsConfig` solo se si firma davvero l’addon.
5. Un esperimento `?catalogOnly=1` sull’URL del manifest: Nuvio preserva la query nel `baseUrl`
   (`AddonRepositoryImpl.kt:298-303`; `CatalogRepositoryImpl.kt:152`), quindi la variante
   catalog-only potrebbe essere servita senza un path separato. **[T]**

---

## 9. Test plan

### Nuvio TV (Android TV)

| # | Test | Come | Atteso |
|---|---|---|---|
| 1 | Installazione | URL `http://host/<handle>/manifest.json`, config vuota | Addon installato, 27 cataloghi nel manifest, 23 righe home eleggibili (20 hero + 3 watchlist). Con preset selezionati il numero di hero può essere minore. |
| 2 | Home load-more | Apri un preset, scroll fino in fondo; logcat `CatalogRepository` | `skip=20`, poi `40`, poi `60`; nessun buco. |
| 3 | **Discover** | Tab Discover → seleziona un preset YACA → scroll; logcat | Oggi: seconda fetch `skip=100` → salto 21–100. Dopo `pageSize:20`: `skip=20`. |
| 4 | Ricerca | Search → query; logcat | 4 righe search; nessun load-more (`hasMore=false`); nessuna riga search in home. |
| 5 | Meta default | Apri un film/serie/anime da una riga YACA; logcat `MetaRepository` | `getMeta` verso YACA; per `tt`/`tmdb`/`kitsu` risponde YACA. |
| 6 | Prefer external | Attiva “Prefer external meta addons for details”; riapri | La richiesta va ad AIOMetadata/Cinemeta, non a YACA. |
| 7 | ID serie | Apri una serie con card `tmdb:`; guarda `contentId` e stream | `contentId` diventa `tt…` dopo il dettaglio; stream `tt`-only risolvono. |
| 8 | Anime Kitsu | Apri una card `kitsu:`; stream | Torrentio (types series/anime, prefixes tt/kitsu) risolve. Un addon che dichiara solo `anime` non riceve una card con tipo `series`; uno che dichiara `series` + `kitsu` sì. |
| 9 | `showInHome:false` | Variante manifest; reinstalla/refresh | Riga non auto-aggiunta in home, ma ancora selezionabile in Layout Settings (`LayoutSettingsViewModel.kt:1000-1010`). |
| 10 | Versioning | Cambia profilo/preset; attendi refresh o refresh manuale | `version` cambia; cataloghi aggiornati; nessuna riga vuota permanente. |
| 11 | Root manifest | Installa `/manifest.json` | Addon senza righe; Kaptain lo rifiuta. Documentare “non usare”. |

### Nuvio mobile (`cmp-rewrite`)

| # | Test | Come | Atteso |
|---|---|---|---|
| 1 | Parser | Installa lo stesso URL | `pageSize` e `showInHome` **ignorati**; nessun crash (`ignoreUnknownKeys`, `AddonManifestParser.kt:17-19`). |
| 2 | Home | Apri home | 23 righe eleggibili; `showInHome:false` **non** le nasconde. |
| 3 | Load-more | Scroll su un preset | Offset: `skip=20`, `40`, …; nessun salto 100. `CATALOG_PAGE_SIZE=100` è solo fallback per target senza `skip` (`CatalogData.kt:14,113-143`). |
| 4 | Discover | Tab Discover → preset → scroll | Offset, nessun salto. |
| 5 | Meta | Apri dettaglio da riga YACA | Verificare se mobile usa l’addon sorgente o il pool globale; testare con e senza AIOMetadata. |
| 6 | Refresh | Riavvia app; cambia config; riavvia | Manifest rifetchato a ogni avvio; `version` nuova. |
| 7 | Anime | Card `kitsu:` | Meta/episodi disponibili solo se YACA meta o AIOMetadata è reachable. |

### WebOS/Tizen

Non verificati in questa ricerca. `NuvioTVSmart` è un repository separato: la matrice TV qui
descritta **non** va assunta valida per webOS/Tizen senza test. **[T]**

---
## Fonti primarie

### YACA

- `src/stremio/manifest.js` — costruzione manifest, extra, tipi, prefissi, version.
- `src/stremio/CatalogRouter.js:15,22,52-59` — `PRESET_PAGE_SIZE`, `skip`, dispatch.
- `src/ricerca/registry.js:89-102,114-119,241,269` — pagine reali e fonte watchlist/airing.
- `src/stremio/catalogHandler.js:52,84-89,139-188,217-225,295` — skip, filtri, formatter, allineamento ID.
- `src/stremio/formatters/StremioFormatter.js:492-511,569-595` — forma della card.
- `src/stremio/meta.js:156-198,308-330,396-405,500-513` — Kitsu, risposta meta, IMDb.
- `src/api/stremio.js:173-195,200-244,247-295` — manifest root/handle, route catalog/meta, parsing extra.
- `src/indice/duckDbProvider.js:283,414-424,435` — id `tmdb:` e `_imdbId`.
- `src/library/reader.js:13`; `src/stremio/providers/TraktProvider.js:29-35`;
  `src/stremio/providers/AiringStateProvider.js:22,68-75`; `src/stremio/providers/AiDiscoveryProvider.js:30,238`;
  `src/stremio/idratazione.js:136-143,197`; `src/config.js:8` — pagine reali.
- `src/stremio/reconciler.js:33-52` — configVersion nanoid(8).

### NuvioTV (`NuvioMedia/NuvioTV@f062601`)

- `app/src/main/java/com/nuvio/tv/data/remote/dto/AddonManifestDto.kt:7-48` — schema manifest.
- `app/src/main/java/com/nuvio/tv/data/mapper/AddonMapper.kt:15-125` — mapping e resource objects.
- `app/src/main/java/com/nuvio/tv/domain/model/Addon.kt:35-69` — `CatalogDescriptor`, `CatalogExtra`, `apiType`.
- `app/src/main/java/com/nuvio/tv/domain/model/ContentType.kt:3-18` — anime/other → UNKNOWN.
- `app/src/main/java/com/nuvio/tv/domain/model/CatalogDescriptorExtensions.kt:3,15-39` — skipStep.
- `app/src/main/java/com/nuvio/tv/domain/model/CatalogRow.kt:73-114` — nextSkip/merge.
- `app/src/main/java/com/nuvio/tv/data/repository/CatalogRepositoryImpl.kt:73-104,119-153` — URL, hasMore, nextSkip.
- `app/src/main/java/com/nuvio/tv/ui/screens/home/HomeViewModelCatalogUtils.kt:362-365` — showInHome.
- `app/src/main/java/com/nuvio/tv/core/sync/HomeCatalogSyncSupport.kt:74-120,136-176` — righe home automatiche.
- `app/src/main/java/com/nuvio/tv/ui/screens/home/HomeViewModelCatalogPipeline.kt:422-436,540-550` — fetch/load-more.
- `app/src/main/java/com/nuvio/tv/ui/screens/collection/FolderDetailViewModel.kt:751,786-800,878-890,1224-1227` — collection source, skip, genre.
- `app/src/main/java/com/nuvio/tv/ui/screens/search/SearchViewModel.kt:731-741,905-933,1078-1082,1172-1191` — search, Discover, target.
- `app/src/main/java/com/nuvio/tv/data/repository/MetaRepositoryImpl.kt:139-235,281-315,641-664` — meta diretto e pool.
- `app/src/main/java/com/nuvio/tv/ui/screens/detail/MetaDetailsViewModel.kt:114,773-826,895-926` — precedenza meta e conversione IMDb.
- `app/src/main/java/com/nuvio/tv/data/repository/AddonRepositoryImpl.kt:82-87,298-319,506-522` — cache manifest e change detection.
- `app/src/main/java/com/nuvio/tv/core/streams/PlaybackAvailability.kt:8-20`; `data/repository/StreamRepositoryImpl.kt:197-199` — filtro stream.
- `app/src/main/java/com/nuvio/tv/ui/screens/settings/LayoutSettingsViewModel.kt:82,1000-1010` — preferExternal e cataloghi disponibili.

### NuvioMobile (`NuvioMedia/NuvioMobile@324afcf`, branch `cmp-rewrite`)

- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/addons/AddonManifestParser.kt:17-19,29-41,67-85` — parser senza `pageSize`/`showInHome`.
- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/addons/AddonModels.kt:35-47` — modello catalogo.
- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/catalog/CatalogData.kt:14,100-143` — `CATALOG_PAGE_SIZE=100`, nextSkip, supportsPagination.
- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/catalog/CatalogRepository.kt:127,166-174` — offset.
- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/home/HomeCatalogDefinitions.kt:50-71` — home eleggibile.
- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/home/HomeCatalogSettingsRepository.kt:357,375,388` — default `enabled=true`.
- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/addons/AddonRepository.kt:85-91,276-283` — refresh manifest.

### Specifiche e doc

- Stremio Addon SDK, manifest: `https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md` — `resources`, `types`, `idPrefixes`, `catalogs`, `extra`; **nessun** `pageSize`/`showInHome`.
- Stremio content types: `https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/content.types.md` — movie, series, channel, tv.
- Nuvio Public API v1.3: `https://nuvio.tv/docs/nuvio-public-api.md` — sezione Addons: l’API salva URL/name/enabled/sort_order, non il contenuto del manifest; full replace.
- AIOMetadata `getManifest.ts`: `https://github.com/cedya77/aiometadata/blob/dev/addon/lib/getManifest.ts:128-141,1731-1772` — `pageSize: 20`, `showInHome`, `catalogModeOnly`, types/prefixes larghi.
- Torrentio manifest: `https://torrentio.strem.fun/manifest.json` — stream `movie/series/anime`, prefixes `tt`/`kitsu`.
- Cinemeta manifest: `https://v3-cinemeta.strem.io/manifest.json` — prefixes `tt`.
- Kaptain: `https://kaptain.stream/addon-core.js` (funzione `validateManifest`: id, name, version e almeno una risorsa/catalogo); `https://kaptain.stream/nuvio-push.js` (push addon con `sort_order`, sezione `pushAddons`).

**Nota sulle fonti mancanti:** al 20/10/2026 le pagine “wiki” richiamate dal ticket non risultano
pubbliche (`nuvio.tv/wiki` → 404; il repository wiki GitHub di NuvioTV non esiste). La matrice è
quindi costruita su codice, specifica Stremio, Public API e manifest live; le affermazioni che
dipendono solo dalla wiki non sono state usate.

---

## Cosa significa per YACA

- **Non c’è un’emergenza “addon rotto”.** YACA si installa, le righe si vedono, il load-more della
  home funziona. Il problema vero è più stretto e più fastidioso: **Discover TV salta 80 titoli
  ogni pagina**.
- **Il fix più economico è una riga per catalogo: `pageSize: 20`.** Non richiede di toccare il
  motore, non cambia Stremio, e allinea YACA al modo in cui AIOMetadata dichiara i suoi cataloghi.
- **La home è il rischio di prodotto, non di compatibilità.** Con config vuota, 23 righe abilitate
  di default sono troppe per un’app che deve restare leggera; `showInHome:false` aiuta su TV, ma
  **non su mobile**.
  La cura della home mobile passa da un cambiamento lato Nuvio o da un manifest più piccolo, non
  da un campo che oggi viene ignorato.
- **Le serie sono il buco di compatibilità più concreto.** I film sono già IMDb; le serie restano
  `tmdb:` e i due addon presi come prova (Cinemeta, Torrentio) non li vedono. Nuvio mitiga
  convertendo l’id nel dettaglio, ma è un ponte, non una garanzia.
- **Kitsu è già la scelta giusta per l’anime.** Torrentio dichiara `kitsu`; YACA lo usa sulla
  simulcast. Il punto aperto è estenderlo o mantenere il meta YACA per coprire gli anime non
  airing.
- **Il catalog-only è una scelta di prodotto, non un interruttore gratuito.** Per film/serie con
  IMDb è pulito; per anime Kitsu dipende da AIOMetadata; per l’ITA perde il meta YACA (badge e
  poster localizzati nella scheda, episodi Kitsu). Va deciso insieme al ticket 05 (identità) e al
  09 (mapping collection).
- **`sortBy` non serve a Nuvio.** Se l’obiettivo è Nuvio, il manifest può smettere di promettere
  un ordinamento che nessuna superficie Nuvio sa inviare. Resta utile per Stremio.
- **La `version` dinamica è già corretta.** L’unica trappola è `configVersion` nel manifest:
  tenerlo fuori o tipizzarlo `Long`, mai stringa.

---

## Domande aperte

1. **Quante righe hero deve vedere un utente Nuvio al primo install?** 23 è il default tecnico, non
   una decisione di prodotto. Se la risposta è “poche”, `showInHome:false` non basta su mobile:
   serve una strategia (manifest ridotto, collection, o modifica lato Nuvio).
2. **Nuvio mobile onorerà `pageSize`/`showInHome`?** Oggi il parser non li legge. Se non li
   onorerà, YACA non può curare la home mobile via manifest.
3. **Le serie vanno riscritte a IMDb nel catalogo?** Tecnicamente sì, ma va verificato che nessun
   percorso Stremio/Nuvio si aspetti `tmdb:` sulla card (poster, badge, progressi).
4. **Kitsu-first vale solo per la simulcast o per tutto l’anime?** Dipende da quanto sono completi
   i mapping Kitsu di YACA e da quali stream addon si vogliono servire.
5. **Catalog-only: quale meta addon si assume installato?** Cinemeta copre solo `tt`; AIOMetadata
   copre `tmdb:`/`kitsu:` ma è un’installazione separata. Senza una risposta, catalog-only non è
   una specifica chiusa.
6. **Il meta YACA va ristretto a `kitsu:`/`tmdb:`?** Restringerlo riduce il conflitto con
   Cinemeta, ma il percorso “addon sorgente” di TV lo chiama comunque per i `tt`: lo scoping va
   testato, non solo dichiarato.
7. **Identità: un solo manifest id per tutti i profili.** Nuvio usa `Addon.id` per le collection
   (`FolderDetailViewModel.kt:751`). Due profili YACA installati insieme possono collidere sulla
   stessa source. È il tema del ticket 05, ma va tenuto presente qui.
8. **WebOS/Tizen si comportano come TV Android?** Non verificato.
9. **`showInHome` ha un significato anche per Stremio o solo per Nuvio?** La specifica Stremio non
   lo documenta; AIOMetadata lo emette. Se YACA torna su Stremio, il campo è probabilmente ignorato.
10. **La ricerca YACA deve paginare?** Oggi non dichiara `skip` e Nuvio mostra solo la prima
    pagina. Abilitarla richiede prima una paginazione coerente di Tier 2 e “learned”.

