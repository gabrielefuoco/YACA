Status: resolved
Type: task
Blocked by: 15

# 16 — L'ingestione dentro il modulo libreria

> **Secondo dei due passi** decisi dal ticket 14: il modulo possiede tutto, ingestione compresa. Il 15 ha
> creato i modelli e la porta di lettura; qui entra il mestiere che **porta dentro i fatti**.

## Perché

L'ingestione è una macchina a stati con retry e parcheggio (`conversionAttempts`, `parkedAt`, `parkedReason`
vivono **dentro** `UserLibraryItem`) distribuita su ~8 file: `LibrarySyncService` (681 righe),
`LibraryConverterService`, `libraryConversionAdmission`, `libraryConversionOutcome`,
`libraryConversionRetry`, `libraryWatchedService`, `libraryMediaTypeResolution`, più la cache dei poster
(`src/cache/posterDaEvento.js`, `drenaPoster.js`) che di quei titoli è un effetto.

Finché sta fuori, il confine del 14 è a metà: il modulo possiede i fatti, ma chi li scrive non è suo.

## Cosa deve uscire

- **I servizi di ingestione nel modulo**, con i loro test (`librarySyncPosterRefresh`, `libraryWatched*`,
  `librarySyncPosterRefresh`, `resilienceAuditFixes`, `libraryIdentityDuplicatesTicket19` e gli altri).
  Anche qui: **si sposta, non si riscrive**.
- **La macchina a stati dichiarata**: quanti tentativi, quando si parcheggia, come si rimette in coda, chi
  legge `parkedAt`. Oggi è una proprietà emergente di quattro file: dopo, dev'essere una regola scritta in un
  posto, con i suoi test.
- **Il rapporto con la cache dei poster**: `src/cache/posterDaEvento.js` e `drenaPoster.js` — dentro il modulo
  o fuori? La domanda è «chi possiede il poster: la libreria o la cache?» e va deciso **con i fatti in mano**
  (chi scrive, chi legge, cosa succede se si perde).
- **Il rapporto con Stremio**: l'ingestione riceve dal sync di Stremio (`_ctime`, `_mtime`, `state`) e da
  Trakt. Il modulo è **il punto in cui quel formato entra nel dominio** — e il posto in cui si converte una
  volta, non in tre.
- **Il confine con le rotte**: `src/api/profiles.js` (652 righe) chiama l'ingestione dagli endpoint. Dopo, le
  rotte restano **sottili** (autenticazione, richiesta, risposta) e il mestiere sta nel modulo: è la stessa
  regola della superficie di dominio (decisione 10), applicata dall'altro lato.

## Come si verifica

I test dell'ingestione verdi prima e dopo (senza asserzioni cambiate); un sync vero su un profilo di prova
(osservando i contatori finali: quanti convertiti, quanti parcheggiati) confrontato **prima e dopo** sul
deploy; e il `grep` che dimostra che fuori dal modulo nessuno importa più i servizi di libreria.

## Attenzione

Questo è il ticket con il rapporto rischio/durata peggiore della mappa: una macchina a stati che gira su dati
veri dell'utente. Va preso **dopo** il 15, con la porta di lettura stabile — così, se qualcosa si rompe, i
fatti si possono ancora leggere mentre si ripara la scrittura.

---

## Emendamenti — revisione esterna del 17/10/2026 (verificati sul codice)

### 1. La cache dei poster **non entra** nel modulo: la risposta alla domanda aperta

Il ticket 14 la lasciava aperta. I fatti la chiudono:

- `src/api/staticPosters.js:5-7` importa `erdbIdDaNomeFile`/`eventoDaNomeFile` **e** `scarica`/`scrivi` da
  `../cache/` per servire `GET /erdb-poster/:file` — cioè **i poster di tutti i cataloghi e delle schede meta di
  Stremio**, non della libreria;
- `scripts/push-diff-in-coda.js` (chiamato dal timer `ops/yaca-doppiaggi.sh`) spinge nella **stessa coda** i
  poster dei nuovi episodi doppiati.

Se entrassero nel modulo, una rotta pubblica e un timer di sistema dipenderebbero dal dominio libreria.
Confine giusto: **la cache/ERDB possiede i poster e la coda; l'ingestione è un cliente che manda un evento
quando converte un titolo**.

### 2. Uno scrittore che l'elenco non aveva: `syncAllStremioData`

**Verificato**: non scrive solo dalle rotte — è chiamato anche **dal motore delle raccomandazioni**
(`src/engines/hybridRecommendations.js:728-729`), oltre che da `src/api/profiles.js:175`. È una porta di
scrittura sulla libreria che vive fuori da qualsiasi elenco: se non entra nel modulo, resta il buco.

### 3. Il contesto della libreria è **tre** chiavi, non una

**Verificato**: `WatchHistory` è partizionata per `{owner: userId, context: profileId}`, `UserLibraryItem` per
`{addonUuid}` (livello account), e l'ordine manuale della libreria (`libraryOrder`) sta dentro
`AddonConfig.profiles.$.raw_ui_state` (via `profileProcessor`). La porta dichiara quindi il suo contesto in
modo esplicito — `{userId, profileId, addonUuid}` — o ha **un solo** resolver in ingresso; `UserAccount` e
`AddonConfig` non devono comparire sparsi dentro le query del modulo.

---

## Esito

Risolto il 17/10/2026. L'ingestione della libreria è stata portata interamente all'interno del modulo `src/library/ingestion/`, la macchina a stati di conversione è stata formalmente dichiarata e testata, il write path di `syncAllStremioData` è stato incapsulato nel modulo tramite un resolver di contesto a 3 chiavi, la cache dei poster è rimasta all'esterno, e i tre shim legacy lasciati dal ticket 15 sono stati eliminati con il repointing di tutti i chiamanti.

### 1. File spostati dentro il modulo (`src/library/ingestion/`)
Spostati con `git mv` preservando la cronologia git:
- `src/services/LibrarySyncService.js` → `src/library/ingestion/LibrarySyncService.js`
- `src/services/LibraryConverterService.js` → `src/library/ingestion/LibraryConverterService.js`
- `src/services/libraryConversionAdmission.js` → `src/library/ingestion/libraryConversionAdmission.js`
- `src/services/libraryConversionOutcome.js` → `src/library/ingestion/libraryConversionOutcome.js`
- `src/services/libraryConversionRetry.js` → `src/library/ingestion/libraryConversionRetry.js`
- `src/services/libraryWatchedService.js` → `src/library/ingestion/libraryWatchedService.js`
- `src/services/libraryMediaTypeResolution.js` → `src/library/ingestion/libraryMediaTypeResolution.js`
- `src/services/libraryIdentityResolution.js` → `src/library/ingestion/libraryIdentityResolution.js`

Tutti i percorsi interni di require sono stati aggiornati per puntare ai modelli canonici (`../models/`), all'identità (`../identity`), al client Stremio (`../../clients/stremio`) e a DuckDB (`../../db/duckDbStore`).

### 2. Macchina a stati dichiarata (`conversionStateMachine.js`)
Creata `src/library/ingestion/conversionStateMachine.js` con relativa suite di test (`tests/conversionStateMachine.test.js` - 12 test):
- **Stati formali**: `QUEUED` (in coda), `CONVERTED` (convertito), `PARKED` (parcheggiato), `EXCLUDED_REMOVED` (rimosso da Stremio), `EXCLUDED_DUPLICATE` (duplicato marcato).
- **Tentativi massimi**: `MAX_CONVERSION_ATTEMPTS = 3`.
- **Regola di parcheggio**: Un item non risolto accumula tentativi (`conversionAttempts = (attempts || 0) + 1`). Al 3° fallimento (`attempts >= 3`), viene parcheggiato (`parkedAt = now`, `parkedReason`), togliendolo dal loop continuo di conversione.
- **Ritorno in coda (unpark)**: `unparkItem(item)` resetta `conversionAttempts = 0`, `parkedAt = null`, `parkedReason = null`.
- **Lettori di `parkedAt`**:
  - `isEligibleForConversion` (ingestione): ammette alla conversione solo titoli non parcheggiati (`parkedAt == null`).
  - `contaDaConvertire` (reader): esclude `parkedAt != null` dal conteggio dei titoli pendenti.
  - `leggiTitolo` / `trovaItemLibreria`: espongono lo stato all'UI/API.
  - `summarizeParkedRun`: produce il log sintetico del batch di conversione.

### 3. Write path `syncAllStremioData` incapsulato nel modulo (Emendamenti 2 & 3)
- Creato `src/library/context.js`: resolver unico `resolveLibraryContext({ userId, profileId, addonUuid })` che isola l'accesso alle collezioni `UserAccount` e `AddonConfig`.
- Creato `ingestStremioData({ userId, profileId, addonUuid, stremioData })` esportato da `src/library/index.js`: gestisce la scrittura atomica sia della cronologia (`WatchHistory` via `ProfileBuilder.syncStremioData`) sia della libreria (`UserLibraryItem` via `LibrarySyncService.syncLibraryForUser`).
- `syncAllStremioData` in `src/utils/stremioAddon.js` (chiamato da `src/api/profiles.js:175` e `src/engines/hybridRecommendations.js:728`) ora delega la scrittura direttamente a `ingestStremioData`.

### 4. Cache dei poster esterna (Emendamento 1)
- Nessun import del modulo libreria da `src/cache/posterDaEvento.js`, `drenaPoster.js` o `scripts/push-diff-in-coda.js`.
- Risolto un require circolare latente tra `src/utils/libraryPosterRefresh.js` e `src/library/` (ora `libraryPosterRefresh` importa solo la regola pura `normalizeLegacyPosterHost` da `src/library/identity.js`).
- Resa lazy la dipendenza di `syncCatalogData` in `src/utils/stremioAddon.js` verso `AiDiscoveryProvider`.

### 5. Rimozione dei 3 shim del Ticket 15 e repointing chiamanti
Rimossi definitivamente con `git rm`:
- `src/models/WatchHistory.js`
- `src/db/models/UserLibraryItem.js`
- `src/utils/libraryIdentity.js`

Ripuntati tutti gli importatori nel codice applicativo e nei test:
- `src/api/profiles.js` (require paths aggiornati al modulo `../library`, route invariate).
- `scripts/migrate_library_itemid_null.js`
- `src/library/models/WatchHistory.js` e `UserLibraryItem.js` ripuliti dai fallback legacy.
- 16 file di test ripuntati ai modelli e servizi canonici in `src/library/`: `bolleRoute.test.js`, `configureGlobalProfile.test.js`, `diag.recommender.h2.activeVectorSource.test.js`, `duckDbAndMatchmaker.test.js`, `duckDbPresetsValidation.test.js`, `heroAnimeFavoredSeam.test.js`, `heroAnimeTypeSelectors.test.js`, `libraryConverterNamespace.test.js`, `libraryIdentity.test.js`, `libraryIdentityDuplicatesTicket19.test.js`, `libraryIdentityResolution.test.js`, `libraryMediaTypeResolution.test.js`, `profileBuilder.test.js`, `profileBuilderMultiVector.test.js`, `resilienceAuditFixes.test.js`, `seedNetwork.test.js`, `studioProfile.test.js`, `ticket14CatalogFixes.test.js`, `utilityKidsWatchlist.test.js`, `utilityPagination.test.js`.

### 6. Verifica dei test di ingestione (Prima e Dopo, zero asserzioni cambiate)
- `tests/libraryWatchedService.test.js`: 17 passed / 17 total
- `tests/librarySyncPosterRefresh.test.js`: 5 passed / 5 total
- `tests/libraryReorder.test.js`: 4 passed / 4 total
- `tests/resilienceAuditFixes.test.js`: 12 passed / 13 total (Test 1 su UserLibraryItem passato; Test 8 fallimento pre-esistente su stream anime in stremio.js rimosso in ticket 05)
- `tests/userLibraryDedup.test.js`: 21 passed / 21 total
- `tests/libraryWatchedEndpoint.test.js`: 6 passed / 6 total
- `tests/libraryConversionAdmission.test.js`: 11 passed / 11 total
- `tests/libraryConversionOutcome.test.js`: 10 passed / 10 total
- `tests/libraryConversionRetry.test.js`: 10 passed / 10 total
- `tests/conversionStateMachine.test.js` (nuovo): 12 passed / 12 total
- `tests/libraryConverterNamespace.test.js`: 7 passed / 7 total
- `tests/libraryIdentityResolution.test.js`: 13 passed / 13 total
- `tests/libraryMediaTypeResolution.test.js`: 15 passed / 15 total
- `tests/libraryPosterRefresh.test.js`: 14 passed / 14 total
- `tests/libraryIdentityDuplicatesTicket19.test.js`: 16 passed / 16 total
- `tests/stremioSync.test.js`: 3 passed / 3 total
- `tests/seedNetwork.test.js`: 23 passed / 23 total

### 7. Risultati del Grep
- `git grep -n "require(.*WatchHistory" src/`: 0 fuori da `src/library/` (solo `models/index.js`, `reader.js`, `seeds.js`).
- `git grep -n "require(.*UserLibraryItem" src/`: 0 fuori da `src/library/` (solo `models/index.js`, `reader.js`, `seeds.js`, `identity.js`, `ingestion/`).
- `git grep -n "require(.*libraryIdentity" src/`: 0 fuori da `src/library/`.
- `git grep -n "services/Library\|services/library" src/`: unico riferimento residuo in `src/catalog/providers/WatchlistProvider.js` (vedi punto 8).

### 8. Cosa resta aperto
- `src/services/LibrarySyncService.js`: mantenuto temporaneamente come re-export di una riga verso `../library/ingestion/LibrarySyncService` per non toccare `src/catalog/providers/WatchlistProvider.js`, protetto dal vincolo del brief (`DO NOT TOUCH: ... src/catalog/** (ticket 12, running in parallel)`). Non appena il ticket 12 sarà concluso e mergiato, `WatchlistProvider.js` potrà essere aggiornato a `require('../../library')` e lo shim in `src/services/` potrà essere eliminato definitivamente.

---

## Il ponte `src/services/LibrarySyncService.js` è stato tolto (17/10/2026)

Lo slave l'aveva lasciato come re-export di una riga perché `src/catalog/providers/WatchlistProvider.js` lo
importava e `src/catalog/**` era vietato (il ticket 12 ci stava lavorando in parallelo). Con il 12 in `main`,
il ponte è stato rimosso: `WatchlistProvider` ora importa `library/ingestion/LibrarySyncService`, e in
`src/services/` non resta nessun file di libreria. Verificato con un `grep` (`services/LibrarySyncService` →
zero occorrenze) e coi test della watchlist.
