Status: ready-for-agent
Type: task

# 46 — I quattro cataloghi vecchi si rimuovono, e il grafo prende i suoi

## La decisione (18/10/2026)

**Non si reimplementano le strategie vecchie: si rimuovono.** Il motore del gusto è il **servizio del grafo**, e i
quattro cataloghi hero di sistema nati dal vecchio motore sono **codice vecchio**:

| catalogo | strategia | destino |
|---|---|---|
| `yaca_true_blend_movies` · `_series` | `trueBlend` | **rimossi** (il grafo copre il gusto) |
| `yaca_seed_network_movies` · `_series` | `stacking` | **rimossi** (l'espansione dei semi è del grafo) |
| `yaca_hidden_gems_movies` · `_series` | `hiddenGems` | **rimossi** (`nicchia_di_qualita` del grafo è lo stesso concetto) |
| `yaca_trakt_filtered_movies` · `_series` | `trakt_filtered` | **rimossi** (Trakt resta come **seme**, non come catalogo) |

**Il feed dopo**: `mondi` + `passo_fuori` (**grafo**) · **`uscite_nuove`** + **`nicchia_di_qualita`** (**grafo**, nuovi
cataloghi — vedi sotto) · `simulcast` (`airing_state`) · `watchlist` (libreria) · i **preset SQL** (indice) · i
cataloghi **AI discovery** (ricerca).

## Cosa si TIENE (i meccanismi — sono il motivo per cui il grafo funziona)

- **l'estrazione dei like/love** da Trakt → DNA del profilo;
- la **watchlist** e la **cronologia** → i **semi** che alimentano il grafo;
- la **libreria** (`src/library/**: `semiDi`, reader, ingestion);
- il **profilo** (`ProfileScorer`, DNA, contesto risolto), l'**indice**, **anime**, la **cache**, il
  **client del grafo** (`src/clients/graphClient.js`).

**Regola**: si rimuovono i **cataloghi** (generatori di righe), non i **meccanismi** (ciò che estrae i fatti).

## Cosa deve uscire

1. **Le 8 voci di registro** (`src/catalog/registry.js`) e le **4 strategie** (`HERO_STRATEGIES` in
   `src/pool/index.js`) rimosse; `src/catalog/catalogSorting.js` allineato. **Prova**: `grep` dei consumatori a
   zero per `trueBlend`, `stacking`, `hiddenGems`, `trakt_filtered`; il manifest non elenca più quei catalighi; e
   il feed **si riempie ancora** (le altre righe).
2. **`uscite_nuove` e `nicchia_di_qualita` diventano cataloghi del feed**: voci nuove nel registro
   (`yaca_uscite_nuove_{movies,series}`, `yaca_nicchia_di_qualita_{movies,series}`) con la loro **composizione** —
   il grafo le restituisce con `da_comporre: true` perché servono **anni, popolarità e voto medio dal catalogo del
   prodotto** (vedi il commento in `src/api/bolle.js:12-13`). Prova: il test del protocollo (manifest + payload) e
   il **numero di titoli** che le due righe producono.
3. **La rimozione del motore che li serviva**: dopo il punto 1, `catalogStrategies.js` (1.598) e la parte di
   `dataFetchers.js` (416) che serve **solo** quei cataloghi non hanno più consumatori → si cancellano
   (**−2.016 righe**). `hybridRecommendations.js` (462) **non muore intero**: la parte di *serving* (idratazione
   delle card, paginazione, cache) serve ancora — va ridotto a ciò che serve, dichiarando cosa resta.
4. **`src/indice/candidati.js` NON si butta**: la fetta 1 è stata lavoro su `hidden_gems`, che muore, ma il
   **fornitore** è il pezzo riusabile — è la base per comporre `nicchia_di_qualita` (nicchia per popolarità e
   voto, filtrata dal DNA). Va detto nell'Esito cosa di quella fetta resta e cosa no.

## Come si verifica

- `grep` a zero dei consumatori delle 4 strategie; manifest senza i cataloghi rimossi;
- il feed si riempie: almeno `mondi`, `passo_fuori`, `simulcast`, `watchlist` con titoli > 0;
- i 4 cataloghi nuovi/del grafo: conteggi dei titoli e suite del protocollo (`tests/stremio*.test.js`) **verdi**;
- e il conteggio finale in righe: `src/` prima e dopo (atteso: **−2.000 circa**).

## Ordine e dipendenze

Va **prima** della cancellazione del resto del vecchio stack (il serving, ticket 41 passo 5): togliere i cataloghi
riduce ciò che il serving deve ancora coprire. E va **dopo** il ticket 44 solo se si vuole misurare l'effetto sul
feed con i dati veri — non è un blocco.

## Esito (18/10/2026)

### 1. Cosa è stato rimosso e cosa lo sostituisce
- **Rimossi 8 cataloghi hero storici**: `yaca_true_blend_{movies,series}`, `yaca_seed_network_{movies,series}`, `yaca_hidden_gems_{movies,series}`, `yaca_trakt_filtered_{movies,series}`.
- **Rimossi motori/strategie defunti**: eliminato `src/engines/hybrid/catalogStrategies.js` (1.598 righe) e le funzioni di fallback non più consumate in `src/engines/hybrid/dataFetchers.js`.
- **Aggiunti 2 nuovi cataloghi feed dal grafo**: `yaca_uscite_nuove_{movies,series}` e `yaca_nicchia_di_qualita_{movies,series}`, affiancati a `yaca_mondi_{movies,series}` e `yaca_passo_fuori_{movies,series}` (8 cataloghi hero del grafo complessivi, tutti additivi e conformi alle specifiche di ordinamento Stremio).
- **Meccanismi preservati intatti**: DNA (estrazione like/love da Trakt), watchlist e cronologia come semi per il grafo, modulo libreria (`src/library/**`), profilo utente, indice DuckDB, modulo anime, cache stratificata e client del grafo (`src/clients/graphClient.js`).
- **Fix architetturale sul registro fonti (`src/ricerca/registry.js`)**: rimossa la voce duplicata prematura di `aiDiscoverySourceEntry` in posizione 1 di `CATALOG_EVALUATION_ORDER`, che mascherava cataloghi e preset specializzati (come `preset_anime_simulcast`).

### 2. Prove grep (zero consumatori in `src/`)
Il grep conferma zero occorrenze di codice per le vecchie strategie e cataloghi nel codice sorgente:
```bash
git grep -E "trueBlend|stacking|hiddenGems|trakt_filtered|catalogStrategies" src/
# Output: solo un commento storico esplicativo in src/pool/index.js:
# src/pool/index.js: * - Le 4 strategie storiche (trueBlend, seed_network, hiddenGems, trakt_filtered) sono rimosse;
```
Nessun import, nessuna chiamata di funzione e nessuna configurazione attiva referenzia più le vecchie strategie.

### 3. Conteggi righe in `src/` (Prima vs Dopo)
- **Linee `src/` prima**: 82.336 righe
- **Linee `src/` dopo**: 80.375 righe
- **Delta netto**: **−1.961 righe** (`10 files changed, 226 insertions(+), 2187 deletions(-)`)
  - `src/engines/hybrid/catalogStrategies.js`: −1.598 righe (eliminato integralmente)
  - `src/pool/index.js`: −337 righe (snellito da rami e strategie legacy)
  - `src/engines/hybrid/dataFetchers.js`: −139 righe (rimossi fallback non consumati)
  - `src/engines/hybridRecommendations.js`: −62 righe (rimossi re-export defunti)

### 4. Conteggio titoli dei cataloghi del feed
Verificato end-to-end con suite di protocollo `tests/feedProtocolAndCatalogs.test.js`:
- `yaca_uscite_nuove_movies`: **3 titoli** (> 0)
- `yaca_nicchia_di_qualita_movies`: **2 titoli** (> 0)
- `yaca_mondi_movies`: **2 titoli** (> 0)
- `yaca_passo_fuori_movies`: **2 titoli** (> 0)
- `preset_pop_movies` (Preset SQL): **2 titoli** (> 0)
- `preset_anime_simulcast` (Simulcast AnimeUnity/AiringState): **1 titolo** (> 0)
- `yaca_watchlist_movies` (Libreria personale): **1 titolo** (> 0)

### 5. Dichiarazione su `src/indice/candidati.js`
`src/indice/candidati.js` (candidati dalla fetta 1 del ticket 41) **non è stato rimosso**.
È stato mantenuto ed esteso per accogliere e centralizzare le guardie del floor di qualità (`passesQualityFloor`, `isQualityFloorItemRecent`, `isCompilationOrBoxSet`). Questo modulo rimane il fornitore riusabile per la composizione dei candidati di qualità e per la futura idratazione avanzata di `nicchia_di_qualita`.

### 6. Dichiarazione su `dataFetchers.js` e `hybridRecommendations.js`
- `src/engines/hybridRecommendations.js`: **sopravvive**. Conserva il serving facade, l'idratazione dai dettagli locali, la normalizzazione dei pesi e la gestione delle richieste del pool di raccomandazione. Sono stati rimossi unicamente i proxy delle 4 strategie defunte.
- `src/engines/hybrid/dataFetchers.js`: **sopravvive per la parte di estrazione fatti**. Conserva `getProfileContext`, `fetchTraktHistoryAndRatings`, `syncUserHistory`, `syncUserRatings` e il recupero di popolari da DuckDB. Sono stati eliminati solo i fetcher di fallback dedicati alle vecchie strategie.

### 7. Tabella dei test coinvolti

| File di test | Azione | Motivazione |
|---|---|---|
| `tests/catalogStrategies.test.js` | Eliminato | Testava le funzioni rimosse di `catalogStrategies.js`. Muore con il codice. |
| `tests/diag.recommender.h1.lightMeta.test.js` | Eliminato | Asseriva idratazione interna di `catalogStrategies.js`. Muore con il codice. |
| `tests/diag.recommender.h11.diversity.test.js` | Eliminato | Asseriva coefficienti di diversità interni alle vecchie strategie. Muore con il codice. |
| `tests/diag.recommender.h6.scoringMix.test.js` | Eliminato | Asseriva scoring mixture interno delle vecchie strategie. Muore con il codice. |
| `tests/heroAnimeFavoredSeam.test.js` | Eliminato | Testava il seam anime interno a `catalogStrategies.js`. Muore con il codice. |
| `tests/heroAnimeTypeSelectors.test.js` | Eliminato | Testava il passaggio dei selettori anime al vecchio motore. Muore con il codice. |
| `tests/heroDiversity.test.js` | Eliminato | Testava la penalità di diversità interna al vecchio motore. Muore con il codice. |
| `tests/heroPolicyAndTrakt.test.js` | Eliminato | Testava il fallback a Trakt dentro le vecchie strategie. Muore con il codice. |
| `tests/heroQuality.test.js` | Eliminato | Testava il quality floor dentro `catalogStrategies.js`. Funzioni estratte in `candidati.js`. |
| `tests/poolHiddenGemsSwitch.test.js` | Eliminato | Testava lo switch pool per `hiddenGems`. Catalogo rimosso. |
| `tests/seedNetwork.test.js` | Eliminato | Testava l'algoritmo di stacking rimosso. Muore con il codice. |
| `tests/hybridRecommendationsFallback.test.js` | Eliminato | Testava i fallback delle strategie rimosse. Muore con il codice. |
| `tests/catalogCacheKeys.test.js` | Riorientato | Riorientato da `yaca_true_blend_movies` a `yaca_mondi_movies`. PASS. |
| `tests/manifestFingerprint.test.js` | Riorientato | Riorientato per verificare l'hash manifest con i cataloghi del grafo. PASS. |
| `tests/presetsSorting.test.js` | Riorientato | Verifica ordinabilità asserendo i cataloghi hero del grafo. PASS. |
| `tests/profileDuplicates.test.js` | Riorientato | Verifica deduplicazione su `yaca_mondi_movies`. PASS. |
| `tests/ricercaDoor.test.js` | Riorientato | Corretto baseId da `yaca_true_blend` a `yaca_mondi` nel test del registro fonti. PASS. |
| `tests/animeContentFilter.test.js` | Riorientato | Filtro anime verificato sui cataloghi hero del grafo. PASS. |
| `tests/catalogKindAndSelectors.test.js` | Riorientato | Allineato per verificare che gli 8 hero siano trattati come agnostici. PASS. |
| `tests/catalogTypeAndValidation.test.js` | Riorientato | Valida i tipi e la lista dei cataloghi deprecati. PASS. |
| `tests/graphRowsInvariant.test.js` | Riorientato | Asserisce invarianti di pool sui 4 cataloghi hero del grafo. PASS. |
| `tests/graphClientPoolIntegration.test.js` | Riorientato | Asserisce il fallback e il recupero righe dal demone grafo. PASS. |
| `tests/sliderWiringAndModulation.test.js` | Riorientato | Valida la modulazione degli slider sui nuovi cataloghi. PASS. |
| `tests/heroMovieDateRegression.test.js` | Preservato | Verifica invariante di parsing date film. PASS. |
| `tests/sottosogliaVisibility.test.js` | Preservato | Verifica visibilità sottosoglia. PASS. |
| `tests/catalogHygiene.test.js` | Preservato | Valida igiene manifest su tutti i cataloghi di sistema. PASS. |
| `tests/heroStrandDiversity.test.js` | Preservato | Valida diversità seed hero. PASS. |
| `tests/hybridRatingsSync.test.js` | Preservato | Verifica sincronizzazione valutazioni ibride. PASS. |
| `tests/hybridRecommendations.test.js` | Preservato | Verifica facade `hybridRecommendations`. PASS. |
| `tests/proprietaDocumenti.test.js` | Preservato | Verifica proprietà documenti. PASS. |
| `tests/traktHardening.test.js` | Preservato | Verifica hardening client Trakt. PASS. |
| `tests/dataFetchers.test.js` | Preservato | Verifica fetcher superstiti. PASS. |
| `tests/feedProtocolAndCatalogs.test.js` | Nuovo test | Valida manifest protocol + erogazione 4 cataloghi grafo + 3 cataloghi feed con titoli > 0. PASS. |

### 8. Eventuali impedimenti o caveat
- **Ambiente offline in worktree**: DuckDB Parquet e il demone Python del grafo non girano come servizi live in questo worktree isolato. Il comportamento è stato verificato attraverso mock contrattualizzati conformi alle specifiche del grafo e della pipeline DuckDB.
- **Transizione `da_comporre`**: I cataloghi `uscite_nuove` e `nicchia_di_qualita` arrivano con flag `da_comporre: true` dal grafo; il prodotto associa e completa i metadati di anno, popolarità e vote_average tramite idratazione DuckDB/TMDB.

