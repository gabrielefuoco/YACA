Status: resolved
Type: task

# 01 — La mappa pesata: cosa tiene, cosa butta, e se resta navigabile

Rifare i 6+2 sul grafo **pesato** invece che sull'adiacenza binaria, e misurare cosa cambia.

Da misurare, non da assumere:
- la **distribuzione dei pesi** degli archi di `BB`: percentili, quanti archi hanno peso ~0, e quanta
  parte del **peso totale** sta nel top-8 di ogni bolla;
- due costruzioni a confronto — una **soglia** al percentile, un **top-k per bolla** — e per ciascuna:
  il grado risultante, il rapporto fra il 6° e il 7° vicino (il **ginocchio**: se resta 1,07 non
  seleziona ancora), e quanta parte del peso totale resta;
- la **connettività**, che e' il vincolo del ticket 23 di `grafo-servibile`: il k-NN **mutuo** frammenta
  la mappa in 143 componenti, il **diretto simmetrizzato** la tiene intera (5). La mappa pesata va
  verificata allo stesso modo: quante componenti, e qual e' la piu' grande;
- la **purezza di medium** delle relazioni: un vicino intra-medium dovrebbe restare
  intra-medium.

Esito: `01-pesata.py`, `ricerche/01-pesata.md`, e la scelta dichiarata di k o soglia con il numero
che la giustifica.

## Esito

LA MAPPA PESATA FUNZIONA, ma il ginocchio a 6 o 8 NON ESISTE. Il rapporto w_k/w_k+1 e' massimo a k=2 (1,218) e decresce sempre: 1,074 a 6, 1,082 a 8, 1,057 a 12. Questo grafo non ha una scala caratteristica: e' un continuum pesato, non una struttura a grappoli. Gli otto slot sono una convenzione di prodotto, e va dichiarato. I pesi: mediana 0,066, il 57,2% degli archi sotto 0,1, il top-8 di ogni bolla tiene il 40,9% del peso con l'1% degli archi. SULLE COSTRUZIONI: la soglia frammenta (al 99° percentile, 206 componenti: la stessa frammentazione che il ticket 23 di grafo-servibile aveva misurato col k-NN mutuo), il TOP-K PER BOLLA CON UNIONE tiene sempre UNA SOLA componente. E' quella la costruzione giusta: sparsa E navigabile.
