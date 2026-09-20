# DIAGNOSIS — Motore di raccomandazione YACA (fase 1)

**Data:** 2026-09-20 · **Stato:** fase 2 — diagnosi STATICA + probe offline + **test jest rosso-capaci scritti** (`tests/diag.recommender.*.test.js`, commit sul branch `diag/recommender-tests`). **Nessuna ipotesi è confermata end-to-end**: non c'è DB vivo, non c'è una sessione Stremio. Le 5 domande §4 hanno risposta di Gabriele (integrate sotto); la riprioritizzazione riflette le risposte. Ogni ipotesi qui sotto ha falsificazione esplicita.

**Confini rispettati:** nessun file tracciato modificato, nessun commit, nessun branch. Artefatti solo in `.scratch/recommender/`. Il checkout ha 64 file tracciati non committati di Gabriele: intatti (`git status` invariato). Nota: in questa sessione non esisteva il tool `subagent`, quindi NON sono stati lanciati slave `agy` (verificato: in `.scratch/recommender/` ci sono solo i miei probe).

---

## 0. Evidenza eseguibile già raccolta (probe in `.scratch/recommender/`)

| Probe | Comando | Output chiave |
|---|---|---|
| `probe_scoring_effect.js` | `node .scratch/recommender/probe_scoring_effect.js` | Item con keyword: **9.62**; stesso item senza keyword: **8.81**. La presenza keyword cambia lo score VSM. |
| `probe_scoring_effect2.js` | idem | Profilo *solo keyword* (nessun genere): item con keyword **9.58** vs senza **3.96**. Due light-meta con `vote_average` 9.5 vs 2.0: score **identico 3.25** (cieco alla qualità). |
| `probe_graph_moods.js` | idem | Grafo: 469 L2, 1382 L1, 6125 chiavi `kw_to_L1`. L2 colpiti dai mood: Intenso 13, Rilassante 7, Psicologico 8, Drammatico 7, Epico 5. |
| `probe_jsonl_keywords2.js` | idem | 3478/3500 film del dump locale hanno keyword. Match per mood (semantica ILIKE reale): Intenso 653, Rilassante 279, Psicologico 211, Drammatico **83**, Epico 128. |
| `probe_jsonl_kwcount.js` | idem | Keyword-mood **morte** nel dump: `action`, `relaxing`, `peaceful`, `mind-bending`, `sad`, `heartbreaking`. Rare: `thriller` 2, `comedy` 4, `mystery` 2. |
| `probe_kw_nondeterminism.js` | idem | 25/469 L2 hanno espansione keyword >30; nodo `t_0`: 57 keyword raw → campione casuale di 30, **diverso a ogni chiamata** (verificato su 20 call). |
| `probe_shape.js` | bloccato | `require('duckdb')` → MODULE_NOT_FOUND: `node_modules` vuoto. Da rieseguire dopo `npm install`. |

Il dump locale usato come fixture è `.cache/tmdb/master_movies.jsonl` (3500 film, con `genres`/`keywords`/`cast`/`directors`/`recommendations`) e `.cache/tmdb/movies.parquet` (2.6 MB). **Manca `tv.parquet`**: qualsiasi probe su serie è cieco in locale.

---

## 1. Mappa del flusso reale

### 1.1 Ingresso
Stremio → `src/api/stremio.js:331` (`GET /:userHandle/catalog/:type/:id.json`) → `catalogHandler` (`src/handlers/catalogHandler.js:218`) → cache SWR `catalogRequestCache.getOrFetch` (`:416`) → `routeCatalogRequest` (`src/catalog/CatalogRouter.js:12`).

### 1.2 Cataloghi di raccomandazione (hero)
- Il manifest espone 8 hero: `yaca_true_blend_*`, `yaca_seed_network_*`, `yaca_hidden_gems_*`, `yaca_trakt_filtered_*` (`src/api/stremio.js:241`), filtrati da `raw_ui_state.selectedPresets`.
- `CatalogRouter.js:56` → `TASTE_BASED_IDS` (`src/catalog/providers/HybridProvider.js:9`) → `getEngineHybridCatalog` (`HybridProvider.js:17`) → `getHybridCatalog` (`src/engines/hybridRecommendations.js:22`).
- `getHybridCatalog` cerca un `matchedPreset` (`hybridRecommendations.js:24`): **per gli hero è sempre `null`** (verificato: nessun `yaca_true_blend*` in `src/data/presets.js`), quindi `buildDirectPresetCatalog` (`:52`) è codice morto su questo percorso.
- Strategie (`hybridRecommendations.js:59-70`):
  - **True Blend / Scelti per Te** → `buildTopGenresMixCatalog` (`src/engines/hybrid/catalogStrategies.js:281`) → `buildFilteredCatalog` (`:245`) → `fetchSmartAndPool` (`:140`) → SQL DuckDB → `ProfileScorer.calculateItemMatch(item.rawTMDB || item, ...)` (`:264`).
  - **Hidden Gems** → `buildHiddenGemsCatalog` (`:424`) → stesso `buildFilteredCatalog` con `baseFilters` qualità (`:426`).
  - **Seed Network / La Rete dei tuoi Preferiti** → `buildHybridCatalog` (`:290`): seed = loved/liked/Trakt/DNA → `similar_to` su DuckDB (`queryBuilder.js:36-59`, colonna `recommendations`) → `calculateHybridScore` → top 80 → `tmdb.getTmdbMovieDetails` (rete) → `calculateItemMatch` → sort `score + hybridScore` (`:415`).
  - **Trakt Filtered / Suggeriti dalla Community** → `buildTraktFilteredCatalog` (`:435`) → dettagli TMDB → `calculateItemMatch`.
- Output pagina: `getHybridCatalog` idrata ogni ID con `getDuckDbMetaDetails` (`hybridRecommendations.js:132`; include keywords/credits) e formatta con `StremioFormatter`. Cache ID: `hybridRecommendationsCache` TTL 7 giorni / SWR 1 ora (`src/config.js:41-42`).

### 1.3 Matchmaker
- API `src/api/profiles.js:339-363` → `src/handlers/matchmakerHandler.js`: `initMatchmakerSession` (`:27`), `analyzeMatchmakerSession` (`:91`), `finishMatchmakerSession` (`:133`).
- Init → `getMatchmakerInitCards` (`src/engines/hybrid/MatchmakerGraphEngine.js:119`): mood → punteggio L2 su `top_keywords` (`:136-152`); **se nessun mood → un solo L2 a caso** (`:155`); i generi sono solo una WHERE (`applyFunnelFiltersToPreset`, `:52-64`; applicata a `:158-166`), non guidano la scelta del topos.
- Carte (`getCardsForNodes`, `:67-116`): per ogni nodo, SQL `keywords ILIKE '%"kw"%'` (`:91`) + `minVotes(50)` + `orderBy POPULAR`, fetch 100, poi **shuffle casuale e slice di 5** (`:97`), e shuffle finale (`:113`).
- Analyze → `getMatchmakerNextCards` (`:176`): i like/watchlist vengono mappati keyword→L1 (`kw_to_L1`, `:214-227`), i dislike tolgono 0.5 al nodo sorgente (`:229-256`), si prendono i 4 L1 più caldi (`:266-274`) e 3 carte per nodo (`:276`). **Nessun fallback se le carte sono 0** (il fallback `selectedNodes.length === 0` a `:269` copre solo la heat map vuota).
- Finish → `getFinalRecommendations` (`:284`) dai nodi vincenti → `manual_list` salvato come catalogo `custom_matchmaker_*` (`matchmakerHandler.js:164-183`), riordinato per popolarità in render.
- **Il matchmaker non importa né usa `TasteProfile`/`ProfileScorer`/`V_final`** (verificato: nessun riferimento in `matchmakerHandler.js` e `MatchmakerGraphEngine.js`). Il `startingL3NodeId` che il frontend invia (`frontend/src/components/modals/MatchmakerModal.tsx:201`) è **ignorato** dal backend.
- L'endpoint funnel è deprecato e ritorna `results: []` (`matchmakerHandler.js:19-26`); la UI attuale parte direttamente con `initMatchmaker` (`MatchmakerModal.tsx:189`), quindi il funnel è codice morto.

### 1.4 Dove i due divergono (perché il matchmaker va peggio)
1. **Nessuna personalizzazione**: i cataloghi usano VSM (`V_final`), il matchmaker no. Il matchmaker riparte da zero a ogni sessione.
2. **Selezione casuale**: il matchmaker prende 5 carte a caso dal top-100 popolarità di un nodo (`:97`, `:113`); i cataloghi ordinano per score.
3. **Il mood conta solo al round 1**: dopo, il segnale è solo "keyword dei like → L1" (i generi dei like non contano); i dislike penalizzano solo il nodo sorgente.
4. **Nessun fallback sulle carte vuote**: se genere+keyword non intersecano (o `isAnime` senza `anime_mappings`), il round torna `cards: []` e il deck si blocca; i cataloghi hanno un fallback (silenzioso, vedi H4).
5. **Nessuna cache/determinismo**: le carte cambiano a ogni chiamata anche a parità di input.
6. **Generi movie-only**: il matchmaker manda nomi di genere del catalogo film anche per serie/anime (H3b) e i cataloghi filtrano per ID genere non "type-scoped" (H3b) → per le serie il pool può azzerarsi e scattare il fallback.

---

## 2. Ipotesi numerate (ordinate per probabilità × impatto)

> **Riprioritizzazione post-risposte (20/09):** il sintomo guida di Gabriele è il **collasso della diversità nel top-k** ("i risultati, anche per sottogeneri, erano sempre troppo simili tra loro", "non trovava quello che cercava"). Ordine di attacco: **H1** (scoring cieco), **H6** (hybridScore dominante), **H5** (paginazione/interleave), **H11** (nuova: nessuna diversificazione nel top-k) sui cataloghi hero; **H3/H3b** sul matchmaker. **H2** resta valida in sé ma non spiega il peggioramento (i cataloghi prima di `73a023d` NON erano meglio — risposta 5). **H7** declassata a bassa priorità. **H10** sempre certezza (test verdi vacui).

### H1 — [prob. alta, impatto alto] Il VSM di True Blend/Hidden Gems è alimentato con light-meta DuckDB senza keyword/credits/vote_count
- **Evidenza**: `DuckDbProvider.js:148-200` (`mapDuckDbRowToMeta`) costruisce `rawTMDB` (`:159`) con soli generi/voti/popolarità: **niente `keywords`, niente `credits`, niente `vote_count`**. `buildFilteredCatalog` (`catalogStrategies.js:251`) prende il pool da `getDuckDbCatalogFromPreset` e scorea `item.rawTMDB || item` (`:264`). `ProfileScorer.calculateBaseItemMatch` usa keyword (`ProfileScorer.js:87-99`), credits (`:130-146`), `vote_count` (`:156`) e l'`indieBonus` (`:177-180`). `getDuckDbMetaDetails` (`DuckDbProvider.js:223-277`) *ha* keywords/credits, ma non è usato in questo percorso. Probe: profilo solo-keyword 9.58 vs 3.96; qualità ignorata (3.25 = 3.25).
- **Meccanismo**: la quota tematica gerarchica (topoi) e la quota autoriale vanno a 0; il Bayesian diventa la costante C=6.5 e l'`indieBonus` si applica uniformemente (voteCount=0<1000) → ranking ≈ affinità di genere.
- **Effetto atteso**: "Scelti per Te"/"Gemme Nascoste" non riflettono gusti per keyword/topoi; punteggi compressi e `_yacaMatch` poco informativo; i due cataloghi ordinano in modo simile tra loro.
- **Falsificazione**: test jest con `getDuckDbCatalogFromPreset` mockato che ritorna light-meta e profilo *solo-keyword*: l'item con keyword deve battere quello senza. Con il codice attuale fallisce (entrambi ~stesso score). Conferma definitiva: probe end-to-end con `movies.parquet` e profilo fixture dopo `npm install`.
- **Fix minima**: in `buildFilteredCatalog`, idratare il pool (o i top-N candidati) con `getDuckDbMetaDetails` (SQL locale, zero API) prima di `calculateItemMatch`; oppure reintrodurre il Two-Tier documentato: `calculateLightScore` per il taglio, full score dopo idratazione. (Nessun refactor del grafo.)

### H2 — [prob. alta, impatto alto] `V_active` non cresce più: `TmdbScoringData` non ha nessun writer dal commit 73a023d
- **Evidenza**: `ProfileBuilder.js:125-126` e `:145-146`: l'estrazione DNA esce subito se `TmdbScoringData` non ha il documento. L'unico riferimento a `TmdbScoringData` in scrittura è `metaHandler.js:232-252` (`updateScoringCache`) con **`upsert: false`** — non crea documenti. Grep su tutto il repo: nessun creator. `git log -S "saveScoringData"` → rimosso in `73a023d` ("cleanup dead code … migrate to native DuckDB sql"); il test relativo è `describe.skip` (`tests/hybridRecommendations.reviewFixes.test.js:187`).
- **Meccanismo**: `syncUserHistory`/`syncStremioData` scrivono `WatchHistory` ma `_bulkUpdateVectorsAsync` non trova scoring data → `dnaList=[]` → `V_active` invariato → `V_final ≈ V_static`.
- **Effetto atteso**: utenti diversi con gli stessi preset ottengono gli stessi cataloghi; la personalizzazione non migliora guardando contenuti; i cataloghi hero sembrano generici.
- **Falsificazione**: contare i documenti `tmdbscoringdata` in produzione; unit test: `ProfileBuilder.syncUserHistory` con `TmdbScoringData.find` mockato a `[]` → `compiledVectors.V_active` resta `{}`; poi con un doc → cresce. Serve Mongo (anche mock, ma la conferma è il count reale).
- **Fix minima**: in `_bulkUpdateVectorsAsync`, estrarre il DNA direttamente da DuckDB (bulk `SELECT id, genres, keywords, cast, directors, original_language FROM movies/tv WHERE id IN (...)`) con fallback su `TmdbScoringData`; oppure ripristinare un writer di `TmdbScoringData` nel percorso di scoring dei cataloghi. (La prima evita Mongo e usa dati già locali.)

### H3 — [prob. alta, impatto alto sul matchmaker] Il matchmaker è random, senza profilo, e può restare senza carte
- **Evidenza**: shuffle `MatchmakerGraphEngine.js:97,113,155,165,272`; nessun uso di `TasteProfile`; generi solo WHERE (`:52-64`); nessun fallback carte vuote (`:276`); mood solo round 1. Probe: mood→L2 funziona (5-13 nodi) ma 6 keyword-mood sono morte nel dump (`action`, `relaxing`, `peaceful`, `mind-bending`, `sad`, `heartbreaking`) e altre rarissime (`comedy` 4, `mystery` 2, `thriller` 2).
- **Meccanismo**: (a) senza mood si sceglie 1 L2 a caso; (b) con mood si sceglie 1 dei 10 L2 migliori a caso (4 su 10); (c) le 5 carte sono un campione casuale del top-100 per keyword del nodo, quindi anche il round 1 non è "il meglio", è "casuale nel popolare"; (d) `genres AND keyword-node` può dare 0 risultati senza fallback.
- **Effetto atteso**: percezione di carte fuori tema/ripetitive; deck vuoto in alcune combinazioni; sessioni non riproducibili.
- **Falsificazione**: con `movies.parquet` (dopo `npm install`): eseguire `getMatchmakerInitCards` 5 volte con lo stesso input e misurare (1) quante carte, (2) quanti titoli diversi, (3) quanti rispettano il genere scelto; e per ogni combinazione genere×mood contare i nodi che danno 0 carte. Atteso: deck variabile e alcuni 0.
- **Fix minima**: usare i top topos di `V_final` come seed (fallback al mood), rimuovere gli shuffle e prendere i top-N per score/popolarità, aggiungere fallback a catena (rilassa keyword → solo genere) quando un nodo rende 0 carte. Riusare `ProfileScorer.calculateLightScore` sulle carte del pool (economico, già esistente).

### H3b — [prob. alta, impatto alto su serie/anime] I generi sono movie-oriented: per serie/anime il matchmaker può dare 0 carte e i cataloghi possono svuotarsi
- **Evidenza**: la UI passa i nomi inglesi dei generi **film** a prescindere da `selectedType` (`frontend/src/components/modals/MatchmakerModal.tsx:37-43` mappa 28→'Action', 878→'Science Fiction', 12→'Adventure', 10752→'War', 14→'Fantasy'; usata a `:183-189`). Il backend filtra per nome esatto: `applyFunnelFiltersToPreset` (`MatchmakerGraphEngine.js:52-64`) → `F.genreStr` (`src/data/filters.js:13-19`) → `"genres" ILIKE '%"name":"Action"%'`. Su TMDB le serie usano nomi composti (10759 'Action & Adventure', 10765 'Sci-Fi & Fantasy', 10768 'War & Politics') e **non hanno** Romance/Thriller/Horror/History/Music/TV Movie: `'%"name":"Action"%'` non matcha `"name":"Action & Adventure"` (serve la virgoletta subito dopo 'Action'). La mappa cross-type esiste già ma è **inutilizzata**: `G._movieToTv` (`src/data/filters.js:80-91`, 28→10759, 878→10765, 14→10765, 10752→10768) non è referenziata fuori da `filters.js` (verificato con grep).
- **Secondo meccanismo (cataloghi)**: `V_final` non distingue movie/tv (`dnaExtractor.js:87-88` aggiunge `g:<id>` senza tipo) e `fetchSmartAndPool`/`buildHybridCatalog` filtrano con `F.genre(Number(g))` (`catalogStrategies.js:194,313`). Un utente che guarda film e apre "Scelti per Te (Serie)" filtra la tabella `tv` con ID genere film → pool vuoto → fallback popolare cachato (H4).
- **Effetto atteso**: sessioni matchmaker di serie/anime con generi popolari (Azione/Romantico/Thriller/Horror/Fantascienza) senza carte; hero serie generici per chi ha storia prevalentemente film.
- **Falsificazione**: con `tv.parquet` (o un mock DuckDB con una riga `{"id":10759,"name":"Action & Adventure"}`): `getMatchmakerInitCards('tv', ['Action'], ['Intenso & Ricco d\'Azione'], {})` deve restituire >0 carte; oggi 0. Per i cataloghi: profilo con V_final `g:28` e `buildTopGenresMixCatalog(..., mediaType='series')` → pool vuoto/fallback.
- **Fix minima**: nel matchmaker usare gli ID numerici già disponibili nella UI e convertirli per tipo con `G._movieToTv` quando `type !== 'movie'` (oppure far passare al backend `{type, id}`); in `fetchSmartAndPool`/`buildHybridCatalog`, filtrare i top generi per tipo (movie→tv con `_movieToTv`, tv→movie con `_tvToMovie`) prima di costruire `F.genre`.

### H4 — [prob. media-alta, impatto medio] I fallback non personalizzati vengono cachati 7 giorni come se fossero raccomandazioni
- **Evidenza**: `hybridRecommendations.js:97-112`: se gli ID sono vuoti → `fetchPopularFallbackIds`/`fetchHiddenGemsFallbackIds` e `hybridRecommendationsCache.set(cacheKey, {ids})`; TTL 7 giorni (`src/config.js:41`). `catalogStrategies.js:249-252`: se il pool è vuoto → `fallbackFn` (popolarità). `buildHybridCatalog` (`:350`) fallback se nessun seed.
- **Meccanismo**: un profilo vuoto/DB non pronto produce una lista generica che resta in cache 7 giorni anche dopo che il profilo è stato popolato (SWR 1h non basta: ri-valida con lo stesso fallback finché la cache non scade o il profilo non cambia `cacheKey`).
- **Effetto atteso**: "Scelti per Te" = "Film Popolari" per giorni; l'utente non vede miglioramenti dopo il sync.
- **Falsificazione**: unit test con `hybridRecommendationsCache` mockata: profilo assente → la chiave personale contiene gli ID del fallback. Oppure ispezionare `CacheEntry` di `recommendation_cache` in prod e confrontare con un rebuild manuale.
- **Fix minima**: non cachare (o cachare con TTL breve + flag `fallback:true`) i fallback sotto la chiave personalizzata; al massimo cachare la lista di emergenza in una chiave separata.

### H5 — [prob. alta, impatto medio] Paginazione rotta per cataloghi interleaved/multi-query (duplicati tra pagine)
- **Evidenza**: `AiDiscoveryProvider.js:191` chiama `interleaveMultipleResults(queryResults, PAGE_SIZE)` **senza `skip`**; la funzione fa `combined.slice(skip, skip+limit)` con default 0 (`resultMerger.js:9,28`). Nel ramo non-interleave multi-query: fetch a `perQuerySkip = skip` (`:167-171`) ma poi `finalItems.slice(0, PAGE_SIZE)` (`:204`) sul merge globale → la "pagina 2" è il top-20 dell'unione delle code, non il seguito della pagina 1.
- **Meccanismo**: Stremio chiede skip=20 e riceve item già visti a skip=0 (o salta elementi), a seconda della strategia.
- **Effetto atteso**: caroselli che si ripetono/saltano item; sembra "il catalogo non cambia mai".
- **Falsificazione**: unit test `executeUniversalPipeline` con 2 query mockate, skip=0 e skip=20, assert insiemi disgiunti di ID. Con il codice attuale l'assert fallisce.
- **Fix minima**: passare `skip` a `interleaveMultipleResults` e, per il ramo consensus, introdurre un offset globale stabile (cursore) o calcolare `perQuerySkip` in modo che `slice` parta da `skip % ...`; la soluzione lazy: usare `interleave` anche per il consensus con dedupe e slice(skip).

### H6 — [prob. alta, impatto medio] Nel Seed Network il punteggio ibrido (0–135+) domina lo score VSM (0–10)
- **Evidenza**: `catalogStrategies.js:415`: sort per `(score + hybridScore)`; `calculateHybridScore` (`scoringEngine.js:38-63`) somma posizione (50), `100/2^(peso-1)` (fino a 100) e boost generi (30/15/5). `score` è 0–10.
- **Meccanismo**: l'ordinamento è ≈ "quanti seed lo consigliano + generi top"; il VSM calcolato con chiamate TMDB per 80 candidati conta come tie-break.
- **Effetto atteso**: "La Rete dei tuoi Preferiti" ignora di fatto i topoi; `_yacaMatch` (score*10) non corrisponde all'ordine mostrato.
- **Falsificazione**: unit test con 2 candidati: A `score=10, hybridScore=0`, B `score=0, hybridScore=100` → B viene prima (comportamento attuale). Se l'intento è "VSM-first", il test documenta il bug.
- **Fix minima**: normalizzare `hybridScore` in 0–10 (es. `hybridScore/13.5`) o pesare `score * 0.6 + hybridScore * 0.4` dopo normalizzazione.

### H7 — [prob. alta se il flag è attivo, impatto basso-medio] `hideWatched` è un no-op
- **Evidenza**: `FilterWatched.js:21-22` legge `profile.processedTraktIds`/`processedStremioIds`; il modello `TasteProfile` (`src/models/TasteProfile.js:3-51`) **non ha questi campi** e nessun file li scrive (grep: solo `FilterWatched.js`). `ProfileBuilder` scrive su `WatchHistory`, non su questi array. `hideWatched` non è nemmeno impostabile dal frontend attuale.
- **Effetto atteso**: se un utente ha il flag attivo (config legacy), i titoli già visti restano nei cataloghi; in più `HybridProvider.js:21` e `:42` fanno 3 fetch paralleli inutili.
- **Falsificazione**: unit test `filterWatchedItems` con un profilo costruito da `ProfileBuilder` (array assenti) → nessun item filtrato. Oppure query `WatchHistory` vs catalogo.
- **Fix minima**: popolare i due array in `ProfileBuilder.syncUserHistory`/`syncStremioData` oppure filtrare direttamente da `WatchHistory` (`find({owner, context:'global'})`) in `filterWatchedItems`.

### H8 — [prob. alta, impatto basso-medio] Non-determinismo: `getKeywordsForNodes` campiona 30 keyword a caso
- **Evidenza**: `HierarchicalGraph.js:205`: se >30 keyword → `sort(random).slice(0,30)`. Probe: 25/469 L2 con espansione >30; nodo `t_0` (57 keyword) restituisce set diversi a ogni chiamata. Impatta `fetchSmartAndPool` (`catalogStrategies.js:25-32`, `:159`) e tutte le carte del matchmaker.
- **Effetto atteso**: lo stesso profilo/catalogo produce pool diversi a ogni cache miss; impossibile riprodurre un ordinamento; cache poco efficace.
- **Falsificazione**: test che chiama due volte `getKeywordsForNodes` sullo stesso nodo con >30 keyword e assert di uguaglianza dei set (attualmente fallisce).
- **Fix minima**: sostituire il campione casuale con un taglio deterministico (prime N per frequenza/ordine stabile).

### H9 — [prob. alta, impatto basso] `injectProfilePreferences` trasforma AND in OR sui generi (Live Search)
- **Evidenza**: `AiDiscoveryProvider.js:215-231`: `with_genres` viene splittato con `/[|,]/` e riunito con `|`; una query AI con `with_genres: '35,18'` (AND) diventa `'35|18'` (OR).
- **Effetto atteso**: la Live Search AI restituisce risultati più larghi del richiesto (es. commedie non romantiche).
- **Falsificazione**: unit test con profilo con top genres e filtro `with_genres:'35,18'` → assert che l'output contenga ancora la virgola. Attualmente fallisce.
- **Fix minima**: preservare il separatore originale per il blocco esistente e appendere i generi del profilo con lo stesso operatore (o in un blocco separato).

### H11 — [prob. alta, impatto alto — sintomo guida di Gabriele] Nessuna diversificazione nel top-k (niente MMR/cap di genere)
- **Evidenza**: nessun meccanismo di diversificazione nei percorsi hero. Grep su `src/`: `applyDiversityCaps` (`ProfileScorer.js:309`) è **definita ma mai chiamata** da nessun modulo; nessun riferimento a MMR/diversity fuori da ProfileScorer. `buildFilteredCatalog` ordina per `score` e fa `slice(0,100)` (`catalogStrategies.js:263-270`); `buildHybridCatalog` ordina per `score+hybridScore` e fa `slice(0,100)` (`:413-417`). L'unica mitigazione è `deduplicateByCollection` (solo saghe).
- **Meccanismo**: con H1 attiva lo score è dominato dall'affinità di genere → se il profilo ha 1-2 generi dominanti, i primi 20-100 posti sono tutti dello stesso genere/franchise, e il sottogenere cercato non emerge. Per l'utente: "risultati sempre troppo simili tra loro, anche per sottogeneri diversi".
- **Effetto atteso**: top-k collassato sul genere dominante; `_yacaMatch` quasi identico su tutta la pagina; catalogo percepito come "sempre lo stesso".
- **Falsificazione**: `tests/diag.recommender.h11.diversity.test.js` — (a) pool con 5 item Azione score 9 e 15 item di altri generi score 5 → i primi 5 di `buildTopGenresMixCatalog` devono contenere >1 genere distinto (oggi: tutti Azione, ROSSO); (b) spia su `ProfileScorer.applyDiversityCaps` durante `buildTopGenresMixCatalog` → mai chiamata (oggi, ROSSO).
- **Fix minima**: applicare `applyDiversityCaps` (cap per genere/regista, es. genre:3 director:1) al top-k finale in `buildFilteredCatalog` e `buildHybridCatalog`, oppure un MMR (λ 0.3-0.5) con similarità di genere; riempire la pagina iterando con lo score residuo. Nessun refactor del grafo.

### H10 — [prob. certezza, impatto sul debugging] Documentazione e test sono disallineati dal codice attuale
- **Evidenza**: `docs/ALGORITHMS.md` descrive Two-Tier Scoring in `scoringEngine.js` (che ora ha solo 79 righe, niente Tier1/Tier2), `docs/AI_ENGINE.md` descrive `src/ai/querySynthesizer.js` **che non esiste**, `docs/CATALOG_LOGIC.md` descrive la L2 come MongoDB `CacheEntry` mentre ora è Redis (`src/cache/CacheManager.js:2,80-198`), la skill `yaca-catalog-analyzer` elenca script rimossi (`rebuild_vsm_vectors.js`, `analyze_taste_profile.js`, `test_profile_affinity.js`…). `tests/catalogStrategies.test.js:134` fa `require('../src/ai/querySynthesizer')`; `tests/hybridRecommendations.reviewFixes.test.js` è `describe.skip` e testa `twoTierScore`/`saveScoringData` rimossi.
- **Effetto**: ogni diagnosi futura parte da una mappa falsa; i test verdi non coprono il motore attuale (i test matchmaker passano vacui: `if (!duckDbStore.isInitialized) return;` / `if (cards.length > 0)` in `tests/duckDbAndMatchmaker.test.js:209-275`).
- **Falsificazione**: `npm test` (dopo install) — i test rimossi/rotti emergeranno.
- **Fix minima**: aggiornare i due doc e cancellare i test morti (o marcarli), come già fatto per il codice.

---

## 3. Piano di test senza dati vivi

### 3.1 Fixture già disponibili (nessuna rete, nessun Mongo)
- `.cache/tmdb/master_movies.jsonl` (3500 film, keyword/cast/directors/recommendations) e `.cache/tmdb/movies.parquet` (2.6 MB). **Manca `tv.parquet`.**
- `src/data/hierarchical_graph.json` (1 MB) — usato dai probe.
- Mock già presenti in `tests/catalogStrategies.test.js`, `tests/hybridRecommendations*.test.js`, `tests/profileBuilder.test.js`.

### 3.2 Test jest scrivibili subito (pure JS, nessuna dipendenza esterna)
**STATO: tutti scritti** sul branch `diag/recommender-tests` (un file per ipotesi, mock senza DB). I test "rosso-capaci" falliscono con il codice attuale e documentano il bug; quelli verdi sono harness/sanity.

**Esito esatto (`npx jest tests/diag.recommender`): 9 suite, 22 test → 13 falliti (ROSSI, by design: bug confermati a livello unitario) + 9 passati (verdi).**
Rosso per ipotesi: H1 (1), H3 (2), H3b (2), H5 (2), H6 (1), H7 (1), H8 (1), H9 (1), H11 (2).
Nota ambiente: su questa macchina Windows `node_modules` è vuoto → `npm test` non parte ("jest non è riconosciuto") e le 23 suite pre-esistenti che importano mongoose/duckdb/nanoid/axios falliscono al require; la suite gira con `npx jest` (jest dalla cache npm). Dopo `npm install` vanno rieseguiti: i 13 rossi devono restare rossi (sono il contratto delle fix), le 23 suite devono tornare verdi.

| Test scritto | Ipotesi | Assert rosso-capace |
|---|---|---|
| `tests/diag.recommender.h1.lightMeta.test.js` | H1 | `buildTopGenresMixCatalog` con `getDuckDbCatalogFromPreset` mockato che restituisce light-meta reali (senza `keywords`/`vote_count`): spia su `ProfileScorer.calculateItemMatch` — deve ricevere item con `keywords` e `vote_count` (oggi no, ROSSO) |
| `tests/diag.recommender.h3.matchmakerFallback.test.js` | H3 | `getMatchmakerNextCards` con `duckDbStore.query` e `getDuckDbCatalogFromPreset` mockati a `[]`: deve restituire carte di fallback, non `cards: []` (oggi `[]`, ROSSO) |
| `tests/diag.recommender.h3b.genreMapping.test.js` | H3b | Simulatore DuckDB con riga TV `{"id":10759,"name":"Action & Adventure"}`: `getMatchmakerInitCards('tv', ['Action'], …)` deve dare >0 carte (oggi 0, ROSSO); profilo con top genre film `28` + `buildTopGenresMixCatalog(…, 'series')` non deve svuotarsi nel fallback popolare (oggi fallback, ROSSO) |
| `tests/diag.recommender.h5.pagination.test.js` | H5 | `executeUniversalPipeline` 2-3 query mockate, skip=0 vs skip=20 → insiemi di ID disgiunti (oggi duplicati tra pagine, ROSSO) |
| `tests/diag.recommender.h6.scoringMix.test.js` | H6 | `buildHybridCatalog`: candidato A `score=10, hybridScore=0` vs B `score=0, hybridScore=100` → se l'intento è VSM-first, A deve stare davanti (oggi vince B, ROSSO) |
| `tests/diag.recommender.h7.filterWatched.test.js` | H7 | Profilo reale senza `processed*Ids` + `hideWatched:true`: l'item visto (presente in `WatchHistory`) deve essere filtrato (oggi no-op, ROSSO) |
| `tests/diag.recommender.h8.determinism.test.js` | H8 | Due chiamate a `graph.getKeywordsForNodes` su un nodo L2 con >30 keyword → set uguali (oggi diverso, ROSSO; verificato in plain node su `t_0`: 57 keyword, due call ≠) |
| `tests/diag.recommender.h9.injectProfile.test.js` | H9 | `executeCombinedSearch` con query `with_genres:'35,18'`: i filtri passati a `getDuckDbCatalogFromFilters` devono conservare la virgola (AND), oggi `'35|18|…'` (OR, ROSSO) |
| `tests/diag.recommender.h11.diversity.test.js` | H11 | Top-5 di `buildTopGenresMixCatalog` con pool a genere dominante deve contenere >1 genere distinto (oggi 1, ROSSO); `applyDiversityCaps` mai chiamata (ROSSO) |
| `tests/hybridRecommendations.fallbackCache.test.js` | H4 | Profilo assente → `hybridRecommendationsCache.set` chiamato con gli ID del fallback (vedi `hybridRecommendationsFallback.test.js` esistente; da estendere) |
| `tests/scoringEngine.mix.test.js` | H6 | vedi sopra `diag.recommender.h6` |

Nota: H4 (cache fallback) ha già copertura parziale in `tests/hybridRecommendationsFallback.test.js`; il test dedicato richiede il mock di `cacheInstances` e resta come follow-up minore.

### 3.3 Harness offline con dati locali (richiede `npm install`, modulo `duckdb`)
- Estendere `tests/duckDbAndMatchmaker.test.js` rendendo gli assert **non vacui**: per ogni mood, `getMatchmakerInitCards` deve ritornare >0 carte e i titoli devono appartenere al genere scelto; per ogni combinazione genere×mood contare i nodi a 0 carte (H3).
- `probe_shape.js` (già scritto) per confermare la forma dei light-meta e l'assenza di `vote_count`/`keywords` (H1).
- Probe end-to-end True Blend: profilo fixture con V_final solo-keyword → `buildFilteredCatalog` con `movies.parquet`; l'ordinamento deve correlare con le keyword (H1).
- Nota: `duckDbStore.init()` è pesante (FTS su 3500 righe) ma gira in locale; `tv` restituirà sempre `[]` senza `tv.parquet`.

### 3.4 Cosa serve dai dati reali (e quali dati esattamente)
- **Mongo, read-only** (o export JSON):
  - `tmdbscoringdata`: `countDocuments({})` + 5 sample. Se 0 → **H2 confermata**.
  - `tasteprofiles`: per un utente "deluso", `compiledVectors.V_static`, `V_active`, `V_final` (dimensioni e top key), `syncStatus.lastSync`.
  - `watchhistories`: count per quell'utente (per capire quante interazioni dovrebbero alimentare `V_active`).
  - `recommendationimpressions`: righe per `catalogId` hero (per H4/aging).
  - **Redis (L2, non più Mongo)**: il valore di una chiave `recommendation_cache:<userId>_<context>_<catalogId>[_kids]` (`src/cache/cacheInstances.js:22-27`, `CacheManager._getRedisKey`), per vedere se la pagina è un fallback cachato.
- **Stremio/sessione**: userId + activeProfileId + handle addon; un giro di matchmaker (sequenza swipe) o almeno screenshot; 5-10 esempi di titoli sbagliati con catalogo di provenienza.
- **Dump DuckDB di produzione**: `tv.parquet` (in locale manca) e conferma che `keywords`, `recommendations`, `cast`, `directors` siano popolati come nel dump locale.

---

## 4. Risposte di Gabriele alle 5 domande (20/09, integrate nel doc)

1. **Cataloghi interessati = gli HERO**: Scelti per Te, La Rete dei tuoi Preferiti, Gemme Nascoste, Suggeriti dalla Community. → Fase 2 attacca i percorsi hero (H1/H6/H5/H11/H4); H3/H3b restano per il matchmaker.
2. **Nessun esempio concreto disponibile ora**: giudizio "buono ma non perfetto"; non aspettare esempi per procedere. → Niente blocco sui dati di esempio: si va con test comportamentali + verifica server.
3. **Matchmaker**: non testabile ora. Il problema vero: troppo difficile arrivare a "destinazione" — non trovava ciò che cercava e **i risultati, anche per sottogeneri, erano sempre troppo simili tra loro**. → Sintomo guida: **collasso della diversità nel top-k**. Priorità: H1 (scoring cieco), H6 (hybridScore dominante), H5 (paginazione/interleave) + **H11** (assenza di diversificazione stile MMR nel top-k) — verificata e aggiunta sopra: `applyDiversityCaps` esiste ma non è mai chiamata → causa probabile, scritta come H11.
4. **Niente accesso a MongoDB/Redis** (server down). H2/H4 restano ipotesi: **comandi esatti di verifica pronti in §5**, da eseguire quando il server torna su.
5. **`hideWatched`**: non noto se attivo, non noto cosa togliesse. **I cataloghi prima del refactor DuckDB NON erano meglio** → deprioritizzata la pista "regressione da 73a023d"; H2 (V_active senza writer) resta valida in sé ma **non spiega il peggioramento**. H7 → bassa priorità.

---

## 5. Prossimo passo + comandi pronti per il server (da eseguire quando torna su)

**5.1 Comandi Mongo (read-only):**
```js
// H2 — V_active senza writer: se 0, H2 confermata
db.tmdbscoringdata.countDocuments({})
db.tmdbscoringdata.findOne({})
db.tmdbscoringdata.aggregate([{ $sample: { size: 5 } }])
// Profilo di un utente "deluso": confrontare V_static / V_active / V_final
db.tasteprofiles.findOne({ owner: '<userId>', context: '<profileId>' }, { compiledVectors: 1, syncStatus: 1, lastUpdated: 1 })
// Quante interazioni dovrebbero alimentare V_active
db.watchhistories.countDocuments({ owner: '<userId>' })
// H4 — aging/impressioni sui cataloghi hero
db.recommendationimpressions.find({ catalogId: /^yaca_(true_blend|seed_network|hidden_gems|trakt_filtered)/ }).limit(20)
```

**5.2 Comandi Redis:**
```bash
# H4 — la pagina hero è un fallback cachato? (chiave costruita in cacheInstances.js:22-27)
redis-cli KEYS 'recommendation_cache:*'
redis-cli GET 'recommendation_cache:<userId>_<context>_yaca_true_blend_movies'   # _kids se kidsMode
redis-cli GET 'recommendation_cache:<userId>_<context>_yaca_hidden_gems_movies'
# → confrontare `ids` con un rebuild manuale: se uguali a fetchPopularFallbackIds → H4 confermata
```

**5.3 Altro da Gabriele:**
- Stremio: userId + activeProfileId + handle addon; un giro di matchmaker (sequenza swipe) o screenshot; 5-10 titoli sbagliati con catalogo di provenienza.
- Dump `tv.parquet` di produzione (in locale manca: ogni test su serie è cieco) e conferma che `keywords`/`recommendations`/`cast`/`directors` siano popolati come nel dump locale.

**5.4 Sequenza raccomandata quando il server è su:**
1. Comandi Mongo/Redis §5.1-5.2 → chiudere H2/H4 (e capire se la cache hero serve fallback).
2. `npm install` → `node .scratch/recommender/probe_shape.js` (H1 end-to-end su `movies.parquet`) e test matchmaker non-vacui su DuckDB reale (§3.3).
3. Con i test rossi di questa fase come contratto, applicare le fix minime di H1 → H11 → H6 → H5 → H3b → H3 (in quest'ordine) e guardare i test diventare verdi.
4. Aggiornare `docs/ALGORITHMS.md` / `docs/CATALOG_LOGIC.md` (H10) una volta stabilizzato il codice.

---

## Appendice — comandi eseguiti (tutti read-only)
```
node .scratch/recommender/probe_scoring_effect.js
node .scratch/recommender/probe_scoring_effect2.js
node .scratch/recommender/probe_graph_moods.js
node .scratch/recommender/probe_jsonl_keywords2.js
node .scratch/recommender/probe_jsonl_kwcount.js
node .scratch/recommender/probe_kw_nondeterminism.js
node .scratch/recommender/probe_shape.js        # bloccato: duckdb non installato
git log --oneline -S "saveScoringData" -- src/  # 73a023d = rimozione
```
Nessuna modifica a file tracciati; nessun commit.
