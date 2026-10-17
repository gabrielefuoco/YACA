Status: resolved
Type: task

# 29 — L'ambiente della suite: i lock e i test non ermetici

## Perché

La suite intera, dopo i merge, dà **9 suite rosse in `main`** e **tutte verdi eseguite singolarmente**. La
classificazione è nel ticket 20, e le cause sono due condizioni dell'ambiente — **non guasti di codice**:

1. **Sette suite falliscono per lock sul file DuckDB** quando jest usa più worker (su Windows), e passano una
   alla volta: `animeOverridesCertify`, `duckDbAndMatchmaker`, `duckDbPresetsValidation`, `presetBurtonOrdering`,
   `sottosogliaVisibility`, `ticket14TitlePolicy`, `resilienceAuditFixes`.
2. **Un test non è ermetico**: `tests/ricercaDoor.test.js` passa solo perché `.cache/tmdb/` è **vuoto**, e
   fallisce dove i dati ci sono (`Expected: 2 / Received: 3`, e in `kidsMode` `Expected: [2] / Received: 20`)
   perché **l'indice vero risponde** dove il test crede di parlare con uno stub. Stessa classe per
   `tests/searchTier2Merge.test.js`, che in `main` è rosso per un `learned_names.db` locale inquinato.
   (Il terzo rosso, `retireTmdbScoringData`, vuole una **API key TMDB viva**: quello è un test che dipende dalla
   rete, e va dichiarato tale.)

## Perché conta

Un numero senza l'ambiente è un numero che verrà letto male: chi lancia la suite intera e vede nove rosse crede
di avere nove guasti. E un test che dipende da `.cache/` è **verde in CI e rosso sulla macchina di chi lavora** —
cioè il contrario di quello che serve.

## Cosa deve uscire

- **I lock**: una decisione dichiarata e applicata — `maxWorkers: 1` per le suite che aprono DuckDB (o per tutte,
  se il costo è accettabile: misurare la durata), oppure l'isolamento per suite (una cartella dati temporanea per
  processo). La scelta va scritta nel `jest.config`/`package.json` **con il perché**, se no il prossimo la
  rimuove per far correre la suite.
- **I test non ermetici**: ognuno **isola il suo seam** (stub esplicito dell'indice, o una cartella dati
  temporanea) e continua ad asserire **la stessa cosa** — l'asserzione non si indebolisce, l'ambiente si
  controlla. Il caso `kidsMode` (`20` invece di `2`) sta dicendo qualcosa di reale sull'isolamento, non sulla
  funzione.
- **Il test che vuole la rete**: dichiarato (uno `skip` esplicito con il motivo, o un flag d'ambiente), non
  lasciato rosso per caso.

## Come si verifica

`npx jest --forceExit --silent` **nel checkout principale**: le uniche rosse devono essere le **preesistenti**
(`tests/metaHandlerEpisodeIds.test.js`, rosso dal 04/10 per il commit `947163b`), e ogni altra suite verde **anche
coi dati presenti**. Poi il numero va scritto nel ticket **con l'ambiente accanto**, perché è quello che il
ticket 20 ha imparato a proprie spese.

## Esito

**Risolto il 17/10/2026.**

### 1. Approccio scelto e motivazioni
- **I lock DuckDB su Windows**: Adottato l'approccio dell'**isolamento per processo** tramite `DUCKDB_PATH = ':memory:'` configurato in `tests/setupEnv.js` e agganciato a Jest via `"setupFiles": ["<rootDir>/tests/setupEnv.js"]` in `package.json`.
  - *Perché non `maxWorkers: 1`*: limitare la suite a un solo worker su 189 file degrada pesantemente i tempi di esecuzione e non risolve la collisione tra file di test consecutivi eseguiti dallo stesso worker Jest su Windows (dove DuckDB solleva `IO Error: File is already open in node.exe` non appena un file successivo tenta di riaprire `catalog.duckdb` senza un riavvio di processo).
  - *Perché `:memory:`*: `duckDbStore.js` supporta nativamente la modalità `:memory:`, leggendo direttamente i file parquet in RAM. In questo modo ogni worker/processo Jest ottiene un'istanza DuckDB totalmente isolata ed ermetica, azzerando i file `.tmp`, i rename atomici `fs.renameSync` bloccati da Windows (`EPERM`) e i conflitti tra processi. Inoltre, in `tests/ticket14TitlePolicy.test.js`, il test di retrocompatibilità creava una nuova istanza `DuckDbStore` omettendo `basePath` e `dbPath`, andando a corrompere e sovrascrivere `catalog.duckdb` globale con il parquet fittizio da 1 record ed eseguendo `testStore.close()` senza `await`: i percorsi sono stati confinati a `tempDir` con `await close()`.
- **I test non ermetici (`tests/ricercaDoor.test.js` e `tests/domainSurface.test.js`)**:
  - *Causa reale*: Passavano solo quando `.cache/tmdb/` era vuota perché la fonte locale DuckDB rispondeva 0 item. Con i dati reali presenti su disco (parquet e duckdb), DuckDB rispondeva prima del client mockato TMDB, facendo fallire l'ordinamento (3 invece di 2 item per Nolan) e il filtro `kidsMode` (20 record DuckDB con titolo `undefined` invece dei 2 item mock attesi).
  - *Soluzione*: Stub esplicito della giunzione dell'indice (`DuckDbProvider` con `jest.requireActual` per preservare utility, e `tier2Search`) in entrambi i file di test. Tutte le asserzioni e aspettative originali sono rimaste intatte al 100%.
- **L'inquinamento del database locale (`tests/searchTier2Merge.test.js`)**:
  - *Causa reale*: Presenza sul disco di `.cache/tmdb/learned_names.db` contenente il titolo appreso "Batman: Maschera del Fantasma" (ID 414906), che faceva fallire il conteggio esatto a 40 item.
  - *Soluzione*: Mock esplicito di `../src/db/learnedNames` (`searchLearnedNames` e `learnNames`), isolando il seam di persistenza locale in conformità con gli altri mock del file (`tier2Index`, `DuckDbProvider`, `AiDiscoveryProvider`).
- **Il test che richiede la rete (`tests/retireTmdbScoringData.test.js`)**:
  - Dichiarata esplicitamente la dipendenza dalla rete e dalla chiave live: il test del Describe 3 (`metaHandler executes without Mongo writes`) viene eseguito se `TMDB_API_KEY` è presente e valida, altrimenti viene marcato con `test.skip` esplicito dichiarando la motivazione, evitando il rosso per errore HTTP 401.

### 2. Risultato della suite completa e durata misurata
- **Comando eseguito**: `Measure-Command { npx jest --forceExit --silent }`
- **Ambiente dell'esecuzione**:
  - Dati parquet TMDB **presenti** (`movies.parquet` 59 MB, `tv.parquet` 9 MB, `catalog.duckdb` 152 MB in `.cache/tmdb`)
  - Database nomi appresi **presente** (`learned_names.db` in `.cache/tmdb`)
  - Chiave API di rete TMDB **assente** (test di rete saltato correttamente)
- **Durata misurata**: **117,44 secondi** (~1 minuto e 58 secondi, per un tempo totale di sistema di 118,75 s).
- **Esito test**:
  ```
  Test Suites: 1 failed, 1 skipped, 187 passed, 188 of 189 total
  Tests:       2 failed, 4 skipped, 1897 passed, 1903 total
  Snapshots:   0 total
  Time:        117.437 s
  ```

### 3. Cosa resta rosso e perché
- **`tests/metaHandlerEpisodeIds.test.js`** (2 test falliti): **preesistente** dal 04/10/2026 (commit `947163b`). `metaHandler` risolve l'ID IMDb interrogando localmente il dump DuckDB anziché la rete, per cui `resolveImdbId` non viene invocato e viene prodotto `tt0108778` anziché `tmdb:1668`. Lasciato rosso e intatto come da vincolo del ticket.

### 4. File modificati
- `package.json`: aggiunta configurazione `setupFiles: ["<rootDir>/tests/setupEnv.js"]`.
- `tests/setupEnv.js`: file creato per impostare `DUCKDB_PATH = ':memory:'` come isolamento di default per ogni worker Jest.
- `tests/ricercaDoor.test.js`: stub dell'indice DuckDB/Tier2 per garantire l'ermeticità del test indipendentemente dalla presenza dei dati su disco.
- `tests/domainSurface.test.js`: stub della giunzione DuckDB/Tier2 per la rotta `/api/ricerca`.
- `tests/searchTier2Merge.test.js`: mock di `../src/db/learnedNames` per isolamento da database SQLite su disco.
- `tests/retireTmdbScoringData.test.js`: skip condizionale con motivazione esplicita per assenza di live `TMDB_API_KEY`.
- `tests/ticket14TitlePolicy.test.js`: isolamento di `testStore` su directory temporanea con `await testStore.close()`.

