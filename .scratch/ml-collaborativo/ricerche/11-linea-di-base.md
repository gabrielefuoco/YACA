# 11 — La linea di base sul test set congelato

**Data**: 08/10/2026 · **400 trial, 200 utenti indipendenti** · grafo e teacher **de-leakati** (200 utenti esclusi)

## Il percorso (i 4 passi)

| # | passo | esito |
|---|---|---|
| 1 | teacher senza i 200 utenti | `teacher-Z-heldout.npz` · 200.748 utenti · 82.249 voti tolti (0,26%) · 1ª componente 39,5% → 40,5% |
| 2 | grafo dei film su quel teacher | `film-graph-heldout.npz` · 87.848 nodi · 263 cluster · mediana 314 (prima: 276/299) |
| 3 | candidati per i 400 trial | `graph-candidates-testset.json` · 400/400 esportati |
| 4 | **banco** | sotto |

## I numeri (400 trial, 200 utenti)

| sorgente | candidati (mediana) | recall@50 | recall@200 | solo popolarità | voti mediani |
|---|---|---|---|---|---|
| graph 1 hop | 44 | 3,7% | 3,8% | 3,7% | 268 |
| caso = \|1 hop\| | 41 | 0,5% | 0,6% | 0,5% | 110 |
| **graph 2 hop** | 546 | **4,3%** | **9,6%** | **6,1%** | 121 |
| caso = \|2 hop\| | 75 | 1,2% | 2,2% | 1,6% | 110 |
| graph cluster+vicini | 3.051 | 3,7% | 8,2% | 6,2% | 66 |
| **POOL VERO (fetchSmartAndPool)** | **75** | 1,8% | 3,2% | 2,8% | 108 |
| pool proxy (generi condivisi) | 62.621 | 2,5% | 5,7% | 6,7% | 43 |

| strato | sorgente | candidati | recall@50 | recall@200 | solo popolarità |
|---|---|---|---|---|---|
| **fondo** (100 utenti, 215 voti mediani) | graph 2 hop | 620 | 3,6% | 9,1% | **3,6%** |
| fondo | caso = \|2 hop\| | 66 | 1,1% | 2,2% | 1,1% |
| fondo | POOL VERO | 66 | 1,3% | 2,5% | 1,2% |
| **resto** (100 utenti, 6.922 voti) | graph 2 hop | 474 | 5,0% | 10,1% | **8,5%** |
| resto | caso = \|2 hop\| | 113 | 1,4% | 2,2% | 2,1% |
| resto | POOL VERO | 149 | 2,3% | 4,0% | 4,5% |

## Quattro letture

### 1. Il vantaggio del grafo **si replica** su 200 persone indipendenti

| confronto | vecchio banco (1 persona) | **test set (200 persone)** |
|---|---|---|
| 2 hop @50 contro il pool | 5,9% vs 1,9% = **3,1×** | 4,3% vs 1,8% = **2,4×** |
| 2 hop @200 contro il pool | 8,7% vs 4,2% = 2,1× | 9,6% vs 3,2% = **3,0×** |
| 2 hop @50 contro il **caso** | 5,9% vs 1,3% = 4,5× | 4,3% vs 1,2% = **3,6×** |
| 2 hop @200 contro il caso | 8,7% vs 2,8% = 3,1× | 9,6% vs 2,2% = **4,4×** |

**Direzione confermata, numeri rivisti**: il vantaggio sul pool è più piccolo a @50 (3,1× → 2,4×) e più
grande a @200 e sul controllo casuale. Non era un artefatto di una persona. **Questa è la prima
affermazione del filone con una statistica vera dietro.**

### 2. Per i profili freddi il pool di produzione **soffre la fame**: 75 candidati

Sul vecchio banco (cronologie lunghe) il pool faceva 1.851 candidati. Con 3 semi fa **75**, mentre il
grafo ne dà 546. **Una lista top-50 costruita su 75 candidati è un imbuto che non filtra niente** — ed è
il caso della maggior parte degli utenti nuovi. È un argomento di prodotto che non dipende dal modello.

### 3. Il **ranker** è il punto debole, non l'imbuto

| | recall@50 | solo popolarità |
|---|---|---|
| **tutti** | 4,3% | **6,1%** ← la popolarità vince |
| fondo | 3,6% | 3,6% ← pari |
| resto | 5,0% | **8,5%** ← la popolarità vince di 1,7× |

**Ordinare i candidati del grafo per popolarità batte il nostro scorer**, su questo test set. Il tema
"scorer" ha valore nullo in testa sulla fascia di nicchia e **negativo** sulla fascia mainstream. È
coerente con quello che si vedeva sul vecchio banco (4,9 dei 5,9 punti spiegati dalla popolarità) e ora
è misurato con un controllo valido su 200 utenti. **Non è una regressione da correggere: è un fatto da
decidere** (un ranker che non batte la popolarità non va servito come se la battesse).

### 4. Un bug del banco trovato e corretto (perché i numeri sopra siano validi)

Il primo run dava `voti mediani: 0` su tutte le sorgenti: nel blocco che carica i titoli **fuori** dal
pool proxy mancava `voteCount`, e col test set quei titoli sono decine di migliaia → **la colonna di
controllo leggeva 0 voti per il 79% dei candidati**. Corretto e rilanciato. La colonna "solo popolarità"
è la mia rete di sicurezza: una rete rotta avrebbe prodotto una conclusione sbagliata (e nel primo run
l'aveva già prodotta: "la popolarità vince" era sostenuto da un controllo che leggeva zeri).

## Cosa resta (i cancelli aperti)

1. **Il dosaggio della diffusione** ([20](issues/20-dosaggio-diffusione.md)) non è ancora stato rimisurato
   qui: i bracci A/B/C/D/E vanno rifatti sul test set. Il compromesso testa/profondità **potrebbe non
   replicarsi** — fino ad allora resta provvisorio.
2. **L'adiacenza appresa** ([18](issues/18-adiacenza-appresa.md)) va ri-auditata col teacher de-leakato.
3. Il **ranker** merita un ticket proprio: batte la popolarità o no, e su quale strato.
4. La colonna popolarità è solo a @50: per decidere serve anche @200.

## Come si usa da qui in avanti

```
CAND_FILE=graph-candidates-testset.json node .scratch/ml-collaborativo/bench-graph-funnel.js
```

Qualunque modifica (adiacenza, dosaggio, node2vec, feature, ranker) si misura con questa riga. Il
vecchio banco resta **prova di fumo**.
