# 06 — La diffusione laterale L1: ricostruita, iniettata, misurata

**Data**: 08/10/2026 · **Script**: `rebuild-l1-adjacency.py`, `bench-graph-funnel.js` (con `L1_ADJ`)

## 1. Ricostruita (la produzione non ce l'ha)

`rebuild-l1-adjacency.py` riproduce la regola del builder (`build_graph.py:275-298`):
co-occorrenza di keyword fra i titoli → **PPMI classica** → archi fra micro-cluster L1
(solo fra cluster diversi, come fa il builder) → **top-50 vicini** per cluster, 4 decimali.

| | |
|---|---|
| titoli usati | 69.167 (con ≥2 keyword note al grafo) |
| coppie di keyword con PPMI>0 | 101.297 (su 18,7 milioni possibili) |
| archi fra micro-cluster | **70.821** |
| cluster con almeno un vicino | **1.381 su 1.382 (100%)** |
| peso degli archi | mediana 1,19 · p90 2,60 · max 37,49 |

**Sanità semantica** (i vicini hanno senso, e `racing → car` è il controllo facile):

| cluster | vicini più forti |
|---|---|
| `c_1` (racing) | **car (26,6)** · victory (10,1) · motorcycle (8,1) · grifter (6,0) · gambling (5,5) |
| `c_0` (rape) | handicap (8,1) · controversy (8,1) · sexual abuse (6,2) · tradition (3,5) |
| `c_2` (sex) | suburb (11,4) · sexual liberation (8,9) · voyeur (6,6) · sexual attraction (6,3) |

Avertenza dichiarata: il builder usava **la sua** PPMI fusa; questa è una ricostruzione dalla
definizione classica. La misura qui sotto vale per *questa* adiacenza, non per i numeri esatti
dell'originale (che non esistono più in nessuna cache del repo).

## 2. Iniettata (senza toccare niente)

`bench-graph-funnel.js` accetta ora `L1_ADJ=<path>`: carica la chiave, la mette in
`graph.data.L1_adjacency` e invalida le cache. Prova che l'iniezione è **viva** (lezione del
giorno: mai fidarsi di un meccanismo silenzioso): le chiavi del vettore gerarchico per item
passano a **mediana 97 · max 846**.

## 3. Misurata — e qui serve la lettura attenta

75 trial, 5 profili reali, scorer di produzione. A = produzione (diffusione morta), B = accesa.

| braccio | @50 A→B | @200 A→B | solo popolarità A→B | caso A→B |
|---|---|---|---|---|
| graph 1 hop | 3,5 → 3,5 | 3,5 → 3,5 | 3,3 → 3,3 | 0,4 → 0,4 |
| **graph 2 hop** *(candidati fissi)* | 5,9 → 5,9 | 8,7 → **9,2** | **4,9 → 4,9** | 2,8 → 3,5 |
| graph cluster+vicini | 2,9 → 2,8 | 7,3 → 7,8 | 2,3 → 2,3 | 2,0 → 2,0 |
| POOL VERO | 1,9 → 1,9 | 4,2 → **4,9** | 0,9 → 0,9 | 2,8 → 3,5 |
| pool proxy | 3,4 → 2,3 | 9,1 → 8,4 | 0,0 → 0,0 | — |

### La trappola, smascherata dal controllo

Il POOL VERO **sale** (4,2 → 4,9) **ma sale anche il suo controllo casuale** (2,8 → 3,5): la
diffusione cambia il vettore del profilo → cambiano i **semi** → cambia il **pool**. Quel numero
non è attribuibile alla diffusione, è il pool che è diventato un altro pool. In rapporto al caso:
1,50× → 1,40× (peggiora). **Braccio non interpretabile così com'è.**

### Il braccio pulito, invece, dice qualcosa

Sul **graph 2 hop** i candidati sono **fissi** (vengono dal file, non dal profilo): l'unica cosa che
cambia è l'ordinamento dello scorer. E lì il controllo "solo popolarità" **resta fermo a 4,9**,
mentre lo scorer passa da 8,7 a **9,2**:

> **contributo marginale dello scorer: 3,8 → 4,3 (+13%)**

Lo stesso @50 resta 5,9 (la testa della lista non si muove): il guadagno è in profondità.

## 4. Verdetto

1. Il segnale laterale **esiste, è ricostruibile gratis e non fa danni**: su candidati fissi migliora
   il contributo dello scorer del **+13%** in profondità (@200), zero in testa (@50).
2. **Non è una vittoria**: è piccolo, e il guadagno maggiore visto sulla produzione (pool 4,2 → 4,9)
   **non è suo** — è il pool che cambia. Va rimisurato con candidati fissi.
3. Quindi: **riaccenderlo in produzione è una decisione a sé**, da prendere su una misura pulita.
   Il costo è quasi zero (iniettare la chiave), il rischio è quasi zero (nessuna regressione vista),
   il guadagno è **piccolo e solo in profondità**.
4. Conseguenza per il filone: il termine di paragone del grafo nuovo va riallineato — con la
   diffusione accesa, il 2 hop a @200 sale a 9,2 (contro il 8,7 misurato prima). Il vantaggio sul
   POOL VERO resta, ma va ricalcolato con lo stesso pool per i due bracci.

## 5. Il test pulito che manca (per il ticket)

Lo stesso banco con **il pool fissato da A** nei due run: si esportano i pool una volta sola e si
confronta solo l'ordinamento. Serve una riga in `export-graph-candidates.py` (esportare anche il
pool vero) e il banco legge i pool dal file invece di rigenerarli. Allora la differenza è **solo**
della diffusione, e si può decidere.
