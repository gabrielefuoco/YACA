# 11 — La gerarchia a tre livelli

**Status**: `resolved` · **Type**: `prototype` · **Blocked by**: 09 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/11-gerarchia.md) · ❌ **L1 a 25-35 macro-mondi è IMPOSSIBILE, e la causa è il ticket 09**: il grafo sparsificato ha **117 componenti connesse**, quindi qualunque partizione ha almeno 117 gruppi — non è una questione di risoluzione. L1 esce a 133 gruppi con mediana **1 bolla**. ✅ L2 esce a **261 costellazioni** con una mediana di 25 bolle (leggermente sotto l'intervallo 300-400, dichiarato). **I due ticket sono in conflitto e il conflitto è misurato**: la sparsificazione (09) frammenta la mappa, la gerarchia (11) la richiede connessa. Il k-NN **mutuo** con k=8 taglia proprio i ponti fra i grappoli. Serve una **garanzia di connettività** (albero di copertura sui ponti) prima di costruire la mappa (ticket 12-13).

## What to build

5.297 bolle piatte non sono una mappa: sono un elenco. Sopra le bolle si costruisce una gerarchia a
**tre livelli**, partendo dal grafo delle bolle già sparsificato.

- **L1 — macro-mondi (~25-35)**: l'ingresso a freddo, la vista d'insieme.
- **L2 — costellazioni (~300-400)**: cataloghi tematici dinamici, il livello che sostituisce la vecchia
  struttura gerarchica.
- **L3 — le bolle atomiche (le attuali 5.297)**: dove avviene la raccomandazione fine.

**Non** un embedding a due dimensioni: le bolle si legano lungo **sei assi** (autore, scuola, lingua,
genere, epoca, franchise) e proiettarli in un piano produce strappi topologici e false adiacenze al
centro della mappa.

## Acceptance criteria

- [ ] L1 ha 25-35 macro-mondi e **ognuno ha un filo nominabile** — letto e dichiarato
- [ ] L2 ha ~300-400 costellazioni e un campione è letto
- [ ] ogni bolla finisce in **esattamente** un L2 e un L1 (nessun orfano)
- [ ] la gerarchia è un **aiuto alla navigazione**, non un rimpiazzo: le bolle atomiche restano indirizzabili da sole
- [ ] il costo di costruzione è dichiarato
- [ ] il confronto con la vecchia gerarchia ad albero è **riportato** (non è un obiettivo, è un'informazione): la vecchia era gerarchica e costruita sul grafo contaminato, e sapere quanto si guadagna vale una riga

## Cautela dichiarata

Il numero di macro-mondi non è un risultato: è una conseguenza della risoluzione scelta. Se vengono 60
mondi invece di 30, la lettura dirà se sono mondi o se sono bolle un po' più grandi.
