# 65 — Il catalogo serie, chiuso: 2,80× sulla testa

**Il mandato**: rifare l'ordinamento del catalogo serie coi pesi trovati dal report 64 (`CFst3 · B5`) e combinarlo con la fusione col teacher dei metadati (report 60).

**L'esito**: **il catalogo serie è chiuso.** Da 1,87% / 12,31% / 37,59% a **5,23% / 24,19% / 43,68%** — **2,80× al @10, 1,97× al @100, 1,16× al @500**. E la cosa che lo fa salire non è il modello: è il **cesto**.

Script: `ordine-serie-2.py` (685 s). Tre configurazioni, stesso split, confronto interno.

---

## 1. I tre giri

| | A) B1 CFst1 *(com'era)* | B) B5 CFst3 | **C) B5 CFst3 + fusione** |
|---|---|---|---|
| **serie nel cesto** | 80,8% | 87,2% | **89,1%** |
| **oracolo del cesto @10** | 12,19% | 12,31% | **12,33%** |
| **oracolo del cesto @100** | 37,59% | 42,75% | **43,68%** |
| attivazione @10 | 1,87% | 1,97% | **3,31%** |
| attivazione @100 | 12,31% | 15,01% | **17,40%** |
| **modello @10 (verifica)** | 5,30% | 5,15% | **5,23%** |
| **modello @100 (verifica)** | 23,17% | **24,26%** | 24,19% |
| **modello @500 (verifica)** | 37,59% | 42,75% | **43,68%** |
| modello @10 (calibrazione) | 7,54% | 7,71% | 7,21% |

**La configurazione A riproduce il report 63** (5,30 / 23,17 contro 5,27 / 23,18) ✓ — quindi i tre giri sono confrontabili.

## 2. Dove nasce il guadagno: nel cesto, non nel modello

Tre letture, e la seconda è la più importante:

**1. Il cesto diventa di serie.** La percentuale di serie nel cesto passa da **80,8% a 89,1%**. Il grafo con la co-visione a peso 5 e `CFst` a peso 3 spinge le serie in alto, e il cesto si riempie di quello che serve.

**2. Il guadagno grosso è la copertura, non l'ordine.** L'oracolo del cesto sale da 37,59% a **43,68%** al @100: **+16,2% di titoli che l'ordinamento *potrebbe* prendere**, solo migliorando il cesto. E il modello @500 va esattamente da 37,59% a 43,68% — **prende tutto quello che il cesto contiene**.

**3. La fusione raddoppia l'attivazione ma il modello non se ne accorge.** L'attivazione al @10 passa da 1,87% a **3,31%** (il +77% del report 60, confermato dentro questa pipeline). Ma il modello resta a ~5,2%: **quel segnale ce l'ha già** fra le caratteristiche (`cos_prof` è la stessa similarità dei metadati che la fusione usa). La fusione aiuta *l'attivazione*, non il modello.

**Conseguenza**: il modello prende il **42%** dell'oracolo al @10, il **55%** al @100, il **100%** al @500. **Il margine che resta è tutto nella testa**, e per prenderlo non basta migliorare il cesto.

## 3. Il quadro finale del catalogo serie

| | @10 | @100 | @500 |
|---|---|---|---|
| **attivazione, pesi vecchi** *(il punto di partenza)* | 1,87% | 12,31% | 37,59% |
| **ordinato, pesi per le serie, con la fusione** | **5,23%** | **24,19%** | **43,68%** |
| **guadagno** | **2,80×** | **1,97×** | **1,16×** |
| *oracolo dello stesso cesto* | *12,33%* | *43,68%* | *43,68%* |
| *quanto dell'oracolo si prende* | *42%* | *55%* | *100%* |

**E il catalogo serie è l'unico dei due che ha una catena completa**: cesto → pesi giusti → ordinamento. Il catalogo film ha il cesto e l'ordinamento ma **non ha i pesi suoi** (li ha uguali a prima, e il report 64 dice che B1 va bene — quindi è a posto).

## 4. La catena completa, per il prodotto

```
                 catalogo FILM                      catalogo SERIE
grafo            CF5 · CFst1 · B1 · wc0,60          CF5 · CFst3 · B5 · wc0,60
                 (4,68% @10 · 21,27% @100)          (1,92% @10 · 17,47% @100)
fusione          neutra                             +77% sulla testa
ordinamento      24,57% → 34,62% @100               12,31% → 24,19% @100
                 (modello su 1.000 utenti)          (modello su 178 utenti)
─────────────────────────────────────────────────────────────────────────
risultato        @10 5,99% · @100 29,61%            @10 5,23% · @100 24,19%
                 @500 63,35% · @2000 87,86%         @500 43,68%
```

**I due cataloghi ora sono simmetrici**, con pesature diverse e lo stesso impianto.

## 5. Limiti

- **L'adattamento del modello serie è del 30%** (calibrazione 7,21% → verifica 5,23%). Il numero da citare è quello di verifica.
- Il banco serie è **piccolo**: 356 utenti, 178 per metà. Il lato film ha 1.000 utenti di verifica; il lato serie 178. **Un modello addestrato su 178 utenti è fragile.**
- Gli utenti Trakt sono **autori di liste pubbliche**: stime ottimistiche.
- Il cesto è fisso a 500 e l'oracolo al @500 è il 100%: **il cesto non è il vincolo al @500, lo è al @10**.

## 6. Cosa resta aperto, in ordine

1. **La testa del catalogo serie**: il modello prende il 42% dell'oracolo al @10. Il margine è lì, e migliorare il cesto non basta.
2. **Più utenti per il modello serie** (178 è poco): allargare il banco Trakt, o addestrare il modello film+serie insieme.
3. **Lo split temporale** su Trakt: le date ci sono, e la domanda vera del prodotto è «cosa guarderò dopo».
4. **I titoli nuovi**: si collegano dodici volte peggio, e l'unico rimedio misurato (+0,31) non basta.
