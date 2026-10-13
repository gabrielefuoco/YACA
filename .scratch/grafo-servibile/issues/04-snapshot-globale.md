# 04 — Lo snapshot globale a T_cut

**Status**: `ready-for-agent` · **Type**: `prototype` · **Blocked by**: 03

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
