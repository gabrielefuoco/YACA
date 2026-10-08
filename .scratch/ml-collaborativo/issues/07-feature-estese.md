# 07 — Le feature che non usavamo: +11% di coseno, +26% di recall

**Status**: `resolved` · **Type**: `research` · **Aperto**: 08/10/2026 · **Chiuso**: 08/10/2026 · **Blocked by**: 03

## La domanda

Il modello sbagliava dove pensavamo? Sì e no, e la risposta ha cambiato la leva.

## Dove sbaglia lo student (held-out)

| fascia | coseno |
|---|---|
| 0-3 / 4-8 / 9-15 / 16+ keyword | 0,419 / 0,440 / 0,440 / 0,415 → **il numero di keyword conta poco** |
| pre-1980 / 1980-1999 / 2000-2014 / 2015+ | 0,466 / **0,368** / 0,414 / 0,455 |
| **poveri di voti** / medi / molto votati | **0,361** / 0,449 / 0,461 |

Il buco sono i **film poco votati** e gli **anni '80-'90**: lì è il *teacher* a essere debole (meno co-visione),
non le feature. Quel buco non si colma con un modello migliore.

## La leva trovata: le feature che non usavamo

Aggiunte lingua, persone (cast+creatori, top 3.000), franchise (top 800), budget/incassi, `content_rating`,
stagioni → held-out **0,430 → 0
