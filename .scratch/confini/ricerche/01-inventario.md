# 01 — L'inventario: cosa non raggiunge nessuno

**Data**: 16/10/2026 · **Checkout**: `C:\Users\gabri\APP\YACA` · **HEAD**: `03b14c0` (`main`)
**Ticket**: [`04-inventario-del-non-raggiungibile.md`](../issues/04-inventario-del-non-raggiungibile.md)

Nessuna cancellazione: questo report è una lista con le prove. Le prove sono comandi eseguibili —
`git ls-files`, `git grep`, `git log`, `git cat-file`, `node -e`, `wc -l` — e ogni riga porta il
numero osservato. Analisi **offline**: niente Docker, niente SSH, niente `tsc`, niente `npm test`
completo.

## Metodo, e come riprodurlo

1. **Grafo dei moduli** da `index.js` + `tests/**/*.js` + `scripts/**/*.js`, seguendo
   `require('…')` statici in modo transitivo (risoluzione `.js`, `.json`, `index.js`). Lo script è
   in fondo a questa sezione: è l'unico modo per rispondere alla domanda del ticket, e si può
   rieseguire in due secondi.
2. **Chi legge un file** (artefatti, root): `git grep -n '<nome>'`, contato per directory
   (`git grep -l … -- <dir> | wc -l`).
3. **Stato in git**: `git ls-files`, `git cat-file -s HEAD:<path>` (byte reali, non del worktree),
   `git log --diff-filter=D --format='%ad %h %s' --date=short -- <path>` (quando è sparito).
4. **Citazioni dei docs**: estrattore che legge ogni `path:riga` in `docs/*.md`, prova a risolverlo
   rispetto alla root e rispetto a `docs/`, e ripiega sul basename tra i file tracciati.

```bash
# reach.js — chi raggiunge cosa, da index.js e dai test. Uso: node reach.js .
cat > /tmp/reach.js <<'EOF'
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(process.argv[2] || '.');
const SKIP = ['node_modules', '.git', 'frontend', 'offline_graph_builder', '__pycache__', '.next', '.scratch'];
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.includes(e.name)) walk(p); }
    else if (p.endsWith('.js')) files.push(p);
  }
})(ROOT);
const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
const deps = f => [...fs.readFileSync(f, 'utf8').matchAll(/require\(\s*(['"])([^'"]+)\1\s*\)/g)].map(m => m[2]);
function resolve(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, base + '.js', base + '.json', path.join(base, 'index.js')]) {
    try { if (fs.statSync(c).isFile()) return c; } catch (e) {}
  }
  return null;
}
function reach(entries) {
  const seen = new Set(), stack = [...entries];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const s of deps(cur)) { const r = resolve(cur, s); if (r) stack.push(r); }
  }
  return seen;
}
const fromIndex = reach([path.join(ROOT, 'index.js')]);
const fromTests = reach(files.filter(f => rel(f).startsWith('tests/')));
const fromScripts = reach(files.filter(f => rel(f).startsWith('scripts/')));
const src = files.map(rel).filter(f => f.startsWith('src/'));
const notIndex = src.filter(f => !fromIndex.has(path.join(ROOT, f)));
const notIndexTests = src.filter(f => !fromIndex.has(path.join(ROOT, f)) && !fromTests.has(path.join(ROOT, f)));
const notAny = src.filter(f => !fromIndex.has(path.join(ROOT, f)) && !fromTests.has(path.join(ROOT, f)) && !fromScripts.has(path.join(ROOT, f)));
console.log('moduli src:', src.length);
console.log('raggiunti da index.js:', src.filter(f => fromIndex.has(path.join(ROOT, f))).length);
console.log('NON raggiunti da index.js (' + notIndex.length + '):'); notIndex.forEach(f => console.log('  ' + f + '  <- test:' + (fromTests.has(path.join(ROOT, f)) ? 'si' : 'no') + ' script:' + (fromScripts.has(path.join(ROOT, f)) ? 'si' : 'no')));
console.log('NON raggiunti da index.js ne da tests/ (' + notIndexTests.length + '):'); notIndexTests.forEach(f => console.log('  ' + f));
console.log('NON raggiunti da nessun ingresso JS (' + notAny.length + '):'); notAny.forEach(f => console.log('  ' + f));
EOF
cd C:/Users/gabri/APP/YACA && node /tmp/reach.js .
```

Output osservato (lo stesso che apre la sezione 1):

```text
moduli src: 119
raggiunti da index.js: 116
NON raggiunti da index.js (3):
  src/utils/mongoConnect.js  <- test:si script:si
  src/utils/retry.js  <- test:si script:si
  src/utils/tasteClusters.js  <- test:si script:no
NON raggiunti da index.js ne da tests/ (0):
NON raggiunti da nessun ingresso JS (0):
```

`ops/` non cambia nulla: gli unici `require` di `ops/` verso `src/` sono
`ops/timing/probe-missing.js:11` e `ops/timing/probe-search.js:37` (`src/db/tier2Index`), e
`ops/erdb-legion/costruisci.js:35` (`scripts/erdb-builder/build.js`). Nessuno tocca i tre moduli
sopra. Comando: `git grep -nE "require\(" -- ops`.

**Il risultato, detto senza giri**: sotto `src/` **non esiste un solo modulo JS irraggiungibile**.
Tutti i 119 sono raggiunti da `index.js` (116) o dai test (3). La premessa del ticket — «c'è codice
che nessuno raggiunge» — per `src/` è **falsa**, e questo è il dato che i ticket 05/06 devono usare:
non c'è niente da cancellare in `src/` per raggiungibilità. Ciò che resta sono tre moduli che il
**prodotto** non carica (li usano script e test), e un caso diverso — `streamHandler` — che è
raggiungibile ma è un guscio (§1.3).

---

## 1. Moduli JS non raggiungibili

### 1.1 Il criterio del ticket: non raggiungibili da `index.js` né da `tests/`

**Zero righe.** Comando: `node /tmp/reach.js .` (sopra) → `NON raggiunti da index.js ne da tests/ (0)`.

### 1.2 I tre moduli che il prodotto non carica (candidati del 05/06, non morti)

| modulo | righe | chi lo carica oggi (prova) | catena del prodotto che lo evita | perché non ci arriva |
|---|---|---|---|---|
| `src/utils/tasteClusters.js` | 7 | solo 3 test: `tests/tasteClusters.test.js:9`, `tests/characterization/dnaCharacterization.test.js:39`, `tests/characterization/dnaEngineExtraction.test.js:21` — prova: `git grep -l "utils/tasteClusters" -- tests \| wc -l` → **3**, e `-- scripts src ops` → **0** | il prodotto carica `src/dna/dnaEngine.js` direttamente: `src/profile/ProfileBuilder.js:15` | thin-shim di riesportazione (`module.exports = require('../dna/dnaEngine')`), nato per i test di characterization (ticket 22); il commento in testa lo dichiara |
| `src/utils/mongoConnect.js` | 62 | 11 file in `scripts/` (es. `scripts/find_user.js:3`, `scripts/fetch_catalogs.js:6`, `scripts/qa/lib/atlas.js:24`) + 1 test (`tests/mongoConnectRetry.test.js:7`) + 17 file `.scratch/` — prova: `git grep -l "utils/mongoConnect" -- tests scripts src ops` | il prodotto usa un'altra connessione: `index.js:20` → `src/db/connection.js` | è il connettore dei **giri da timer/script** (lo dice il commento in testa: «i giri da timer… aprono una connessione per volta»), non un modulo del server |
| `src/utils/retry.js` | 174 | 2 script (`scripts/drop-streambadges.js:25`, `scripts/qa/lib/atlas.js:25`) + 2 test (`tests/retry.test.js:1`, `tests/mongoConnectRetry.test.js:8`) — prova: `git grep -l "utils/retry" -- tests scripts src ops`; l'unica occorrenza in `src/` è un **commento** di `mongoConnect.js:10`, l'unica in `ops/` è un commento in `ops/yaca-backup.sh:100` | — | classificatore di errori transitori condiviso da `mongoConnect` e dagli script; nessuno dei suoi chiamanti è il server |

Nessuno dei tre è «codice morto» nel senso del ticket: `mongoConnect` e `retry` servono a script che
restano (§2), `tasteClusters` esiste **solo** per i test di characterization. Se il 05/06 cancella la
shim `tasteClusters`, deve anche decidere cosa fare di `tests/tasteClusters.test.js` e delle due
asserzioni in `tests/characterization/dnaEngineExtraction.test.js:42-44,117` (che verificano proprio
che la shim riesporti `dnaEngine`).

### 1.3 Il caso che il grafo non vede: `streamHandler` è raggiungibile ma vuoto

`src/handlers/streamHandler.js` è caricato (`src/api/stremio.js:18`, chiamato a `:446`), quindi non
compare in nessun elenco di irraggiungibili. Ma il file è di **31 righe** e la sua testa dichiara
(01/10/2026) che non restituisce stream: risponde sempre `{ streams: [] }`. Comando:
`sed -n '1,31p' src/handlers/streamHandler.js` e `wc -l src/handlers/streamHandler.js` → **31**.

> La raggiungibilità **non è** una misura di «questo codice fa qualcosa». `streamHandler` è il
> controesempio da tenere presente quando il 05/06 deciderà: è vivo per il grafo, morto per il
> comportamento, e la sua rimozione è una decisione sulla rotta (lo dice il commento del file).

### 1.4 I `require` dinamici — il limite onesto dell'analisi

`require(` con qualcosa che non è una stringa letterale. Ricerca:
`git grep -nE "require\(\s*[^'\"]" -- src index.js scripts ops tests` (più i casi in `.scratch/`).
Censite **55** occorrenze grezze: **23 dentro `.scratch/`** (script di misura) e **32 fuori** —
1 in `src/`, 15 in `scripts/`, 6 in `ops/`, 9 nei test, 1 in `.agents/`. I punti che contano:

| posizione | forma | è un limite? |
|---|---|---|
| `src/engines/graph/HierarchicalGraph.js:20` | `require(dataPath)` | **no**: `dataPath = path.join(__dirname, '../../data/hierarchical_graph.json')` (riga 18) — risolvibile a mano, ed è l'unico `require` dinamico in `src/` |
| `src/data/animeMappingStore.js:9-14` | `require('../../services/anime-source/src/overrides')` in `try/catch`, con ripiego `../../../services/…` e poi un default | **parzialmente**: il primo ramo risolve (`services/anime-source/src/overrides.js` esiste), il secondo no. Comando: `ls services/anime-source/src/overrides.js` |
| `scripts/qa/verifyTypeSelectors.js:70,92,96` | `require(cand)` / `require(id)` / `require(fallbackPath)` | **sì**: caricatore per il `utils.ts` del frontend compilato a runtime; gli id vengono dal codice TypeScript, non da questo repo |
| `ops/erdb-legion/costruisci.js:35` | `require(BUILD)` | no: `BUILD` è `path.resolve(__dirname,'..','..','scripts','erdb-builder','build.js')` (riga 34) |
| `scripts/convert-library-once.js:32-36`, `scripts/requeue-damaged-titles.js:22-23`, `scripts/requeue-library-without-tmdb.js:31-34`, `scripts/verify-damaged-titles.js:14-15`, `ops/timing/probe-missing.js:10-11`, `ops/timing/probe-search.js:17-18,37` | `require(path.join(APP, 'src/…'))` | no: percorsi fissi, tutti risolti |
| `tests/erdbList.test.js:18` | `require(process.argv[1])` | no: è lo script figlio `scripts/erdb-builder/dump-list.js` (riga 44) |
| `tests/activeProfileHydration.test.js:34,36`, `tests/dnaChartGrouping.test.js:37-45`, `tests/typeSelectorsPayload.test.js:35-37` | `require(id)` dentro factory di `jest.mock` | **sì, ma innocuo**: gli id sono pacchetti esterni (`react`, `react-dom/server`) o `frontend/node_modules`; nessuno può nascondere un modulo di `src/` |
| `.scratch/livello-latente/compare-census.js:20` | `require(path.isAbsolute(f) ? f : path.resolve(f))` | **sì**: carica JSON da `argv`, fuori dal prodotto |

Conclusione del limite: **l'unico punto di `src/` che sfugge a una lettura puramente testuale è
`HierarchicalGraph.js:20`, ed è risolto**. Un modulo di `src/` nascosto dietro un `require`
dinamico non esiste; i punti non risolti stanno in script di misura (`.scratch/`) o caricano
pacchetti esterni.

---

## 2. `scripts/`: 48 file tracciati

Numeri di partenza:

```bash
git ls-files scripts | wc -l                 # 48 (45 .js + 2 .json + 1 .md)
git ls-files scripts | sed 's/.*\.//' | sort | uniq -c   # 45 js · 2 json · 1 md
git grep -nE "scripts/" -- .github Dockerfile docker-compose.yml | wc -l   # 0
```

**Nessuno script è citato da CI, Dockerfile o docker-compose** (0 occorrenze): la CI costruisce
immagini, non esegue utility. I canali veri sono tre — i **timer di `ops/`** (2 script), **una rotta
admin** (1 script), la **documentazione** e i **test**. Poi c'è il gruppo che nessuno cita.

### 2.1 Citati da automazione, prodotto, ops, docs o test (vivi)

| file | citato da (prova) | verdetto |
|---|---|---|
| `scripts/drena-coda-poster.js` | `ops/yaca-poster-eventi.service:32`; `docs/TIMER_POSTER.md:3,44,106,114,161`; `tests/drenaCodaPoster.test.js:33` (require del guscio); citato nei commenti di `src/api/staticPosters.js:110`, `src/cache/drenaPoster.js:13` | **vivo** — gira da timer di sistema |
| `scripts/push-diff-in-coda.js` | `ops/yaca-doppiaggi.sh:149,157`; `docs/TIMER_DOPPIAGGI.md:127,146`; `docs/TESTING_UTILITIES.md:130`; `tests/pushDiffInCoda.test.js:38` (require) | **vivo** — l'altra metà del timer doppiaggi |
| `scripts/analyze_presets.js` | `src/api/admin.js:74` (eseguito da `POST /api/admin/scripts/trigger`); `docs/TESTING_UTILITIES.md:90`; `.agents/skills/yaca-catalog-analyzer/SKILL.md:18` | **vivo** — unico script invocato dal prodotto |
| `scripts/convert_to_parquet.js` | `docs/TESTING_UTILITIES.md:153`, `docs/INDEX.md:87`, `docs/CATALOG_LOGIC.md:194`, `docs/EPISODE_BADGES.md:146`; 4 file di codice | **vivo** — alimenta DuckDB |
| `scripts/clear_caches.js` | `docs/TESTING_UTILITIES.md:106`; `docs/INDEX.md:87`; `.agents/skills/yaca-catalog-analyzer/SKILL.md:44` | **vivo** — utility documentata |
| `scripts/find_user.js` | `docs/TESTING_UTILITIES.md:112-116`; `docs/INDEX.md:87` | **vivo** — utility documentata |
| `scripts/fetch_catalogs.js` | `docs/TESTING_UTILITIES.md:119`; `docs/CHANGELOG.md:62`; `.agents/skills/yaca-catalog-analyzer/SKILL.md:34` | **vivo** — utility documentata |
| `scripts/verifyTypeSelectors.js` (in `qa/`) | `docs/TESTING_UTILITIES.md:141`; `docs/CATALOG_LOGIC.md:81` | **vivo** — harness di verifica dei selettori |
| `scripts/test_relevance_all_presets.js` | `docs/TESTING_UTILITIES.md:80`; `.agents/skills/yaca-catalog-analyzer/SKILL.md:25` | **vivo** — utility documentata |
| `scripts/backfill-airing-anime.js` | `docs/CATALOG_LOGIC.md:151`; `src/data/animeAiringState.js:17,416` | **vivo** — il backfill citato dal codice |
| `scripts/backfill-cjk-titles.js` | `docs/DUCKDB_ARCHITECTURE.md:57` | **documentato** — backfill dei titoli CJK |
| `scripts/backfill-mediatype-anime.js` | `tests/backfillMediatypeAnime.test.js:38` (`require`); `src/data/animeMappingStore.js:635` | **testato** — one-off con guardia |
| `scripts/migrate_library_itemid_null.js` | `tests/ticket14CatalogFixes.test.js:5` (`require`, usa `normalizeLegacyId`); `docs/TESTING_UTILITIES.md:157` | **testato** — migrazione one-off, ma un suo helper è sotto test |
| `scripts/seed_learned_names.js` | `tests/seedLearnedNames.test.js:23` (eseguito come figlio) | **one-off testato** |
| `scripts/erdb-builder/build.js` | **richiesto dal prodotto**: `src/api/staticPosters.js:7`, `src/cache/posterDaEvento.js:21`, `src/catalog/formatters/StremioFormatter.js:9`, `src/utils/libraryPosterRefresh.js:35`; `tests/erdbBuilder.test.js:5`, `tests/erdbList.test.js:209`; `ops/erdb-legion/README.md:113`; `docs/EPISODE_BADGES.md:123` | **vivo** — la concordanza dei nomi poster è condivisa tra app e dump offline |
| `scripts/erdb-builder/dump-list.js` · `dump-list-anime.js` | `tests/erdbList.test.js:44`, `tests/erdbListAnime.test.js:8` | **testati** |
| `scripts/qa/simulate.js` + `scripts/qa/lib/{common,atlas,fetch,review,compare}.js` | `scripts/qa/README.md:20-24`; `simulate.js:17-19` (e `:110,116` per `review`/`compare`) richiama le lib | **vivo** — harness della campagna |
| `scripts/qa/top50-dump.js` · `qa/catalog-audit.js` | `scripts/qa/README.md:125`; `qa/top50-dump.js:14` cita `catalog-audit` | **vivo** — campagna QC |
| `scripts/qa/measure-cjk-titles.js` | `docs/DUCKDB_ARCHITECTURE.md:57` | **vivo** — misura del backfill CJK |

### 2.2 Nessuna citazione **funzionale** fuori da `.scratch/` e `.agents/` (19 file) — candidati del 05/06

Il conteggio è stato fatto escludendo `.scratch/` e `.agents/` (che restano la memoria del lavoro):
`git grep -lE "(^|[^A-Za-z0-9_.-])<stem>(\.js)?([^A-Za-z0-9_-]|$)" -- scripts docs README.md .github Dockerfile docker-compose.yml ops package.json start.sh src index.js tests`.

| file | ultimo commit | prova (citazioni fuori da `.scratch`) | perché è un one-off |
|---|---|---|---|
| `scripts/bench_learned_names.js` | 2026-10-03 | **0** | banco di misura della terza fonte di ricerca; il numero è già misurato (header) |
| `scripts/build_tier2_fts5.js` | 2026-10-02 | **0** | il prodotto ricostruisce l'indice da sé: `src/utils/tmdbDumpDaemon.js:26-30,57` chiama `buildTier2` — lo script è un runner manuale |
| `scripts/count-dead-posters.js` | 2026-10-05 | **0** | «Il metro del ticket 08» (header) |
| `scripts/count-library-docs.js` | 2026-10-05 | **0** | «Il metro del sync» (header) |
| `scripts/drop-streambadges.js` | 2026-10-05 | **0** | bonifica di una collection residua (24.830 documenti, header) |
| `scripts/convert-library-once.js` | 2026-10-05 | 1 commento in `scripts/sync-library-once.js:42` | «una tantum» (header) |
| `scripts/sync-library-once.js` | 2026-10-05 | **0** | «una tantum» (header) |
| `scripts/repair-library-data.js` | 2026-10-05 | **0** | riscrive copertine servite da host dismessi (header) |
| `scripts/repair-dna-names.js` | 2026-10-05 | 1 commento in `tests/characterization/dnaEngineExtraction.test.js:92` | riparazione del batch del 05/10 |
| `scripts/repair-dna-vectors.js` | 2026-10-05 | 1 commento in `tests/characterization/dnaEngineExtraction.test.js:90` | riparazione del batch del 05/10 |
| `scripts/requeue-damaged-titles.js` | 2026-10-05 | **0** | «ESATTAMENTE gli 8 item» (header) |
| `scripts/requeue-library-without-tmdb.js` | 2026-10-05 | **0** | rimessa in coda una tantum (ticket 06) |
| `scripts/verify-damaged-titles.js` | 2026-10-05 | **0** | verifica degli 8 item (header) |
| `scripts/verify_real_fallbacks.js` | 2026-10-01 | **0** | verifica una tantum sugli 11 record non risolti (header) |
| `scripts/qa/dedup-real-library.js` | 2026-10-05 | **0** | «Pulizia una tantum della libreria utente reale» (header) |
| `scripts/qa/hero-enrich.js` | 2026-10-07 | solo `.scratch/qc-cataloghi/` | tool della campagna QC (misure degli hero) |
| `scripts/qa/keyword-bench.js` | 2026-10-07 | solo `.scratch/qc-cataloghi/` | tool della campagna QC (banco keyword) |

Più i due tool della campagna che vivono solo nei ticket (stesso commit, 07/10):
`scripts/qa/qc-aggregate.js` e `scripts/qa/verify-solo-anime.js` (`git grep -l … -- docs tests src ops`
→ 0; citati in `.scratch/qc-cataloghi/ricerche/01-report-qc-cataloghi.md:45`).
Totale: **19** script senza un chiamante fuori dalla memoria del lavoro.

**Avvertenza per il 05/06**: una parte di questi scrive su MongoDB o su Redis — le migrazioni e le
riparazioni: `convert-library-once` (`LibraryConverterService.convertAll`, riga 111),
`sync-library-once`, `repair-library-data`, `repair-dna-names`, `repair-dna-vectors`,
`requeue-damaged-titles`, `requeue-library-without-tmdb`, `drop-streambadges`,
`qa/dedup-real-library` (header: «Pulizia una tantum della libreria utente reale»);
`qa/verify-solo-anime` scrive il profilo di prova via `POST /api/configure` e
`docs/TESTING_UTILITIES.md:150` avverte «mai in produzione». «Già eseguito» è **documentato per uno
solo** — `scripts/seed_learned_names.js`, che in testa dice *«Il lavoro e' gia' stato fatto»* — e per
gli altri è **inferito** da zero chiamanti, data di commit (quasi tutti il 05/10, in un'unica
tornata) e testo dell'header. Non ho modo, da un checkout offline, di provare che una migrazione sia
stata applicata in produzione: chi cancella deve verificare il timestamp dell'ultima esecuzione o la
condizione sui dati prima di rimuovere. `migrate_library_itemid_null.js`,
`backfill-mediatype-anime.js` e `seed_learned_names.js` hanno un test che li importa: la rimozione
tocca anche quel test.

### 2.3 I tre file non-JS sotto `scripts/`

| file | chi lo legge (prova) | verdetto |
|---|---|---|
| `scripts/qa/README.md` | è documentazione: descrive `simulate.js` (righe 20-24) e cita `top50-dump.js:125` | resta |
| `scripts/qa/profiles.spec.json` | `scripts/qa/lib/common.js:17` (default `--spec`); `scripts/qa/README.md:6` | resta — la fixture era stantia ed è stata rimappata il 06/10 (`478b6bb`, `.scratch/qc-cataloghi/issues/11-harness-fixture-stantie.md:3`) |
| `scripts/extracted_nsfw_keywords.json` | **nessun codice**: l'unica citazione è un TODO — `todo/3_kids_filter_and_nsfw.md:11` | candidato 05/06 (input di un lavoro non iniziato, 3.814 byte) |

---

## 3. Dati e artefatti tracciati in git che non dovrebbero esserlo

Byte reali in git (non del worktree): `git cat-file -s HEAD:<path>`.

| artefatto | byte | chi lo legge (prova) | come si rigenera | verdetto |
|---|---|---|---|---|
| `src/data/bolle.json` | **3.266.688** (3,12 MiB) | `src/engines/bolle/Bolle.js:41` (`require('../../data/bolle.json')`); `graph/pipeline.py:495` (parità Python); `tests/test_graph_pipeline.py:109`; `tests/bolleParity.test.js:26` (via `Bolle`) | `python -m graph.pipeline esporta` (default `--fuori src/data/bolle.json`, `graph/pipeline.py:807-808`); `graph/pipeline.py:622` è la voce del DAG | **in git**: è l'unico modo per cui ogni istanza appena clonata ha il motore; la decisione 2 della mappa lo vuole interno al modulo. Nota: `src/engines/bolle/README.md:30` dice «1,55 MB», il file è 3,12 MiB |
| `src/data/hierarchical_graph.json` | **1.033.340** (1010 KiB) | `src/engines/graph/HierarchicalGraph.js:18-20` (require dinamico, in `try/catch`); `graph/upstream/spazi-trakt.py:128`; ~20 script di `.scratch/ml-collaborativo/` | `python offline_graph_builder/build_graph.py` (`OUTPUT_JSON` a `:520`); il generatore è **tracciato**, ma gli input (`offline_graph_builder/venv/`, `cache/`) sono ignorati (`.gitignore:161,164`) | **in git**: è il grafo del vecchio stack (DNA); la mappa lo assegna al 02/09 |
| `blank.pdf` | **362.006** | nessun codice. Contesto umano: `.scratch/bolle-nitrile/map.md:4`, `.scratch/ml-collaborativo/map.md:4` («PDF `blank.pdf`, dialogo con Gemini») | non rigenerabile: è un'esportazione umana di una conversazione | **non dovrebbe stare in git**. Aggiunto il 13/10 in `b14968b`; il report `.scratch/frontend-verifica/ricerche/01-verifica-rilievi-frontend-pdf.md:4` lo dava per cancellato (era una modifica non committata, poi rientrata) |
| `misura-tempi-cataloghi.md` | **15.437** | **nessuna citazione**: `git grep -c "misura-tempi-cataloghi"` → 0 | report di misura del 04/10/2026 su `mate` (misura `ops/timing/`) | **orfano**: o si cita da `docs/`, o non ha ragione di stare in git |
| `misura-tipo-ita.md` | **14.563** | **nessuna citazione**: `git grep -c "misura-tipo-ita"` → 0 | report del 04/10/2026 (script in `.scratch/t12/`, non tracciato) | **orfano** |
| `todo grafo.md` | **18.319** | `.scratch/todo-grafo/fai-ticket.py:18`, `.scratch/todo-grafo/issues/01-i-tre-bug-e-il-quarto-verifica-sul-codice.md:6`, `.scratch/suggerimenti/fai-ticket.py:1`, `.scratch/coerenza/fai-ticket.py:3` | input umano: la revisione dell'esperto sul grafo | **documento di lavoro alla root**: consumato da `.scratch`, non dal prodotto |
| `Ottimizzazione e Futuro del Grafo YACA.md` | **52.365** | `.scratch/bolle-nitrile/fai-digest.py:55`, `.scratch/mappa-pesata/fai-digest.py:55`, `.scratch/modulo/fai-digest.py:46`, le mappe `grafo-servibile` e `bolle-nitrile` | input umano: la risposta dell'esperto che ha aperto la fase | **documento di lavoro alla root** |

### 3.1 Altri artefatti pesanti trovati (non nell'elenco del ticket)

Il più grande file tracciato del repo **non è `bolle.json`**:

| artefatto | byte | chi lo legge | verdetto |
|---|---|---|---|
| `.scratch/mappa-pesata/bolle-nuovi.json` | **35.982.520** (34,3 MiB) | **nessuno**: l'unico riferimento è lo script che lo scrive, `.scratch/mappa-pesata/colloca-nuovi.py:42` (`git grep -l "bolle-nuovi"` → solo quel file) | output di ricerca orfano: 34 MiB in git per un esperimento |
| `.scratch/bolle-prima.json` | **1.629.833** | **nessuno**: `git grep -n "bolle-prima"` → 0 | istantanea orfana |
| `.scratch/qc-cataloghi/ricerche/report.json` | **878.912** | citato come report in `.scratch/qc-cataloghi/` (`.scratch/qc-cataloghi/ricerche/01-report-qc-cataloghi.md`) | dato di campagna, rigenerabile |
| `.scratch/ml-collaborativo/gold/*.json` | 26 file, **3,40 MiB** totali | `.scratch/ml-collaborativo/riepilogo.md` | dataset di una ricerca chiusa |
| `.scratch/frontend-responsive/screens/*.png` | 19 file, **1,31 MiB** totali | `.scratch/frontend-responsive/report.md` e i ticket | screenshot di una verifica chiusa |

`.scratch/` è **dichiarata versionata di proposito** (`.scratch/README.md`), quindi questi file non
sono «junk»: sono però **dati derivati** che `.gitignore` esclude per forma (`*.parquet`, `*.json.gz`,
`*.ndjson`, `runs/`, `data/`) e che in forma `.json`/`.png` passano. Il 05/06 dovrebbe decidere caso
per caso. L'unico che nessuno rilegge è `bolle-nuovi.json` (34 MiB).

---

## 4. Test orfani

Criterio del ticket: file in `tests/` che importano moduli non raggiungibili. Poiché i moduli
totalmente irraggiungibili sono **0** (§1.1), la lettura onesta è: test che importano i moduli **non
raggiungibili dal prodotto** (`index.js`) — cioè i tre di §1.2.

| test | riga | modulo importato | verdetto |
|---|---|---|---|
| `tests/tasteClusters.test.js` | `:9` | `src/utils/tasteClusters.js` | test dell'unica ragione d'essere della shim |
| `tests/characterization/dnaCharacterization.test.js` | `:39` | `src/utils/tasteClusters.js` | idem (golden master del DNA) |
| `tests/characterization/dnaEngineExtraction.test.js` | `:21` (asserzioni a `:42-44,117`) | `src/utils/tasteClusters.js` | verifica **che la shim riesporti** `dnaEngine`: è il contratto della shim, non del prodotto |
| `tests/mongoConnectRetry.test.js` | `:7`, `:8` | `src/utils/mongoConnect.js`, `src/utils/retry.js` | test del connettore dei timer, non del server |
| `tests/retry.test.js` | `:1` | `src/utils/retry.js` | test del classificatore condiviso |

Prove: `git grep -n "utils/tasteClusters\|utils/mongoConnect\|utils/retry" -- tests`.

Tre test importano **script one-off** (§2.2), non moduli di `src/`, e vanno considerati insieme alla
decisione di cancellazione: `tests/ticket14CatalogFixes.test.js:5` →
`scripts/migrate_library_itemid_null.js`; `tests/backfillMediatypeAnime.test.js:38` →
`scripts/backfill-mediatype-anime.js`; `tests/seedLearnedNames.test.js:23` →
`scripts/seed_learned_names.js`.

**Nessuno di questi è «test di codice morto»**: ciascuno è l'unica difesa di un modulo che esiste per
gli script o per la characterization. Zero test, invece, importano moduli che nessuno raggiunge:
quei moduli non esistono.

---

## 5. Docs che descrivono codice scomparso

La convenzione è in `docs/INDEX.md:138-142` («verifica a mano delle citazioni», 04/10/2026): per ogni
`file:riga`, il file esiste ancora? L'ho fatta con un estrattore su tutti i `docs/*.md`.

**Dataset**: **544** occorrenze uniche estratte; **481 risolte** (263 per percorso, 218 per basename);
**63 non risolte** (27 con directory, 36 con solo il basename); 0 righe fuori range nei file che
esistono. L'estrattore è quello descritto in «Metodo» (punto 4): ogni riga di questo report porta
comunque il comando `git` che la prova da solo.

### 5.1 Il caso vero: un file rimosso citato come se fosse vivo

| doc:riga | citazione | prova che è scomparso | sostituto |
|---|---|---|---|
| `docs/DUCKDB_ARCHITECTURE.md:64` | «è stato introdotto il pattern **Adapter**: `src/utils/legacyTmdbAdapter.js`» | `git log --diff-filter=D --format='%ad %h %s' --date=short -- src/utils/legacyTmdbAdapter.js` → **2026-07-23 `73a023d`** «cleanup dead code… native DuckDB sql» | nessuno: il VSM oggi passa da `queryBuilder.js`/DuckDB |
| `docs/CATALOG_LOGIC.md:119` | «grazie all'intercettore `legacyTmdbAdapter.js` per compatibilità VSM» | idem | idem |

Aggravante: il commit che ha **cancellato** il file è del 23/07, l'ultimo commit che ha toccato questi
due doc è del **06/10** (`65c3c34` «allinea la documentazione al codice») — il doc è stato riletto
due mesi e mezzo dopo la rimozione e la citazione è rimasta. Comandi:
`git log --diff-filter=D -1 --format='%ad %h %s' --date=short -- src/utils/legacyTmdbAdapter.js`
e `git log -1 --format='%ad %h %s' --date=short -- docs/CATALOG_LOGIC.md docs/DUCKDB_ARCHITECTURE.md`.

### 5.2 File rimossi citati **come tali** (menzioni storiche corrette — nessuna azione)

| doc:riga | file scomparso | cosa dice il doc | prova della rimozione |
|---|---|---|---|
| `docs/INDEX.md:141` | `kitsu.js`, `sync_entities.js`, `TmdbProvider.js` | li elenca come esempi di citazioni sbagliate già trovate | `45bd78f` (15/08), `a028ff6`, `01440ea` |
| `docs/DUCKDB_ARCHITECTURE.md:9` | `tmdbToSqlTranslator.js` | «Inizialmente… un traduttore legacy» | `2420e75` |
| `docs/DUCKDB_ARCHITECTURE.md:40` | `scripts/sync_entities.js` | «**non esiste più**» | `45bd78f` (15/08) |
| `docs/PRESETS.md:60,65,71` | `sync_entities.js` | sezione «script non più nel repo» + CAUTION con commit | `45bd78f` |
| `docs/CATALOG_LOGIC.md:120` | `TmdbProvider.js`, `KitsuProvider.js` | «~~rimossi~~: non esistono più», con i commit | `01440ea`, `a028ff6` |
| `docs/KITSU_MAPPING.md:89` | `src/clients/kitsu.js`, `TmdbToKitsuMapper.js` | «il produttore era… rimosso il 2026-07-09» | `a028ff6`; nota: `TmdbToKitsuMapper` stava in `src/utils/`, non `src/clients/` |
| `docs/CHANGELOG.md:62` | `fetch_state.js`, `fetch_all_catalogs.js` | changelog storico: «unifica le funzionalità di…» | annesso a `fetch_catalogs.js` |
| `docs/DEPLOYMENT_HOME_SERVER.md:7` | `DEPLOYMENT_OPS.md`, `DEPLOYMENT_VPS_HETZNER.md` | «sono stati cancellati» | `968b0df` (04/10) |

### 5.3 Drift di riga: il file c'è, la riga citata no (campione verificato)

| doc:riga | citazione | dove sta oggi il codice | prova |
|---|---|---|---|
| `docs/STREMIO_INTERNALS.md:131` | «il **manifest** con handle sconosciuto (400, `stremio.js:389`)» | `src/api/stremio.js:343` (`res.status(400)… Configurazione non valida`) | `grep -n "status(400)" src/api/stremio.js` |
| `docs/PRESETS_DATE.md:168` | «`DuckDbProvider.js:72-80` ricalcola da sé la data» | `src/catalog/providers/DuckDbProvider.js:48` (`let recentDate = q.recent_since`) | `grep -n "recent_since" src/catalog/providers/DuckDbProvider.js` |
| `docs/PRESETS.md:151` | «`getSortByValue()` (`stremio.js:62`, chiamata a riga 427)» | import a `src/api/stremio.js:29`, chiamata a `:381` | `grep -n "getSortByValue" src/api/stremio.js` |

Il drift di riga non è quantificato per intero (481 citazioni risolte, campione di 3): servirebbe un
controllo semantico che un estrattore non può fare. I tre campioni sono tutti sbagliati, il che dice
che la convenzione «verifica a mano» ha ancora lavoro davanti — ma è materiale per il 13, non per
questo ticket.

### 5.4 Le citazioni non risolte che **non** sono codice scomparso (61 delle 63)

Delle 63 non risolte: **2** sono il caso vero (§5.1); le altre **61** si distribuiscono in:
**16** occorrenze in 8 righe di «file rimossi citati come tali» (§5.2), **24** artefatti a runtime,
**18** percorsi dell'host (queste due categorie si sovrappongono), **6** falsi positivi
dell'estrattore, **1** citazione esterna a `stremio-addon-sdk`.

- **Percorsi dell'host** (18): `/usr/local/bin/cpu-governor.sh`, `/root/.docker/config.json`,
  `/srv/yaca/ops/yaca-backup.sh`, `/var/lib/docker/volumes/…`, `/data/tmdb/…`, `.ts.net/manifest.json`
  — descrivono il `mate`, non il repo (`docs/DEPLOYMENT_HOME_SERVER.md`, `docs/STREMIO_INTERNALS.md`).
- **Artefatti a runtime, gitignorati per scelta** (24): `ita_annotations.jsonl`,
  `ita_annotations.diff.json`, `ita_annotations.meta.json`, `master_movies.jsonl`, `master_tv.jsonl`,
  `cursor.json`, `last-run.json`, `catalogs_output.txt`, `catalog_state.json`,
  `.agents/scratch/analysis_report.json`, `scripts/relevance_validation_report.json` — li scrivono a
  runtime `services/doppiaggi-source`, il daemon TMDB e gli script; notare che
  `docs/TESTING_UTILITIES.md:87` cita `relevance_validation_report.json` ma lo script scrive
  `scripts/relevance_validation_report.json` solo dopo un giro (nessun file nel repo).
- **Falsi positivi dell'estrattore** (6): `sanitizeOptions.sh` (da `sanitizeOptions.shouldApply…`),
  `res.json` (da `res.json()`), `.test.js` (la frase «estensione `.test.js`»), `//mate.…ts.net`.

Nota a parte: `docs/STREMIO_INTERNALS.md:105` cita
`stremio-addon-sdk/src/builder.js`; il pacchetto **non è una dipendenza** (`package.json` non lo
contiene) e non è installato — la citazione è a un concetto esterno, non a un file del repo.

---

## 6. La root: file non tracciati e spuri

```bash
git status --porcelain          # ?? .scratch/confini/ · ?? frontend.pdf · ?? untitled.md
git check-ignore -v <file>      # mostra la regola che lo copre
```

| file | tracciato? | dimensione | data | chi lo ha generato (prova) | verdetto |
|---|---|---|---|---|---|
| `untitled.md` | no, **non ignorato** | 0 byte | 15/10 22:55 | **non attribuibile**: `git grep -n "untitled"` → 0, nessuno script del repo lo nomina | junk: cancellazione a mano (05) |
| `frontend.pdf` | no, **non ignorato** | 419 KiB | 15/10 23:05 | esportazione umana di una conversazione sul frontend; la analizza `.scratch/frontend-verifica/ricerche/01-verifica-rilievi-frontend-pdf.md:1-2` | junk: cancellazione a mano |
| `digest.txt` | no, ignorato (`.gitignore:200`, `digest*.txt`) | 344 KiB | 15/10 23:09 | `gitingest` da `.scratch/*/fai-digest.py` con `output="digest.txt"`: `bolle-nitrile:61`, `grafo-servibile:19`, `mappa-pesata:61`, `modulo:52` | ignorato per scelta; citato in `graph/README.md` («il **digest** (`digest.txt`, ~914k token)») |
| `digest_7.txt` | no, ignorato (`.gitignore:200`) | 586 KiB | 16/10 12:24 | `.scratch/suggerimenti/fai-digest.py:61` (`output="digest_7.txt"`) | idem |
| `bash.exe.stackdump` | no, ignorato (`.gitignore:195`, `*.stackdump`) | 1,2 KiB | 12/10 13:37 | crash di Git Bash/msys: `head -1 bash.exe.stackdump` → `Stack trace: … msys-2.0.dll` | ignorato; eliminabile |
| `.pytest_cache/` | no, **auto-ignorato** (`.pytest_cache/.gitignore` contiene `*`) | 2,3 KiB (**2.394** byte, `du -sb .pytest_cache`) | 16/10 09:28 | `pytest` (lo crea alla prima collezione; i test Python sono `tests/test_graph_pipeline.py`, `tests/test_micro_graph.py`) | generato, invisibile a git; eliminabile |
| `tests/__pycache__/` | no, ignorato (`.gitignore:191`) | 2 `.pyc` | — | `pytest`/import Python | idem |
| `blank.pdf` | **sì** | 354 KiB | 16/10 08:56 | esportazione umana; vedi §3 | spostare/cancellare è del 05/06 |
| `.cache/` | no, ignorato (`.gitignore:112`) | **7,3 GB** (`du -sh --apparent-size .cache`) | — | cache dell'app (dump TMDB, ML) — rigenerabile | **non toccare** |
| `offline_graph_builder/` | 3 file tracciati; `venv/`, `cache/` ignorati (`.gitignore:161,164`) | ~1,5 GB su disco | — | builder del grafo gerarchico (§3) | la parte viva è tracciata, il resto è rigenerabile |
| `secrets.env` · `.env` | no, ignorati (`.gitignore:157` e `:84`) | 1,4 KiB / 1,6 KiB | — | configurazione locale | **segreti: non toccare, non committare** |

---

## 7. Cosa non ho potuto determinare (il limite, esplicito)

1. **Chi ha creato `untitled.md` e `frontend.pdf`**: nessuno script del repo li scrive
   (`git grep` → 0); per `frontend.pdf` il contenuto è una conversazione, quindi è un'esportazione
   umana. L'attribuzione resta un'inferenza.
2. **«One-off già eseguito»** è un fatto di produzione: dal checkout posso provare solo zero
   chiamanti, la data del commit e ciò che dice l'header (documentato per
   `seed_learned_names.js`). Gli script di migrazione/riparazione di §2.2 vanno verificati sui
   dati prima della cancellazione.
3. **I `require` dinamici** elencati in §1.4: tre punti non sono risolvibili meccanicamente
   (`scripts/qa/verifyTypeSelectors.js:70,92,96`; `tests/*` `require(id)` nelle factory di
   `jest.mock`; `.scratch/livello-latente/compare-census.js:20`). Ho verificato a mano che non
   caricano moduli di `src/`, ma è una lettura, non una prova.
4. **Il drift delle righe nei docs** l'ho campionato (3 su 481 citazioni risolte), non quantificato:
   distinguere «la riga giusta» da «la riga che per caso contiene qualcosa di simile» richiede una
   lettura semantica.
5. **Conteggi `git grep`**: sono per **file** che contengono il pattern, commenti inclusi (es. il
   conteggio di `retry.js` include commenti in `ops/` e `src/`). Dove serviva un conteggio preciso
   l'ho indicato nella cella.
6. **Niente runtime**: nessun `docker exec`, nessun avvio dell'app, nessun `node -e "require(...)"`
   su moduli con effetti (Mongo, DuckDB). L'unico runtime usato è il grafo dei `require`, che è
   statico per costruzione.

**In una riga per il 05/06/12**: in `src/` non c'è codice irraggiungibile; i candidati veri sono 19
script senza chiamanti (§2.2), 7 file di documento/dato alla root (§3), 5 test legati a tre utility
(§4), 1 file rimosso citato come vivo in 2 doc (§5.1) e i file spuri della root (§6).
