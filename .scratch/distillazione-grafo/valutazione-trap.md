# Trap set — valutazione anti-eco del rrfstudent

**Data**: 25 ottobre 2026 · **Modello**: `rrfstudent` (block, masse b11, target RRF misto yc/beh)
**Trap set**: 50 titoli in 5 categorie, con `known-bad` (2-3 titoli da non mettere) e `known-good` (3-5 titoli giusti), compilati a mano e risolti sul canone. 32 nomi non trovati nel canone (titoli mancanti o con altro titolo): le liste sono state ridotte a quelli risolvibili.

## Risultati

| categoria | cont@5 | cont@10 | hit@10 | n |
|---|---:|---:|---:|---:|
| **brand_trap** | **0,60** | **0,80** | 0,35 | 10 |
| **franchise** | **0,60** | **0,70** | 0,47 | 10 |
| literal_title | 0,20 | 0,40 | 0,23 | 10 |
| event | 0,10 | 0,30 | 0,42 | 10 |
| cold_autoriale | 0,10 | 0,20 | 0,71 | 10 |

`cont@k` = quota di known-bad nei primi k; `hit@10` = quota di known-good nei primi 10.

## Lettura

**Il difetto del brand non è risolto: è strutturale.** Nel brand_trap l'80% dei primi 10 è «known-bad» — i sequel e gli spin-off: Jumanji 2, Toy Story 2/3/4, Ice Age 2/3/4, Lego Batman. Nel franchise il 70%: Il padrino Parte III, Matrix Resurrections, Terminator Genisys, Jurassic Park III. Il modello **premia la continuazione del franchise** invece del film simile, esattamente come faceva b10.

**Dove il contenuto è ricco, va bene**: cold_autoriale hit@10 0,71 (i film d'autore giusti), event 0,42. Il letterale resta debole (0,23).

Il pattern è lo stesso della lettura a occhio:
- Barbie «risolta»? Sì per i cartoni, ma **Toy Story → TS2/TS3/TS4** e **Jumanji → Jumanji 2** sono lo stesso errore;
- la firma del brand è nel **metadato collection** (`cl:`) e nel **titolo**, che il content encoder vede;
- il target RRF, per i franchise, **contiene** i sequel (perché la Yc li mette vicini: chi guarda Toy Story guarda TS2), quindi il modello li impara come «giusti».

**La causa profonda**: la co-visione **non distingue** il sequel dal simile. Chi guarda Toy Story guarda TS2: è il comportamento reale. Il «known-bad» è un giudizio **semantico**, non comportamentale. Quindi il modello è **fedele al target** e **sbagliato** secondo il criterio di qualità.

## Cosa significa per il prodotto

1. Il trap set va usato come **gate**, e oggi lo **boccia** su brand e franchise.
2. La correzione non è nel modello: è **nel target o nel rerank**. Il rerank con Yc **peggiorerebbe** il brand (la Yc premia i sequel). Servirebbe un **rerank che penalizza la collection condivisa** (un anti-eco esplicito), oppure un target che escluda i sequel dalla lista.
3. Il `cl:` (collection) è il colpevole misurabile: due titoli con lo stesso `cl:` non devono essere vicini se non sono lo stesso film.

## Prossimo passo proposto

Un **rerank anti-collection**: `score = cos − β·[stessa collection]` (con β≈0,2), da provare sui 20 film + trap set. Costa 10 minuti, non richiede training, e attacca esattamente il difetto misurato. Se il cont@10 del brand_trap scende sotto 0,2 senza rovinare hit@10, il gate è superato.

---

# Aggiornamento — rerank Yc + cap 1/collection

Il trap set è stato rimisurato con il rerank Yc (score = cos + 0,3·Yc) e con il **cap a 1 titolo per collection**.

| categoria | base (cont@5/10) | +rerank | **+rerank+cap** | esito |
|---|---|---|---|---|
| brand_trap | 0,60 / 0,80 | 0,40 / 0,40 | **0,20 / 0,20** | ✅ |
| franchise | 0,60 / 0,70 | 0,20 / 0,30 | **0,10 / 0,10** | ✅ |
| literal_title | 0,20 / 0,40 | 0,00 / 0,00 | **0,00 / 0,00** | ✅ |
| cold_autoriale | 0,10 / 0,20 | 0,10 / 0,10 | **0,10 / 0,10** | ✅ |
| event | 0,10 / 0,30 | 0,30 / 0,40 | **0,30 / 0,40** | ❌ |

**4 categorie su 5 passano.** Il brand scende da 0,80 a 0,20 (il cap toglie i sequel ridondanti), il franchise da 0,70 a 0,10, il letterale a 0. Il rerank **da solo** peggiora l'event (0,30→0,40) perché la Yc mette vicini i film dello stesso evento (i Chernobyl); il cap non lo corregge perché non sono una collection TMDB.

## La ricetta finale

**rrfstudent + rerank Yc (λ=0,3) + cap 1/collection.**
- comportamento dove c'è (Yc);
- similarità dove manca (contenuto);
- un solo titolo per saga (cap).
- Event: resta il punto debole (i documentari sullo stesso evento). Servirebbe un anti-event esplicito, non una collection.

## Nota sul metodo

Il cap è superiore alla penalità (β=0,2) e alla versione condizionale: quelle abbassano troppo il seguito quando è la risposta (Alien→Aliens 5°, Inception→Batman sparito). Il cap toglie solo la **ridondanza** e lascia il seguito migliore al suo posto.
