# 55 — Retrospettiva: cosa è stato trascurato, cosa è stato scartato per ignoranza

**La richiesta**: analizzare tutto il lavoro e vedere se qualcosa di fondamentale è stato trascurato, o se qualcosa è stato scartato per ignoranza che ora abbiamo colmato.

**L'esito**: sì, su entrambi i fronti. **Una metrica è stata abbandonata a metà sessione** senza accorgersene (la sola che misura il cross-medium secondo un giudizio esperto), **due conclusioni della sessione precedente poggiano su un input che oggi sappiamo contaminato**, e **una cosa che avevo riproposto era già stata scartata** e non lo sapevo.

---

## PARTE A — TRASCURATO

### A.1 · Il metro curato è stato abbandonato a metà sessione (il buco più grosso)

Il report 48 ha scoperto che `Pc` era contaminato e il report 49 ha costruito il grafo nuovo. Da lì in poi **tutto è stato rimisurato sul prodotto (MovieLens, solo film) e su Trakt** — ma **i 1.002 legami cross-medium scritti a mano non sono mai stati rimisurati**. Erano l'unico giudizio **esperto** sul ponte fra i medium, ed erano rimasti fermi al grafo vecchio (10,4% con la spreading sola, 18,35% col RRF).

Rifatti ora (`curato-nuovo.py`, 443 s):

| grafo | @10 | @50 | @100 | @500 | @2000 |
|---|---|---|---|---|---|
| NUOVO, curatela 0,40 | 6,9% | 15,3% | 20,2% | 43,1% | 66,0% |
| NUOVO, curatela 0,60 | 10,4% | 17,3% | 24,0% | 46,5% | 67,4% |
| **NUOVO, curatela 0,88** | **10,6%** | **21,6%** | **27,3%** | 48,1% | 68,6% |
| **NUOVO + CFst, curatela 0,60** | **10,7%** | 18,9% | 26,4% | **49,5%** | **71,7%** |
| solo comportamento CF, curatela 0,60 | 9,4% | 18,4% | 21,0% | 33,9% | 52,8% |
| **VECCHIO CONTAMINATO (riferimento)** | **10,6%** | 18,1% | 25,0% | 46,9% | 68,2% |

**Tre cose che valgono:**

1. **Il grafo nuovo è solo marginalmente meglio sul curato** (27,3% contro 25,0% al @100, 10,6% contro 10,6% al @10). Il guadagno del report 49 (+20% al @500) era **tutto sul lato prodotto**: sul giudizio esperto cross-medium, il grafo contaminato non stava poi così male — perché la contaminazione *era* comportamento, e il comportamento aiuta anche a indovinare i legami esperti.
2. **`CFst` è la variante migliore in profondità** (71,7% @2000 contro 68,2%): terza conferma indipendente che va tenuto.
3. **Il peso della curatela dipende dalla domanda** — 0,88 per la qualità, 0,60 (o meno) per il volume — **e la conclusione del report 41 regge sul grafo pulito**. Non era un artefatto della contaminazione. Questa è una buona notizia: era l'unico risultato "scomodo" della sessione vecchia.

### A.2 · I pesi e i k del grafo non sono mai stati ritarati sul grafo pulito

`k=15` per i k-NN e la massa 0,40/0,60 sono **eredità dell'era contaminata**: il 15 viene dal report 41, il 0,60 dal report 41 §11. Il report 49 ha diviso la massa non-curatela **in parti uguali per correttezza del confronto**, non perché fosse l'ottimo. Nessuno ha mai fatto uno sweep di `k` (5/15/30/60) né della ripartizione (0,40/0,60, 0,50/0,50, 0,30/0,70) **sul grafo nuovo**. Il curato sopra mostra che 0,88 batte 0,60 *per quella metrica*: cioè il peso conta ancora, e non è stato esplorato.

### A.3 · Il tetto è la popolarità, e la cura dell'hub non è mai stata validata sulla copertura

Il 22,9% dei film che non entrano mai nel cesto — misurato ora, `cosa-manca.py`:

| | nel cesto | mai raggiunti | rapporto |
|---|---|---|---|
| **voti MovieLens (mediana)** | **13.691** | **3.324** | **4,12×** |
| popolarità (percentile) | 98,4° | 93,8° | 1,05× |
| **ha il vettore comportamentale** | 100,0% | **99,9%** | — |

**Non sono titoli senza segnale: sono titoli 4 volte meno popolari.** Il tetto non è l'informazione, è la popolarità.

E qui c'è il buco: il report 32 aveva già diagnosticato l'hub («il rumore sono i film super-popolari che co-occorrono con tutto») e aveva concluso **«la cura è già in casa»** — ma l'aveva verificato **sul metro curato**, mai sulla copertura del recupero. E la cura in casa vale per il *teacher* (peso 1/log(1+n), PPMI, k-NN 200): **il grafo non ha nessuna correzione dell'hub.** Un film super-popolare sta nel top-15 di migliaia di nodi, quindi ha un grado effettivo enorme e domina la camminata. È esattamente il fenomeno che il report 32 aveva dichiarato risolto altrove.

### A.4 · L'audit delle foglie è stato fatto nello spazio contaminato

La coerenza 0,744, il "non sono migliorabili spezzandole", i 164 gruppi — tutto misurato **nello spazio `Pc`**, cioè in uno spazio piegato dal comportamento. La conclusione può reggere (le foglie sono buone), ma **la misura non è indipendente dal comportamento**: va rifatta con lo spazio pulito per sapere se le foglie sono buone *di contenuto* o *di pubblico*.

### A.5 · La dimensione temporale non esiste

Nessun profilo ha una nozione di **recency**: un film visto dieci anni fa pesa come uno visto ieri. E lo **split temporale non è mai stato fatto** — quindi tutta la valutazione risponde a «sapresti ritrovare il 40% dei miei film scelto a caso», non a «cosa guarderò dopo». Sono due domande diverse, e la seconda è quella del prodotto. Le date esistono (Trakt: 100% delle voci).

### A.6 · L'ordinamento del catalogo serie non esiste

Metà del prodotto, zero lavoro di ordinamento, e le caratteristiche devono essere serie-specifiche. Già segnalato.

---

## PARTE B — SCARTATO PER IGNORANZA CHE ORA ABBIAMO COLMATA

### B.1 · «Il comportamento non serve più: basta contenuto 1,0 + anno 0,15» (report 32)

Questa è la conclusione da **riaprire**, ed è la più importante della lista. Il report 32, con l'A/B pulito su tutti gli utenti, trovò che **la componente comportamentale valeva zero** e che il contenuto da solo (peso 1,0) più la prossimità d'anno (0,15) dava il punteggio migliore: **84,9**.

Ma quel "contenuto" era **`Pc`, che il report 48 ha dimostrato essere comportamento MovieLens travestito**. Quindi il risultato si legge al contrario: *«il comportamento, se lo travesti da contenuto, batte il comportamento dichiarato»* non vuol dire che il comportamento non serva — vuol dire che in quello spazio c'era già tutto e l'aggiunta esplicita era ridondante.

**Sul grafo pulito il risultato si ribalta**: il comportamento dichiarato domina (report 49-50), e il contenuto puro è il componente più debole. **Il report 32 va riletto, non cancellato**: la sua lezione metodologica («un'ipotesi giusta non implica che la cura non sia già in atto — verifica se la pipeline la contiene») resta valida; la sua conclusione numerica no.

### B.2 · La curva di recall del contenuto («trova il quartiere, non l'indirizzo»)

Il 68,6% @10.000 del contenuto — la frase che ha orientato tutta la sessione precedente — **era comportamento recuperato**. Il contenuto *puro* sta a 51,05% @2000 (report 48). La distinzione "generatore di candidati, non ranker" resta giusta nel ruolo, ma il merito era del comportamento.

### B.3 · La messa a punto della composizione (curatela 0,88 / 0,60)

Fatta su un grafo contaminato. **Rivalidata ora sul grafo pulito (§A.1): regge.** Questa va tolta dalla lista dei sospetti.

### B.4 · `film-emb.npz` scartato a 2,7% contro il one-hot

All'epoca motivato con «non è semantica: i suoi archi vengono dall'adiacenza appresa da MovieLens». **Il report 48 ha confermato la diagnosi** e l'ha estesa a tutto `Pc`. Scarto corretto.

### B.5 · Una cosa che avevo riproposto senza sapere che era già stata scartata

Nel report 45 ho proposto il **"leaf-aware seeding"** («seminare l'attivazione anche dalle foglie che il profilo tocca») come rimedio per le foglie coerenti e piccole. Il report 41 aveva già testato la forma generale — il **seed espanso** — e l'aveva scartata: *«dare alla sorgente anche i vicini come seme peggiora (17,1-18,4% contro 18,9%). Il meccanismo era già dentro la camminata: il restart tiene vivi i vicini raggiunti, e aggiungerli a mano li diluisce.»*

Non è identica (i vicini lì erano di contenuto/comportamento, qui sarebbero i compagni di foglia), ma è **la stessa idea con un altro nome** e stavo per ripercorrerla. Va messa nella lista dei "non riprovare" insieme alle altre.

---

## PARTE C — DUE AFFERMAZIONI DELL'HANDOFF CHE ERANO FALSE

1. **«Il caso prodotto con le serie è bloccato dalla mancanza di cronologie reali»** — le cronologie erano già state scaricate la sera stessa (9 ottobre, 21:03-21:28, `fetch-trakt-users.js`) e non sono mai state usate. Mi è costato mezza giornata di lavoro prima di controllare.
2. **«Nel DB YACA ci sono 2 documenti di watchhistory»** — sono **200 documenti** (2 proprietari × 100 voci) più **7.294 impressioni** e **214 item di libreria**. Non è un pannello utilizzabile, ma non è "2 documenti": è un utente vero con quattro mesi di telemetria.

---

## Cosa farei, in ordine di quanto costa poco

| # | cosa | costo | perché |
|---|---|---|---|
| 1 | **Sweep di `k` e dei pesi sul grafo nuovo** | 1-2 h di calcolo | è l'unico parametro mai ritoccato dopo il cambio di grafo, e il curato mostra che il peso conta ancora |
| 2 | **Correzione dell'hub nel grafo** (grado massimo, o peso 1/log) | poche ore | spiega il 23% irraggiungibile ed è la cura che il report 32 aveva dato per presente — nel grafo non c'è |
| 3 | **Rifare l'audit delle foglie sullo spazio pulito** | 1 h | per sapere se le foglie sono buone di contenuto o di pubblico |
| 4 | **Split temporale su Trakt** | poche ore | risponde alla domanda vera del prodotto invece che a quella che abbiamo scelto noi |
| 5 | **Ordinamento del catalogo serie** | giorni | metà del prodotto, mai toccata |
| 6 | **Il collaudo sul dominio vero** (copertura + posizione, sul DB) | un pomeriggio | l'unica misura che non può mentire sul dominio — già dimostrata con 1 utente |

E due cose da **non** riprovare, ora che si sa: il **seed espanso / leaf-aware seeding** (scartato nel report 41, riproposto da me nel 45) e la **conclusione del report 32 sul comportamento** (misurata su uno spazio contaminato).
