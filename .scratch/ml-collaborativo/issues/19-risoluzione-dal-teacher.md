# 19 — Le scelte del grafo decise dal teacher, non a mano

**Status**: `wontfix` · **Type**: `prototype` · **Aperto**: 08/10/2026 · **Blocked by**: 17 (fatto)

## Il problema

Le manopole del grafo sono state scelte **a occhio**:

| manopola | valore attuale | criterio con cui è stato scelto |
|---|---|---|
| risoluzione Leiden | 16 (276 cluster, mediana 299) | «sembra un micro-genere» |
| livello di aggregazione dell'adiacenza | L1 | come il builder |
| cap dei vicini | 50 | come il builder |

## L'idea

Con l'audit esterno (ticket 17) queste scelte diventano **misurabili**: si spazza la risoluzione
(8, 16, 32, 64, 128) e per ognuna si misura l'AUC collaborativa dell'adiacenza. La risoluzione giusta è
quella che **predice meglio la co-visione reale**, non quella che sembra più bella.

Lo stesso vale per il livello di aggregazione (L1 vs L2 vs keyword grezze): oggi è un'eredità  una decisione.

## Cancelli

1. La curva AUC-per-risoluzione deve avere un massimo **netto** (se è piatta, la manopola non conta e va detto).
2. Il numero di cluster scelto deve restare compatibile con l'uso previsto (micro-generi, non macro-generi).
3. Ogni scelta va registrata nella mappa con il numero che l'ha determinata — è la regola del filone.

## Chiusura

Chiuso con la mappa il 10/11/2026, per decisione esplicita. La mappa era già chiusa come ricerca il 13/10/2026 e l'esito è nel V45 servito oggi; i ticket rimasti erano la coda da «passare in rassegna». Restano scritti qui: se una domanda tornerà utile, si riparte da questo testo invece che da zero.
