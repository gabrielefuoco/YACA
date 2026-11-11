Status: resolved
Type: task
Blocked by: 23

# Il grafo si ricostruisce dalle fonti ricostruibili

## Perché questo ticket esiste

Dopo il ticket 23 il grafo servito (V45) era un **vicolo cieco**: due delle sue quattordici fonti
(`RRFST`, `CREWPROP`) dipendevano da artefatti cancellati, quindi la catena `mixer → chiudi → prepara`
non si poteva più rifare. Conseguenza pratica: nessun cambio di peso, nessuna aggiunta al canone,
nessuna ricostruzione — per sempre.

La domanda: se sostituiamo le due fonti con le versioni nuove (lo studente riaddestrato e la carriera
come camminata), il grafo peggiora?

## Cosa è stato fatto

Ricostruita la catena **completa** (14 fonti) in `.cache/ricostruzione-nuova/`:

| gruppo | fonti | da dove |
|---|---|---|
| comportamentali (6) | `COVISION`, `RESID`, `LIST`, `LISTSEM`, `CONTESTI`, `TRIBU` | `v45/tipi2/` (ricostruibili dai corpus) |
| contenuto (7) | `TRAMA`, `CAST`, `DIR`, `PROD`, `COLL`, `KWSEM`, **`CREWPROP`** | righe rigenerate con le strutture congelate; `CREWPROP` è la **camminata** sul grafo servito |
| studente (1) | **`RRFST`** | `studente-finale.npz` → coseno top-100 (7.649.700 archi, 60 s) |

Poi `norm` → `budget` → `mixer` (52.048.242 archi, contro 50.660.592 serviti) → `chiudi` → `prepara`.

## La misura

Banco di ritenuta, 813 profili Trakt, storia tagliata al 20%, differenza appaiata:

| banco | V45 servito | ricostruito | differenza | IC95 | migliorati / peggiorati |
|---|---|---|---|---|---|
| **tutti i bersagli** | 0,1809 | 0,1826 | **+0,0017** | [−0,0023, +0,0056] | 217 / 210 |
| **solo bersagli freddi** (COVISION ≤ 2) | 0,0041 | **0,0100** | **+0,0059** | [+0,0017, +0,0111] | **12 / 1** |

Due letture, e sono entrambe positive:

1. **sul totale è equivalente** — l'intervallo contiene lo zero, quindi non si perde nulla a
   ricostruire il grafo da fonti ricostruibili;
2. **sulla coda fredda è meglio**, e l'intervallo **esclude lo zero**: da 0,41% a 1,00% di recall sui
   titoli senza co-visione, con 12 utenti migliorati e 1 peggiorato.

Ha senso: le due fonti nuove sono costruite per parlare di contenuto (`RRFST` addestrato col
campionamento pesato sui freddi, `CREWPROP` come camminata sul grafo), mentre le vecchie portavano
soprattutto struttura di pubblico. Sul totale si compensano; sui titoli senza comportamento la
differenza si vede.

## La conseguenza

Il grafo **smette di essere un vicolo cieco**: tutte e quattordici le fonti si rigenerano dai corpus e
dai metadati, più un modello che si riaddestra dalla sua ricetta. Nessuna dipendenza da artefatti persi.

## Cosa NON è stato fatto, e va deciso fuori da qui

- **Non è stato promosso in produzione.** Gli artefatti stanno in `.cache/ricostruzione-nuova/artefatti/`
  (triangolo 272 MB, vicini 43 MB, transizione 10 MB). Promuoverlo vuol dire scegliere *come*: una
  **versione nuova** (`v46`, con il suo `V46.md` e la sua impronta) o una sostituzione del freeze V45.
  La seconda è più semplice e più pericolosa: cancella la possibilità di tornare indietro con un
  confronto. La prima è la strada.
- **Il collocatore (ticket 21) usa `studente-finale`, già la fonte nuova**: se il grafo viene
  promosso, collocatore e grafo vengono dalla **stessa** ricetta, che è la proprietà che conta.
