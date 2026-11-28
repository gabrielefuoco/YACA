# YACA Background / Ops Audit (Host-Side, `ops/**` & `docker-compose.yml`)

Read-only ponytail audit of host-side background automation in `C:/Users/gabri/APP/YACA`.
Scope: `ops/**` (42 files, 2,540 lines), `docker-compose.yml` (189 lines), and their repo targets.

---

## 1. Ranked Ponytail List (Biggest Cut First)

1. `delete` Remove `ops/timing/**` (13 one-off profiling/benchmark scripts, 898 lines). Nothing in the repo calls them; store ad-hoc probes in `.scratch/` or git history. [ops/timing/README.md:1-53](file:///C:/Users/gabri/APP/YACA/ops/timing/README.md#L1-L53) (`git grep -n "timing/" -- ':!.scratch'` matches only `ops/timing/**` itself; zero callers in `src/`, `services/`, `scripts/`, `.github/`, or `ops/*.service`)
2. `delete` Remove `ops/erdb-legion/{compose.yml,costruisci.js,finto-provider.js,inserisci-token.js,prova-badge.sh}` (5 one-time Legion bulk-prefill files, 302 lines). Nothing in production or CI runs them; the Legion run is finished (`"Il giro è una tantum: la cartella si butta quando ha finito"`). [ops/erdb-legion/compose.yml:23-24](file:///C:/Users/gabri/APP/YACA/ops/erdb-legion/compose.yml#L23-L24) (`git grep -n "erdb-legion" -- ':!.scratch'` matches only files inside `ops/erdb-legion/`)
3. `delete` Remove `ops/yaca-dump-backup.sh`, `ops/yaca-dump-backup.service`, `ops/yaca-dump-backup.timer`, `ops/yaca-dump-backup-full.service`, and `ops/yaca-dump-backup-full.timer` (5 files, 286 lines). Superseded by off-box `rclone` backups to Google Drive; all 3 units are disabled in production. [ops/yaca-dump-backup.sh:1-230](file:///C:/Users/gabri/APP/YACA/ops/yaca-dump-backup.sh#L1-L230) (`git grep -n "yaca-dump-backup" -- ':!docs' ':!.scratch'` matches only `ops/yaca-dump-backup*` and `ops/server.env.example:89`)
4. `delete` Archive or remove `ops/erdb-legion/README.md` and `ops/erdb-legion/patch/{erdb-badge.patch,erdb-formato.patch}` (3 files, 283 lines) if `erdb-patch:0.7.5` image is already saved/pushed; otherwise keep only the 99-line `patch/` pair to rebuild `8251427`. Nothing automated reads them. [ops/erdb-legion/README.md:14-72](file:///C:/Users/gabri/APP/YACA/ops/erdb-legion/README.md#L14-L72) (`git grep -n "erdb-badge.patch\|erdb-formato.patch"` matches only `ops/erdb-legion/README.md:69-70`)
5. `delete` Remove `ops/yaca-backup.sh`, `ops/yaca-backup.service`, and `ops/yaca-backup.timer` (3 files, 168 lines) along with dead stub `POST /api/tmdb-dump/backup` and `tests/backupDumpRetry.test.js`. Superseded by off-box `rclone` backups to Google Drive; timer is disabled in production. [ops/yaca-backup.sh:1-139](file:///C:/Users/gabri/APP/YACA/ops/yaca-backup.sh#L1-L139) (`git grep -n "yaca-backup" -- ':!docs' ':!.scratch'` matches only `ops/`, `src/api/admin.js:115,118`, and `tests/backupDumpRetry.test.js:3,17,69`)
6. `shrink` Collapse `ops/yaca-doppiaggi.sh` (165 lines -> ~55 lines, -110 lines): drop runtime `npm install` + 5-path `NPM_BIN` search (lines 58-81), drop 5-path `NODE_BIN` search (lines 35-48, redundant with `Environment="PATH=..."` in `ops/yaca-doppiaggi.service:13`), drop `--health-check` loop (lines 84-88, never passed by the service unit), and drop container-only `/data/tmdb` probe (lines 93-94). Keep the `cli.js` + `push-diff-in-coda.js` flow unless moved into a container. [ops/yaca-doppiaggi.sh:35-107](file:///C:/Users/gabri/APP/YACA/ops/yaca-doppiaggi.sh#L35-L107) (verified in `ops/yaca-doppiaggi.service:12-15` and `git grep -n "yaca-doppiaggi.sh"`)
7. `native` Or replace `ops/yaca-anime-source-watchdog.sh` + `.service` + `.timer` (171 lines) by moving the 6h `last-home-run.json` freshness check into `services/anime-source/src/discovery.js` (`checkHealth`) and having `services/anime-source/cli.js` exit `1` on stale home so Docker `restart: unless-stopped` restarts it natively — **caveat: deleting the enabled 15-min timer without moving that check leaves a wedged `yaca-anime-source` container `Up (unhealthy)` indefinitely, silently dropping simulcast titles after 3 days**. [ops/yaca-anime-source-watchdog.service:8-12](file:///C:/Users/gabri/APP/YACA/ops/yaca-anime-source-watchdog.service#L8-L12) (`docker-compose.yml:110,120-127`; `services/anime-source/src/discovery.js:213-227`)
8. `shrink` If keeping the watchdog, cut `ops/yaca-anime-source-watchdog.sh` (130 lines -> ~30 lines, -100 lines) and delete unused `EnvironmentFile=-/srv/yaca/.env` in `ops/yaca-anime-source-watchdog.service:19` (-1 line): remove verbose `--dry-run`/`-h` arg parser (lines 30-44) and `command -v docker`/`docker info` preflight boilerplate (lines 69-85). [ops/yaca-anime-source-watchdog.sh:30-85](file:///C:/Users/gabri/APP/YACA/ops/yaca-anime-source-watchdog.sh#L30-L85) (`grep` confirms zero `.env` variables used in `ops/yaca-anime-source-watchdog.sh`)
9. `delete` Remove `ops/yaca-grafo.service` and `ops/yaca-grafo.timer` (2 files, 44 lines). Disabled in production; invokes archived V18 script `.scratch/graph_dense-archive/aggiorna.py` which calls Windows `py` and writes to the wrong directory. [ops/yaca-grafo.service:23](file:///C:/Users/gabri/APP/YACA/ops/yaca-grafo.service#L23) (`git grep -n "yaca-grafo" -- ':!docs' ':!.scratch'` matches nothing outside `ops/yaca-grafo.*`)
10. `shrink` Deduplicate the 6 identical 5-line `logging:` blocks in `docker-compose.yml` (30 lines -> 8 lines using a YAML anchor `x-logging`, -22 lines). [docker-compose.yml:13-17](file:///C:/Users/gabri/APP/YACA/docker-compose.yml#L13-L17) (repeated at lines 67-71, 101-105, 128-132, 152-156, 175-179)
11. `delete` Remove Cloudflare R2 backup env vars (`R2_DESTINATION`, `BACKUP_RETENTION_DAYS`, `JSONL_RETENTION_DAYS`, `R2_*`) from `ops/server.env.example:85-106` (-22 lines) once the disabled backup scripts are removed, and drop `PORT`/`REDIS_URL` lines (lines 13, 31) that `docker-compose.yml:35-36` explicitly overrides (-2 lines). [ops/server.env.example:85-106](file:///C:/Users/gabri/APP/YACA/ops/server.env.example#L85-L106) (`docker-compose.yml:34-36`)
12. `native` Remove redundant `-e ERDB_LOCAL_BASE=${ERDB_LOCAL_BASE} -e ERDB_CACHE_DIR=${ERDB_CACHE_DIR}`, `EnvironmentFile=-/srv/yaca/.env`, and `Restart=no` (already the systemd default for `Type=oneshot`) from `ops/yaca-poster-eventi.service:31,34-35` and `ops/yaca-poster-gc.service:14,17-18` (-7 lines), because `yaca-app` already mounts `.env` via `env_file: - .env` (`docker-compose.yml:31-32`). [ops/yaca-poster-eventi.service:31-35](file:///C:/Users/gabri/APP/YACA/ops/yaca-poster-eventi.service#L31-L35)

**Total cut potential:** **-2,245 lines** across `ops/**` & `docker-compose.yml` (items 1-6 + 8-12; **-2,315 lines** if item 7 replaces the watchdog natively inside `anime-source`), **32 of 42 files** in `ops/` removable (35 if watchdog is replaced).

---

## 2. ORPHANS (Missing Targets, Broken Links, Duplication, Drift)

- **Archived/broken target in `ops/yaca-grafo.service:23`:**
  - Calls `ExecStart=/usr/bin/env python3 -m services.graph_dense.aggiorna`.
  - `services/graph_dense/README.md:3-14` states V45 moved to `services/graph/` and `services/graph_dense` only shims historical research scripts in `.scratch/graph_dense-archive/` (`services/graph_dense/__init__.py:12-16`).
  - `Test-Path services/graph_dense/aggiorna.py` -> `False`; `Test-Path services/graph/aggiorna.py` -> `False`; the only file is `.scratch/graph_dense-archive/aggiorna.py`.
  - Inside `.scratch/graph_dense-archive/aggiorna.py`: line 44 checks `/data/tmdb/dump_status.json` (container path absent on host, and `guardia()` at lines 57-58 returns `True` when missing); lines 112, 166, 167, 171 invoke Windows `py` (`py .scratch/distillazione-grafo/...`); lines 168-170 write V18 artifacts to `services/graph_dense/data/graph/`, whereas `docker-compose.yml:92` mounts `/srv/yaca/services/graph/data:/app/services/graph/data:ro`.
- **Container path checked on host in `ops/yaca-doppiaggi.sh:93`:**
  - Checks `-f "/data/tmdb/master_movies.jsonl"` first; `/data/tmdb` is a container mount (`docker-compose.yml:46,143`) and does not exist on the host, falling back to `/var/lib/docker/volumes/yaca_tmdb/_data` (`ops/yaca-doppiaggi.sh:95`).
- **Health-check duplication (`ops/yaca-anime-source-watchdog.sh:103` vs `docker-compose.yml:122-127`):**
  - `docker-compose.yml:123` already runs `node cli.js --health-check` every 5m inside `yaca-anime-source`.
  - `ops/yaca-anime-source-watchdog.sh:103` re-runs `docker exec yaca-anime-source node cli.js --health-check` from the host, then runs a second `docker exec ... stat -c %Y /app/.cache/last-home-run.json` (`ops/yaca-anime-source-watchdog.sh:110`) because `services/anime-source/src/discovery.js:213-227` checks `zeroItems === true` on `last-home-run.json` but does not check its age (>6h), and Docker Engine does not auto-restart `unhealthy` containers (`docker-compose.yml:121`).
- **Superseded backup scripts + orphaned in-app references (`ops/yaca-backup.*`, `ops/yaca-dump-backup*`):**
  - Disabled on matebook and replaced by off-box Google Drive `rclone` (`docs/todo/4_tmdb_dump_riavvii_e_backup.md:63`).
  - `src/api/admin.js:114-120` still exposes `POST /api/tmdb-dump/backup` returning `{ success: true, message: 'Il backup dei dati è gestito in ops/yaca-backup.sh' }`.
  - `scripts/qa/preflight-deploy.js:95` still references deleted `ops/yaca-tmdb-daemon.{service,timer}` (replaced by `tmdb-daemon` service in `docker-compose.yml:134-156`).
- **Timer schedule & unit-name drift between git checkout and production:**
  - `ops/yaca-poster-eventi.timer:8` specifies 10 min (`*:00,10,20,30,40,50:00`), while production runs every 5 min.
  - `ops/yaca-anime-source-watchdog.timer:6` specifies 30 min (`*:07,37:00`), while production runs every 15 min.
  - `src/posters/drenaCodaPoster.js:56` error log tells operators to inspect `systemctl status yaca-drena` / `journalctl -u yaca-drena`, whereas the unit is `yaca-poster-eventi`.
  - `ops/server.env.example` omits `ERDB_LOCAL_BASE` even though `ops/yaca-poster-eventi.service:34` and `src/api/staticPosters.js:189` require it.
- **Obsolete free-tier keepalive route (`index.js:150-152`):**
  - `GET /api/cron/warmup` ("Uptime Robot Keep-Alive" for Scale-to-Zero free tiers) has no caller in the repo (`git grep -n "cron/warmup"` matches only `index.js:150`).

---

## 3. FRAGILITY (Path:Line Evidence & Blast Radius — No Fixes)

1. **Unprotected concurrent reads/writes on shared `yaca_tmdb` volume (`services/tmdb-daemon/tmdbDumpStore.js:82-192`, `ops/yaca-doppiaggi.sh:95,126-130`, `services/doppiaggi-source/src/writer.js:128-137`, `src/catalog/itaAnnotations.js:58-97`):**
   - `yaca-tmdb-daemon` writes `master_movies.jsonl` / `master_tv.jsonl` via `fs.appendFileSync` and `_processFileSafely` (`fs.renameSync`) while `yaca-doppiaggi.sh` reads those files directly from `/var/lib/docker/volumes/yaca_tmdb/_data` without any lock or snapshot.
   - `yaca-doppiaggi.sh` writes `ita_annotations.jsonl`, `ita_annotations.meta.json` (non-atomic `fs.writeFileSync` at `writer.js:137`), and `ita_annotations.diff.json` into the live volume read by `yaca-app`, and runs `npm install` (`ops/yaca-doppiaggi.sh:58-81`) as `root` inside `/srv/yaca/services/doppiaggi-source`.
   - **Blast radius:** Reading `master_*.jsonl` mid-append/swap can drop or truncate lines in `loadCatalogFromJsonl`, triggering the 2% drop guard (`writer.js:112-125`), exiting `2`, zeroing `ita_annotations.diff.json` (`giro.js:98-108`), and stalling all ITA badge updates + poster invalidations for 12h.
2. **No concurrency lock on `yaca-poster-eventi.timer` (5-min schedule vs 10-min/15-min timeout) + silent timeout exit `0` (`ops/yaca-poster-eventi.service:39`, `src/posters/drenaCodaPoster.js:29,504`, `src/posters/codaEventi.js:167-186`):**
   - `codaEventi.take(10)` reads `LRANGE 0..9` **without** removing items from Redis until `done()`/`fail()`, and neither `drenaCodaPoster.js` nor `yaca-poster-eventi.service` acquires any lock.
   - `drenaCodaPoster.js:504` terminates via `setTimeout(() => process.exit(process.exitCode || 0), 600000)`, exiting `0` silently without logging or closing Redis.
   - **Blast radius:** If `animeMappingStore.init()` (up to 90s, line 28) or ERDB stalls past 5 min, the next timer tick spawns a concurrent `docker exec` that processes the exact same 10 events, causing duplicate ERDB renders, racing `done`/`fail` counts (`MAX_TENTATIVI=5`), and concurrent overwrites of `versioni.json` (`drenaCodaPoster.js:344` vs `staticPosters.js:19`).
3. **Host/container split-brain deploy & silent-zero failures visible only in `journalctl` (`docker-compose.yml:158-179`, `ops/yaca-anime-source-watchdog.sh:23-24,65,130`, `src/posters/drenaCodaPoster.js:35-36,474`, `scripts/qa/preflight-deploy.js:13`):**
   - `watchtower` (`WATCHTOWER_POLL_INTERVAL=3600`, `WATCHTOWER_CLEANUP=true`, `:latest` image tags) recreates `yaca-app`, `yaca-graph`, `yaca-anime-source`, and `yaca-tmdb-daemon` without updating `/srv/yaca` checkout or re-applying `docker-compose.yml`.
   - `yaca-poster-eventi.service` and `yaca-anime-source-watchdog.service` intentionally exit `0` on Redis unavailability, ERDB errors, health-check failures, and even failed `docker restart` (`ops/yaca-anime-source-watchdog.sh:65`); `docker exec` also fails if triggered while Watchtower is recreating `yaca-app`.
   - **Blast radius:** Failures never raise systemd `failed` state or alerts (buried in `journalctl` only); Watchtower upgrades can skew container scripts (`drenaCodaPoster.js`, `gcPosterCache.js`, `push-diff-in-coda.js`) from host `ops/` units and compose env vars.
4. **Live-volume races on `yaca_erdb_cache` and `docker restart` mid-write on `yaca_anime_source_cache` (`src/posters/gcPosterCache.js:88-108,133`, `ops/yaca-anime-source-watchdog.sh:62`, `services/anime-source/src/discovery.js:75,158,283`):**
   - `gcPosterCache.js` relies solely on a 60-min `mtime` grace period (`WRITER_GRACE_MS`) while `yaca-app` (`staticPosters.js`) and `drenaCodaPoster.js` write/read `/data/erdb-cache` concurrently (and `gcPosterCache.js:133,135` does not guard `NaN` from `parseInt`).
   - `yaca-anime-source-watchdog.sh:62` runs `docker restart yaca-anime-source` with no lock while `discovery.js:75,158,283` uses non-atomic `fs.writeFileSync` for `airing-series.json`, `dubbed-series.json`, and `last-run.json`.
   - **Blast radius:** `SIGTERM`/10s `SIGKILL` during `docker restart` can truncate `airing-series.json` or `dubbed-series.json` on disk.
5. **Unbounded host cache/journal growth (`ops/yaca-doppiaggi.sh:32`, `services/doppiaggi-source/src/resolvedIdentities.js:16`, `ops/yaca-anime-source-watchdog.sh:103,110`, `ops/yaca-dump-backup.sh:108-180`):**
   - `services/doppiaggi-source/.cache/` (79 HTML pages + `tmdb-api` JSON cache) has no GC/pruning; `yaca-anime-source-watchdog` runs up to 2 `docker exec` calls every 15 min (192/day) logging to `journald` (unbounded unless capped in host `journald.conf`).
   - Disabled `ops/yaca-dump-backup.sh` uses unlocked `docker cp` from live containers into `/tmp` (risking torn `parquet`/`jsonl`/`json` copies and `/tmp` exhaustion).
   - **Blast radius:** Gradual disk pressure on host root/var from unpruned HTML/TMDB caches and high-frequency watchdog journal logs.

---

## 4. INVENTORY (`ops/**` — 42 files, plus `docker-compose.yml`)

| File | Purpose | Scheduled / State | Still Needed? |
|---|---|---|---|
| `ops/yaca-poster-eventi.service` | Runs `drenaCodaPoster.js` inside `yaca-app` via `docker exec` | Triggered by enabled timer | **Yes** |
| `ops/yaca-poster-eventi.timer` | Schedules poster queue drain (10m in repo; 5m in prod) | **Enabled** (every 5 min) | **Yes** |
| `ops/yaca-poster-gc.service` | Runs `gcPosterCache.js --max-delete 500 --ttl-days 60` in `yaca-app` | Triggered by enabled timer | **Yes** |
| `ops/yaca-poster-gc.timer` | Daily 05:00 poster cache GC | **Enabled** (daily) | **Yes** |
| `ops/yaca-doppiaggi.sh` | Scrapes Antonio Genna, merges Mongo anime, writes `ita_annotations.*`, pushes diff | Triggered by enabled timer | **Yes** (needs shrink) |
| `ops/yaca-doppiaggi.service` | Runs `ops/yaca-doppiaggi.sh` as root on host | Triggered by enabled timer | **Yes** |
| `ops/yaca-doppiaggi.timer` | Schedules dubbing scrape (04:00 & 16:00) | **Enabled** (every 12 h) | **Yes** |
| `ops/yaca-anime-source-watchdog.sh` | Checks `yaca-anime-source` state, `--health-check`, and 6h `last-home-run.json` age | Triggered by enabled timer | **Unclear** (needed until check moves in-container) |
| `ops/yaca-anime-source-watchdog.service` | Runs `ops/yaca-anime-source-watchdog.sh` | Triggered by enabled timer | **Unclear** (same as above) |
| `ops/yaca-anime-source-watchdog.timer` | Schedules watchdog (30m in repo; 15m in prod) | **Enabled** (every 15 min) | **Unclear** (same as above) |
| `ops/yaca-backup.sh` | Dumps MongoDB Atlas (`mongodump`) to Cloudflare R2 via `rclone` | Triggered by disabled timer | **No** (superseded by off-box `rclone`) |
| `ops/yaca-backup.service` | Runs `ops/yaca-backup.sh` | Disabled | **No** |
| `ops/yaca-backup.timer` | Daily 03:30 MongoDB backup schedule | **Disabled** | **No** |
| `ops/yaca-dump-backup.sh` | `docker cp` parquet/cursor/anime/JSONL files to R2 via `rclone` | Triggered by disabled timers | **No** (superseded by off-box `rclone`) |
| `ops/yaca-dump-backup.service` | Daily light dump backup unit | Disabled | **No** |
| `ops/yaca-dump-backup.timer` | Daily 04:30 light dump backup schedule | **Disabled** | **No** |
| `ops/yaca-dump-backup-full.service` | Weekly full JSONL backup unit (`--full`) | Disabled | **No** |
| `ops/yaca-dump-backup-full.timer` | Weekly Sunday 05:00 full dump backup schedule | **Disabled** | **No** |
| `ops/yaca-grafo.service` | Runs archived `python3 -m services.graph_dense.aggiorna` | Disabled | **No** (target archived/broken) |
| `ops/yaca-grafo.timer` | Daily 05:30 graph update schedule | **Disabled** | **No** |
| `ops/server.env.example` | Production `/srv/yaca/.env` template | Manual reference | **Yes** (trim R2/override vars; add `ERDB_LOCAL_BASE`) |
| `ops/erdb-legion/README.md` | Docs for one-time Legion ERDB build & prefill | Manual / none | **Unclear** (keep only if rebuilding `erdb-patch:0.7.5`) |
| `ops/erdb-legion/compose.yml` | Local Legion container for `erdb-patch:0.7.5` | Manual / none | **No** (one-time prefill done) |
| `ops/erdb-legion/costruisci.js` | Bulk poster prefill wrapper around `src/posters/erdb/build.js` | Manual / none | **No** (one-time prefill done) |
| `ops/erdb-legion/finto-provider.js` | Stub stream server on `:3112` to skip torrent badge checks | Manual / none | **No** (one-time prefill done) |
| `ops/erdb-legion/inserisci-token.js` | Inserts ERDB token config into `accounts.db` | Manual / none | **No** (one-time prefill done) |
| `ops/erdb-legion/prova-badge.sh` | Verifies `?badge=ITA` alters JPEG byte size | Manual / none | **No** (one-time prefill done) |
| `ops/erdb-legion/patch/erdb-badge.patch` | 36-line ERDB patch adding `customBadge` rendering & cache key | Manual / none | **Unclear** (needed only to rebuild `erdb-patch:0.7.5`) |
| `ops/erdb-legion/patch/erdb-formato.patch` | 5-line ERDB patch honoring `Accept: image/jpeg` | Manual / none | **Unclear** (needed only to rebuild `erdb-patch:0.7.5`) |
| `ops/timing/README.md` | Instructions for ad-hoc HTTP/runtime/V8 profiling | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/analyze-idle.js` | Offline `.cpuprofile` idle-block analyzer | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/analyze-paths.js` | Offline `.cpuprofile` caller-path analyzer | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/analyze-profile.js` | Offline `.cpuprofile` self/total time aggregator | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/bench-http.sh` | Endpoint latency benchmark (hardcoded UUID) | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/bench-io.sh` | Per-request `/proc/net/dev` byte counter (hardcoded UUID) | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/bench-meta.sh` | Cold vs warm `/meta/series` + Redis size check | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/bench-search.sh` | Cold vs warm search latency + description count | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/probe-missing.js` | Checks Tier 2 search hits missing from Redis cache | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/probe-net.js` | Polls `/proc/net/tcp` connections during HTTP request | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/probe-profile.js` | Captures V8 `.cpuprofile` via `:9229` inspector | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/probe-runtime.js` | Benchmarks `statSync`, Redis `PING`, Mongo `findOne` | Manual / none | **No** (dev scratch artifact) |
| `ops/timing/probe-search.js` | Benchmarks FTS5, `learned_names.db`, Redis detail parse | Manual / none | **No** (dev scratch artifact) |

*Compose summary (`docker-compose.yml`):* 6 services (`redis`, `app`, `graph`, `anime-source`, `tmdb-daemon`, `watchtower`), all `restart: unless-stopped`, all with `json-file` 30m log cap, all except `redis`/`watchtower` labeled `com.centurylinklabs.watchtower.enable=true`.
