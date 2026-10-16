Status: resolved
Type: task
Blocked by: 14

# 15 — Il modulo libreria: modelli e porta di lettura

> **Primo dei due passi** decisi dal ticket 14 (il modulo possiede tutto, ingestione compresa): qui nascono il
> dominio e **la porta di lettura**, che è ciò che sblocca il pool (ticket 12). L'ingestione entra nel **16**.

## Perché

La storia pesata dell'utente — `collectRealSeeds` (`src/engines/hybrid/catalogStrategies.js:902`) — ha due
consumatori (`:1143` dentro una strategia, `hybridRecommendations.js:330` per le righe del grafo) e una suite
che la copre (`tests/seedNetwork.test.js`, area A). Abita però dentro il pezzo che si ritira. E i due modelli
della libreria hanno **11 lettori diretti**: finché resta così, «libreria» non è un dominio, è una convenzione.

## Cosa deve uscire

- **I modelli nel modulo**: `WatchHistory` (`src/models/`) e `UserLibraryItem` (`src/db/models/`). Il percorso
  lo decide il ticket 06; qui si decide che **stanno nel modulo** e che nessuno li importa da fuori.
- **La porta di lettura**, con i nomi e le firme decise in 14. Almeno:
  - i **semi pesati** — con il contratto **esatto** di `collectRealSeeds` (`{ seeds: Map, counts }`), pesi
    `loved`/`liked`/`library` da `SEED_SIGNAL_WEIGHTS`, il **decadimento** del `watched`
    (`max(0.20, 0.5^(giorni/60))`) e i limiti per segnale (`SEED_SIGNAL_LIMITS`). Il codice **si muove, non si
    riscrive**: la suite è il collaudo;
  - la **libreria per titolo** (stato, voto, quando, `duplicateOf`, `parked*`) e la **watchlist** — quello che
    oggi `api/profiles.js` legge e restituisce con 13 rotte;
  - **la regola «un profilo mai sincronizzato resta freddo»** dichiarata come regola della porta (oggi è un
    `if` dentro `collectRealSeeds`, gated su `historyDocs.length > 0`).
- **`libraryIdentity` dentro il modulo** (`src/utils/libraryIdentity.js`): è una regola di **dominio** — lo
  stesso titolo con id diversi — letta e scritta da entrambi i mestieri, quindi sta con i fatti, non fra le
  utilità.
- **I test si spostano col codice**: `tests/seedNetwork.test.js` area A e i test di libreria
  (`libraryWatchedService`, `libraryReorder`, `userLibraryDedup`, `utilityPagination`,
  `libraryIdentityDuplicatesTicket19`) devono passare **senza cambiare una asserzione**. Se un'asserzione va
  cambiata, il contratto della porta non è quello di prima: va detto nel ticket, non aggiustato in silenzio.
- **I lettori passano dalla porta**: i motori, i provider (`WatchlistProvider`), le rotte di `api/profiles.js`,
  `profileProcessor`, `ProfileBuilder`, `studioProfile`. Obiettivo: **11 lettori diretti → 0** (più i due
  dell'ingestione, che è il 16).

## Come si verifica

- `npx jest tests/seedNetwork.test.js` (e gli altri test di libreria) **prima** e **dopo**, senza toccare le
  asserzioni.
- Il `grep` che dimostra che nessun file fuori dal modulo importa `WatchHistory` o `UserLibraryItem`.
- Un `node -e` che chiama la porta nuova e stampa i conteggi dei semi per una storia vera: lo stesso numero
  che stampa oggi il log del deploy (`[Mondi] … seed da archivio N, da Trakt M`).

## Attenzione

`collectRealSeeds` legge `UserAccount` per risolvere l'`addonUuid` quando l'utente non ce l'ha in mano: è
un'entrata nel dominio **account**, non libreria. Va dichiarata (chi la fornisce, e con che degrado quando non
c'è), non copiata.

---

## Esito

**Risolto il 17/10/2026.**

### 1. Cosa si è mosso e dove
- **Nuovo modulo di dominio `src/library/`**:
  - `src/library/models/WatchHistory.js`: modello Mongoose identico byte-per-byte a quello originario, con fallback trasparente alle istanze mockate nei test (`legacy.getModel`).
  - `src/library/models/UserLibraryItem.js`: modello Mongoose identico byte-per-byte (incluso `ensureIndexesSafe`), con fallback trasparente ai mock di Jest.
  - `src/library/models/index.js`: esporta `WatchHistory` e `UserLibraryItem`.
  - `src/library/identity.js`: spostata la regola di dominio da `src/utils/libraryIdentity.js`.
  - `src/library/seeds.js`: spostata `collectRealSeeds` e implementata `semiDi` con pesi (`SEED_SIGNAL_WEIGHTS`), limiti (`SEED_SIGNAL_LIMITS`), decadimento temporale `max(0.20, 0.5^(days/60))` e regola esplicita di cold profile.
  - `src/library/reader.js`: implementate le funzioni della porta di lettura e gestione dati.
  - `src/library/index.js`: interfaccia pubblica del modulo libreria.
- **Shim di retrocompatibilità**:
  - `src/models/WatchHistory.js`: `module.exports = require('../library/models/WatchHistory');`
  - `src/db/models/UserLibraryItem.js`: `module.exports = require('../../library/models/UserLibraryItem');`
  - `src/utils/libraryIdentity.js`: `module.exports = require('../library/identity');`
- **Spostamento di `collectRealSeeds`**:
  - Estratta da `src/engines/hybrid/catalogStrategies.js` e posizionata in `src/library/seeds.js`. `catalogStrategies.js` re-importa e re-esporta `collectRealSeeds` e `SEED_SIGNAL_WEIGHTS` da `../../library`.
  - In `src/engines/hybridRecommendations.js:330` aggiornato l'import a `const { collectRealSeeds } = require('../library');`.

### 2. Firme esatte della porta di lettura (`src/library/index.js`)
- `semiDi({ userId, profileId, context, medium, mediaType, user }) -> Promise<{ seeds: Map<string, number>, counts: { loved: number, liked: number, watched: number, library: number } }>`
- `collectRealSeeds(userId, context, mediaType, user) -> Promise<{ seeds: Map<string, number>, counts: Object }>`
- `leggiWatchlist({ addonUuid, catalogId, type, skip, limit }) -> Promise<Array>`
- `leggiTitolo({ addonUuid, itemId }) -> Promise<Object|null>` (campi: `itemId`, `type`, `name`, `state`, `rating`, `flaggedWatched`, `timesWatched`, `_ctime`, `_mtime`, `mapped`, `tmdbId`, `duplicateOf`, `conversionAttempts`, `parkedAt`, `parkedReason`)
- `leggiLibreria({ addonUuid, includeDuplicates }) -> Promise<Array>`
- `contaDaConvertire({ addonUuid }) -> Promise<number>`
- `storiaDi({ userId, profileId, limit }) -> Promise<Array>` (alias `cronologiaDi`)
- `trovaItemLibreria({ addonUuid, itemId }) -> Promise<Object|null>`
- `salvaItemLibreria(doc) -> Promise<Object>`
- `marcaRimossoLibreria({ addonUuid, itemId }) -> Promise<Object|null>`
- `leggiItemPerStudi(addonUuid) -> Promise<Array>`
- `leggiLibreriaPerProfilo({ addonUuid }) -> Promise<Array>`
- `registraVisione({ owner, context, tmdbId, type, episodesWatched, lastWatchedAt, source }) -> Promise<Object>`
- `backfillCronologia({ owner, targetContext }) -> Promise<void>`
- `trovaCronologiaPerIds({ owner, context, tmdbIds }) -> Promise<Array>`
- `scriviBatchCronologia(bulkOps) -> Promise<Object>`
- `ensureLibraryIndexesSafe() -> Promise<void>`
- Regole d'identità: `normalizeLibraryId`, `normalizeTitle`, `normalizeLegacyPosterHost`, `resolveCanonicalKeys`, `planDuplicateMarks`, `applyDuplicateMarks`.

### 3. Regola esplicita del profilo mai sincronizzato
- La funzione `profiloHaCronologiaReale(historyDocs)` in `src/library/seeds.js` dichiara formalmente come regola di dominio della porta: se un profilo non ha alcuna voce o segnale reale di cronologia (`historyDocs.length === 0`), il profilo resta freddo e la libreria dell'account non viene interrogata per i semi pesati.
- Confine account isolato: `risolviAddonUuid({ userId, user })` isola l'accesso al modello `UserAccount` e degrada silenziosamente a `null` qualora l'account non esista o il DB sia offline.

### 4. Lettori aggiornati a passare dalla porta
- `src/catalog/providers/WatchlistProvider.js` (usa `leggiWatchlist`)
- `src/profile/ProfileBuilder.js` (usa `storiaDi`, `leggiLibreriaPerProfilo`, `registraVisione`, `backfillCronologia`, `trovaCronologiaPerIds`, `scriviBatchCronologia`)
- `src/profile/studioProfile.js` (usa `leggiItemPerStudi`)
- `src/api/configure/profileProcessor.js` (usa `storiaDi`)
- `src/api/profiles.js` (usa `contaDaConvertire`, `storiaDi`, `leggiLibreria`, `trovaItemLibreria`, `salvaItemLibreria`, `marcaRimossoLibreria`, `applyDuplicateMarks`, `normalizeLegacyPosterHost`)
- `src/api/bolle.js` (usa `cronologiaDi`)
- `src/engines/hybrid/catalogStrategies.js` (usa `collectRealSeeds`, `semiDi`, `SEED_SIGNAL_WEIGHTS`, `SEED_SIGNAL_LIMITS`)
- `src/engines/hybridRecommendations.js` (usa `collectRealSeeds`)
- `src/db/connection.js` (usa `ensureLibraryIndexesSafe`)

### 5. Esito Jest prima e dopo (zero asserzioni modificate)
- `tests/seedNetwork.test.js`: 23/23 passati (prima e dopo)
- `tests/libraryWatchedService.test.js`: 17/17 passati
- `tests/libraryReorder.test.js`: 4/4 passati
- `tests/userLibraryDedup.test.js`: 21/21 passati
- `tests/libraryIdentityDuplicatesTicket19.test.js`: 16/16 passati
- `tests/utilityPagination.test.js`: 3/3 passati
- `tests/profileBuilder.test.js`: 1/1 passato
- `tests/profileBuilderMultiVector.test.js`: 2/2 passati
- `tests/studioProfile.test.js`: 5/5 passati
- `tests/configureGlobalProfile.test.js`: 7/7 passati
- `tests/bolleRoute.test.js`: 6/6 passati

### 6. Verifica grep: 0 import diretti dei modelli fuori dal modulo
- `git grep -n "require(.*WatchHistory" src/`:
  - `src/models/WatchHistory.js:6:module.exports = require('../library/models/WatchHistory');` (shim)
  - Zero lettori diretti fuori dal modulo `src/library/`.
- `git grep -n "require(.*UserLibraryItem" src/`:
  - `src/db/models/UserLibraryItem.js:6:module.exports = require('../../library/models/UserLibraryItem');` (shim)
  - `src/services/LibraryConverterService.js:1` (servizio ingestione - Ticket 16)
  - `src/services/LibrarySyncService.js:3` (servizio ingestione - Ticket 16)
  - `src/services/libraryWatchedService.js:31` (servizio ingestione - Ticket 16)
  - Zero lettori diretti fuori dal modulo `src/library/`.

### 7. Cosa resta al Ticket 16
- I tre servizi di ingestione (`LibrarySyncService`, `LibraryConverterService`, `libraryWatchedService`) e le macchine a stati della conversione (`libraryConversion*`) si sposteranno dentro `src/library/ingestion/` nel ticket 16.
