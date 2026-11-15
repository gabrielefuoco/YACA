# Ticket 00 — Baseline e verifiche preliminari

**Data**: 2026-11-15 · **Server**: `mate` (letto via SSH, sola lettura) · **Modalità**: nessuna modifica al codice

Tutti i numeri sono stati letti in produzione, non stimati. Sono il termine di paragone di ogni
"prima/dopo" dei ticket delle onde 1-3.

## 1. TMDB

| Cosa | Valore misurato |
|---|---|
| Daemon | `phase: idle`, `lastSync: 2026-11-15T16:28:07Z`, `isRunning: true`, `error: null` |
| Titoli nel Tier 1 | **99.621 film + 19.714 serie = 119.335** |
| Export TMDB di partenza | ~533.000 (dichiarato in docs) → **scarto 78%** per `popularity ≥ 1` + `vote_count ≥ 10` |
| `master_movies.jsonl` | 347 MB, 99.621 righe |
| `master_tv.jsonl` | 55 MB, 19.714 righe |
| `movies.parquet` / `tv.parquet` | 62 MB / 9,7 MB |
| `tier2_titles.parquet` | 46 MB |
| `titles_fts5.db` | 187 MB |
| `catalog.duckdb` | 191 MB **+ `catalog.duckdb.wal` 87 KB** |

> Il WAL esiste **adesso**, accanto al DB: è la prova che il rischio del ticket 06 (WAL legato al path,
> non all'inode) non è teorico. Il `CHECKPOINT` dopo gli `UPDATE` non è opzionale.

## 2. Doppiaggi ITA — l'anomalia A1 è confermata sul campo

| Cosa | Valore misurato |
|---|---|
| Pagine in cache | **81 file `.htm`** |
| Loro mtime | **tutti 2026-10-02** → indice congelato da **44 giorni** |
| `ita_annotations.jsonl` | 24.257 righe · **19.453 `true`** · 4.804 `null` · `generatedAt 2026-11-15T15:00:41Z` |
| Ultimo giro (`last-run.json`) | catalogo 110.785 titoli · AG estratte 25.165 · match `true` 19.371 · ambigue 2.142 · **senza candidato 3.652** · merge anime attivo, non degradato |

Distribuzione `ita` **nei parquet** (DuckDB, in produzione):

| tabella | true | null | false |
|---|---:|---:|---:|
| movies (98.498) | 14.295 | 4.141 | 80.062 |
| tv (19.714) | 5.077 | 663 | 13.974 |
| **totale** | **19.372** | **4.804** | 94.036 |

**Confronto file vs parquet**: `true` 19.453 nel file contro 19.372 nel parquet (**−81, 0,4%**), `null`
identici (4.804 = 4.804). Il parquet quindi **è già allineato**, non è vecchio di un giorno: la colonna si
riallinea al giro orario del daemon. Il live sync del ticket 06 compra meno di un'ora, non 24 — resta una
scelta (sub-hour), non una correzione di un ritardo strutturale. Annotato nel ticket.

> I 3.652 titoli AG "senza candidato" sono il potenziale di `--resolve-ids` (anomalia A2, fuori perimetro).

## 3. Poster

| Cosa | Valore misurato |
|---|---|
| File nel volume | **105.732** |
| Peso | **16 GB** |
| `.tmp` orfani al momento della misura | 0 |
| Quota disco | **nessuna** |

> Due conseguenze per il ticket 09: (a) il volume è già **16 GB**, quindi il problema non è "prima o poi
> crescerà", è adesso; (b) con `maxDelete 500` e un TTL di 60 giorni il GC **non** recupera 16 GB in un
> giorno: a regime tiene la crescita a zero, non svuota l'arretrato. Se serve recuperare spazio, serve una
> passata una tantum con un `maxDelete` più alto, decisa a mano.

## 4. Verifiche di fattibilità (punti 2-7 del ticket)

| # | Verifica | Esito |
|---|---|---|
| 2 | `_buildMovieRow`/`_buildTvRow` esistono in `tmdbDumpClient`? | **No** → vanno estratte da `fetchMovie`/`fetchTv` (nessun cambio di formato riga) |
| 3 | `duckDbStore` ha `this.con`, `_exec`, `activeQueries`, `_zeroActiveQueriesWaiters`? | **Sì**. Manca `_lastItaMtimeMs` → da aggiungere |
| 4 | Client TMDB iniettabile nel daemon? | **No**: `new TmdbDumpClient(apiKey)` dentro `runTmdbDumpDaemon` → serve un parametro per testare `dailySync` |
| 5 | Header auth admin | **`x-admin-pass`** (`middleware/adminAuth.js:9`), non `x-admin-token`; `admin.js` ha già `router.use(adminAuth)` |
| 6 | `posterFileName({erdbId, badge, version})` | **Confermato** (`src/posters/erdb/build.js:69`) |
| 7 | Comando del prefill poster | `node scripts/erdb-builder/build.js --list <lista.jsonl> --base <ERDB> --out <cache>`; la lista si genera con `node scripts/erdb-builder/dump-list.js --parquet /data/tmdb --out titoli.jsonl` |

## 5. Verifiche cancellate (non servono più)

- **Conditional GET / ETag** su antoniogenna: il ticket 01 usa il TTL sull'mtime. Non serve saperlo.
- **Build context di `yaca-anime-source`**: `./services/anime-source` (isolato); l'immagine dell'app usa
  `COPY . .` e `.dockerignore` **non** esclude `services/anime-source/` → il ticket 07 importa
  `mappingIndex.js` direttamente. Cautela: aggiungerlo al `.dockerignore` romperebbe l'import **a runtime**.

## 6. Baseline per le metriche dei ticket successivi

- **01**: 81 pagine, 0 fresche (tutte 2026-10-02). Dopo: 0 pagine più vecchie di 48 h.
- **02**: dopo un giro con cap artificialmente basso, `deletes` deve restare ~0 e i contatori devono
  spiegare la differenza.
- **03**: 119.335 titoli oggi. Barra: crescita **< +15%** (< ~137k) e durata del giro **< +10%**.
- **05**: `true` 19.453 (file) / 19.372 (parquet). Il campione di 20 casi si giudica su questo insieme.
- **06**: differenza file↔parquet oggi = 81 `true` (0,4%) e 0 `null`.
- **08**: 105.732 file con nomi **senza** token dell'immagine.
- **09**: 16 GB / 105.732 file, 0 `.tmp`.
- **10**: i cinque stati da esporre esistono già; il semaforo nasce `green` su un sistema sano (tranne
  eventuali `yellow` su `anime_airing.homeStale`, da verificare al primo giro).
