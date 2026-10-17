Status: ready-for-agent
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
