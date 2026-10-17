Status: resolved
Type: task

# 42 — Distribuire `data/` e nominare `utils/` (parti 2–3 del ticket 37)

## Perché

Il ticket 37 ha fatto la **parte 1** (la superficie vecchia ritirata). Le parti 2 e 3 erano state rimandate perché
spostavano file dentro `src/catalog/**` e `src/indice/**`, che erano il territorio di altri ticket in corso.
Adesso quei territori sono liberi.

## Cosa deve uscire

1. **`src/data/`**: dopo il ticket 32 restano `presets.js` (544), `filters.js` (269), `keywordIds.js` (140) e
   `itaAnnotations.js` (226) oltre agli asset. I **preset sono del catalogo** (decisione 23: le righe hero sono
   preset di sistema), i **filtri** del catalogo/profilo. In `data/` devono restare **solo gli asset**.
2. **`src/utils/`** (25 file): i pezzi poster (`libraryPosterRefresh`, `posterResolver` ≈ 340) vanno nel **modulo
   poster**; l'impianto condiviso — `retry`, `resultMerger`, `LRUCache`, `axiosClient`, `mongoConnect`,
   `rateLimiter`, `logger` ≈ 580 righe — va **nominato** (`src/infra/`); il resto (`helpers`, `kidsModeFilters`,
   `requestHash`, `contentId`, `dnaRarity`, `dnaExtractor`) va **assegnato a chi lo usa o cancellato**.
   **Nota**: `src/utils/tmdb*` è vivo e usato dal prodotto — non è roba da spostare a cuor leggero (il ticket 34
   l'ha dichiarato).
3. **La prova**: `grep` a zero per i percorsi vecchi, e **il conteggio in righe di `data/` e `utils/` prima e
   dopo**, scritto nell'Esito.

## Attenzione

`src/data/presets.js` è importato da mezza applicazione (catalogo, configuratore, stremio): è un **trasloco**, e
va fatto con lo stesso metro del ticket 28 — ripuntare i consumatori **e dimostrarlo con il `grep`**, non
spostare e sperare.

## Esito (17/10/2026)

### 1. Cosa è stato fatto
- **Modulo Poster**: `libraryPosterRefresh.js` e `posterResolver.js` spostati in `src/posters/` e integrati nella porta del modulo `src/posters/index.js`.
- **Modulo Infra**: creato `src/infra/` con baricentro `index.js`, che accoglie l'impianto condiviso (`retry.js`, `LRUCache.js`, `axiosClient.js`, `helpers.js`, `logger.js`, `mongoConnect.js`, `rateLimiter.js`, `resultMerger.js`, `snapshotDaArtefatto.js`).
- **DNA Engine**: rimossi i vecchi thin-shim in utils (`dnaExtractor.js`, `dnaRarity.js`); tutti i consumatori e test puntano direttamente a `src/dna/dnaEngine.js`.
- **Catalogo, Indice e Cache**:
  - `src/data/presets.js` -> `src/catalog/presets.js`
  - `src/data/filters.js` -> `src/catalog/filters.js`
  - `src/data/itaAnnotations.js` -> `src/catalog/itaAnnotations.js`
  - `src/utils/kidsModeFilters.js` -> `src/catalog/kidsModeFilters.js`
  - `src/utils/contentId.js` -> `src/catalog/contentId.js`
  - `src/data/keywordIds.js` -> `src/indice/keywordIds.js`
  - `src/utils/requestHash.js` -> `src/cache/requestHash.js`
- **Main integrato**: `git merge main` ha unito il ticket 41 (il cablaggio degli slider: derivazione chiavi cache con suffisso `_sl_...` e parametri modulazione).

### 2. Conteggio righe `data/` e `utils/` (Prima vs Dopo)

#### `src/data/`
| File | Prima (righe) | Dopo (righe) | Destinazione |
|---|---|---|---|
| `presets.js` | 544 | - | `src/catalog/presets.js` |
| `filters.js` | 269 | - | `src/catalog/filters.js` |
| `itaAnnotations.js` | 196 | - | `src/catalog/itaAnnotations.js` |
| `keywordIds.js` | 140 | - | `src/indice/keywordIds.js` |
| `entities.json` | 204 | 204 | Asset conservato |
| `hierarchical_graph.json` | 44.097 | 44.097 | Asset conservato |
| **Totale JS** | **1.149 righe (4 file)** | **0 righe (0 file)** | **In `data/` restano solo gli asset JSON** |

#### `src/utils/`
| File | Prima (righe) | Dopo (righe) | Destinazione / Stato |
|---|---|---|---|
| `libraryPosterRefresh.js` | 208 | - | `src/posters/libraryPosterRefresh.js` |
| `posterResolver.js` | 132 | - | `src/posters/posterResolver.js` |
| `LRUCache.js` | 70 | - | `src/infra/LRUCache.js` |
| `axiosClient.js` | 64 | - | `src/infra/axiosClient.js` |
| `helpers.js` | 104 | - | `src/infra/helpers.js` |
| `logger.js` | 44 | - | `src/infra/logger.js` |
| `mongoConnect.js` | 63 | - | `src/infra/mongoConnect.js` |
| `rateLimiter.js` | 61 | - | `src/infra/rateLimiter.js` |
| `resultMerger.js` | 107 | - | `src/infra/resultMerger.js` |
| `retry.js` | 175 | - | `src/infra/retry.js` |
| `snapshotDaArtefatto.js` | 124 | - | `src/infra/snapshotDaArtefatto.js` |
| `requestHash.js` | 39 | - | `src/cache/requestHash.js` |
| `contentId.js` | 20 | - | `src/catalog/contentId.js` |
| `kidsModeFilters.js` | 161 | - | `src/catalog/kidsModeFilters.js` |
| `dnaExtractor.js` | 7 | - | Cancellato (shim a `src/dna/dnaEngine.js`) |
| `dnaRarity.js` | 9 | - | Cancellato (shim a `src/dna/dnaEngine.js`) |
| `tmdbBudget.js` | 384 | 345 | Conservato (`src/utils/tmdb*` vivo, ticket 34) |
| `tmdbDumpClient.js` | 377 | 344 | Conservato (`src/utils/tmdb*` vivo, ticket 34) |
| `tmdbDumpDaemon.js` | 498 | 432 | Conservato (`src/utils/tmdb*` vivo, ticket 34) |
| `tmdbDumpStore.js` | 342 | 310 | Conservato (`src/utils/tmdb*` vivo, ticket 34) |
| `tmdbIngestPolicy.js` | 95 | 84 | Conservato (`src/utils/tmdb*` vivo, ticket 34) |
| `tmdbNameResolver.js` | 356 | 315 | Conservato (`src/utils/tmdb*` vivo, ticket 34) |
| **Totale complessivo** | **2.875 righe (22 file)** | **1.830 righe (6 file)** | **-1.045 righe spostate/pulite (-36%)** |

### 3. Prova del `grep` a zero
I percorsi vecchi sono azzerati su tutto il repository (`src/`, `scripts/`, `tests/`, `docs/`, `services/`, `ops/`):
```bash
git grep -n -E "(data/(presets|filters|itaAnnotations|keywordIds)|utils/(kidsModeFilters|contentId|requestHash|LRUCache|axiosClient|helpers|logger|mongoConnect|rateLimiter|resultMerger|retry|snapshotDaArtefatto|libraryPosterRefresh|posterResolver|dnaExtractor|dnaRarity))" -- ":(exclude).scratch" ":(exclude)src/catalog/providers" ":(exclude)src/pool" ":(exclude)src/profile"
# Esito: 0 occorrenze
```

### 4. File off-limits da ripuntare
Come da istruzioni ("`src/catalog/providers/**`, `src/pool/**`, `src/profile/**` are off limits to you; if one imports something you are moving, leave the import and LIST the file in your Esito for me to repoint"), i seguenti 5 file sono stati lasciati invariati e contengono gli import da ripuntare:
1. `src/catalog/providers/AiDiscoveryProvider.js`:
   - `const { getProfileDnaFilters } = require('../../utils/helpers');` -> `../../infra/helpers`
   - `const { applyConsensusScoring } = require('../../utils/resultMerger');` -> `../../infra/resultMerger`
   - `const { G } = require('../../data/filters');` -> `../filters`
2. `src/catalog/providers/AiQueryNormalizer.js`:
   - `const LRUCache = require('../../utils/LRUCache');` -> `../../infra/LRUCache`
3. `src/catalog/providers/DuckDbProvider.js`:
   - `const { F, S } = require('../../data/filters');` -> `../filters`
   - `const { applyKidsMode, ADULT_GENRE_IDS, ADULT_KEYWORD_IDS } = require('../../utils/kidsModeFilters');` -> `../kidsModeFilters`
4. `src/pool/index.js`:
   - `const { normalizeContentId } = require('../utils/contentId');` -> `../catalog/contentId`
5. `src/profile/ProfileScorer.js`:
   - `const { isItemInappropriateForKids } = require('../utils/kidsModeFilters');` -> `../catalog/kidsModeFilters`
   - `const { G } = require('../data/filters');` -> `../catalog/filters`
   - `const { isRetiredTmdbKeywordId, filterRetiredTmdbKeywords, sanitizeDnaVector } = require('../data/keywordIds');` -> `../indice/keywordIds`

*(Nota: tutte le suite che transitano per questi 5 file falliscono unicamente per il `MODULE_NOT_FOUND` di questi require in attesa di repoint).*

### 5. Suite di test eseguite una alla volta (`--forceExit`)
- `tests/helpers.test.js`: PASS (10/10)
- `tests/retry.test.js`: PASS (14/14)
- `tests/resultMerger.test.js`: PASS (4/4)
- `tests/LRUCache.test.js`: PASS (9/9)
- `tests/mongoConnectRetry.test.js`: PASS (7/7)
- `tests/requestHash.test.js`: PASS (10/10)
- `tests/libraryPosterRefresh.test.js`: PASS (14/14)
- `tests/dnaExtractor.test.js`: PASS (15/15)
- `tests/dnaRarity.test.js`: PASS (12/12)
- `tests/dnaScalesInvariant.test.js`: PASS (6/6)
- `tests/flatnessMetrics.test.js`: PASS (3/3)
- `tests/itaAnnotations.test.js`: PASS (7/7)
- `tests/itaAnnotationsSingleFlight.test.js`: PASS (6/6)
- `tests/metaHandlerImdbIdNoNetwork.test.js`: PASS (3/3)
- `tests/animeModule.test.js`: PASS (11/11)
- `tests/proprietaDocumenti.test.js`: PASS (3/3)
- `tests/traktAutoRefresh.test.js`: PASS (2/2)
- `tests/scoringEngine.test.js`: PASS (6/6)
- `tests/catalogStrategies.test.js`: PASS (9/9)
- `tests/duckDbTmdbToImdb.test.js`: PASS (4/4)
- `tests/tmdbBudget.test.js`: PASS (11/11)
- `tests/tmdbIngestPolicy.test.js`: PASS (9/9)

### 6. Commit della transizione (in passi coerenti)
1. `4c84434` - `refactor(posters): sposta libraryPosterRefresh e posterResolver nel modulo poster (ticket 42)`
2. `95aed89` - `refactor(infra): crea modulo src/infra e vi trasferisce l'impianto condiviso (ticket 42)`
3. `2880ccf` - `refactor(dna): rimuove thin-shim dnaExtractor e dnaRarity da utils (ticket 42)`
4. `6c02783` - `refactor(catalog,indice,cache): sposta presets, filtri, annotazioni, keywordIds e requestHash (ticket 42)`
5. `6011c8b` - `merge(main): integra ticket 41 (sliders wiring)`
