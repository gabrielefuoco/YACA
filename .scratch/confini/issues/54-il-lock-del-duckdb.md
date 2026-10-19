Status: ready-for-agent
Type: task

# 54 — Il lock del DuckDB: il daemon costruisce e **scambia**, l'app non apre mai un file in scrittura

## Perché (misurato in produzione il 19/10/2026)

App e daemon del dump aprono **lo stesso file** `/data/tmdb/catalog.duckdb`. DuckDB ammette un solo scrittore:
quando il daemon sta costruendo, l'app non riesce ad aprire il database persistente e **ricostruisce tutto da
parquet**, in RAM. Nei log:

```
[DuckDB Store] Database persistente esistente non valido o corrotto
  (IO Error: Could not set lock on file "/data/tmdb/catalog.duckdb": Conflicting lock is held in PID 0)
  Ricostruzione da zero...
```

**Il costo, misurato sullo stesso container:**
- boot con il DB persistente riaperto: `10:01:29.55` → `10:01:31.94` = **~2,4 s**
- boot con il lock conteso (ricostruzione da parquet): **~9,3 s**

Non è una regressione del ticket 34 (la separazione del daemon è giusta) ma è **l'effetto collaterale** che il
ticket 30 aveva previsto: *«il boot deve restare ~1,6 s, non tornare a 18»*. Il degrado è **corretto** (l'app
funziona, ricostruisce), ma succede **ogni volta che i due coincidono** — cioè a ogni riavvio dell'app mentre il
daemon gira, che è la norma.

## La decisione (già presa: non è una domanda aperta)

**Il daemon costruisce su un file nuovo e lo scambia in modo atomico.** L'app non deve mai aprire un file che
qualcuno sta scrivendo — è la stessa idea dell'artefatto anime (`writeMappingIndexAtomic` in
`services/anime-source/src/mappingIndex.js`) e del pattern `_ctime`/rename già usato altrove nel repo.

Le alternative sono **scartate**, e va detto perché:
- *DuckDB in sola lettura per l'app*: **non risolve**. In DuckDB una connessione read-only non può convivere con
  uno scrittore che tiene il lock: il conflitto resterebbe.
- *Solo un retry con attesa*: se il daemon costruisce per minuti, un retry di pochi secondi non basta e si
  ricostruisce da parquet lo stesso. Va bene **come rete di sicurezza**, non come soluzione.

## Cosa deve uscire

1. **La build del daemon su un file temporaneo + scambio atomico.** `src/indice/duckDbStore.js` ha già
   `this.dbPath = process.env.DUCKDB_PATH || path.join(this.basePath, 'catalog.duckdb')`: la strada è costruire
   con `DUCKDB_PATH=<basePath>/catalog.duckdb.new`, chiudere (il daemon già chiude subito dopo la build,
   `services/tmdb-daemon/tmdbDumpDaemon.js:105-108`), e **rinominare** `catalog.duckdb.new` → `catalog.duckdb`.
   La funzione di scambio sta dove sta il file: nell'indice, non nel daemon (il daemon non deve conoscere i
   percorsi interni — decisione 31/53).
2. **L'app non apre mai un file in scrittura.** Dopo lo scambio si apre il DB completo. Se lo scambio fallisce a
   metà (crash fra rename e riapertura), l'app deve **degradare dichiaratamente** come fa oggi (ricostruzione da
   parquet + il log che c'è già), non rompersi.
3. **La rete di sicurezza**: sul conflitto di lock l'app **ritenta** l'apertura persistente per un tempo breve e
   **limitato** (es. 3 tentativi / ~10 s) prima di ricostruire. Non è la soluzione, è il paracadute.
4. **La prova che il conflitto non c'è più**: una sonda eseguibile che (a) costruisce un DB temporaneo, (b) lo
   scambia, (c) apre il DB dal lato "app" e verifica che **non** compaia `Conflicting lock`. Va **committata**
   (`scripts/qa/`), se no la misura vive nella prosa.

## La prova (da incollare nell'Esito)

- La sonda sopra, eseguita: nessun `Conflicting lock`, il DB si apre.
- `npx jest --forceExit` con la **baseline misurata**: `main` fa **5 suite fallite / 8 test falliti / 1881
  passati** (188 suite); le sole ammesse sono `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`,
  `duckDbAndMatchmaker`, `presetBurtonOrdering`. **Lista `FAIL` e totali**, non un sottoinsieme.
- I due hash del manifest invariati: `buildManifest({})` = `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178`,
  `buildRootManifest()` = `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`.
- `node scripts/qa/probe-hero-counts.js --fixture` → 9 titoli per medium, disgiunti.

## Le trappole di questo repo (leggi prima di toccare)

- **`module.exports === indice`** in `src/indice/index.js`: un wrapper omonimo è ricorsione infinita. Un metodo che
  esiste già sull'istanza non va incapsulato (o si usa `bind`).
- **I mock di Jest**: ripuntare un import da un modulo mockato a uno non mockato fa tornare il modulo mockato
  **parziale**. Quando tocchi un percorso, esegui le suite che mockavano il vecchio.
- **I path relativi** dopo uno spostamento: `node -e "require('<file>')"` su ogni file toccato (`process.exit(0)`).
- **Un `node -e` che carica il prodotto non esce da solo**: chiudi sempre con `process.exit(0)`.
- **Non toccare `frontend/**`**, niente `git push`, niente `npm run build` / `tsc`.

## Quando è chiuso

Appendici un `## Esito` in italiano: cosa è stato costruito e dove, la prova eseguita col suo output, la lista
`FAIL` e i totali, i due hash, e cosa **non** hai fatto. Lascia `Status: ready-for-agent`: chiude l'integratore.
