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

**La terza ondata — cosa ha imparato (13/10/2026)**

Altri due ticket: [16](issues/16-gating-cold.md) (il gating λ_cold) e [18](issues/18-componente-liste.md) (le liste curate).
Report: [`16-gating.md`](ricerche/16-gating.md), [`18-liste.md`](ricerche/18-liste.md).

1. **✅ La spiegazione del gating è verificata** ([16](ricerche/16-gating.md)): «metadati ovunque» costa **−4,12 al @100 e −7,34 al @500**, e il gating lo rimuove. Il plateau è τ0 ∈ [1, 20], e il guadagno migliore è **+0,25 al @100**. È il risultato più solido della terza ondata: la ragione per cui la struttura faceva male era giusta.
2. **❌ Ma i titoli freddi non esistono** ([16](ricerche/16-gating.md)): `d_behav = 0` su **654 film su 49.709** — il grafo del comportamento copre il 96,3% del catalogo, quindi la popolazione che il gating doveva servire **è quasi vuota**. Il ticket 15 aveva visto lo stesso fatto da un altro lato (il filone dominante pesa il 2,6%): **il grafo è troppo connesso per avere popolazioni separate.**
3. **✅ Le liste curate portano segnale vero** ([18](ricerche/18-liste.md)): le coppie della stessa lista si somigliano **6,9×** più del caso. È la prima volta in questa sessione che un dato di **curatela pura** supera una verifica comportamentale invece di fallirla.
4. **E migliorano il recupero di +0,52 al @100** a peso 0,5 — il guadagno più grande visto finora. **Ma peggiorano mezzo+coda di −1,34 al @500**: le liste sono fatte di titoli noti, spingono sulla testa del catalogo, e la metrica che conta per il prodotto è la coda. **Il componente migliora il numero che non conta e peggiora quello che conta**: non è un rifiuto, è una condizione (va riequilibrato in uscita).
5. **Il «megadump da 1.500 titoli» non esiste**: le liste sono cappate a 100 item, il rapporto di peso è **4,20×** e il peso per lunghezza fa poco. Il disegno dell'esperto poggiava su un dato che il raccoglitore non produce.

**LA CURATELA COME SUPERVISIONE PAGA** (19). Nove pesi appresi dai legami curati delle sorgenti a indice pari, valutati sui 1.002 legami delle sorgenti dispari (mai visti). Guadagno sulla ricetta canonica: **+2,59 al @10, +6,99 al @100, +8,38 al @500** (+18% al @500, oltre 5 errori standard). E il controllo con negativi CASUALI perde di 8,68 mettendo tutto il peso su `Kc` (un artefatto): il protocollo dei negativi **e' la differenza fra imparare e non imparare**.

**LA CO-VISIONE E' IL GUADAGNO PIU' GRANDE, E NON E' CONTAMINAZIONE** (17). Con 5 fold in cui TV si costruisce sui 4/5 degli utenti e si valuta sull'1/5 mai visto: catalogo **serie da 2,86% a 5,04% al @10 (+77%)**, e anche il catalogo **film migliora** (+1,09 al @10). **5 fold su 5**, delta con deviazione standard ±0,05-0,21. E' l'unico risultato della sessione che sopravvive a un protocollo che esclude per costruzione la fonte del segnale dall'utente valutato — la differenza fra una speranza e un fatto.

**MA IL PONTE CROSS-MEDIUM NON FUNZIONA** (17): il caso serie→film **peggiora** (−0,15 al @100, −1,43 al @500, 5 fold su 5). La frase «TV è l'unico segnale che attraversa il confine» è vera del **dato** e falsa dell'**uso**: metterlo nel grafo del catalogo di partenza infittisce quel lato e la camminata resta lì. **Il ponte va costruito esplicito** — per esempio la co-occorrenza *nella stessa cronologia* fra un film e una serie, che è un dato che abbiamo e non è stato usato in questa forma.

**LA LETTURA SMONTA LA RIFINITURA** (08). La risoluzione adattiva — il ticket con i criteri più
concreti — ha i numeri tutti a favore: bolle utilizzabili **+12,6%**, micro-bolle **dimezzate**,
145 chimere su 215 divise, i film-portale presenti (*Ant-Man*, *La sirenetta*, *Halloween*). E la
lettura di 14 bolle toccate dice: **4 divisioni su 4 spezzano un mondo coerente** (true crime in
due true crime, telenovelas in due telenovelas, corti Disney in due corti Disney) e **6
dissoluzioni su 6 distruggono mondi nominabili** (seinen anime, slice-of-life giapponese, romance
asiatico, iyashikei).

**Verdetto: tenere C (assorbimento delle briciole) e D (film-portale), buttare A (split delle
chimere) e B (dissoluzione delle pattumiere).** Il criterio della densità non distingue «due mondi
fusi» da «un mondo grande», e la purezza non misura la coerenza: un anime ha legami con altri
anime per studio, attori e autore anche quando il mondo è strettissimo.

**È la quarta volta che un indicatore strutturale premia ciò che l'occhio condanna**: la
modularità (tre volte), λ₂ e la purezza (05), il conteggio delle bolle (07), e ora il conteggio di
nuovo (08) — e stavolta il meccanismo è **visibile**: il +12,6% viene dall'aver rotto bolle buone.

**Conseguenza diretta per il ticket 07**: il suo +19,9% di bolle utilizzabili, che la lettura non
ha verificato, va guardato con **sospetto attivo** — un aumento di quella taglia si ottiene anche
rompendo i mondi, e finché nessuno legge le bolle di F non si sa da quale delle due cause viene.

**I DUE TICKET DELLA MAPPA SONO IN CONFLITTO** (09 e 11). La sparsificazione (09) fa il suo lavoro — mediana dei vicini da 1.103 a 5, nessuna bolla isolata dopo il ripiego — e le adjacency vere sono conservate (Fassbinder → *Il tamburo di latta*, Star Wars TV → i film, i mostri anni '50 → *I Was a Teenage Werewolf*). Ma **il k-NN MUTUO frammenta la mappa in 117 componenti connesse**, e la gerarchia (11) su quella base **non può avere 25-35 macro-mondi**: qualunque partizione di un grafo con 117 componenti ne ha almeno 117. L1 esce a 133 gruppi con mediana **1 bolla**.

**Il conflitto è misurato, non ipotizzato**: 5.297 nodi con grado massimo 8 possono avere al più 21.188 archi in un grafo connesso, e ne abbiamo 19.264 (il 91%) — ma la struttura è a grappoli, e **i ponti fra i grappoli sono esattamente ciò che il filtro mutuo taglia**.

**Prima dei ticket 12-13 serve una garanzia di connettività**: un albero di copertura sui ponti (un centinaio di archi in più), o un k più alto accettando 7-10 vicini, o il k-NN non mutuo (che però è asimmetrico, e una mappa asimmetrica non si naviga). **Costruire la mappa su una base frammentata sarebbe costruire su un difetto noto.**

**LA LEVA POPOLARE/NICCHIA FUNZIONA E NON SBAGLIA MAI** (14). Due coordinate dentro la bolla, un solo parametro globale. **Mai vuota su 1.237 bolle piccole**, dove un parametro globale ne romperebbe **259 (20,9%)**; e la porta non è il membro più votato nel **78%** dei casi. Verificata su una bolla dove il massimo sono 25 voti. ⚠️ Eredita però la qualità delle bolle: nella bolla Star Wars il deep cut include *Star Trek Into Darkness*.

**Il filo che unisce la terza ondata**: i due ticket dicono la stessa cosa da due lati — **il grafo è omogeneo**. Troppo connesso per avere titoli freddi (16), e le aggiunte migliorano la testa a spese della coda (18). La prossima domanda da farsi, prima di aggiungere altri componenti, è se **la coda vada cercata dentro la struttura che già c'è** invece che in un componente nuovo.

**Ma il guadagno del 19 va letto con cautela**: i pesi appresi sono **uniformi** (1/9 ciascuno), quindi non viene dal *pesare* — viene dall'**usare quattro componenti che a mano valevano zero** (TV, KW, DIR, CAST) e dal **dimezzare CF**. La controprova è banale e non è stata fatta: **pesi uniformi senza apprendere niente**. Se danno lo stesso risultato, il metric learning ha aggiunto poco rispetto a «usa tutto a peso uguale». **È la prima cosa da fare se questo filone riprende.**

**TRE MISURE INDIPENDENTI DICONO CHE LA STRUTTURA E' TROPPO FRAMMENTATA** (05, 11, 20). E' il risultato con cui la fase si chiude, ed e' piu' utile dei guadagni: dice DOVE intervenire.

- **05**: le bolle giudicate cattive sono **piccole** (15-35 titoli), e la caccia alle chimere ne guarda >35.
- **11**: il grafo sparsificato ha **117 componenti connesse**, quindi la gerarchia a 25-35 macro-mondi e' **impossibile** (L1 esce a 133 gruppi con mediana 1 bolla).
- **20**: la curatela collega bolle che sono **lo stesso mondo diviso in due** — MCU ↔ MCU, anime ↔ anime, con il 98,4% delle coppie curate fuori dal grafo.

**Il ticket 23 nasce da qui**: una sparsificazione che non frammenti, prima di costruire la mappa (ticket 12 e 13). Tre strade (albero di copertura sui ponti, k piu' alto, k-NN non mutuo), da provare e leggere.

**E un numero da correggere ovunque**: i «3.417 legami curati» di handoff, specifica e ticket 18-19-20 **non sono riproducibili**. Sono **1.004 di training + 1.002 di test = 2.006**. Non cambia le conclusioni (anzi rende il ticket 19 piu' forte: 111 vincoli per incognita) ma e' il numero che giustifica «non puo' andare in overfitting», e va corretto.

**LA MAPPA E' RICONNESSA, E LA COLPA ERA DELLA RECIPROCITA'** (23). Quattro varianti, misurate e lette:
- **k-NN DIRETTO (non mutuo), simmetrizzato**: **5 componenti** invece di 143, mediana grado **8**, zero bolle ≥15 isolate, **6 coppie verificate su 6** (l'unica che le conserva tutte). La reciprocita' era la causa della frammentazione: un mondo piccolo con un legame forte verso uno grande raramente riceve il ritorno, quindi il filtro mutuo taglia **i ponti asimmetrici fra grappoli**, che sono i ponti per definizione.
- **mutual k=8 + albero di copertura**: 5 componenti con **+138 archi (+0,59%)**, e le 12 ricuciture lette sono tutte relazioni reali.
Il ticket 12 (gli 8 vicini tipizzati) e' **sbloccato**, e la scelta consigliata e' il k-NN diretto (mediana 8 = il bersaglio del ticket). ⚠️ Il ticket 11 va riprovato su `bolle-archi-23.npz`: era il primo consumatore del risultato.

**LA MAPPA ESISTE** (12). Sul k-NN diretto del ticket 23 la base è **1 sola componente connessa** e **tutte le 5.297 bolle hanno 8 slot tipizzati**, zero isolate. Le sei adjacency verificate sono tutte nella mappa col tipo giusto. E la lettura: Fassbinder ha **7 slot su 8** di cinema tedesco/europeo d'autore, i mostri anni '50 **8 su 8** (fino a *Il mostro della laguna nera*), e la bolla di commedie polacche riceve come slot cross-medium **una serie polacca** — la promessa del prodotto realizzata dentro il grafo.

⚠️ **Ma il ponte cross-medium non si può garantire per tutte**: solo il **19,4%** delle bolle ha ≥2 slot cross-medium e il **59,8%** ne ha zero, perché ci sono **4.385 bolle film contro 912 serie**. Il ponte va garantito **nel catalogo servito**, non nel grafo. Il ticket 13 (la direzionalità) lo eredita.

**LA DIREZIONALITA' FUNZIONA, E SI LEGGE NEI DUE VERSI** (13). L'accessibilita' si calcola sui **membri core** (il 55% dei membri per bolla) e il controllo la giustifica: **su 907 bolle** usare tutti i membri avrebbe spostato l'accessibilita' di **un fattore 2 o piu'**. I segni sono quasi bilanciati (14.707 approfondimenti contro 13.906 allargamenti), l'85,7% delle bolle li ha entrambi, e la lettura conferma: un mondo di **nordic noir da 32 voti** ha un arco verso il **noir mainstream da 25.061** (allargamento), un mondo di **supereroi di nicchia da 21 voti** verso i **teen superhero da 14.798**.
⚠️ **757 bolle (14,3%) hanno un segno solo** e non sono state verificate. ❌ E il segno **non e' ancora disponibile al recupero**: si calcola sulle bolle, la ricetta lavora sui titoli.

## LA FASE SI CHIUDE — 23 ticket su 23 (13/10/2026)

**LA RICETTA DEL TICKET 21 E' SUPERATA — il ticket 24 la ridecide (13/10/2026).**

Il 21 aveva scelto film = CF + TV(0,5) misurando la recall GLOBALE (+0,385 al @10, +1,210 al @100). Poi `21-bis-coda.py` ha misurato le tre metriche insieme:

| R1 - R0 | @10 | @100 | @500 |
|---|---|---|---|
| GLOBALE | +0,385 | +1,210 | +1,173 |
| **MEZZO+CODA** | **-0,151** | **-0,994** | **-1,834** |

**TV migliora la testa e peggiora la coda. La ricetta e' stata scelta sulla metrica che il prodotto ha dichiarato di NON volere**, e la decisione non vale: ticket 24.

**E non e' un caso isolato: e' il QUARTO parametro di fila che migliora la testa e peggiora la coda** — LIST +0,52 globale / -1,34 coda; TV +1,21 / -0,99; gating +0,25 / -0,57. **L'unica eccezione e' il decadimento** (+0,13 / +0,17).

La spiegazione: ogni componente che porta **comportamento** porta con se' il gusto della **maggioranza**, che e' il gusto popolare. Aggiungerlo alza la recall globale (dominata dalla testa) e abbassa quella della coda.

**La regola che ne esce, e vale piu' della ricetta: in questa fase ogni decisione va presa con le TRE metriche affiancate.** Una sola metrica, qualunque sia, ha gia' premiato quattro volte la cosa sbagliata.

L'INVARIANZA CROSS-DOMINIO E' SODDISFATTA, e verificata per la prima volta: **TV, estratta dalle cronologie Trakt, migliora il banco MovieLens di +0,39 al @10 e +1,21 al @100** -- ed e' il primo componente della sessione che migliora ENTRAMBI i banchi. Sul banco Trakt (5 fold, utenti mai visti) da +1,09 al film e **+2,19 alla serie**.

Restano fuori, con la ragione scritta: **le liste** (+0,20 al @100 non paga -1,34 su mezzo+coda), il **decadimento** (+0,13, zero al @10), il **gating** (+0,25 ma -0,50 al @500), i **pesi appresi** (misurati su un banco solo).

E il ticket 04 ha riportato la divergenza che il 03 aveva aperto: il grafo ricostruito sul solo passato va **peggio** del completo (-1,59 al @100, -5,42 al @2000), quindi **la conoscenza del futuro aiuta e i numeri temporali sono ottimistici** -- con un confondente dichiarato (la copertura: 29.854 film contro 49.041).

**I tre guadagni verificati della fase**: la co-visione nel recupero (+77% sul catalogo serie, 5 fold su 5), la curatela come supervisione (+8,38 al @500 sui legami di test), e la leva popolare/nicchia (mai vuota su 1.237 bolle dove un parametro globale ne romperebbe 259).

**I quattro indicatori strutturali che hanno premiato cio' che l'occhio condanna**: modularita' (3 volte), lambda2 e purezza, il conteggio delle bolle (07), e il conteggio di nuovo (08) -- dove il meccanismo e' visibile: il +12,6% veniva dall'aver rotto bolle buone.

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
