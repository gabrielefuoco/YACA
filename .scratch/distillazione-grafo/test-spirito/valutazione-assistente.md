# Valutazione dell’assistente — test cieco sul “tono”

## Criterio

`2` = forte affinità di tono/sensibilità/stile o esperienza emotiva; `1` = affinità parziale; `0` = non basta una somiglianza di genere, trama o argomento. Sono giudizi di un modello, non preferenze personali né gold standard umano.

## Giudizi

### Barbie

| Candidato | Voto |
|---|---:|
| Glass Onion - Knives Out | 1 |
| Everything Everywhere All at Once | 2 |
| Encanto | 1 |
| Oppenheimer | 0 |
| Il gatto con gli stivali 2 - L'ultimo desiderio | 1 |
| Wonka | 1 |
| Super Mario Bros. Il Film | 0 |
| Spider-Man: Across the Spider-Verse | 1 |
| Soul | 1 |
| Dungeons & Dragons - L'onore dei ladri | 0 |

### Povere creature!

| Candidato | Voto |
|---|---:|
| Anora | 1 |
| Il piacere è tutto mio | 2 |
| Triangle of Sadness | 2 |
| The Substance | 2 |
| Babygirl | 1 |
| Gli spiriti dell'isola | 1 |
| Past Lives | 1 |
| Kinds of Kindness | 2 |

### Everything Everywhere All at Once

| Candidato | Voto |
|---|---:|
| Beau ha paura | 2 |
| Shang-Chi e la leggenda dei dieci anelli | 0 |
| Causeway | 0 |
| Past Lives | 1 |
| Spider-Man: No Way Home | 1 |
| Triangle of Sadness | 1 |
| The Whale | 0 |
| Dune | 0 |

### Josie and the Pussycats

| Candidato | Voto |
|---|---:|
| Borat - Seguito di film cinema | 1 |
| Giovani, pazzi e svitati | 1 |
| Rock Star | 1 |
| Ragazze nel pallone | 2 |
| Le avventure di Joe Dirt | 0 |
| Non è un'altra stupida commedia americana | 2 |
| Assatanata | 1 |
| Lungo la valle delle bambole | 2 |
| 2gether | 2 |
| Crossroads - Le strade della vita | 1 |

### Drive

| Candidato | Voto |
|---|---:|
| Django Unchained | 0 |
| Sicario | 1 |
| Shutter Island | 1 |
| Birdman o (L'imprevedibile virtù dell'ignoranza) | 1 |
| Lo sciacallo - Nightcrawler | 2 |
| Heat - La sfida | 1 |
| Come un tuono | 2 |
| L'amore bugiardo - Gone Girl | 1 |
| Baby Driver - Il genio della fuga | 1 |
| Whiplash | 1 |
| Revenant - Redivivo | 0 |

### Parasite

| Candidato | Voto |
|---|---:|
| Okja | 2 |
| Moonlight | 1 |
| The Host | 2 |
| Diamanti grezzi | 1 |
| Joker | 1 |
| Train to Busan | 1 |
| No Other Choice - Non c'è altra scelta | 2 |
| Scappa - Get Out | 2 |
| C'era una volta a… Hollywood | 1 |

### The Truman Show

| Candidato | Voto |
|---|---:|
| Il miglio verde | 0 |
| Prova a prendermi | 1 |
| A Beautiful Mind | 1 |
| The Sixth Sense - Il sesto senso | 1 |
| Will Hunting - Genio ribelle | 1 |
| Fight Club | 2 |
| Se mi lasci ti cancello | 2 |
| Ricomincio da capo | 2 |

### Lady Bird

| Candidato | Voto |
|---|---:|
| La rivincita delle sfigate | 2 |
| Chiamami col tuo nome | 1 |
| Moonlight | 1 |
| Piccole donne | 2 |
| 17 anni (e come uscirne vivi) | 2 |
| Un sogno chiamato Florida | 2 |
| Eighth Grade - Terza Media | 2 |
| Manchester by the Sea | 1 |

## Risultato sui ranking

Usando questi voti, nDCG@5 (media macro sugli 8 seed):

| Seed | V18 | V18 + KWLAT 2 | Δ |
|---|---:|---:|---:|
| Barbie | 0,851 | 0,851 | 0,000 |
| Povere creature! | 0,816 | 0,816 | 0,000 |
| Everything Everywhere All at Once | 0,422 | 0,422 | 0,000 |
| Josie and the Pussycats | 0,865 | 1,000 | +0,135 |
| Drive | 0,597 | 0,599 | +0,002 |
| Parasite | 0,833 | 0,865 | +0,032 |
| The Truman Show | 0,553 | 0,584 | +0,031 |
| Lady Bird | 0,913 | 0,913 | 0,000 |
| **Media macro** | **0,731** | **0,756** | **+0,025** |

È una valutazione piccola e soggettiva, non una prova statistica: +KWLAT migliora 4 seed, pareggia 4, non ne peggiora nessuno secondo questi voti. Il miglioramento è concentrato in Josie, Parasite e Truman Show; **Barbie non migliora**. Per Barbie l’unico `2` che ho assegnato è EEAAO, che resta in alto in entrambe le versioni; KWLat sostituisce/riordina soprattutto titoli che ho valutato `1`.

## Limite importante

Non è un vero giudizio cieco: la conversazione aveva già mostrato parte delle liste di Barbie, Drive e Parasite. Ho dato i voti prima di aprire la chiave degli ID e dei ranghi del questionario, ma conoscevo già alcuni risultati. Non userei questi numeri per fissare pesi o dichiarare vincitore un grafo; servono come lettura esplorativa. I voti completi sono in `valutazioni-assistente.json` e la chiave dei ranghi rimane in `chiave-valutazione.json`.
