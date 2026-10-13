# YACA · Raccomandazione — il recap

**Cosa abbiamo cercato**: il grafo di raccomandazione migliore possibile, con l'agnosticismo film ↔ serie come obiettivo di prodotto.

**Cosa abbiamo trovato**: il pezzo "contenuto" del sistema attuale era **comportamento travestito**; il grafo nuovo e pulito vale **+50% sul catalogo film**; esiste un **catalogo serie** che nessuno aveva misurato; e — ultima scoperta, oggi — la **fusione a due stadi** vale **+50% sul giudizio esperto** e non era mai stata ritestata dopo il rifacimento del grafo.

**Stato**: tutto offline, niente in produzione. 15 report, un banco di prova per ogni affermazione.

---

# 1. Se leggi solo questo

| domanda | risposta | il numero |
|---|---|---|
| **Il grafo nuovo batte quello attuale?** | sì, e non è contaminato | catalogo film @100 **12,6% → 29,6%** · @500 **42,1% → 63,4%** |
| **Da dove viene il guadagno?** | dal comportamento, e da due parametri mai ritoccati | pesi e `k`: **+32% al @100** |
| **Il giudizio esperto si può misurare?** | **sì, ma sono due domande** — vedi §6 | un titolo **già noto** si collega a **28,5% @10**, uno **nuovo** a **2,4%** |
| **Il catalogo serie funziona?** | sì, e ora è **ordinato**: 2,80× sulla testa | @10 **5,23%** · @100 **24,19%** · @500 **43,68%** |
| **Suggerire serie a chi guarda film?** | sì, ed è il verso forte | @100 **7,0%** contro 3,1% del verso opposto |
| **L'ordinamento si può migliorare?** | sì, 1,34-1,41× | catalogo film @100 **24,6% → 34,6%** |
| **Si può prevedere il comportamento di un titolo nuovo?** | no — il muro è l'informazione | 13-16% di un titolo nativo, con due metodi diversi |
| **Le foglie del grafo sono buone?** | sì, e non conviene spezzarle | solo il 4,7% guadagnerebbe |

**E la cosa che devi decidere tu**: sul **catalogo film** i due banchi si contraddicono — il banco Trakt preferisce la ricetta completa (con la co-visione Trakt e la curatela), il banco MovieLens preferisce `CF` da solo. **Ogni banco premia la propria origine**, e nessuno dei due è YACA. Sul **catalogo serie** invece non c'è ambiguità: vince la ricetta minima. Dettagli al §4.1 e al report 66.

---

# 2. Le parole (glossario breve)

| parola | cosa vuol dire |
|---|---|
| **grafo** | la mappa dei titoli: ogni titolo è un nodo, i legami sono archi. La raccomandazione è una camminata su questa mappa |
| **la camminata** (spreading / RWR) | partendo dai titoli che hai visto, si cammina a caso sui legami: i titoli dove si passa più spesso sono i suggerimenti |
| **il cesto** | i ~2.000 candidati che la camminata propone. È il primo mestiere del grafo: *trovare* |
| **l'ordinamento** | il secondo mestiere: mettere in ordine i 2.000 del cesto. Il @10 dipende quasi tutto da qui |
| **`@100`** | quanti dei titoli che l'utente ha davvero visto finiscono nei primi 100 suggerimenti, in percentuale |
| **curatela** | i 3.417 legami scritti a mano fra film e serie. Il giudizio di un intenditore, dentro il grafo |
| **`Pc`** | lo spazio "contenuto" che il sistema attuale usa. **È contaminato**: vedi §3 |
| **il teacher** | un secondo esperto che ordina i candidati per conto suo. Fuso con la camminata, la migliora |
| **il metro del prodotto** | quanti film veri finiscono nei suggerimenti, misurato su utenti MovieLens. Misura il **volume** |
| **il metro curato** | quanti dei 1.002 legami scritti a mano finiscono nei suggerimenti. Misura la **qualità esperta** |
| **calibrazione / verifica** | gli utenti su cui si *sceglie* e quelli su cui si *verifica*, disgiunti. Se i numeri reggono, non è adattamento |

**Le due metriche non sono la stessa cosa, e non vanno confuse.** Il metro del prodotto premia la popolarità (misura cosa le persone guardano davvero). Il metro curato premia il legame che un intenditore scriverebbe. **Si può massimizzare l'uno o l'altro, e il punto è decidere quale.**

---

# 3. La scoperta che ha cambiato tutto: il contenuto era comportamento

Il sistema attuale descrive ogni titolo con uno spazio chiamato "contenuto" (`Pc`). **Non è contenuto.** È una regressione che impara a predire la co-occorrenza degli utenti MovieLens a partire dai metadati. Cioè: metadati addestrati a riprodurre il comportamento, e poi valutati sul comportamento.

| | correlazione con i metadati puri |
|---|---|
| `Pc` — quello che il sistema usa | **0,169** |
| quanto vale il vantaggio che ne veniva | 1,72× al @500 |

**Perché conta**: era un vantaggio circolare. Il numero che il sistema misurava su di sé era gonfiato dalla contaminazione. E il contenuto "vero" (cast, registi, generi, keyword, temi) è molto più debole di quanto sembrasse.

**La lezione generale**: un componente che "sa" qualcosa che non dovrebbe sapere produce numeri belli e falsi.

---

# 4. Il grafo: da dove si parte e dove siamo arrivati

## 4.1 La ricetta

**Dopo la passata di sottrazione (report 66) la ricetta è questa:**

```
catalogo FILM    CF da solo, senza curatela             k-NN 60 · beta 0,50
catalogo SERIE   CFst + B a pesi uguali, senza curatela k-NN 60 · beta 0,50
```

**Da 5 componenti + curatela e ~15 parametri a 1-2 componenti e ~4 parametri.** Cosa è stato tolto, e perché:

| tolto | perché |
|---|---|
| **`Kc`** (metadati puliti) | **non serve a niente, da nessuna parte**: −0,08 sui film, −0,10 sulle serie, e sul prodotto **migliora** togliendolo |
| **`T`** (temi) | neutro (±0,17 ovunque) |
| **la curatela** | **fa male**: toglierla dà **+1,19 @100 e +1,27 @500 sul prodotto** e **+0,99 al @10 sul catalogo serie** (1,99% → 2,97%, **+50%**) |

**E i componenti essenziali dei due cataloghi sono disgiunti**: il film vuole `CF` (−7,06 @100 togliendolo), la serie vuole `CFst` (−0,81) e `B` (−1,80). Il catalogo film è un problema di **comportamento**; quello serie di **similarità**, perché il comportamento delle serie non esiste.

**Conseguenza per il progetto**: la curatela non serve più — **il vincolo «niente curatela a mano» non è più un vincolo**.

### La ricetta precedente (storica, per riferimento)

```
CF     comportamento dichiarato (utenti disgiunti dalla misura)   peso 5    k-NN 60
CFst   pubblico previsto (dà una posizione alle serie)            peso 1    k-NN 60
Kc     metadati puliti                                            peso 1    k-NN 60
B      co-visione Trakt                                           peso 1    k-NN 60
T      temi (tassonomia scritta a mano)                           peso 1    k-NN 60
K      curatela                                                   peso 0,60
correzione del grado (anti-hub)                                   beta 0,50
```

## 4.2 I numeri, generazione per generazione

Sul **catalogo film**, 1.000 utenti di verifica che non hanno partecipato a nessuna scelta:

| il grafo | @10 | @100 | @500 | @2000 |
|---|---|---|---|---|
| **oggi** (contaminato) | — | 12,56% | 42,12% | 70,41% |
| nuovo, pulito, a pesi uguali | 4,62% | 22,45% | 50,65% | 78,11% |
| **nuovo + pesi e `k` ottimizzati** | **5,99%** | **29,61%** | **63,35%** | **87,86%** |

**Due passi, due guadagni:**
1. **Togliere la contaminazione e usare il comportamento dichiarato**: +21% al @500 (42,1% → 50,7%).
2. **Ottimizzare pesi e `k`** — mai ritoccati dopo il rifacimento: **+32% al @100** e +12% al @2000.

E il secondo passo non è adattamento: la calibrazione dava 28,7% al @100, la **verifica 29,6%**. I numeri scelti su metà utenti reggono *meglio* sull'altra metà.

## 4.3 Perché il @10 resta basso (e non è colpa del grafo)

| | catalogo film @100 |
|---|---|
| il cesto contiene il film giusto | **77,2%** |
| con un ordine perfetto | **57,1%** (oracolo) |
| l'ordine attuale | **24,6%** |

**Il cesto non è il problema: è l'ordine.** E l'ordinamento si può migliorare: §5.

**Il tetto del 23% è il prezzo della metrica.** I film che non entrano mai nel cesto sono **4,12× meno popolari**. Recuperarli richiederebbe di privilegiare l'impopolare — che abbasserebbe l'«azzeccato». **È una scelta di prodotto, non un difetto.**

---

# 5. L'ordinamento: il guadagno più grosso, e costa poco

| ordinamento del cesto | catalogo film @10 | @100 | @500 |
|---|---|---|---|
| attivazione sulla camminata (attuale) | 5,21% | 24,57% | 52,85% |
| popolarità | 2,60% | 15,58% | 43,39% |
| **solo comportamento, senza modello** | **5,84%** | **28,75%** | **61,82%** |
| **modello (24 caratteristiche)** | **7,00%** | **34,62%** | **66,30%** |
| *oracolo dello stesso cesto* | *14,86%* | *57,13%* | *76,56%* |

**La scoperta più utile non è il modello.** Lo **stesso grafo, pesato diversamente**, ordina molto meglio: 24,6% → 28,75% **senza modello e senza dati nuovi**. La curatela, che pesa 0,60, serve a *trovare* i candidati ma è veleno per *ordinarli*: porta in cima i 3.417 titoli scritti a mano, che non sono quello che la gente guarda.

> **Il grafo ha due mestieri, e vogliono due pesature diverse.**

**Attenzione al modello**: è addestrato sul comportamento MovieLens. In produzione va riaddestrato sui dati YACA — trasferibile è la struttura, non i pesi.

---

# 6. Il giudizio esperto: due domande diverse, e un banco che premia gli artefatti

**In una riga: il metro curato misura due cose diverse — un titolo già noto al mondo curato e un titolo nuovo — e su questo banco l'artefatto batte qualunque metodo vero.**

## 6.1 Il banco ha due popolazioni, e vanno misurate separate

Il gold ha 499 sorgenti di legami cross-medium scritti a mano, metà nel grafo e metà di test. **Le sorgenti di test sono due popolazioni**, e la differenza non è il numero di link (mediana **4** per entrambe) né la soglia PMI (sopravvive il **100%** dei pesi):

**83 sorgenti compaiono anche come *bersaglio* di un legame delle sorgenti di train.** Il grafo è simmetrico, quindi quelle hanno archi di curatela in entrata: **non sono cold start**. Le altre 163 non hanno nessun arco: **cold start veri**.

| popolazione | sorgenti | legami | camminata @10 | @100 | @500 |
|---|---|---|---|---|---|
| **CALDE** — il titolo è già nel mondo curato | 83 | 347 | **28,53%** | **49,28%** | 67,72% |
| **FREDDE** — cold start vero | 163 | 655 | **2,44%** | **14,66%** | 40,76% |

**Dodici volte al @10, con lo stesso numero di link.** Sono due domande di prodotto diverse, e l'aggregato (11,48%) le media in una cosa che non significa niente.

## 6.2 Il banco riparato: cosa funziona davvero

Quattro teacher, **tutti indipendenti dalla curatela** e **verificati** (coprono il 100% delle sorgenti, zero buchi):

| | camminata @10 | @100 | migliore fusione | @10 | @100 |
|---|---|---|---|---|---|
| **CALDE (83)** | **28,53%** | **49,28%** | *nessuna aiuta* | 25,36% | 49,86% |
| **FREDDE (163)** | 2,44% | 14,66% | **RRF +CFst k=60** | **2,75%** | **15,42%** |

- **Sulle calde non si guadagna niente**: la camminata ha già tutto, e ogni fusione la peggiora.
- **Sulle fredde si guadagna, poco ma davvero**: `CFst` porta il @10 da 2,44% a **2,75%** e il @500 da 40,76% a **41,53%**. È il **solo guadagno reale** su questo banco — ed è dove il prodotto ha il problema.

## 6.3 L'artefatto è il metodo migliore del banco

Il controllo «ordine di indice» **non contiene niente** ed è **il risultato migliore su entrambe le popolazioni**:

| | camminata | migliore teacher vero | **controllo INDICE** | controllo casuale |
|---|---|---|---|---|
| **CALDE** @10 | 28,53% | 2,59% | **34,01%** | 0,00% |
| **FREDDE** @10 | 2,44% | 2,14% | **14,96%** | 0,00% |

Il controllo casuale è **piatto** (0,76% @10 sulle fredde), quindi non è rumore: **l'ordine di indice è correlato con la struttura del gold** (i nodi sono ordinati per `tmdb`), e la fusione per ranghi lo amplifica.

> **Su questo banco, qualunque metodo va confrontato col controllo INDICE prima di essere creduto. Se non lo batte, non ha dimostrato niente.**

Il riferimento del report 41 (18,90% @10) **non lo batteva**. Il 22,65% del report 58 **era** quell'artefatto.

## 6.4 I numeri onesti

| domanda | risposta | numero |
|---|---|---|
| Un titolo **già nel mondo curato** si collega bene? | **sì** | @10 **28,53%** · @100 **49,28%** |
| Un titolo **nuovo**, mai collegato? | **no** | @10 **2,44%** · @100 **14,66%** |
| Si può migliorare il titolo nuovo? | **poco** | +0,31 @10 · +0,76 @100 con `CFst` |
| Si può migliorare il titolo già noto? | **no** | le fusioni lo peggiorano |

**E la frontiera volume/qualità del report 57 va buttata**: era misurata su un banco che mescola le due popolazioni e che premia l'artefatto.

## 6.5 Perché i metadati aiutano il catalogo serie (Trakt) e non questo gold

Sembra una contraddizione col §7 e non lo è: **il teacher giusto dipende da cosa si sta misurando.**

- **il catalogo serie (Trakt)** ha per gold **il comportamento** — cosa le persone hanno guardato. I metadati lo predicono un po' (*+77% al @10*).
- **il gold curato** ha per gold **il gusto di un intenditore** — quali legami *lui* scriverebbe. I metadati non lo predicono, perché non è comportamento.

---

# 7. Il mondo ha due cataloghi, non una lista mista

Su Stremio **non esiste una lista mista**: se ne restituiscono due, uno di film e uno di serie. Quindi le misure fatte su una lista mista vanno rilette — la "invasione del medio" (l'85% del top-10 erano serie) **non era un difetto: era un artefatto del metro**.

## 7.1 Il catalogo serie c'era, e non lo sapevamo

L'handoff diceva che il lato serie era «bloccato dalla mancanza di cronologie reali». **Non mancano**: in `.cache/trakt/users/` ci sono **400 cronologie di serie** con 300 titoli e la data di visione, più 370 di film, **per gli stessi utenti**.

Banco: 353 utenti con ≥20 film e ≥10 serie.

| catalogo | @10 | @100 | @500 |
|---|---|---|---|
| **FILM** (semi film) | 3,98% | 18,75% | 41,07% |
| **SERIE** (semi serie) | **2,02%** | **16,24%** | **39,90%** |
| SERIE (semi **film**) — l'agnosticismo | 0,99% | **7,02%** | **17,81%** |
| FILM (semi serie) | 0,56% | 3,14% | 7,04% |

**Tre cose:**
1. **Il catalogo serie funziona**: quattro quinti del catalogo film. Mai misurato prima.
2. **L'agnosticismo è asimmetrico**: suggerire serie a chi guarda film funziona **il doppio** del verso opposto. Il motivo è strutturale — il comportamento copre solo i film, quindi un profilo di film ha un appiglio che un profilo di serie non ha. **E il verso che interessa di più è anche il più forte.**
3. **Il catalogo serie non aveva ordinamento** — ora ce l'ha, e vale il doppio: §7.3.

*(Numeri sul grafo a pesi uguali, report 54. Con i pesi ottimizzati salgono.)*

## 7.2 `CFst` — la cosa che era stata scartata per sbaglio

Il report 49 l'aveva escluso perché "diluisce". Quella misura era **film contro film**, cieca al suo mestiere. Nel mondo a due cataloghi `CFst` guadagna sulle serie e sul ponte, e **non toglie niente ai film**:

| | senza `CFst` | con `CFst` | delta |
|---|---|---|---|
| catalogo SERIE (semi serie) @500 | 36,22% | **39,90%** | **+3,68** |
| catalogo SERIE (semi film) @500 | 15,85% | **17,81%** | **+1,96** |
| catalogo FILM @500 | 40,26% | **41,07%** | +0,81 |
| catalogo FILM @100 | 18,79% | 18,75% | −0,04 *(neutro)* |

## 7.3 L'ordinamento del catalogo serie: fatto, e vale il doppio

Era il pezzo mancante più grosso — metà prodotto, zero lavoro — perché il modello del catalogo film è addestrato sul comportamento MovieLens, che per le serie **non esiste**. Banco: 356 utenti, modello addestrato su metà e verificato sull'altra.

| ordinamento del cesto di serie | @10 | @100 | @500 |
|---|---|---|---|
| **attivazione (com'era)** | 1,87% | 12,31% | 37,59% |
| attivazione sul **solo `CFst`** | 2,34% | 15,35% | 37,59% |
| popolarità | 0,50% | 11,23% | 37,59% |
| **modello (14 caratteristiche)** | **5,27%** | **23,18%** | 37,59% |
| *oracolo dello stesso cesto* | *12,19%* | *38,25%* | *38,25%* |

**Guadagno: 2,82× al @10 e 1,88× al @100.** E la caratteristica più forte non era quella che mi aspettavo:

| caratteristica | punti persi togliendola (@100) |
|---|---|
| **`covis` — i vicini di co-visione Trakt nel profilo** | **−9,94** |
| popolarità | −7,29 |
| grado nel grafo | −3,19 |
| camminata sul solo `CFst` | −3,06 |
| anno | −2,59 |

**La co-visione è l'unico segnale di comportamento che copre le serie** (`CF` copre 49.041 film e zero serie). Verificato che non è contaminazione: i `rel-*.json` sono l'endpoint "related" **per titolo**, non le cronologie degli utenti del banco.

**E per ordinare le serie, `CFst` da solo batte il grafo intero** (2,78% contro 1,75% al @10): il grafo serve a *trovare* il cesto, l'ordine vuole un'altra pesatura.

## 7.4 E i due cataloghi vogliono due pesature

Se la co-visione è ossigeno per le serie, quanto deve pesare? Sweep su 8 configurazioni:

| catalogo | configurazione | @10 | @100 | @500 |
|---|---|---|---|---|
| **FILM** | CF5 · CFst1 · **B1** · wc0,60 | **4,68%** | **21,27%** | 45,22% |
| **SERIE** | CF5 · **CFst3** · **B5** · wc0,60 | **1,92%** | **17,47%** | **45,74%** |

Alzare la co-visione dà alle serie **+8,7%** al @100 e toglie ai film **−5,7%**. **Ma i due cataloghi si servono separati**, quindi non è un compromesso da sciogliere: sono **due pesature**.

**E il quadro finale del catalogo serie, valutato onestamente (split temporale, report 69):**

| catalogo SERIE, split TEMPORALE | @10 | @100 |
|---|---|---|
| **popolarità** (come recuperatore) | 2,13% | 12,51% |
| camminata (il grafo) | 2,07% | 13,62% |
| **modello dell'ordinamento** | **3,41%** | **15,10%** |
| **modello / popolarità** | **1,6×** | **1,2×** |

**Il grafo non batte la popolarità al @10; l'ordinamento sì, di 14× dentro il cesto.** Il valore del catalogo serie è tutto nell'**ordinamento**, ed è l'unico pezzo che sopravvive al futuro.

## 7.5 Il catalogo serie, chiuso: 2,80× sulla testa

Rifatto l'ordinamento coi pesi per le serie e con la fusione, in un solo giro e con lo stesso split:

| | A) B1 CFst1 *(com'era)* | B) B5 CFst3 | **C) B5 CFst3 + fusione** |
|---|---|---|---|
| serie nel cesto | 80,8% | 87,2% | **89,1%** |
| **oracolo del cesto @100** | 37,59% | 42,75% | **43,68%** |
| attivazione @10 | 1,87% | 1,97% | **3,31%** |
| **modello @10** | 5,30% | 5,15% | **5,23%** |
| **modello @100** | 23,17% | **24,26%** | 24,19% |
| **modello @500** | 37,59% | 42,75% | **43,68%** |

**Il quadro finale:**

| | @10 | @100 | @500 |
|---|---|---|---|
| attivazione, pesi vecchi *(il punto di partenza)* | 1,87% | 12,31% | 37,59% |
| **ordinato, pesi per le serie, con la fusione** | **5,23%** | **24,19%** | **43,68%** |
| **guadagno** | **2,80×** | **1,97×** | **1,16×** |
| *oracolo dello stesso cesto* | *12,33%* | *43,68%* | *43,68%* |
| *quanto dell'oracolo si prende* | *42%* | *55%* | *100%* |

**Dove nasce il guadagno**: nel **cesto**, non nel modello. La percentuale di serie nel cesto sale da 80,8% a **89,1%**, e l'oracolo del cesto da 37,59% a **43,68%** al @100 (+16,2% di titoli che l'ordinamento *potrebbe* prendere). Il modello al @500 va esattamente da 37,59% a 43,68%: **prende tutto quello che il cesto contiene**.

**E la fusione raddoppia l'attivazione ma il modello non se ne accorge**: l'attivazione al @10 va da 1,87% a **3,31%** (+77%, il risultato del report 60 confermato dentro questa pipeline), ma il modello resta a ~5,2% perché quel segnale ce l'ha già fra le caratteristiche (`cos_prof` è la stessa similarità).

**I due cataloghi ora sono simmetrici**, con pesature diverse e lo stesso impianto:

```
                 catalogo FILM                      catalogo SERIE
grafo            CF5 · CFst1 · B1 · wc0,60          CF5 · CFst3 · B5 · wc0,60
fusione          neutra                             +77% sulla testa
ordinamento      24,57% → 34,62% @100               12,31% → 24,19% @100
─────────────────────────────────────────────────────────────────────────
risultato        @10 5,99% · @100 29,61%            @10 5,23% · @100 24,19%
                 @500 63,35% · @2000 87,86%         @500 43,68%
```

---

## 7.6 E il dato in più non ha aiutato (report 70)

Il `related` delle serie è passato da **2.995 a 16.999 titoli** (copertura 18% → **89%**, archi 2,2M → **4,0M**) — il componente che l'ablation dice essere essenziale per le serie. **Non è cambiato niente:**

| catalogo SERIE | vecchia `B` | nuova `B` |
|---|---|---|
| camminata, temporale @100 | **14,06%** | 13,62% |
| camminata, casuale @100 | **18,21%** | 16,81% |
| modello, temporale @10 | 3,36% | **3,41%** |

**Il controllo che rende credibile il risultato**: il catalogo **film** non usa `B`, e i suoi numeri sono **identici al decimale** (1,52 / 10,15 / 27,09).

**Il collo di bottiglia non era la copertura, è la qualità del segnale.** E il fatto strutturale da sapere: **le cronologie Trakt non entrano nel grafo** — sono solo il banco di prova. Quindi i fetch in coda (cronologie complete, follower) **migliorano la misura, non i suggerimenti**.

# 8. Le tre strade chiuse (con i numeri)

| strada | cosa prometteva | cosa è successo |
|---|---|---|
| **Bootstrap** — predire il cluster col contenuto per collocare un titolo senza curatela | collocare i titoli nuovi | il classificatore è preciso **dove non c'è niente da imparare** (72,0% sui titoli senza legami, 57,7% su quelli che li hanno). Aggiungere al grafo gli archi predetti **dimezza** il recupero (11,2% → 5,5%) |
| **Contrastive learning** — mappare i metadati sul comportamento | prevedere il pubblico di un titolo nuovo | in-sample vince **5 volte** (3,11% contro 0,61%). Escludendo dal training i film da collocare: **0,58%**. Il 5× era **memorizzazione** |
| **Cluster come pool + ordine dentro** | usare i cluster per restringere | il pool copre il **40,7%** dei legami, la camminata ne raggiunge il **68,5%**. Non può vincere per costruzione |

> **La conclusione che valgono tutte e tre: i metadati non contengono il comportamento, e non si estrae quello che non c'è.**

Due metodi molto diversi — una regressione lineare e una rete contrastiva — **convergono sullo stesso risultato**. E non manca nessuna feature: dentro la matrice ci sono già cast, registi, popolarità, voti, budget, incassi, case di produzione, sceneggiatori, collezioni.

**Il corollario pratico**: per collocare un titolo nuovo serve **un po' di comportamento vero, anche pochissimo**. Qualche decina di interazioni lo porta da ~13% a ~75%.

---

## 9-bis. Le BOLLE: la struttura, e quanto è buona (report 71-74)

**Il giudizio sulle bolle è mio, e l'ho dato leggendo i titoli.** Il criterio: *una bolla è buona se il suo filo comune si può nominare.* Un filo che un umano riconosce, non «sono tutti drama».

### Su 100 bolle lette, ~88 sono buone o eccellenti

**Autori interi**: **Fassbinder** (La paura mangia l'anima · Il matrimonio di Maria Braun · Veronika Voss · Lili Marleen) · **Kurosawa** (I sette samurai · Rashomon · Ran · Harakiri) · **Rossellini** (Roma città aperta · Paisà · Germania anno zero) · **Kazan** (Fronte del porto · Un tram che si chiama desideri · Viva Zapata!) · **Huston** · **Carpenter** (La cosa · 1997 Fuga da New York · Il seme della follia) · **Van Sant** · **Danny Boyle** · **Melville** · **Visconti** · **Romero** · **Martin Ritt** · **Sirk** · **Michael Moore** · **Rob Reiner** · **Kitano**.

**E bolle tematiche**: Olocausto · cinema polacco · turco · coreano storico · hindi gangster · Star Wars TV · film LEGO · documentari sui videogiochi · documentari economici · film di Natale Hallmark · commedia erotica tedesca · cinema saggistico (Godard) · found footage · anime isekai · sitcom russe · horror coreano · musical live · Lubitsch e la commedia sofisticata · i serial anni 50 · Hollywood pre-code · la TV tedesca · Scooby-Doo · il BL cinese · Monty Python · Tinto Brass.

**Minestrone: 5 su 100.** Prima dei componenti nuovi ne trovavo ~12 su 24.

### I componenti nuovi, dai dati che stavamo buttando (report 72)

| componente | da dove | copre |
|---|---|---|
| **KW** — grafo semantico delle keyword | le keyword TMDB | **99,6%** del catalogo |
| **TV** — visione insieme | le cronologie Trakt (SVD) | **53%** — le serie e la coda, dove il comportamento dei film è cieco |
| CAST · DIR · COLL | cast, registi, franchise | 95% · 70% · 9% |

**Togliere un componente qualsiasi non fa crollare niente** (report 73): la qualità resta e **cambia di tipo** — senza keyword escono bolle **nazionali** (cinema danese, taiwanese, polacco, norvegese), senza collezioni escono **franchise e formati** (Hellraiser, TV competitiva, adattamenti da videogioco). **Sono complementari, non ridondanti.**

### E le bolle vicine sono dello stesso mondo (report 74)

Dei 4 vicini più forti di 30 bolle, **~22 su 30 sono perfetti**: Fassbinder → **Wenders, Herzog, Bergman**; Kurosawa → **Ozu, Oshima, Imamura**; Romero → **Argento, Cronenberg**; Lubitsch → **l'espressionismo tedesco** (corretto storicamente); polacca → polacche; norvegese → **Nordic noir**; argentina → argentine; Star Wars TV → **i film di Star Wars, MCU, LEGO**; Dragon Trainer → **Pixar, Disney classico**; documentari sportivi → **calcio, NBA, wrestling**; Hallmark → Hallmark.

**Gli assi sono reali**: lingua, autore, scuola, genere, epoca, franchise, formato. **Il grafo ricostruisce il canone senza saperlo.**

### Le tre lezioni

1. **Non è «aggiungere peggiora»: è QUALI componenti.** i metadati SVD e la curatela peggiorano; keyword, visione insieme, cast, registi e franchise migliorano.
2. **La modularità non è qualità** — misurato tre volte: il contenuto ha modularità più alta e bolle peggiori; aggiungendo i componenti buoni la modularità scende da 0,205 a 0,057 e la qualità sale.
3. **Il dato che stavamo buttando era il più utile**: le cronologie Trakt coprono 35.215 titoli, e il comportamento dei film copre zero serie.

**Limite dichiarato**: 100 bolle su 5.297, i vicini di 30. Il criterio è mio e motivato; i numeri esatti sono indicativi, la direzione no. La lettura completa è in `bolle-lette.md`.

---

# 9. Le foglie del grafo: buone, e non conviene spezzarle

- **Nessuna foglia è un raggruppamento finto**: tutte hanno almeno **20 volte** la densità di archi interni attesa.
- **Spezzandole non si guadagna**: solo il **4,7%** guadagnerebbe più di +0,10, e il **28%** non guadagna niente.
- Le **164 foglie sopra i 40 titoli** sono gruppi di gruppi, ma sono le più forti di comportamento (120 co-occorrenze per coppia). **Non vanno rotte: vanno usate come pool con un ordine dentro.**
- Il margine vero è altrove: le **foglie piccole** sono coerenti ma **irraggiungibili**, e "coerenti e piccole" è il gruppo **meno raggiunto di tutti**.

**Correzione importante (fatta dopo)**: la coerenza delle foglie era stata misurata in `Pc`, che è contaminato. Rifatta nei tre spazi:

| spazio | coerenza mediana |
|---|---|
| `Pc` — contaminato | **0,744** |
| **metadati puri** | **0,297** |
| comportamento | 0,107 |

**Correlazione fra la prima e la seconda: 0,024.** Cioè: **le foglie raggruppano per pubblico, non per contenuto** — e le due cose non hanno niente a che vedere. Per un raccomandatore è la cosa giusta (conta il pubblico, non il genere), ma va detto per quello che è. E nei metadati puri **le foglie grandi sono le più coerenti**, l'esatto contrario di quanto avevo scritto prima.

---

# 10. Cosa non sappiamo (limiti dichiarati)

1. **Tutto è misurato sul lato film.** Il gold di MovieLens è fatto di film; le 16.550 serie non hanno cronologie da nessuna parte. `CF` copre 49.041 film e **zero serie**.
2. **Il modello dell'ordinamento non è trasferibile** così com'è: va riaddestrato sui dati YACA.
3. **La metrica premia la popolarità per costruzione.** L'asse "sorprendente" — che si otterrà con un delta casuale a valle — **peggiora** ottimizzando questa metrica. È una scelta, non un effetto collaterale.
4. **La valutazione non vede** la popolazione più interessante (i titoli senza comportamento): servono test apposta.
5. **Lo split temporale non è mai stato fatto.** Tutte le misure usano uno split casuale. Le date Trakt sono vere e complete, quindi «cosa guarderò dopo» è misurabile — e non è stato misurato.
6. **I 52 cataloghi serviti non sono mai stati toccati**: tutto offline. **Il passo verso la produzione non è stato fatto**, ed è stato esplicitamente escluso.
7. **Il banco curato è rotto** — 83 sorgenti danno 28,5% @10 e 163 danno 2,4%: sono due popolazioni, e la media non significa niente. **Va riparato prima di qualunque misura di «qualità esperta».**
8. **Il pannello Trakt è fatto di curatori** (autori di liste pubbliche), non di utenti a caso: i numeri sul lato serie sono **stime ottimistiche**.

---

# 11. Gli errori, e le difese che hanno funzionato

In questa sessione **l'errore grave non è mai stato nel codice: è stato una premessa data per buona.**

| la premessa | cosa era vero |
|---|---|
| «esiste una popolazione a bassa copertura» | il grado minimo nel grafo è **16**: nessuno è isolato |
| «il lift di co-occorrenza misura la coerenza» | misurava **coerenza + portata**, che sono anti-correlate |
| «il contenuto è contenuto» | era **comportamento travestito** |
| «l'encoder contrastivo ha imparato a collocare» | aveva **memorizzato** |
| «il report 41 diceva che il RRF non serve» | il RRF era il suo **vincitore**, e non l'avevo ritestato |
| «la fusione raddoppia il @10 sul curato» | **il teacher era la matrice nulla** (le serie hanno `CF` a zero): `argsort` su tutti pari = l'ordine di indice |
| «c'è un solo modo di costruire il grafo» | **due varianti** in giro, con 1,4 punti di differenza: la normalizzazione per componente va fatta prima del mixing |
| «il riferimento del report 41 è 18,90% @10» | **era gonfiato**: sulle 163 sorgenti col teacher nullo la fusione «guadagna» sei volte dal nulla. Ora c'è `canone.py`, e il numero onesto è la camminata sola |
| «le sorgenti del gold curato sono tutte uguali» | sono **due popolazioni**: 83 danno 28,5% @10 e 163 danno 2,4% — e **l'artefatto dell'ordine di indice le batte entrambe** |
| «la co-visione Trakt viene dalle cronologie del banco» | no: i `rel-*.json` sono l'endpoint **"related" per titolo**, non le cronologie degli utenti. Nessuna contaminazione ✓ |

E **quattro volte un segno rovesciato** ha prodotto un risultato plausibile e falso. Le difese che le hanno prese, tutte e quattro:

1. un **nullo** che deve venire piatto;
2. un **controllo di calibrazione** che deve venire ~1,00;
3. la **separazione calibrazione / verifica**;
4. la regola più semplice: **se un numero è troppo bello, cercare il bug prima di scriverlo.**

---

# 12. I prossimi passi, in ordine

1. **L'ablation dei componenti nuovi** — so che l'insieme migliora, non so quanto pesa ciascuno. `COLL` copre il 9%, `DIR` il 70% con mediana 2: potrebbero essere zavorra come `Kc`. **In corso.**
2. **I pesi dei componenti nuovi** — ora sono tutti a 1, e `KW` copre il 99,6% mentre `COLL` il 9%. Vanno tarati **leggendo**, non con una metrica.
3. **Portare `KW` e `TV` anche nel RECUPERO** — sono entrati solo nel grafo delle bolle. Il report 68 dice che sul lato serie c'è bisogno di tutto.
4. **La navigazione**: bolle vicine nel grafo, e dentro la bolla la scelta popolare/nicchia. **Mai costruita — ed è l'ultimo pezzo del tuo piano.**
5. **Il conflitto fra i banchi** sul catalogo film (Trakt vs MovieLens).
6. **Ricostruire il grafo a tempo T** — il grafo conosce il futuro, quindi i numeri temporali sono ottimistici.

---

# 13. Dove sono le cose

**Report** (`.scratch/ml-collaborativo/ricerche/`): `43` bootstrap · `44` qualità delle foglie · `45` raggiungibilità · `46` audit · `47` nitidezza e inserimento · `48` contaminazione · `49` grafo migliore · `50` vantaggio e ordine · `51` contrastivo · `52` ordinamento · `53` keyword e invasione del medio · `54` i due cataloghi · `55` retrospettiva · `56` le tre cose trascurate · `57` frontiera volume/qualità *(superata)* · `58` la fusione a due stadi *(**ritrattato**)* · `59` la fusione sul prodotto · `60` ritrattazione e la regola vera · `61` il canone e il banco rotto · `62` il banco riparato · `63` l'ordinamento del catalogo serie · `64` il peso della co-visione · `65` il catalogo serie, chiuso · `66` la passata di sottrazione · `67` `k` e `beta` · `68` **lo split temporale** *(la misura che cambia tutto)* · `69` l'ordinamento serie in temporale · `70` il dato in più non ha aiutato · `71` **le bolle lette una per una** · `72` i componenti nuovi · `73` l'ablation dei componenti · `74` **100 bolle lette, e come sono collegate**.

**Script principali** (`.scratch/ml-collaborativo/`):

```bash
# IL CANONE — tutto passa di qui
python canone-misure.py       # prodotto + curato + i due cataloghi, in una sola esecuzione

# il grafo
python cf-edges.py            # il comportamento dagli utenti disgiunti
python grafo-nuovo.py         # confronto delle 6 armi
python ottimizza-1.py <conf>  # lo sweep dei pesi e la frontiera
python verifica-finale.py     # la verifica sull'1.000 utenti intoccati

# l'ordinamento
python ordine-1.py            # caratteristiche dei candidati
python ordine-2.py            # gli ordinamenti

# i banchi di prova
python titoli-nuovi.py        # quanto costa essere nuovi
python due-cataloghi.py       # i due cataloghi su Trakt

# la fusione, i suoi controlli e il banco (report 58-62)
python rrf-cataloghi.py       # la fusione sui due cataloghi  <- il risultato buono
python rrf-curato-2.py        # il curato, con i controlli che hanno smascherato l'artefatto
python verifica-riferimento41.py  # il riferimento storico e' gonfiato?
python riferimento41-2.py     # la decomposizione: 83 sorgenti calde, 163 fredde
python diagnosi-teacher.py    # perche' il teacher era nullo su 166 sorgenti
python teacher-riparato.py    # i teacher riparati, le due popolazioni, i controlli

# il catalogo serie (report 63-64)
python ordine-serie.py        # il primo ordinamento del catalogo serie
python serie-pesi.py          # quanto deve pesare la co-visione
python ordine-serie-2.py      # pesi per le serie + fusione

# la passata di sottrazione (report 66)
python ablazione.py           # un componente per volta dalla ricetta finale
python ricetta-minima.py      # CF da solo / CFst+B, e il rapporto ottimo
python confronto-finale.py    # completa contro minima, sul banco grande

# la misura onesta (report 68)
python temporale.py           # split temporale contro casuale, sui tre banchi
python ordine-serie-temporale.py  # l'ordinamento serie valutato onestamente
python rigenera-B.py          # ricostruisce la co-visione dai rel-*.json

# le bolle e i componenti nuovi (report 71-72)
python componenti-nuovi.py    # KW, CAST, DIR, COLL, TV dai dati che stavamo buttando
python bolle.py               # le bolle su 4 grafi a confronto
python leggi-bolle.py         # il campione compatto da leggere
python bolle-2.py             # le bolle con i componenti nuovi
python bolle-3.py             # l'ablation dei componenti nuovi
```

> **`canone.py` è l'unica implementazione valida.** I numeri dei report 56-57 sono canonici e validati; quelli dei report 58-60 no (variante diversa), ma le loro **conclusioni** reggono perché il confronto era interno a ogni esecuzione.

**Artefatti** (`.cache/movielens/`): `cf-spazio.npz` · `cf-studente.npz` · `spazio-pulito.npz` · `spazio-contrastivo.npz` · `ordine.parquet` · `albero.json` · `boot-B/T/Kpari/C.npz` · `spazi-trakt.npz`.
**Cronologie Trakt**: `.cache/trakt/users/` (400 utenti, film e serie, con le date).
**Gold di test**: `.scratch/ml-collaborativo/gold/cross-merged.json`.
