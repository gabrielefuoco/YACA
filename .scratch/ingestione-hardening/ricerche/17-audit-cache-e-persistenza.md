# 17 — Audit ponytail: cache e salvataggio dati

**Data**: 2026-11-26 · **Metodo**: due audit in parallelo (cache, persistenza) + **verifica mia** dei claim
più costosi. Tutto ciò che è marcato ✅ l'ho controllato sul codice; ❓ è riportato ma non verificato.

Tag: `delete` (via, senza sostituto) · `yagni` (astrazione con un solo uso) · `shrink` (stesse righe, meno)
· `stdlib`/`native` (lo fa già la piattaforma).

---

## Parte 1 — Il meccanismo di cache

### ✅ Trovato e verificato

| # | Tag | Cosa | Prova | Taglio |
|---|---|---|---|---|
| C1 | `delete` | **Lo SWR non esiste.** `set()` scrive sempre `envelope = {v,t,ttl}`, e la lettura fa `envelope.ttl ? 0 : this.swrMs` → `effectiveSwr` è **sempre 0**. `status` può valere solo `fresh`/`miss`: mai `stale`. | `CacheManager.js:186-195`, `:94-96`, `:120-124` | ~30 righe di rami `stale` in `CacheManager` + `swrMs` su 5 istanze |
| C2 | `delete` | **Gestione `stale` nei chiamanti = codice morto**: `meta.js` 25 righe (revalidate in background), `hybridServing`, `pool/index`, `tmdb.js` 4 righe ciascuno. | `src/stremio/meta.js:402-426` | ~60 righe |
| C3 | `delete` | `catalogFallbackCache` e `simulcastDatesCache`: **0 usi** in tutto il repo, ognuna con RAM e TTL da 14 giorni. | `cacheInstances.js:33-40,50-55` | ~12 righe |
| C4 | `yagni` | Tier `'fast'`/`'slow'` di `getCacheConfig`: `catalogTier` **non è letto da nessuno** e nessuno chiama con quei valori. `userConfig.ttl` non è mai impostato. | `CacheManager.js:267-291` | ~20 righe + 2 costanti |
| C5 | `delete` | **`finalMetaCache` esiste due volte**, stessa config e **stesso namespace Redis** (due L1 in RAM per le stesse chiavi L2). L'opzione `instance` serve solo ad aggirare il fatto che `deriva` già la restituisce. | `cache/index.js:7` + `stremio/meta.js:28` | ~4 righe + semplifica 4 call site |
| C6 | `yagni` | `resolveCatalogTtl`: **un solo chiamante** (`catalogHandler.js:291`) per tre `Math.min`. | `cache/index.js:326-336` | ~10 righe |
| C7 | `delete` | `invalida` (alias di `cancella`): 0 usi. `options.useRam`: nessun chiamante lo passa. `mongoTtlMs`: alias di compatibilità. | `cache/index.js:342`, `CacheManager.js:41-44,183-193` | ~8 righe |
| C8 | `stdlib` | `requestHash.js`: loop manuale di ordinamento chiavi. `JSON.stringify(obj, Object.keys(obj).sort())` fa lo stesso. | `requestHash.js:29-36` | ~8 righe |
| C9 | `shrink` | I 5 wrapper `async _l1*` sono `async` attorno a metodi sincroni di `LRUCache`; `_l1Set` ignora il suo parametro `ttlMs`. | `CacheManager.js:62-80` | ~20 righe |

### ❓ Riportato, non verificato (da controllare prima di tagliare)

- `movieMetaCache`/`seriesMetaCache`/`aiDiscoveryCache` "0 letture" (`src/clients/tmdb.js:90-91`).
- `cachedProfileShelves` (Map illimitata, 55 righe) accanto a `shelvesCache` nello stesso posto: `src/pool/index.js:46-125`.
- 6 cache ad-hoc che duplicano `CacheManager`/`LRUCache`: `idMapping.js:4`, `impressions.js:24`, `duckDbStore.js:47`, `graphClient.js:19`, `ProfileScorer.js:30`, `catalogKind.js:37`.
- TTL in conflitto per lo **stesso** dato: meta film/serie dichiarati in 4 posti diversi (14g/6h vs 30g/7g/60g vs `undefined`→1g vs 1h RAM/24h Redis).

**Nota**: `snapshotDaArtefatto` (RAM + single-flight) fa lo stesso lavoro del L1 di `CacheManager` per 3
artefatti. Sostituirlo non conviene: un artefatto ha una sua politica (`keepLastKnown`), e
`CacheManager` non la esprime. **Da tenere.**

---

## Parte 2 — Salvataggio dei dati

### ✅ Verificato

| # | Tag | Cosa | Prova | Taglio |
|---|---|---|---|---|
| P1 | `delete` | `report.json` del prefill: scritto, **letto da nessuno** (l'unico altro riferimento è il GC che lo esclude). | `posters/erdb/build.js:362-366` | ~15 righe |
| P2 | `delete` | Campi di sidecar **mai letti**: `ita_annotations.meta.json` (`schemaVersion`, `generatedAt`, `source`, `file`, `counts.rows/null` — solo `counts.true` è letto), `versioni.json` (`schemaVersion`, `convenzione`), `cursor.json` (`mediaType`, `index` fuori dal cold start), `dump_status.json` (`stats`/`lastSync`/`updatedAt` duplicano `fs.statSync` sugli artefatti). | `writer.js:111,133`, `volumeContract.js:150`, `tmdbDumpStore.js:390` | ~30 righe |
| P3 | `delete` | `UserCredentials` (modello) e `UserAccount.passwordHash`: compaiono **solo in commenti**. L'auth usa `/api/login` di Stremio. | `models/UserCredentials.js`, `UserAccount.js:19-20` | ~30 righe |
| P4 | `delete` | Campi Mongo senza lettori: `TasteProfile.flatnessMetrics`/`signatureTitles`/`compiledVectors.clustersMeta`, `AddonConfig.dna`, `profiles[].settings.erdbConfig`/`fastPresetRefresh`, `UserLibraryItem.temp`. | `models/TasteProfile.js:22-54`, `AddonConfig.js:101-158`, `UserLibraryItem.js:18` | ~40 righe |
| P5 | `delete` | `ensureIndexesSafe`/`getModel()`: Mongoose crea gli indici da solo e il modello è già esportato. | `UserLibraryItem.js:46-55`, `WatchHistory.js:34` | ~15 righe |
| P6 | `shrink` | `writeAtomic(path, data)` unico al posto di **10+ copie** di `.tmp` + `renameSync`. | `tmdbDumpStore:230`, `convert_to_parquet:127`, `tier2:23`, `writer:127`, `diff:391`, `indici:248`, `volumeContract:54`, `sorgenti:111`, `drenaPoster:177`, `erdb/build:265` | ~60 righe, e un bug corretto in un posto solo |
| P7 | `stdlib` | 5 lettori JSONL artigianali (split a chunk, gestione riga parziale) → `readline.createInterface`, che è già usato altrove nel repo. | `tier1Promotion.js:206-226`, `tmdbDumpStore.js:49-80`, `itaAnnotations.js:66-92` | ~50 righe |
| P8 | `yagni` | `snapshotDaArtefatto`: export `getCache`/`setSnapshot`/`'vuotoERitenta'` senza chiamanti (3 chiamanti reali in tutto). | `snapshotDaArtefatto.js:72-119` | ~12 righe |

### ❌ Respinti (sono redesign, non tagli)

- **"Togliere `master_*.jsonl` + spool e far gestire la tabella a DuckDB"**: è ricostruire la pipeline
  (e perdere il file append-only che rende possibile il resume del cold start). Non è un audit, è un
  progetto con una sua mappa.
- **"Inlinare i 4 moduli della macchina a stati (515 righe) in 25"**: `conversionStateMachine` **è usata**
  da `src/library/index.js:70` ed è il contratto dichiarato del dominio. Da valutare in una mappa, non qui.
- **"Togliere `sorgenti.json`"**: serve al **drenatore** per ricostruire il nome del file che il formatter
  chiederà; senza, scriverebbe orfani e la rotta resterebbe in 404 (verificato il 25/11). Si può discutere
  di leggerlo da DuckDB, ma è una sostituzione, non una cancellazione.
- **"Togliere la tabella `anime_mappings` in DuckDB"**: è ciò che rende il filtro anime una query invece di
  un ramo nel codice. Tenerla.

---

## Parte 3 — Le fonti di verità duplicate (la lezione vera)

Questa è la parte che ci è costata giorni: lo stesso fatto salvato in più posti, ognuno con il suo TTL e la
sua strada di aggiornamento. Ordinate per quanto sarebbe bello ridurle.

| Fatto | Copie | Cosa terrei |
|---|---|---|
| **Doppiato ITA** | `ita_annotations.jsonl` · colonna `ita` del parquet · colonna `ita` in DuckDB (live sync) · `Map` in RAM | **file + RAM**. Il live sync in DuckDB compra < 1 ora (il daemon ri-converte ogni ora) e ci ha già regalato il caso WAL/`CHECKPOINT`. Candidato serio a sparire → riapre il ticket 06, decisione tua. |
| **Catalogo TMDB** | `master_*.jsonl` + spool · `*.parquet` · `catalog.duckdb` · `tier2_titles.parquet` + `titles_fts5.db` | tutti servono a qualcosa (sorgente, analitica, ricerca). Ma `tier2_titles.parquet` è **derivato due volte**: si può ricostruire dai parquet invece di tenerlo. |
| **Token della locandina** | `poster_path` in JSONL/parquet/DuckDB · `sorgenti.json` + RAM | `sorgenti.json` serve solo al drenatore: **tenerlo**, ma i suoi export `leggiMappa`/`scriviToken` sono usati solo dai test. |
| **ID anime (kitsu↔tmdb)** | `anime-mappings.json` · Map/Set in RAM · tabella `anime_mappings` in DuckDB | artefatto + tabella: la RAM è una cache dell'artefatto. Nessun taglio evidente. |
| **Token/status Trakt** | `UserAccount.apiKeys.trakt*` + `traktStatus` · `UserAccount.trakt.*` (doppia scrittura) | una sola forma, la più recente. |
| **UI state / ordine libreria** | collezioni `ProfileUiState`/`UserLibraryOrder` · specchiati in `AddonConfig.profiles[].raw_ui_state` / `raw_ui_state.libraryOrder` | le collezioni; `raw_ui_state` è un mirror. |
| **`syncStatus` / `lastSync` / `dna`** | `AddonConfig` · `TasteProfile` · `profiles[].settings` | `AddonConfig.syncStatus`, `config.lastStremioSync`, `TasteProfile.compiledVectors`. |
| **Freschezza del dump** | `dump_status.json` · `fs.statSync` sugli artefatti · `cursor.completed` | gli stat: sono l'unica verità non modificabile a mano. |

---

## Conto finale

| Gruppo | Righe | Rischio |
|---|---:|---|
| C1-C9 (cache) | **~170** | basso: sono rami morti o doppioni, con test a copertura del comportamento servito |
| P1-P8 (persistenza) | **~250** | basso per P1/P2/P4/P5/P8, medio per P3 (auth) e P6/P7 (toccano scritture su disco) |
| **Totale tagliabile con evidenza** | **~420 righe** | — |
| Riportato ma non verificato (C10-C13, P9-P12) | ~200 | da verificare prima |

Il `net: -1545` del report di persistenza include i redesign (JSONL→DuckDB, macchina a stati): senza quelli
il numero onesto è **~420 righe**.

## Cosa farei, in ordine

1. **C1+C2** (SWR morto, ~90 righe): è il taglio con più valore perché toglie una *promessa* che il codice
   non mantiene — chi legge crede che esista il revalidate in background.
2. **C3+C5+C6+C7** (~50 righe): istanze e opzioni morte, zero comportamento toccato.
3. **P1+P2+P4+P5** (~100 righe): sidecar e campi che nessuno legge.
4. **P6** (`writeAtomic`, ~60 righe): non è solo un taglio, è un bug in meno — oggi ci sono 10 copie della
   stessa scrittura atomica, ognuna con la sua gestione degli errori.
5. **P3** (auth): prima di toccare un modello di credenziali, una verifica a mano su Mongo.
