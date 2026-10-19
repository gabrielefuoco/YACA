Status: ready-for-agent
Type: task

# 59 — Dopo lo scambio il DuckDB, l'app deve accorgersene e riaprire

## Il problema (conseguenza del ticket 54, non una sua regressione)

Il ticket 54 ha dato al daemon la build su staging + **scambio atomico** (`fs.renameSync`), e ha tolto il
conflitto di lock. Ma ne resta uno **speculare**, che va chiuso qui:

l'app tiene il database aperto **per tutta la vita del processo**. Dopo uno scambio, `rename()` cambia il
**percorso**, ma l'app continua a leggere **il vecchio inode**: serve il catalogo di **prima** finché non riavvia.
Prima del 54 il lock la costringeva a ricostruire da parquet — **lento (9,3 s) ma fresco**. Ora è **veloce ma
vecchio**.

**La frequenza**: il daemon ricostruisce quando il parquet è stantio — cioè dopo ogni dump, **una volta al
giorno**. E l'app riavvia solo sui deploy: quindi può servire un catalogo **vecchio di giorni** senza che nulla lo
segnali. È esattamente il tipo di degrado silenzioso che questa mappa combatte.

## La decisione (già presa: non è una domanda)

**L'app se ne accorge e riapre.** Il meccanismo è quello che l'indice ha già: un confronto d'identità del file.

1. **Al momento dell'apertura** lo store memorizza l'identità del file che ha aperto: `{ mtimeMs, size }` di
   `dbPath` (`fs.statSync`).
2. **Prima di servire una query** (i punti d'ingresso: `query`, `queryRaw`, `getById`, `getMetaDetails`,
   `getCatalogFrom*`, `candidati` — cioè dove si legge davvero), lo store confronta l'identità corrente con quella
   memorizzata. Se è **cambiata**, chiude e **riapre** (usando il retry del ticket 54, che già gestisce un lock
   transitorio) e **lo logga**: `[DuckDB Store] Database scambiato: riaperto`.
3. **Il confronto è limitato nel tempo** (throttle, es. non più di una `statSync` ogni 10 s): una `statSync` per
   query sarebbe comunque economica, ma il throttle tiene il percorso caldo leggibile e non introduce sorprese.
4. **La riapertura avviene fra due query**, mai dentro una: il vecchio handle si chiude solo quando non c'è una
   query in volo su di esso.

### Cosa NON va fatto, e perché

- **Non** si tocca il file dal lato app (niente `unlink`, niente `rename`): lo scambio è del daemon.
- **Non** si mette un `setInterval` che ricarica il DB a orologio: un timer che ricarica senza che nessuno abbia
  chiesto niente è un costo fisso e un rischio di ricariche inutili. Si ricarica **quando serve**, cioè alla prima
  lettura dopo il cambio.
- **Non** si riavvia l'app dal daemon: il daemon non comanda il ciclo di vita di un altro servizio.

### Le scritture dell'app: verificate, non si perdono

Il timore era: *le scritture dell'app vanno sul vecchio inode e si perdono*. **Verificato: non è così.**
- la **promozione Tier 2 → Tier 1** scrive nel **JSONL** (`master_movies.jsonl` / `master_tv.jsonl`, solo append:
  `src/indice/tier1Promotion.js`), **non** nel DuckDB, e il DuckDB è **derivato** da lì;
- `anime_mappings` è **derivato** dall'artefatto anime, ricostruito al boot;
- quindi ciò che l'app scrive nel DuckDB è **tutto ricostruibile**, e uno scambio non distrugge nulla di durevole.

## La prova (da incollare nell'Esito)

1. **Una sonda committata** (`scripts/qa/`), che estende quella del ticket 54: apre il DB dal lato app, scrive una
   riga riconoscibile, **scambia** il file con uno che contiene una riga diversa, poi esegue una query **dal lato
   app** e verifica che veda **la riga nuova** — senza riavviare il processo. Se non riapre, la sonda deve
   **fallire**.
2. **La prova che la sonda è vera**: disattivando la riapertura, la sonda deve cadere (il repo pretende il test che
   *sarebbe fallito*).
3. `npx jest --forceExit` con la baseline misurata: `main` fa **5 suite fallite / 8 test falliti / 1881 passati**
   (188 suite); le sole ammesse: `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`,
   `duckDbAndMatchmaker`, `presetBurtonOrdering`. Lista `FAIL` e totali.
4. I due hash del manifest invariati: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` /
   `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`.
5. `node scripts/qa/probe-hero-counts.js --fixture` → 9 titoli per medium, disgiunti.
6. **La sonda del ticket 54 resta verde**: `node scripts/qa/probe-duckdb-lock.js` → `SUCCESSO`.

## Trappole di questo repo (già pagate)

- **`module.exports === indice`** in `src/indice/index.js`: un wrapper omonimo è ricorsione infinita; un metodo che
  esiste sull'istanza non va incapsulato (o si usa `bind`).
- **I mock di Jest**: ripuntare un import da un modulo mockato a uno non mockato fa tornare il modulo mockato
  **parziale**. Quando tocchi un percorso, esegui le suite che mockavano il vecchio.
- **`tests/setupEnv.js` forza `DUCKDB_PATH=':memory:'`**: nei test il DB è in memoria e **non c'è file da
  osservare** → la riapertura deve essere un **no-op pulito** in quel caso, senza eccezioni.
- **Un `node -e` che carica il prodotto non esce da solo**: chiudi con `process.exit(0)`.
- Niente `frontend/**`, niente `git push`, niente `npm run build` / `tsc`.

## Quando è chiuso

Appendici un `## Esito` in italiano: dove sta la riapertura, la sonda e il suo output (e la prova che fallisce se
la si disattiva), la lista `FAIL` e i totali, i due hash, cosa **non** hai fatto. Lascia `Status: ready-for-agent`:
chiude l'integratore.

## Esito

### 1. Dove risiede la riapertura
La logica di rilevamento dello scambio atomico e riapertura automatica del DuckDB risiede in:
- `src/indice/duckDbStore.js`:
  - `this.fileIdentity`: memorizzazione di `{ mtimeMs, size }` all'apertura del database persistente (`_recordFileIdentity`); pulito/no-op per `:memory:`.
  - `this.lastIdentityCheckTime` e `this.checkIntervalMs` (10 000 ms di default): throttle del confronto tramite `fs.statSync` per mantenere freddo il percorso critico.
  - `this.activeQueries` e `this._zeroActiveQueriesWaiters`: contatore delle query in volo per garantire che la chiusura e riapertura avvenga rigorosamente *fra* due query e mai *durante* una query in esecuzione.
  - `ensureFreshHandle(forceCheck, options)`: metodo di guardia invocato all'ingresso di `query()`, `queryRaw()` e `updateAnimeMapping()`. Se il file sul disco ha `mtimeMs` o `size` diversi rispetto all'identità memorizzata, attende lo svuotamento delle query in volo, chiude l'handle stantio e riapre il database persistente con il meccanismo di retry con backoff esponenziale già consolidato nel ticket 54.
  - Log obbligatorio emesso alla riapertura: `[DuckDB Store] Database scambiato: riaperto`.
  - Chiusura dell'handle (`_closeDb`): rilascio forzato del descrittore di file nativo DuckDB (inclusa la pulizia garbage collection / buffer V8 per evitare lock residui su piattaforme Windows NT).
- `src/indice/index.js`:
  - Esportazione ed esposizione di `ensureFreshHandle` legata con `.bind(indice)` su `IndiceModule` e `module.exports`, garantendo che tutti i punti di lettura (`query`, `queryRaw`, `getById`, `getMetaDetails`, `getCatalogFrom*`, `candidati`) beneficino della riapertura trasparente senza ricorsione o rottura dei mock.

### 2. Sonda QA e Dimostrazione di Veridicità
È stata aggiunta e committata la sonda `scripts/qa/probe-duckdb-reopen.js`.
La sonda crea un catalogo iniziale con una riga A (100001), apre il DB con l'app, fa compilare al daemon un nuovo DB con riga B (100002) su staging (`.new`), esegue lo swap atomico e verifica che l'app veda la riga nuova e riceva il log di riapertura senza riavviare il processo.

#### Output Verifica Normale (`node scripts/qa/probe-duckdb-reopen.js`):
```text
=======================================================
[SONDA QA] Riapertura Automatica DuckDB Dopo Scambio (Ticket 59)
Modalità: VERIFICA NORMALE (Riapertura Attiva)
=======================================================

--- (a) Creazione DB iniziale da parte del daemon con Riga A (100001) ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Attenzione: File Parquet non trovati in C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408830476.
[DuckDB Store] DuckDB è avviato in memoria vuota. Per favore attendi la fine del sync o lancia scripts/convert_to_parquet.js
[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.
[HierarchicalGraph] Grafo gerarchico caricato in RAM con successo.
[DuckDB Store] Swap atomico completato con successo: C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408830476\catalog.duckdb.new -> C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408830476\catalog.duckdb
[Probe] Database iniziale creato su target con riga 100001.

--- (b) L'App apre il database persistente e verifica la riga iniziale ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Attenzione: File Parquet non trovati in C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408830476.
[DuckDB Store] DuckDB è avviato in memoria vuota. Per favore attendi la fine del sync o lancia scripts/convert_to_parquet.js
[DuckDB Store] Database persistente valido riaperto con successo da C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408830476\catalog.duckdb.
[Probe] App inizializzata: riga iniziale 100001 letta correttamente (mtime: 1792408830615.8225, size: 798720).

--- (c) Daemon compila nuovo catalogo su staging (.new) con Riga B (100002) e scambia ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Attenzione: File Parquet non trovati in C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408830476.
[DuckDB Store] DuckDB è avviato in memoria vuota. Per favore attendi la fine del sync o lancia scripts/convert_to_parquet.js
[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.
[Probe] Daemon ha terminato la build su staging (.new).
[DuckDB Store] Swap atomico completato con successo: C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408830476\catalog.duckdb.new -> C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408830476\catalog.duckdb
[Probe] Daemon ha completato lo swap atomico: targetDbPath contiene ora il nuovo catalogo.

--- (d) Esecuzione query dal lato App senza riavviare il processo ---
[DuckDB Store] Database scambiato: riaperto

[Probe] Risultati con riapertura automatica attiva:
  - Log riapertura intercettato: SÌ
  - Riga nuova (100002) trovata: SÌ
  - Riga vecchia (100001) rimossa: SÌ

=======================================================
Esito Sonda: SUCCESSO — l'app riapre dopo lo scambio e serve dati freschi.
=======================================================
```

#### Output Dimostrazione Fallimento con Riapertura Disattivata (`node scripts/qa/probe-duckdb-reopen.js --disable-reopen`):
*(Exit code: 1)*
```text
=======================================================
[SONDA QA] Riapertura Automatica DuckDB Dopo Scambio (Ticket 59)
Modalità: DIMOSTRAZIONE FALLIMENTO (Riapertura Disattivata)
=======================================================

--- (a) Creazione DB iniziale da parte del daemon con Riga A (100001) ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Attenzione: File Parquet non trovati in C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408838415.
[DuckDB Store] DuckDB è avviato in memoria vuota. Per favore attendi la fine del sync o lancia scripts/convert_to_parquet.js
[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.
[HierarchicalGraph] Grafo gerarchico caricato in RAM con successo.
[DuckDB Store] Swap atomico completato con successo: C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408838415\catalog.duckdb.new -> C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408838415\catalog.duckdb
[Probe] Database iniziale creato su target con riga 100001.

--- (b) L'App apre il database persistente e verifica la riga iniziale ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Attenzione: File Parquet non trovati in C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408838415.
[DuckDB Store] DuckDB è avviato in memoria vuota. Per favore attendi la fine del sync o lancia scripts/convert_to_parquet.js
[DuckDB Store] Database persistente valido riaperto con successo da C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408838415\catalog.duckdb.
[Probe] App inizializzata: riga iniziale 100001 letta correttamente (mtime: 1792408838550.4697, size: 798720).

--- (c) Daemon compila nuovo catalogo su staging (.new) con Riga B (100002) e scambia ---
[DuckDB Store] Inizializzazione in corso...
[DuckDB Store] Attenzione: File Parquet non trovati in C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408838415.
[DuckDB Store] DuckDB è avviato in memoria vuota. Per favore attendi la fine del sync o lancia scripts/convert_to_parquet.js
[DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo.
[Probe] Daemon ha terminato la build su staging (.new).
[DuckDB Store] Swap atomico completato con successo: C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408838415\catalog.duckdb.new -> C:\Users\gabri\APP\.YACA.worktrees\activity-t59-riapertura-mvf4vj8w\.cache\tmdb_probe_reopen_1792408838415\catalog.duckdb
[Probe] Daemon ha completato lo swap atomico: targetDbPath contiene ora il nuovo catalogo.
[Probe] Riapertura automatica app DISABILITATA per testare il fallimento.

--- (d) Esecuzione query dal lato App senza riavviare il processo ---

[Probe] Risultato con riapertura disattivata:
  - Riga nuova (100002) vista: NO (previsto: continua a leggere il vecchio inode)
  - Riga vecchia (100001) ancora presente: SÌ
  - Log di riapertura emesso: NO

=======================================================
Esito Sonda: FALLIMENTO DIMOSTRATIVO ACCERTATO — senza riapertura l'app resta stantia.
=======================================================
```

### 3. Baseline Jest (`npx jest --forceExit`)
```text
Summary of all failing tests
FAIL tests/animeOverridesCertify.test.js
FAIL tests/presetBurtonOrdering.test.js
FAIL tests/donghuaCatalog.test.js
FAIL tests/candidateProvider.test.js
FAIL tests/duckDbAndMatchmaker.test.js

Test Suites: 5 failed, 183 passed, 188 total
Tests:       8 failed, 1 skipped, 1881 passed, 1890 total
Snapshots:   0 total
Time:        43.635 s
```
Le sole suite fallite corrispondono esattamente alla baseline attesa (5 suite / 8 test falliti / 1881 passati).

### 4. Hash del Manifest Invariati
- `buildManifest({})` SHA-256: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (invariato)
- `buildRootManifest()` SHA-256: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (invariato)

### 5. Prove Concorrenti e Non-Regressione
- `node scripts/qa/probe-hero-counts.js --fixture`:
  ```text
  Esito Sonda:
  - Film : 9 titoli (Disgiunti: true)
  - Serie: 9 titoli (Disgiunti: true)
  ```
- Sonda Ticket 54 (`node scripts/qa/probe-duckdb-lock.js`):
  ```text
  Esito Sonda: SUCCESSO — nessun Conflicting lock, il DB si apre.
  ```

### 6. Cosa NON è stato fatto
- Non si tocca il file dal lato app (`unlink`, `rename`): lo swap è esclusivo del daemon.
- Nessun `setInterval` a orologio per ricaricare su base temporale fissa.
- Nessun riavvio del processo dell'app dal daemon.
- Nessuna modifica a percorsi o file riservati ad altri ticket paralleli (`src/pool/index.js`, `src/stremio/hybridServing.js`, `src/clients/graphClient.js`).
- Nessun `git push`, nessun `npm run build` o compilazione `tsc`, nessun file toccato in `frontend/**`.

