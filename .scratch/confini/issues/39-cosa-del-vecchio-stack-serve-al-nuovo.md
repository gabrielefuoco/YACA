Status: needs-triage
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
