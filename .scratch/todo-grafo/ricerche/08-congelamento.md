# Ticket 08 — Congelamento e report

`Status: resolved` · 14/10/2026 · chiude l'effort `todo-grafo` (8 ticket su 8)

## Cosa è congelato

| | |
|---|---|
| **partizione** | **V8** — `bolle-nitrile-V8.npy` · 1.625 bolle · mediana 33 · la più grossa 552 · purezza di medium 0,946 |
| **triangolo** | `bolle-nitrile-V8-triangolo.npz` · 5.873.626 archi |
| **mappa** | `bolle-nitrile-V8-mappa-6-2.npz` · 6 intra-medium + ponti cross-medium **simmetrici** (0 asimmetrie) · purezza, pct_locale, grado |
| **centroidi** | `04-centroidi.npz` · 336 bolle-serie × 122.314 termini · `04-tfidf.npz` (66.259 × 122.314) · `04-vocab.json` |
| **contratti** | attivi in `canone.py` e `bolle.py`, verificati su 6 artefatti |

**V8 sostituisce V7.** Ricetta identica, solo le tre correzioni del ticket 02. Componenti che cambiano
di 47 volte (`CAST` da 35.684 a 1.662.368 archi) e una partizione che si muove dello 0,5%: la struttura
delle bolle **assorbe** gli errori dei componenti, e ora lo sappiamo per misura.

## I numeri onesti dell'inserimento a freddo

| | propria bolla | scollegate | caso |
|---|---|---|---|
| **film** (600, ticket 04 `inserimento`) | **27,7%** | **0,0%** | 0,062% |
| **serie** (600, voto diretto, LOO esatto) | **35,3%** | **0,3%** | 0,298% |
| serie, sui 506 con la bolla in gara | **41,9%** | — | — |
| serie, con lo studente dei film (baseline) | 2,2% | 1,8% | |
| serie, con lo studente delle serie (baseline) | 1,3% | 0,2% | |

Il film resta il numero del ticket 04 di `inserimento` (su V7: 1.617 bolle contro 1.625, differenza
dello 0,5%). Le serie passano da 2,2% a **35,3%**: è il risultato principale dell'effort, ed è quello
che l'esperto aspettava dalla sua §1.B.1.

**Con i contratti attivi**: lift 85× per permutazione, kappa +0,351.

## Cosa l'esperto aveva ragione a dire, e cosa no

**Aveva ragione su tutto quello che riguardava i bug** — i tre, e il suo 76,3% era esatto al decimale.
Aveva ragione che il Network, lo Studio e il Paese+Lingua erano «pochissimo sfruttati o assenti»: non
era una scelta di progetto ma **due** bug (`genres` mai letto, e `production_countries` scartato perché
è una lista di stringhe). E aveva ragione che il criterio «bolla adiacente» non discrimina.

**Aveva ragione sul congelamento** (V7/RB 100: RB 200 frantuma, RB 60 cola — riconfermato) e **sulla
dimensione delle bolle**: la mediana 33 regge il carosello e le bolle piccole sono un problema, non una
risorsa — anzi, il voto diretto è **più preciso** sulle bolle piccole (85,7% sotto i 10 titoli).

**Non aveva ragione su una cosa, e la misura è netta**: il **ponte film→serie** non funziona.
Provato in due versioni — la mia e la sua, con lo studente dei film vero — fa **0,8%** e **2,5%** contro
il **35,3%** del voto diretto, i due voti concordano su **6 serie su 600**, e la fusione `S_diretto +
λ·S_ponte` **peggiora sempre**: il λ migliore è **0**. Il meccanismo: lo studente dei film predice lo
spazio CF, e il ticket 02 di `inserimento` aveva già misurato che quella proiezione recupera la
**struttura dei metadati**, non il comportamento (0,0% di vicini in comune con lo spazio CF). Quindi il
ponte non porta un'informazione che il diretto non abbia: fa un giro più lungo attraverso gli stessi
metadati e perde qualcosa per strada. **Un ponte funziona se porta un segnale che l'altro lato non ha.**

## Cosa non è pronto, e va detto

**1. I 94 casi cross-medium.** 94 serie su 600 (15,7%) vivono in una bolla a **maggioranza film**,
quindi il vincolo di medium le esclude per costruzione e valgono **0%** con entrambi i metodi. Sono
bolle grandi (mediana 74 titoli). Non serve un ponte: serve decidere se una serie può atterrare in una
bolla-film. La partizione V8 dice già che succede.

**2. La mappa a otto slot non seleziona.** Il grafo delle bolle ha il **95,7%** delle coppie adiacenti,
il grado mediano è **798**, e il rapporto fra il 6° e il 7° vicino è **1,074**. Ma la mediana del
**peso** degli archi è **0,0**: le relazioni vere sono poche e pesanti (Star Wars ↔ Mandalorian = 22,4,
il 34% del massimo). La mappa va rifatta sul grafo **pesato**, non sull'adiacenza binaria.

**3. La collocazione non è mai stata provata end-to-end sul prodotto.** I numeri qui sono un banco
sperimentale: 600 titoli tolti da un catalogo e ricollocati. Il prodotto ha 1 utente reale, e `CF`
copre poco. Il voto diretto non usa il comportamento — usa i **metadati** — quindi è **robusto** dove
il comportamento manca, che è la condizione in cui l'add-on vive.

**4. `src/` non è stato toccato.** Nessuna riga. Il lavoro è tutto in `.scratch/`, e questo effort
chiude il prototipo.

## I tre contratti, e i due artefatti che hanno fermato in me

`canone.py`: `ranghi` (anti-pareggio su righe **e** colonne, e i pareggi in testa), `tasso_base` +
`stampa_tasso`, `assert_ordine`, `assert_simmetrica`, `assert_modello`. `bolle.py`: `assert_componente`.
`canone.py:stampa_tasso` è la convenzione: mai una percentuale senza il suo caso.

6 artefatti su 6 fermati, zero falsi allarmi — ma il retro-test ha smascherato **tre errori nei
contratti stessi** (il verso di `assert_ordine`, la soglia `1e-6` di `assert_modello`, l'anti-pareggio
che guardava un asse solo), e i contratti hanno fermato **me** altre due volte:

- al ticket 05, `tasso_base` chiamato senza riferimento ha stampato **caso 58,27%** su una misura col
  caso vero di 0,33% ⇒ la formula della prevalenza vale per un **esito binario**, e ora il contratto
  rifiuta quell'uso;
- al ticket 05/06, il leave-one-out incompleto ha dato **63,7%** dove il numero vero era **35,3%**. Non
  è degenere, è solo gonfiato: nessun contratto lo ferma. L'ha fermato **rifare la misura per un'altra
  via**.

**La lezione operativa**, che vale più dei contratti: quando un numero è troppo bello, ricalcolarlo per
una strada diversa. Il 63,7% era il doppio del vero e aveva una spiegazione plausibile pronta.

## Il quinto bug, e perché conta per il prossimo giro

`production_countries` è `["US"]`: una lista di **stringhe**, non di dizionari, e l'helper `leggi()`
dell'`isinstance(x, dict)` scartava tutto in silenzio. Danno: **34.331 titoli** con un paese non
angloamericano (JP 5.860, KR 2.097, FR 5.621, IT 2.988), **44.279 firme `pg:`** mai nate, e tutte le
lingue originali non usate. **È il segnale che serve alle serie**, ed è ora disponibile e verificato nei
centroidi (`pa:JP`, `pa:KR`, `rt:kbs2` si leggono fra i primi termini). Stessa forma per
`spoken_languages` (`["en"]`), che nessuno legge ancora.

## Prossimo giro, in ordine di rapporto fra valore e costo

1. **La mappa pesata** (6+2 sul grafo con soglia di peso, non sull'adiacenza). Piccolo, e sblocca l'unica
   parte della mappa che oggi non seleziona.
2. **I 94 cross-medium**: togliere il vincolo di medium per le serie, e misurare quanto sale il 35,3%.
   Il tetto è **84,3%**, quindi c'è spazio.
3. **`src/`**: quando si tocca, i candidati sono il voto diretto sui centroidi (un coseno, 7,7 ms per
   titolo, nessun modello da riaddestrare) e i contratti.
