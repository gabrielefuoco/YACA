Status: resolved
Type: research

# 39 — Cosa del vecchio stack serve al nuovo (i ponti, misurati)

## Perché

Prima di cancellare il vecchio stack bisogna sapere **chi, fuori da lui, lo importa**. È la trappola che il ticket 32
ha già pagato: `animePolicy` viveva in `engines/hybrid/` ma la usavano i moduli **nuovi**, e cancellare il vecchio
stack senza salvarla avrebbe ucciso la decisione anime **in silenzio** (nessun errore, un comportamento diverso).

Metodo: un analizzatore che risolve i `require` di `src/` + `tests/` + `scripts/` + `ops/` e, per ogni file del
vecchio stack (`engines/`, `handlers/`, `pool/`, `db/tier1*`), elenca chi lo importa — **distinguendo chi sta
dentro dal chi sta fuori**.

## I numeri

**Il vecchio stack: 12 file, 5.879 righe.** E **tutti e 12** sono importati dall'esterno. Ma non tutti allo stesso
modo, e la differenza è tutta qui:

| ponte | righe | chi lo importa da fuori | tipo |
|---|---|---|---|
| `engines/hybridRecommendations.js` | 459 | **`catalog/providers/AiDiscoveryProvider.js`**, **`catalog/providers/HybridProvider.js`** | ⚠️ **moduli NUOVI** |
| `engines/keywords/HierarchicalGraph.js` | 243 | **`indice/duckDbStore.js`**, **`profile/ProfileScorer.js`**, **`dna/dnaEngine.js`** | ⚠️ **moduli NUOVI** |
| `pool/graphClient.js` | 124 | **`api/bolle.js`**, **`api/mondi.js`** (le rotte del prodotto) | ⚠️ **è roba nuova nella cartella sbagliata** |
| `handlers/catalogHandler.js` | 1.031 | `api/catalog.js`, `api/configurazione.js`, `api/stremio.js` | il percorso che serve (atteso) |
| `handlers/metaHandler.js` | 680 | `api/stremio.js` | il percorso che serve (atteso) |
| `engines/hybrid/catalogStrategies.js` | 1.599 | 15 file di **test** | solo test |
| `pool/index.js` | 655 | 3 file di **test** | solo test |
| `engines/hybrid/dataFetchers.js` | 417 | test | solo test |
| `engines/hybrid/scoringEngine.js` | 135 | test | solo test |
| `db/tier1Promotion.js` | 309 | 1 test | solo test |
| `db/tier1LazyPromotion.js` | 148 | 1 test | solo test |
| `engines/profileStaleness.js` | 79 | 1 test | solo test |

## Le tre cose da salvare

1. **`HierarchicalGraph` (243 righe)** — è una **struttura dati** (il grafo gerarchico delle keyword), e la usano
   **l'indice, il profilo e il dna**: tre moduli nuovi. Non è vecchio stack per natura, ci è finito perché il
   vecchio motore la usava per primo. **Va spostata** nel modulo che la possiede (il dna, o l'indice) e i tre
   consumatori ripuntati. *Il salvataggio più facile e più chiaro.*
2. **`graphClient` (124 righe)** — è il **client del servizio del grafo** (il motore *nuovo*): dipende solo da
   `axios`, ed è in `pool/` per ragioni storiche. Lo usano `api/bolle.js` e `api/mondi.js` (le rotte del prodotto).
   **Va spostato** fuori da `pool/`.
3. **Il motore ibrido dentro il modulo pool** — qui non si salva, si **sostituisce**. Il modulo `pool` (655 righe,
   con il suo invariante e il suo test) è già nuovo: usa `catalog/registry`, `anime`, `library`, `cache`. Ma per
   *funzionare* si appoggia a `engines/hybrid/dataFetchers` (417) e `engines/hybrid/catalogStrategies` (1.599) —
   **2.016 righe di vecchio motore** — e ci arriva dai **provider del catalogo nuovo** (`HybridProvider`,
   `AiDiscoveryProvider` → `hybridRecommendations` → `pool` → `dataFetchers`/`catalogStrategies`).

   Quindi la catena da sostituire è:
   ```
   catalog/providers/HybridProvider  →  engines/hybridRecommendations (459)
                                     →  pool (655)
                                     →  engines/hybrid/dataFetchers (417)
                                     +  engines/hybrid/catalogStrategies (1.599)
   ```
   **È l'ultimo modulo da costruire**: i cataloghi basati sul gusto (il profilo + il servizio del grafo + l'indice)
   devono produrre quello che oggi produce il motore ibrido. Finché quella catena esiste, il vecchio stack **non si
   può cancellare** — non perché serva le rotte vecchie, ma perché serve **i provider nuovi**.

## L'ordine

1. **Salvare `HierarchicalGraph`** e **`graphClient`** (meccanico, basso rischio, e subito verificabile: i tre
   consumatori della prima, le due rotte del secondo).
2. **Costruire il sostituto della catena ibrida** (il lavoro di prodotto: 2.670 righe da rimpiazzare con il
   profilo + il grafo + l'indice).
3. **Solo allora** cancellare il vecchio stack (5.879) e decidere dei suoi **21 file di test** (i 15 che
   esercitano `catalogStrategies`, i 3 del pool, gli altri): ripuntati ai moduli nuovi o cancellati con lui.

## Come si verifica

- Dopo il passo 1: nessun file in `src/{indice,profile,dna,catalog,api}/**` importa da `src/{engines,handlers,pool}/`
  — tranne i due handler che sono il percorso che serve.
- Dopo il passo 3: `grep -rn "engines/hybrid\|handlers/" src/` → solo le rotte, e `src/` sceso di ~5.879 righe.

## Nota

**Nessuno di questi ponti è un errore**: sono il prezzo di un refactor fatto per gradi. Ma la differenza fra
«il vecchio stack serve le rotte vecchie» (atteso, e si sostituisce) e «il vecchio stack serve i moduli nuovi»
(una dipendenza nascosta, e va tolta) è esattamente la differenza fra un lavoro pianificato e un guasto silenzioso.

## Aggiunta (18/10/2026): un ponte che il primo giro aveva mancato

`src/id_mapping/id_cache.js` (96 righe) — la cache di traduzione **IMDb ↔ TMDB** — è usata da:
- `src/handlers/metaHandler.js` (**vecchio stack**, muore con lui),
- `src/api/admin.js` (una rotta),
- **`src/profile/ProfileBuilder.js`** (modulo **nuovo**).

Quindi è un **quarto ponte**: non è nel vecchio stack, ma è usato *da* un modulo nuovo e da uno vecchio. Quando il
vecchio stack muore, `ProfileBuilder` continua a volerlo → **va spostato** nel modulo che lo possiede (la cache di
identità è roba dell'**indice**: traduce id per rispondere). Il primo giro non l'aveva visto perché l'analizzatore
cercava solo dentro `engines/`, `handlers/`, `pool/`, `db/tier1*` — e questo vive in una cartella sua.

**Lezione**: il confine di un audit è un'ipotesi. Un file fuori dalle cartelle "sospette" può essere un ponte
esattamente come uno dentro.

## Inventario della catena ibrida

La catena ibrida costituisce il terzo ponte — il blocco da 2.670 righe che alimenta i cataloghi basati sul gusto e i fallback hero:
`catalog/providers/{HybridProvider,AiDiscoveryProvider}` → `engines/hybridRecommendations` (459) → `pool` (655) → `engines/hybrid/dataFetchers` (417) + `engines/hybrid/catalogStrategies` (1.599).
Ecco l'analisi dettagliata file per file letta direttamente dal codice sorgente:

1. **`src/catalog/providers/HybridProvider.js`** (e `AiDiscoveryProvider.js` come ingressi):
   - **Cosa fa**: `HybridProvider` (35 righe) normalizza l'identificatore del catalogo (`_movies`/`_series`) e propaga le impostazioni attive del profilo (`activeProfileSettings`) delegando la generazione a `engines/hybridRecommendations.getHybridCatalog`. `AiDiscoveryProvider.js` (393 righe) genera i cataloghi AI interattivi componendo query scoperte via DuckDB/FTS e consumando `computeTopGenres` e `computeTopKeywords` importati da `hybridRecommendations`.
   - **Cosa coprono i nuovi moduli**: La definizione del tipo e della semantica dei cataloghi hero è già in `src/catalog/registry.js` e `validation.js`; le query parametriche su DuckDB per la scoperta sono già servite da `src/indice/compiler.js` e `duckDbStore.js`; le deduzioni e i filtri di profilo appartengono a `src/profile/`.
   - **Cosa manca**: Una porta pulita nel modulo catalogo che interroghi direttamente il nuovo motore delle raccomandazioni (il servizio Python o l'indice vettorizzato) senza dover dipendere da `hybridRecommendations`.

2. **`src/engines/hybridRecommendations.js`** (459 righe):
   - **Cosa fa**: Coordina la pipeline monolitica di generazione delle raccomandazioni per i singoli cataloghi. Risolve il contesto (`contestoDi`), verifica la freschezza del profilo innescando la sincronizzazione incrementale da Trakt/Stremio (`syncIncrementalRecommendations`); se il catalogo è hero, delega al pool (`getHeroPool`), mentre se è un preset delega a `buildDirectPresetCatalog`. Effettua poi la risoluzione e idratazione delle card Stremio (`resolveCardDetails` arricchendo con loghi, poster e rating da DuckDB/TMDB), applica i filtri (`kidsMode`, `animePolicy`), scalda in background il batch successivo (`Background-Warmup`), persiste le impressioni su Mongo (`RecommendationImpression`) e applica la paginazione (`skip`, `ITEMS_PER_PAGE`).
   - **Cosa coprono i nuovi moduli**: Il contesto del profilo e i filtri appartengono interamente a `src/profile/` (`contestoDi`, `selettoriEffettivi`); la cache a 7 giorni con dipendenze dichiarative è governata da `src/cache`; i metadati primari provengono da `src/indice/duckDbStore.js` (`getDuckDbMetaDetails`); la formattazione Stremio appartiene a `src/stremio/`.
   - **Cosa manca**: L'ingestione e sincronizzazione da Trakt deve essere riallocata in `src/library/` (che gestisce la storia e la persistenza dei dati utente); occorre un compositore snello del feed che prenda gli ID dal motore nuovo senza dipendere da logiche di warmup concorrente o impression tracking su Mongo.

3. **`src/pool/index.js`** (655 righe):
   - **Cosa fa**: È il modulo pool (introdotto col Ticket 12) che compone le righe hero del feed con cache condivisa (`buildSharedHeroCacheKey`, legata a `HERO_CACHE_KEY_VERSION` e alle versioni di artefatto/ricetta). Esegue in parallelo le strategie storiche esclusive (`true_blend`, `seed_network`, `hidden_gems`, `trakt_filtered`) con i rispettivi fallback; applica l'invariante di assegnazione disgiunta (`claimedIds` per garantire l'assenza di duplicati tra righe diverse); valuta il degrado di Trakt (`hiddenForInsufficientFallback`); e infine esegue le strategie additive (`graph_rows`: interroga il servizio Python persistente `POST /raccomanda` via `src/clients/graphClient` per generare *Il tuo mondo* e *Un passo fuori*).
   - **Cosa coprono i nuovi moduli**: Il client del grafo (`src/clients/graphClient`) e l'estrazione dei semi (`src/library/semiDi`) gestiscono già le righe additive del nuovo motore; il catalogo possiede i tipi e l'ordine delle priorità (`src/catalog/registry.js`); la classificazione e i filtri anime sono in `src/anime`.
   - **Cosa manca**: Le 4 strategie esclusive dipendono ancora da 2.016 righe di vecchio codice (`dataFetchers` + `catalogStrategies`). Per completare la sostituzione, le liste basate sul gusto dovranno essere fornite dal servizio Python del grafo o dal modulo indice/profilo, svuotando `HERO_STRATEGIES` da ogni invocazione al vecchio stack.

4. **`src/engines/hybrid/dataFetchers.js`** (417 righe):
   - **Cosa fa**: Fornisce l'accesso ai dati grezzi e ai fallback: interroga DuckDB per ottenere i candidati dei fallback popolari, periodici, undiscovered e hidden gems (`fetchFallbackRows`, `mapStableFallbackIds` con deduplicazione stabile per collezione e regista); carica il contesto utente da MongoDB (`UserAccount`, `AddonConfig`, `TasteProfile`); gestisce le chiamate a Trakt con logica di token refresh proattivo e reattivo (`safeTraktFetchDetailed`, `fetchRecentHistory`, `fetchRecentRatings`, `fetchTraktRecommendationsRawDetailed`); calcola la co-occorrenza di titoli simili in DuckDB (`fetchTmdbSimilarCounts`); e calcola le penalità per le impressioni viste (`getImpressionMap`, `calculateImpressionPenalty`).
   - **Cosa coprono i nuovi moduli**: L'accesso ai dati del catalogo (DuckDB, conteggi, popolarità) è responsabilità nativa di `src/indice/`; il contesto utente e le impostazioni del profilo sono governati da `src/profile/` e `src/config/`; le policy anime da `src/anime`.
   - **Cosa manca**: Un client Trakt resiliente con refresh token integrato nei moduli client/library (`src/clients/trakt.js` o `src/library/ingestion`); una gestione pulita della diversificazione nei fallback che non dipenda da data fetcher speciali del motore ibrido.

5. **`src/engines/hybrid/catalogStrategies.js`** (1.599 righe):
   - **Cosa fa**: È il cuore algoritmico del vecchio motore. Implementa la generazione delle quattro strategie hero:
     1) `buildTopGenresMixCatalog` (`true_blend`): estrae i generi dominanti dal profilo, interroga DuckDB per ciascun genere, valuta il match VSM dei candidati con `ProfileScorer` e impone quote rigide di diversità (`HERO_DIVERSITY_CAPS`: max 3 per genere, max 1 per regista, max 2 per genere famiglia).
     2) `buildHybridCatalog` (`seed_network`): espande i semi della cronologia (`collectRealSeeds`), i suggerimenti Trakt e il DNA; interroga le similarità DuckDB (`similar_to`), calcola lo score ibrido VSM + similarità e applica filtri e caps di diversità.
     3) `buildHiddenGemsCatalog` (`hidden_gems`): individua titoli con basso livello di popolarità (<=20) ma buon rating (>=7.0, 100-1000 voti) filtrati per affinità col DNA.
     4) `buildTraktFilteredCatalogWithMeta` (`trakt_filtered`): scarica le raccomandazioni Trakt e le filtra/ordina tramite DNA del profilo, gestendo il top-up di fallback.
     Implementa inoltre `buildDirectPresetCatalog` per la valutazione dei preset statici.
   - **Cosa coprono i nuovi moduli**: I semi della libreria sono estratti dal modulo `src/library/` (`semiDi`, `collectRealSeeds`); la modellazione VSM vive in `src/profile/ProfileScorer` e `src/indice/HierarchicalGraph`; la generazione di liste per vicinanza semantica, mondi e passi fuori è il compito del servizio Python `services/graph/`; la compilazione dichiarativa dei filtri appartiene a `src/indice/compiler.js`.
   - **Cosa manca**: Il generatore unificato di raccomandazioni basate sul gusto che sostituisca la generazione candidati e le quote di diversità di queste 4 strategie, permettendo al pool di popolare l'intero feed tramite il contratto del nuovo motore o query dirette all'indice.

## Esito

### 1. I due salvataggi (Rescues) e il criterio di collocazione

1. **`HierarchicalGraph.js` (243 righe) → `src/indice/HierarchicalGraph.js`**:
   - **Criterio applicato**: *Il modulo che possiede i DATI, non quello che si è trovato a usarli per primo*.
   - **Giustificazione**: `HierarchicalGraph` non è una deduzione di profilo né un algoritmo del vecchio stack: è la struttura dati che indicizza l'ontologia gerarchica delle keyword TMDB (`src/data/hierarchical_graph.json` + `src/data/keywordIds.js`). Nella nuova architettura a confini, `src/indice/` possiede i file di catalogo, la freschezza e l'indicizzazione dei dati TMDB (`duckDbStore`). È infatti `duckDbStore` che inietta la mappa dei nomi delle keyword e ne invalida le cache (`invalidateKeywordCaches`). I moduli `src/dna/` e `src/profile/` sono consumatori/deduttori che proiettano i loro vettori su questa struttura. Collocarla in `src/indice/` preserva l'ordine gerarchico dei livelli: `indice` (dati) ← `dna`/`profile` (deduzioni), evitando l'inversione di dipendenza che si sarebbe creata posizionandola in `src/dna/` (dove `duckDbStore` avrebbe dovuto dipendere da un modulo di deduzione utente).
   - **Consumatori ripuntati**:
     - `src/indice/duckDbStore.js`: `require('./HierarchicalGraph')`
     - `src/dna/dnaEngine.js`: `require('../indice/HierarchicalGraph')`
     - `src/profile/ProfileScorer.js`: `require('../indice/HierarchicalGraph')`
   - In `src/engines/keywords/HierarchicalGraph.js` è stato lasciato un forwarding shim verso `src/indice/HierarchicalGraph.js` per garantire la retrocompatibilità transitoria con i test del vecchio stack ancora non migrati.

2. **`graphClient.js` (124 righe) → `src/clients/graphClient.js`**:
   - **Criterio applicato**: *Il modulo che possiede i client dei servizi*.
   - **Giustificazione**: `graphClient.js` è il client HTTP puro (dipendente unicamente da `axios`) che comunica con il servizio Python esterno persistente (`services/graph/` su porta 7862) secondo il contratto `contratto-motore.md`. Viveva in `src/pool/` unicamente per ragioni storiche. La sua collocazione naturale in YACA è `src/clients/`, accanto agli altri client di servizi esterni (`src/clients/tmdb.js`, `src/clients/trakt.js`).
   - **Consumatori ripuntati**:
     - `src/api/bolle.js`: `require('../clients/graphClient')`
     - `src/api/mondi.js`: `require('../clients/graphClient')`
     - `src/pool/index.js`: `require('../clients/graphClient')`
     - Test unitari e di integrazione ripuntati in `tests/bolleRoute.test.js`, `tests/domainSurface.test.js`, `tests/graphClientPoolIntegration.test.js`, `tests/graphRowsInvariant.test.js`.
   - Il vecchio file `src/pool/graphClient.js` è stato rimosso con `git mv`, lasciando `src/pool/` privo di questo client.

### 2. Le prove dei grep

- `grep -rn "engines/keywords" src/indice src/profile src/dna src/catalog`:
  **Nessun risultato** (exit code 1: zero occorrenze).
- `grep -rn "engines/hybrid/" src/indice src/profile src/dna src/catalog`:
  **Nessun risultato** (exit code 1: zero occorrenze).
- `grep -rn "pool/graphClient" src/`:
  **Nessun risultato** (exit code 1: zero occorrenze).
- *Nota di disambiguazione*: `grep -rn "engines/hybrid" src/catalog` (senza slash finale) matcha unicamente le due righe di `src/catalog/providers/AiDiscoveryProvider.js` e `HybridProvider.js` verso `engines/hybridRecommendations`, che costituiscono l'ingresso della catena ibrida (il terzo ponte) censita nella Parte 2 e volutamente non toccata a livello di codice per specifica del brief.

### 3. I test eseguiti (un file alla volta, tutti verdi)

- `npx jest tests/graphClientPoolIntegration.test.js --forceExit`: **PASS** (6 passed, 6 total)
- `npx jest tests/graphRowsInvariant.test.js --forceExit`: **PASS** (4 passed, 4 total)
- `npx jest tests/dnaKeywordIdentity.test.js --forceExit`: **PASS** (13 passed, 13 total)
- `npx jest tests/profileScorerVSM.test.js --forceExit`: **PASS** (2 passed, 2 total)
- `npx jest tests/bolleRoute.test.js --forceExit`: **PASS** (6 passed, 6 total)
- `npx jest tests/domainSurface.test.js --forceExit`: **PASS** (29 passed, 29 total)
- `npx jest tests/heroAnimeTypeSelectors.test.js --forceExit`: **PASS** (8 passed, 8 total)

Totale: 7 suite eseguite singolarmente, 68 test superati con successo, zero fallimenti.

### 4. Cosa non si è potuto fare (perimetro e vincoli rispettati)

- **Sostituzione della catena ibrida (2.670 righe)**: come prescritto dal brief ("MAP the third thing, do NOT build it"), non è stato modificato il codice di `HybridProvider`, `AiDiscoveryProvider`, `hybridRecommendations`, `dataFetchers` o `catalogStrategies`. La catena è stata unicamente censita e mappata nell'inventario per guidare il successivo lavoro di sostituzione.
- **File Off-Limits**: nessun file compreso nella lista off-limits (`src/models/**`, `src/api/catalog.js`, `src/api/configurazione.js`, `src/api/tmdb.js`, `src/api/configure/**`, `src/api/auth/**`, `src/clients/trakt.js`, `src/handlers/**`, `src/library/ingestion/**`, `src/ricerca/**`, `src/utils/tmdb*`) è stato modificato.

