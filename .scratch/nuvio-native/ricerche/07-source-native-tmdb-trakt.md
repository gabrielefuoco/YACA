# 07 — Source native TMDB/Trakt: cosa coprono davvero

**Ticket**: [07-source-native-tmdb-trakt](../issues/07-source-native-tmdb-trakt.md) · **Punti**: P04, P16
**Ricerca**: 20/10/2026 · **Natura**: solo ricerca, nessuna modifica al prodotto

## La domanda, in una riga

Quanto dei **163 preset** YACA può diventare una `collection source` nativa Nuvio (TMDB/Trakt) senza
addon, e quanto resta necessariamente addon? La risposta breve: **128/163 (78,5%)** è riproducibile
oggi dall'editor nativo; **133/163 (81,6%)** se si accetta un blob JSON con `sortBy=revenue.desc`;
**26** sono parziali usabili e **4** restano addon-only come riga singola. Ma la percentuale da sola
inganna: sotto ci sono **20 righe hero, 3 watchlist, 4 search e le liste Trakt personali** che native
non lo saranno mai. Sul totale delle righe permanenti la copertura scende a **128/190 (67,4%)**.

## Fonti e stato dell'evidenza

Legenda usata in tutta la nota:

- **[D] documentato** — scritto in una fonte pubblica che lo possiede.
- **[O] osservato** — letto nel codice client o nei file YACA; comportamento reale, non promessa.
- **[T] da testare** — plausibile ma non provato su un'istanza Nuvio/YACA.

| Fonte | Versione / commit | Cosa copre | Stato |
|---|---|---|---|
| Nuvio public API | v1.3, last updated 20/08/2026 — <https://nuvio.tv/docs/nuvio-public-api.md> | schema `collections_json`, sync, library | [D] |
| NuvioTV `Collection.kt` | `9f17e8bf` (19/09/2026) — `app/src/main/java/com/nuvio/tv/domain/model/Collection.kt` | modello source, enum, filtri | [O] |
| NuvioTV `TmdbCollectionSourceResolver.kt` | stesso commit — `app/src/main/java/com/nuvio/tv/core/tmdb/TmdbCollectionSourceResolver.kt` | filtri e sort realmente inviati | [O] |
| NuvioTV `TmdbApi.kt` | stesso commit — `app/src/main/java/com/nuvio/tv/data/remote/api/TmdbApi.kt` | parametri HTTP disponibili | [O] |
| NuvioTV `TraktPublicListSourceResolver.kt` / `TraktApi.kt` | stesso commit — `app/src/main/java/com/nuvio/tv/core/trakt/…` | source Trakt | [O] |
| NuvioTV `CollectionsDataStore.kt` | stesso commit — `app/src/main/java/com/nuvio/tv/data/local/CollectionsDataStore.kt` | serializzazione JSON reale | [O] |
| Nuvio wiki “settings/collections” | — | **non reperita**: `nuvio.tv/docs/*` risponde 404, il repo non ha wiki | assente |
| Kaptain collection pubblica | — | esempio di pack 0-addon citato dal ticket: **non letta** in questa sessione; non è una fonte di contratto | assente |
| TMDB Discover reference | <https://developer.themoviedb.org/reference/discover-movie> | semantica `,` = AND, `\|` = OR | [D] |
| YACA `src/catalog/presets.js` | working tree 20/10/2026 | 163 preset, 13 categorie | [O] |
| YACA `src/indice/filters.js`, `duckDbProvider.js` | idem | DSL e traduzione query | [O] |
| YACA `src/catalog/registry.js`, `capabilities.js`, `stremio/manifest.js` | idem | hero, provider, superfici esposte | [O] |

> **Buco documentale da mettere agli atti.** La API v1.3 documenta `folders[].catalogSources` con i soli
> campi `addonId`, `type`, `catalogId` (sezione *Collections → Get collections*, “Catalog reference”).
> **Non** documenta `folders[].sources`, né `provider`, `tmdbSourceType`, `tmdbId`, `traktListId`,
> `filters`, `sortBy`, `sortHow`. Eppure il client li serializza davvero
> (`CollectionsDataStore.kt:229-265`, `SerializableSource`). Conseguenza: la source nativa è
> **osservata nel client ma non contrattualizzata nell'API pubblica**. Scrivere un pack 0-addon
> significa dipendere da uno schema non documentato: è la scoperta più importante di questo ticket.

---

## 1. I sette tipi nativi

Modello unico: `TmdbCollectionSource(sourceType, title, tmdbId, mediaType, sortBy, filters)`
(`Collection.kt:25-32`). I filtri sono letti **solo** dal ramo `resolveDiscover`
(`TmdbCollectionSourceResolver.kt:230-325`): `LIST`, `COLLECTION`, `PERSON`, `DIRECTOR` **ignorano
`filters`** e ordinano in memoria.

| Tipo | Input | Filtri applicati | Sort | Paginazione | ID in uscita | Evidenza |
|---|---|---|---|---|---|---|
| `LIST` | `tmdbId` = id lista TMDB | nessuno; solo `language` | `sortedFor()` in memoria: `original`, `vote_average.desc`, `vote_count.desc`, `*_date.desc` | 20/pagina, `hasMore` da `total_pages` | `tmdb:<id>` | resolver 161-175, 331-350 |
| `COLLECTION` | `tmdbId` = id collection | nessuno | in memoria, stesso `sortedFor()` | **nessuna**: tutti i `parts`, `hasMore=false` | `tmdb:<id>` | resolver 177-208 |
| `COMPANY` | `tmdbId` = company | `filters` liberi + `with_companies=tmdbId` forzato | API `sort_by` | 20/pagina | `tmdb:<id>` | resolver 244-247, 273-275 |
| `NETWORK` | `tmdbId` = network | forza `mediaType=TV`, `with_networks=tmdbId`, `with_status="0\|3\|4"`, `first_air_date.lte=oggi` + `filters` | API `sort_by` | 20/pagina | `tmdb:<id>` | resolver 231-232, 277-282 |
| `DISCOVER` | nessun id: solo `filters` | tutti i 18 campi del modello | API `sort_by` | 20/pagina | `tmdb:<id>` | resolver 230-325 |
| `PERSON` | `tmdbId` = person | nessuno: `combined_credits.cast`, filtrato per `mediaType` | in memoria | **nessuna** | `tmdb:<id>` | resolver 210-228 |
| `DIRECTOR` | `tmdbId` = person | nessuno: `combined_credits.crew` con `job == "Director"`, filtrato per `mediaType` | in memoria | **nessuna** | `tmdb:<id>` | resolver 214-221 |

Dettagli che contano:

- **`COMPANY` e `NETWORK` non sono “tipi chiusi”**: passano da `resolveDiscover`, quindi accettano gli
  stessi filtri. È ciò che rende native-izzabili, per esempio, “Pixar + Animation + vote≥200”.
- **`NETWORK` è TV per costruzione** e inietta uno stato hardcoded (`0|3|4` = Returning/Ended/Canceled).
  Non si può chiedere “solo Ended” o “solo Returning” (`TmdbApi.kt:207` esiste, ma il resolver lo
  usa solo per `NETWORK`).
- **`LIST` è il tipo più vicino a un preset multi-query**, ma richiede un id di lista TMDB: YACA non
  ne possiede nessuna (vedi §4).
- **`mediaType` è obbligatorio per `PERSON`/`DIRECTOR`**: il resolver scarta i crediti dell'altro tipo
  (`matchesMediaType`, resolver 490-496). Un regista che ha fatto film e serie richiede due source.
- **Paginazione**: `skipStep = 20` per TMDB (resolver 327), `50` per Trakt (resolver 333). YACA serve
  20 titoli per pagina ma ne chiede 3 pagine TMDB per richiesta (`src/config.js:7-8`): il passo di
  `skip` non è equivalente.

### 1.1 Sort: l'enum dice sei, il resolver ne accetta di più

`TmdbCollectionSort` (`Collection.kt:58-65`) espone:
`original`, `popularity.desc`, `vote_average.desc`, `vote_count.desc`, `primary_release_date.desc`,
`first_air_date.desc`.

Ma `movieSort()`/`tvSort()` (`resolver 499-513`) hanno un ramo `else -> sortBy.ifBlank { "popularity.desc" }`:
**qualsiasi stringa passa a TMDB**. Quindi `revenue.desc` funziona via JSON import anche se non è
nell'enum e non compare nel picker. `original` invece verrebbe inviato a `discover` e TMDB lo
rifiuterebbe: **da non usare su `DISCOVER`** [T].

---

## 2. Filtri `DISCOVER`: cosa c'è e cosa manca

`TmdbCollectionFilters` (`Collection.kt:98-118`) → parametri reali (`TmdbApi.kt:164-225`):

| Filtro nativo | Parametro TMDB | Semantica | Preset YACA che lo usano |
|---|---|---|---|
| `withGenres` | `with_genres` | `,` AND / `\|` OR (TMDB docs) | 97 |
| `withoutGenres` | `without_genres` | idem | 46 |
| `releaseDateGte/Lte` | `primary_release_date.*` (movie) / `first_air_date.*` (tv) | data | 7 |
| `voteAverageGte/Lte` | `vote_average.*` | soglia | 14 |
| `voteCountGte` | `vote_count.gte` | soglia | 158 |
| `withOriginalLanguage` | `with_original_language` | `\|` OR | 31 |
| `withOriginCountry` | `with_origin_country` | `\|` OR | 3 |
| `withKeywords` / `withoutKeywords` | `with_keywords` / `without_keywords` | `,` AND / `\|` OR | 79 / 82 |
| `withCompanies` / `withoutCompanies` | `with_companies` / `without_companies` | id, `\|` OR | 9 / 0 |
| `withNetworks` | `with_networks` (solo TV) | id, `\|` OR | 8 |
| `year` | `year` (movie) / `first_air_date_year` (tv) | anno | 1 |
| `watchRegion` | `watch_region` | paese | 3 |
| `withWatchProviders` / `withoutWatchProviders` | `with_watch_providers` / `without_watch_providers` | id provider | 3 / 0 |

**Cosa non c'è** (e non è sostituibile da un altro tipo nativo):

| Mancante | Preset YACA che ne dipendono | Effetto |
|---|---|---|
| `with_runtime.gte/lte` | 12 (6 registi, incluso “Grandi Registi” + 6 attori) | non si può escludere il corto/il documentario per durata |
| `with_status` libero | 1 (`preset_miniseries`, `Ended`) | solo `NETWORK` ha uno stato hardcoded |
| `number_of_seasons.lte` / `number_of_episodes.lte` | 1 (`preset_miniseries`) | non si può definire “miniserie” |
| `certification` / `certification.lte` | 0 preset; usato solo dal guard Kids | nessun filtro età nativo; il Kids resta post-filtro addon |
| `revenue` / ROI come sort | 7 preset usano `revenue.desc` (5 esatti, 2 parziali) | `revenue.desc` funziona via JSON, non da editor; il ROI (`SortExpr.roi`, `filters.js:144`) non esiste in TMDB |
| `with_collections` multiplo | 1 (`preset_marvel`, 11 id + keyword AND) | solo `COLLECTION` singola |
| `with_cast` / `with_crew` multipli | 8 attori, 12 registi | solo `PERSON`/`DIRECTOR` singolo, senza filtri |
| `without_tmdbIds` | 1 (`preset_asian_action`) | nessun equivalente |
| `without_original_language` | 1 (`preset_italian_comedy`) | nessun parametro TMDB; clausola comunque ridondante |
| `permissive_recent` | 4 anime | YACA allarga il floor vote per i titoli recenti con una `OR` SQL; nativo no |
| `air_date.gte/lte` (episodio) | 1 (`preset_new_series_eps`) | non è un parametro discover |
| multi-query union + consensus | preset AI/custom | nativo: una query per source; il folder unisce, ma round-robin |
| scoring bayesiano/quality | `SortExpr.bayesian` / `quality` (`filters.js:136-140`) | mai esposto nei preset, solo hero/SQL; nativo non ce l'ha |

**Quirk da conoscere:**

- `withWatchProviders` senza `watchRegion` → il resolver forza `"US"` (resolver 259-261). YACA usa
  `watch_region: 'IT'`: **va sempre passato `watchRegion`**, altrimenti un pack italiano mostra il
  catalogo US.
- `withWatchMonetizationTypes` è forzato a `flatrate|free|ads|rent|buy` quando c'è un provider
  (resolver 263): non si può chiedere “solo abbonamento”.
- Il picker dell'editor espone tutti e 18 i campi del modello (`CollectionEditorTmdbPicker.kt`,
  `TmdbDiscoverForm`): la differenza tra editor e JSON è solo il **sort** `revenue.desc`, non i filtri.

---

## 3. Trakt nativo: non è un discover, è una lista editoriale

`TraktCollectionSource(title, traktListId, mediaType, sortBy, sortHow)` (`Collection.kt:35-41`).

| Aspetto | Comportamento | Evidenza |
|---|---|---|
| Endpoint | `GET lists/{id}/items/{movie\|show}` con `extended=full,images` | `TraktApi.kt:258-268` |
| Autenticazione | `executePublicRequest`: lista **pubblica**, nessun token utente | `TraktPublicListSourceResolver.kt:150-152` |
| Paginazione | `PAGE_LIMIT = 50`, `hasMore` da `X-Pagination-Page-Count` | resolver 69, 87, 333 |
| Sort | 8 valori: `rank`, `added`, `title`, `released`, `runtime`, `popularity`, `percentage`, `votes`; `asc/desc` | `Collection.kt:67-95` |
| Filtri | **nessuno**: non esiste un `filters` per Trakt | modello |
| ID | preferisce IMDb `tt`, poi `tmdb:<id>`, poi `trakt:<id>` | `TraktIdUtils.kt:43-55` |

**YACA ha/crea liste Trakt?** Ha un'integrazione OAuth che **legge** dati personali:
`/users/me/watchlist/{movies,shows}`, `/users/me/history/...`, `/users/me/ratings/...`,
`/users/me/favorites/...`, `/recommendations/...`, `/users/me/lists/favorites/items`
(`src/clients/trakt.js:415-467`). **Non crea** liste: nessuna `POST /users/{id}/lists`, nessuna
`POST /sync/lists`, nessuna pubblicazione (`trakt.js:50` è solo `/oauth/token`; `:587` è
`/sync/ratings`). Quindi:

- **watchlist, history, ratings, favorites, recommendations YACA → addon-only**: sono dati personali,
  la source nativa Trakt non li legge.
- **una lista Trakt pubblica → native**, ma YACA dovrebbe prima **crearne e mantenerne una per pack**
  (fuori dal codice attuale). È un percorso editoriale, non una query: la lista è statica finché non
  la si aggiorna.
- **`sortBy`/`sortHow` sono l'unica leva**: non c'è modo di filtrare per genere, voto, anno o runtime
  dentro una lista Trakt nativa.

---

## 4. Mappatura per categoria di preset YACA

Conteggio verificato eseguendo `getPresets()` sul working tree: **163 preset**, 13 categorie UI.
Qui sono raggruppati per la tassonomia del ticket. **Le categorie si sovrappongono** (Ghibli è
studio *e* anime; Anime Kids è anime *e* bambini; HBO Max Movies è studio *e* network): la somma delle
righe non fa 163 ed è voluto. I totali che contano sono quelli del classifier, sotto la tabella.

| Categoria | N | Native | Parziale | Addon | Come |
|---|---:|---:|---:|---:|---|
| Top & trend (popolari, top rated, novità, Oscar, cult, blockbuster, decenni) | 14 | 13 | 0 | 1 | `DISCOVER`; l'unico addon è `preset_new_series_eps` (air date episodio) |
| Registi / autori | 12 | 0 | 11 | 1 | `DIRECTOR` singolo (niente runtime/vote floor); `preset_grandi_registi` è un'unione di 11 registi |
| Attori | 8 | 0 | 8 | 0 | `PERSON` con `mediaType=movie`; perdi `vote_count`, `runtime`, `without_genres` |
| Studio | 9 | 9 | 0 | 0 | `COMPANY` singola o `DISCOVER` con `withCompanies` multiplo (DC, HBO) |
| Network / piattaforme | 12 | 12 | 0 | 0 | `NETWORK` singolo o `DISCOVER` con `withNetworks`/`withWatchProviders` |
| Franchise | 2 | 1 | 0 | 1 | `preset_big_sagas` = keyword; `preset_marvel` = 11 collection + keyword AND |
| Genere / tematica / mood / resto | 90 | 87 | 3 | 0 | `DISCOVER` puro; parziali: `asian_action`, `miniseries`, `italian_comedy` |
| Anime (trasversale) | 18 | 13 | 4 | 1 | `DISCOVER` genre 16 + `ja` + keyword; 4 con `permissive_recent`, 1 simulcast |
| Decennio | 3 | 3 | 0 | 0 | `DISCOVER` con date gte/lte (già dentro “Top & trend”; anime classic/00s dentro “Anime”) |
| Watchlist | 0 preset / 3 righe | 0 | 0 | 3 | `yaca_watchlist_{movies,series,anime}`: libreria personale Stremio |
| Trakt personale | 0 preset / 5 cataloghi | 0 | 0 | 5 | watchlist/history/ratings/favorites/recommendations: OAuth, non pubblici |
| Custom / AI | variabile | caso per caso | — | — | native solo se una singola `strategy: discovery`; multi-query/static/similar → addon |
| Hero / DNA | 20 righe | 0 | 0 | 20 | `yaca_mondi`, `passo_fuori`, `uscite_nuove`, `nicchia_di_qualita`, `classici`, `micro_cluster_*`, `punti_incontro` |

*Controllo di quadratura della tabella*: le colonne sommano 138 native, 26 parziali, 4 addon. I 5
doppi conteggi (Ghibli studio+anime, HBO Max Movies studio+network, i 3 decenni top+decennio) danno
**133 native uniche**; con 26 parziali e 4 addon si torna a **163**.

Numeri esatti del classifier (chiavi della query vs set nativo):

- **133** preset con query interamente esprimibile (81,6%);
- di questi **5** richiedono `sortBy=revenue.desc`, fuori dall'enum/editor → **128 usabili da editor
  (78,5%)**, 133 via blob JSON;
- **28** parziali (17,2%): 12 `with_crew`, 8 `with_cast`, 4 `permissive_recent`, 1
  `with_collections`, 1 `without_tmdbIds`, 1 `with_status`+seasons, 1 `without_original_language`.
  Di questi, **2** (`grandi_registi`, `marvel`) non sono accettabili nemmeno come parziali: come riga
  singola sono addon. Restano **26 parziali usabili** (16,0%);
- **4** addon-only come riga singola (2,5%): i 2 impossibili già a livello di query
  (`new_series_eps`, `anime_simulcast`) più `grandi_registi` e `marvel`.
- Quadratura: 128 + 5 + 26 + 4 = **163**.

**Sul totale delle righe permanenti** (163 preset + 20 hero + 4 search + 3 watchlist = **190**):

- 128/190 = **67,4%** native da editor;
- 133/190 = **70,0%** native via JSON;
- le 27 righe non-preset (hero, search, watchlist) sono **tutte addon-only**.

### 4.1 I preset che non si possono native-izzare (lista esplicita)

**Impossibili come riga singola, senza compromessi:**

1. `preset_new_series_eps` — “Serie: Episodi Recenti” usa `air_date.gte/lte` (data di messa in onda
   dell'episodio): non esiste in `discover/tv`. Richiede `/tv/on_the_air` o scansione episodi.
2. `preset_anime_simulcast` — provider `airing_state` (`presets.js:235`), non TMDB: dipende dal
   servizio `anime-source` e dagli id Kitsu di YACA (`src/anime/airing.js:212-248`).
3. `preset_grandi_registi` — unione OR di 11 registi + `without_genres=Documentary` +
   `with_runtime.gte=60` + `vote_count.gte=100`. Come 11 tab `DIRECTOR` perdi filtri e ordine.
4. `preset_marvel` — 11 collection MCU **AND** keyword `180547`, ordinate per incasso. 11 tab
   `COLLECTION` danno l'unione, non l'AND, e perdono `revenue.desc`.

**Parziali usabili (native, con perdita visibile):**

- 11 registi: `preset_nolan`, `tarantino`, `scorsese`, `spielberg`, `kubrick`, `villeneuve`, `fincher`,
  `burton`, `wesanderson`, `lynch`, `scott`.
- 8 attori: `actor_dicaprio`, `actor_cruise`, `actor_reeves`, `brad_pitt`, `de_niro`, `johnny_depp`,
  `denzel`, `nicolas_cage`.
- 4 anime: `anime_shonen`, `anime_shoujo`, `anime_mecha`, `anime_isekai` (perdono il floor permissivo
  sui recenti).
- `asian_action` (perde l'esclusione di 3 tmdbId), `miniseries` (perde status+seasons+episodes),
  `italian_comedy` (perde un `without_original_language` ridondante: qui la perdita è ~zero).

---

## 5. Fidelity: cosa si perde in una source nativa

| Dimensione | YACA | Source nativa | Perdita |
|---|---|---|---|
| **DNA / affinità** | `affinity_score`, VSM, grafo, `yaca_mondi` (registry 26-202) | nessun reranker: solo `sort_by` TMDB | **totale** sulle 20 hero |
| **ITA** | badge `_itaBadge`/`_itaOnlyBadge` da `ita_annotations.jsonl` (`src/stremio/badges.js:139-172`) | nessun badge: la card è il raw TMDB | **totale** |
| **Anime** | `anime_mappings` + genre 16 + `ja` (`filters.js:113-119`); badge episodio | solo genre 16 + `ja`; niente mapping, niente badge | parziale |
| **Ordinamento** | SQL con tie-breaker (`vote_average` + `vote_count`, `preset_burton` ha `orderBy` composito, `presets.js:89`) | `sort_by` API; `sortedFor` in memoria per LIST/COLLECTION/PERSON | parziale |
| **Dedup** | base-id merge + `consensusBonus` tra query (`resultMerger.js:73-101`) | `distinctBy` per source; “All” del folder dedupa per id | parziale |
| **Rotazione** | impressioni + alpha del giorno (`src/pool/impressioni.js:119-169`) | deterministica: stessa query, stesso ordine | **totale** |
| **Paginazione** | 20/item, 3 pagine TMDB per richiesta (`config.js:7-8`), cache 7g | 20/pagina TMDB, 50 Trakt, `skip` lineare | comportamento diverso |
| **ID** | `tmdb:<id>` (duckDbProvider 286), con `_imdbId` a parte | `tmdb:<id>` per TMDB; `tt`/`tmdb:`/`trakt:` per Trakt | TMDB nativo perde l'aggancio IMDb |
| **Multi-source pack** | query multiple + consensus + weights | folder con tab + “All” in `roundRobinMerge` (`FolderDetailViewModel.kt:400`) | niente consensus, niente peso |
| **Arte** | poster ERDB, badge, `{shape}` | poster TMDB `w500`/`w1280` | parziale |
| **Provider** | `hybrid`, `duckdb`, `airing_state`, `watchlist`, `trakt`, `ai_discovery` (`capabilities.js:121-209`) | solo source `tmdb` e `trakt`; il `trakt` YACA è personale, non liste pubbliche | nessuno dei 6 provider è native-equivalente |

Nota su `weights`: `preset_epic_historical` e `preset_space_hard_scifi` dichiarano
`weights: { tmdb, trakt }` (`presets.js:175,179`). Il campo viene normalizzato
(`resultMerger.js:27,46,56`) ma **non risulta applicato** da nessun merger: allo stato è metadato
inerte [O]. Non va raccontato come “scoring ibrido perso”: oggi non c'è scoring ibrido.

---

## 6. La regola

> **Native se** la riga è una **singola query `discover` TMDB**, tutti i filtri stanno nei 18 campi
> nativi, il sort sta in `{popularity, vote_average, vote_count, data}` (o `revenue` via JSON), e il
> risultato è **statico e impersonale**: nessun DNA, nessun badge ITA, nessuna rotazione, nessun dato
> personale.
>
> **Addon se** serve almeno una di queste: runtime, status, stagioni/episodi, certification,
> `without_tmdbIds`, unione multi-regista/multi-attore/multi-collection con AND, union multi-query con
> consensus, dati personali (watchlist, Trakt history, DNA), air date degli episodi, badge/arte/rotazione.

Esempi:

| Preset | Verdetto | Perché |
|---|---|---|
| `preset_italian_cinema` | **native** | `DISCOVER`: `withOriginalLanguage=it`, `voteCountGte=200`, `sortBy=vote_average.desc` |
| `preset_pixar` | **native** | `COMPANY` id 3 + `voteCountGte=200` |
| `preset_hbo` | **native** | `NETWORK` id 49 + `voteCountGte=100` (accetta lo status hardcoded) |
| `preset_hbo_max_series` | **native** | `DISCOVER` con `withNetworks="49\|3186"` |
| `preset_nolan` | **parziale** | `DIRECTOR` 525: perdi `voteCount≥200` e l'ordinamento per voto; resta un buon “tutti i Nolan” |
| `preset_miniseries` | **addon** | `status=Ended` + `seasons≤1` + `episodes≤10` |
| `preset_new_series_eps` | **addon** | `air_date` episodio |
| `preset_marvel` | **addon** | 11 collection + keyword AND + revenue |
| `yaca_mondi_movies` | **addon** | DNA/affinity |
| `trakt_watchlist_movies` | **addon** | dato personale OAuth; Trakt nativo legge solo liste pubbliche |
| pack “Cinema italiano” | **misto** | 1 folder con 10–15 source `DISCOVER` native + 2–3 tab addon per miniserie/ITA |

---

## 7. Cosa significa per YACA

1. **La native-izzazione è un lavoro di “pack”, non di motore.** Il 78,5% dei preset è esprimibile
   come `TMDBCollectionSource`; non serve riscrivere YACA, serve un compilatore preset → source e una
   politica di quali righe restano addon.
2. **Il valore di YACA non è la query, è ciò che ci mette sopra.** ITA, DNA, rotazione, anime mapping,
   poster: sono esattamente le cose che la source nativa non ha. Un pack 0-addon è più economico ma
   è un altro prodotto, non YACA.
3. **Il buco è il contratto, non il codice.** `sources` non è nella API v1.3. Prima di puntarci
   bisogna verificare che `sync_push_collections` accetti e restituisca il blob con `sources`
   (ticket 02/11), altrimenti il pack 0-addon si rompe al primo full-replace.
4. **Trakt nativo è editoriale.** Per usarlo YACA deve creare e mantenere liste pubbliche: è un
   processo operativo, non una feature di query. Le liste personali restano addon.
5. **La percentuale vera da comunicare è ~67% delle righe permanenti**, non 82% dei preset. Le hero
   (20) e le watchlist (3) non hanno equivalente nativo.

## 8. Domande aperte / da testare

1. `sync_push_collections` accetta `folders[].sources` con `provider:"tmdb"`, `tmdbSourceType`,
   `filters`? Il round-trip su TV e mobile conserva i campi o li scarta? [T]
2. `sortBy="revenue.desc"` in un `DISCOVER` importato via JSON: il resolver lo passa (osservato) e
   TMDB lo accetta per i movie? [T]
3. `sortBy="original"` su `DISCOVER`: TMDB risponde 400? [T]
4. Un folder con 11 `COLLECTION` (Marvel): l'“All” pagina e dedupa correttamente oltre la prima
   pagina? [T]
5. `watchRegion` assente → US: confermato nel codice; va sempre esplicitato “IT” nei pack. [O]
6. La TMDB key è bundled (`BuildConfig.TMDB_API_KEY`): nessuna key utente, ma quota e rate limit
   sono condivisi. Quanti pack regge? [T]
7. `PERSON`/`DIRECTOR` non paginano: con carriere da 100+ crediti la row è completa o troncata? [T]
8. La wiki “settings/collections” non è raggiungibile: esiste un contratto pubblico alternativo per
   le source native, o il codice è l'unica fonte? [T]

---

*Nessun file di prodotto è stato modificato. Il ticket 07 è stato chiuso il 20/10/2026; questa nota
resta la fonte del dettaglio.*

> **Nota del revisore (20/10/2026).** La wiki Nuvio esiste su `https://nuvio.wiki/settings/collections`
> (letta in charting). Non è stata usata come fonte del contratto API perché non è la documentazione
> ufficiale delle RPC: per lo schema `collections_json` la fonte resta la docs v1.3 + il codice
> `CollectionsDataStore.kt`. La frase “non reperita” sopra va letta come “non usata per il contratto”,
> non come “inesistente”.
