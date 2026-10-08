# 12 — Le raccomandazioni TMDB predicono la co-visione? Sì, ma sono un proxy debole

**Data**: 08/10/2026 · **Script**: `audit-tmdb-recs.py` · 4.995 film, teacher de-leakato

## Perché questa misura

Il grafo originale è **linguistico**, non comportamentale: 40% co-occorrenza di keyword nel catalogo +
**60% somiglianza fra le *parole* secondo un transformer** (`bge-small-en-v1.5`), soglia 0,75, Leiden a
res 150. Nessuna raccomandazione TMDB. È la spiegazione del ρ = +0,087 dell'audit.

Il catalogo ha la colonna `recommendations` (10 simili per titolo, id nudi) **popolata al 100% su film
e serie**, mai usata da `src/`. Il teacher copre le serie **allo 0%** e sono l'80% delle cronologie
reali: le raccomandazioni sono l'unico segnale comportamentale disponibile lì.

**Ma si guadagnano il diritto di essere usate solo se, sui film (dove il teacher c'è), predicono la
co-visione.** Questa è quella misura.

## I numeri

| | coseno collaborativo |
|---|---|
| **raccomandazioni TMDB** | **+0,181** (mediana +0,154) |
| controllo **appaiato per popolarità** | +0,046 (mediana +0,036) |
| **vicini collaborativi veri** (riferimento alto) | **+0,845** |

- **AUC = P(raccomandazione batte controllo appaiato) = 0,768** (0,500 = inutile)
- **precision@10 contro i top-100 collaborativi: 3,6%** contro **0,20%** del caso → **18 volte il caso**
- popolarità: sorgente 61 voti mediani, raccomandati **265** → TMDB raccomanda titoli **più popolari**
  della sorgente (ecco perché il controllo è appaiato: senza, si misurerebbe la popolarità)

## La lettura

1. **Portano segnale comportamentale vero**: AUC 0,768 contro un controllo appaiato e 18× il caso.
   Non sono rumore, non sono metadati travestiti.
2. **Ma sono un proxy debole**: sul coseno stanno al **17%** del percorso fra il controllo (0,046) e il
   massimo chiedibile (0,845). La co-visione reale dice **4,7 volte** di più.
3. **Quindi la gerarchia è quella che l'utente aveva intuito**: la co-visione resta la fonte primaria;
   le raccomandazioni servono **dove il teacher è cieco** — serie e uscite recenti — e come *feature*
   aggiuntiva nel modello appreso.

## Conseguenze operative

1. **Sulle serie** (ticket 12, il buco più grosso): un segnale a 18× il caso è enormemente meglio di
   niente, ed è l'unico disponibile. Da usare, dichiarando che è un proxy debole.
2. **Sui film**: come **feature** nell'adiacenza appresa ([18](issues/18-adiacenza-appresa.md)) —
   aggiunge un canale comportamentale dove la co-occorrenza di keyword è cieca. L'AUC dell'adiacenza
   appresa (0,699) potrebbe salire.
3. **Da non fare**: sostituire il teacher. È 4,7 volte più debole e opaco.

## Cautele dichiarate

- **Opacità**: output di un algoritmo proprietario, già fuso. Non sappiamo quanto sia comportamento e
  quanto metadato — ed è esattamente ciò che questa misura ha quantificato.
- **Circolarità residua**: se le raccomandazioni sono in parte guidate dai metadati, usarle per un grafo
  di metadati resta in parte auto-referenziale.
- **Cap a 10**: 1,17M coppie su 117k titoli: segnale sparso.
