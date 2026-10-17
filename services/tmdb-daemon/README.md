# Servizio TMDB Dump Daemon

Servizio standalone per l'ingestione batch dei dump TMDB e la costruzione degli indici DuckDB/Parquet/FTS5 (Ticket 34).

## Architettura e Motivazione

In precedenza, il daemon orario TMDB (`runTmdbDumpDaemon`) veniva avviato dentro `index.js` di `yaca-app`, ovvero **nello stesso processo Node che serve le richieste Stremio degli utenti**.
Questo causava:
1. Competizione sulle risorse CPU, I/O e RAM (DuckDB build, conversione Parquet).
2. Competizione sui rate limit e budget TMDB.
3. Rischio di memory leak o crash che impattavano il web server.

Il servizio è ora separato come **batch job / container autonomo** nel Docker Compose (`services/tmdb-daemon`), seguendo il precedente architetturale di `services/anime-source`.

### Perché Container e non Unità Systemd
- **Isolamento risorse**: limiti di memoria (`mem_limit: 1024m`) e CPU isolati tramite cgroups.
- **Accesso nativo al volume Docker**: monta direttamente il volume Docker `yaca_tmdb` su `/data/tmdb`, senza richiedere percorsi privilegiati dell'host né `docker exec`.
- **Manutenibilità e portabilità**: il container viaggia con `docker-compose.yml` e viene aggiornato automaticamente da Watchtower.

---

## Contratto dell'Artefatto (`/data/tmdb` - Volume `yaca_tmdb`)

Il confine e la sincronizzazione tra il job di ingestione e il web server avvengono esclusivamente attraverso gli artefatti memorizzati nel volume condiviso `yaca_tmdb`:

1. `master_movies.jsonl`: NDJSON con record completi dei film TMDB.
2. `master_tv.jsonl`: NDJSON con record completi delle serie TV TMDB.
3. `cursor.json`: Stato di avanzamento della sincronizzazione / cold start.
4. `movies.parquet`: Parquet arricchito generato da `master_movies.jsonl`.
5. `tv.parquet`: Parquet arricchito generato da `master_tv.jsonl`.
6. `catalog.duckdb`: Database persistente DuckDB con tabelle `movies`, `tv`, `anime_mappings` e indici BM25.
7. `titles_fts5.db`: Indice FTS5 SQLite per la ricerca rapida Tier 2 (~1,5M titoli).
8. `dump_status.json`: File di stato e battito (heartbeat) scritto dal daemon con:
   - `updatedAt`: ISO timestamp dell'ultimo battito.
   - `isRunning`: booleano.
   - `phase`: `'cold-start' | 'daily-sync' | 'idle' | 'error' | 'stale'`.
   - `lastSync`: ISO timestamp dell'ultimo sync completato.
   - `stats`: `{ movies: number, tv: number }`.
   - `currentTask`, `progress`, `total`, `error`.

L'endpoint `GET /api/admin/tmdb-dump/status` di `yaca-app` legge direttamente `dump_status.json` e verifica gli artefatti su disco. Se il daemon non aggiorna il battito da oltre 10 minuti o il sync risale a oltre 36 ore fa, riporta fedelmente `isStale: true` e `phase: 'stale'`.

---

## Utilizzo CLI

```bash
# Esecuzione daemon perpetuo (ciclo orario)
node services/tmdb-daemon/cli.js

# Esecuzione singolo giro batch ed uscita immediata
node services/tmdb-daemon/cli.js --once

# Visualizzazione stato dall'artefatto (dump_status.json)
node services/tmdb-daemon/cli.js --status

# Healthcheck per Docker / monitoraggio (exit 0 se OK, exit 1 se stantio/errore)
node services/tmdb-daemon/cli.js --health-check
```
