# 58 — La fusione a due stadi: il pezzo perso, e vale il doppio

> ## ⚠️ RITRATTATO — vedi `ricerche/60-fusione-ritrattazione.md`
>
> **Il risultato principale di questo report è un artefatto.** Il teacher chiamato «comportamento» era lo spazio `Cf`, che ha le **16.550 serie tutte a zero** — e le 249 sorgenti del gold curato sono **tutte serie**. Quindi il teacher era la **matrice nulla**: `argsort` su tutti pari restituisce l'ordine di indice, cioè una permutazione fissa. La fusione con quella produce esattamente il 22,65% @10 che questo report celebrava, e il controllo con un teacher **davvero** senza informazione (permutazione casuale) dà 0,00%.
>
> **Cosa resta in piedi**: che la fusione per ranghi **funziona** — ma dove la camminata è **cieca**. Sul catalogo serie (dove `CF` non copre niente) il teacher dei metadati vale **+75% al @10**. Sul metro curato, dove la camminata vede già tutto, **non aggiunge niente**. La regola vera è nel report 60.
>
> **Cosa NON resta**: il «raddoppia il @10» (era l'artefatto), e il confronto col riferimento storico del report 41 (che era su un altro grafo e va rifatto).


**Il mandato**: ottimizzare il grafo per il metro curato (report 57). Mentre preparavo il recap ho controllato i riferimenti storici e ho trovato una cosa che avevo **perso per strada**.

**L'esito**: il **RRF a due stadi** — il vincitore del report 41 — **non era mai stato ritestato** dopo il rifacimento del grafo. Rimesso sul grafo pulito **batte il riferimento storico su ogni profondità** e **raddoppia il @10** della camminata a uno stadio. E il teacher che conta è il **comportamento**, non i metadati.

Script: `rrf-nuovo.py` (475 s).

---

## 1. Cos'è il RRF, e perché era stato perso

**RRF** = Reciprocal Rank Fusion. Invece di fidarsi di un solo ordinamento, si fanno ordinare i candidati **da due esperti** e si fondono i due ordini:

```
punteggio(i) = 3,0 / (3000 + rango_camminata(i)) + 0,5 / (3000 + rango_teacher(i))
```

Non serve nessun modello nuovo e nessun dato nuovo: **è la stessa informazione, usata due volte**.

Il report 41 lo aveva trovato: **18,9% @10 e 36,9% @100** sul metro curato, contro il 10,7% del migliore esperto singolo. Poi il grafo è stato rifatto (report 48-49) e i report 56-57 hanno ottimizzato **solo la camminata a uno stadio**. Il RRF era rimasto nel report 41, mai rimesso.

## 2. I risultati

Grafo nuovo: CF×5, k=60, β=0,50. Protocollo identico (pari = curatela nel grafo, dispari = test, alpha 0,7 come nel protocollo storico). 1.002 legami cross-medium da 246 sorgenti.

| | @10 | @50 | @100 | @500 | @2000 |
|---|---|---|---|---|---|
| **riferimento storico** (report 41, grafo contaminato) | 18,90% | 32,50% | 36,90% | 50,00% | 67,60% |
| grafo nuovo, camminata a **uno** stadio (alpha 0,7) | 11,18% | — | 26,45% | 50,00% | 70,26% |
| camminata sola (alpha 0,3) | 7,39% | 16,87% | 22,95% | 43,91% | 65,57% |
| teacher solo (metadati puliti) | 0,50% | 2,99% | 5,29% | 19,36% | 49,90% |
| teacher solo (comportamento) | 1,10% | 3,39% | 5,49% | 20,86% | 45,11% |
| RRF camminata+metadati, k=3000 | 1,50% | 7,29% | 13,57% | 45,61% | 66,57% |
| **RRF camminata+comportamento, k=3000** | **22,65%** | **35,33%** | **39,72%** | **53,09%** | **70,36%** |
| **RRF camminata+comportamento, k=3000 · curatela 0,88** | 20,46% | **38,72%** | **43,31%** | **54,89%** | **71,86%** |
| somma lineare 0,7/0,3 (per confronto) | 0,70% | 3,39% | 5,99% | 20,66% | 50,90% |

**Contro il riferimento storico**: +3,75 @10 · +2,83 @50 · +2,82 @100 · +3,09 @500 · +2,76 @2000. **Vince su ogni profondità.**

**Contro la camminata a uno stadio**: **2,03× al @10**, 1,50× al @100.

## 3. Le tre cose che spiegano il risultato

**1. Il teacher che conta è il comportamento, non i metadati.** Con i metadati la fusione fa **1,50%** @10; col comportamento **22,65%**. Il motivo è che i metadati, da soli, sono disastrosi in testa (0,50% @10): non sanno *ordinare*. Ma sanno *dire qualcosa* su cosa è simile a cosa — e fusi con la camminata, che sa ordinare ma ha la testa piatta, si completano.

**2. `k=3000` batte `k=60` di un ordine di grandezza.** Con `k` grande la fusione **appiattisce le differenze di rango** e diventa quasi un voto: il vertice della lista fusa lo decidono i titoli su cui **i due esperti concordano**, non la forza di uno dei due. Con `k=60` il rango domina e la fusione degenera verso la camminata sola (9,78% @10).

**3. La somma lineare è un disastro** (0,70% @10). Il RRF funziona **perché lavora sui ranghi** invece che sui punteggi: i due esperti hanno scale incomparabili, e normalizzarli distrugge l'informazione. Il rango è l'unica scala comune.

## 4. La correzione al report 57

Il report 57 concludeva che la qualità esperta si compra **alzando la curatela**, al prezzo del volume:

| | volume @100 | qualità @100 |
|---|---|---|
| curatela 0,60 (massimo del volume) | **29,01%** | 26,45% |
| curatela 0,80 + CFst×3 (miglior compromesso) | 27,38% | 29,44% |
| curatela 0,88 + CF×1 + temi×3 + CFst×3 (massimo della qualità) | 14,90% | 30,14% |

**Con la fusione il trade-off si sposta.** A curatela **0,60** — il massimo del volume — la fusione fa già **39,72% @100**, contro il **30,14%** del massimo della camminata a curatela 0,88. E a curatela 0,88 fa **43,31%**, cioè +13 punti sul massimo precedente, con un volume che non è quello del crollo (la fusione non perde la testa come la camminata).

**Quindi**: la frontiera del report 57 è **vera ma è la frontiera sbagliata da guardare**. Descrive come comprare qualità *sacrificando* volume. La fusione compra qualità **senza** sacrificarlo. Resta da misurare quanto la fusione costi sul metro del prodotto — il report 41 diceva "RRF 1,4% sul prodotto", quindi probabilmente parecchio.

## 5. Perché era stato perso (la lezione)

Il report 41 aveva **due** risultati: la ricetta del grafo e la fusione. Quando ho rifatto il grafo (report 48-49) ho riportato la prima e **ho lasciato la seconda**, perché la stavo trattando come "un esperimento del report 41" invece che come "un pezzo della ricetta".

E il report 55 (retrospettiva) aveva elencato le cose trascurate **senza accorgersene**: guardavo i parametri del grafo, non gli **algoritmi** che ci mettevo sopra.

**La regola che ne esce**: quando si rifà un componente, **va rifatta anche la tabella dei confronti**, non solo il componente. Un vincitore vecchio non muore quando cambia il grafo: va ritestato.

## 6. Cosa resta aperto

1. **Quanto costa la fusione sul metro del prodotto?** Il report 41 diceva 1,4% — da rimisurare sul grafo nuovo. Se costa poco, è la ricetta completa; se costa molto, si usa la fusione per il ponte cross-medium e la camminata per i due cataloghi.
2. **Quale teacher** in produzione? Qui il comportamento è MovieLens. In YACA il comportamento vero è scarso (1 utente reale): il teacher andrebbe costruito dalle cronologie Trakt, che è quello che `CF` già fa.
3. **`k` e i pesi dell'RRF** non sono stati ritoccati (3,0/0,5 e 3000 vengono dal report 41). Con il grafo nuovo l'ottimo può essere altrove.
