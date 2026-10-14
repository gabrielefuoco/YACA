# Ticket 03 — gli archi strutturali e il gating

Script: `03-archi.py`. Esito: **la via strutturale NON è pronta**, e va detto con precisione.

## Cosa succede

Per Verity, i 30 archi strutturali più forti (similarità coseno sulle colonne non numeriche di FX,
con l'IDF congelato) sono:

> Wiñaypacha (0,51) · Tu man nieko neprimeni · Nit i dia · I Am Still Here · Gangnam B-Side ·
> High Country · I tuttofare · House of Good and Evil · Città delle ombre · Da Belfast al paradiso ·
> The Suspect · Scarpetta · 종이달 · Rebus · Lazarus di Harlan Coben · The Secrets She Keeps · …

E le due vie **non concordano**: la proiezione manda Verity nella bolla **632** (*Gone Girl*,
*The Guilty*), la via strutturale in un insieme di bolle **completamente diverso** (2, 174, 255, 353,
464, 646, …). **Nessuna in comune.**

## I due difetti

1. **Il medium non è rispettato.** Gli archi strutturali di un film finiscono su **serie TV** —
   *Scarpetta*, *Rebus*, *The Suspect*, *Harlan Coben* sono serie. Il prodotto ha **due cataloghi
   separati**: un film non può essere collocato tra le serie. La via strutturale mescola, la
   proiezione no (i suoi vicini sono tutti film).
2. **La similarità è dominata dalle colonne generiche.** Con la matrice grezza dava **0,86 con
   tutto** — i primi 30 archi erano talk show e reality (*Chopped*, *Top Chef*, *Big Brother*).
   Con la TF-IDF scende a 0,39-0,51 e diventa leggibile, ma resta poco discriminante: un film
   peruviano con 0,51 è l'arco più forte con un thriller americano.

## Il gating, e perché non protegge

`λ(i) = τ0/(τ0 + d_behav(i))` con `τ0 = 5`: un titolo nuovo ha `d_behav = 0`, quindi **λ = 1** e
**tutti** i suoi archi strutturali passano. È il caso limite che il ticket 16 di `grafo-servibile`
prevedeva, e significa che per un titolo appena uscito **il gating è un no-op**: la protezione non è
nell'arco singolo (il difetto D4 del ticket 02 è escluso: la proiezione non è influenzata dall'arco
più forte) ma nel **numero** di archi.

## Cosa serve per renderla pronta

1. **Il vincolo di medium** prima di tutto: gli archi di un film verso i soli film, di una serie
   verso le sole serie.
2. **Una soglia molto più alta**, o un numero fisso di archi (3-5), non 30: con 30 archi un titolo
   nuovo porta 30 legami deboli e trascina la sua bolla verso il centro del catalogo.
3. **La coerenza con la proiezione**: se l'arco strutturale più forte punta a una bolla lontana da
   quella votata dalla proiezione, quell'arco va scartato. La proiezione, su 600 titoli, ha
   sbagliato il quartiere **0 volte su 600**; la via strutturale non ha ancora una misura.
