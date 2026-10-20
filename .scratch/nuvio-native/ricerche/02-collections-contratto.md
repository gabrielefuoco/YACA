# 02 — Collections: schema, source native/addon, full-replace

**Data**: 20/10/2026 · **Ticket**: `.scratch/nuvio-native/issues/02-collections-contratto.md`
**Natura**: ricerca. Nessuna modifica a `src/`, `frontend/`, `services/` o al prodotto.

## Legenda delle prove

| Tag | Significato |
|---|---|
| `[DOC]` | Documentazione Nuvio public API v1.3 (last updated 20/08/2026), letta il 20/10/2026. |
| `[CODICE]` | Codice NuvioTV (`NuvioMedia/NuvioTV`, branch `dev`) o NuvioMobile (`cmp-rewrite`) letto il 20/10/2026. |
| `[PRATICA]` | JSON pubblico di Kaptain (pack “native” e pack legacy), non un test runtime. |
| `[DA TESTARE]` | Deduzione plausibile ma non provata su device/account reale. |

Questa nota non esegue test runtime su un account Nuvio: `[CODICE]` e `[PRATICA]` sono prove
statiche (codice e JSON pubblici); tutto ciò che dipende dal server o dal device è marcato
`[DA TESTARE]`.

**Tesi in breve.** La docs v1.3 descrive ancora il formato **legacy** (`catalogSources`), mentre il
contratto realmente usato dal client TV è `sources`, una lista eterogenea con discriminatore
`provider` (`addon` / `tmdb` / `trakt`). `catalogSources` resta come fallback di compatibilità.
Le folder miste sono supportate dal parser e dalla UI, ma Kaptain non le usa. `sync_push_collections`
è un **full replace** dell'intero blob: il merge non distruttivo è interamente a carico del client.

---

## 1. Cosa dice la documentazione v1.3

Fonte: `https://nuvio.tv/docs/nuvio-public-api.md`, sezione **Collections** (righe 1499–1617
dell'artefatto scaricato) e sezione **Sync strategies** (righe 1785–1796).

La docs documenta:

| Livello | Campi documentati |
|---|---|
| Collection | `id`, `title`, `backdropImageUrl`, `pinToTop`, `viewMode`, `showAllTab`, `folders` |
| Folder | `id`, `title`, `coverImageUrl`, `coverEmoji`, `tileShape`, `hideTitle`, `catalogSources` |
| Catalog reference | `addonId`, `type`, `catalogId` |

`viewMode` è dichiarato con i valori `TABBED_GRID`, `ROWS`, `FOLLOW_LAYOUT`; `tileShape` con
`POSTER`, `LANDSCAPE`, `SQUARE`. La docs **non** menziona:

- il campo `sources`;
- il discriminatore `provider`;
- le source native TMDB/Trakt e i campi `tmdbSourceType`, `tmdbId`, `mediaType`, `sortBy`,
  `sortHow`, `filters`;
- `focusGifUrl`, `focusGifEnabled`, `heroBackdropUrl`, `heroVideoUrl`, `titleLogoUrl`;
- `focusGlowEnabled` a livello collection;
- `genre` nella catalog reference.

**Conseguenza:** seguire la docs alla lettera produce collection valide ma **solo legacy/addon**.
Per usare le source native bisogna seguire il contratto osservato nel client, che è più ampio e
non versionato.

La docs è però netta su un punto: `sync_push_collections` **fully replaces** il blob del
profilo; un array vuoto lo cancella; gli elementi omessi spariscono (righe 1590–1597 e 1791–1796).

### 1.1 Documentato vs osservato (sintesi)

| Aspetto | Docs v1.3 | Codice/JSON | Stato |
|---|---|---|---|
| Forma della source | solo `catalogSources` | `sources` union + `catalogSources` legacy | **Docs in ritardo** |
| Campi folder | 6 | 12 (focus GIF, hero, logo, sources…) | **Docs in ritardo** |
| Source native TMDB/Trakt | assenti | presente nel client e in Kaptain | **Non documentato** |
| Folder miste | non previste | supportate dal modello/UI | **Non documentato** |
| `viewMode` | 3 valori | 3 valori, case-insensitive | Allineato |
| `tileShape` | 3 valori | 3 valori + quirk `"wide"` | Parzialmente allineato |
| `focusGif`/hero/logo | assenti | presenti e persistiti | **Non documentato** |
| Full replace | dichiarato | confermato dal client | Allineato |
| Regole sugli ID | “unique” | nessun enforcement; TV dedupe, mobile rifiuta | **Sotto-specificato** |
| Default `showAllTab` | non dichiarato | TV `false` se manca, mobile `true` | **Divergenza** |
| Versione schema | assente | assente | **Rischio** |

---

## 2. Schema ricostruito

Fonti codice: `app/src/main/java/com/nuvio/tv/domain/model/Collection.kt` (righe 6–156),
`app/src/main/java/com/nuvio/tv/data/local/CollectionsDataStore.kt` (righe 200–440).

### 2.1 `Collection`

| Campo | Tipo Kotlin | Default | JSON | Note |
|---|---|---|---|---|
| `id` | `String` | — | `"id"` | Opaco. Nessun ID assegnato dal server. |
| `title` | `String` | — | `"title"` | Obbligatorio per l'import UI. |
| `backdropImageUrl` | `String?` | `null` | omesso se `null` | Backdrop della collection. |
| `pinToTop` | `Boolean` | `false` | sempre emesso | Pin in cima alla home. |
| `focusGlowEnabled` | `Boolean` | `true` | sempre emesso | Non documentato; assente nel modello mobile. |
| `viewMode` | `FolderViewMode` | `TABBED_GRID` | `"TABBED_GRID"` / `"ROWS"` / `"FOLLOW_LAYOUT"` | Parser case-insensitive. |
| `showAllTab` | `Boolean` | `true` nel modello; **`false` nel parser TV se la chiave manca** | sempre emesso | L'"All" tab esiste solo con ≥2 source. Vedi nota Gson in §4.1. |
| `folders` | `List<CollectionFolder>` | `emptyList()` | `[]` | Ordine = ordine di visualizzazione. |

### 2.2 `CollectionFolder`

| Campo | Tipo Kotlin | Default | JSON | Note |
|---|---|---|---|---|
| `id` | `String` | — | `"id"` | Opaco; unico nella collection (idealmente globale). |
| `title` | `String` | — | `"title"` | Etichetta della folder/tab. |
| `coverImageUrl` | `String?` | `null` | omesso se `null` | Immagine della card. |
| `focusGifUrl` | `String?` | `null` | omesso se `null` | GIF in overlay solo al focus. |
| `focusGifEnabled` | `Boolean` | `true` | sempre emesso | `null` in input → `true`. |
| `coverEmoji` | `String?` | `null` | omesso se `null` | Fallback icona quando manca la cover. |
| `tileShape` | `PosterShape` | `SQUARE` nel modello; `POSTER` per una folder nuova nell'editor; **`POSTER` nel parser TV se la chiave manca** | `"POSTER"` / `"LANDSCAPE"` / `"SQUARE"` | Default non coerenti tra modello, editor e parser: vedi §8.3. |
| `hideTitle` | `Boolean` | `false` | sempre emesso | Nasconde il titolo sotto la card. |
| `sources` | `List<CollectionSource>` | `emptyList()` | `"sources"` | Campo canonico nuovo. |
| `heroBackdropUrl` | `String?` | `null` | omesso se `null` | Editor + persistenza; consumo rendering da verificare. |
| `heroVideoUrl` | `String?` | `null` | omesso se `null` | Idem. |
| `titleLogoUrl` | `String?` | `null` | omesso se `null` | Idem. |
| `catalogSources` | **getter derivato**, non campo del costruttore | — | sempre emesso nell'export TV | Contiene solo le source `addon`; è il formato legacy. |

### 2.3 La source union

`CollectionSource` è una `sealed interface` con tre implementazioni:

| Implementazione | `provider` nel JSON | Campi specifici |
|---|---|---|
| `AddonCatalogCollectionSource` | `"addon"` (default) | `addonId`, `type`, `catalogId`, `genre?` |
| `TmdbCollectionSource` | `"tmdb"` | `tmdbSourceType`, `title`, `tmdbId?`, `mediaType`, `sortBy`, `filters` |
| `TraktCollectionSource` | `"trakt"` | `title`, `traktListId`, `mediaType`, `sortBy`, `sortHow` |

Il JSON non ha un tipo discriminator separato: il campo `provider` fa da tag. Il parser TV
normalizza `provider.lowercase()` e tratta **qualsiasi valore diverso da `tmdb`/`trakt`** come
addon (`CollectionsDataStore.kt:393–440`).

### 2.4 `AddonCatalogCollectionSource`

| Campo | Tipo | Default | JSON | Note |
|---|---|---|---|---|
| `provider` | `String` | `"addon"` | `"addon"` | Sempre emesso nell'export TV. |
| `addonId` | `String` | — | `"addonId"` | **Manifest `id`, non URL** (vedi §5). |
| `type` | `String` | — | `"type"` | Tipo grezzo del manifest (`movie`, `series`, `tv`, …). |
| `catalogId` | `String` | — | `"catalogId"` | `catalogs[].id` del manifest. |
| `genre` | `String?` | `null` | omesso se `null` | Passato come extra `genre`; aggiunge `· <genre>` al label. |

### 2.5 `TmdbCollectionSource`

| Campo | Tipo | Default | JSON | Note |
|---|---|---|---|---|
| `provider` | `String` | — | `"tmdb"` | Discriminatore. |
| `tmdbSourceType` | `TmdbCollectionSourceType` | — | `"LIST"`, `"COLLECTION"`, `"COMPANY"`, `"NETWORK"`, `"DISCOVER"`, `"PERSON"`, `"DIRECTOR"` | Obbligatorio: senza valore valido la source viene scartata. |
| `title` | `String` | — | `"title"` | Label della tab. Se vuoto, fallback `List`, `Collection`, `Discover`, ecc. |
| `tmdbId` | `Int?` | `null` | omesso se `null` | Richiesto per LIST, COLLECTION, COMPANY, NETWORK, PERSON, DIRECTOR; opzionale per DISCOVER. |
| `mediaType` | `TmdbCollectionMediaType` | `MOVIE` | `"MOVIE"` / `"TV"` | JSON in maiuscolo; il parser accetta anche minuscolo. |
| `sortBy` | `String` | `"popularity.desc"` | valore TMDB | Per LIST/COLLECTION il default viene riscritto a `"original"` in fase di parse. |
| `filters` | `TmdbCollectionFilters` | oggetto vuoto | `"filters": {...}` | Sempre emesso per le source TMDB. |

`TmdbCollectionFilters` (18 campi, tutti opzionali; `Collection.kt:98–116`):

| Gruppo | Campi | Tipo |
|---|---|---|
| Generi | `withGenres`, `withoutGenres` | `String?` |
| Date | `releaseDateGte`, `releaseDateLte`, `year` | `String?`, `String?`, `Int?` |
| Rating | `voteAverageGte`, `voteAverageLte`, `voteCountGte` | `Double?`, `Double?`, `Int?` |
| Lingua/paese | `withOriginalLanguage`, `withOriginCountry` | `String?` |
| Keyword | `withKeywords`, `withoutKeywords` | `String?` |
| Company/network | `withCompanies`, `withoutCompanies`, `withNetworks` | `String?` |
| Watch provider | `watchRegion`, `withWatchProviders`, `withoutWatchProviders` | `String?` |

Note di comportamento (`TmdbCollectionSourceResolver.kt`):

- `COMPANY` e `NETWORK` sovrascrivono `withCompanies`/`withNetworks` con `tmdbId` (righe 244–280).
- `NETWORK` forza `mediaType = TV`, filtra `first_air_date_lte = oggi` e `withStatus = "0|3|4"`
  (righe 231–235, 281–282).
- Se `withWatchProviders` o `withoutWatchProviders` sono valorizzati e `watchRegion` è vuoto,
  il resolver usa `"US"` (righe 259–263, 293–297).
- `withWatchProviders` aggiunge anche `withWatchMonetizationTypes =
  "flatrate|free|ads|rent|buy"` (righe 263, 297).
- `releaseDateGte/Lte` sono passati come date movie; per la TV diventano `first_air_date_*`.
- `sortBy` canonici: `original`, `popularity.desc`, `vote_average.desc`, `vote_count.desc`,
  `primary_release_date.desc`, `first_air_date.desc`. `movieSort`/`tvSort` convertono tra
  `first_air_date.desc` e `primary_release_date.desc`; altri valori passano al volo a TMDB
  (righe 499–514). Un valore arbitrario non viene validato.

### 2.6 `TraktCollectionSource`

| Campo | Tipo | Default | JSON | Note |
|---|---|---|---|---|
| `provider` | `String` | — | `"trakt"` | Discriminatore. |
| `title` | `String` | — | `"title"` | Label tab; se vuoto, fallback localizzato “Trakt list <id>”. |
| `traktListId` | `Long` | — | `"traktListId"` | Deve essere `> 0`; altrimenti la source viene scartata. |
| `mediaType` | `TmdbCollectionMediaType` | `MOVIE` | `"MOVIE"` / `"TV"` | |
| `sortBy` | `String` | `"rank"` | `rank`, `added`, `title`, `released`, `runtime`, `popularity`, `percentage`, `votes` | Normalizzato; valore ignoto → `rank`. |
| `sortHow` | `String` | `"asc"` | `"asc"` / `"desc"` | Normalizzato; valore ignoto → `asc`. |

### 2.7 `CollectionCatalogSource` (legacy)

| Campo | Tipo | Default | JSON | Note |
|---|---|---|---|---|
| `addonId` | `String` | — | `"addonId"` | Manifest id. |
| `type` | `String` | — | `"type"` | |
| `catalogId` | `String` | — | `"catalogId"` | |
| `genre` | `String?` | `null` | omesso se `null` | La docs non lo menziona. |

Non è una source autonoma: è la forma che il parser trasforma in
`AddonCatalogCollectionSource` **solo quando `sources` manca o è `null`**.

---

## 3. Serializzazione JSON: le regole che contano

`CollectionsDataStore` usa `Gson` senza `serializeNulls` (`CollectionsDataStore.kt:50`). Quindi:

- i campi `null` sono **omessi**;
- i `Boolean` non-null sono sempre emessi;
- gli enum `TmdbCollectionMediaType` e `TmdbCollectionSourceType` sono emessi con il **nome**
  (`"MOVIE"`, `"TV"`, `"DISCOVER"`), non con il valore lowercase;
- `viewMode` e `tileShape` sono emessi con `enum.name` (`"FOLLOW_LAYOUT"`, `"LANDSCAPE"`);
- `sortBy` e `sortHow` sono stringhe già normalizzate (`"popularity.desc"`, `"rank"`, `"asc"`);
- `filters` è **sempre presente** per TMDB, anche vuoto (`"filters":{}`), perché
  `toSerializableSource()` lo converte sempre in un oggetto non-null;
- l'export TV scrive **sia `sources` sia `catalogSources`**. `catalogSources` è derivato e contiene
  solo le source addon (`CollectionFolder.catalogSources`, `Collection.kt:134–146`).

Esempio di forma dell'export TV per una folder mista:

```json
{
  "id": "folder-1",
  "title": "Mista",
  "tileShape": "POSTER",
  "sources": [
    { "provider": "tmdb", "tmdbSourceType": "DISCOVER", "title": "Italia", "mediaType": "MOVIE", "sortBy": "popularity.desc", "filters": {} },
    { "provider": "addon", "addonId": "aio-metadata", "type": "movie", "catalogId": "streaming.nfx" }
  ],
  "catalogSources": [
    { "addonId": "aio-metadata", "type": "movie", "catalogId": "streaming.nfx" }
  ]
}
```

Nota: nell'esempio sopra `catalogSources` contiene **solo** la parte addon. Un client legacy che
legge solo quel campo vede una folder più povera, non la folder completa.

---

## 4. Parser: `sources` vs `catalogSources`

Il punto esatto è `SerializableCollection.toDomain()` in `CollectionsDataStore.kt:359–390`:

```kotlin
sources = folder.sources?.mapNotNull { it.toDomainSource() }
    ?: folder.catalogSources.map { source -> AddonCatalogCollectionSource(...) }
```

Decision tree effettivo:

1. **`sources` è presente e non-null** (anche lista vuota) → il parser legge **solo** `sources`;
   `catalogSources` viene ignorato.
2. **`sources` è assente o `null`** → il parser converte `catalogSources` in source addon;
   se manca anche `catalogSources`, il `.map` su `null` lancia e l'intero blob viene letto come
   lista vuota (vedi §4.2).
3. **Entrambi presenti** → vince `sources`; `catalogSources` è rumore, ma resta nel JSON finché
   qualcuno non riscrive il blob.
4. **`sources: []` + `catalogSources` popolato** → su TV la folder è **vuota**; su mobile
   `resolvedSources` usa `sources.ifEmpty { catalogSources... }`, quindi mobile mostra le source
   legacy (`CollectionModels.kt:213–221`). È una divergenza TV/mobile reale.

Kaptain ha un sanitizer che conosce esattamente questa trappola: se `catalogSources` è pieno e
`sources` è una lista vuota, **cancella la chiave `sources`** prima del push, perché il TV aprirebbe
una folder bianca (`nuvio-push.js:361–379`).

La validazione dell'import UI (`validateCollectionsJson`, `CollectionsDataStore.kt:126–182`) usa la
stessa precedenza: `folder["sources"] ?: folder["catalogSources"] ?: errore`. Quindi anche la
validazione può dire “ok” a una folder che il TV mostrerà vuota (se `sources` è `[]`).

### 4.1 Cosa è obbligatorio, cosa ha default

| Elemento | Validazione import | Parser sync | Default se manca |
|---|---|---|---|
| `Collection.id` | sì (stringa non blank) | no | — (Gson può produrre `null`) |
| `Collection.title` | sì | no | — |
| `Collection.folders` | sì (array) | no | TV: eccezione → lista vuota; mobile: `[]` |
| `Folder.id` / `Folder.title` | sì | no | — |
| `sources` o `catalogSources` | almeno uno (array) | no | TV: se **entrambi** mancano, `null.map` → eccezione → **blob vuoto**; mobile: `[]` |
| `provider` | no (assente = addon) | no | `"addon"` |
| `showAllTab` | no | no | TV: **`false`**; mobile: `true` (vedi nota Gson) |
| `tileShape` | opzionale; se presente deve essere in `{POSTER, LANDSCAPE, SQUARE, poster, wide, square}` | opzionale | TV: **`POSTER`**; editor: `POSTER`; mobile: `poster` |
| `addonId` / `type` / `catalogId` | sì per provider addon | sì, altrimenti source scartata | — |
| `tmdbSourceType` | sì per provider tmdb | sì, altrimenti source scartata | — |
| `tmdbId` | no | no | `null` |
| `traktListId` | sì (numero) | sì, deve essere `> 0` | — |
| `mediaType` | no | no | `MOVIE` |
| `sortBy` | no | no | TMDB `popularity.desc`; Trakt `rank` |
| `sortHow` | no | no | `asc` |
| `filters` | no | no | oggetto vuoto |
| `genre` | no | no | `null` |

**Nota Gson (importante).** `CollectionsDataStore` usa Gson puro, senza adattatore Kotlin. Per le
classi `SerializableCollection` e `SerializableFolder`, che hanno `id`/`title` **senza** default,
Gson non trova un costruttore no-arg e istanzia via `Unsafe`: gli inizializzatori di campo Kotlin
**non vengono eseguiti**. Quindi i default dichiarati nel `data class` non sono i default del
parser. In particolare:

- `showAllTab` assente → `false` su TV (non `true`), mentre mobile usa il default Kotlin `true`;
- `tileShape` assente → `null` → `PosterShape.fromString(null)` → `POSTER` (non `SQUARE`);
- `folders` assente → `null` → il `map` lancia e l'intero blob viene letto come lista vuota;
- `focusGlowEnabled` e `focusGifEnabled` assenti → `null` → `true` (questi campi sono nullable).

`SerializableSource` e `SerializableTmdbFilters`, avendo **tutti** i parametri con default, hanno un
costruttore no-arg: per loro i default Kotlin valgono. La lezione operativa è semplice: **YACA
scriva sempre `showAllTab`, `tileShape`, `viewMode` e `focusGifEnabled` esplicitamente**.

La validazione **non** controlla: unicità di `id`, esistenza dell'addon, validità degli URL,
coerenza di `mediaType`/`sortBy`, presenza di `provider` sconosciuto. Un `provider: "foo"` passa la
validazione (non è addon, non è tmdb, non è trakt) e poi il parser lo tratta come addon: se i campi
addon mancano, la source viene silenziosamente scartata.

### 4.2 Duplicati e errori

- `parseCollections` deduplica le **collection** per `id` con `associateBy { it.id }`
  (`CollectionsDataStore.kt:184–193`): vince l'ultima occorrenza, la posizione è quella della prima.
- Le **folder** non vengono deduplicate: due folder con lo stesso `id` possono produrre chiavi
  duplicate nella UI TV. Mobile, invece, rifiuta l'import con `DuplicateFolderId`
  (`CollectionSourceSerializationTest.kt:162–182`) e con `DuplicateCollectionId` (righe 149–159).
- Un JSON malformato non fa crashare il parser: `catch (_: Exception) { emptyList() }`
  (`CollectionsDataStore.kt:184–193`). La TV mostra semplicemente zero collection. In pull, se il
  remoto è vuoto e il locale no, il sync TV preserva il locale (`CollectionSyncService.kt:107–112`).
- Una folder **senza** `sources` e **senza** `catalogSources` non produce una folder vuota: produce
  un'eccezione in `toDomain()` e quindi azzera l'intero blob letto. La validazione import la
  rifiuta, ma il path di sync non passa dalla validazione. YACA deve sempre emettere almeno
  `"sources": []`.
- La validazione import rifiuta array vuoto, id/title mancanti, folder non-oggetto, `sources` non
  array, `tileShape` fuori set (`CollectionsDataStore.kt:126–182`).

---

## 5. Source miste nella stessa folder

**Sì, sono supportate dal client TV.** La prova è nel modello e nel rendering:

- `CollectionFolder.sources` è `List<CollectionSource>`, quindi può contenere tmdb, trakt e addon
  insieme (`Collection.kt:120–132`).
- `FolderDetailViewModel.loadSourceForTab()` fa un `when` esaustivo sui tre tipi e crea una tab per
  ogni source (`FolderDetailViewModel.kt:740–746`).
- Se `folder.sources.size >= 2` e `showAllTab` è true, viene aggiunta una tab “All” che unisce le
  righe con `roundRobinMerge` e deduplica per `item.id` (`FolderDetailViewModel.kt:226–271,
  333–347, 725–738`).
- Il getter `catalogSources` filtra solo le source addon, segno che la lista può essere mista
  (`Collection.kt:134–146`).
- Anche il modello mobile è piatto con `provider` e `catalogRouteKey()` gestisce i tre rami
  (`CollectionModels.kt:36–108`).

**Limite pratico:** Kaptain non esercita le folder miste. Nel pack pubblico “native” letto il
20/10/2026 (gist `c3dd37db5ee2721149687b9fd71c93eb`) ci sono 11 collection, 362 folder e 1.755
source: 822 `tmdb`, 933 `trakt`, **zero** source addon e **zero** folder con provider diversi.
Quindi il supporto misto è provato dal codice, non da un caso d'uso pubblico diffuso.
`[CODICE]` supportato; `[DA TESTARE]` end-to-end su TV e mobile con una folder mista reale.

---

## 6. Risoluzione di `addonId`: manifest id, non URL

`AddonMapper.toDomain()` mappa `id = id` dal manifest e `baseUrl` dall'URL installato
(`AddonMapper.kt:15–35`); `Addon` tiene separati `id` e `baseUrl` (`Addon.kt:6–25`). Quindi:

- `addonId` nel collection JSON è il **manifest `id`** (es. `aio-metadata`,
  `com.linvo.cinemeta`), non l'URL e non il nome visualizzato.
- La risoluzione in `FolderDetailViewModel` è `addons.find { it.id == source.addonId }`
  (`FolderDetailViewModel.kt:748–765`). Se non esiste, la tab mostra “addon not found”.
- Se l'addon esiste ma non contiene quel `catalogId`, il TV **cerca in tutti gli addon abilitati**
  il primo che ha una catalog con quel `id`/tipo e usa il `baseUrl` di quello
  (`FolderDetailViewModel.kt:767–800`). È un fallback silenzioso: un `addonId` sbagliato può
  funzionare per caso, oppure pescare l'addon sbagliato.
- `findCollectionCatalog` fa match prima per `catalogId` + tipo esatto, poi per tipo normalizzato
  (`ContentType`: `movie`→MOVIE, `series`→SERIES, `tv`→TV); se ci sono più catalog con lo stesso
  id e tipi diversi, `singleOrNull` evita l'ambiguità (`CatalogReference.kt:3–19`).
- Al salvataggio dall'editor, `withResolvedCatalogTypes()` riscrive `source.type` con l'`apiType`
  del manifest installato (`CollectionEditorViewModel.kt:1134–1143`, `CatalogReference.kt:21–31`).
  Un JSON importato non viene riscritto finché non lo si modifica e salva.
- `genre` diventa un extra `genre` passato alla catalog (`FolderDetailViewModel.kt:1224–1227`);
  non c'è validazione che la catalog dichiari quell'extra.

**Rischio concreto:** due installazioni dello stesso manifest id (stesso `id`, `baseUrl` diversi,
es. due configurazioni AIO Metadata) sono indistinguibili per `addonId`. La prima vince.
`[CODICE]`; `[DA TESTARE]` quante installazioni reali condividono il manifest id.

---

## 7. Native TMDB/Trakt: valori e semantica

`TmdbCollectionSourceResolver.resolve()` (`TmdbCollectionSourceResolver.kt:47–67`) instrada:

| `tmdbSourceType` | Cosa fa | Paginazione |
|---|---|---|
| `LIST` | `getListDetails(tmdbId)`; ordina lato client con `sortBy` | sì (`page`, `totalPages`) |
| `COLLECTION` | `getCollectionDetails(tmdbId)`; una pagina | no |
| `COMPANY` | `discover` con `withCompanies = tmdbId` | sì |
| `NETWORK` | `discover` TV con `withNetworks = tmdbId`, `first_air_date_lte = oggi`, `withStatus = "0|3|4"` | sì |
| `DISCOVER` | `discover` con i `filters` | sì |
| `PERSON` | `getPersonCombinedCredits(tmdbId)`, ramo `cast` | no |
| `DIRECTOR` | `getPersonCombinedCredits(tmdbId)`, ramo `crew` filtrato `job == "Director"` | no |

Dettagli:

- `mediaType` muove `discoverMovies` vs `discoverTv`; `NETWORK` ignora il valore e forza TV.
- `sortBy` è applicato lato client per LIST/COLLECTION/PERSON/DIRECTOR (`sortedFor`,
  righe 331–350); per DISCOVER/COMPANY/NETWORK è passato a TMDB.
- `sortBy` default `popularity.desc` viene riscritto a `original` per LIST/COLLECTION in fase di
  parse (`CollectionsDataStore.kt:397–408`). Quindi non puoi chiedere “popularity” a una lista
  TMDB: il parser te lo trasforma in ordine originale.
- `title` è solo la label della tab; se manca, il parser genera un fallback dal tipo.
- `TmdbCollectionMediaType` ha `value = "movie"`/`"tv"`, ma il JSON usa il **nome** `"MOVIE"`/`"TV"`.
- Il resolver TV usa `BuildConfig.TMDB_API_KEY` (righe 71, 163, 179): sul TV l'utente non inserisce
  una chiave. Kaptain avverte invece che su mobile senza TMDB API key poster/metadata non caricano
  (`[PRATICA]`, compat warning del sito). `[DA TESTARE]` sul mobile reale.

Trakt: `TraktPublicListSourceResolver` risolve la lista pubblica per `traktListId`; `sortBy` e
`sortHow` sono normalizzati (`Collection.kt:67–96`). Non c'è un filtro `filters` per Trakt: la
lista è quella pubblica. `[CODICE]`; `[DA TESTARE]` limiti/rate limit della lista pubblica.

---

## 8. Artwork, `viewMode`, `tileShape`

### 8.1 Campi artwork

| Campo | Dove si vede | Default | Fonte |
|---|---|---|---|
| `collection.backdropImageUrl` | Backdrop della collection | `null` | `Collection.kt:151`; docs |
| `folder.coverImageUrl` | Card della folder | `null` | `Collection.kt:123`; `CollectionRowSection.kt:256–266` |
| `folder.focusGifUrl` | Overlay animato **solo al focus** | `null` | `CollectionRowSection.kt:338–347`; `CollectionFolderCardMedia.kt:9–12` |
| `folder.focusGifEnabled` | Abilita il GIF; se false resta la cover | `true` | `Collection.kt:125`; `CollectionsDataStore.kt:365–367` |
| `folder.coverEmoji` | Icona di fallback se manca la cover | `null` | `CollectionRowSection.kt:314–320` |
| `folder.hideTitle` | Nasconde il titolo sotto la card | `false` | `CollectionRowSection.kt:358` |
| `folder.tileShape` | Forma della card (`POSTER` 0.675, `LANDSCAPE` 1.78, `SQUARE` 1.0) | `SQUARE` (TV model) | `PosterShape.kt:3–20`; `CollectionRowSection.kt:256` |
| `folder.heroBackdropUrl` | Campo editor; persistito | `null` | `CollectionEditorFolderContent.kt:425–456`; `Collection.kt:130` |
| `folder.heroVideoUrl` | Campo editor; persistito | `null` | `CollectionEditorFolderContent.kt:460–467`; test di round-trip `CollectionsDataStoreSourceMigrationTest.kt:174–201` |
| `folder.titleLogoUrl` | Campo editor; persistito | `null` | `CollectionEditorFolderContent.kt:470–494`; `Collection.kt:132` |
| `collection.focusGlowEnabled` | Glow al focus | `true` | `Collection.kt:153`; non documentato |

**Onestà sulle hero fields:** `heroBackdropUrl`, `heroVideoUrl` e `titleLogoUrl` sono nel modello,
nell'editor e nella serializzazione, ma nei file di rendering che ho letto (`FolderDetailScreen.kt`,
`CollectionRowSection.kt`, `CollectionFolderCardMedia.kt`) non compaiono. Kaptain li valorizza in
352/362 folder (`[PRATICA]`), quindi qualcuno li consuma o li prepara per un'altra superficie.
Il consumo effettivo è `[DA TESTARE]`: non assumere che il TV li mostri ovunque.

### 8.2 `viewMode`

| Valore | Semantica TV | Prova |
|---|---|---|
| `TABBED_GRID` | Una tab per source; “All” tab se `showAllTab` e ≥2 source | `FolderDetailViewModel.kt:226–271, 333–347` |
| `ROWS` | Una row per source | `FolderViewMode.kt:3–14`; rendering folder |
| `FOLLOW_LAYOUT` | Segue il layout della home (Modern/Classic), con shimmer/hero | `FolderDetailViewModel.kt:274–278, 1272` |

`FolderViewMode.fromString` TV accetta `"rows"`, `"follow_layout"`, altrimenti `TABBED_GRID`
(`FolderViewMode.kt:8–13`). Mobile confronta i nomi enum con `ignoreCase`, quindi
`"FOLLOW_LAYOUT"` funziona su entrambi.

### 8.3 `tileShape`: la trappola dei default

| Client | Default se il campo manca | `"wide"` | Fonte |
|---|---|---|---|
| NuvioTV (parser, chiave assente) | `null` → `POSTER` | `POSTER` (perché `fromString` non conosce `wide`) | `CollectionsDataStore.kt:219, 359–390`; `PosterShape.kt:9–13` |
| NuvioTV (modello, costruzione diretta) | `SQUARE` | — | `Collection.kt:127` |
| Editor TV (folder nuova) | `POSTER` | — | `CollectionEditorViewModel.kt:225–231` |
| NuvioMobile | `"poster"` → `POSTER` | `LANDSCAPE` | `CollectionModels.kt:197, 205–211` |
| Validazione import TV | accetta `POSTER`, `LANDSCAPE`, `SQUARE`, `poster`, `wide`, `square` | accettato | `CollectionsDataStore.kt:135` |

Quindi: **scrivi sempre `tileShape` esplicitamente** e non usare mai `"wide"`. Se manca, TV e mobile
finiscono entrambi su `POSTER` (per ragioni diverse: Gson/`null` sul TV, default Kotlin sul mobile),
ma il modello TV dichiara `SQUARE` e l'editor `POSTER`: il default non è un contratto affidabile.
Con `"wide"`, la stessa folder è `POSTER` su TV e `LANDSCAPE` su mobile. È una divergenza
cross-device, non un dettaglio estetico.

---

## 9. Update semantics: full replace, ID, merge

### 9.1 Cosa fa il server

`[DOC]` `sync_push_collections` è **full replace** del blob `collections_json` del profilo:
- il payload è lo stato completo;
- gli elementi omessi vengono eliminati;
- `[]` cancella tutto;
- non esiste un merge server-side per collection/folder.

`[CODICE]` Il client TV fa esattamente questo: `CollectionSyncService.pushToRemote()` esporta
l'intero JSON locale e lo manda (righe 53–80). `pullFromRemote()` importa il remoto e chiama
`setCollections(remoteCollections)` in blocco (righe 86–134). Non c'è un merge per ID a livello di
sync: l'unica protezione è “se il remoto è vuoto e il locale no, preservo il locale”
(righe 107–112). `p_origin_client_id` viene aggiunto dal TV (righe 64–68), ma la docs non lo
documenta per collections: `[DA TESTARE]` se il server lo accetta/ignora.

Kaptain lo dice esplicitamente: `pushCollections` è “Full REPLACE” (`nuvio-push.js:538–554`), e
prima fa `pullCollections` per poter mergiare (`nuvio-push.js:516–536`).

### 9.2 Cosa fa l'import TV (diverso dal push)

`CollectionManagementViewModel.confirmImport()` non sostituisce tutto: per ogni collection
importata, se esiste già un `id` uguale la sostituisce, altrimenti la appende
(`CollectionManagementViewModel.kt:232–264`). Quindi:

- **import nel app** = merge a livello di collection, per `id`;
- **push al server** = replace completo del blob.

Attenzione: l'import sostituisce l'**intera collection** con quell'id, non fa merge delle folder
interne. Se una collection YACA ha una folder aggiunta dall'utente e importi una versione che non
la contiene, la folder sparisce. Il merge “fine” è quello di Kaptain, non l'import TV.

### 9.3 Cosa fa Kaptain

`collection-merge.js` (versione `105.1`) è il riferimento pratico di merge non distruttivo:

| Regola | Comportamento | Riga |
|---|---|---|
| Folder/category utente non nel master | mantenute così come sono, nella stessa posizione | 8–14 |
| Folder master già presente | aggiornata **in place**: artwork e source master, preservando le row aggiunte dall'utente | 115–153 |
| Nuove folder/category master | inserite dopo il predecessore master, per mantenere l'ordine | 14–15, 222–230 |
| Addon “clutter” | righe di Cinemeta/Nuvio Catalog rimosse | 16–17, 48–79 |
| Folder “For You” | protetta, mai toccata | 18, 44–46, 166–170 |
| Match collection | per `id`, altrimenti per titolo normalizzato | 57–63, 255–266 |
| Match folder | per `id`, altrimenti per titolo (con protezioni) | 192–208 |
| Match source | `id || catalogId || title || name` | 53–55 |

Limiti osservati di quel merge, utili per YACA:

- `ART_FIELDS` aggiorna solo `coverImageUrl`, `focusGifUrl`, `titleLogoUrl`, `heroBackdropUrl`
  (righe 34, 116–119): non aggiorna `coverEmoji`, `hideTitle`, `tileShape`, `heroVideoUrl`,
  `focusGifEnabled` su una folder esistente.
- `Object.assign({}, masterCat, userCat)` fa vincere i campi della collection utente su quelli del
  master (riga 186): un cambio di `viewMode`/`showAllTab` nel master non si applica a una
  collection già presente.
- `sourceKey` usa `catalogId` prima di `title`: due addon diversi con lo stesso `catalogId` nella
  stessa folder collidono; due source TMDB con lo stesso titolo collidono.
- Le source master rimosse dal rilascio non vengono cancellate dalla folder (non c'è un tombstone
  per source); restano finché non si interviene manualmente.

### 9.4 ID stabili, duplicati, folder utente, altre collection

| Scenario | Effetto del full replace | Come evitarlo |
|---|---|---|
| Stesso `collection.id` | La collection viene aggiornata; l'ordine dipende dall'array | ID stabile e deterministico |
| Nuovo `collection.id` | Nuova collection; la vecchia resta se non omessa | Non rigenerare ID a ogni release |
| `collection.id` duplicato | Il server lo accetta; TV tiene l'ultimo, mobile rifiuta l'import | Unicità garantita a monte |
| `folder.id` duplicato | TV non deduplica; mobile rifiuta l'import | Unicità dentro la collection |
| Folder aggiunta dall'utente | Cancellata se la collection viene riscritta senza di essa | Pull + merge, o ownership esplicita |
| Collection di un altro tool/addon | Cancellata se non è nel payload | Pull + merge, mai push parziale |
| Addon rimosso | La folder resta; la tab addon va in errore | Degradazione controllata, non cancellare la folder |

**Non esiste un campo “owner”** nella collection: il blob è per profilo, non per addon. Qualsiasi
tool che pusha un array parziale cancella tutto il resto. L'unica identità è `id`.

### 9.5 Strategia di merge raccomandata per YACA

1. **Pull** del blob corrente con `sync_pull_collections` (gestire sia row-set sia array; Kaptain
   fa unwrap difensivo, `nuvio-push.js:516–536`).
2. **Leggere il JSON grezzo**, non passare dal modello TV: il TV riscrive solo i campi noti e
   perde i campi sconosciuti al primo edit (`CollectionsDataStore.kt:275–320`). Mobile, al
   contrario, li preserva con `CollectionJsonPreserver` (`CollectionJsonPreserver.kt:13–95`).
3. **Tenere tutto ciò che non è YACA**: collection/folder con ID non `yaca-*` restano oggetti
   JSON intatti, nella loro posizione.
4. **Aggiornare le collection YACA per `id`**: se esistono, sovrascrivere solo i campi gestiti;
   se non esistono, inserirle nell'ordine desiderato. Le folder utente dentro una collection YACA
   si preservano per `id` non `yaca-*`.
5. **Rimuovere solo ciò che YACA possiede**, tramite un registro/tombstone di ID `yaca-*` non più
   desiderati. Non usare “omesso = cancellato” per tutto il blob.
6. **Normalizzare**: `sources` canonico, `catalogSources` specchio solo per legacy, `tileShape`
   esplicito, `viewMode` esplicito, ID unici, `title` valorizzato per TMDB/Trakt.
7. **Push dell'array completo** e ri-pull di verifica. Non usare l'import TV per gli update:
   sostituisce l'intera collection per `id`.

---

## 10. Esempio JSON ibrido

Una folder native (TMDB DISCOVER) + una folder addon (AIO Metadata). Il parser TV lo accetta:
`provider` valido, `sources` presente, `tileShape` esplicito, ID unici.

```json
[
  {
    "id": "yaca:collection:cinema-italiano",
    "title": "YACA · Cinema italiano",
    "backdropImageUrl": "https://cdn.yaca.example/collections/cinema-italiano/backdrop.jpg",
    "pinToTop": true,
    "focusGlowEnabled": true,
    "viewMode": "FOLLOW_LAYOUT",
    "showAllTab": true,
    "folders": [
      {
        "id": "yaca:folder:cinema-italiano:italia-2026",
        "title": "Italia 2026",
        "coverImageUrl": "https://cdn.yaca.example/folders/italia-2026.jpg",
        "focusGifUrl": "https://cdn.yaca.example/folders/italia-2026-focus.gif",
        "focusGifEnabled": true,
        "coverEmoji": "🇮🇹",
        "tileShape": "LANDSCAPE",
        "hideTitle": true,
        "sources": [
          {
            "provider": "tmdb",
            "title": "Italia 2026",
            "tmdbSourceType": "DISCOVER",
            "mediaType": "MOVIE",
            "sortBy": "popularity.desc",
            "filters": {
              "withOriginCountry": "IT",
              "withOriginalLanguage": "it",
              "releaseDateGte": "2026-01-01",
              "voteCountGte": 20
            }
          }
        ],
        "catalogSources": [],
        "heroBackdropUrl": "https://cdn.yaca.example/folders/italia-2026-hero.jpg",
        "titleLogoUrl": "https://cdn.yaca.example/folders/italia-2026-logo.png"
      },
      {
        "id": "yaca:folder:cinema-italiano:streaming",
        "title": "Streaming in Italia",
        "coverImageUrl": "https://cdn.yaca.example/folders/streaming.jpg",
        "coverEmoji": "📺",
        "tileShape": "POSTER",
        "hideTitle": false,
        "sources": [
          {
            "provider": "addon",
            "addonId": "aio-metadata",
            "type": "movie",
            "catalogId": "streaming.nfx"
          },
          {
            "provider": "addon",
            "addonId": "aio-metadata",
            "type": "series",
            "catalogId": "streaming.nfx"
          }
        ],
        "catalogSources": [
          {
            "addonId": "aio-metadata",
            "type": "movie",
            "catalogId": "streaming.nfx"
          },
          {
            "addonId": "aio-metadata",
            "type": "series",
            "catalogId": "streaming.nfx"
          }
        ]
      }
    ]
  }
]
```

### 10.1 Lettura riga per riga con il parser TV

| JSON | Parser | Risultato |
|---|---|---|
| array top-level | `parseCollections` → `List<SerializableCollection>` | 1 collection |
| `id` / `title` | campi diretti | ok |
| `viewMode: "FOLLOW_LAYOUT"` | `FolderViewMode.fromString` → lowercase `follow_layout` | `FOLLOW_LAYOUT` |
| `focusGlowEnabled: true` | campo diretto; `null` → `true` | true |
| `folders[0].sources` presente (1 tmdb) | `sources != null` → legge solo `sources` | 1 source TMDB |
| `folders[0].catalogSources: []` | ignorato perché `sources` presente | nessun effetto |
| `provider: "tmdb"` | ramo `"tmdb"` | `TmdbCollectionSource` |
| `tmdbSourceType: "DISCOVER"` | `valueOf("DISCOVER")` | DISCOVER |
| `mediaType: "MOVIE"` | `valueOf("MOVIE")` | MOVIE |
| `sortBy: "popularity.desc"` | DISCOVER non viene riscritto a `original` | popularity.desc |
| `filters` | `toDomain()` dei 18 campi | filtri attivi |
| `folders[0].tileShape: "LANDSCAPE"` | `PosterShape.fromString` | LANDSCAPE |
| `folders[1].sources` (2 addon) | legge solo `sources` | 2 source addon |
| `folders[1].catalogSources` (2 addon) | ignorato perché `sources` presente | nessun effetto |
| `addonId: "aio-metadata"` | risolto per manifest id | addon installato richiesto |
| `type: "movie"` / `"series"` | match catalog per id + tipo | ok se il manifest li dichiara |
| `tileShape: "POSTER"` | `PosterShape.POSTER` | poster |

Risultato: 1 collection, 2 folder, 3 source totali (1 TMDB + 2 addon), **nessuna folder mista**.
Per una folder mista basta aggiungere una source TMDB dentro `folders[1].sources`: il parser la
accetta, la UI crea una tab in più e l'“All” tab unisce le righe.

---

## 11. Rischi

| # | Rischio | Gravità | Prova |
|---|---|---|---|
| 1 | **Full replace senza merge server**: un push parziale cancella collection utente e di altri tool | Alta | docs 1590–1597, 1791–1796; `nuvio-push.js:538–554` |
| 2 | **Schema non versionato**: nessun `schemaVersion`; campi nuovi ignorati o persi | Alta | `Collection.kt:148–156`; nessun campo versione |
| 3 | **TV perde i campi sconosciuti**: `parse → toSerializable` riscrive solo i campi noti | Alta | `CollectionsDataStore.kt:184–193, 275–320` |
| 4 | **Doppia verità `sources`/`catalogSources`**: `sources: []` + legacy popolato = folder vuota su TV, popolata su mobile; entrambi assenti = blob vuoto su TV | Alta | `CollectionsDataStore.kt:380`; `CollectionModels.kt:213–221`; `nuvio-push.js:361–379` |
| 5 | **ID non stabili o duplicati**: duplicati su ogni release; mobile rifiuta l'import | Alta | `CollectionsDataStore.kt:106`; test mobile 149–182 |
| 6 | **Default di `tileShape`/`showAllTab` non affidabili** e `"wide"` interpretato diversamente | Media | `CollectionsDataStore.kt:219, 359–390`; `CollectionModels.kt:197, 205–211`; `PosterShape.kt:9–13` |
| 7 | **`addonId` ambiguo**: manifest id condiviso da più configurazioni; fallback silenzioso su altro addon | Media | `AddonMapper.kt:15–35`; `FolderDetailViewModel.kt:767–800` |
| 8 | **Source master rimosse non cancellate** dal merge Kaptain; folder orfane | Media | `collection-merge.js:115–153` |
| 9 | **`genre` non validato**: extra passato anche se la catalog non lo dichiara | Bassa | `FolderDetailViewModel.kt:1224–1227` |
| 10 | **Limiti di payload/numero collection non documentati** | Da testare | docs tacciono |

---

## 12. Cosa significa per YACA

1. **Scrivere `sources`, non solo `catalogSources`.** La docs v1.3 è la legge, ma è indietro: il
   contratto reale del client TV è la union con `provider`. YACA deve produrre `sources` come
   formato canonico e tenere `catalogSources` come specchio legacy per i client vecchi. Senza
   questo, YACA può fare solo folder addon, non source native.

2. **ID deterministici e namespace prima del primo publish.** `collection.id` e `folder.id` sono
   opachi e nessun server li assegna. Se YACA genera UUID a ogni build, ogni update duplica le
   collection. Servono ID tipo `yaca:collection:<slug>` e `yaca:folder:<collection>:<slug>`,
   immutabili, con un registro delle versioni. Il match per titolo è solo un fallback di Kaptain,
   non un contratto.

3. **Il merge è di YACA, non di Nuvio.** `sync_push_collections` sostituisce tutto. YACA deve
   pullare il blob, preservare collection/folder non `yaca-*`, aggiornare le proprie per ID,
   rimuovere solo ciò che possiede e pushare l'array completo. Ogni push “solo le mie collection”
   cancella il resto del profilo.

4. **Scegliere native vs addon per riga, non per collection.** Le folder miste sono supportate:
   una folder può avere TMDB discover + catalogs addon. Usa native TMDB/Trakt dove YACA ha già
   un mapping forte (discover, list, company, network, persona) e addon source per le catalog che
   esistono solo nell'addon. Native evita la dipendenza dall'addon ma dipende dall'integrazione
   TMDB; addon dipende da manifest id e installazione. La scelta è per source, non per pack.

5. **Igiene cross-platform obbligatoria.** Scrivi sempre `tileShape`, `viewMode`, `showAllTab` e
   `focusGifEnabled` espliciti; mai `"wide"`; `sources` canonico; ID unici; `title` valorizzato per
   TMDB/Trakt; non lasciare `sources: []` con `catalogSources` popolato. TV e mobile hanno default
   e validazioni diversi: un pack che “funziona sul TV” può non importarsi su mobile.

---

## 13. Domande aperte

1. `sync_push_collections` valida lo schema o accetta qualsiasi JSON? La docs lo tratta come blob
   opaco, ma non lo dice esplicitamente. `[DA TESTARE]` con un payload malformato.
2. Esiste un limite di dimensione/numero di collection/folder/source per profilo? La docs non lo
   documenta. `[DA TESTARE]`.
3. `p_origin_client_id` è accettato da `sync_push_collections`? Il TV lo manda, la docs non lo
   menziona per collections. `[DA TESTARE]`.
4. `sync_pull_collections` restituisce sempre una row anche quando il blob è vuoto, o un array
   vuoto? Kaptain gestisce row-set, array e stringa; il TV presume `rows.firstOrNull()`.
   `[DA TESTARE]` sui profili nuovi.
5. La TV, al primo edit dopo un import, perde davvero i campi sconosciuti? Il codice dice sì
   (`toSerializable`), ma va provato con un campo custom e un riavvio. `[DA TESTARE]`.
6. Due installazioni con lo stesso manifest id ma `baseUrl` diversi: quale vince? Il codice prende
   la prima; quante configurazioni reali (AIO Metadata, AIOStreams) condividono l'id? `[DA TESTARE]`.
7. `sources: []` + `catalogSources` popolato: TV mostra vuoto e mobile popolato? Il codice dice sì;
   serve una prova su entrambi i device. `[DA TESTARE]`.
8. `genre` come extra funziona su tutte le catalog che lo dichiarano? E su quelle che non lo
   dichiarano, l'addon lo ignora o risponde errore? `[DA TESTARE]`.
9. Le source TMDB native funzionano su mobile senza TMDB API key? Kaptain dice di no; il TV usa la
   chiave built-in. `[DA TESTARE]`.
10. Trakt public list: serve auth, ha rate limit, e `sortHow` è applicato lato client o lato Trakt?
    Il resolver è pubblico ma non ho letto il contratto remoto. `[DA TESTARE]`.
11. Il merge Kaptain per titolo è accettabile per YACA? Un utente che crea una folder con lo stesso
    titolo di una folder YACA rischia di vedersela riscrivere. Meglio ID-only. `[CODICE]` + rischio.
12. Esiste un modo per rimuovere una singola collection senza full replace? La docs dice solo
   `[]` per svuotare; non c'è un endpoint di delete per collection. `[DOC]` + `[DA TESTARE]`.

---

## Fonti primarie

**Documentazione**

- `https://nuvio.tv/docs/nuvio-public-api.md` — v1.3, last updated 20/08/2026, letta il 20/10/2026:
  sezione **Collections** (righe 1499–1617), **Sync strategies** (righe 1785–1796).

**NuvioTV — branch `dev`, letto il 20/10/2026**

- `app/src/main/java/com/nuvio/tv/domain/model/Collection.kt:6–156`
- `app/src/main/java/com/nuvio/tv/data/local/CollectionsDataStore.kt:65–193, 200–320, 359–440`
- `app/src/main/java/com/nuvio/tv/ui/screens/collection/FolderDetailViewModel.kt:226–271, 333–347, 725–800, 1224–1227`
- `app/src/main/java/com/nuvio/tv/core/sync/CollectionSyncService.kt:53–134`
- `app/src/main/java/com/nuvio/tv/core/sync/SyncClientIdentity.kt:13, 70–72`
- `app/src/main/java/com/nuvio/tv/data/mapper/AddonMapper.kt:15–35`
- `app/src/main/java/com/nuvio/tv/domain/model/Addon.kt:6–25`
- `app/src/main/java/com/nuvio/tv/domain/model/CatalogReference.kt:3–31`
- `app/src/main/java/com/nuvio/tv/domain/model/FolderViewMode.kt:3–14`
- `app/src/main/java/com/nuvio/tv/domain/model/PosterShape.kt:3–20`
- `app/src/main/java/com/nuvio/tv/core/tmdb/TmdbCollectionSourceResolver.kt:47–67, 161–309, 331–350, 499–514`
- `app/src/main/java/com/nuvio/tv/ui/screens/collection/CollectionEditorViewModel.kt:196–231, 1134–1150`
- `app/src/main/java/com/nuvio/tv/ui/screens/collection/CollectionManagementViewModel.kt:232–264`
- `app/src/main/java/com/nuvio/tv/ui/screens/collection/CollectionEditorFolderContent.kt:425–494`
- `app/src/main/java/com/nuvio/tv/ui/components/CollectionFolderCardMedia.kt:9–12`
- `app/src/main/java/com/nuvio/tv/ui/components/CollectionRowSection.kt:256–358`
- `app/src/test/java/com/nuvio/tv/data/local/CollectionsDataStoreSourceMigrationTest.kt:27–59, 174–201`

**NuvioMobile — branch `cmp-rewrite`, letto il 20/10/2026 (solo per le divergenze)**

- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionModels.kt:36–108, 188–241`
- `composeApp/src/commonMain/kotlin/com/nuvio/app/features/collection/CollectionJsonPreserver.kt:13–95`
- `composeApp/src/commonTest/kotlin/com/nuvio/app/features/collection/CollectionSourceSerializationTest.kt:149–218`

**Kaptain**

- `https://kaptain.stream/collection-merge.js?v=105.1` — righe 2–21, 34, 53–63, 115–153, 185–234,
  242–305.
- `https://kaptain.stream/nuvio-push.js?v=106.9` — righe 343–388, 516–554.
- `https://gist.github.com/ImKaptain/c3dd37db5ee2721149687b9fd71c93eb` — pack “native” v0.61
  (11 collection, 362 folder, 1.755 source: 822 tmdb, 933 trakt, zero addon).
- `https://gist.github.com/ImKaptain/c17022f90afd234b9a51ef4a56d6a568` — pack legacy: primo esempio
  di folder con solo `catalogSources`.
