Status: ready-for-agent
Type: task

# 52 — Gli id al loro posto: `src/id_mapping` sparisce

## Perché

`src/id_mapping/id_cache.js` (96 righe) è la cache di traduzione **IMDb ↔ TMDB**: legge e scrive il modello
`ImdbToTmdbMapping`, con la rete TMDB come ripiego. Non è un modulo — è **un adattatore verso l'esterno**, e per
questo appartiene a `src/clients/`, dove già vivono i client TMDB e Trakt (il «meccanismo», come `src/ai`).

I suoi consumatori, misurati:

| consumatore | cosa prende |
|---|---|
| `src/meta/index.js:14` | `translateImdbToTmdb` |
| `src/profile/ProfileBuilder.js:510` | `translateImdbToTmdb` (require pigro) |
| `src/api/admin.js:6` | `clearIdCache` |
| `tests/metaHandlerCacheImmutability.test.js:42`, `tests/metaHandlerDumpImdbId.test.js:72` | mock del percorso |

**Nota che va scritta, non nascosta**: il modello `ImdbToTmdbMapping` è toccato da **tre** moduli
(`id_cache`, `library/ingestion/LibrarySyncService.js:465`, `posters/posterResolver.js:50`). La mappa dice che
solo il proprietario tocca i suoi modelli: qui il proprietario non è mai stato dichiarato. **Questo ticket non lo
risolve** (è una decisione di confine, non un trasloco) ma **lo dichiara** nell'Esito: chi possiede
`ImdbToTmdbMapping`, e chi lo tocca oggi.

## Cosa deve uscire

1. **`src/id_mapping/id_cache.js` → `src/clients/idMapping.js`** (rinomina al momento del trasloco: `id_cache` è
   un nome che non dice cosa fa — è la traduzione fra due sistemi di id). La cartella `src/id_mapping/`
   **sparisce**.
2. **I consumatori ripuntati**: `src/meta/index.js`, `src/profile/ProfileBuilder.js`, `src/api/admin.js`, e i due
   test che lo mockano (i mock devono puntare al **nuovo** percorso, se no diventano ciechi).
3. **La porta di `src/clients`** espone `translateImdbToTmdb` e `clearIdCache`, così chi sta fuori non nomina un
   file interno.
4. **Nessuno shim**: `src/id_mapping/id_cache.js` non resta come re-export.

## Attenzione

`src/meta/index.js` **si sposta in un altro ticket** (50, verso `src/stremio/`). Qui **non** spostarlo: aggiorna
solo il suo import. Se il ticket 50 è già atterrato quando parti, il file sarà `src/stremio/meta.js` — **verifica
su `main` prima di toccare**, e dichiara nell'Esito quale dei due hai trovato.

## La prova

- `ls src/id_mapping` → **non esiste**; `git grep -n "id_mapping"` in `src/`, `tests/`, `scripts/` → nessun
  `require` vivo.
- `node -e "require('./src/clients'); require('./src/clients/idMapping'); console.log('ok'); process.exit(0)"`.
- `npx jest tests/metaHandlerCacheImmutability.test.js tests/metaHandlerDumpImdbId.test.js tests/metaHandlerImdbIdNoNetwork.test.js --forceExit`.
- La suite intera con la baseline misurata (5 suite / 8 test / 1868 passati; incolla lista `FAIL` e totali) e i due
  hash del manifest invariati.

## Confini di file (per il lavoro in parallelo)

Questo ticket **possiede**: `src/id_mapping/**`, `src/clients/**`, `src/api/admin.js`, `src/profile/ProfileBuilder.js`,
i due test che mockano `id_cache`, e la riga di import dentro `src/meta/index.js` (o `src/stremio/meta.js`).
**Non tocca**: `src/utils/**`, `src/db/tier1*.js`, `services/tmdb-daemon/**`, `src/dna/**`, `src/ricerca/**`,
`src/middleware/**`, `index.js`, e **nient'altro** di `src/meta`/`src/stremio` (un solo import).
Se ti serve toccare un file fuori da questo elenco, **dichiaralo nell'Esito**.

## Regole

Valgono i Vincoli del ticket 48 (baseline misurata, mock di Jest, path relativi dopo uno spostamento, getter pigro,
niente `frontend/**`, niente push, un commit per passo). Aggiungi un `## Esito` in italiano e lascia
`Status: ready-for-agent`.

## Esito

### 1. Cosa è stato fatto
- **Spostamento e rinomina modulo**:
  - `src/id_mapping/id_cache.js` → `src/clients/idMapping.js`
  - Il require interno a TMDB è stato aggiornato da `../clients/tmdb` a `./tmdb`.
  - La cartella `src/id_mapping/` è stata eliminata (`src/id_mapping/id_cache.js` cancellato senza alcuno shim o re-export obsoleto).
- **Creazione porta `src/clients` (`src/clients/index.js`)**:
  - Creata la porta del modulo `clients` esponendo `translateImdbToTmdb` e `clearIdCache` tramite getter pigri (`getter pigro`), in modo che i consumatori esterni non debbano nominare file interni e non si creino require eager top-level o dipendenze parziali non intenzionali.
- **Rilevamento stato di `main`**:
  - Verificato che il Ticket 50 è già atterrato: `src/meta/index.js` non esiste più ed è diventato `src/stremio/meta.js`.
- **Ripuntamento dei consumatori**:
  - `src/stremio/meta.js:14`: `const { translateImdbToTmdb } = require('../clients');` (toccata solo la riga di import richiesta).
  - `src/profile/ProfileBuilder.js:517`: `const { translateImdbToTmdb } = require('../clients');` (require pigro allineato alla porta).
  - `src/api/admin.js:6`: `const { clearIdCache } = require('../clients');`
- **Ripuntamento dei test e dei mock**:
  - `tests/metaHandlerCacheImmutability.test.js:42`: aggiornato `jest.mock('../src/clients', ...)`
  - `tests/metaHandlerDumpImdbId.test.js:72`: aggiornato `jest.mock('../src/clients', ...)`
  - `tests/metaHandlerEpisodeIds.test.js:58`: aggiornato `jest.mock('../src/clients', ...)`
  - `tests/metaHandlerImdbIdNoNetwork.test.js:80`: aggiornato `jest.mock('../src/clients', ...)`
  - `tests/metaHandlerSeriesVideoOrder.test.js:61`: aggiornato `jest.mock('../src/clients', ...)`
  - `tests/metaHandlerTier1Promotion.test.js:19`: aggiornato `jest.mock('../src/clients', ...)`
  - `tests/robustness.test.js:16`: aggiornato require a `const { translateImdbToTmdb } = require('../src/clients');`

### 2. File toccati fuori dalla lista (Dichiarazione obbligatoria)
Oltre ai file esplicitamente citati nel brief:
- `tests/metaHandlerEpisodeIds.test.js`
- `tests/metaHandlerImdbIdNoNetwork.test.js`
- `tests/metaHandlerSeriesVideoOrder.test.js`
- `tests/metaHandlerTier1Promotion.test.js`
- `tests/robustness.test.js`
Questi 5 file di test contenevano riferimenti attivi a `../src/id_mapping/id_cache` (come mock o require diretto). Sono stati aggiornati verso `../src/clients` per intercettare il percorso reale e garantire che `git grep -n "id_mapping"` in `tests/` risulti totalmente privo di require/mock morti o orfani.

### 3. Dichiarazione Proprietà Modello `ImdbToTmdbMapping`
Come prescritto dalla specifica (Map §16 "solo il proprietario tocca i suoi modelli"):
- **Proprietario attuale**: Non è mai stato dichiarato un proprietario formale.
- **Chi lo tocca oggi**:
  1. `src/clients/idMapping.js` (ex `id_cache.js`): legge con `findOne`, scrive e aggiorna con `updateOne` (upsert per associare tmdbId o salvare il marker `NOT_FOUND`).
  2. `src/library/ingestion/LibrarySyncService.js:465-466`: esegue batch lookup diretto `ImdbToTmdbMapping.find({ imdbId: { $in: imdbIds } }).lean()`.
  3. `src/posters/posterResolver.js:4, 52`: esegue lookup diretto in sola lettura senza passare dalla rete `ImdbToTmdbMapping.findOne({ imdbId: rawId }).lean()`.
- **Opzioni oneste per la risoluzione futura del confine**:
  - **Opzione A (Consigliata per confine di modulo)**: Dichiarare `src/clients` (o specificamente il sotto-componente `idMapping`) proprietario esclusivo del modello `ImdbToTmdbMapping`. Esporre sulla porta di `clients` metodi dedicati (es. `resolveBatchImdbToTmdb(imdbIds)` e `lookupLocalImdbToTmdb(imdbId)`) cosicché `LibrarySyncService` e `posterResolver` deleghino a `clients` senza mai importare né manipolare direttamente il modello Mongoose.
  - **Opzione B**: Riconoscere la traduzione id come concern infrastrutturale / di indicizzazione globale e migrare la tabella di mapping interamente su DuckDB/Parquet (come già avviene per `resolveImdbIds`), eliminando progressivamente la persistenza su MongoDB.
  - **Opzione C**: Mantenere Mongo unicamente come cache L2 di fallback all'interno di `idMapping`, incapsulando tutte le operazioni CRUD all'interno del client adapter.

### 4. Prove eseguite e verifiche

- **Verifica rimozione cartella sorgente e assenza require vivi**:
  - `Test-Path src/id_mapping` → `False`
  - `git grep -n "id_mapping" -- src/ tests/ scripts/` → nessun risultato (exit code 1)
  - `git grep -n "id_cache" -- src/ tests/ scripts/` → nessun risultato (exit code 1)

- **Verifica caricamento moduli spostati e porta**:
  - `node -e "require('./src/clients'); require('./src/clients/idMapping'); console.log('ok'); process.exit(0)"`
    - Output: `ok`

- **Verifica invarianza byte-a-byte del feed (Manifest SHA256)**:
  - `node -e "const { buildManifest, buildRootManifest } = require('./src/stremio/manifest'); const crypto = require('crypto'); console.log('buildManifest({}):', crypto.createHash('sha256').update(JSON.stringify(buildManifest({}))).digest('hex')); console.log('buildRootManifest():', crypto.createHash('sha256').update(JSON.stringify(buildRootManifest())).digest('hex')); process.exit(0);"`
    - Output:
      ```
      buildManifest({}): dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178
      buildRootManifest(): 91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2
      ```
    - Entrambi gli hash sono identici al byte a quelli di baseline.

- **Verifica suite mirate (mock intercettati)**:
  - `npx jest tests/metaHandlerCacheImmutability.test.js tests/metaHandlerDumpImdbId.test.js tests/metaHandlerImdbIdNoNetwork.test.js --forceExit`
    - Output: `Test Suites: 3 passed, 3 total`, `Tests: 13 passed, 13 total`.
  - `npx jest tests/metaHandler tests/robustness.test.js --forceExit`
    - Output: `Test Suites: 7 passed, 7 total`, `Tests: 41 passed, 41 total`.

- **Verifica baseline suite completa (`npx jest --forceExit`)**:
  - Totali: `Test Suites: 5 failed, 181 passed, 186 total`, `Tests: 8 failed, 1 skipped, 1868 passed, 1877 total`.
  - Lista `FAIL` (esattamente le sole 5 suite consentite dalla baseline di main per assenza file parquet locali):
    ```
    FAIL tests/animeOverridesCertify.test.js
    FAIL tests/presetBurtonOrdering.test.js
    FAIL tests/donghuaCatalog.test.js
    FAIL tests/duckDbAndMatchmaker.test.js
    FAIL tests/candidateProvider.test.js
    ```
  - Zero regressioni introdotte.
