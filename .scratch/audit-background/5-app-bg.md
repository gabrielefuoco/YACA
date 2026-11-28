# App Background Machinery Audit (Read-Only, Ponytail Style)

Scope: `index.js` and background machinery inside `src/**` (`src/posters/**`, `src/api/staticPosters.js`, `src/catalog/itaAnnotations.js`, `src/cache/**`, `src/indice/duckDbStore.js`, boot timers/warmups/sync routes, `src/ricerca/tier2Enrich.js`, `src/ricerca/learnedNames.js`), excluding `src/ricerca/**` (other than the two named files) and `src/indice/filters.js`.

---

## 1. Ranked Ponytail List (Biggest Cut First)

1. `yagni` Split offline CLI builder out of `src/posters/erdb/build.js` (lines 162-448, 287 lines) back into `scripts/erdb-builder/build.js`, and delete the `src/posters/index.js` barrel (96 lines); keep only `posterFileName`/`posterUrl` (~55 lines) and import submodules directly. `[src/posters/erdb/build.js:162, src/posters/index.js:1]` (`rg` shows `src/posters/index.js` has only 2 non-test callers: `src/api/staticPosters.js:13` and `scripts/push-diff-in-coda.js:59`, while `buildReport`/`parseJsonl`/`normalizeEntry`/`isReusable`/`isUsableImage`/`run`/`main` have 0 callers in `index.js` and `src/`, invoked only by the 8-line shim `scripts/erdb-builder/build.js:2`; net: ~-340 lines in runtime `src/posters/`).
2. `delete` Remove `defaultCache`, `buildRecommendationCacheKey`, and the `deriva` descriptor abstraction from `src/cache/index.js` (332 lines -> direct helpers/instances), plus the broken `aiDiscoveryCache` reference in `index.js`. `[src/cache/index.js:7-332, index.js:225-227]` (`rg` shows `defaultCache` has 0 external callers, `buildRecommendationCacheKey` has 0 non-test callers, `aiDiscoveryCache` has 0 definitions in `src/cache/cacheInstances.js:37-41` causing `/api/clear-cache` to throw 500 every call, and `src/cache/index.js` has only 5 non-test callers: `catalogDefinition.js:7`, `pool/index.js:15`, `catalogHandler.js:14`, `hybridServing.js:16`, `meta.js:15`; net: ~-220 lines).
3. `yagni` Strip unused TMDB cap enforcement (`configureCap`, `checkBudget`, `_pruneWindow`, `_handleCapExceeded`, `executeWithBudget`, `TMDB_CAP_LIMIT`/`TMDB_CAP_WINDOW_MS`) and dead `SERIES_META_SWR_MS` config. `[src/clients/tmdbBudget.js:111-315, src/config.js:30]` (`rg` shows 0 occurrences of `TMDB_CAP_LIMIT` and `TMDB_CAP_WINDOW_MS` in `ops/`, `docker-compose.yml`, `.env`, `.env.example`, and 0 non-test callers of `configureCap`; `src/config.js:30` explicitly comments `SERIES_META_SWR_MS` as `non applicato`; net: ~-140 lines).
4. `stdlib` Replace hand-rolled timeout, atomic-write, text-normalization, and Redis-polling helpers with Node stdlib or existing `src/infra/` primitives. `[src/posters/drenaPoster.js:154-205, src/posters/drenaCodaPoster.js:207-214, src/posters/codaEventi.js:234-264, src/ricerca/learnedNames.js:68-76]` (`_conTimeout` is duplicated in `drenaPoster.js:154` and `drenaCodaPoster.js:207` instead of `AbortSignal.timeout(ms)`; `drenaPoster.js:177` `scrivi` duplicates `src/infra/atomicWrite.js:70` `scriviAtomico`; `learnedNames.js:68` `normalizeText` duplicates `src/infra/testo.js:14` `normalizza` used by 7 other modules; `codaEventi.js:234` polls `isAvailable` every 100ms instead of `events.once(redis, 'ready')`; net: ~-110 lines).
5. `delete` Remove unused exported wrappers and helpers in `src/posters/` (`verificaPresenzaPoster`, `calcolaVersioniVolume`, `azzeraStatistichePoster`, `nomeFileDaEvento`, `urlDaEvento`, `pushWithStatus`, `drenaCommand`, `leggiMappa`, `scriviToken`, `resetCache`). `[src/posters/volumeContract.js:175-260, src/posters/posterDaEvento.js:127-264, src/posters/sorgenti.js:17-86, src/posters/codaEventi.js:221]` (`rg` shows 0 callers in `index.js` and `src/` outside `src/posters/index.js` re-exports and `volumeContract.js:268`; `pushWithStatus` only checked optionally in `scripts/push-diff-in-coda.js:370`; `azzeraStatistichePoster` only called by `scripts/qa/probe-poster-volume.js:89`; net: ~-95 lines).
6. `yagni` Strip DuckDB Windows `EEXIST`/`win32` swap workarounds, dead `DUCKDB_*` env overrides, and `queryRaw` alias in `src/indice/duckDbStore.js`. `[src/indice/duckDbStore.js:27-56,108-153,267-273,353-354,842-847]` (Production runs Linux in `docker-compose.yml`; `rg` shows 0 occurrences of `DUCKDB_PATH`, `DUCKDB_STAGING_PATH`, `DUCKDB_CHECK_INTERVAL_MS`, `DUCKDB_LOCK_MAX_RETRIES`, `DUCKDB_LOCK_RETRY_DELAY_MS` in `ops/`, `docker-compose.yml`, `.env`, `.env.example`; `queryRaw` has 1 non-test caller: `src/posters/posterResolver.js:67,77`; net: ~-75 lines).
7. `yagni` Remove legacy `/images/poster/...` redirect route (`src/api/stremio.js:367-384`), `refreshComposedPoster` (`src/posters/libraryPosterRefresh.js:97-136`), `GET /erdb-poster/versioni` (`src/api/staticPosters.js:240-250`), and the defeated lazy-require in `staticPosters.js:145`. `[src/api/stremio.js:367, src/posters/libraryPosterRefresh.js:97, src/api/staticPosters.js:145,240]` (`rg` shows 0 non-test callers of `/erdb-poster/versioni`; `refreshComposedPoster` is called only by `refreshLibraryPoster` at `libraryPosterRefresh.js:208`; `staticPosters.js:145` lazy require of `codaEventi` is bypassed at boot by `staticPosters.js:13` `require('../posters')`; net: ~-65 lines).
8. `delete` Remove dead/broken HTTP endpoints: `GET /api/cron/warmup` (`index.js:148-152`), `POST /api/clear-cache` (`index.js:223-232`), and `POST /api/admin/tmdb-dump/backup` (`src/api/admin.js:114-120`). `[index.js:148,223, src/api/admin.js:114]` (`rg` shows 0 callers across `index.js`, `src/`, `scripts/`, `ops/`, `tests/`; `/api/clear-cache` unconditionally throws 500 and is replaced by `POST /api/profilo/aggiorna` at `src/api/profilo.js:572`; net: ~-24 lines).
9. `yagni` Collapse `src/catalog/itaAnnotations.js` unused path env overrides (`ITA_ANNOTATIONS_DIR`, `ITA_ANNOTATIONS_PATH`, `TMDB_DUMP_DIR`) and inline `isDubbed` into `getStatus(...) === true`. `[src/catalog/itaAnnotations.js:34-43,178-180]` (`rg` shows 0 occurrences of all 3 env vars in `ops/`, `docker-compose.yml`, `.env`, `.env.example`; `isDubbed` has only 2 callers: `src/stremio/badges.js:141,144` and `src/stremio/meta.js:318,321`; net: ~-15 lines).
10. `yagni` Remove module-cache wrappers `_tmdb`/`_learnedNames` in `src/ricerca/tier2Enrich.js` (Node `require` already caches modules) and vestigial `ERDB_CONFIG`/`hasGlobalErdb` plumbing. `[src/ricerca/tier2Enrich.js:63-74, index.js:199,218, src/api/profilo.js:71, src/api/configurazione.js:353]` (`rg` shows `ERDB_CONFIG` is never read anywhere outside those 4 `hasGlobalErdb` flags; net: ~-16 lines).

**Estimated total cut:** ~950 net lines saved (0 npm deps removed).

---

## 2. BOOT COST

No `setInterval` or `cron` jobs run inside the `yaca-app` process (`rg -n "setInterval|setTimeout|setImmediate|node-cron|cron"` across `index.js` and `src/**` excluding `src/data/**`, `src/ricerca/**`, `src/indice/filters.js` found only short retry/backoff `setTimeout`s and the 10s graceful-shutdown timer in `index.js:305`). However, startup triggers heavy eager work:

1. **DuckDB open + FTS verification + full Parquet DF/keyword scan (`index.js:52-53` -> `src/indice/index.js:42-48` -> `src/indice/duckDbStore.js:523-661`)**:
   - Unawaited at boot; opens `catalog.duckdb` (`163.59 MB` on disk, `{ max_memory: '2GB' }` in `duckDbStore.js:226`), runs `INSTALL fts; LOAD fts;`, executes `_verifyDatabase` (`duckDbStore.js:282-308`, including 2 BM25 FTS test queries), then runs `updateAnimeMapping`, `ensureItaColumn` (`ALTER TABLE` + `CHECKPOINT;`, lines 773-777), and `buildDfCache` (lines 990-1043), which performs two full `unnest(from_json(...))` scans over `movies` (`60.07 MB` parquet) and `tv` (`9.43 MB` parquet) to populate `dfMap` and `keywordIds`, then invalidates `HierarchicalGraph` caches.
2. **Eager Anime Mapping JSON load + duplicate DuckDB sync (`index.js:48-49` -> `src/anime/mapping.js:130-198`)**:
   - Reads `anime-mappings.json` (`10.53 MB` on disk) synchronously with `fs.readFileSync` (`mapping.js:160`), `JSON.parse`s it, builds ~11 `Map`/`Set` structures (`_rebuildAnimeTmdbIds`, lines 296-360), and calls `syncDuckDb()` -> `indice.updateAnimeMapping()` (`mapping.js:262-274`). Because `index.js:49` and `index.js:53` run concurrently without coordination, `updateAnimeMapping()` can run twice at boot (once from `duckDbStore.init()` line 651 and once from `animeMappingStore.init()` line 186).
3. **Eager Preset compilation + `hierarchical_graph.json` load at `require()` time (`index.js:15` -> `src/catalog/presets.js:4,534-542`)**:
   - `index.js:15` requires `src/catalog/presets.js`, which requires `../indice` (`presets.js:4`) -> `src/indice/index.js:336` requires `./HierarchicalGraph` -> `HierarchicalGraph.js:20` synchronously calls `require('../data/hierarchical_graph.json')` (`1.03 MB` JSON) and preallocates `LRUCache({ max: 5000 })` + `LRUCache({ max: 2000 })` (`HierarchicalGraph.js:10-11`). At line 534, `presets.js` runs `getPresets()` eagerly at module load just to validate `profileTemplates` IDs (`presets.js:534-542`), compiling every preset's `q0` via `buildPresetFromFilters` (`presets.js:331`).
4. **Eager `src/posters` + `redisClient` + `CacheManager` preallocation (`index.js:37` -> `src/api/staticPosters.js:13` -> `src/posters/index.js:13-73`)**:
   - `staticPosters.js:13` eagerly loads the `src/posters/index.js` barrel, which loads `codaEventi.js` -> `redisClient.js:20` (immediately opens TCP connection to Redis), `erdb/build.js` (464 lines), `drenaCodaPoster.js` (527 lines), and `posterResolver.js` -> `src/indice`.
   - `CacheManager` instances preallocated at module load: `finalMetaCache` (`ramMax: 300`, `src/cache/index.js:7`), `defaultCache` (`ramMax: 100`, `src/cache/index.js:8` — unused), `hybridRecommendationsCache` (`ramMax: 30`, `src/cache/cacheInstances.js:9`), `catalogRequestCache` (`ramMax: 0`, `cacheInstances.js:15`), `shelvesCache` (`ramMax: 200`, `cacheInstances.js:31`), `erdbHeadCache` (`ramMax: 2000`, `src/api/stremio.js:415`), plus 6 caches in `src/clients/tmdb.js:87-91,752` (`ramMax: 500` each).
5. **Sequential `reconcileManifests()` on `app.listen` (`index.js:272-277` -> `src/stremio/reconciler.js:20-126`)**:
   - Queries `AddonConfig.find({})` for all accounts and sequentially performs Mongo lookups (`accountPerAddonUuid`) and external Stremio Cloud HTTP updates (`updateStremioAddonCollection`) for every user with `pendingStremioResync`.
6. **Synchronous boot asset reads (`index.js:118-129`, `src/stremio/formatters/posterBadgeVersion.js:11-24`)**:
   - `fs.readFileSync` on `frontend/out/version.json` (`index.js:122`) and `src/assets/fonts/noto-sans.ttf` + SHA-1 digest (`posterBadgeVersion.js:15-16`).
7. **Host timer `docker exec` cold start (`src/posters/drenaCodaPoster.js:455-508`)**:
   - Every 5-10 min (`ops/yaca-poster-eventi.timer`), spawns a fresh Node process inside `yaca-app`, awaits Redis (`aspettaRedis` polling every 100ms), and for any non-`kitsu:` event calls `animeMappingStore.init()` (`drenaCodaPoster.js:195`), which reads `10.53 MB` `anime-mappings.json` and invokes `syncDuckDb()` -> `duckDbStore.init()` (see Fragility #1).

---

## 3. DEAD CONFIG

All env vars/flags read in scope with **0 matches** in `ops/` (all files), `docker-compose.yml`, `.env`, and `.env.example` (verified via `rg`):

| Env Var / Flag | Where Read in Scope | `rg` Proof in `ops/`, `docker-compose.yml`, `.env`, `.env.example` |
|---|---|---|
| `DUCKDB_PATH` | `src/indice/duckDbStore.js:27` | 0 matches |
| `DUCKDB_STAGING_PATH` | `src/indice/duckDbStore.js:38` | 0 matches |
| `DUCKDB_CHECK_INTERVAL_MS` | `src/indice/duckDbStore.js:55` | 0 matches |
| `DUCKDB_LOCK_MAX_RETRIES` | `src/indice/duckDbStore.js:353` | 0 matches |
| `DUCKDB_LOCK_RETRY_DELAY_MS` | `src/indice/duckDbStore.js:354` | 0 matches |
| `TMDB_DUMP_DIR` | `src/indice/duckDbStore.js:18`, `src/catalog/itaAnnotations.js:36`, `src/ricerca/learnedNames.js:52`, `src/anime/mapping.js:34` | 0 matches |
| `ITA_ANNOTATIONS_DIR` | `src/catalog/itaAnnotations.js:35` | 0 matches |
| `ITA_ANNOTATIONS_PATH` | `src/catalog/itaAnnotations.js:42` | 0 matches |
| `LEARNED_NAMES_DB` | `src/ricerca/learnedNames.js:59` | 0 matches |
| `DISABLE_MANIFEST_RECONCILE` | `index.js:272` | 0 matches |
| `CATALOG_PAGE_SIZE` | `src/config.js:14` | 0 matches |
| `ANIME_MAPPING_DIR` | `src/anime/mapping.js:33` | 0 matches |
| `ANIME_MAPPINGS_PATH` | `src/anime/mapping.js:41` | 0 matches (`docker-compose.yml:40` sets singular `ANIME_MAPPING_PATH`) |
| `FRONTEND_URL` | `src/api/stremio.js:347` | 0 matches |
| `TMDB_CAP_LIMIT` | `src/clients/tmdbBudget.js:115-116` | 0 matches (`capConfig.enabled` always `false`) |
| `TMDB_CAP_WINDOW_MS` | `src/clients/tmdbBudget.js:117` | 0 matches |
| `BASE_URL` | `src/api/profilo.js:337,546` | 0 matches |
| `ERDB_LOCAL_BASE` | `src/api/staticPosters.js:189`, `src/posters/drenaCodaPoster.js:77` | 0 matches in `docker-compose.yml`, `.env`, `.env.example`, `ops/server.env.example` (only referenced in `ops/yaca-poster-eventi.service:34` via `-e ERDB_LOCAL_BASE=${ERDB_LOCAL_BASE}`) |
| `SERIES_META_SWR_MS` | `src/config.js:30`, `src/clients/tmdbBudget.js:23` | Config flag commented `non applicato`; never enforced |
| `ERDB_CONFIG` | `index.js:199,218`, `src/api/profilo.js:71`, `src/api/configurazione.js:353` | Set in `.env:7`, but never used for poster rendering — only exposes boolean `hasGlobalErdb` |

---

## 4. FRAGILITY

1. **Cross-process DuckDB lock collision & destructive 2 GB rebuild inside `docker exec` cron (`src/posters/drenaCodaPoster.js:195,495` -> `src/anime/mapping.js:186,264` -> `src/indice/duckDbStore.js:544-636`)**:
   - When `drenaCodaPoster.js` processes any non-`kitsu:` event, `preparaMappa()` calls `animeMappingStore.init()` -> `_leggiArtefatto()` -> `syncDuckDb()` -> `indice.updateAnimeMapping()` -> `duckDbStore.init()`. Because the long-running `yaca-app` holds the DuckDB lock on `/data/tmdb/catalog.duckdb`, `_openPersistentWithRetry()` fails after 3 lock retries (~6s+), and `init()` falls into `if (!reopened)` (`duckDbStore.js:563`), rebuilding `catalog.duckdb` from scratch (`read_parquet` + FTS index with `{ max_memory: '2GB' }`, line 226) into `catalog.duckdb.tmp` and swapping it over the live DB (`line 624`) inside a container capped at `mem_limit: 1536m` (`docker-compose.yml:58`).
   - *Blast radius:* OOM-kill of `yaca-app`, live `catalog.duckdb` file replacement mid-flight, and multi-second timer stall.
2. **Synchronous `fs.readFileSync` / `fs.statSync` / `scriviAtomicoSync` + sudden 200k-key wipe in `sorgenti.json` (`src/posters/sorgenti.js:39,51-52,100-118`, `src/stremio/formatters/StremioFormatter.js:10,160,177`)**:
   - Every formatted catalog card triggers `fs.statSync` (`StremioFormatter.js:160`) and `leggiToken` -> `caricaMappa`, which every `CHECK_INTERVAL_MS` (`60000`) executes synchronous `fs.statSync`, `fs.readFileSync`, and `JSON.parse` on `sorgenti.json` (up to `200,000` keys) on the Express event loop. Additionally, `scriviMappa` (`sorgenti.js:105`) resets the entire map (`currentObj = {}`) once keys reach `MAX_SORGENTI_KEYS` (`200000`), silently breaking filename hash stability for all previously built posters.
   - *Blast radius:* Event-loop stalls during catalog responses + sudden global poster filename cache invalidation at 200k entries.
3. **Synchronous 10.5 MB JSON refresh & per-request `statSync` on the event loop (`src/anime/mapping.js:30,160,168`, `src/api/staticPosters.js:72,223,286,299`, `index.js:122,248`)**:
   - `AnimeMappingStore._leggiArtefatto()` runs `fs.readFileSync` + `JSON.parse` on `anime-mappings.json` (`10.53 MB`) and rebuilds 11 `Map`/`Set` structures every 60s (`CACHE_TTL_MS`, `mapping.js:30`) on the main thread; `GET /erdb-poster/:file` runs `fs.statSync` synchronously on every request (`staticPosters.js:72`).
   - *Blast radius:* Periodic 10–50ms+ event-loop stalls on concurrent Stremio catalog/meta/poster traffic.
4. **Synchronous SQLite full-table `LIKE '%token%'` scans on the event loop (`src/ricerca/learnedNames.js:85-98,168-238`)**:
   - `learned_names.db` explicitly creates no index on `title_search` (`learnedNames.js:85-86`) and runs synchronous `better-sqlite3` queries (`title_search LIKE ? ... ORDER BY learned_at DESC`) across up to `MAX_ROWS = 20000` rows inside request handling (`searchLearnedNames`), plus synchronous `write()` transactions (`setTimeout(run, 0)`).
   - *Blast radius:* Main-thread event-loop blocking during search traffic bursts.
5. **Blocking Redis `KEYS` scans (`src/cache/CacheManager.js:231,245`)**:
   - `CacheManager.clear()` and `CacheManager.getStats()` run `redisClient.keys(`${this.namespace}:*`)` (`O(N)` blocking Redis command). Invoked by `GET /api/admin/metrics` (`src/api/admin.js:23`, scanning all `CacheManager.instances`), `POST /api/admin/system/flush` (`admin.js:47-55`), and `POST /api/profilo/aggiorna` (`src/api/profilo.js:574`).
   - *Blast radius:* Stalls the single-threaded `yaca-redis` service for all users and poster queue operations.
6. **Hanging `fetch()` promises + unthrottled on-miss ERDB stampede (`src/posters/drenaPoster.js:122-126,154-160`, `src/api/staticPosters.js:186-208,274-297`)**:
   - `scarica()` uses `Promise.race` without `AbortController`, leaving timed-out HTTP requests/sockets open until OS timeout (`drenaPoster.js:122-125`). `staticPosters.js` calls `scarica()` with `TIMEOUT_ERDB_MS = 5000` with no per-filename single-flight or concurrency limit, so N concurrent misses for the same poster launch N parallel ERDB fetches.
   - *Blast radius:* Socket/memory buildup in `yaca-app` when ERDB is slow or unreachable.
7. **Unbounded poster volume growth vs sequential GC scan & silent `NaN` CLI guard (`src/posters/gcPosterCache.js:60-102,133-135`)**:
   - `gcPosterCache` loads all `readdir` dirents into RAM, runs sequential `await fs.promises.stat` per file in a loop, and deletes at most `--max-delete 500` files/day (`ops/yaca-poster-gc.service:17`) with 60-day TTL. Invalid `--max-delete`/`--ttl-days` flags parse to `NaN` (`Math.max(0, NaN || 0) => 0` deletes nothing without error).
   - *Blast radius:* Disk growth if daily poster churn exceeds 500 files/day, and slow sequential `stat` sweeps as directory grows.
8. **Silent failures & data-drop edges (`index.js:223-232,318-324`, `src/posters/codaEventi.js:106-110,144-154`, `src/posters/drenaCodaPoster.js:504`, `src/catalog/itaAnnotations.js:76`)**:
   - `POST /api/clear-cache` (`index.js:223-232`) always fails (`aiDiscoveryCache` is `undefined`); `uncaughtException`/`unhandledRejection` handlers (`index.js:318-324`) log and keep running in undefined state; `codaEventi._rinfrescaTtl` refreshes the 7-day TTL only on `push()`, not `take()`/`fail()`, so a stalled queue drops all pending events after 7 days; `drenaCodaPoster.js:504` watchdog exits `0` on 10-min timeout, hiding stalled drains from systemd.
   - *Blast radius:* Silent queue loss, masked timer hangs, and corrupted post-exception app state.

---

## 5. INVENTORY

| File | Purpose | Callers (non-test `rg`) | Verdict |
|---|---|---|---|
| `index.js` | Express server bootstrap, routes, startup init, shutdown | Process entrypoint | Keep; cut `/api/cron/warmup`, `/api/clear-cache`, `hasGlobalErdb` |
| `src/config.js` | Static app constants (`CATALOG_PAGE_SIZE`, TTLs, Bayesian params) | `cacheInstances.js`, `catalogHandler.js`, `tmdb.js`, `tmdbBudget.js`, `ricerca/*` | Keep; cut unused `SERIES_META_SWR_MS` & `CATALOG_PAGE_SIZE` env |
| `src/db/connection.js` | Mongoose connection + triggers `ensureLibraryIndexesSafe` | `index.js:17` | Keep |
| `src/posters/index.js` | Barrel re-exporting all poster submodules | `src/api/staticPosters.js:13`, `scripts/push-diff-in-coda.js:59` | **Delete** (eagerly pulls Redis, DuckDB, and CLI builder into boot) |
| `src/posters/drenaCodaPoster.js` | Host-timer CLI (`docker exec`) draining Redis poster queue | `ops/yaca-poster-eventi.service:34`, `src/posters/index.js:17` | **Shrink** (decouple from `animeMappingStore.init()`/`duckDbStore`, use `AbortSignal.timeout`) |
| `src/posters/drenaPoster.js` | Queue batch downloader + JPEG magic check + temp-rename writer | `drenaCodaPoster.js:17`, `staticPosters.js:13` (`scarica`/`scrivi`) | **Shrink** (reuse `atomicWrite.scriviAtomico`, add `AbortSignal.timeout`) |
| `src/posters/gcPosterCache.js` | Host-timer CLI (`docker exec`) pruning `.tmp` and >60d posters | `ops/yaca-poster-gc.service:17` | Keep (fix `NaN` CLI validation / bound `stat` concurrency) |
| `src/posters/codaEventi.js` | Redis list+hash poster event queue (`push`/`take`/`done`/`fail`/`aspettaRedis`) | `staticPosters.js:145`, `drenaCodaPoster.js:23`, `scripts/push-diff-in-coda.js:59` | **Shrink** (drop `pushWithStatus`, replace `aspettaRedis` poll with `events.once`) |
| `src/posters/posterDaEvento.js` | Translates queue events <-> filenames <-> ERDB IDs | `staticPosters.js:13`, `drenaPoster.js:48`, `drenaCodaPoster.js:19`, `gcPosterCache.js:18`, `libraryPosterRefresh.js:38`, `StremioFormatter.js:18` | **Shrink** (drop unused `nomeFileDaEvento`, `urlDaEvento`) |
| `src/posters/erdb/build.js` | Poster filename/URL helpers + 287-line offline bulk builder CLI | `StremioFormatter.js:9`, `posterDaEvento.js:21`, `drenaPoster.js:49`, `drenaCodaPoster.js:20`, `libraryPosterRefresh.js:39`, `scripts/erdb-builder/build.js:2` | **Split** (move offline CLI `run`/`main`/`parseArgs` back to `scripts/erdb-builder/build.js`) |
| `src/posters/volumeContract.js` | `versioni.json` read/write + in-memory hit/miss counters | `staticPosters.js:20`, `drenaCodaPoster.js:22`, `gcPosterCache.js:19`, `erdb/build.js:25`, `scripts/qa/probe-poster-volume.js:33` | **Shrink** (drop unused `verificaPresenzaPoster`, `azzeraStatistichePoster`) |
| `src/posters/sorgenti.js` | `sorgenti.json` token map (sync disk I/O + 60s RAM cache) | `StremioFormatter.js:10`, `drenaPoster.js:50`, `drenaCodaPoster.js:21`, `posterDaEvento.js:22`, `libraryPosterRefresh.js:40`, `erdb/build.js:26` | **Shrink** (drop unused `leggiMappa`, `scriviToken`, `resetCache`; review sync I/O) |
| `src/posters/posterResolver.js` | Library item poster lookup (DuckDB -> TMDB fallback) | `src/api/profilo.js:296`, `LibraryConverterService.js:8`, `LibrarySyncService.js:6` | Keep |
| `src/posters/libraryPosterRefresh.js` | Rewrites stored library poster URLs to current version/hash | `LibrarySyncService.js:8` | **Shrink** (cut legacy `refreshComposedPoster` branch) |
| `src/api/staticPosters.js` | Express routes `/erdb-poster/:file`, `/health`, `/versioni` | `index.js:37`, `StremioFormatter.js:13`, `ingestionStatus.js:5` | **Shrink** (import submodules directly, cut `/versioni` & fake lazy-require) |
| `src/api/admin.js` | Admin metrics, cache flush, script trigger, status endpoints | `index.js:35` | **Shrink** (cut stub `/tmdb-dump/backup`) |
| `src/api/catalog.js` | `POST /api/preview-catalog` endpoint | `index.js:36` | Keep |
| `src/api/stremio.js` | Stremio manifest/catalog/meta/stream/legacy-poster/fallback routes | `index.js:33` | **Shrink** (cut `/images/poster/...` legacy redirect & `erdbHeadCache` if unneeded) |
| `src/api/tmdb.js` | TMDB autocomplete & key validation proxy routes | `index.js:34` | Keep |
| `src/api/profilo.js` | Authenticated user profile, modes, library, sync & cache-clear routes | `index.js:40` | **Shrink** (cut `hasGlobalErdb` & dead `BASE_URL` env check) |
| `src/api/configurazione.js` | Authenticated config save, preview, verify routes | `index.js:41` | **Shrink** (cut `hasGlobalErdb`) |
| `src/api/ricerca.js` | Authenticated search endpoint | `index.js:42` | Keep |
| `src/catalog/itaAnnotations.js` | Streams `ita_annotations.jsonl` into 60s TTL RAM `Map` | `badges.js:8`, `meta.js:24`, `ingestionStatus.js:4`, `scripts/convert_to_parquet.js:4`, `tmdbIngestPolicy.js:4` | **Shrink** (cut unused env overrides and `isDubbed` wrapper) |
| `src/cache/index.js` | Descriptor-based `deriva`/`leggi`/`scrivi`/`cancella` + `finalMetaCache` + `defaultCache` | `catalogDefinition.js:7`, `pool/index.js:15`, `catalogHandler.js:14`, `hybridServing.js:16`, `meta.js:15` | **Delete / Shrink** (cut `defaultCache`, `buildRecommendationCacheKey`, flatten `deriva`) |
| `src/cache/CacheManager.js` | Two-tier L1 LRU + L2 Redis JSON envelope cache + single-flight | `cache/index.js:2`, `cacheInstances.js:1`, `tmdb.js:20`, `stremio.js:23`, `admin.js:3` | Keep (fix blocking `KEYS` in `clear`/`getStats`) |
| `src/cache/cacheInstances.js` | Preallocated `hybridRecommendationsCache`, `catalogRequestCache`, `shelvesCache` | `cache/index.js:3`, `pool/index.js:16`, `shelvesResolver.js:24`, `profilo.js:25`, `admin.js:7`, `index.js:225` | Keep (remove broken `aiDiscoveryCache` import in `index.js:225`) |
| `src/cache/redisClient.js` | Singleton `ioredis` client with `isAvailable` getter & test stub | `CacheManager.js:2`, `codaEventi.js:1`, `drenaCodaPoster.js:485`, `admin.js:4`, `scripts/*` | Keep |
| `src/cache/requestHash.js` | Deterministic SHA-256 hash for `catalog_page` cache keys | `src/cache/index.js:5` | Keep |
| `src/cache/shelfKey.js` | Deterministic SHA-256 key + mode key for `POST /scaffali` cache | `src/pool/index.js:17,553`, `src/stremio/shelvesResolver.js:25` | Keep |
| `src/indice/duckDbStore.js` | DuckDB persistent/RAM catalog store, swap detection, DF/keyword cache | `src/indice/index.js:12` | **Shrink** (strip Windows swap loop, dead `DUCKDB_*` env vars, `queryRaw`) |
| `src/indice/index.js` | Facade over DuckDB, compiler, tier2, people, `HierarchicalGraph` | `index.js:52`, `badges.js:9`, `meta.js:23`, `presets.js:4`, `posterResolver.js:1`, `mapping.js:264` | Keep |
| `src/indice/HierarchicalGraph.js` | Loads `1.03 MB` `hierarchical_graph.json` at require-time + keyword LRU caches | `src/indice/index.js:336`, `duckDbStore.js:1038`, `ProfileScorer.js:159` | Keep (make load lazy instead of constructor-eager) |
| `src/anime/mapping.js` | Loads `10.53 MB` `anime-mappings.json` every 60s + syncs `anime_mappings` to DuckDB | `index.js:48`, `drenaCodaPoster.js:495`, `meta.js:17`, `badges.js:12`, `airing.js:731` | **Shrink** (decouple `syncDuckDb()` from read-only consumers like `drenaCodaPoster`; use async read) |
| `src/anime/airing.js` | Reads `anime_airing_state` Mongo collection into 60s TTL RAM snapshot | `badges.js:11`, `meta.js:18`, `ingestionStatus.js:3` | Keep |
| `src/stremio/reconciler.js` | Startup sequential manifest fingerprint bump + Stremio Cloud sync | `index.js:275` (`src/stremio/index.js:5`) | Keep (consider making on-demand/batched if user count grows) |
| `src/clients/tmdbBudget.js` | TMDB call categorization, metrics, and unused cap/window enforcer | `src/clients/tmdb.js:17` | **Shrink** (cut dead `TMDB_CAP_*` cap logic & `SERIES_META_SWR_MS`) |
| `src/ricerca/tier2Enrich.js` | Bounded-budget TMDB enrichment for Tier 2 search page results | `src/ricerca/ricercaUnificata.js:100` | **Shrink** (drop `_tmdb`/`_learnedNames` wrapper caches) |
| `src/ricerca/learnedNames.js` | SQLite store (`learned_names.db`) for Italian titles learned from Tier 2 | `tier2Enrich.js:72`, `tier2Search.js:45`, `src/ricerca/index.js:162`, `scripts/seed_learned_names.js:38` | **Shrink** (reuse `src/infra/testo.js:normalizza`, review sync `LIKE '%...%'` scan) |
