# 09 — Embedding appresi dal sottografo (l'idea dell'utente)

**Status**: `ready-for-agent` · **Type**: `prototype` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno
(le premesse sono misurate: [07](07-feature-estese.md) e [08](08-fix-puntuali.md))

## Ipotesi

Al posto di 1.982 nodi binari + 3.000 persone + 800 franchise in colonne sparse (che overfittano: gap +0,135
prima della regolarizzazione), un **vettore denso appreso per ogni nodo** del sottografo, e per il titolo la
**media appresa** dei suoi nodi (keyword, persone, franchise).

**Indizi a favore, già misurati**: (a) le feature contano, non è il modello il collo di bottiglia; (b) la
parte ad alta cardinalità è *il* problema (3.800 colonne sparse); (c) `L1_adjacency` — i collegamenti fra nodi
L1 — **è già scritto dal builder** (`build_graph.py:512`) ma assente dal JSON di produzione: la base
strutturale per l'embedding di nodo esiste già.

## Cosa fare

1. Costruire il grafo dei nodi (keyword + persone + franchise + L1) con le adiacenze L1 di `build_graph.py`.
2. `node2vec`/DeepWalk a 32-64 dimensioni (o autoencoder sulla matrice keyword×keyword — **non** un LLM).
3. Per ogni titolo: media (o pooling pesato) degli embedding dei suoi nodi → feature densa.
4. Rifare lo student con quelle feature.

## Cancelli (con le metriche già in piedi)

1. **coseno held-out > 0,500**, col controllo del banale (0,224) stampato accanto.
2. **imbuto: grafo 2 hop > 5,9% @50** con lo scorer di produzione.
3. Costo: deve restare un giro da minuti (6.125 keyword, 1.382 nodi L1), non da ore.

**Interpretazione, decisa prima**: se (1) sale e (2) no → lo student è «abbastanza buono», il collo di
bottiglia è altrove (copertura del teacher, statistica debole) e si chiude qui. Se salgono entrambe → strada.
