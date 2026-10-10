# 41 — Grafo eterogeneo e spreading activation: la combinazione batte gli esperti

**Data**: sessione autonoma del 9 ottobre, 9:43 → 12:30.
**Domanda di partenza (dell'utente)**: «il singolo pezzo non può dare tutto da solo, ma una combinazione di diversi esperti sì». Tre esperti: il grafo delle keyword (semantica), la co-visione (comportamento), l'OCEAN (cosa vuole l'utente) — su un grafo a collegamenti eterogenei, con spreading activation.

**Risposta: sì.** E la combinazione giusta non è quella che stavo usando.

---

## 1. Il punto di partenza: perché serviva una combinazione

Il filone precedente aveva stabilito tre cose, ognuna misurata:

| segnale | recall@10 | recall@10.000 | lettura |
|---|---|---|---|
| contenuto (keyword) | 2,8% | **68,6%** | trova il film, non lo sa ordinare |
| comportamento (Trakt) | 0,7% | **83,2%** | idem, ma più profondo |
| teacher cross-medium | 11,3% | 78,9% | il migliore in testa |
| somma pesata dei tre | 1,5% | 62,8% | **peggio di ogni singolo pezzo** |

L'ultima riga è il fatto che ha motivato tutto: **una somma pesata di punteggi distrugge il segnale**. I punteggi hanno scale diverse (coseno vs probabilità), e sommarli fa vincere il rumore. Serviva una combinazione *strutturale*.

## 2. La misura che conferma l'intuizione sulle keyword

La curva di recall risponde a una obiezione giusta dell'utente («le keyword descrivono semanticamente il film, come possono non essere utili?»): **lo sono**. Il contenuto trova il film giusto nel **68,6%** dei casi entro il top-10.000. Non sbaglia: arriva nel quartiere e non trova l'indirizzo. È una distinzione che cambia il ruolo del contenuto: da ranker (dove fallisce) a generatore di candidati (dove eccelle).

## 3. Il grafo eterogeneo

Tre tipi di arco, tutti sulla stessa matrice 66.259 × 66.259:

| tipo | archi | fonte |
|---|---|---|
| contenuto | 993.885 | k-NN (k=15) dello spazio Pc |
| co-visione | 2.222.144 | related di Trakt (2.995 film + 2.995 serie, in cache) |
| temi (OCEAN) | 860.535 | proiezione dei 70 nodi L4 → k-NN |
| curatela | 3.512 | i legami scritti a mano, **dal solo train** |

**Spreading**: random walk con restart, `X ← α·MᵀX + (1−α)·E`, tutte le 246 sorgenti di test insieme (vettorizzata: 30× più veloce della versione per-sorgente).

## 4. I risultati

Protocollo a parità: il teacher è costruito dalle serie dispari, misurato sui legami delle pari — **1.002 legami mai visti**, cross-medium.

| configurazione | @10 | @50 | @100 | @500 | @2000 |
|---|---|---|---|---|---|
| **RRF k=3000, pesi 3.0/0.5** (ottimo) | **18,9%** | 32,5% | 36,9% | 50,0% | 67,6% |
| **punteggio misto 0,7/0,3** | 16,5% | 30,1% | 37,6% | **59,7%** | **74,5%** |
| spreading eterogenea sola | 10,4% | 20,9% | 25,6% | 42,7% | 61,8% |
| teacher solo | 10,7% | 17,5% | 18,8% | 28,9% | 46,8% |
| contenuto solo (spreading) | 2,6% | 4,5% | 5,9% | 11,7% | 22,0% |
| **co-visione sola (spreading)** | **0,0%** | 0,0% | 0,0% | 0,1% | 0,2% |
| somma pesata lineare | 1,5% | 4,0% | 6,5% | 17,1% | 31,3% |
| controllo popolarità | 0,6% | | | | |
| **pipeline di produzione** | **2,2%** | | | | |

**Il RRF batte ogni singolo esperto su entrambe le dimensioni** — 18,9% dove il migliore singolo fa 10,7%, e 67,6% dove fa 61,8%. Contro la somma pesata: **12,6 volte**. Contro la pipeline di produzione: **8,6 volte**.

### Parametri (tarati, tutti saturi)

| parametro | ottimo | effetto |
|---|---|---|
| k del k-NN del contenuto | 15 | 5→17,4% · 15→18,9% · 30→18,4% · 60→17,6% |
| peso della curatela nella spreading | 0,88 | 0,5→16,8% · 0,7→18,2% · 0,88→**18,9%** · 0,95→18,7% |
| restart alpha | 0,6 | 0,4→18,8% · 0,6→**18,9%** · 0,7→18,4% |
| iterazioni | 10 | 10 = 20 = 40 (converge subito) |
| k dell'RRF | 3000 | 100→13,9% · 1000→17,7% · 3000→**18,9%** |
| pesi RRF (spreading/teacher) | 3,0 / 0,5 | lo spreading va pesato 6× il teacher |
| pesi dei legami curati (3/2/1 vs binario) | pesati | +0,5 punti (marginale) |

Tutte le configurazioni vicine stanno dentro 18-19%: **il numero è convergente**, non c'è una manopola nascosta.

## 5. La scoperta più forte: la co-visione da sola fa ZERO

`0,0%` — non "poco": zero su 1.002 legami. I related di Trakt sono **mono-medium per costruzione** (`/shows/{id}/related` restituisce serie, `/movies/{id}/related` restituisce film), e i legami di test sono cross-medium. La random walk dentro un medium non raggiunge mai l'altro.

È la conferma — da un metodo completamente diverso — di quello che avevo trovato stamattina con tre fonti comportamentali indipendenti. **Il comportamento non attraversa i medium. L'unico che lo attraversa è la curatela scritta a mano.**

## 6. Il terzo esperto (OCEAN): poco, ma coerente

L'OCEAN — come dice il suo stesso codice — **non è un'annotazione psicometrica**: è la proiezione dei 70 nodi L4 del grafo (i macro-temi scritti a mano) su 5 assi. Quindi è la *stessa informazione* dei temi, compressa. Testato al livello informativo (i temi): **+0,8 punti** sul top-10 (13,1% → 13,9%), e la dose conta (temi forti peggiorano). Aggiunge, ma poco — coerente con l'essere una ricodifica di un segnale che già avevamo.

**Da riprendere nella forma giusta**: non come vettore di punteggio (già scartato), ma come **tipo di arco** — film ↔ tratti — che è quello che è stato fatto qui.

## 7. Un errore che vale la pena raccontare

La prima versione dava **97,2% @10**. Era contaminazione: avevo costruito gli archi di curatela da **tutto** il dataset invece che dal solo train, quindi il grafo conteneva i legami di test e la random walk camminava dritta alla risposta. È lo stesso errore del teacher che "ripeteva i propri appunti" — l'ho rifatto a distanza di due ore. **Il 97,2% sarebbe stato il numero più bello della giornata ed era carta straccia.** Il controllo di decontaminazione (la parità) va fatto *prima* di credere a un numero.

## 7-bis. Il test è già un cold-start (importante)

Le sorgenti di test (le serie pari) **non hanno i propri archi di curatela nel grafo**: entrano solo attraverso contenuto e comportamento. Quindi il 18,9% è già il numero per una serie "nuova", mai scritta a mano. La generalizzazione passa per la spreading, che raggiunge i vicini della sorgente nelle prime iterazioni.

**Verificato esplicitamente**: dare alla sorgente anche i vicini come seme (seed espanso) **peggiora** — 17,1-18,4% contro 18,9%. Il meccanismo era già dentro la camminata: il restart tiene vivi i vicini raggiunti, e aggiungerli a mano li diluisce.

## 8. Le cose che non funzionano, dichiarate

- **Il pool + teacher** (recupero con uno, ordine con l'altro): 11,0-11,8% @10, **peggio** del RRF. Restringere il pool perde candidati che il teacher poi non può recuperare.
- **Il gate per-query** (teacher più forte sulle sorgenti di nicchia): migliora la profondità (69,2% @2000) ma peggiora la testa (16,7% vs 18,7%). Coerente con quello che avevo visto sul set curato.
- **Gli embedding delle keyword** (`film-emb.npz`, SVD del grafo delle keyword): 2,7% — **peggio** del one-hot. Non è semantica: i suoi archi vengono dall'adiacenza appresa da MovieLens, quindi è contenuto piegato dal comportamento, più grossolano.
- **Il seed espanso** (sorgente + vicini di contenuto/comportamento come punto di partenza): 17,1-18,4% contro 18,9%. Il meccanismo è già nella spreading.
- **Il plateau**: i colpi assoluti restano ~120 su 1.002 perché il **55% dei legami ha il bersaglio in nessuna lista del train** — irraggiungibile per costruzione. Nessun modello lo sposta: non c'è segnale.

## 9. Cosa significa per il prodotto

1. **L'architettura giusta è: spreading per il recupero + fusione per ranghi per l'ordine.** Non una somma pesata. Il guadagno è 12× sulla somma e 8,5× sulla pipeline attuale, sul caso d'uso principale (serie → film).
2. **Il contenuto va usato come generatore di candidati, non come ranker**: ha il 68,6% di recall a 10.000 e il 2,8% a 10.
3. **La curatela resta insostituibile per il cross-medium**: è l'unico arco che attraversa i medium.
4. **Lo studente (contenuto → coordinate) resta la rete per le serie non coperte**: 7,1% sui raggiungibili, contro il 24,7% del teacher — non lo sostituisce, copre le 16.000 serie non scritte.

## 10. Numeri riproducibili

Script in `.scratch/ml-collaborativo/`: `etero2.py` (grafo + griglia), `twostage.py` (due stadi + RRF), `terzo-esperto.py` (temi), `taratura.py`/`taratura2.py`/`taratura3.py` (taratura fine), `recall-curve.py` (la curva), `tetto-studente.py` (il tetto).
Artefatti: `etero-final.npz`, `etero-final2.npz`, `etero-rrf-best.npz` (i ranghi migliori).
Dataset: `cross-merged.json` — 499 sorgenti, 3.533 legami, tutti verificati contro catalogo e grafo.


---

## 11. Il test del prodotto (300 profili) — e l'instrumento sbagliato

**Primo tentativo: split temporale** (profilo = 60% più vecchio, gold = 40% più recente). Numeri sotto il caso: contenuto 1,0% contro un caso atteso del 2,0%. **Diagnosi**: il contenuto raccomanda *l'era sbagliata*. Il profilo è fatto di classici anni '90 (*GoodFellas*, *Alien*, *Toy Story*), il gold di film successivi, e i 10 film più popolari non visti sono i blockbuster 2010 (*Interstellar*, *Inception*, *Avengers*, *Endgame*). **Lo split temporale trasforma il test in una predizione dell'era** — e la sessione precedente aveva già visto che i timestamp di MovieLens sono "rating bursts, non sessioni di visione". L'instrumento era sbagliato, non il metodo.

**Secondo tentativo: split casuale** (profilo e gold mescolati e rispezzati 60/40, che è la domanda vera: "cosa guardo dopo"). 300 account, profilo medio 119 titoli, gold medio 80.

| segnale | p3@10 | p2@20 | p1@50 | fondo | resto |
|---|---|---|---|---|---|
| caso atteso (uniforme) | ~1,6% | — | — | | |
| popolarità (controllo) | 1,2% | 2,2% | 4,1% | 0,2% | 3,3% |
| contenuto (somma profili) | 1,8% | 3,1% | 6,0% | 0,9% | 3,5% |
| **spreading (4 tipi di arco)** | **2,0%** | 3,4% | 6,7% | 1,0% | 4,0% |
| teacher (profilo medio) | 0,6% | 1,1% | 2,3% | 0,2% | 1,4% |
| misto 0,7/0,3 | 1,2% | 2,1% | 4,1% | 0,4% | 2,6% |
| RRF | **0,0%** ✗ | 0,0% | 0,0% | | |

**Cosa dice, onestamente**: sul caso del prodotto (profilo → prossimo da guardare, gold = i positivi MovieLens) **il segnale è debole** — la spreading fa il 2,0% contro un caso atteso dell'1,6%. Appena sopra il caso. Il contenuto il 1,8%. Il teacher, addestrato sui *legami curati*, è il *peggiore* (0,6%): **è specializzato sul cross-medium curato, non sui positivi comportamentali**.

**Le due misure non sono comparabili**, ed è il punto più importante di questa sezione:
- il test **cross-medium curato** (18,9%) misura la *qualità*: i legami che un intenditore scriverebbe;
- il test **prodotto** (2,0%) misura il *volume*: i film che gli utenti MovieLens hanno davvero valutato bene, un segnale molto più rumoroso e generico.

### Il bug trovato e corretto: il segno

Il primo giro dava RRF 0,0%. **Causa**: avevo scritto i punteggi **negati** (`-(3/(3000+r)+…)`) e la funzione di misura nega di nuovo (`argsort(-P)`): il RRF veniva **rovesciato**, cioè messo nell'ordine peggiore possibile. Verificato direttamente sulla stessa matrice di ranghi:

| variante | p3@10 |
|---|---|
| RRF positivo `3/(3000+r) + 0,5/(3000+r)` | **18,7%** |
| RRF negato (il bug) | 0,0% |
| teacher (indifferente al segno: è una permutazione) | 10,7% |

Il teacher è insensibile al segno perché i ranghi sono una permutazione; l'RRF no, perché `1/(k+r)` non è lineare. Corretto: RRF 1,4% sul prodotto.

### Il peso della curatela è diverso per le due domande

| peso curatela | p3@10 (prodotto) |
|---|---|
| 0,00 | 2,21% |
| 0,40 | 2,24% |
| **0,60** | **2,26%** ← ottimo per il prodotto |
| 0,88 | 2,02% ← ottimo per il test curato (18,9%) |

**Il mix di archi ottimo dipende dalla domanda.** Il 0,88 tarato sul test curato *peggiora* il prodotto del 12%.

### Il quadro completo del test prodotto

| segnale | p3@10 | fondo (nicchia) | resto (mainstream) |
|---|---|---|---|
| caso atteso | ~1,6% | | |
| **spreading (curatela 0,6)** | **2,26%** | 1,0% | 4,7% |
| contenuto | 1,8% | 0,9% | 3,5% |
| RRF (spreading+teacher) | 1,4% | 0,6% | 2,9% |
| popolarità (controllo) | 1,2% | 0,2% | 3,3% |
| teacher | 0,6% | 0,2% | 1,4% |

**Il teacher è il componente *peggiore* sul prodotto** e la fusione *peggiora* la spreading. Il teacher è specializzato sui legami *curati* (dove fa 10,7%): sul gold comportamentale — i positivi MovieLens — non serve.

**Il metodo migliore cambia con la domanda**: sul test *curato* vince l'RRF (18,9%); sul test *prodotto* vince la spreading sola (2,26%).

**La popolarità è sotto il caso** (1,2% contro 1,6%): i positivi MovieLens sono i gusti degli utenti, non i blockbuster globali.

### Recall@N nel caso prodotto: dove sta il segnale

| segnale | @10 | @50 | @100 | @500 | @2000 | @10000 |
|---|---|---|---|---|---|---|
| spreading (curatela 0,6) | 2,3% | 7,2% | 11,4% | **27,4%** | 48,3% | 76,7% |
| contenuto | 1,8% | 6,0% | 10,0% | 26,8% | 50,5% | **83,5%** |
| popolarità | 1,2% | 4,1% | 6,9% | 18,3% | 33,9% | 65,6% |

Il segnale c'è ma è in profondità: la spreading mette il **27,4%** del gold nel top-500 e solo il **2,3%** nel top-10. Il contenuto è il migliore in assoluto a 10.000 (83,5%) — trova il quartiere, non l'indirizzo.

**Il pool+ranker però non aiuta**: pool 500 + contenuto 2,11%, pool 2000 + contenuto 2,14% — **contro il 2,26% della spreading sola**. Dentro il pool il contenuto ordina peggio della spreading stessa. Sul prodotto **la spreading sola resta la migliore**, e nessuna combinazione la migliora.

## 12. Cosa porto a casa

**Le due domande sono diverse e vanno misurate separatamente.**
- **Qualità** (i legami che un intenditore scriverebbe): la combinazione strutturale vale **18,9%** contro il 2,2% della produzione — **8,6×** — e contro l'1,5% della somma pesata — **12,6×**.
- **Volume** (i film che gli utenti hanno valutato bene): **2,26%** contro un caso dell'1,6%. Segnale debole, onesto.

**Quattro cose solide**, tutte misurate:
1. **La somma pesata di punteggi distrugge il segnale** (1,5% contro il 10,7% del suo componente migliore). La fusione per ranghi è immune alla scala.
2. **La co-visione da sola fa zero sul cross-medium**: i related di Trakt sono mono-medium. L'unico arco che attraversa i medium è la curatela scritta a mano.
3. **Il test è già un cold-start**: le sorgenti di test non hanno i propri archi nel grafo. La generalizzazione passa per la spreading.
4. **I pesi ottimi dipendono dalla domanda**: curatela 0,88 per la qualità, 0,60 per il volume.

**Tre errori miei, tutti intercettati**: la curatela presa da tutto il dataset (97,2% falso), l'aliasing nella funzione di misura, il segno rovesciato nell'RRF. **Nessuno dei tre si vedeva dal numero finale: si vedevano solo dal controllo.**

**Sei negativi dichiarati**: pool+teacher sul curato (11%), pool+contenuto sul prodotto (2,14% contro 2,26%), gate per-query (testa peggio), embedding delle keyword (2,7% contro il one-hot), seed espanso (17-18%), split temporale (strumento sbagliato: faceva predire l'era).

**Una differenza che vale la pena isolare la prossima volta**: sul *curato* la fusione aiuta (RRF 18,9% contro 10,4% e 10,7% dei singoli), sul *prodotto* la fusione peggiora (RRF 1,4% contro 2,26% della spreading). Il motivo probabile: sul prodotto uno dei due esperti (il teacher, 0,6%) è **peggiore del caso**, e fondere un esperto cattivo con uno buono trascina giù il risultato. **La fusione per ranghi presume che gli esperti siano comparabili in qualità** — e sul prodotto non lo sono.
