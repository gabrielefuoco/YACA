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

---

## Misura (08/10/2026) — ricostruita, iniettata, misurata

Report completo: [`ricerche/06-misura-diffusione-l1.md`](../ricerche/06-misura-diffusione-l1.md).

**Ricostruzione** (`rebuild-l1-adjacency.py`, regola del builder: PPMI → archi fra cluster → top-50):
**70.821 archi**, 1.381 cluster su 1.382 hanno vicini, sanità semantica confermata
(`racing → car 26,6 · victory · motorcycle`). Il builder usava la *sua* PPMI fusa: questa è una
ricostruzione dalla definizione classica, non l'originale (che non esiste più in nessuna cache).

**Misura** (75 trial, 5 profili reali, scorer di produzione, iniezione via `L1_ADJ=`):

| braccio | @50 A→B | @200 A→B | solo popolarità | caso |
|---|---|---|---|---|
| **graph 2 hop** (candidati fissi) | 5,9 → 5,9 | 8,7 → **9,2** | **4,9 → 4,9** | 2,8 → 3,5 |
| POOL VERO | 1,9 → 1,9 | 4,2 → 4,9 | 0,9 → 0,9 | 2,8 → 3,5 |

**Lettura**: sul braccio a candidati **fissi** il controllo popolarità resta fermo e lo scorer sale
→ contributo marginale **3,8 → 4,3 (+13%)**, tutto in profondità (@50 fermo). Sul POOL VERO il
numero sale ma **sale anche il controllo casuale**: la diffusione cambia i semi, quindi cambia il
pool — **non attribuibile**.

**Verdetto**: riaccenderlo è una decisione a sé — costo ~zero, rischio ~zero, guadagno **piccolo e
solo in profondità**. Non è una vittoria, e il guadagno grande apparente non è suo.

**Manca il test pulito**: pool fissato dai due run (esportare anche il pool vero in
`export-graph-candidates.py` e leggerlo dal file) → la differenza sarebbe *solo* della diffusione.
