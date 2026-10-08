# 17 — L'audit esterno del grafo: il teacher come giudice

**Status**: `resolved` · **Type**: `research` · **Aperto**: 08/10/2026 · **Chiuso**: 08/10/2026 · **Blocked by**: 13

## Perché esiste

Tutti i criteri usati finora erano **interni**: modularità 0,696, coerenza 0,618, ARI contro i topoi L2.
Il grafo si promuoveva da solo. «Il grafo di adiacenza deve essere perfetto» era una richiesta senza
misura. Il teacher (32M di voti reali) è il criterio **esterno**.

## Risultato (`audit-adjacency.py`)

| | |
|---|---|
| AUC = P(coppia con arco batte coppia a caso) | **0,629** |
| Spearman fra peso dell'arco e vicinanza reale | **+0,087** |
| decile alto vs basso del peso | +0,631 vs +0,556 |

Il grafo ha ragione ma debolmente; il **peso** quasi non ordina. Gli archi a peso 0 non sono sbagliati:
sono **non misurati** (`northern england ↔ sheep`: peso 0, vicinanza reale **+0,740**).

Metodo, esempi e lettura: [`ricerche/07-audit-esterno.md`](../ricerche/07-audit-esterno.md).

## Da tenere

Questo diventa il **cancello strutturale** del filone, accanto a quello di prodotto (imbuto + coseno).
Teacher in cache per riuso: `.cache/movielens/teacher-Z.npz`.
