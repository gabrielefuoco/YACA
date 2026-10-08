# 16 — Serie, grafo e ranker collaborativo: un sì, una motivazione e un no

**Data**: 08/10/2026 · `posizioni-e-serie.py` + `bench-graph-funnel.js` (colonna nuova)

## 1. Le serie come proxy di generalizzazione: **funziona, ma la copertura è 59%**

Il teacher è cieco sulle serie, quindi niente verità di riferimento. Ma si misura: (a) la copertura e
(b) la **stabilità della stima** — si spezzano i vicini in due metà, si stima la posizione due volte, si
misura quanto coincidono. È l'analogo per le serie dello split-half usato sui film.

| | serie | film |
|---|---|---|
| nodi nel grafo | 16.550 | 71.298 |
| con almeno un vicino **film** | **78%** | — |
| **con una posizione stimata** | **59%** (9.724) | **99%** |
| vicini film: mediana | **2** | 16 |
| **stabilità della stima** | **0,573** | 0,702 |

**Lettura**: la propagazione dà alle serie una posizione con stabilità **0,573** — informativa (per
confronto, la stabilità del teacher sui film di fascia media è 0,53), ma il **collo di bottiglia è la
connettività**: una serie ha **2 vicini film** di mediana contro i 16 di un film. Le serie stanno vicine
alle serie nel grafo attuale (costruito sui metadati), non ai film.

**Conseguenza**: il 41% di serie senza posizione **non** è un limite del metodo ma **del grafo**. E la
cura è esattamente la priorità 2 dell'utente: un grafo costruito sulle **posizioni propagate** (che sono
collaborative) metterebbe le serie vicino ai *film*, non alle altre serie. **Il ciclo virtuoso ha ora
una motivazione misurata.**

## 2. Il ranker collaborativo: **non batte lo scorer** (con una riserva importante)

Colonna nuova nel banco: gli stessi candidati, ordinati per **coseno fra la posizione del profilo e la
posizione del titolo** (profilo = media delle posizioni dei 3 semi).

| sorgente | candidati | scorer @50 | popolarità @50 | **posizione @50** |
|---|---|---|---|---|
| graph 1 hop | 44 | 3,7% | 3,7% | **3,7%** |
| **graph 2 hop** | 545 | **4,3%** | **6,1%** | **3,6%** |
| graph cluster+vicini | 3.051 | 3,7% | 6,2% | 3,4% |
| POOL VERO | 66 | 1,8% | 2,8% | 1,9% |
| pool proxy | 50.483 | 2,6% | 6,7% | 3,4% |

**L'ordinamento per posizione collaborativa perde**: 3,6% contro il 4,3% dello scorer sul 2 hop, e
contro il 6,1% della popolarità. Sul POOL VERO è pari allo scorer (1,9% contro 1,8%). Sull'1 hop è pari
(3,7%).

**La riserva, che è la parte importante**: il profilo collaborativo qui è la **media di 3 posizioni**,
perché il test set congelato costruisce profili da **3 semi**. La pipeline di produzione costruisce il
profilo con molto di più (DNA attivo, soft rarity, fusione). **Quindi questo test dice che con 3 semi la
posizione collaborativa è troppo povera per ordinare — non che l'idea sia sbagliata.**

Il test onesto del ranker collaborativo richiede un profilo con massa: o il banco sull'utente reale
(cronologie lunghe, ma 1 persona), o un test set con profili più ricchi.

## Verdetto sulle tre voci

| voce | esito |
|---|---|
| **serie** (proxy di generalizzazione) | ✅ **meccanismo confermato** (0,573 di stabilità), collo di bottiglia misurato (2 vicini film) |
| **grafo dei film** | ⏳ **motivato dai numeri** (il 41% di serie scoperte si cura con un grafo sulle posizioni), da costruire e testare |
| **ranker collaborativo** | ❌ **non batte lo scorer né la popolarità**, col profilo a 3 semi. Da riprovare con profili ricchi, non da chiudere |
