# 13 — `L1_adjacency`: il segnale laterale del grafo vecchio è morto in produzione

**Status**: `ready-for-human` · **Type**: `research` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno
**Verificato**: 08/10/2026, con tre prove indipendenti (sotto)

## Il fatto (non un sospetto: verificato)

| prova | esito |
|---|---|
| Il codice **legge** `L1_adjacency` | `HierarchicalGraph.js:117`: `const adj = this.data.L1_adjacency?.[l1Id]` |
| Il JSON di produzione **non la contiene** | 7 chiavi: `metadata, kw_to_L1, L1, L2, L3, L4, L5` — l'adiacenza non c'è |
| Il builder **la scrive** | `offline_graph_builder/build_graph.py:512`: `"L1_adjacency": final_adjacency_l1` |

E l'`?.` non lancia e non logga: **`undefined`, zero errori**. Il meccanismo è morto senza che nessuno se ne
accorgesse.

## Quanto valeva il pezzo morto

Il vettore di una keyword, coi pesi veri del codice, pesa **3,66** (L0 = 2, L1 = 1, L2 = 0,5, L3 = 0,1,
L4 = 0,05, L5 = 0,01). La diffusione orizzontale aggiungeva fino a **+0,6 per ciascuno dei 10 micro-cluster
vicini** → **+90% / +164%** di massa, e **tutta orizzontale**:

> **Senza di essa, due keyword che stanno in micro-cluster *vicini* (non lo stesso) hanno coseno 0.**

Conseguenza sulla struttura: il "grafo a più livelli" oggi è **solo una gerarchia verticale** —
L0 54,8% · L1 27,4% · L2 13,5% · L3 2,7% · L4 1,3% · L5 **0,3%**. Coerente con quanto già misurato in
`livello-latente`: la gerarchia si connette per il 91% degli item ma pesa una mediana dello 0,1% del punteggio.

## Perché conta per il filone del grafo nuovo

**Il termine di paragone di tutte le misure dell'imbuto è il grafo vecchio con il segnale laterale spento.**
Riaccenderlo costa quasi zero (rigenerare la chiave) e va fatto **prima** di dichiarare che il grafo nuovo
vince: altrimenti si confronta un grafo completo contro uno mutilato.

## Cosa fare

1. Rigenerare `hierarchical_graph.json` includendo `L1_adjacency` (o iniettarla come già si fa per la mappa
   id→nome, che è la via a costo zero e già collaudata).
2. **Misurare l'effetto**: il DNA e l'imbuto con e senza diffusione, a parità di tutto il resto.
3. **Tocca `src/` e la produzione** → decisione esplicita dell'utente.
