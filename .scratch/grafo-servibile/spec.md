# Specifica: il grafo servibile — bolle nitide, mappa navigabile, misura onesta

**Aperta**: 13/10/2026 · **Tracker**: `.scratch/grafo-servibile/issues/` (22 ticket) · **Mappa**: [`map.md`](map.md) · **Stato**: aperta
**Origine**: la risposta di un esperto al documento di handoff (`handoff-senior.md`), a sua volta sintesi dei report 43-74.
**Precedente**: `.scratch/ml-collaborativo/` — la fase di ricerca. Questa specifica ne eredita le conclusioni e le mette a terra.

---

## Problem Statement

Chi apre YACA in Stremio oggi riceve suggerimenti **che avrebbe trovato da solo**. Le proposte sono
guidate dalla popolarità: il catalogo ha una coda lunghissima, e la coda resta invisibile.

La causa non è il grafo: è **il righello con cui l'abbiamo misurato**. La `recall@N` premia chi indovina
la classifica globale — e la popolarità è un predittore imbattibile su quella parte, insensibile allo
scorrere del tempo. Ottimizzarla significa gonfiare i titoli famosi, cioè **lavorare contro metà
dell'obiettivo dichiarato**: *sorprendente + azzeccato + agnostico*.

Da qui tre difetti visibili a chi usa il prodotto:

1. **Il medium è un muro.** A chi guarda film non arrivano serie che vivono nello stesso mondo, e
   viceversa. L'unico ponte nel recupero è una predizione da metadati.
2. **I titoli nuovi e di nicchia non esistono.** Un titolo appena uscito si collega **dodici volte
   peggio** di uno già noto: non ha comportamento, e il comportamento è quasi tutto ciò che il grafo
   sa usare.
   > **In dubbio dal 13/10/2026** (ticket 15): il numero «2,07% contro 2,13%» del report 69 **non è
   > riproducibile** sul banco che si riesce a ricostruire, dove il grafo vincerebbe di 40×. Vedi la
   > cautela nella [mappa](map.md). Il claim non va usato finché il banco serie non è ricostruito.
3. **Non c'è modo di esplorare.** Non si può chiedere «più cose come questa, ma meno ovvie», perché
   non esiste una struttura da attraversare — esistono 5.297 gruppi di titoli che nessuno ha ancora
   collegato in modo navigabile.

E un problema che riguarda noi, non l'utente: **non sappiamo più misurare**. Il banco di giudizio
esperto è rotto (due popolazioni che si mediano a vicenda), il test con lo split casuale gonfia tutto
di 2-3×, il grafo conosce il futuro, e ogni banco premia i componenti nati da sé stesso.

## Solution

Tre cose, in quest'ordine.

**Un righello che non premia la fama.** La misura si stratifica per popolarità e si pesa per
auto-informazione: indovinare un titolo di nicchia vale 8-15 volte indovinare una serie famosa. Le
metriche diventano **un ponte** fra due configurazioni, non un trofeo. E il test si fa **a tempo T**:
si azzera il comportamento dei titoli che l'utente non poteva ancora conoscere, così il numero non è
più ottimista di quanto meriti.

**Bolle più nitide.** I titoli si raccolgono in **mondi nominabili** — oggi ~88 su 100 lo sono, e si
può salire. Si tolgono gli attori-turnisti e le keyword generiche che fanno da super-colla, si separano
i corti e i *making-of* dai film, si aggiunge il segnale che manca (chi produce: studio, rete, paese +
decennio), e le bolle fusionate per colpa di un film-ponte si dividono. Esponenti di confine come
*Alien* o *Blade Runner* smettono di dover scegliere una sola casa.

**Una mappa per attraversare i mondi.** I collegamenti fra le bolle si sparsificano passando da una
mediana di **1.103 vicini** a **otto vicini scelti**: quattro per continuità (stessa scuola, stessa
epoca), due per il **salto che vale la pena** — stesso pubblico, mondi diversi — e **due riservati al
ponte film ↔ serie**. Sopra le bolle si costruisce una gerarchia a tre livelli, così la mappa ha una
porta d'ingresso. E dentro ogni bolla c'è la leva **Popolare / Nicchia**, che funziona *rispetto agli
altri membri di quella bolla*: mai globale, altrimenti «Popolare» dentro *Cinema Polacco* non
restituisce niente.

**e, in mezzo, la cosa che cambia il significato di "sorprendente".** Il documento di partenza dava per
scontato che *sorprendente* fosse una temperatura sui punteggi finali. **È falso**: alzare la
temperatura non produce scelte sorprendenti, produce scelte **sub-ottimali** — rumore uniforme. Il
sorprendente vero è **deterministico** ed è questo: *alta affinità comportamentale, alta distanza nei
metadati*. Il pubblico di *Noir anni '70* e quello di *Anime cyberpunk* è lo stesso; i metadati no.
Quella è la definizione che il prodotto userà, e la mappa la rende visibile come tipo di collegamento.

## User Stories

### Guardare

1. Come spettatore che ha visto solo film, voglio che mi vengano proposte serie che vivono nello
   stesso mondo, così che il medium non sia un muro.
2. Come spettatore che ha visto solo serie, voglio che mi vengano proposti film dello stesso mondo,
   così che il prodotto sia davvero agnostico e non solo dichiarato tale.
3. Come spettatore con un gusto preciso e stretto, voglio suggerimenti **dentro** quel gusto, così che
   non mi venga proposto l'ennesimo titolo famoso che non c'entra.
4. Come spettatore curioso, voglio **vedere i mondi** a cui appartiene la mia storia, così che il
   prodotto mi dica qualcosa di me invece di elencarmi titoli.
5. Come spettatore curioso, voglio passare da un mondo a uno **adiacente**, così che l'esplorazione
   sembri un viaggio e non un'estrazione casuale.
6. Come spettatore, voglio sapere **perché** due mondi sono vicini (stesso regista, stessa scuola,
   stesso pubblico, stessa epoca), così che io possa decidere se fidarmi del salto.
7. Come spettatore di un titolo di nicchia, voglio che il mio titolo sia collocato nel mondo giusto
   anche se nessuno l'ha ancora guardato, così che la coda del catalogo non sia invisibile.
8. Come spettatore che ha appena visto qualcosa di poco noto, voglio ricevere suggerimenti dello stesso
   filone, così che il prodotto funzioni anche fuori dal mainstream.

### La leva

9. Come spettatore che vuole andare sul sicuro, voglio una **porta d'ingresso** alla bolla — il titolo
   canonico e accessibile di quel micro-mondo — così che il primo passo non sia un azzardo.
10. Come spettatore che vuole scavare, voglio un **deep cut** della stessa bolla — fedelissimo al filo
    ma poco battuto — così che la nicchia non richieda di uscire dal mondo che ho scelto.
11. Come spettatore, voglio che la leva Popolare/Nicchia **non restituisca mai vuoto**, così che il
    controllo funzioni anche dentro i mondi piccoli.
12. Come spettatore, voglio che «Popolare» dentro *Cinema Polacco* restituisca comunque cinema
    polacco, così che la leva non mi tradisca portandomi fuori dal mondo.
13. Come spettatore, voglio che «Nicchia» dentro un mondo di blockbuster non mi proponga film
    amatoriali da dodici voti, così che scendere di notorietà non significhi scendere di qualità.

### Il salto che vale la pena

14. Come spettatore, voglio che il prodotto sappia distinguere un salto **azzeccato** (mondi lontani
    che piacciono alle stesse persone) da una **collisione lessicale** (due titoli che condividono una
    keyword generica e nient'altro), così che il sorprendente sia affidabile e non casuale.
15. Come spettatore, voglio che il sorprendente **non** sia rumore: voglio suggerimenti inattesi ma
    che si rivelino giusti, così che non perda fiducia nel prodotto dopo due tentativi a vuoto.
16. Come spettatore a cui è piaciuto un'opera di confine (*Alien*, *Blade Runner*, *Ran*), voglio
    poter raggiungere **entrambi** i mondi a cui appartiene, così che il mio gusto non venga
    appiattito sulla sua componente prevalente.
17. Come spettatore, voglio che gli accostamenti assurdi per epoca — un film muto del 1925 dentro un
    thriller anni '90 per tre keyword condivise — non accadano.
18. Come spettatore, voglio che un cortometraggio o un *making-of* non mi venga proposto come se fosse
    un film, così che il formato non inquinì la proposta.

### Il viaggio

19. Come spettatore, voglio una **mappa con una porta d'ingresso**: mondi ampi, poi costellazioni, poi
    i mondi atomici, così che l'esplorazione parta da qualcosa di comprensibile.
20. Come spettatore, voglio che la mappa non mi faccia attraversare **1.103 collegamenti** per bolla,
    così che il grafo non sia una palla di rumore.
21. Come spettatore, voglio che ogni mondo abbia **pochi vicini scelti**, così che la scelta sia una
    proposta e non un elenco.
22. Come spettatore, voglio che i ponti verso l'altro medium siano **garantiti**, così che
    l'agnosticismo sia una proprietà del grafo e non una speranza.
23. Come spettatore, voglio sapere se un arco mi **porta più in profondità** (verso la radice d'autore
    di ciò che ho appena visto) o mi **allarga l'orizzonte** (verso qualcosa di più accessibile), così
    che io possa scegliere il tipo di serata.
24. Come spettatore con interessi multipli, voglio che i suggerimenti coprano tutti i miei mondi
    attivi, così che non mi venga restituito un medio indistinto.

### Seguire

25. Come spettatore, voglio che i suggerimenti pesino di più ciò che ho visto **di recente**, così che
    le proposte seguano il mio gusto mentre si sposta.
26. Come spettatore, voglio che i titoli appena usciti entrino nel grafo **da chi sono** (regia, cast,
    keyword, produzione) e non dal comportamento che non hanno ancora, così che le novità non siano
    dodici volte peggiori di un classico.
27. Come spettatore, voglio che la coda lunga sia raggiungibile, così che il catalogo di YACA valga
    qualcosa di più della sua testa.

### Mantenere

28. Come manutentore, voglio un righello che **non premi la popolarità**, così da poter confrontare due
    configurazioni senza sapere in partenza quale vincerà.
29. Come manutentore, voglio il banco di giudizio esperto **diviso in due popolazioni** (calda e
    fredda) e mai mediato, così che le due non si annullino a vicenda.
30. Come manutentore, voglio poter **confrontare due partizioni di bolle senza leggerne cento a mano**,
    così che la qualità delle bolle diventi una misura tracciabile.
31. Come manutentore, voglio che il test temporale **non sia ottimista** — il grafo non deve conoscere
    il futuro dei titoli che l'utente non poteva vedere — così che i numeri siano difendibili.
32. Come manutentore, voglio **una regola scritta prima di vedere i numeri** per decidere fra due
    ricette, così che la scelta non sia «il banco che mi dà ragione».
33. Como manutentore, voglio un banco **nativo di YACA**, così da sapere se il nostro pubblico somiglia
    di più a quello che abbiamo usato per misurare.
34. Come manutentore, voglio usare la **curatela come supervisione** e non come archi nel grafo, così
    che la conoscenza dell'intenditore serva senza distorcere la camminata.
35. Come manutentore, voglio che ogni misura porti accanto il suo **controllo** (popolarità, ordine di
    indice, teacher nullo, permutazione casuale), così che un artefatto non passi per scoperta — è già
    successo due volte in questa sessione.

## Implementation Decisions

### La misura

1. **Si aggiungono due metriche accanto alla recall globale, che resta solo come numero di sanità.**
   *Recall stratificata*: l'oro di test si divide in tre fasce per quantili di popolarità globale
   (testa: top 5%; mezzo: 5-25%; coda: sotto il 25%) e si riporta separatamente la fascia **mezzo+coda**.
   La popolarità fa il 100% dei suoi punti sulla testa e **zero** su mezzo e coda: la recall fuori dalla
   testa isola il segnale vero.
   *Recall pesata per auto-informazione*: ogni successo pesa `(-log2 P_pop)^γ` con γ ∈ [0,5; 1,0] invece di 1.
2. **Il banco curato non si media più.** Le 83 sorgenti calde (con grado comportamentale) misurano la
   qualità della camminata; le 163 fredde sono un banco dedicato ai **titoli nuovi**. Ogni report
   riporta la coppia, mai la media.
3. **Il test onesto si fa a due livelli.** *Livello 1, mascheramento istantaneo*: per ogni utente tagliato
   al tempo T, si azzerano gli archi comportamentali dei titoli usciti dopo `T − 90 giorni`, lasciando
   attivi i componenti noti all'uscita (pubblico previsto, keyword, regia, cast, produzione); i titoli
   usciti dopo la fine della finestra di test sono esclusi dal cesto. *Livello 2, snapshot globale*: una
   sola data di taglio al 75° percentile dei timestamp, una sola ricostruzione del comportamento.
   > **Esito misurato il 13/10/2026** (ticket 03, [report](ricerche/03-mascheramento.md)): **il segno
   > della perdita è invertito.** La mascherata va *meglio* del non mascherato (@100 18,94% contro
   > 18,21%, @500 47,78% contro 46,14%), e il placebo — la stessa quantità di archi tolta a caso — va
   > *molto peggio* (15,98% e 42,03%): la differenza fra le due manovre è 3,0 punti al @100. La
   > conoscenza del futuro non gonfia i numeri, li abbassa. La frase «il grafo conosce il futuro,
   > quindi i numeri sono ottimistici» **non va più usata**: era la premessa con cui questa specifica
   > è nata, ed è falsa nel verso in cui la dicevamo.
4. **La definizione di "sorprendente" cambia**: non è una temperatura sui punteggi finali — alzare la
   temperatura produce scelte sub-ottimali, non sorprendenti. È **alta affinità comportamentale a fronte
   di alta distanza nei metadati**, ed è deterministica.

### Le bolle

5. **Due assi separati, mai sommati, per collegare le bolle.** Asse *comportamentale* (comportamento,
   co-visione, co-occorrenza nelle liste) e asse *strutturale* (regia, cast, keyword, produzione). Il
   titolo-level continua a usare la matrice sommata per trovare le bolle; **le bolle si collegano sugli
   assi separati**.
6. **La tassonomia dei ponti** che ne esce guida la mappa: *canonico* (alto su entrambi: stessa scuola e
   stesso pubblico), *vibe* (alto sul comportamentale, basso o nullo sullo strutturale: mondi diversi,
   stesso pubblico — è il sorprendente), *collisione lessicale* (nullo sul comportamentale, alto sullo
   strutturale: il rumore da potare).
7. **Pesi di specificità nei componenti strutturali.** Nel cast, la presenza pesa per **posizione nei
   titoli di testa** (i primi ruoli contano, il nono nome quasi zero) e per **concentrazione tematica**
   (inverso dell'entropia dei generi e dei paesi della carriera): un caratterista ubiquo non deve fare
   da super-colla fra mondi incompatibili. Nelle keyword, un filtro di **coerenza comportamentale**: una
   keyword sopravvive solo se le coppie di titoli che la condividono hanno similarità comportamentale
   sopra la media — così cadono le keyword strutturali ma non estetiche (tratto da un libro, sequel,
   scena dopo i titoli di coda, *flashback*).
8. **Maschere di formato.** Un titolo sotto i 45 minuti ha archi ridotti verso i lungometraggi; un
   documentario ha archi ridotti verso la fiction, salvo comportamento forte. Serve a impedire che il
   *making-of* di un franchise rubi posto nella bolla del franchise.
9. **Un componente nuovo: la firma produttiva.** Non «entrambi USA», non «entrambi anni '90» — la
   **combinazione**: studio o rete di nicchia (A24, Ghibli, Shaw Brothers, Toho, Cannon, Hammer, HBO
   anni 2000), oppure paese non statunitense + decennio + genere. Copertura alta, e impedisce gli
   anacronismi.
10. **Risoluzione adattiva dopo la partizione.** *Split delle chimere*: per ogni bolla grande o con
    conducibilità bassa, un taglio spettrale a due vie sul sottografo indotto; se la densità fra le due
    metà è sotto un quarto della densità interna, la bolla si divide. *Assorbimento delle briciole*: le
    bolle da 1-3 titoli (non franchise chiusi) si riassegnano al vicino di peso massimo. *Multi-appartenenza
    solo per i film-portale*: un titolo con purezza alta nella propria bolla e un legame secondario netto
    con un'altra (almeno tre nodi accoglienti) resta primario in una ed è **ospite** nell'altra.

### I collegamenti

11. **Aggregazione core-to-core**: il peso fra due bolle soma gli archi pesati per la **purezza interna**
    dei due estremi, così gli archi che partono da un intruso o da un blockbuster di confine vengono
    abbattuti di ordini di grandezza.
12. **Regola dei testimoni disgiunti**: un arco fra due bolle esiste solo se coinvolge almeno tre coppie
    disgiunte di titoli (o un matching bipartito di cardinalità ≥3). Questa sola regola fa crollare la
    mediana dei vicini di un ordine di grandezza.
13. **Sparsificazione per normalizzazione, non per soglia assoluta.** La soglia assoluta taglierebbe
    fuori le bolle d'autore (volumi bassi) lasciando iper-connessi i mainstream. Si normalizza per
    **informazione mutua puntuale positiva** e si tiene il **filtro di disparità** o un *k* vicino
    mutuo con k ∈ [5,8].
14. **Gerarchia a tre livelli sopra le bolle**: macro-mondi (~25-35), costellazioni (~300-400), bolle
    atomiche (le attuali). **Non** un embedding a due dimensioni: le bolle si legano lungo sei assi
    (autore, scuola, lingua, genere, epoca, franchise) e proiettarli in un piano produce strappi e false
    adiacenze.
15. **Le otto quote per bolla**: quattro slot di continuità canonica, due di salto *vibe*, due riservati
    al ponte cross-medium (una bolla a maggioranza film riceve due bolle a maggioranza serie, e
    viceversa).
16. **Direzionalità pedagogica**: ogni bolla ha un'accessibilità (mediana del logaritmo dei voti dei
    membri core); l'arco verso una bolla meno accessibile è un approfondimento, verso una più
    accessibile è un allargamento.
17. **Le due coordinate dentro la bolla**: **purezza interna** (frazione del peso degli archi che cade
    dentro la bolla) e **percentile di popolarità locale** (posizione rispetto agli altri membri). La
    porta d'ingresso massimizza purezza × percentile; il deep cut richiede purezza sopra la mediana e
    ordina per percentile crescente, con un solo **pavimento di sicurezza globale** sui voti.

### Il recupero

18. **Il collo di bottiglia è il cesto, non l'ordinamento**: il tetto raggiungibile è al 12% al @10 e il
    modello ne prende il 29%. L'investimento va lì.
19. **Peso dei semi con decadimento temporale**: ogni titolo del profilo pesa per la sua azione e per un
    decadimento esponenziale sulla distanza dalla data di taglio, con emivita fra 180 e 365 giorni.
20. **Allocazione multi-bolla del cesto**: i candidati si distribuiscono in proporzione ai cluster
    recentemente attivi dell'utente, invece di una camminata unica che premia i ponti generici a metà
    strada fra i suoi interessi.
21. **Gating condizionato al grado per i titoli nuovi**: il blocco strutturale (pubblico previsto,
    keyword, regia, cast, produzione) pesa per un fattore che va a zero sui nodi con comportamento forte
    e a uno sui nodi senza comportamento. È la spiegazione del perché i metadati «facevano male»
    nell'ablation: su un titolo caldo introducono rumore rispetto al comportamento vero.
22. **La co-visione dalle cronologie entra nel recupero**, non solo nelle bolle: è l'unico segnale
    comportamentale che attraversa il confine film ↔ serie, e si valuta con una cross-validazione a 5
    fold in cui un quinto delle cronologie costruisce il componente e il resto fa da banco.
23. **Le liste curate diventano un componente di co-occorrenza**, normalizzato per la lunghezza della
    lista (una lista di quindici titoli pesa molto, un megadump da millecinquecento quasi nulla).
24. **La curatela non si usa per addestrare embedding densi** (3.417 coppie su 60.000 titoli: qualsiasi
    modello ad alta capacità memorizza i nodi dei legami — è già stato osservato). Si usa per apprendere
    **8-10 pesi scalari non negativi** di combinazione dei componenti, massimizzando il margine fra i
    legami curati e negativi appaiati per popolarità: 3.417 vincoli su 8 gradi di libertà non possono
    andare in overfitting.
25. **I legami curati si proiettano sulle bolle**: da titolo-a-titolo diventano bolla-a-bolla, dove non
    distorcono più la camminata e diventano il segnale per scegliere i «mondi affini».

### La decisione

26. **Regola di invarianza cross-dominio**: un componente estratto da una sorgente si valida se migliora
    o non degrada il banco dell'altra. Un componente nato dai dati di comportamento si valida sul banco
    comportamentale di origine opposta.
27. **Regola minimax**: poiché le scale dei due banchi differiscono, si misura la percentuale del tetto
    di ciascuno e si sceglie la ricetta che massimizza il **minimo** dei due guadagni. La regola si scrive
    **prima** di vedere i numeri.
28. **Il ranker si pota a 3-4 caratteristiche con monotonicità** (o regressione lineare a coppie con
    regolarizzazione forte e pesi non negativi). Tredici caratteristiche su 531 utenti per metà stanno
    fittando il rumore: il divario calibrazione/verifica è al 42%.

### Cosa si abbandona

29. **La fusione a due stadi (RRF) non si estende**: era nata per rattoppare a valle i buchi del grafo,
    ha prodotto il falso positivo più costoso della sessione, ed è neutra sul prodotto. I segnali si
    fondono **dentro** la matrice di transizione, normalizzati per componente prima del mixing.
30. **Gli spazi densi (SVD, contrastivi) sui metadati non si ricostruiscono**: o imbrogliano (se
    supervisionati dal comportamento) o sfocano i legami specifici. Due film dello stesso regista devono
    avere un **arco netto**, non un coseno annacquato in 128 dimensioni.
31. **L'ottimizzazione su split casuale e la modularità come criterio di qualità** sono abbandonate.
    La modularità è stata misurata tre volte e non è qualità: premia grafi frammentati e penalizza i
    ponti semantici.
32. **La vecchia gerarchia dell'albero non si ripara**: è costruita sul grafo contaminato. Si sostituisce
    con la gerarchia nuova, e il confronto fra le due è un'informazione, non un obiettivo.

## Testing Decisions

**Cosa rende buono un test qui.** Il comportamento esterno di questo lavoro è **il numero che una misura
produce dato un protocollo fissato**, la **partizione di bolle** dato un seme, e la **lista di vicini** di
una bolla. I test sono invarianti su questi, mai sull'implementazione: non si testa «la funzione somma i
pesi», si testa «cambiando il seme la partizione cambia in modo misurabile», «aggiungendo un componente
la misura si muove nella direzione dichiarata prima», «una ricetta identica dà numeri identici al
decimale».

**Le cuciture (seams) — confermate il 13/10/2026.** Quattro, e sono queste:

- **Il modulo canonico** — è l'unica implementazione valida del grafo. **Ogni** misura passa da lì: è la
  cucitura più alta, e l'unica garanzia contro la trappola già pagata delle due varianti di grafo.
- **Il modulo delle misure** — dove vivono i banchi e i protocolli di valutazione. Le metriche nuove
  entrano qui, accanto alle vecchie, senza sostituirle.
- **Il costruttore di bolle** — nuova cucitura, perché il lavoro sulle bolle è nuovo. Una sola.
- **Il costruttore dei componenti** — già esistente, si estende.

Bolle e componenti vivono **accanto** al modulo canonico, non dentro: il modulo canonico resta il grafo,
non diventa anche il contenitore di tutto.

**I controlli sono obbligatori, non opzionali.** Ogni misura porta accanto, sempre, i suoi quattro
controlli: **la popolarità** (il predittore marginale imbattibile), **l'ordine di indice** (il controllo
che ha smascherato il falso positivo più costoso), **il teacher nullo** (per scoprire i banchi che
premiano il vuoto), e **la permutazione casuale** (che deve dare zero). Un quinto controllo è specifico
di questa sessione: quando un componente della parte serie cambia, **i numeri del catalogo film devono
restare identici al decimale** — se si muovono, c'è una perdita da qualche parte.

**Il precedente da seguire.** Le misure migliori di questa sessione sono state quelle che hanno
*smascherato* qualcosa: il controllo del banco rotto, il test del teacher nullo, il confronto fra lo
split casuale e quello temporale. Sono il modello, non l'eccezione. Un test che conferma va bene; un test
che smentisce una nostra stessa conclusione vale di più.

**La lettura umana resta il giudice finale delle bolle** e non si automatizza via: il giudice automatico
(intruder test) serve a **tracciare** la qualità e a **ordinare** due configurazioni, non a sostituire la
lettura. La prima cosa che farà è essere validato contro le 100 bolle già lette: se non le riproduce, è
lui a essere sbagliato.

## Out of Scope

- **Qualsiasi modifica a `src/` e alla produzione.** Questa fase è offline, come tutte le precedenti.
- **Riscrivere la pipeline di serving** e i cataloghi serviti.
- **Nuove famiglie di modelli** (transformer, autoencoder, reti contrastive sui metadati) come prima leva.
- **La fusione a due stadi (RRF)**: da ritirare, non da estendere.
- **La riparazione della vecchia gerarchia ad albero**: si sostituisce, non si aggiusta.
- **Ottimizzare su split casuale**: i numeri presi lì restano, ma etichettati come legacy.
- **L'embedding a due dimensioni per la mappa**: escluso per struttura, non per gusto.
- **La modularità come criterio di qualità**: esclusa dopo tre misure concordanti.
- **Lo Space HuggingFace**: è morto; il deploy è sul server `mate`.
- **Usare gli utenti reali di YACA come banco.** Deciso il 13/10/2026 (ticket 22, `wontfix`): gli utenti
  attuali «sono test casuali miei», quindi un banco su di loro sarebbe **il terzo banco rotto** della
  sessione. La decisione di ricetta (ticket 21) dichiara di aver deciso **senza** un banco nativo.

## Further Notes

**La correzione che cambia una premessa.** Il documento di partenza dava il *sorprendente* come non
apprendibile e da applicare a valle come temperatura. Va corretto: **la temperatura sui punteggi finali
non produce scelte sorprendenti, produce scelte sub-ottimali**, cioè rumore uniforme. Il sorprendente
vero è **deterministico** — alta affinità comportamentale a fronte di alta distanza nei metadati — e
diventa visibile nella mappa come **tipo di ponte**. Questo non cancella l'obiettivo «sorprendente +
azzeccato + agnostico»: lo sposta da un parametro a una proprietà della struttura. È la decisione
concettualmente più importante di questa specifica.

**Il conflitto fra i banchi non è un problema da risolvere, è una proprietà da governare.** Ogni banco
premia i componenti nati dalla propria origine — è autocorrelazione del campionamento, non un errore. Si
governa con l'invarianza incrociata e il minimax, non cercando il banco «giusto», che non esiste.

**La curatela torna dalla porta di servizio, non da quella principale.** Come archi nel grafo fa male
(crea wormhole che distorcono la camminata e rompono le bolle). Come **vincolo su otto pesi**, dove 3.417
equazioni non possono fittare otto incognite, fa bene per costruzione. E proiettata sulle bolle diventa
il segnale dei «mondi affini», cioè esattamente ciò che un intenditore sa e un algoritmo no.

**Cosa cambia nella ricetta se questa specifica va a buon fine.** Oggi: film = comportamento da solo;
serie = pubblico previsto + co-visione. Dopo: film = comportamento + il blocco strutturale **solo sui
nodi freddi**; serie = come oggi ma con la co-visione validata in cross-validazione; entrambi con i semi
pesati per recency e il cesto allocato per bolla. Il numero di parametri liberi **non deve crescere**: i
pesi appresi dai legami curati (8-10) sostituiscono i pesi scelti a mano, non si sommano a loro.

**Le relazioni con il resto.** Il filone precedente (`.scratch/ml-collaborativo/`) resta la fonte delle
misure e del codice; questa specifica non lo contraddice, ne mette a terra le conclusioni. Il filone del
DNA deterministico (`livello-latente`) è già in produzione e fornisce la filosofia del decadimento
temporale. Il filone di qualità dei cataloghi (`qc-cataloghi`) ha già visto il problema dei corti e dei
trailer nei cataloghi serviti: qui si riusa la stessa distinzione dentro il grafo.
