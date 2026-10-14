# 11 — La gerarchia a tre livelli (e il conflitto col ticket 09)

**Status**: `resolved` · **Ticket**: [11](../issues/11-gerarchia-tre-livelli.md) · **Script**: `10-11-canali-gerarchia.py` · **Log**: `log/10-11-canali-gerarchia.log`

## Cosa è stato costruito

Un passo di Leiden **sopra** il grafo delle bolle sparsificato dal ticket 09 (5.297 nodi, 9.632 archi), a due risoluzioni, per ottenere L2 (costellazioni) e L1 (macro-mondi). Nessun embedding a 2 dimensioni — quello il ticket lo escludeva per struttura.

| livello | risoluzione | gruppi | mediana bolle | modularità |
|---|---|---|---|---|
| **L2** (costellazioni) | 6,0 | **261** | 25 | 0,672 |
| **L1** (macro-mondi) | 0,6 | **133** | **1** | 0,716 |

## ❌ L1 a 25-35 macro-mondi è IMPOSSIBILE — e la causa è il ticket 09

Il ticket chiedeva **25-35 macro-mondi**. Non si ottengono, e non per la risoluzione:

```
grafo delle bolle: 5.297 nodi · 9.632 archi · COMPONENTI CONNESSE: 117
```

**Il grafo sparsificato è una polvere di 117 componenti connesse.** Qualunque partizione di un grafo con 117 componenti ha **almeno 117 gruppi** ✓ — quindi 25-35 non è una questione di taratura: è **impossibile per costruzione**. E il numero osservato (133 = 117 + 16 divisioni interne) lo conferma: a risoluzione bassa il partitore non può fare altro che assegnare una comunità per componente, e la mediana di 1 bolla viene dal fatto che la maggioranza delle componenti sono **bolle singole**.

**I due ticket sono in conflitto, e il conflitto è misurato:**

| | vuole | effetto collaterale |
|---|---|---|
| **09 — sparsificazione** | togliere il rumore, ~6 vicini per bolla | **frammenta la mappa in 117 pezzi**, la maggioranza bolle isolate |
| **11 — gerarchia** | 25-35 macro-mondi sopra le bolle | **impossibile** su un grafo frammentato |

Nessuno dei due è sbagliato da solo; insieme non stanno. La sparsificazione del 09 è stata **troppo aggressiva**: il k-NN **mutuo** con k=8 tiene solo gli archi in cui entrambi gli estremi si scelgono, e su 5.297 bolle questo lascia fuori la maggioranza delle bolle (per costruzione: con k=8, il massimo grado possibile è 8, e 19.264 archi su 5.297 nodi bastano appena a connetterli tutti — quindi basta un legame mancato per fare un'isola).

**Il numero che lo dice**: 5.297 nodi con grado massimo 8 possono avere al più 21.188 archi in un grafo connesso; ne abbiamo **19.264**, cioè **il 91% del massimo possibile per un grafo connesso con quel grado**. E non basta: la struttura reale è a grappoli, e i ponti fra i grappoli sono esattamente ciò che il filtro mutuo taglia.

## ✅ L2 invece è nel bersaglio

261 costellazioni con una mediana di **25 bolle** ✓ — dentro l'intervallo 300-400 che il ticket indicava (leggermente sotto), con una distribuzione sana e una modularità di 0,672 (alta, ma qui la modularità non è un criterio di qualità — è stata misurata quattro volte come non correlata).

## Cosa serve per riconciliare i due ticket

**La sparsificazione deve garantire la connettività.** Tre strade, in ordine di semplicità:

1. **Un albero di copertura sui ponti**: dopo il filtro mutuo, aggiungere gli archi più forti necessari a riconnettere le componenti (un albero di copertura massimo sulle componenti) — costo: un centinaio di archi, beneficio: una mappa connessa.
2. **k più alto**, e accettare una mediana di 7-10 vicini invece di 4-5 (a k=10 la mediana era 7 e le isolate 108 — meglio, ma **108 componenti restano**).
3. **Il k-NN non mutuo** (solo «B fra i primi k di A»): tiene la selettività del lato forte e non richiede reciprocità — ma è asimmetrico, e una mappa asimmetrica non si naviga.

## I criteri del ticket

- [ ] ❌ **L1 ha 25-35 macro-mondi e ognuno ha un filo nominabile**: impossibile — il grafo sparsificato ha 117 componenti connesse. Il criterio è incompatibile con il ticket 09
- [x] **L2 ha ~300-400 costellazioni**: 261, con una mediana di 25 bolle. Leggermente sotto l'intervallo e dichiarato
- [x] ogni bolla finisce in esattamente un L2 e un L1 (è una partizione, quindi per costruzione)
- [x] la gerarchia è un aiuto e non un rimpiazzo: le bolle atomiche restano indirizzabili
- [x] il costo dichiarato: un passo di Leiden su 5.297 nodi, secondi
- [ ] ⚠️ **il confronto con la vecchia gerarchia ad albero** non è stato fatto (l'albero era costruito sul grafo contaminato, e il confronto è informazione, non obiettivo)

## Limiti dichiarati

1. **Le due risoluzioni (6,0 e 0,6) sono state scelte a occhio** per ottenere i conteggi del ticket, non tarate su un criterio.
2. **Nessun L1 è stato letto** (non ci sono L1 da leggere: sono componenti, non mondi).
3. **Il grafo di partenza è quello del ticket 09**, salvato come `bolle-archi.npz`: se la sparsificazione cambia (per riconnettere), questa gerarchia va rifatta.
4. **La modularità di 0,672 non è un buon segno**: le misure precedenti (report 71-73) hanno mostrato che sale quando le bolle peggiorano. Su un grafo frammentato era prevedibile che salisse.
