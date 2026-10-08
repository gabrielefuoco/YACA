# 04 — Il grafo: k-NN + Leiden, e la prova che è *diverso*

**Status**: `resolved` · **Type**: `task` · **Aperto**: 08/10/2026 · **Chiuso**: 08/10/2026 · **Blocked by**: 03

## Cosa è stato fatto

Proiezione dello student su **tutti** i titoli (film, serie, uscite nuove, anime — anche dove il teacher non
arriva), k-NN, Leiden. Output `film-graph.npz`: **87.848 nodi · 897.020 archi · 276 cluster** (res 16).

## Il cancello: i cluster sono diversi da quelli che già abbiamo?

**Sì, e nettamente**: confronto coi topoi L2 della gerarchia → **ARI 0,042 · NMI 0,237**. Se fossero stati gli
stessi cluster, il grafo nuovo non serviva (bastava quello delle keyword): non lo sono.

## Struttura

| res | cluster | mediana | max | modularità | coerenza |
|---|---|---|---|---|---|
| **16** | **276** | **299** | 1.222 | 0,696 | 0,618 |
| 64 | 899 | 94 | 334 | 0,573 | 0,676 |
| 256 | 3.217 | 24 | 105 | 0,434 | 0,736 |

Res 16 è già micro-genere (299 titoli di mediana). La manopola esiste se serve più fine.
