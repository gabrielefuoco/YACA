# 11 — La gerarchia a tre livelli

**Status**: `ready-for-agent` · **Type**: `prototype` · **Blocked by**: 09

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
