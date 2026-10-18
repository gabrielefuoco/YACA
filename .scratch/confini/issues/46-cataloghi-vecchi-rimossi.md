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
