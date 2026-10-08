# 08 — I due fix: la risoluzione (falso problema) e alpha 30

**Status**: `resolved` · **Type**: `task` · **Aperto**: 08/10/2026 · **Chiuso**: 08/10/2026 · **Blocked by**: 07

## Fix 1 — la risoluzione di Leiden: **non era un problema**

Avevo scritto «i cluster sono cresciuti a 4.118 di mediana»: era la mediana dei **candidati**, non dei
**cluster**. Sul grafo ricostruito res 16 dà **276 cluster con mediana 299 titoli** — già micro-generi. Lo
sweep completo (16→256) è nel [ticket 04](04-grafo-leiden.md). Morale: **un numero senza l'oggetto che misura
non è un numero.**

## Fix 2 — l'alta cardinalità chiedeva regolarizzazione, non un modello nuovo

| feature | alpha | held-out | in-sample | gap |
|---|---|---|---|---|
| grezze | 1 | 0,479 | 0,614 | +0,135 |
| **grezze** | **30** | **0,500** | 0,581 | **+0,081** |
| righe normalizzate (solo binarie) | 1 | 0,494 | 0,582 | +0,088 |
| righe normalizzate | 30 | 0,475 | 0,499 | +0,024 |

Il modello era **sovra-adattato**, non sotto. La normalizzazione delle righe fa lo stesso lavoro di alpha
(0,494 a alpha 1) ma **non si somma** ad alpha (0,475 a alpha 30): due risposte allo stesso problema.

**Bilancio finale dello student: 0,430 → 0,479 → 0,500** (+16% relativo), con metà del gap di overfit.
Script: `fix-puntuali.py`.
