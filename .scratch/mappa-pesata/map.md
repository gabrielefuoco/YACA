# mappa-pesata — il grafo pesato al posto dell'adiacenza, e i 94 cross-medium

## Destination

Chiudere le due cose che `todo-grafo` ha lasciato aperte, e preparare — senza eseguirla — la
proposta per `src/`:

1. **La mappa a 6+2 sul grafo PESATO.** Il ticket 07 di `todo-grafo` ha costruito i 6+2
   sull'adiacenza binaria e ha misurato che non seleziona niente: 95,7% delle coppie adiacenti,
   grado mediano 798, rapporto fra il 6° e il 7° vicino **1,074**. Ma la mediana del **peso** degli
   archi e' **0,0**, e l'arco Star Wars <-> Mandalorian vale 22,4 (34% del massimo). Il difetto e'
   dell'adiacenza, non del peso: va rifatta sul pesato, e va verificato che resti **navigabile**.
2. **I 94 cross-medium.** 94 serie su 600 hanno la bolla vera a maggioranza **film** e valgono 0% con
   ogni metodo, perche' il vincolo di medium le esclude per costruzione. Il tetto e' 84,3%.
3. **La proposta per `src/`**, come documento. Nessuna riga di prodotto.

## Decisions so far

- **Il voto diretto sui centroidi fa 35,3%** sulle serie (212/600, lift 85x, kappa +0,351, scollegate
  0,3%), contro il 2,2% dello studente dei film e l'1,3% di quello delle serie. Sui 506 in gara:
  41,9%. Costruito su V8, 336 bolle-serie, 122.314 termini.
- **Il ponte film->serie non funziona** in nessuna delle due forme (0,8% con la ricetta esatta
  dell'esperto, 2,5% con la mia) e la fusione peggiora sempre. Non si riprova.
- **La maschera di medium**: nel voto diretto si sceglie fra le sole bolle-serie. E' una scelta di
  prodotto (film e serie sono due cataloghi) ma e' anche cio' che esclude le 94.
- **La simmetrizzazione per UNIONE** (non per sostituzione): sostituire il ponte piu' debole evince un
  ponte gia' simmetrizzato e lascia 2.264 asimmetrie; l'unione le azzera.
- **Il k-NN mutuo frammenta** (143 componenti, ticket 23 di `grafo-servibile`), il **diretto
  simmetrizzato** no (5 componenti). La strada e' il diretto simmetrizzato, ora sul peso.
- `src/` non si tocca senza chiedere. Il ticket 04 produce un documento, non un cambiamento.

## Esito, 14/10/2026 — effort chiuso, 4 ticket su 4

**Le due cose aperte sono chiuse, e sono diventate tre scoperte:**

1. **La mappa pesata funziona** (1 componente, il ginocchio da 1,074 a 1,24) — ma **il ginocchio a 6
   o 8 non esiste**: il rapporto `w_k/w_k+1` e' massimo a k=2 e decresce sempre. Gli otto slot sono
   una **convenzione di prodotto**, non una struttura del dato. La costruzione giusta e' il
   **top-k per bolla con unione**: la soglia frammenta (206 componenti al 99° percentile, come il
   k-NN mutuo del ticket 23 di `grafo-servibile`), il top-k no.
2. **Il vincolo di medium non costa niente**: tolto, il totale resta 35,3% (le 94 guadagnano il
   10,6%, le 506 perdono 2 punti). Le 94 sono serie **intrappolate in minestroni generici di film**,
   non in mondi nascosti dal medium. La premessa del ticket era un'inferenza sbagliata mia.
3. **Il collocatore** e' una funzione da 8,7 ms con 7 MB di vettori e nessun modello: *Verity* ->
   *Gone Girl* ci arriva per una via diversa da quella del primo effort.

**La proposta per `src/` e' scritta e non eseguita.** Serve una decisione: un collocatore **in linea**
o un **job notturno**? La raccomandazione in linea non ha bisogno di questo modulo — ha bisogno della
partizione, che e' gia' precalcolata.

## Not yet specified

- Se il grafo pesato vada reso sparso con una **soglia** o con un **top-k per bolla**, e con quale k.
- Se il voto diretto debba poter atterrare su una bolla-film **sempre**, o solo quando il punteggio
  e' alto abbastanza da superare i candidati-serie.
- Se i 94 abbiano un segnale comune (paese? rete? genere?) che li renda riconoscibili a freddo.

## Out of scope

- Il ponte film->serie: misurato e bocciato in `todo-grafo` 06.
- Rimpicciolire o rifare la partizione: V8 e' congelata.
- Toccare `src/`: la proposta si scrive, l'implementazione si decide dopo.
