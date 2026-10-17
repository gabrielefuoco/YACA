Status: ready-for-agent
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
