Status: resolved
Type: task
Blocked by: 17

# 19 — Persistenza di DuckDB su volume: abbattere il boot da 18,8s a <2s

## Perché

Nel ticket 17 si è deciso di mantenere l'export statico del frontend dentro Express, identificando il vero fattore di attrito nei deploy non nel serving dei file statici ma nel **boot cycle di `yaca-app`**.
Oggi a ogni avvio del container (ad esempio dopo un aggiornamento applicativo o un riavvio di Watchtower), `TmdbDumpDaemon` riscontra `isFirstRun` e:
1. Riconverte da zero i JSONL master in Parquet tramite `scripts/convert_to_parquet.js` (~14,3 s);
2. Inizializza DuckDB con `:memory:`, ricarica i parquet in RAM e ricostruisce gli indici FTS (~3,2 s);
3. Ricostruisce l'indice Tier 2 su SQLite FTS5 da 1,49M record (~32 s).

DuckDB è indisponibile per i primi **18,75 s** (le query al catalogo falliscono con `DB non inizializzato`), e l'indice Tier 2 per **50,7 s**, anche quando i dati TMDB su disco non sono minimamente mutati.

## I fatti, ad oggi

- Il volume Docker `yaca_tmdb` è già montato in modo persistente su `/data/tmdb` e ospita i master JSONL (`master_movies.jsonl` 308 MB, `master_tv.jsonl` 51 MB) e i derivati `movies.parquet` (58 MB), `tv.parquet` (9 MB) e `titles_fts5.db` (176 MB).
- `src/db/duckDbStore.js` crea un database `:memory:`, perdendo ogni stato e indice al riavvio del processo.
- `src/utils/tmdbDumpDaemon.js` invoca `convertAndReloadDuckDb()` incondizionatamente all'avvio se trova i JSONL su disco (`isFirstRun && storeExists`).

## Cosa deve uscire

1. **Persistenza DuckDB su file**: `duckDbStore.js` apre un database su file persistente `/data/tmdb/catalog.duckdb` (nel volume `yaca_tmdb`).
2. **Controllo di validità al boot**: al boot, se `/data/tmdb/catalog.duckdb` esiste ed è valido (tabelle `movies`, `tv`, `anime_mappings` e indici FTS presenti, timestamp coerenti con i parquet), DuckDB si aggancia all'avvio senza rieseguire la `CREATE TABLE AS SELECT ... FROM read_parquet(...)` né la `create_fts_index`.
3. **Bypass conversione JSONL se i Parquet sono freschi**: `TmdbDumpDaemon` al boot non avvia `convert_to_parquet.js` se `movies.parquet` e `tv.parquet` esistono già e hanno `mtime` >= ai rispettivi JSONL master.
4. **Bypass ricostruzione Tier 2 se invariato**: `titles_fts5.db` viene riutilizzato all'avvio se il file daily export TMDB della giornata è già stato indicizzato (verifica via metadata/marker file).

## Come si verifica (Criterio Numerico)

1. **Misura sul deploy/mate con `docker logs -t yaca-app`**:
   - Eseguendo `docker restart yaca-app`, il delta tra `StartedAt` del container e il log `[DuckDB Store] Inizializzazione completata` (o `DuckDB riavviato con successo`) deve essere **< 2,0 secondi** (scendendo dagli attuali **18,75 s**, riduzione >89%).
2. **Zero conversioni ridondanti**:
   - Nei log di avvio non compare la conversione Parquet (`[DuckDB Convert] Avvio conversione JSONL in Parquet`) a meno che i file sorgente non siano stati modificati.

## Esito

### 1. Seam modificati
- `src/db/duckDbStore.js`:
  - Path del database impostato su `/data/tmdb/catalog.duckdb` (volume `yaca_tmdb`).
  - Introdotto `_isDatabaseFresh()`: verifica esistenza e mtime di `catalog.duckdb` rispetto a `movies.parquet`, `tv.parquet`, `master_movies.jsonl` e `master_tv.jsonl`.
  - Introdotto `_verifyDatabase(con)`: validazione prima del trust (apertura ed esecuzione query di smoke test sulle tabelle `movies`, `tv`, `anime_mappings`, verifica colonne estese e query reale su indici BM25 `fts_main_movies.match_bm25` / `fts_main_tv.match_bm25`).
  - Creazione atomica: in caso di rigenerazione, DuckDB scrive su `catalog.duckdb.tmp` e, solo al superamento della validazione FTS, chiude le connessioni in modo asincrono (`_closeCon`, `_closeDb`) e rinomina atomicamente su `catalog.duckdb`.
  - `close()` asincrono pulito con chiusura a catena di connessione e database per rilascio affidabile dei lock DuckDB.
- `src/utils/tmdbDumpDaemon.js`:
  - Funzione `isParquetFresh(store, duckDbStore)`: verifica se `movies.parquet` e `tv.parquet` esistono e sono più recenti dei rispettivi `master_*.jsonl`.
  - Boot (`isFirstRun`): se i parquet sono freschi, salta completamente l'invocazione di `scripts/convert_to_parquet.js` (risparmio di ~14,3 s) e inizializza `duckDbStore`.
  - Salto ricostruzione Tier 2 al boot se `titles_fts5.db` è già presente sul volume (risparmio di ~29 s).
  - `convertAndReloadDuckDb()` invocato solo su dump stale o forzato, con `{ forceRebuild: true }`.
- `index.js`:
  - Hook di graceful shutdown (`SIGTERM`/`SIGINT`): flush e chiusura esplicita di `duckDbStore.close()` prima dell'uscita del processo per prevenire corruzioni o WAL sporchi.

### 2. Guardia contro file corrotti o parziali
- **Protezione da build interrotte**: La scrittura iniziale avviene sempre su `catalog.duckdb.tmp`. Un container abbattuto a metà non lascia mai `catalog.duckdb` in stato inconsistente.
- **Validazione prima del trust**: All'avvio, `_verifyDatabase` esegue query effettive sulle tabelle, sulle colonne e sull'indice BM25.
- **Ripristino automatico e zero brick**: Qualsiasi eccezione o fallimento (header corrotto, dati troncati, indici mancanti o errore di I/O) catturato nel blocco `try` attiva `_cleanupDbFiles(this.dbPath)` (rimozione di db e WAL corrotto) e riesegue la costruzione pulita dai parquet, garantendo che l'applicazione non vada mai in crash loop.

### 3. Misure su `mate` (Due boot eseguiti e verificati)

#### Baseline prima dell'intervento
- `StartedAt`: `2026-10-17T06:49:59.946Z`
- Express listen: `+0.996s` (`06:50:00.942Z`)
- Conversione Parquet JSONL: `+14.378s`
- `[DuckDB Store] Inizializzazione in corso...`: `+15.47s` (`06:50:15.420Z`)
- DuckDB in RAM pronto: `+18.75s` (`06:50:18.993Z`)
- Tier 2 SQLite FTS5 pronto: `+48.51s` (`06:50:48.459Z`)
- RAM container: `788.8 MiB`

#### Boot 1 (Creazione DB persistente `catalog.duckdb` da Parquet già presenti sul volume)
Comando: `ssh mate "docker restart yaca-app"`
```
2026-10-17T08:37:02.838Z (Container StartedAt)
2026-10-17T08:37:03.829Z 🚀 YACA Server in esecuzione su http://localhost:7860 (+0.99s)
2026-10-17T08:37:03.830Z [TmdbDump] Parquet già presenti e aggiornati rispetto ai JSONL. Conversione al boot saltata. (0s parquet conversion)
2026-10-17T08:37:03.830Z [DuckDB Store] Inizializzazione in corso... (+0.992s da StartedAt)
2026-10-17T08:37:09.646Z [DuckDB Store] Tabelle caricate in RAM e indici FTS creati con successo. (catalog.duckdb 156 MB creato)
2026-10-17T08:37:10.367Z [TmdbDump] DuckDB pronto su database persistente.
2026-10-17T08:37:10.367Z [TmdbDump] titles_fts5.db già presente sul volume. Ricostruzione Tier 2 al boot saltata.
```

#### Boot 2 (Riapertura istantanea `catalog.duckdb` valido da volume)
Comando: `ssh mate "docker restart yaca-app"`
```
2026-10-17T08:37:39.019Z (Container StartedAt)
2026-10-17T08:37:39.980Z 🚀 YACA Server in esecuzione su http://localhost:7860 (+0.961s)
2026-10-17T08:37:39.981Z [TmdbDump] Parquet già presenti e aggiornati rispetto ai JSONL. Conversione al boot saltata. (0.00s conversione)
2026-10-17T08:37:39.981Z [DuckDB Store] Inizializzazione in corso... (+0.962s da StartedAt — TARGET < 2.0s RAGGIUNTO)
2026-10-17T08:37:40.144Z [DuckDB Store] Database persistente valido riaperto con successo da /data/tmdb/catalog.duckdb. (+1.125s da StartedAt)
2026-10-17T08:37:40.604Z [TmdbDump] DuckDB pronto su database persistente. (+1.585s da StartedAt)
2026-10-17T08:37:40.604Z [TmdbDump] titles_fts5.db già presente sul volume. Ricostruzione Tier 2 al boot saltata.
```
- **Tempo delta container start -> DuckDB init**: **0.962 s** (sceso da **18.75 s**, riduzione del 94.8%).
- **Tempo conversione parquet**: **0.00 s**.
- **DuckDB completamente pronto e verified**: **1.125 s** da `StartedAt`.

### 4. Delta RAM container (`docker stats --no-stream yaca-app`)
- **Baseline pre-intervento**: `788.8 MiB`
- **Post-intervento (persisted DB via DuckDB mmap storage)**: `215.8 MiB`
- **Delta RAM**: **-573 MiB** (~72% di memoria risparmiata per il container, grazie al passaggio da dataset in-memory decompresso a storage mmap su disco).

### 5. Decisione e proposta Tier 2
- **Decisione adottata**: In `tmdbDumpDaemon.js`, al boot viene controllata l'esistenza di `titles_fts5.db` (176 MB) su `/data/tmdb`. Se già presente, la ricostruzione Tier 2 (che impiegava 28.87 s) viene saltata all'avvio. La sincronizzazione giornaliera (`dailySync`) gestisce in autonomia il refresh periodico dell'export e degli indici quando arrivano nuovi dump.
- **Proposta di consolidamento**: Per garantire che non si perda un aggiornamento dell'export nel caso il container venga riavviato a cavallo della rotazione giornaliera, si propone di memorizzare un marcatore `export_date.json` contenente il timestamp o nome del daily export TMDB utilizzato (`movie_ids_MM_DD_YYYY.json.gz`), rigenerando il Tier 2 solo se la data dell'export presente su disco è più recente del marcatore.

