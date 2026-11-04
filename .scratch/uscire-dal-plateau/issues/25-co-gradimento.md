Status: resolved
Type: task

# Co-gradimento (MovieLens 32M): amare non è vedere — e peggiora

## Perché

COVISION conta la *presenza*: chi ha visto entrambi. MovieLens 32M ha **32 milioni di voti con il
valore**: due film amati (>= 4,5) dalla stessa persona sono un segnale di gusto, non di esposizione. È
l'unica dimensione comportamentale che non avevamo mai usato, e non richiede etichette né modelli.

## Cosa è stato fatto

`services/graph_dense/amore.py`: 53.286 film MovieLens mappati sul canone via `links.csv`;
**7.511.942 voti >= 4,5**, 198.605 utenti, 33.554 film amati. NPMI × log1p(coppie), top-100.
**3.236.946 archi · 43,9% di copertura.**

## Le righe grezze sono buone, e su un caso sono ottime

*Drive*: *Nightcrawler · Non è un paese per vecchi · Il petroliere · Blade Runner 2049 · Sicario · Mad
Max* — un vicinato di **gusto**, non di esposizione.
*Povere creature!*: *Bottoms · Happy Hour · La casa lobo · Rinascita* — cinema d'autore laterale.

## Ma nel grafo peggiora, e in modo significativo

| | R@5 | R@10 | R@20 | MRR | >5k |
|---|---:|---:|---:|---:|---:|
| V23 | 0,008 | 0,017 | **0,043** | 0,0083 | 66,5% |
| V29 (+ AMORE 1,0) | 0,008 | 0,017 | 0,033 | 0,0080 | **76,1%** |

`ΔR@20 = −0,0095 [−0,0161, −0,0039]`, **sopra l'MDE**: significativamente peggiore.

**La causa è strutturale**: il gradimento amplifica la popolarità — tutti amano i film famosi, quindi
«amati insieme» concentra sui famosi (76,1% di blockbuster). L'esposizione, che è più rumorosa,
almeno include chi guarda di nicchia. È il contrario dell'intuizione di partenza.
