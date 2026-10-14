# gli archi strutturali e il gating

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 02

Gli archi del titolo nuovo, e il gating del ticket 16.

Un titolo senza comportamento collegato con gli archi strutturali a pieni pesi inquina: il ticket 16
di `grafo-servibile` ha misurato che i metadati ovunque costano **-7,34 al @500**, e il rimedio e'
il gating `lambda(i) = tau0 / (tau0 + d_behav(i))`: l'arco strutturale sopravvive se **almeno un
estremo e' freddo**. Il plateau e' `tau0` in [1, 20], con `tau0 = 5` a +0,25 al @100.

**Cosa fare**
1. Costruire gli archi KW, CAST, DIR, PROD del titolo nuovo (gli stessi componenti, stessa soglia).
2. Applicare il gating e misurare **quanti** archi sopravvivono e verso chi.
3. Verificare che il titolo nuovo non finisca in una bolla per un solo arco forte (il caso
   J.J. Abrams / Star Trek nella bolla Star Wars: la normalizzazione di riga gonfiava l'arco
   solitario, ed e' il difetto D4 corretto in `bolle.py`).

**Criterio di chiusura**
- Gli archi del titolo nuovo sono elencati e leggibili (i primi 20, con il titolo dall'altra parte).
- Il gating e' applicato, e l'effetto misurato sul banco di Verity: la collocazione cambia o no?

---

## Esito

**La via strutturale NON e' pronta**, e va detto con precisione. Report in `ricerche/03-archi.md`.

- **Il medium non e' rispettato**: gli archi strutturali di un film finiscono su **serie TV**
  (Scarpetta, Rebus, The Suspect, Harlan Coben). Il prodotto ha due cataloghi separati.
- **Le due vie non concordano**: la proiezione manda Verity nella bolla 632 (Gone Girl), la via
  strutturale in un insieme completamente diverso (2, 174, 255, 353, 464...). Nessuna in comune.
- **L'arco piu' forte** e' con Wiñaypacha (0,51), un film peruviano.
- **Il gating e' un no-op per un titolo nuovo**: d_behav = 0 -> lambda = 1, passano tutti i 30
  archi. E' il caso limite che il ticket 16 prevedeva: la protezione non e' nell'arco singolo
  (il difetto D4 e' escluso) ma nel loro numero.

**Cosa serve**: il vincolo di medium, una soglia molto piu' alta (3-5 archi, non 30), e la coerenza
con la proiezione (scartare gli archi che puntano lontano dalla bolla votata).

**Errore mio, all'inizio**: usavo la matrice grezza, e la similarita' dava 0,86 con TUTTO (i primi
30 archi erano talk show e reality show). Con la TF-IDF scende a 0,39-0,51.
