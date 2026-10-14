# 04 — Lo snapshot globale a T_cut

**Status**: `resolved` · **Type**: `prototype` · **Blocked by**: 03 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/04-snapshot.md) · ⚠️ **i due livelli DIVERGONO, e la divergenza ribalta il ticket 03**: il grafo ricostruito sul solo passato (T_cut = 75° percentile = **2019-02-23**) va **peggio** del grafo completo mascherato — **−0,16 / −1,59 / −3,34 / −5,42** su 230 utenti con oro dopo il taglio. Quindi **la conoscenza del futuro AIUTA e i numeri temporali sono ottimistici**: la premessa con cui la fase è nata regge. Non è una contraddizione col 03: il livello 1 toglie la capacità dei titoli freschi di *fare da ponte* (e aiuta), il livello 2 toglie **un terzo degli archi** (e peggiora). ⚠️ **Il confondente che impedisce la conclusione netta**: il grafo a T_cut copre **29.854 film contro 49.041**, e il −5,42 al @2000 è in parte copertura e in parte futuro, e questo esperimento non li separa.

## What to build

**Una sola** data di taglio globale (il 75° percentile dei timestamp del banco comportamentale),
**una sola** ricostruzione dello spazio del comportamento dalle interazioni precedenti, e la
validazione degli utenti successivi a quella data.

Un solo build, zero rifacimenti: è l'alternativa costosa ma esatta al mascheramento del ticket 03.

## Acceptance criteria

- [ ] **un solo** rebuild produce lo spazio, con copertura sul catalogo dichiarata
- [ ] gli utenti dopo T_cut sono validati, e i numeri sono confrontati con quelli del mascheramento (03)
- [ ] la domanda a cui risponde è esplicita: **i due livelli concordano in direzione?**
- [ ] una divergenza fra i due livelli è **riportata**, non lisciata
- [ ] il costo è dichiarato (tempo di build, spazio su disco) e confrontato col mascheramento istantaneo

## Da dove nasce

Il grafo conosce il futuro (buco 1 dell'handoff). La struttura di co-visione fra titoli usciti da più di
due anni è stazionaria — ricostruirla non cambia quasi nulla. Il leakage sta nei titoli usciti intorno o
dopo il taglio, che oggi portano già migliaia di archi accumulati dopo.
