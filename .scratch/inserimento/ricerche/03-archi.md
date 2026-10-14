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

---

# 03-bis — l'obiezione: le serie possono usare i FILM come appoggio?

L'utente ha messo in dubbio il vincolo di medium, e ha ragione a farlo: **il vincolo serve alla
consegna** (Stremio ha due cataloghi separati), **non necessariamente alla collocazione**. Se i film
fanno da impalcatura a una serie nuova, il vincolo va spostato dal posto sbagliato a quello giusto.

Misurato sulla mappa V7 (`03-bis-appoggio.py`):

| | |
|---|---|
| bolle con >= 5 titoli | 1.511 |
| a maggioranza **serie** | **349** (13.778 serie) |
| a maggioranza **film** | 1.162 (46.979 film) |
| **bolle-serie con almeno un vicino film fra i primi 8** | **205/349 — 58,7%** |
| bolle-serie senza nessun vicino film | 144/349 — 41,3% |

**Quindi: in sei casi su dieci una serie ha un appoggio film. In quattro no.**

## Dove l'impalcatura funziona, e dove no

- **Documentari — il caso migliore**: la docuserie (*Giù le mani dai gatti*, *Tiger King*, *Making a
  Murderer*) e' adiacente ai **documentari film** (*Bowling a Columbine*, *Il truffatore di Tinder*,
  *Inside Job*) con **peso 884,8**, il legame piu' forte letto su tutta la mappa.
- **Le saghe**: *Guerre stellari* (bolla 1274, 0% serie) ha fra i primi vicini *The Mandalorian*
  (bolla 1034, 96% serie, peso 21,2). Il film trova la serie.
- **I mondi solo-serie non hanno appoggio**: *Star Trek: Discovery* e *Banana Fish* hanno fra i primi
  sei vicini **nessuna bolla-film**. I loro mondi (fantascienza televisiva, anime) sono pieni di serie
  e vuoti di film.
- **Le bolle-sacco non hanno appoggio**: bolla 30 (*Son of a Gun*, *Morte a Venezia*) -> bolla 33
  (*The Present*, *Goats*): nessun mondo da attraversare.

## L'asimmetria, che e' il dettaglio importante

Il ponte **non e' simmetrico nel rango**: *Guerre stellari* trova *The Mandalorian* fra i primi sei,
ma *The Mandalorian* ha fra i primi sei **solo serie** (i film di Star Wars sono piu' in basso). Il
motivo e' che ogni mondo ha **piu' serie che film** forti, quindi la parte serie ha vicini serie piu'
forti del film.

## Conseguenza per il ticket 03

Il vincolo di medium va **spostato**, non tolto:

1. **La collocazione** puo' usare i film come impalcatura: una serie nuova atterra presso i film del
   suo mondo, e da li' si passa alle serie adiacenti. E' il **passo in due tempi** che usa la mappa,
   ed e' esattamente cio' per cui la mappa esiste.
2. **La consegna** resta sul medium giusto: si raccomanda una serie fra le serie (e un film fra i
   film), che sono due cataloghi separati in Stremio.
3. **La disponibilita' dell'appoggio va controllata bolla per bolla** (e' un test da una riga: c'e'
   una bolla-film fra i vicini?), perche' nel 41,3% dei casi non c'e' — e li' il secondo studente per
   le serie (ticket 04) resta **necessario**, non alternativo.

**Ma il ticket 03 non si riapre su questo**: la via strutturale resta non pronta per i due difetti
misurati (l'arco piu' forte con un film peruviano, e 30 archi deboli per titolo). L'appoggio film e'
un'idea per la **collocazione**, e va provata quando il secondo studente esiste.
