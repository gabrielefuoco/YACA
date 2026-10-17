Status: done
Type: task

# 36 — I sette modelli in una casa sola

## Perché

Ci sono **sette modelli mongoose in due cartelle** senza nessuna ragione:

- `src/models/`: `RecommendationImpression.js`, `SystemLog.js`, `TasteProfile.js`, `UserConfig.js`
- `src/db/models/`: `AddonConfig.js`, `ImdbToTmdbMapping.js`, `UserAccount.js`

Chi cerca un modello non sa dove guardare, e la divisione non segue niente (non è «dominio vs infrastruttura»:
`UserAccount` sta in `db/models` e `UserConfig` in `models`). Il costo è basso ma è **il tipo di cosa che si
paga ogni volta** che si tocca il dato.

## Cosa deve uscire

1. **Una sola casa** per i modelli. Consiglio: `src/models/`, perché è quella dei nomi di dominio (e `src/db/`
   resta il *database*: connessione, indice, migrazioni — non le entità).
2. **Tutti gli importatori ripuntati**, con la prova che nessuno usa più il percorso vecchio.
3. **La regola scritta** dove sta il resto delle regole (docs/INDEX.md, accanto alla clausola sugli shim del
   ticket 28): *un modello sta in `src/models/`*.

## Come si verifica

- `grep` a zero: nessun `require` di `db/models/` in `src/`, `index.js`, `scripts/`, `tests/`.
- Le suite che toccano i modelli verdi una alla volta (almeno `tests/*profile*`, `tests/*config*`,
  `tests/*account*`, `tests/domainSurface*`).
- Nessuna modifica al contenuto dei modelli: è un **trasloco**, non un refactor. Se un modello ha bisogno di
  cambiare, è un altro ticket.

## Esito

### 1. File spostati (git mv, trasloco 100% identico senza modifiche di contenuto)
I tre modelli sono stati traslocati da `src/db/models/` a `src/models/`:
- `src/db/models/AddonConfig.js` → `src/models/AddonConfig.js`
- `src/db/models/ImdbToTmdbMapping.js` → `src/models/ImdbToTmdbMapping.js`
- `src/db/models/UserAccount.js` → `src/models/UserAccount.js`

La directory `src/db/models/` è stata rimossa. La cartella `src/models/` ospita ora tutte le 7 entità del backend. I nomi di registrazione Mongoose (`AddonConfig`, `ImdbToTmdbMapping`, `RecommendationImpression`, `SystemLog`, `TasteProfile`, `UserAccount`) rimangono invariati e verificati contro registrazioni duplicate (`node -e` testato con successo).

### 2. Prova grep
Comando eseguito:
`git grep -n "db/models" -- src/ index.js scripts/ tests/ ops/`

Output:
```
src/api/stremio.js:8:const AddonConfig = require('../db/models/AddonConfig');
src/api/stremio.js:9:const UserAccount = require('../db/models/UserAccount');
src/utils/manifestReconciler.js:1:const AddonConfig = require('../db/models/AddonConfig');
src/utils/manifestReconciler.js:2:const UserAccount = require('../db/models/UserAccount');
src/utils/stremioAddon.js:2:const UserAccount = require('../db/models/UserAccount');
src/utils/stremioAddon.js:3:const AddonConfig = require('../db/models/AddonConfig');
```
Tutti i consumatori in `src/`, `scripts/`, `tests/`, `ops/`, `index.js` sono ripuntati a zero, eccetto esclusivamente i file esclusi da capitolato:
- `src/api/stremio.js` (da ripuntare a mano dopo il merge parallelo)
- `src/utils/stremioAddon.js` (da ripuntare a mano dopo il merge parallelo)
- `src/utils/manifestReconciler.js` (da ripuntare a mano dopo il merge parallelo)
- `src/utils/manifestFingerprint.js` (escluso da capitolato; non conteneva import di modelli)

### 3. Suite eseguite una alla volta (pass/fail)
Suite indipendenti dai file esclusi (110 test eseguiti con successo, 0 falliti):
- `tests/addonConfigCatalogSchema.test.js`: PASS (1 passed, 1 total)
- `tests/addonConfigSyncFields.test.js`: PASS (2 passed, 2 total)
- `tests/configVersionBump.test.js`: PASS (5 passed, 5 total)
- `tests/configureConfigVersionSync.test.js`: PASS (3 passed, 3 total)
- `tests/diag.recommender.h9.injectProfile.test.js`: PASS (2 passed, 2 total)
- `tests/keyDeletion.test.js`: PASS (2 passed, 2 total)
- `tests/librarySyncPosterRefresh.test.js`: PASS (5 passed, 5 total)
- `tests/libraryWatchedService.test.js`: PASS (17 passed, 17 total)
- `tests/profileDuplicates.test.js`: PASS (3 passed, 3 total)
- `tests/profilePersistence.test.js`: PASS (1 passed, 1 total)
- `tests/profileScorerCoreBias.test.js`: PASS (2 passed, 2 total)
- `tests/profileScorerMultiVector.test.js`: PASS (5 passed, 5 total)
- `tests/profileScorerVSM.test.js`: PASS (2 passed, 2 total)
- `tests/profileStaleness.test.js`: PASS (14 passed, 14 total)
- `tests/robustness.test.js`: PASS (8 passed, 8 total)
- `tests/traktAutoRefresh.test.js`: PASS (2 passed, 2 total)
- `tests/traktIntegration.test.js`: PASS (4 passed, 4 total)
- `tests/userConfig.test.js`: PASS (1 passed, 1 total)
- `tests/userConfigResolveQueries.test.js`: PASS (6 passed, 6 total)
- `tests/userLibraryDedup.test.js`: PASS (21 passed, 21 total)
- `tests/userModelImportPath.test.js`: PASS (4 passed, 4 total)

### 4. Cosa non è stato possibile fare (e blocco noto per l'integratore)
- Come da specifica d'eccezione, i 4 file scritti in parallelo da un altro agente (`src/api/stremio.js`, `src/utils/stremioAddon.js`, `src/utils/manifestFingerprint.js`, `src/utils/manifestReconciler.js`) non sono stati toccati.
- Di conseguenza, tutte le suite che transitano per `src/utils/stremioAddon.js` (es. `tests/domainSurface.test.js`, `tests/profileDoor.test.js`, `tests/stremioSync.test.js`, ecc.) falliscono in fase di caricamento modulo con `Cannot find module '../db/models/UserAccount' from 'src/utils/stremioAddon.js'`. L'integratore dovrà ripuntare i `require` in quei file al termine del merge per rendere verdi tali suite.
- La regola architetturale è stata inserita in `docs/INDEX.md` accanto alla clausola sugli shim del ticket 28 (*un modello sta in `src/models/`*).
