Status: resolved
ready-for-agent
Type: task

# 50 — Il servire dei metadati nel feed, e i middleware nell'API

## Perché

Due residui della **decisione 29** («il servire vive nel feed, non nel catalogo»), rimasti fuori dalla sua
applicazione:

1. **`src/meta/index.js` (528 righe) è servire.** Il suo stesso docstring: *«confine di dominio per il serving dei
   metadati Stremio: dettagli del titolo, arricchimento Kitsu/anime, allineamento id episodi verso IMDb,
   doppiaggio ITA per le schede poster e cache del metadato finale»*. Per la decisione 29 il **feed** è
   `src/stremio`, ed è lì che il servire abita (`catalogHandler`, `hybridServing`, `idratazione`, `badges`,
   `CatalogRouter`). `meta` è l'unico pezzo di servire ancora fuori.
2. **`src/middleware/` (154 righe, 5 file) è l'orlo HTTP**: `adminAuth`, `errorMiddleware`, `inputSanitizer`,
   `requestContext`, `sessione`. Sono montati da `index.js` e appartengono all'**API** (`src/api/`), che è il
   bordo del prodotto (ticket 10/11).

## Cosa deve uscire

1. **`src/meta/index.js` → `src/stremio/meta.js`** (o `src/stremio/meta/index.js` se preferisci mantenere la
   forma a cartella: dichiara quale). I consumatori ripuntati:
   - `src/api/stremio.js:29` (`metaHandler`, `isMetaDubbed`),
   - `src/stremio/catalogHandler.js:40` (`allineaIdFilm`),
   - i test che lo nominano (`allineaIdFilm`, `animeMarkerNormalization`, `kitsuMappingStats`, i `metaHandler*`).
   La **porta del feed** (`src/stremio/index.js`) deve esporre ciò che serve a `src/api`, così l'API nomina il
   feed e non un file interno.
2. **`src/middleware/` → `src/api/middleware/`**, con `index.js` ripuntato. La cartella `src/middleware/`
   **sparisce**.
3. **Nessuno shim**: `src/meta/index.js` non resta come re-export.

## Attenzione a un vincolo già dichiarato

`src/meta/index.js` importa `translateImdbToTmdb` da `src/id_mapping/id_cache` — quel file **si sposta in un
altro ticket** (52). Qui **non** lo toccare: lascia l'import com'è. Se dopo lo spostamento del ticket 52 il
percorso cambia, lo aggiorna chi integra. **Dichiaralo nell'Esito** se ti accorgi del disallineamento.

## La prova

- `ls src/meta` → **non esiste**; `ls src/middleware` → **non esiste**; `git grep -n "middleware/"` in `index.js` →
  i require puntano a `./src/api/middleware/…`.
- `node -e "require('./src/stremio'); require('./src/stremio/meta'); console.log('ok'); process.exit(0)"`.
- **Le suite del protocollo Stremio devono passare identiche**:
  `npx jest tests/stremio --forceExit` (4 suite, 19 test) e i sei `tests/metaHandler*.test.js` +
  `tests/allineaIdFilm.test.js` + `tests/kitsuMappingStats.test.js`.
- Il **manifest byte-a-byte**: i due hash in fondo al ticket 48.
- La suite intera con la baseline misurata (5 suite / 8 test / 1868 passati; incolla lista `FAIL` e totali).

## Confini di file (per il lavoro in parallelo)

Questo ticket **possiede**: `src/meta/**`, `src/middleware/**`, `src/api/stremio.js`, `src/stremio/**`, `index.js`,
e i test che li nominano.
**Non tocca**: `src/utils/**`, `src/db/tier1*.js`, `services/tmdb-daemon/**`, `src/dna/**`, `src/profile/**`,
`src/ricerca/**`, `src/id_mapping/**`, `src/api/configure/**`, `src/indice/duckDbStore.js`.
Se ti serve toccare un file fuori da questo elenco, **dichiaralo nell'Esito**.

## Regole

Valgono i Vincoli del ticket 48 (baseline misurata, mock di Jest, path relativi dopo uno spostamento, getter pigro,
niente `frontend/**`, niente push, un commit per passo). Aggiungi un `## Esito` in italiano e lascia
`Status: ready-for-agent`.

## Esito

### 1. Spostamenti eseguiti
- **`src/meta/index.js` → `src/stremio/meta.js`**: scelto il formato a file piatto `meta.js` per coerenza con gli altri moduli del feed (`catalogHandler.js`, `badges.js`, `manifest.js`, `fingerprint.js`, `collection.js`, `reconciler.js`).
  - Nessuno shim creato: `src/meta/index.js` non esiste più.
  - La cartella `src/meta/` è stata eliminata.
- **`src/middleware/` (5 file) → `src/api/middleware/`**:
  - `src/middleware/adminAuth.js` → `src/api/middleware/adminAuth.js`
  - `src/middleware/errorMiddleware.js` → `src/api/middleware/errorMiddleware.js`
  - `src/middleware/inputSanitizer.js` → `src/api/middleware/inputSanitizer.js`
  - `src/middleware/requestContext.js` → `src/api/middleware/requestContext.js` (adattato require `../../infra/helpers`)
  - `src/middleware/sessione.js` → `src/api/middleware/sessione.js` (adattato require `../auth/index`)
  - La cartella `src/middleware/` è sparita (`false` all'esistenza su disco).

### 2. Consumatori ripuntati
- **Porta del feed (`src/stremio/index.js`)**:
  - Espone via getter pigri `catalogHandler`, `metaHandler`, `isMetaDubbed`, `allineaIdFilm`.
- **`src/api/stremio.js`**:
  - Importa `catalogHandler`, `metaHandler`, `isMetaDubbed` direttamente dalla porta del feed `../stremio`.
  - Importa `utenteDallaSessione` da `./middleware/sessione`.
- **`src/stremio/catalogHandler.js`**:
  - Importa `allineaIdFilm` da `./meta`.
- **`index.js`**:
  - I 4 require middleware puntano a `./src/api/middleware/sessione`, `inputSanitizer`, `requestContext`, `errorMiddleware`.
- **Rotte API consumatrici dei middleware** (dichiarazione file fuori elenco iniziale per coerenza bordo HTTP):
  - `src/api/admin.js:10`: `const adminAuth = require('./middleware/adminAuth');`
  - `src/api/configurazione.js:3`: `const { richiedeSessione, erroreDominio } = require('./middleware/sessione');`
  - `src/api/mondi.js:11`: `const { richiedeSessione, erroreDominio } = require('./middleware/sessione');`
  - `src/api/profilo.js:3`: `const { richiedeSessione, erroreDominio } = require('./middleware/sessione');`
  - `src/api/ricerca.js:3`: `const { richiedeSessione, erroreDominio } = require('./middleware/sessione');`
- **Suite di test ripuntate**:
  - `tests/allineaIdFilm.test.js`: `require('../src/stremio/meta')`
  - `tests/animeMarkerNormalization.test.js`: `require('../src/stremio/meta')`
  - `tests/kitsuMappingStats.test.js`: `require('../src/stremio/meta')`
  - `tests/metaHandlerCacheImmutability.test.js`: `require('../src/stremio/meta')`
  - `tests/metaHandlerDumpImdbId.test.js`: `require('../src/stremio/meta')`
  - `tests/metaHandlerEpisodeIds.test.js`: `require('../src/stremio/meta')`
  - `tests/metaHandlerImdbIdNoNetwork.test.js`: `require('../src/stremio/meta')`
  - `tests/metaHandlerSeriesVideoOrder.test.js`: `require('../src/stremio/meta')`
  - `tests/metaHandlerTier1Promotion.test.js`: `require('../src/stremio/meta')`
  - `tests/retireTmdbScoringData.test.js`: `require('../src/stremio/meta')` e check percorso file statico su `../src/stremio/meta.js`
  - `tests/domainSurface.test.js`: `require('../src/api/middleware/sessione')`
  - `tests/libraryWatchedEndpoint.test.js`: `require('../src/api/middleware/sessione')`
  - `tests/tmdbDumpStatus.test.js`: `jest.doMock('../src/api/middleware/adminAuth', ...)`

### 3. Nota sull'import di id_cache (Ticket 52)
- Rilevato in `src/stremio/meta.js:14`: `const { translateImdbToTmdb } = require('../id_mapping/id_cache');`.
- Come espressamente indicato nella specifica, questo import è stato lasciato intatto; verrà gestito dal ticket parallelo 52 o in fase di integrazione.

### 4. Prove eseguite e risultati
- **Non esistenza cartelle sorgente**:
  - `node -e "const fs = require('fs'); console.log('src/meta exists:', fs.existsSync('src/meta')); console.log('src/middleware exists:', fs.existsSync('src/middleware')); process.exit(0)"`
    - Output:
      ```
      src/meta exists: false
      src/middleware exists: false
      ```
- **Puntamento middleware in `index.js`**:
  - `git grep -n "middleware/" index.js`
    - Output:
      ```
      index.js:28:const { richiedeSessione } = require('./src/api/middleware/sessione');
      index.js:29:const { inputSanitizer } = require('./src/api/middleware/inputSanitizer');
      index.js:30:const { attachRequestContext } = require('./src/api/middleware/requestContext');
      index.js:31:const errorMiddleware = require('./src/api/middleware/errorMiddleware');
      ```
- **Caricamento moduli spostati**:
  - `node -e "require('./src/stremio'); require('./src/stremio/meta'); console.log('ok'); process.exit(0)"` → `ok`
  - `node -e "require('./src/api/middleware/adminAuth'); require('./src/api/middleware/errorMiddleware'); require('./src/api/middleware/inputSanitizer'); require('./src/api/middleware/requestContext'); require('./src/api/middleware/sessione'); console.log('all middleware ok'); process.exit(0)"` → `all middleware ok`
- **Invarianza byte-a-byte del protocollo Stremio (SHA256)**:
  - `buildManifest({})`: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` (identico)
  - `buildRootManifest()`: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2` (identico)
- **Suite Stremio e Meta**:
  - `npx jest tests/stremio tests/metaHandler tests/allineaIdFilm tests/kitsuMappingStats --forceExit`
    - Risultato: `Test Suites: 12 passed, 12 total`, `Tests: 65 passed, 65 total`.
- **Suite Middleware**:
  - `npx jest tests/domainSurface.test.js tests/libraryWatchedEndpoint.test.js tests/tmdbDumpStatus.test.js --forceExit`
    - Risultato: `Test Suites: 3 passed, 3 total`, `Tests: 42 passed, 42 total`.
- **Baseline suite completa (`npx jest --forceExit`)**:
  - Totali: `Test Suites: 5 failed, 181 passed, 186 total`, `Tests: 8 failed, 1 skipped, 1868 passed, 1877 total`.
  - Lista FAIL (esattamente le sole 5 suite permesse per assenza parquet locali):
    ```
    FAIL tests/presetBurtonOrdering.test.js
    FAIL tests/animeOverridesCertify.test.js
    FAIL tests/donghuaCatalog.test.js
    FAIL tests/duckDbAndMatchmaker.test.js
    FAIL tests/candidateProvider.test.js
    ```

### 5. Cosa NON è stato fatto
- Nessun file creato come compatibility shim o re-export obsoleto.
- Nessuna modifica a `frontend/**`.
- Nessuna modifica a `src/utils/**`, `src/db/tier1*.js`, `services/tmdb-daemon/**`, `src/dna/**`, `src/profile/**`, `src/ricerca/**`, `src/id_mapping/**`, `src/api/configure/**`, `src/indice/duckDbStore.js`.
- Nessun git push né build/tsc.

