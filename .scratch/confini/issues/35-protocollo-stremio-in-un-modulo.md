Status: ready-for-agent
Type: task

# 35 — Il protocollo Stremio in un modulo solo

## Perché

Il protocollo Stremio (il manifest, la collection dell'addon, la riconciliazione, il client) è **1.327 righe
sparse in tre cartelle**:

| file | righe | cosa fa |
|---|---|---|
| `src/api/stremio.js` | 611 | le rotte dell'addon (manifest, catalog, meta, stream) |
| `src/utils/stremioAddon.js` | 377 | la collection dell'addon e il push a Stremio |
| `src/utils/manifestFingerprint.js` | 204 | l'impronta del manifest |
| `src/utils/manifestReconciler.js` | 126 | la riconciliazione all'avvio |
| `src/clients/stremio.js` | 9 | il client HTTP |

E la logica dell'addon è montata su `/` (`app.use('/', stremioRoutes)`): **è il prodotto**. Oggi chi tocca il
manifest deve sapere che metà vive in `utils/`, e `utils/` è il cassetto che la decisione 21 vuole smontare.

## Cosa deve uscire

1. **Un modulo** (`src/stremio/`) che possiede il protocollo: il manifest (e la sua impronta), la collection, la
   riconciliazione, il client. **Una porta** con i verbi che i consumatori usano davvero.
2. **Le rotte restano in `src/api/stremio.js`** (è il bordo HTTP, non il protocollo) e chiamano il modulo.
3. **`manifestReconciler`** è avviato da `index.js` all'avvio: resta lì (è una scelta di ciclo di vita già
   dichiarata), ma chiama il modulo.
4. **Nessuna logica Stremio fuori dal modulo**: `utils/stremioAddon.js`, `utils/manifest*.js`,
   `clients/stremio.js` non esistono più.

## Come si verifica

- `grep` a zero: nessun `require` di `utils/stremioAddon` / `utils/manifestFingerprint` / `utils/manifestReconciler`
  / `clients/stremio` fuori da `src/stremio/`.
- Le suite che toccano il manifest e l'addon verdi **una alla volta** (`tests/stremio*`, `tests/manifest*`,
  `tests/domainSurface*`).
- La prova che conta: **il manifest servito è identico** a prima. L'impronta è il modo per dirlo — prendere
  l'impronta prima e dopo, e confrontarle. Se cambia, il modulo ha cambiato il prodotto.

## Attenzione

`api/stremio.js` (611 righe) **non va spostato**: è il bordo, e il ticket 10 ha già deciso che il server assorbe
l'orchestrazione. Qui si sposta il **protocollo**, non le rotte.

## Esito

- **Porta del modulo (`src/stremio/index.js`)**:
  Espone tutti i verbi e contratti del protocollo Stremio:
  - Client HTTP: `stremioClient`, `stremioLikesClient`
  - Manifest: `buildManifest`, `buildRootManifest`, `resolveCatalogType`, `getCatalogExtra`, `defaultExtra`, `presetExtra`, `searchExtra`, `getSortByValue`, `SORT_OPTIONS`, `SORT_MAP`
  - Fingerprint: `buildManifestFingerprint`, `buildManifestDefinitionsSignature`, `setHeroCatalogs`, `DEFAULT_HERO_CATALOGS`, `FINGERPRINT_SCHEMA_VERSION`
  - Collection & Sync: `updateStremioAddonCollection`, `syncAllStremioData`, `fetchStremioLibrary`, `pushToStremioLibrary`, `buildStremioLibraryPayload`, `validateManifestUrl`
  - Reconciler: `reconcileManifests`

- **Prova del fingerprint e manifest identico (Before vs After)**:
  - Input vuoto `{}`:
    - Fingerprint BEFORE: `b85a69072daf44502bd82758efecc491ed44c13076589e0f63a98ea788718a10`
    - Fingerprint AFTER:  `b85a69072daf44502bd82758efecc491ed44c13076589e0f63a98ea788718a10` (MATCH)
    - Manifest SHA256 BEFORE: `9ce32c6f67afce3b6103c04ef2be9a148b4c747062fb70a7131eabb3a532d1fa`
    - Manifest SHA256 AFTER:  `9ce32c6f67afce3b6103c04ef2be9a148b4c747062fb70a7131eabb3a532d1fa` (MATCH byte-identical)
  - Configurazione reale completa (profili, selettori, customCatalogs, configVersion):
    - Fingerprint BEFORE: `c30523d0c4a5bac5c2e9440d55ae516a8689d3cf777b54bab4e7712bd45ee60e`
    - Fingerprint AFTER:  `c30523d0c4a5bac5c2e9440d55ae516a8689d3cf777b54bab4e7712bd45ee60e` (MATCH)
    - Manifest SHA256 BEFORE: `742b4dd761520d6af9a75ca184cf2f480056f5e5afad9a8dce2bc5f6630ad991`
    - Manifest SHA256 AFTER:  `742b4dd761520d6af9a75ca184cf2f480056f5e5afad9a8dce2bc5f6630ad991` (MATCH byte-identical)

- **Grep proof dei require**:
  Esecuzione: `git grep -E "require\(.*(stremioAddon|manifestFingerprint|manifestReconciler|clients/stremio)"`
  Risultato unico:
  `src/models/UserConfig.js:const { buildManifestFingerprint } = require('../utils/manifestFingerprint');`
  Nessun altro `require` dei vecchi 4 file esiste fuori da `src/stremio/`. I 4 vecchi file sono stati cancellati (`git rm`).

- **Suite eseguite (pass/fail counts)**:
  - `tests/manifestFingerprint.test.js`: 8 passed, 0 failed
  - `tests/manifestReconciler.test.js`: 7 passed, 0 failed
  - `tests/stremioAddonResync.test.js`: 4 passed, 0 failed
  - `tests/stremioProtocolFixes.test.js`: 6 passed, 0 failed
  - `tests/stremioSync.test.js`: 3 passed, 0 failed
  - `tests/stremioSyncCadence.test.js`: 5 passed, 0 failed
  - `tests/domainSurface.test.js`: 29 passed, 0 failed
  - `tests/configureConfigVersionSync.test.js`: 3 passed, 0 failed
  - `tests/libraryConverterNamespace.test.js`: 7 passed, 0 failed
  - `tests/libraryReorder.test.js`: 4 passed, 0 failed
  - `tests/librarySyncPosterRefresh.test.js`: 5 passed, 0 failed
  - `tests/libraryWatchedEndpoint.test.js`: 6 passed, 0 failed
  - `tests/libraryWatchedService.test.js`: 17 passed, 0 failed
  - `tests/userLibraryDedup.test.js`: 21 passed, 0 failed
  - `tests/addonConfigSyncFields.test.js`: 2 passed, 0 failed
  Totale: 15 suite, 127 passed, 0 failed.

- **Cosa non è stato possibile fare (Off Limits)**:
  - In conformità con le istruzioni vincolanti del brief, `src/models/**` è OFF LIMITS (ticket 36 parallelo sui modelli). `src/models/UserConfig.js` non è stato toccato; il suo import di `buildManifestFingerprint` è stato lasciato intatto come richiesto e verrà armonizzato dal Ticket 36 o dall'orchestratore all'atto dell'integrazione.

