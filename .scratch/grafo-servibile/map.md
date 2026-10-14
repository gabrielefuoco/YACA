# Mappa: il grafo servibile — bolle nitide, mappa navigabile, misura onesta

**Aperta**: 13/10/2026 · **Tracker**: markdown locale, `.scratch/grafo-servibile/issues/` · **Stato**: aperta
**Specifica**: [`spec.md`](spec.md)
**Origine**: la risposta di un esperto (`Ottimizzazione e Futuro del Grafo YACA.md`) al documento di handoff
(`.scratch/ml-collaborativo/handoff-senior.md`), che era la sintesi dei report 43-74.
**Precedente**: [`.scratch/ml-collaborativo/`](../ml-collaborativo/map.md) — la fase di ricerca, chiusa.

## Destination

**Da oggetto di ricerca a struttura servibile.** Il grafo non deve più rispondere alla domanda «esiste
una rappresentazione migliore?» — la risposta è sì, e i report 43-74 l'hanno dimostrata. Deve rispondere a
tre domande operative:

1. **Le bolle sono mondi nominabili?** Oggi ~88 su 100 lo sono. Devono diventarlo di più, e la qualità deve
   diventare una misura tracciabile invece di una lettura a mano che non scala e non confronta.
2. **Si può attraversare la mappa?** Oggi no: 5.297 bolle piatte con una mediana di **1.103 vicini** sono
   un elenco, non una mappa. Servono otto vicini scelti, una gerarchia a tre livelli, e la leva
   **Popolare / Nicchia** dentro la bolla.
3. **I numeri sono difendibili?** Oggi no: il banco di giudizio esperto è rotto in due popolazioni che si
   mediano, lo split casuale gonfia di 2-3×, e il grafo conosce il futuro.

**Il traguardo concreto**: una struttura tale per cui, data la storia di uno spettatore, si sappia dire
*in quale mondo si trova*, *quali mondi confinano col suo*, *quale è la porta d'ingresso di quel mondo* e
*quale è il deep cut* — e si possa **dimostrare con un numero** che una configurazione è migliore di
un'altra, senza sapere in partenza quale vincerà.

## Decisions so far

1. **Il "sorprendente" cambia definizione, e non è apprendibile né parametrico.** Non è una temperatura sui
   punteggi finali: alzare la temperatura produce scelte **sub-ottimali**, cioè rumore uniforme, non scelte
   sorprendenti. Il sorprendente vero è **deterministico** — **alta affinità comportamentale a fronte di
   alta distanza nei metadati** — e diventa visibile nella mappa come **tipo di ponte** (canonico / *vibe* /
   collisione lessicale). È la decisione concettualmente più importante di questa mappa, e corregge una
   premessa del documento di partenza.
2. **La misura si stratifica e si pesa, non si sostituisce.** La recall globale resta come numero di
   sanità; le metriche che decidono sono la **recall su mezzo+coda** (fuori dalla testa di popolarità) e la
   **recall pesata per auto-informazione**. Il banco curato si divide in **caldo (83) / freddo (163)** e
   non si media mai più.
3. **Il test si fa a tempo T, a due livelli.** Il mascheramento istantaneo degli archi comportamentali sui
   titoli usciti dopo `T − 90 giorni` (che costa zero) e uno **snapshot globale** a una sola data di taglio
   (che costa un build). Se i due livelli divergono, si riporta la divergenza, non si media.
4. **Le bolle si collegano su due assi separati, mai sommati.** Asse comportamentale e asse strutturale:
   la matrice sommata serve a **trovare** le bolle, non a collegarle. Il titolo-level continua a sommare.
5. **Il grafo delle bolle si sparsifica per normalizzazione, mai per soglia assoluta.** L'informazione
   mutua puntuale positiva più il filtro di disparità (o un *k* vicino mutuo). Una soglia assoluta
   taglierebbe fuori le bolle d'autore e lascerebbe iper-connessi i mainstream: è il modo sbagliato di
   sbagliare, ed è escluso per costruzione.
6. **Le otto quote per bolla**, e non un numero qualunque: quattro di continuità canonica, due di salto
   *vibe*, **due riservati al ponte film ↔ serie**. L'agnosticismo fra i medium diventa una proprietà
   garantita del grafo, non una speranza.
7. **La leva Popolare / Nicchia è locale alla bolla.** Purezza interna × percentile di popolarità locale,
   con **un solo** pavimento di sicurezza globale. Un parametro globale restituirebbe zero titoli dentro i
   mondi di nicchia — è la modalità di fallimento da escludere in partenza.
8. **Il collo di bottiglia è il cesto, non l'ordinamento.** Il tetto raggiungibile è al 12% e il modello ne
   prende già il 29%. L'investimento va sulla generazione dei candidati: semi pesati per recency e
   allocazione multi-bolla. Il ranker si **pota** a 3-4 caratteristiche monotone (13 caratteristiche su 531
   utenti danno un divario calibrazione/verifica del 42%).
9. **I titoli nuovi entrano dal gating condizionato al grado**: il blocco strutturale pesa zero sui nodi
   caldi e uno sui nodi freddi. È la spiegazione del perché i metadati «facevano male» nell'ablation.
10. **La curatela torna dalla porta di servizio.** Non come archi nel grafo (distorcono la camminata),
    non come embedding denso (memorizza): come **vincolo su 8-10 pesi scalari** (3.417 equazioni non
    possono fittare 8 incognite) e come **proiezione sulle bolle** (i «mondi affini»).
11. **Si abbandonano quattro pezzi**: la fusione a due stadi (nata per rattoppare a valle, neutra sul
    prodotto, ha prodotto il falso positivo più costoso), gli spazi densi sui metadati, l'ottimizzazione su
    split casuale, e la modularità come criterio di qualità (misurata tre volte e mai correlata).
12. **La decisione fra ricette si prende con una regola scritta prima**: invarianza cross-dominio +
    minimax normalizzato. Un negativo dichiarato è un risultato ammesso.
13. **Le quattro cuciture sono confermate** (13/10/2026): il modulo canonico, il modulo delle misure, il
    costruttore delle bolle, il costruttore dei componenti. Bolle e componenti vivono **accanto** al modulo
    canonico, non dentro.
14. **Il micro-banco nativo non si fa** (13/10/2026, ticket 22 `wontfix`): gli utenti attuali di YACA «sono
    test casuali» dell'autore, quindi un banco su di loro sarebbe **il terzo banco rotto** della sessione,
    dopo quello curato e quello a split casuale. La decisione di ricetta dichiara di decidere senza.

## Not yet specified

- **Quanti macro-mondi** vengono davvero in L1 (l'ipotesi è 25-35) e se sono mondi o bolle un po' più
  grandi: lo dirà la lettura, non la risoluzione.
- **Il peso della curatela proiettata sulle bolle**: quanti degli otto slot reclamerebbe. Da decidere
  leggendo, non applicando in silenzio.
- **Il numero di parametri liberi alla fine**: oggi quattro. I pesi appresi dai legami curati devono
  *sostituire* le scelte a mano, non sommarsi — ma se nascessero nuovi parametri (per esempio `tau0` del
  gating, l'emivita del decadimento) il conto va rifatto e dichiarato.
- **Cosa si fa dei 14 ticket aperti del filone precedente**: alcuni sono superati da questa mappa
  (il trasferimento alle serie, le liste servite), altri no. Va fatta una passata di chiusura.

## Out of scope

- **Qualsiasi modifica a `src/` e alla produzione.** Fase offline, come tutte le precedenti.
- **Riscrivere la pipeline di serving** e i cataloghi serviti.
- **Nuove famiglie di modelli** (transformer, autoencoder, reti contrastive sui metadati) come prima leva.
- **La fusione a due stadi (RRF)**: da ritirare, non da estendere.
- **La riparazione della vecchia gerarchia ad albero**: si sostituisce, non si aggiusta.
- **L'embedding a due dimensioni per la mappa**: escluso per struttura (sei assi non entrano in un piano).
- **Lo Space HuggingFace**: morto; il deploy è sul server `mate`.

## I controlli obbligatori (la disciplina di questa mappa)

Ogni misura porta accanto, **sempre**, i suoi controlli: **la popolarità** (il predittore marginale
imbattibile), **l'ordine di indice** (il controllo che ha smascherato il falso positivo più costoso di
questa sessione), **il teacher nullo**, **la permutazione casuale** (che deve dare zero). Più un quinto:
quando un componente della parte serie cambia, **i numeri del catalogo film devono restare identici al
decimale**.

Il motivo è nel verbale dei report 43-74, e vale la pena rileggerlo prima di ogni misura nuova:

- un «raddoppio del @10» che era l'**ordine di indice** su una matrice nulla;
- un riferimento storico (18,90% @10) gonfiato dallo **stesso** artefatto;
- un banco di giudizio esperto **rotto in due popolazioni** distanti 12×, che si mediano a vicenda;
- tutti i numeri su split casuale **gonfiati di 2-3×** rispetto a quello temporale;
- il raddoppio della copertura della co-visione che **non ha cambiato niente** (il collo di bottiglia non
  era la copertura);
- la modularità scambiata per qualità, tre volte.

## La prima ondata — cosa ha imparato (13/10/2026)

Cinque ticket della frontiera, tutti chiusi: [01](issues/01-recall-stratificata.md),
[02](issues/02-banco-caldo-freddo.md), [03](issues/03-mascheramento-temporale.md),
[05](issues/05-diagnostiche-bolle.md), [06](issues/06-giudice-automatico-bolle.md).
Report in [`ricerche/`](ricerche/).

**Tre cose che cambiano il piano:**

1. **Il segno della perdita temporale è invertito** ([03](ricerche/03-mascheramento.md)). Il grafo
   che «conosce il futuro» non gonfia i numeri: li **abbassa**. Mascherando i titoli freschi la
   camminata va meglio (@100 18,94% contro 18,21%), e il placebo con la stessa quantità di archi a
   caso va molto peggio (15,98%). La premessa con cui questa mappa è nata era falsa nel verso in cui
   la dicevamo. **Il collo di bottiglia non è il leakage: è lo split stesso, e resta il cesto.**
2. **Lo split delle chimere non copre le minestrone** ([05](ricerche/05-diagnostiche.md)). Le bolle
   che l'occhio giudica cattive hanno **15-35 titoli** e purezza **normale** (0,176 contro 0,168 di
   mediana): la caccia alle chimere guarda le bolle con più di 35 titoli, quindi **il ticket 08
   ripara una popolazione che non è quella malata**. Va riorientato o dichiarato fuori portata.
3. **La regola dei testimoni non basta** ([05](ricerche/05-diagnostiche.md)): porta la mediana da
   961 a **47** vicini, non a ~6, e lascia **177 bolle isolate**. Il ticket 09 ha ancora bisogno di
   PMI+ e disparità, **e di un ripiego esplicito** per le bolle che restano senza vicini.

**Due cose che reggono:**

4. **I due assi sono indipendenti** (r = +0,070 sui 200.000 collegamenti comportamentali più forti;
   PMI strutturale zero nel 75,4%): la tassonomia a tre tipi del ticket 10 ha una base misurata, e il
   ponte *vibe* non è un caso raro — è la condizione normale dei collegamenti forti.
5. **Il giudice automatico funziona** ([06](ricerche/06-giudice.md)): 52,8% contro il 20% del caso,
   388 token per bolla. Ma misura la **separabilità**, non la **nominabilità** — e quella resta
   compito dell'occhio. E con 200 bolle non distingue partizioni che distano 6 punti: serve ~1.090
   bolle per lato.

**Due controlli che erano scritti male, e vanno riscritti prima di riusarli** (li eredita il ticket 21):

- **Il quinto controllo obbligatorio** — «un componente della parte serie non deve muovere i numeri
  del catalogo film» — è **falso per il grafo canonico**: `boot-B.npz` (co-visione Trakt, serie→serie)
  ha mosso i numeri film di 0,05 punti al @100, e la causa è dimostrata riproducendo il numero vecchio
  con la B vecchia. In un grafo misto **non esiste** un componente «della parte serie». Vale solo per
  la ricetta minima. Da riscrivere come: *«un componente che non tocca alcun titolo del catalogo
  servito non deve muoverne i numeri»*.
- **Il controllo no-op del ticket 03** confrontava due array lavorati diversamente e dava «DIVERSO»
  su una macchina corretta. Un controllo sbagliato è più pericoloso di nessun controllo: produce una
  certezza. **Terza volta in questa sessione che un artefatto nasce da uno strumento.**

## ⚠️ Un claim della specifica è in dubbio (13/10/2026, ticket 15)

La specifica dice, nel Problem Statement, che **sul catalogo serie il grafo non batte la popolarità al
@10** (2,07% contro 2,13%). Quel numero viene dal report 69 e **non l'ho potuto riprodurre**.

Ricostruendo il banco temporale Trakt (1.534 utenti) e applicando il **metodo archiviato**, la
popolarità dà **0,05 / 1,28 / 9,98** dove il report 69 riporta **2,13 / 12,51 / 33,27**. Le due cose
non coincidono, quindi i due banchi non sono lo stesso banco — e **non ho stabilito quale sia
giusto**. Sul banco che riesco a ricostruire, il grafo vincerebbe di **40×**, non perderebbe.

Vale la pena notare che la stessa verifica **sul catalogo film è andata bene**: la popolarità
archiviata (0,94 / 7,36 / 25,04) si riproduce **al centesimo** con il metodo archiviato, quindi il
metodo è corretto e il problema è nel **banco serie** (soglia di storia? definizione dell'oro?
versione delle cronologie?).

**Finché qualcuno non ricostruisce il banco di `ordine-serie-temporale.py`, quel claim va letto come
dubbio.** E' la seconda volta in questa sessione che un numero sul lato serie non regge alla
riproduzione.

**La seconda ondata — cosa ha imparato (13/10/2026)**

Due ticket della nuova frontiera: [15](issues/15-cesto.md) (il cesto) e [07](issues/07-componenti-specificita.md) (i componenti).
Report: [`15-cesto.md`](ricerche/15-cesto.md), [`07-componenti.md`](ricerche/07-componenti.md).

1. **Il decadimento sui semi aiuta ma di pochissimo** ([15](ricerche/15-cesto.md)): **+0,13 punti al @100**, +0,44 al @500, **zero al @10**. L'attesa di «recuperare una quota consistente del crollo temporale» non è confermata: il crollo è di 50-64 punti al @10, il rimedio ne recupera un decimo al @100. Il segno è coerente e la memoria lunga batte quella corta (365 meglio di 180), quindi il segnale c'è — ma è piccolo.
2. **Le quote multi-bolla sono dannose** (−3,92 al @500) **e la premessa non regge**: con 5.297 bolle il filone dominante di un utente pesa il **2,6%**, non «3-5 filoni». Il rimedio combatte un nemico che a questa granularità non esiste. Se un giorno servisse, andrebbe fatto sui **macro-mondi L1** (ticket 11), non sulle bolle atomiche.
3. **I quattro interventi sui componenti non sono dimostrati** ([07](ricerche/07-componenti.md)): le bolle utilizzabili salgono del **19,9%** (1.293 → 1.550) ma il giudice automatico non vede niente (53,3% → 51,0%, p ≈ 0,65). **Due indicatori, due storie opposte**: e il ticket 05 ha già stabilito che il conteggio è un proxy che sbaglia. L'unico giudice che resta è **la lettura**, e va fatta nel ticket 08.
4. **Tre negativi dichiarati dentro il 07**: il controllo di ubiquità del cast **fallisce** (i 16 attori più prolifici pesano solo 1,2× meno del tipico — l'IDF schiaccia tutto); il filtro KW2 tiene **esattamente il 50%** perché la soglia *è* la mediana (una tautologia, non un risultato) e pota anche **wuxia**; l'ablation non è stata rifatta.
5. **Una trappola di strumento, per la terza volta**: i controlli di popolarità del ticket 15 passavano un **rango** a una funzione che applica `K.ranghi` (che vuole un **punteggio**), invertendola. Il bug l'ho trovato perché **due strade indipendenti davano numeri diversi** e il valore archiviato ne indicava un terzo. Il numero archiviato (0,94/7,36/25,04) era **corretto** e si riproduce al centesimo. Con un solo strumento avrei archiviato 0,00% come un fatto.

## Effort collegati

- [`.scratch/ml-collaborativo/`](../ml-collaborativo/map.md) — la fase di ricerca. Da lì vengono il modulo
  canonico, i componenti, i banchi e i report 43-74. **Questa mappa non la contraddice**: ne mette a terra
  le conclusioni. I 22 ticket vecchi contengono 14 voci ancora aperte, alcune superate da qui.
- [`.scratch/livello-latente/`](../livello-latente/) — il DNA deterministico, già in produzione: fornisce
  la filosofia del decadimento temporale (`computeTimeDecay`).
- [`.scratch/qc-cataloghi/`](../qc-cataloghi/) — ha già affrontato il rumore di corti e trailer nei
  cataloghi serviti: qui si riusa la stessa distinzione dentro il grafo (ticket 07).
- `.scratch/ocean-prototipo/` — respinto come asse di scoring; il principio che l'ha respinto («una
  rappresentazione densa serve solo se porta informazione nuova») resta valido e ha guidato questa mappa.
