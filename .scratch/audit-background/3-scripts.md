# Over-Engineering Audit (Ponytail Style): `scripts/`

> **Scope**: All 68 files (18,298 lines) under `scripts/`, **excluding** `convert_to_parquet.js`, `build-people-index.js`, `build-sorelle-affini.js`, `backfill-runtime-ignoto.js`.  
> **Production facts**: No systemd timer or Docker Compose service invokes `scripts/` outside the 4 excluded files—**except** `ops/yaca-doppiaggi.sh:150`, which executes `scripts/push-diff-in-coda.js` inside `yaca-app`.

---

## 1. Ranked Ponytail List (Biggest Cut First)

- `delete` 16 one-shot Python graph probes (`probe-ticket-{02..12,17..19,22,23}-*.py`) plus untracked `.pyc` bytecode cache. Nothing (15/16 crash with `ModuleNotFoundError` because `motore.py`/`bubbles.py`/`uscite.py` moved to `services/graph/_archivio-v10/`, and `services/graph/tests/` already runs the v45/v46 pytest suite; remove line-ref in `services/graph/parametri.py:322`). [scripts/qa/probe-ticket-05-gemme.py:1] (4,243 lines across 17 files; verified `Test-Path services/graph/{motore,bubbles,uscite}.py` = `False`)
- `delete` Generated `relevance_validation_report.json` and obsolete live-TMDB preset validator `test_relevance_all_presets.js`. Nothing (`scripts/qa/catalog-audit.js` already validates all SQL presets offline against DuckDB). [scripts/relevance_validation_report.json:1] (2,036 lines across 2 files; untracked JSON artifact + incomplete param checks)
- `delete` 9 one-shot Mongo/poster migrations (`migra-host-poster.js`, `migra-modi.js`, `migra-poster-versione-sorgente.js`, `migrate_hero_presets.js`, `migrate_library_itemid_null.js`, `migrate_library_order.js`, `migrate_profile_ui_state.js`, `migrate_trakt_credentials.js`, `migrate_user_credentials.js`). Nothing (one-shot migrations already applied; point `tests/ticket14CatalogFixes.test.js:5` to `normalizeLibraryId` in `src/library/identity.js:45`). [scripts/migrate_hero_presets.js:1] (1,191 lines across 9 files; 0 runtime callers)
- `delete` 4 one-shot DuckDB/telemetry JS probes (`probe-gusto-holdout.js`, `probe-ticket-55-mondi.js`, `probe-perdita-righe.js`, `probe-diagnosi-titolo.js`). Nothing (`probe-gusto-holdout.js` and `probe-diagnosi-titolo.js` hardcode `C:\Users\gabri\...\python.exe` and call missing `services/graph/measure/call_motore.py`; `55` and `01` are solved ticket diagnostics). [scripts/qa/probe-gusto-holdout.js:31] (1,241 lines across 4 files; `Test-Path services/graph/measure/call_motore.py` = `False`)
- `delete` 4 one-shot infra/volume JS probes (`probe-duckdb-reopen-barrier.js`, `probe-poster-volume.js`, `probe-duckdb-lock.js`, `probe-duckdb-reopen.js`). Nothing (behavior belongs in Jest `tests/`; `probe-duckdb-lock.js:41` also leaks `.cache/tmdb_probe_*` dirs). [scripts/qa/probe-duckdb-reopen-barrier.js:1] (826 lines across 4 files; zero callers)
- `delete` `backfill-mediatype-anime.js` one-shot `anime_airing_state.mediaType` backfill (plus its dedicated `tests/backfillMediatypeAnime.test.js`). Nothing (`services/anime-source` writes `mediaType` natively). [scripts/backfill-mediatype-anime.js:1] (680 lines; one-shot Mongo patch)
- `delete` `verifyTypeSelectors.js` one-shot A/B repro harness. Nothing (`tests/` unit tests; hardcodes Windows `C:/Users/.../typescript`, dead `yaca_true_blend_*` IDs, `raw_ui_state`, and magic counts `13`/`11`). [scripts/qa/verifyTypeSelectors.js:65] (427 lines; stale pre-`MODI` harness)
- `delete` 4 one-shot tuning/measurement JS probes (`probe-hidden-gems-jaccard.js`, `probe-ticket-21-taratura.js`, `probe-hero-counts.js`, `probe-ticket-14-impressioni.js`, `measure-cjk-titles.js`). Nothing (`probe-hidden-gems-jaccard.js:17-18` crashes importing removed `HERO_STRATEGIES`/`setFlagNewHiddenGems`; others are closed tuning probes). [scripts/qa/probe-hidden-gems-jaccard.js:17] (690 lines across 5 files; `rg HERO_STRATEGIES src/` = 0)
- `delete` One-shot sync-bug history repair/cleanup scripts (`ripara-cronologia.js`, `pulisci-cronologia-profili.js`). Nothing (one-shot DB repairs from 2026-11-10; dangerous if re-run). [scripts/ripara-cronologia.js:1] (313 lines across 2 files)
- `delete` `backfill-cjk-titles.js` one-shot Ticket 14 CJK backfill. Inline/move 20-line `findCompromisedIds` into `services/tmdb-daemon/tests/resolveIngestTitle.test.js:9` (ingest prevents CJK titles at source per `docs/DUCKDB_ARCHITECTURE.md:86`). [scripts/backfill-cjk-titles.js:1] (229 lines)
- `delete` `fetch_catalogs.js` ad-hoc catalog dumper. `scripts/qa/simulate.js` (`scripts/qa/lib/fetch.js:6` already absorbed its HTTP loop, and `_nocache` is a server no-op). [scripts/fetch_catalogs.js:116] (217 lines)
- `delete` `analyze_presets.js` and its unused `POST /api/admin/scripts/trigger` route (`src/api/admin.js:67-89`). `scripts/qa/catalog-audit.js` (0 callers for `/scripts/trigger` in `frontend/`/`src/`, discards output). [scripts/analyze_presets.js:1] (104 lines in `scripts/` + 22 in `src/api/admin.js`)
- `delete` `find_user.js` and `clear_caches.js`. `mongosh` / `POST /api/admin/system/flush` (`find_user.js:53` checks removed `'tpl_otaku'`/`'otaku_hardcore'`; `clear_caches.js:14` runs destructive `redisClient.flushdb()`). [scripts/clear_caches.js:14] (128 lines across 2 files)
- `shrink` Remove dead pre-Ticket-46 `getHeroRecipes` (`hero_true_blend_*`, `hero_hidden_gems_*`, `hero_trakt_fallback_*`) and share `compactItem`/J@40 overlap helper between `catalog-audit.js` and `top50-dump.js`. Extract shared `qa/lib/auditHelpers.js` or import from `catalog-audit.js`. [scripts/qa/catalog-audit.js:71] (~170 lines: 83 dead hero recipes + ~87 duplicated `compactItem`/overlap)
- `shrink` Deduplicate `toSqlPath`, `all`, `hasItaColumn`, `closeDatabase`, `parseArgs`, `entryToLine` between `dump-list-anime.js` and `dump-list.js`. Extract shared helper or export from `dump-list.js`. [scripts/erdb-builder/dump-list-anime.js:59] (~95 lines)
- `shrink` Remove dead Ticket-46 `HERO_CATALOGS` (`yaca_true_blend_*` etc.), stale `expectedTasteProfiles: 17`, `passwordHash: 'sim-not-a-login'`, and dead `userlists` writes in `simulate.js` harness. Use `HERO_IDS` from `src/catalog/registry.js` and drop `passwordHash`/`userlists`. [scripts/qa/lib/common.js:20] (~65 lines across `common.js`, `atlas.js`, `profiles.spec.json`)
- `shrink` Reuse `aspettaRedis` from `src/posters` (`drenaCodaPoster.js`) in `seed_learned_names.js` instead of copy-pasting the polling loop. Import `{ aspettaRedis }` from `../src/posters`. [scripts/seed_learned_names.js:104] (~45 lines)

**Totals**: **50 files to delete = 12,249 lines**; plus **~375 lines shrink** in kept/archived files -> **net: -12,624 lines** (excluding `src/api/admin.js:67-89`).

---

## 2. MIGRATIONS

| Script | What it changed | Compat / fallback still in `src/`? | Verdict & Real Bloat |
|---|---|---|---|
| `scripts/migra-host-poster.js` (88 L) | Rewrote `userlibraryitems.poster` URLs pointing to retired hosts (`gabriele-fuoco-yaca.hf.space`, `mate.taild24589.ts.net`, `localhost:7000`) to `APP_HOST_URL`. | **YES.** `src/api/profilo.js:246` removed it on `/libreria`, **but** `normalizeLegacyPosterHost` (`src/library/identity.js:73`) still runs on every read/sync in `WatchlistProvider.js:162`, `LibrarySyncService.js:255`, `libraryPosterRefresh.js:108,166`. | **Delete script.** Real bloat is `LEGACY_APP_HOSTS` + `normalizeLegacyPosterHost` (`src/library/identity.js:37-91`) still running at runtime after migration. |
| `scripts/migra-modi.js` (196 L) | Materialized 5 `MODI` profiles in `AddonConfig`, wiped `config.cataloghi` to `{}`, stripped `profiles[].settings.sliders` & `profiles[].sliders`/`slider`, set `activeModo`/`activeProfileId` & `pendingStremioResync`. | **YES (heavy).** `src/profile/modo.js:363-417` falls back to `profilo.settings.sliders` / `.slider` / `profilo.sliders`; `src/profile/context.js:98-102,123` handles `sliders`/`slider`; `src/pool/index.js:178,608-620,680-683,774-782` & `src/stremio/shelvesResolver.js:132-138` repeat fallback chains; `src/profile/modo.js:272` keeps `modoDaSelettori` bridge. | **Delete script.** Real bloat is the multi-layer `sliders`/`slider` and `activeProfileId`/`modoDaSelettori` fallback chains across `src/profile/`, `src/pool/`, `src/stremio/`. |
| `scripts/migra-poster-versione-sorgente.js` (138 L) | Seeded `/data/erdb-cache/sorgenti.json` from Parquet `poster_path` and hardlinked old poster filenames to new tokened names (`--prune-old` unlinks old names). | **No legacy filename fallback.** Only `src/posters/sorgenti.js:6` (`sorgenti.json`) & `gcPosterCache.js:26` read `sorgenti.json`, which is part of the live poster contract, not a migration fallback. | **Delete script.** No legacy compat path left in `src/` (only `sorgenti.json` contract). |
| `scripts/migrate_hero_presets.js` (237 L) | Removed 8 Ticket-46 `DEAD_HERO_IDS` (`yaca_true_blend_*`, `yaca_seed_network_*`, `yaca_hidden_gems_*`, `yaca_trakt_filtered_*`) and added 8 `HERO_IDS` in `raw_ui_state`/`ProfileUiState`. | **YES (layered).** `src/stremio/manifest.js:154-171` still rescues profiles whose `selectedPresets` has 0 overlap with current `HERO_IDS`, and `src/profile/context.js:130-150` (`LEGACY_HERO_IDS`, `ignoraPresetLegacy`) filters even newer retired hero IDs (`yaca_classici_*`, `yaca_ultime_visioni_*`, etc.). | **Delete script** (also obsolete: its target `HERO_IDS` list has since changed). Compat guards in `src/stremio/manifest.js` & `src/profile/context.js` remain if unmigrated docs exist. |
| `scripts/migrate_library_itemid_null.js` (145 L) | Backfilled `UserLibraryItem.itemId` from string `_id` where `itemId: null` and deleted duplicates. | **YES.** `src/library/ingestion/LibrarySyncService.js:390-412` still checks `if (!item.itemId)` and runs raw `$toString: '$_id'` migration during sync; `src/api/profilo.js:254`, `WatchlistProvider.js:157`, `reader.js:91,123` all do `item.itemId \|\| item._id`. | **Delete script** (update `tests/ticket14CatalogFixes.test.js:5` to import `normalizeLibraryId` from `src/library/identity.js`). `LibrarySyncService.js:397-412` compat path is redundant once DB is clean. |
| `scripts/migrate_library_order.js` (108 L) | Copied `AddonConfig.profiles.$.raw_ui_state.libraryOrder` to `UserLibraryOrder` collection. | **YES (read + dual-write).** `src/library/reader.js:316-325` still falls back to `AddonConfig.profiles.$.raw_ui_state.libraryOrder`, AND `salvaOrdineLibreria` (`reader.js:356-362`) + `UserConfig.js:144-145` + `profileProcessor.js:50-52` still **mirror-write** `libraryOrder` back into `AddonConfig`! | **Delete script.** Real bloat is the dual-write + read fallback in `src/library/reader.js:316-362` and `profileProcessor.js:50`. |
| `scripts/migrate_profile_ui_state.js` (121 L) | Copied `AddonConfig.profiles.$.raw_ui_state` (`selectedPresets`, `catalogOrder`, `newPrompts`, `heroPresetsInitialized`) to `ProfileUiState`. | **YES (read + dual-write).** `src/profile/door.js:134-157,217-218` reads `raw_ui_state`, `salvaUiState` (`door.js:192-200`) **mirror-writes** `profiles.$.raw_ui_state`, plus direct reads in `manifest.js:125`, `fingerprint.js:58`, `profileProcessor.js:47-69`. | **Delete script.** Real bloat is the `raw_ui_state` mirror/fallback across `src/profile/door.js`, `manifest.js`, `fingerprint.js`, `profileProcessor.js`. |
| `scripts/migrate_trakt_credentials.js` (118 L) | Unified `UserAccount.apiKeys.{trakt,traktRefreshToken,traktExpiresAt}` + `UserAccount.traktStatus` into `UserAccount.trakt`. | **YES (heavy read + dual-write).** `src/configurazione/door.js:125-315` reads legacy fields and dual-writes `traktStatus` & `apiKeys.trakt*`; `src/clients/trakt.js:480-512`, `src/library/traktFetchers.js:24-90`, `LibrarySyncService.js:560-577`, `TraktProvider.js:25`, `api/stremio.js:78`, `api/profilo.js:44`, `api/auth/index.js:206-213`, `configure/validators.js:50-111` all still use `apiKeys.trakt*` / `traktStatus`. | **Delete script.** The migration to `UserAccount.trakt` is incomplete at runtime—almost every consumer still reads/writes `apiKeys.trakt*` and `traktStatus`. |
| `scripts/migrate_user_credentials.js` (94 L) | Copied `UserAccount.passwordHash` into `UserCredentials`. | **DEAD FEATURE / NO RUNTIME READ.** Neither `UserCredentials` nor `passwordHash` is queried anywhere in `src/` (`rg passwordHash src/` hits only model schemas `UserAccount.js:20` & `UserCredentials.js:12`; login in `src/api/auth/index.js:89` delegates to Stremio). | **Delete script** (and `UserCredentials.js` + `UserAccount.passwordHash` can be audited separately as dead auth schema). |

---

## 3. PROBES (`scripts/qa/**`)

- **Ticket 02 (`probe-ticket-02-watchlist.py`)**: One-shot watchlist re-pick probe; **broken** (`motore`/`bubbles` moved to `_archivio-v10/`), **delete**.
- **Ticket 03 (`probe-ticket-03-mondo.py`)**: One-shot flattened-basin & Bayesian-floor probe; **broken** (`motore`/`bubbles` in `_archivio-v10/`), **delete**.
- **Ticket 04 (`probe-ticket-04-saga.py`)**: One-shot saga/director anti-monopoly & Dune probe; **broken** (`motore`/`bubbles` in `_archivio-v10/`), **delete**.
- **Ticket 05 (`probe-ticket-05-gemme.py`)**: One-shot relative-niche probe; **broken** (`motore`/`bubbles` in `_archivio-v10/`), **delete**.
- **Ticket 06 (`probe-ticket-06-classici.py`)**: One-shot `classici_imperdibili` probe (`exec()`-imports `05`); **broken** (`bubbles` in `_archivio-v10/`), **delete**.
- **Ticket 07 (`probe-ticket-07-ultime-visioni.py`)**: One-shot recency-selection probe (`exec()`-imports `05`); **broken** (`bubbles` in `_archivio-v10/`), **delete**.
- **Ticket 08 (`probe-ticket-08-micro-cluster.py`)**: One-shot micro-cluster probe (`exec()`-imports `05`); **broken** (`bubbles` in `_archivio-v10/`), **delete**.
- **Ticket 09 (`probe-ticket-09-punti-incontro.py` + `__pycache__/*.pyc`)**: One-shot geometric-mean bridge probe; **broken** (`motore`/`bubbles` in `_archivio-v10/`), **delete**.
- **Ticket 10 (`probe-ticket-10-uscite.py`)**: One-shot recent-releases cache probe (`exec()`-imports `09`); **broken** (`uscite`/`bubbles`/`motore` in `_archivio-v10/`), **delete**.
- **Ticket 11 (`probe-ticket-11-waterfall.py`)**: One-shot waterfall dedup probe (`exec()`-imports `05`); **broken** (`motore`/`bubbles` in `_archivio-v10/`), **delete**.
- **Ticket 12 (`probe-ticket-12-filtri.py`)**: One-shot upstream candidate-mask probe; **broken** (`motore` in `_archivio-v10/`), **delete**.
- **Ticket 17 (`probe-ticket-17-ripescato.py`)**: One-shot `r_indotta` score probe; **broken** (`motore` in `_archivio-v10/`), **delete**.
- **Ticket 18 (`probe-ticket-18-canone.py`)**: One-shot `COLL`/`DIR` v2 `.npz` export probe; **broken** (`motore`/`bubbles` in `_archivio-v10/`), **delete**.
- **Ticket 19 (`probe-ticket-19-flag.py`)**: One-shot `ANIME`/`ADULTO` flag check; **delete** (move `kidsModeFilters.js` vs `parametri.py` parity check into `services/graph/tests/test_kids.py`).
- **Ticket 22 (`probe-ticket-22-guardia.py`)**: One-shot active-rows waterfall guard probe; **broken** (`motore` in `_archivio-v10/`), **delete**.
- **Ticket 23 (`probe-ticket-23-diversita.py`)**: One-shot post-refill saga/director diversity probe; **broken** (`motore` in `_archivio-v10/`), **delete**.
- **Ticket 45 taste/diagnostic (`probe-diagnosi-titolo.js`, `probe-gusto-holdout.js`)**: One-shot Yu Yu Hakusho & holdout vs `e24470e` probes; **broken** (call missing `services/graph/measure/call_motore.py`, hardcode Windows venv), **delete**.
- **Ticket 41 & 01 & 55 pool probes (`probe-hidden-gems-jaccard.js`, `probe-hero-counts.js`, `probe-perdita-righe.js`, `probe-ticket-55-mondi.js`)**: One-shot pool/hydration/cache-bug probes (`probe-hidden-gems-jaccard.js` crashes on removed `HERO_STRATEGIES`/`setFlagNewHiddenGems`), **delete**.
- **Ticket 14 & 21 impressions (`probe-ticket-14-impressioni.js`, `probe-ticket-21-taratura.js`)**: One-shot `0.85^days` & `alphaBanda`/`resetGiorniFuori` tuning probes, **delete**.
- **Ticket 14 CJK (`measure-cjk-titles.js`)**: One-shot CJK incidence measurement for closed Ticket 14, **delete**.
- **Ticket 54/57/59/60 DuckDB & poster (`probe-duckdb-lock.js`, `probe-duckdb-reopen.js`, `probe-duckdb-reopen-barrier.js`, `probe-poster-volume.js`)**: One-shot verification probes whose assertions belong in `tests/`, **delete**.
- **Frontend/API `typeSelectors` (`verifyTypeSelectors.js`)**: Stale one-shot A/B repro script (dead `yaca_true_blend_*`, Windows TS path, magic `13`/`11` counts), **delete**.
- **Catalog QA & Pre-deploy (`catalog-audit.js`, `top50-dump.js`, `check-lessico.js`, `preflight-deploy.js`)**: **KEEP** as active offline regression/authoring/deploy gates.
- **Profile simulation harness (`simulate.js`, `lib/{common,atlas,fetch,review,compare}.js`, `profiles.spec.json`, `README.md`)**: **KEEP** as live end-to-end QA tool (after updating dead `yaca_true_blend_*` hero IDs and `expectedTasteProfiles: 17`).

**Duplicated `src/` search/index/domain logic inside probes**:
- `scripts/qa/catalog-audit.js:72-153` (`getHeroRecipes`) duplicates pre-Ticket-46 `catalogStrategies.js`/`dataFetchers.js` SQL recipes that no longer exist in `src/`.
- `scripts/qa/catalog-audit.js:175-191,890-970` and `scripts/qa/top50-dump.js:174-197,317-339` duplicate `compactItem` and J@40 overlap calculation between each other.
- `scripts/qa/probe-gusto-holdout.js:85-148` and `scripts/qa/probe-diagnosi-titolo.js:60-67` duplicate DuckDB SQL queries & `hidden_gems` threshold filters (`vote_count 50..1000`, `popularity <= 20`, `vote_average >= 6.5`, Bayes score).
- `scripts/qa/lib/common.js:220-233` (`normalizeId`) duplicates ID normalization logic from `src/library/identity.js:45`.
- `scripts/qa/probe-ticket-19-flag.py:27-36` regex-parses `ADULT_GENRE_IDS`/`ADULT_KEYWORD_IDS` out of `src/catalog/kidsModeFilters.js`.

---

## 4. FRAGILITY (Live Data Corruption Risks if Re-run)

- **`scripts/clear_caches.js:14` (`redisClient.flushdb()`)**: **CRITICAL.** Wipes the entire Redis database—including user sessions, rate-limit counters, TMDB caches, and the live `codaEventi` poster-rebuild queue.
- **`scripts/migra-modi.js:170-182` (`AddonConfig.updateOne`)**: **HIGH.** With `--conferma`, overwrites `config.cataloghi` to empty `{}` for all 5 modes across all `AddonConfig` docs (header line 30: *"si perdono 77 attivazioni sull'account reale"*), resets `activeModo`/`activeProfileId`, and triggers Stremio resync.
- **`scripts/pulisci-cronologia-profili.js:109,119` (`deleteMany` / `updateOne`)**: **HIGH.** With `--conferma`, deletes every `watchhistories` document whose `context !== 'global'` and removes every profile not `'global'` or `'modo_*'` from `addonconfigs.profiles` (including any active custom or `sim_*` profiles).
- **`scripts/ripara-cronologia.js:205` (`watchhistories.updateOne`)**: **HIGH.** With `--conferma`, resets `episodesWatched` and `$unset`s `lastWatchedAt` across all `global` history docs when titles don't match `userlibraryitems` by name/year.
- **`scripts/migrate_hero_presets.js:155-160,195-204` (`AddonConfig.updateOne` / `ProfileUiState.updateOne`)**: **MEDIUM-HIGH.** With `--apply`/`--execute`, overwrites `selectedPresets` and `catalogOrder` by injecting Ticket-47 `HERO_IDS` (which now include retired `LEGACY_HERO_IDS` such as `yaca_classici_*` and `yaca_ultime_visioni_*`).
- **`scripts/migrate_library_order.js:77-81`, `scripts/migrate_profile_ui_state.js:86-97`, `scripts/migrate_trakt_credentials.js:87-97`, `scripts/migrate_user_credentials.js:66-70`**: **MEDIUM-HIGH.** With `--apply`, overwrite current `UserLibraryOrder`, `ProfileUiState`, `UserAccount.trakt`, and `UserCredentials` from legacy fields in `AddonConfig.raw_ui_state` / `UserAccount`, silently clobbering post-migration user changes.
- **`scripts/migrate_library_itemid_null.js:95,104` & `scripts/migra-host-poster.js:89-92`**: **MEDIUM.** With `--apply`/`--conferma`, delete/mutate `userlibraryitems` docs in Mongo.
- **`scripts/backfill-mediatype-anime.js:450-453` (`anime_airing_state.updateOne`)**: **MEDIUM.** With `--apply`, permanently writes `mediaType: 'tv'` on unmapped IDs; header lines 26-29 warn this freezes misclassified anime movies forever (`anime-source` skips non-airing titles).
- **`scripts/migra-poster-versione-sorgente.js:126-144` (`writeFileSync`, `linkSync`, `unlinkSync`)**: **HIGH on `/data/erdb-cache`.** With `--apply`, overwrites `sorgenti.json` and creates hardlinks; with `--apply --prune-old` (line 134), unlinks poster files from the live volume.
- **`scripts/backfill-airing-anime.js:326,333,343` & `scripts/backfill-cjk-titles.js:235,239,249`**: **MEDIUM-HIGH on `/data/tmdb`.** Upsert `master_{movies,tv}.jsonl` and overwrite `{movies,tv}.parquet`, racing with `tmdb-daemon` if run concurrently (`preflight-deploy.js:11-12`).
- **`scripts/qa/lib/atlas.js:169-363,434-442` & `scripts/qa/lib/fetch.js:79-83` (`simulate.js`)**: **LOW-MEDIUM.** Writes/deletes `sim_*` docs across 7 Atlas collections (`useraccounts`, `addonconfigs`, `tasteprofiles`, `recommendationimpressions`, `userlists`, `userlibraryitems`, `watchhistories`) and deletes `*sim_*` Redis keys (`clearSimRedisKeys`).
- **`scripts/qa/verifyTypeSelectors.js:157,344`**: **LOW.** Posts `sim_user_repro_v` profile payloads to `--base-url/api/configure`.
- **`scripts/push-diff-in-coda.js:370` & `scripts/seed_learned_names.js:182,234`**: **LOW.** `push-diff-in-coda.js` is idempotent via `codaEventi` (`HSETNX`); `seed_learned_names.js` uses `INSERT OR IGNORE` on SQLite `learned_names`, though `redis.keys` (line 182) blocks Redis momentarily.

---

## 5. INVENTORY (All 68 Files in Scope)

| File | Lines | Purpose | Evidence of Use | Verdict |
|---|---:|---|---|---|
| `scripts/analyze_presets.js` | 104 | Static preset JSON linter writing `.agents/scratch/analysis_report.json` | Called only by unused `POST /api/admin/scripts/trigger` (`src/api/admin.js:74`); superseded by `catalog-audit.js` | **delete** |
| `scripts/backfill-airing-anime.js` | 341 | Manual simulcast anime backfill into `master_*.jsonl` + `.parquet` bypassing `<10 votes` | Referenced in `src/anime/airing.js:17,397` & `docs/CATALOG_LOGIC.md:151`; no timer | **archive** |
| `scripts/backfill-cjk-titles.js` | 229 | One-shot Ticket 14 CJK title backfill via TMDB translations | Mentioned in `docs/DUCKDB_ARCHITECTURE.md:86`; `services/tmdb-daemon/tests/resolveIngestTitle.test.js:9` imports `findCompromisedIds` | **delete** |
| `scripts/backfill-mediatype-anime.js` | 680 | One-shot `anime_airing_state.mediaType` backfill in Mongo | Only imported by `tests/backfillMediatypeAnime.test.js:38` | **delete** |
| `scripts/clear_caches.js` | 30 | Calls `redisClient.flushdb()` | Mentioned in `docs/TESTING_UTILITIES.md:106`; superseded by `src/api/admin.js:43` | **delete** |
| `scripts/fetch_catalogs.js` | 217 | Ad-hoc Stremio HTTP catalog dumper with no-op `?_nocache` | Mentioned in `docs/TESTING_UTILITIES.md:119`; superseded by `scripts/qa/lib/fetch.js:6` | **delete** |
| `scripts/find_user.js` | 98 | Read-only Mongo user/config/profile inspector | Mentioned in `docs/TESTING_UTILITIES.md:112`; checks removed `'tpl_otaku'`/`'otaku_hardcore'` | **delete** |
| `scripts/migra-host-poster.js` | 88 | One-shot Mongo migration rewriting retired poster hosts | Comment in `src/api/profilo.js:246`; no callers | **delete** |
| `scripts/migra-modi.js` | 196 | One-shot Ticket 01 migration to 5 `MODI` profiles | Zero callers (`rg` = 0) | **delete** |
| `scripts/migra-poster-versione-sorgente.js` | 138 | One-shot Ticket 08 migration creating `sorgenti.json` + poster hardlinks | Zero callers (`rg` = 0) | **delete** |
| `scripts/migrate_hero_presets.js` | 237 | One-shot Ticket 47 hero ID replacement in `raw_ui_state`/`ProfileUiState` | Zero callers; replacement IDs now outdated (`LEGACY_HERO_IDS`) | **delete** |
| `scripts/migrate_library_itemid_null.js` | 145 | One-shot Mongo migration for `UserLibraryItem` with `itemId: null` | `tests/ticket14CatalogFixes.test.js:5` imports `normalizeLegacyId` | **delete** |
| `scripts/migrate_library_order.js` | 108 | One-shot Ticket 21 migration `libraryOrder` -> `UserLibraryOrder` | Mentioned in `scripts/qa/preflight-deploy.js:139`; zero callers | **delete** |
| `scripts/migrate_profile_ui_state.js` | 121 | One-shot Ticket 26 migration `raw_ui_state` -> `ProfileUiState` | Zero callers | **delete** |
| `scripts/migrate_trakt_credentials.js` | 118 | One-shot Ticket 26 migration `apiKeys.trakt*` + `traktStatus` -> `UserAccount.trakt` | Zero callers | **delete** |
| `scripts/migrate_user_credentials.js` | 94 | One-shot Ticket 26 migration `UserAccount.passwordHash` -> `UserCredentials` | Zero callers (`passwordHash` unused at runtime) | **delete** |
| `scripts/pulisci-cronologia-profili.js` | 117 | One-shot cleanup deleting non-`global` `watchhistories` & old profiles | Zero callers (2026-11-10 sync-bug cleanup) | **delete** |
| `scripts/push-diff-in-coda.js` | 438 | Pushes `ita_annotations.diff.json` poster changes into Redis `codaEventi` | **LIVE:** `ops/yaca-doppiaggi.sh:150`, `tests/pushDiffInCoda.test.js:38` | **keep** |
| `scripts/ripara-cronologia.js` | 196 | One-shot repair of `episodesWatched` and `lastWatchedAt` in `watchhistories` | Zero callers (2026-11-10 sync-bug repair) | **delete** |
| `scripts/seed_learned_names.js` | 287 | One-shot/cold-start SQLite `learned_names` seed from Redis `tmdb_details_raw:*` | Imported by `tests/seedLearnedNames.test.js:64` | **archive** |
| `scripts/test_relevance_all_presets.js` | 259 | Live TMDB API preset relevance validator | `docs/TESTING_UTILITIES.md:80`; superseded by offline `catalog-audit.js` | **delete** |
| `scripts/relevance_validation_report.json` | 1777 | Untracked JSON output of `test_relevance_all_presets.js` | Generated report (2026-09-24 params) | **delete** |
| `scripts/erdb-builder/build.js` | 6 | CLI wrapper around `src/posters/erdb/build.js` | Imported by 4 `tests/erdb*.test.js` & `posterNameConcordance.test.js` | **keep** |
| `scripts/erdb-builder/dump-list.js` | 361 | Generates movie/tv JSONL poster list from Parquet for `build.js` | `tests/erdbList.test.js:7,44`, `src/stremio/formatters/StremioFormatter.js:21` | **keep** |
| `scripts/erdb-builder/dump-list-anime.js` | 376 | Generates anime JSONL poster list from Fribb + Parquet for `build.js` | `tests/erdbListAnime.test.js:6,8`, `docs/KITSU_MAPPING.md:80` | **keep** |
| `scripts/qa/README.md` | 138 | Documentation for `simulate.js` profile simulation harness | Active harness docs (needs stale hero ID cleanup) | **keep** |
| `scripts/qa/catalog-audit.js` | 1158 | Offline Parquet quality/overlap/drift audit CLI with `--gate` | Active QA/QC gate (`top50-dump.js:14`) | **keep** |
| `scripts/qa/check-lessico.js` | 62 | Validates `src/ricerca/lessico_it.js` keywords against DuckDB | Referenced in `src/ricerca/lessico_it.js:12,20-21` | **keep** |
| `scripts/qa/measure-cjk-titles.js` | 119 | One-shot Ticket 14 CJK title prevalence & acceptance measurement | `docs/DUCKDB_ARCHITECTURE.md:86` (Ticket 14 closed) | **delete** |
| `scripts/qa/preflight-deploy.js` | 148 | Pre-deploy sanity checks on `docker-compose.yml`, `ops/`, `mongoConnect.js` | `docs/DEPLOYMENT_HOME_SERVER.md:591` | **keep** |
| `scripts/qa/probe-diagnosi-titolo.js` | 101 | One-shot Ticket 45 Yu Yu Hakusho exclusion probe | Broken (`services/graph/measure/call_motore.py` missing) + Windows venv | **delete** |
| `scripts/qa/probe-duckdb-lock.js` | 192 | One-shot Ticket 54 DuckDB staging/swap/retry-lock probe | Zero callers; leaks `.cache/tmdb_probe_*` | **delete** |
| `scripts/qa/probe-duckdb-reopen.js` | 183 | One-shot Ticket 59 DuckDB inode reopen probe | Zero callers | **delete** |
| `scripts/qa/probe-duckdb-reopen-barrier.js` | 241 | One-shot Ticket 60 DuckDB reopen barrier probe | Zero callers | **delete** |
| `scripts/qa/probe-gusto-holdout.js` | 428 | One-shot Ticket 45 holdout probe vs frozen `e24470e` | Broken (`measure/call_motore.py` missing) + Windows venv | **delete** |
| `scripts/qa/probe-hero-counts.js` | 146 | One-shot Ticket 41 `getHeroPool` counts probe | Zero callers | **delete** |
| `scripts/qa/probe-hidden-gems-jaccard.js` | 164 | One-shot Ticket 41 `hidden_gems` switch OFF/ON Jaccard probe | **Broken:** imports removed `HERO_STRATEGIES`/`setFlagNewHiddenGems` | **delete** |
| `scripts/qa/probe-perdita-righe.js` | 328 | One-shot Ticket 01 6-stage row drop-off probe | Zero callers | **delete** |
| `scripts/qa/probe-poster-volume.js` | 210 | One-shot Ticket 57 `/erdb-poster/health` & missing-poster observer probe | Zero callers | **delete** |
| `scripts/qa/probe-ticket-02-watchlist.py` | 374 | One-shot Ticket 02 watchlist re-pick probe | **Broken:** imports `graph.{motore,bubbles}` (in `_archivio-v10/`) | **delete** |
| `scripts/qa/probe-ticket-03-mondo.py` | 350 | One-shot Ticket 03 basin & adaptive floor probe | **Broken:** imports `graph.{motore,bubbles}` (in `_archivio-v10/`) | **delete** |
| `scripts/qa/probe-ticket-04-saga.py` | 381 | One-shot Ticket 04 saga/director anti-monopoly probe | **Broken:** imports `graph.{motore,bubbles}` (in `_archivio-v10/`) | **delete** |
| `scripts/qa/probe-ticket-05-gemme.py` | 568 | One-shot Ticket 05 relative niche probe | **Broken:** imports `graph.{motore,bubbles}` (in `_archivio-v10/`) | **delete** |
| `scripts/qa/probe-ticket-06-classici.py` | 76 | One-shot Ticket 06 `classici_imperdibili` probe | **Broken:** imports `graph.bubbles` + `exec()`s `05` | **delete** |
| `scripts/qa/probe-ticket-07-ultime-visioni.py` | 179 | One-shot Ticket 07 `ultime_visioni` recency probe | **Broken:** imports `graph.bubbles` + `exec()`s `05` | **delete** |
| `scripts/qa/probe-ticket-08-micro-cluster.py` | 326 | One-shot Ticket 08 `micro_cluster_*` probe | **Broken:** imports `graph.bubbles` + `exec()`s `05` | **delete** |
| `scripts/qa/probe-ticket-09-punti-incontro.py` | 330 | One-shot Ticket 09 `punti_incontro` geometric bridge probe | **Broken:** imports `graph.{motore,bubbles}` (in `_archivio-v10/`) | **delete** |
| `scripts/qa/__pycache__/probe-ticket-09-punti-incontro.cpython-313.pyc` | 215 | Untracked Python bytecode cache for `probe-ticket-09` | Stale `__pycache__` artifact | **delete** |
| `scripts/qa/probe-ticket-10-uscite.py` | 360 | One-shot Ticket 10 `uscite_nuove` cache & neighbors probe | **Broken:** imports `graph.{uscite,bubbles}` + `exec()`s `09` | **delete** |
| `scripts/qa/probe-ticket-11-waterfall.py` | 187 | One-shot Ticket 11 waterfall dedup probe | **Broken:** imports `graph.{motore,bubbles}` + `exec()`s `05` | **delete** |
| `scripts/qa/probe-ticket-12-filtri.py` | 79 | One-shot Ticket 12 upstream candidate mask probe | **Broken:** imports `graph.motore` (`tests/filtriAMonte.test.js:9` comment) | **delete** |
| `scripts/qa/probe-ticket-14-impressioni.js` | 115 | One-shot Ticket 14 `0.85^days` decay tuning probe | Zero callers | **delete** |
| `scripts/qa/probe-ticket-17-ripescato.py` | 61 | One-shot Ticket 17 `r_indotta` score probe | **Broken:** imports `graph.motore` (in `_archivio-v10/`) | **delete** |
| `scripts/qa/probe-ticket-18-canone.py` | 387 | One-shot Ticket 18 `COLL`/`DIR` v2 `.npz` probe | **Broken:** imports `graph.{motore,bubbles}` (in `_archivio-v10/`) | **delete** |
| `scripts/qa/probe-ticket-19-flag.py` | 85 | One-shot Ticket 19 `ANIME`/`ADULTO` `.npz` & `kidsModeFilters.js` parity probe | Cited in `services/graph/parametri.py:322`; move check to `pytest` | **delete** |
| `scripts/qa/probe-ticket-21-taratura.js` | 146 | One-shot Ticket 21 `alphaBanda`/`resetGiorniFuori` tuning probe | Zero callers | **delete** |
| `scripts/qa/probe-ticket-22-guardia.py` | 70 | One-shot Ticket 22 active-rows waterfall guard probe | **Broken:** imports `graph.motore` (in `_archivio-v10/`) | **delete** |
| `scripts/qa/probe-ticket-23-diversita.py` | 85 | One-shot Ticket 23 post-refill saga/director cap probe | **Broken:** imports `graph.motore` (in `_archivio-v10/`) | **delete** |
| `scripts/qa/probe-ticket-55-mondi.js` | 384 | One-shot Ticket 55 `il_tuo_mondo` 51-vs-11 cache diagnosis | Zero callers | **delete** |
| `scripts/qa/profiles.spec.json` | 482 | Declarative 8-profile spec for `simulate.js` | Used by `simulate.js` (needs dead hero ID cleanup) | **keep** |
| `scripts/qa/simulate.js` | 153 | Live server profile simulation CLI (`profiles`/`fetch`/`review`/`compare`/`teardown`) | Active QA harness (`scripts/qa/README.md`) | **keep** |
| `scripts/qa/top50-dump.js` | 370 | Offline top-50 preset QC dump generator via `DuckDbProvider` | Active QC tool (`scripts/qa/README.md:125`) | **keep** |
| `scripts/qa/verifyTypeSelectors.js` | 427 | Stale A/B repro harness for `typeSelectors` (`utils.ts` transpiler) | `docs/CATALOG_LOGIC.md:81`; uses dead `yaca_true_blend_*` & Windows path | **delete** |
| `scripts/qa/lib/atlas.js` | 464 | Atlas `sim_*` materialization & teardown for `simulate.js` | Used by `simulate.js` (strip legacy `passwordHash`/`raw_ui_state`/`userlists`) | **keep** |
| `scripts/qa/lib/common.js` | 252 | Shared helpers & ID normalization for `simulate.js` | Used by `simulate.js` (update stale `HERO_CATALOGS` & `expectedTasteProfiles`) | **keep** |
| `scripts/qa/lib/compare.js` | 240 | Run diff engine for `simulate.js compare` | Tested by `tests/qaHarnessCatalogFiles.test.js:7` | **keep** |
| `scripts/qa/lib/fetch.js` | 326 | Manifest & catalog page fetcher for `simulate.js fetch` | Tested by `tests/qaHarnessCatalogFiles.test.js:5` | **keep** |
| `scripts/qa/lib/review.js` | 447 | Structural metrics & rubric artifact generator for `simulate.js review` | Tested by `tests/qaHarnessCatalogFiles.test.js:6` | **keep** |
