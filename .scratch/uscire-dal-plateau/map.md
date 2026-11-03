# Mappa — uscire dal plateau del grafo

## Destination

Un grafo che propone vicini **di tono**, non solo di pubblico; valutato con intervalli di confidenza;
con cold-start funzionante per i titoli nuovi.

Successo: *Barbie* con ≥2 affini (*Povere creature!*, *The Substance*, *Josie and the Pussycats*) e 0
falsi amici in top-10; R@20 ≥ 0,25 sul banco e quota >5k in top-10 ≤ 55%.

## Decisions so far

- **La chiusura è `log`, non `adamic-adar` né `conteggio`** (misurato, ticket 02): comprime la cricca
  da ×1211 a ×7,1 e porta *Lady Bird* al #19 nella riga di *Barbie* (era #61) senza perdita misurabile
  sul banco (R@20 −0,004, sotto l'MDE 0,009-0,011; MRR e R@5 migliorano). SNIPS +0,026, sopra l'MDE.
  Costo: >5k in top-10 dal 68,2% al 72,3%.
- **La COVISION senza `--semplice` è la leva più forte per la coda** (ticket 03): −6,8 punti di
  blockbuster in top-10, al prezzo di −0,008 R@20 (al limite dell'MDE) e con Oppenheimer che esce dalla
  top-10 di *Barbie*. Consigliata come base, con il costo dichiarato.
- **CREWPROP funziona e costa**: porta *Piccole donne* e *Lady Bird* in testa a *Barbie*, ma toglie
  −0,005/−0,007 di R@5 (sopra l'MDE) al banco curato. Il peso (0,35 o 0,7) è una scelta di prodotto.
- **Il gate asimmetrico è innocuo ma insufficiente**: −1,4 punti di coda, tutto sotto l'MDE; il criterio
  "sotto il 60%" non è raggiunto.
- **Togliere la chiusura non è un'opzione**: costa −0,012 di R@20 (sopra l'MDE) e alza i blockbuster
  al 73,2%. Il secondo ordine serve: è la *forma* del fattore che era sbagliata.
- **Tre difetti verificati, non ipotesi** (2026-11-03): la "chiusura triangolare" moltiplica per i
  vicini comuni (0 archi nuovi, ×700-1211 sulla riga di Barbie); COVISION è costruita con `--semplice`
  (nessuno sconto temporale); il titolo è dentro il payload di TRAMA.
- **La valutazione ha un MDE di 0,009-0,011 su R@20** a 499 sorgenti: sotto quella soglia è rumore, e
  va dichiarato tale invece di essere rincorso.
- **La configurazione `min` + k32 + spreading non si spedisce**: contro il PageRank che il motore già
  usa vale +0,003 R@20 e raddoppia gli archi.
- **Nessun LLM-as-reranker**: il problema è la generazione dei candidati, non il riordino.
- **Le keyword TMDB 1-gram sono chiuse**: 15 varianti, nessuna produce il vicinato voluto.
- **Niente etichette umane su larga scala, niente API a pagamento come dipendenza centrale.**

## Not yet specified

- **Peso di CREWPROP**: 0,7 (Piccole donne/Lady Bird in testa a *Barbie*, −0,007 R@5) o 0 (precisisione
  sui primi 5)? È una scelta di prodotto, non statistica.
- **Base del grafo**: adottare la COVISION temporale (ticket 03) come default, con −0,008 R@20 e −6,8
  punti di coda.
- Quale dato nuovo, se serve, per il tono: recensioni utente TMDB o Wikipedia (intro + sezione
  Themes/Style). Non ancora deciso se vale il fetch.
- Se il prodotto debba restare a bolle o passare alla matrice sparsa (fuori da questo effort, ma
  blocca la messa in produzione di V18).
- La soglia oltre la quale un titolo nuovo ha abbastanza segnali per entrare nel grafo.

## Out of scope

- Rifare la partizione bolle sui 76.497 nodi o rimuovere le bolle dal motore di prodotto.
- Migrazione a LightGCN / GNN eterogenee (valutata e scartata dal senior: over-smoothing, cold-start
  incompatibile, nessun vantaggio atteso su dati sparsi a coda lunga).
- Attivazione del timer notturno (`ops/yaca-grafo.timer`): non prima del ticket 10.
- Interfaccia utente e qualsiasi modifica all'app.
