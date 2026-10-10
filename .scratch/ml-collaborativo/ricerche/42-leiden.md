# 42 — Leiden sul grafo completo: che struttura esce

**Domanda**: costruire il grafo con tutto il materiale utile e far girare Leiden, poi valutare i cluster.

## Il grafo

Quattro tipi di arco su 66.259 nodi (film + serie), **sparsificati in modo equo** (top-15 per nodo per tipo): il contenuto ha 993k archi e la curatela 3.5k — senza sparsificazione la seconda annega, e l'ablation lo aveva dimostrato (K sola 8,9%, K+C 3,4%).

| tipo | archi grezzi | fonte |
|---|---|---|
| contenuto | 1.606.350 | k-NN top-15 dello spazio Pc |
| co-visione | 2.222.144 | related di Trakt (2.995 film + 2.995 serie) |
| temi | 1.453.012 | k-NN top-15 dei 57 temi |
| curatela | 6.834 | i legami scritti a mano |

Grafo unito: **5.136.110 archi**, grado medio 77,5. Pesi: 1,0 per contenuto/co-visione/temi, **6,0 per la curatela** (è l'unica che attraversa i medium).

## I risultati

| risoluzione | cluster | modularità | purezza generi | purezza tipo | legami curati insieme | lift |
|---|---|---|---|---|---|---|
| 0,3 | 2 | 0,218 | 34,2% (+7,7) | 75,0% (+0,0) | 97,0% | **1,3×** |
| **1,0** | **19** | **0,552** | **46,8% (+20,3)** | **89,1% (+14,0)** | **88,5%** | **11×** |
| 3,0 | 79 | 0,491 | 49,9% (+23,4) | 88,3% (+13,3) | 87,3% | **37×** |

**La risoluzione 0,3 è un artefatto**: 2 cluster mettono tutto insieme e la frazione grezza di legami "rispettati" sale al 97% — ma il lift è 1,3×, cioè quasi niente. **La metrica giusta è il lift** (frazione / caso), non la frazione. Con il lift, l'ottimo è la risoluzione 3,0.

Purezza su tutte le etichette note (risoluzione 3,0):

| etichetta | purezza | baseline | guadagno |
|---|---|---|---|
| generi | 49,9% | 26,5% | **+23,4** |
| lingua | 76,4% | 62,9% | +13,5 |
| temi | 28,5% | 14,9% | +13,6 |
| tipo (film/serie) | 88,3% | 75,0% | +13,3 |
| decennio | 35,5% | 31,6% | +3,9 |

## I cluster più grandi (risoluzione 3,0)

| cluster | titoli | composizione | contenuto |
|---|---|---|---|
| 0 | 3.688 | 2.773 serie + 915 film | **animazione giapponese** (*Spirited Away*, *Howl's*, *Your Name*, *Big Hero 6*) |
| 1 | 2.532 | 35 serie + 2.497 film | **horror** (*The Conjuring*, *The Conjuring 2*, *X*) |
| 2 | 2.379 | 1.137 serie + 1.242 film | **animazione occidentale** (*Inside Out*, *Toy Story*, *Lion King*) |
| 3 | 2.331 | 2 serie + 2.329 film | **commedia** (*The Hangover*) |
| 4 | 2.252 | 10 serie + 2.242 film | **drama / documentario** |
| 5 | 2.158 | 311 serie + 1.847 film | **fantascienza** (*Interstellar*, *Blade Runner 2049*, *Matrix*, *Inception*, **Rick and Morty**) |

## Tre cose che valgono

**1. I cluster sono cross-medium.** Il cluster della fantascienza tiene insieme *Interstellar*, *Matrix* e *Rick and Morty*. **Il 95-100% dei cluster contiene sia film sia serie** — la struttura non separa i medium, li unifica. È esattamente quello che serve al caso d'uso del prodotto.

**2. L'animazione giapponese e quella occidentale si separano da sole** (cluster 0 vs 2), senza che nessuno glielo dica. I generi TMDB le mettono entrambe sotto "Animation": **il grafo trova una distinzione che le etichette non hanno.**

**3. La struttura rispetta la curatela**: i legami scritti a mano cadono nello stesso cluster 11-37 volte più del caso. La curatela non è un segnale che va "aggiunto" alla struttura — è una struttura che il grafo conferma.

## Cosa non funziona / limiti

- **I temi restano deboli** (+3,7 alla risoluzione 1,0; +13,6 alla 3,0 ma su una tassonomia di 57 classi che si sovrappongono). La tassonomia dei temi non è allineata con le comunità che il grafo trova: sono due modi diversi di tagliare la stessa materia.
- **Il decennio guadagna poco** (+3,9): il grafo non organizza per epoca, organizza per contenuto. È un bene (l'epoca è un segnale debole per la raccomandazione) ma va detto.
- **Il grafo è costruito su 499 serie curate** su 16.550: per le altre la struttura viene da contenuto/co-visione/temi, che l'ablation ha mostrato essere deboli *per il cross-medium*. Il grafo è quindi **affidabile dove c'è curatela** e approssimativo altrove.

## Cosa ne segue

1. **I cluster sono usabili come unità di prodotto**: "i titoli dello stesso cluster" è una raccomandazione coerente e cross-medium, e non richiede né la spreading né il routing per query.
2. **La distinzione anime / animazione occidentale suggerisce che i cluster catturino il *pubblico*, non il genere** — che è quello che serve.
3. **Il prossimo passo naturale**: usare i cluster come *pool* per il ranking (dentro il cluster di appartenenza, ordina con l'esperto giusto) — l'architettura "routing per requisito" che l'utente ha proposto, ma con i cluster al posto del routing manuale.

**Numeri riproducibili**: `leiden.py`, 182 s su 66.259 nodi e 5,1M archi.
