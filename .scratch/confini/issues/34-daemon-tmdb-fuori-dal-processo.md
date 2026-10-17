Status: resolved
Type: task

# 34 — Il daemon TMDB fuori dal processo che serve

## Perché

`index.js:249` (dentro `app.listen`) avvia `runTmdbDumpDaemon()`: un ciclo **orario**
(`while (waited < ONE_HOUR && daemonRunning)`, `tmdbDumpDaemon.js:318`) che pagina i dump TMDB
(`while (page <= totalPages)`) e li converte. All'avvio parte anche `reconcileManifests()`. Si spegne con
`DISABLE_TMDB_DUMP=1`, ma **in produzione è acceso**.

Sono **1.763 righe** di ingestione — `tmdbDumpDaemon.js` (405), `tmdbBudget.js` (384), `tmdbDumpClient.js` (377),
`tmdbNameResolver.js` (330), `tmdbDumpStore.js` (172), `tmdbIngestPolicy.js` (95) — che girano **nel processo che
serve Stremio**, con cui competono per CPU, rete e **rate limit TMDB**. È la stessa forma del drenatore dei poster
(ticket 25) e del grafo: **un ciclo di vita diverso dentro un processo che fa un'altra cosa.**

## Cosa deve uscire

1. **Il daemon come lavoro a lotti**, con la forma che il repo già conosce — **e va scelta e detta**: container
   (`services/anime-source` è il precedente) o unità systemd sul mate (`ops/yaca-poster-eventi.service` è
   l'altro). Consiglio: **container**, perché il drenatore su systemd è già un ponte che il ticket 30 sta
   smontando.
2. **`index.js` non lo avvia più** (e `DISABLE_TMDB_DUMP` sparisce o cambia significato: non c'è più niente da
   disattivare nell'app).
3. **`src/api/admin.js` non legge più `getDumpStatus` in processo**: lo stato va **letto dall'artefatto** (il
   volume `yaca_tmdb`, dove il daemon scrive), perché la rotta risponde all'operatore e deve continuare a
   rispondere quando il lavoro è in un altro processo.
4. **La cucitura esiste già**: l'artefatto è il volume `yaca_tmdb` (`/data/tmdb`: `catalog.duckdb`, i parquet, i
   JSONL). Non serve inventare un contratto — serve **dichiararlo**.

## Come si verifica

- I log di avvio dell'app: **nessuna riga** del daemon (e il boot non deve peggiorare: oggi è ~1,6 s col DuckDB
  persistente).
- Un giro del lavoro: i dump aggiornati sul volume (`ls -la /data/tmdb`, timestamp freschi) e il log del giro.
- `/api/admin` (o la rotta che espone lo stato): risponde **con lo stato letto dall'artefatto**, anche a daemon
  fermo — con un valore che dice «stantio» invece di mentire.
- `docker stats`: la RAM dell'app non deve crescere durante un giro (oggi il daemon gira lì dentro).
- La suite dei test dell'ingestione verde, **una alla volta** (`tests/tmdb*`, `tests/tier1*`).

## Attenzione

Il ticket 33 (decisione 21) ha misurato che **nessuna analisi di duplicazione avrebbe trovato questo**: l'ha
trovato seguire chi avvia cosa. Se durante il lavoro emerge un altro ciclo di vita nascosto nello stesso posto
(`reconcileManifests` è già lì), **va scritto nel ticket** — non sistemato in silenzio.

## Esito

### 1. La forma scelta e il perché
È stato scelto il **container standalone** (`services/tmdb-daemon` con immagine `ghcr.io/gabrielefuoco/yaca:${YACA_TAG:-latest}` in `docker-compose.yml`), seguendo il precedente architetturale di `services/anime-source`, invece dell'unità systemd (`ops/yaca-poster-eventi.service`).

**Motivazioni della scelta:**
- **Isolamento delle risorse**: il daemon ha il suo `mem_limit: 1024m` e limiti CPU dedicati, evitando che la conversione Parquet / DuckDB competa con il serving Stremio di `yaca-app`.
- **Accesso nativo al volume Docker**: monta direttamente il volume Docker nominato `yaca_tmdb` su `/data/tmdb`, senza richiedere permessi privilegiati sull'host per accedere a `/var/lib/docker/volumes/...` né overhead di `docker exec`.
- **Manutenibilità e Watchtower**: il container viaggia con la definizione del compose e viene aggiornato automaticamente da Watchtower. L'unità systemd sui poster è un ponte transitorio che il deploy (ticket 30) sta smontando, quindi introdurne un'altra avrebbe aumentato il debito host.
- **Supporto batch e ops**: `services/tmdb-daemon/cli.js` supporta sia la modalità daemon perpetuo (`node cli.js`), sia il batch job one-shot (`node cli.js --once`), sia il monitoraggio (`--status`, `--health-check`). In `ops/` sono state comunque predisposte per completezza le unità `ops/yaca-tmdb-daemon.service` e `ops/yaca-tmdb-daemon.timer`.

### 2. Cosa il boot dell'app non fa più
- `index.js` **non avvia più `runTmdbDumpDaemon()`**.
- `DISABLE_TMDB_DUMP` scompare da `index.js` (non c'è più nulla da disattivare nell'app).
- Al boot, `index.js` inizializza direttamente DuckDB persistente (`duckDbStore.init()`) in ~1.6 s senza eseguire conversioni Parquet, scaricamento export TMDB o cicli orari in-process.
- **Verifica del log**: l'avvio di `index.js` è pulito al 100%, con zero righe `[TmdbDump Daemon]` o `[TmdbDump]`.

### 3. Come viene letto lo stato adesso
- `src/api/admin.js` non importa più `tmdbDumpDaemon` né legge variabili in memoria.
- `GET /api/admin/tmdb-dump/status` legge lo stato dall'artefatto sul volume `yaca_tmdb` tramite `tmdbDumpStore.loadStatus()`:
  - Se il daemon ha scritto `dump_status.json` ma il battito è fermo da oltre 10 minuti (processo morto o bloccato): risponde `phase: 'stale'`, `isStale: true`, `isRunning: false` con la motivazione.
  - Se l'ultimo sync è più vecchio di 36 ore: risponde `phase: 'stale'`, `isStale: true`.
  - Se il file di stato è assente ma ci sono file parquet/duckdb sul volume: risponde `phase: 'stale'`, `isStale: true` invece di azzerare i contatori a zero o mentire.
  - Se nessun artefatto esiste: risponde `phase: 'uninitialized'`, `isStale: true`.
  - Quando il daemon standalone è attivo: riporta la fase (`cold-start`, `daily-sync`, `idle`), avanzamento e statistiche aggiornate live.

### 4. Contratto dell'artefatto dichiarato (`yaca_tmdb` / `/data/tmdb`)
La cucitura tra il daemon e l'applicazione risiede esclusivamente negli artefatti sul volume:
1. `master_movies.jsonl`: NDJSON master dei film TMDB.
2. `master_tv.jsonl`: NDJSON master delle serie TV TMDB.
3. `cursor.json`: cursore di progresso download TMDB e completamento (`{ mediaType, index, completed }`).
4. `movies.parquet`: Parquet arricchito per DuckDB con annotazioni ITA.
5. `tv.parquet`: Parquet arricchito per DuckDB con annotazioni ITA.
6. `catalog.duckdb`: database DuckDB su file persistente con tabelle indicizzate (`movies`, `tv`, `anime_mappings`) e indici BM25. Il daemon chiude esplicitamente la connessione DuckDB dopo la build per rilasciare lock e memoria.
7. `titles_fts5.db`: indice SQLite FTS5 per il recupero rapido Tier 2.
8. `dump_status.json`: battito e stato di avanzamento scritto atomicamente (`.tmp` → rename) dal daemon.

### 5. Posizione di `tmdbNameResolver.js`
`src/utils/tmdbNameResolver.js` è utilizzato dal prodotto per i nomi del DNA del catalogo (`src/api/configure/profileProcessor.js`) e testato da `tests/dnaNames.test.js`.
In linea con le istruzioni, `tmdbNameResolver.js` **non è stato spostato** ed è rimasto in `src/utils/tmdbNameResolver.js` dove il prodotto può continuare a consumarlo. Soltanto il ciclo del daemon e la scrittura del dump sono stati scorporati.

### 6. Suite di test eseguite (una per una)
Tutti i test sono stati eseguiti singolarmente con `npx jest tests/<file>.test.js --forceExit`:
- `tests/tmdbDumpStatus.test.js`: **7 passati**, 0 falliti (nuova suite: verifica volume non inizializzato, artefatti pregressi senza stato, daemon attivo, heartbeat scaduto, sync >36h, daemon idle, rotta `/api/admin/tmdb-dump/status`).
- `tests/tmdbBudget.test.js`: **11 passati**, 0 falliti.
- `tests/tmdbIngestPolicy.test.js`: **9 passati**, 0 falliti.
- `tests/tier1Promotion.test.js`: **17 passati**, 0 falliti.
- `tests/ticket14TitlePolicy.test.js`: **12 passati**, 0 falliti.
- `tests/dnaNames.test.js`: **8 passati**, 0 falliti.
- `tests/tier2Index.test.js`: **15 passati**, 0 falliti.
- `tests/searchTier2Merge.test.js`: **24 passati**, 0 falliti.
**Totale: 103 test passati, 0 falliti.**
Verifica di avvio applicazione: boot eseguito, nessun log `[TmdbDump]` emesso, DuckDB riaperto correttamente in < 2 s.

### 7. Cosa non è stato fatto (fuori perimetro)
- Nessun deploy eseguito e nessun push remoto (`git push` non eseguito, mate non toccato come da regole).
- `reconcileManifests()`: rilevato ciclo di vita secondario presente all'avvio in `index.js:257`. Come prescritto da §Attenzione, viene segnalato qui e non toccato in silenzio, essendo materia del ticket stremio/manifest.

