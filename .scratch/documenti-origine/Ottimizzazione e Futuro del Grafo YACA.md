# **Ottimizzazione e Futuro del Grafo YACA**

[https\://gemini.google.com/app/9068a01c02a30054](https://gemini.google.com/app/9068a01c02a30054)

*User prompt: \# Handoff — il grafo di raccomandazione di YACA: dove siamo, cosa non fidarci, cosa chiediamo \*Documento per un collega senior. Tutto il materiale è nel repo, branch \`main\`, commit \`b14968b\`. Cartella di lavoro: \`.scratch/ml-collaborativo/\`. \*\*Niente è in produzione\*\*: \`src/\` non è stato toccato.\* \--- \#\# 1\. Il prodotto, in due righe YACA è un add-on per Stremio: dato ciò che un utente ha visto, propone titoli. \*\*Serviamo due cataloghi separati — film e serie — e il prodotto punta all'agnosticismo fra i medium\*\* (suggerire serie a chi guarda film e viceversa). Il criterio di qualità dichiarato dall'utente è: \*\*sorprendente \+ azzeccato \+ agnostico\*\*. Il "sorprendente" è dichiarato \*\*non apprendibile\*\* e va applicato a valle (temperatura sui punteggi finali); quindi il lavoro riguarda \*\*l'azzeccato\*\*. \#\# 2\. La mappa: dove sta cosa | | | |---|---| | \*\*il recap canonico\*\* | \`.scratch/ml-collaborativo/riepilogo.md\` — leggere questo per primo | | \*\*i 32 report\*\* | \`.scratch/ml-collaborativo/ricerche/43-…-74-….md\` — ognuno con script, numeri e limiti | | \*\*l'unica implementazione valida del grafo\*\* | \`.scratch/ml-collaborativo/canone.py\` | | \*\*la lettura delle 100 bolle\*\* | \`.scratch/ml-collaborativo/bolle-lette.md\` | | \*\*le partizioni salvate\*\* | \`.cache/movielens/bolle\*.npy\` (non in git: \`.cache\` è ignorato) | | \*\*i componenti\*\* | \`.cache/movielens/\` — \`cf-spazio\`, \`cf-studente\`, \`spazio-pulito\`, \`boot-B/T/Kpari/C\`, \`nuovo-KW/CAST/DIR/COLL/TV\` | | \*\*i banchi\*\* | MovieLens 32M, le cronologie Trakt (1.200 utenti), il gold curato (499 sorgenti) | ⚠️ \*\*Trappola nota\*\*: in giro ci sono \*\*due varianti\*\* del grafo. \`canone.py\` è quella canonica (grado binario \+ normalizzazione per componente \*prima\* del mixing); gli script \`rrf-\*.py\` usano un'altra variante e i loro numeri assoluti \*\*non sono confrontabili\*\*. I report 58-60 sono su quella variante. \--- \#\# 3\. Cosa abbiamo costruito, e cosa regge \*\*La contaminazione trovata.\*\* Lo spazio chiamato "contenuto" dal sistema precedente (\`Pc\`) è \*\*comportamento MovieLens travestito\*\*: una Ridge addestrata a predire la co-occorrenza degli utenti. Correlazione coi metadati puri \*\*0,169\*\*. Il vantaggio che ne veniva era circolare. Questo regge. \*\*La ricetta, dopo una passata di sottrazione.\*\* Da \*\*5 componenti \+ curatela e \~15 parametri\*\* a \*\*1-2 componenti e 4 parametri\*\*: \`\`\` catalogo FILM    CF (comportamento) da solo catalogo SERIE   CFst (pubblico previsto) \+ B (co-visione Trakt), pesi uguali                  k-NN 30 · beta 0,25 · senza curatela \`\`\` L'ablation dice che \*\*i metadati SVD e la curatela peggiorano\*\*, e che i componenti essenziali dei due cataloghi sono \*\*disgiunti\*\*: il film vuole il comportamento, la serie vuole il pubblico previsto e la co-visione. Questo regge ed è verificato due volte. \*\*Le bolle.\*\* 5.297 cluster. Ho letto \*\*100 bolle\*\* e \*\*\~88 hanno un filo nominabile\*\* — autori interi (Fassbinder, Kurosawa, Rossellini, Kazan, Carpenter, Kitano), scuole, nazionalità, franchise, formati. \*\*E le bolle vicine sono dello stesso mondo\*\*: Fassbinder → Wenders/Herzog/Bergman; Kurosawa → Ozu/Oshima/Imamura; Romero → Argento/Cronenberg; Lubitsch → l'espressionismo tedesco; polacca → polacche; Star Wars TV → i film di Star Wars/MCU/LEGO. \*\*Il grafo ricostruisce il canone senza saperlo.\*\* Questo è il risultato di cui sono più convinto. \*\*I componenti nuovi presi dai dati che stavamo buttando.\*\* \`KW\` (le keyword TMDB: \*\*copre il 99,6%\*\* del catalogo), \`TV\` (la visione insieme dalle cronologie Trakt: copre il 53%, \*\*le serie e la coda dei film, dove il comportamento dei film è cieco\*\*), \`CAST\`, \`DIR\`, \`COLL\` (franchise). Questi cinque \*\*migliorano molto\*\* le bolle, e l'ablation mostra che sono \*\*complementari, non ridondanti\*\* (toglierne uno cambia il \*tipo\* di bolla, non la qualità). \--- \#\# 4\. Quello che consideriamo buono \*\*e non è\*\* (i falsi positivi) Questa è la sezione più importante, perché sono errori che ho fatto io. \*\*1. «La fusione a due stadi raddoppia il @10 sul giudizio esperto» — era un artefatto.\*\* Il teacher era lo spazio del comportamento, che copre \*\*49.041 film e zero serie\*\*. Le sorgenti del gold sono \*\*tutte serie\*\*: quindi il teacher era \*\*la matrice nulla\*\*, e \`argsort\` su tutti valori pari restituisce \*\*l'ordine di indice\*\* — una permutazione fissa. Prova: il "teacher nullo" e il controllo "ordine di indice" danno numeri \*\*identici\*\*, e il controllo con permutazione casuale dà \*\*0,00%\*\*. Il report 58 è ritrattato. \*\*2. Il riferimento storico del report 41 (18,90% @10 sul curato) era gonfiato dallo stesso artefatto.\*\* Ricostruito e decomposto: delle 249 sorgenti, \*\*83 hanno un teacher vero e 163 hanno un teacher nullo\*\* — e l'aggregato è dominato dalle seconde, dove la fusione «guadagna» sei volte \*\*dal nulla\*\*. \*\*3. Il metro curato è rotto.\*\* Le sorgenti di test sono \*\*due popolazioni strutturalmente diverse\*\*: 83 danno 28,5% @10 con la camminata, 163 danno \*\*2,4%\*\*. E su quel banco \*\*l'artefatto batte qualunque metodo vero\*\*. Quindi: \*\*tutto ciò che è stato misurato su quel metro è sospetto\*\* — le conclusioni sulla "qualità esperta", la frontiera volume/qualità (report 57, superato), i risultati della fusione. \*\*4. La modularità non è qualità.\*\* Misurato \*\*tre volte\*\*: il grafo del contenuto ha modularità \*\*più alta\*\* (0,301 contro 0,205) e bolle \*\*peggiori\*\*; aggiungendo i componenti buoni la modularità \*\*scende\*\* da 0,205 a 0,057 e la qualità \*\*sale\*\*; togliendone uno la modularità sale e la qualità non cambia. Non usatela come criterio. \*\*5. Tutti i numeri presi con lo split casuale sono gonfiati di 2-3×.\*\* È la misura che ha cambiato tutto: con lo \*\*split temporale\*\* (profilo \= il 60% più vecchio, oro \= il 40% più recente) \*\*la camminata perde il 50-64% al @10\*\* e \*\*la popolarità non si muove di niente\*\*. Sul catalogo serie, valutato onestamente, \*\*il grafo non batte la popolarità\*\* (2,07% contro 2,13% al @10). Da rileggere con questo filtro: il modello dell'ordinamento (34,62% @100 sul film — \*\*mai misurato in temporale\*\*), i pesi, \`k\`, \`beta\`, l'ablation. \*\*6. «Più dati aiutano» — no.\*\* Ho fatto il \`related\` di \*\*tutte\*\* le serie (da 2.995 a 16.999 titoli, copertura 18% → 89%, archi 2,2M → 4,0M) sul componente che l'ablation dice essere \*\*essenziale\*\*. \*\*Non è cambiato niente.\*\* Il collo di bottiglia non era la copertura, è la qualità del segnale. Il controllo che rende il risultato credibile: il catalogo film non usa quel componente e i suoi numeri sono identici \*\*al decimale\*\*. \*\*7. La co-visione Trakt non è contaminata.\*\* L'ho sospettato (le cronologie del banco sono degli stessi utenti). \*\*No\*\*: i \`rel-\*.json\` sono l'endpoint "related" \*\*per titolo\*\*, non le cronologie. Verificato. \--- \#\# 5\. Quello che consideriamo inutile \*\*e potrebbe non esserlo\*\* (i falsi negativi) \*\*1. La curatela.\*\* L'abbiamo buttata: fa male al recupero \*\*e\*\* alle bolle. Ma sono \*\*3.417 legami scritti a mano da un intenditore\*\* — e non l'abbiamo mai usata come \*\*supervisione\*\* (imparare dai legami per addestrare un modello), solo come \*\*archi nel grafo\*\*. Sono due cose diverse e la seconda non è testata. \*\*2. Le 1.200 cronologie Trakt.\*\* Usate solo come \*\*banco di prova\*\*. La sezione \`TV\` le ha usate come componente \*\*solo per le bolle\*\*, mai per il recupero. E sono \*\*l'unico segnale di comportamento cross-medium\*\* che abbiamo, perché \`related\` è mono-medium. \*\*3. I \`plays\`\*\* (quante volte un titolo è stato visto): binarizzati e buttati. Mai testati come peso. \*\*4. Le date.\*\* Usate \*\*solo\*\* per lo split temporale. Mai come feature (recency, stagionalità, "cosa è uscito quando l'utente era attivo"). \*\*5. \`Pb\`\*\* — uno spazio a 256 dimensioni in \`spazi-trakt.npz\`. \*\*Non so cosa sia\*\* e non l'ho mai testato. Potrebbe essere qualcosa di utile rimasto da un effort precedente. \*\*6. I 540 file di liste Trakt\*\* in \`.cache/trakt/lists/\`: mai usati. Sono \*\*raccolte curate da umani\*\* — stesso valore potenziale della curatela, ma molto più grandi. \*\*7. Metadati quasi mai usati\*\*: \`vote\_average\`, \`popularity\`, \`runtime\`, \`content\_rating\`, \`production\_countries\`, \`spoken\_languages\`, \`networks\`, \`number\_of\_seasons\`/\`number\_of\_episodes\` per le serie. \*\*8. Il gold curato come addestramento.\*\* Come \*metrica\* è rotto (§4.3). Ma le 499 sorgenti sono \*\*giudizio di un intenditore\*\*: come \*training data\* non l'abbiamo mai provato. \*\*9. Gli embedding contrastivi.\*\* Scartati perché «memorizzavano». Ma erano addestrati a predire \*\*il comportamento di un titolo nuovo dal metadato\*\* — compito che il metadato non può fare. Su un compito diverso (per esempio, collocare un titolo nuovo \*nello spazio delle bolle\*) potrebbe funzionare. \*\*Non l'abbiamo testato.\*\* \*\*10. Le 3.238 foglie di \`albero.json\`.\*\* Sono la vecchia struttura, costruita sul grafo \*\*contaminato\*\* con la curatela a peso 6\. Le bolle nuove le rendono probabilmente obsolete — \*\*ma il confronto non è stato fatto\*\*, e quella struttura era \*\*gerarchica\*\* mentre le bolle nuove sono \*\*piatte\*\*. \--- \#\# 6\. I buchi che conosciamo 1\. \*\*Il grafo conosce il futuro.\*\* \`CF\` è costruito su cronologie \*\*complete\*\* di utenti disgiunti, che arrivano allo stesso periodo dell'oro di test. I numeri temporali sono quindi \*\*ottimistici\*\*: il crollo vero sarebbe peggiore. Un test onesto ricostruisce il grafo \*\*a tempo T\*\*. 2\. \*\*Il modello serie ha un divario calibrazione/verifica del 42%\*\* al @10 (5,85% → 3,41%). \*\*13 caratteristiche su 531 utenti per metà\*\* sono troppe. 3\. \*\*I titoli nuovi\*\*: si collegano \*\*dodici volte peggio\*\* di uno già noto (2,4% contro 28,5% al @10). L'unico rimedio misurato (\`CFst\`) porta \+0,31 punti. \*\*Non basta.\*\* 4\. \*\*La navigazione non esiste.\*\* Le bolle ci sono, i collegamenti hanno senso, ma non c'è né interfaccia né politica (bolle vicine \+ scelta popolare/nicchia). 5\. \*\*Il grafo delle bolle è denso\*\*: mediana \*\*1.103 vicini\*\* su 5.297. I vicini \*forti\* sono selettivi, ma servono \*\*soglie\*\*, e le bolle sono \*\*piatte\*\* — per disegnare una mappa servirebbe una gerarchia o un embedding a 2 dimensioni. 6\. \*\*Il conflitto fra i banchi\*\* sul catalogo film: il banco Trakt preferisce la ricetta completa (con la co-visione \*\*Trakt\*\* e la curatela, costruita su \*\*Trakt\*\*), il banco MovieLens preferisce \`CF\` da solo (\*\*MovieLens\*\*). \*\*Ogni banco premia la propria origine\*\*, e nessuno dei due è YACA. 7\. \*\*Nessun test end-to-end.\*\* I 52 cataloghi serviti non sono mai stati guardati. Il passo verso la produzione non è stato fatto (ed era escluso). 8\. \*\*Il teacher/fusione\*\* è neutro sul prodotto in casual, \*\*mai misurato in temporale\*\* — e sulla testa del catalogo serie dava \+77% (in casual). 9\. \*\*L'ordinamento del catalogo film in temporale non è mai stato misurato.\*\* \--- \#\# 7\. Le domande per te \*\*1. La metrica — è la domanda principale.\*\* La \`recall@N\` è \*\*dominata dalla popolarità\*\*: gli item d'oro sono in gran parte cose popolari, quindi il margine sopra la popolarità è piccolo per costruzione, e ottimizzarla spinge verso il \*\*non\*\*-sorprendente, cioè contro metà dell'obiettivo dichiarato. Il nostro gold curato è \*\*rotto\*\* (§4.3). La nostra risposta attuale è \*\*leggere le bolle e giudicare\*\* (fatto: 88/100 buone) — ma non scala e \*\*non confronta\*\* due configurazioni. → \*Come misureresti "qualità" in questo dominio? Ha senso una recall pesata per non-popolarità, o un giudizio umano strutturato su un campione? Come renderesti confrontabili due ricette?\* \*\*2. La navigazione.\*\* Abbiamo 5.297 bolle buone e un grafo di collegamenti denso con assi reali (lingua, autore, scuola, genere, epoca, franchise). Il passo successivo è l'interfaccia: bolle vicine \+ scelta popolare/nicchia dentro la bolla. → \*Come passeresti da questa struttura a una mappa navigabile? Serve una gerarchia sopra le bolle? Un embedding 2D? Soglie sui pesi? E la scelta popolare/nicchia: dentro la bolla per quantile di popolarità, o come parametro globale?\* \*\*3. L'adattamento del modello.\*\* 13 caratteristiche, 531 utenti per metà, \*\*42% di divario\*\* calibrazione/verifica. Ho scritto che la strada è \*\*meno caratteristiche\*\* — ma non l'ho testato. → \*Come affronteresti il problema: riduzione, regolarizzazione, più utenti, o un modello più semplice? E l'oracolo del cesto (il tetto raggiungibile) è al 12% al @10 mentre il modello ne prende il 29%: il margine è nel \*\*cesto\*\*, non nell'ordinamento — è lì che investiresti?\* \*\*4. Il test onesto.\*\* Il grafo conosce il futuro (§6.1). Un test a tempo T richiede ricostruire \`CF\` dalle interazioni prima di T. → \*Vale la pena? Come lo imposteresti senza rifare l'intera pipeline? E il conflitto fra banchi (§6.6): esiste un modo di decidere quale rappresenta il dominio, senza i dati di produzione?\* \*\*5. La curatela come supervisione.\*\* 3.417 legami esperti, più 540 liste curate. Come archi nel grafo \*\*fanno male\*\*; come \*\*supervisione\*\* non sono mai stati usati. → \*Vale la pena addestrare qualcosa sopra questo segnale? O il problema è che è troppo poco (3.417 legami) per addestrare e troppo "di gusto" per generalizzare?\* \*\*6. Cosa butteresti.\*\* Se dovessi rifare questo lavoro da zero, con quello che sai ora: \*\*quale pezzo di questa pipeline non costruiresti?\*\* Perché il sospetto è che una parte del lavoro (la fusione a due stadi, l'ordinamento con 13 caratteristiche) sia complessità che il dominio non ripaga. \--- \#\# 8\. Le cose che non rifaremmo identiche \- \*\*La fusione (RRF)\*\*: aveva senso dove la camminata è cieca (la testa del catalogo serie, in casual: \+77%), ma è \*\*neutra sul prodotto\*\* e non è mai stata misurata in temporale. Prima di tenerla, va riprovata. \- \*\*Il metro curato\*\*: va riparato o buttato, non usato com'è. \- \*\*I pesi tarati in casuale\*\* (\`k\`, \`beta\`, i pesi dei componenti, i pesi della fusione): tutti ottimi di un mondo gonfiato. \- \*\*La scelta del banco\*\*: gli utenti Trakt sono \*\*autori di liste pubbliche\*\*, non un campione casuale; le stime sono ottimistiche, e \*\*ogni banco premia i componenti della propria origine\*\*. \---*

Response: Il lavoro di sottrazione che avete fatto tra i report 43 e 74 — smascherare la circolarità di Pc, scoprire l'artefatto di argsort sul teacher nullo, passare allo split temporale e validare semanticamente le bolle — ha ripulito le fondamenta. Quello che vi resta tra le mani non è un sistema che "funziona poco" (il 2,07% in temporale sulle serie è un effetto ottico della metrica scelta), ma **due oggetti diversi che oggi state cercando di valutare con lo stesso righello**: un **motore di recupero sequenziale** e una **topologia culturale del catalogo (le 5.297 bolle)**.

Di seguito trovi le risposte dirette alle sei domande del §7, seguite dall'incrocio operativo tra i falsi negativi (§5) e i buchi aperti (§6) per preparare l'atterraggio in src/.

## **1\. La metrica: come misurare "azzeccato \+ sorprendente" e confrontare due ricette**

La recall@N grezza su split temporale è strutturalmente inadatta al vostro obiettivo: nel 40% futuro delle cronologie, la maggioranza delle visioni di qualsiasi utente cade sui titoli mainstream usciti o spinti dal mercato in quella finestra temporale. Poiché la popolarità è un predittore marginale imbattibile sul mainstream e **invariante allo split temporale**, la recall@10 misura per l'80% "quanto bene indovini la classifica globale" e solo per il 20% "quanto hai capito il gusto specifico dell'utente". Ottimizzarla ti costringe a gonfiare gli hub, uccidendo il requisito **"sorprendente"**.

Per confrontare due ricette in modo automatico, riproducibile e allineato al prodotto servono **tre metriche complementari**:

### **A. Sostituire la Recall grezza con *Tail-Stratified Recall* e *Self-Information Recall***

> 1. **Recall@K stratificata per fascia di popolarità (Recall@K\_Mid+Tail):** Dividi i titoli dell'oro di test *Gu*​ in tre fasce in base ai quantili di popolarità globale (es. *Head*: top 5% del catalogo; *Mid*: 5%–25%; *Tail*: \< 25%).  
   * La baseline di popolarità fa il 100% dei suoi punti su *Head* e **0,00%** su *Mid* e *Tail*.  
   * Misurare Recall@K **escludendo la fascia Head dal denominatore** (o calcolandola separatamente per fascia) misura esattamente l'*azzeccato non banale*: se sul bucket *Mid+Tail* la camminata fa 4,5% e la popolarità fa 0,0%, hai isolato il segnale vero.  
> 2. **IPS-Recall / Self-Information Recall (Recall pesata per sorpresività):** Invece di contare ogni hit *i*∈*Ru*​∩*Gu*​ come 1, pesalo per la sua auto-informazione (o propensione inversa smorzata):  
>    SI-Recall@*K*(*u*)=∑*j*∈*Gu*​​(−log2​*P*pop​(*j*))*γ*∑*i*∈*Ru*,*K*​∩*Gu*​​(−log2​*P*pop​(*i*))*γ*​  
>    con *γ*∈\[0.5,1.0\]. Indovinare che un utente guarderà un film di Kitano o una miniserie inglese di nicchia vale 8–15× rispetto a indovinare *Stranger Things*. Questa metrica penalizza automaticamente gli hub senza bisogno di euristiche esterne.

### **B. Riparare il "metro curato" per stratificazione, non per eliminazione**

Il banco curato (499 sorgenti) non è da buttare: è rotto perché **aggrega due regimi strutturalmente opposti** (§4.3).

> * **Popolazione A (83 sorgenti warm / alto grado in CF):** usala come banco di regressione per la **qualità della camminata** (dove oggi fai 28,5% @10).  
> * **Popolazione B (163 sorgenti cold / grado zero in CF):** usala come banco dedicato esclusivamente al **problema dei titoli nuovi / trasferimento da metadati** (§6.3). Vietato fare la media tra A e B: ogni report deve riportare (Curato-Warm @10, Curato-Cold @10) come coppia di numeri distinti.

### **C. Confrontare due partizioni di bolle senza leggerle a mano**

Leggere 100 bolle ha validato l'esistenza del canone, ma per fare *model selection* tra due configurazioni del grafo (*G*1​ vs *G*2​) puoi automatizzare il giudizio umano in due modi:

> 1. **Intruder Test automatico (Leave-One-Out / LLM Judge):** Campiona 200 bolle di taglia ≥6. Per ciascuna, prendi 4 titoli della bolla e inietta 1 "intruso" pescato a caso da una bolla a distanza ≥2 (ma nella stessa fascia di popolarità). Puoi far individuare l'intruso:  
   * **Algebricamente:** misurando la coerenza su un asse tenuto fuori dalla costruzione (held-out axis) o con un giudice LLM cieco (avete già l'integrazione Mistral in src/ai/router.js: passando solo titolo, anno, regista, generi, overview di 5 film, il tasso di identificazione dell'intruso su 200 bolle costa pochi centesimi e richiede 30 secondi).  
> 2. **Valutazione umana sulle sole *differenze simmetriche* (30 profili fissi):** Per decidere se la ricetta *A* batte la ricetta *B* sul recupero, non giudicare le intere top-10: su 30 profili/sorgenti fissi, stampa solo *Top*10*A*​∖*Top*10*B*​ contro *Top*10*B*​∖*Top*10*A*​ in cieco. Quando due ricette condividono 6 titoli su 10, guardare solo i 4 che cambiano riduce il tempo di lettura di 5× e massimizza il potere discriminante.

## **2\. La navigazione: da 5.297 bolle dense a una mappa e alla leva Popolare/Nicchia**

Con 5.297 bolle piatte e una mediana di **1.103 vicini**, il grafo quoziente è quasi una clique rumorosa: basta un singolo utente generalista che ha visto un film di Fassbinder e un film Marvel per creare un arco debole tra le due bolle.

### **A. Come sparsificare il grafo delle bolle: PMI \+ Disparity Filter (non soglie globali)**

Non usare mai una soglia assoluta sul peso dell'arco *WAB*​: taglieresti fuori tutte le bolle d'autore/nicchia (che hanno volumi assoluti bassi) e lasceresti iper-connesse le bolle mainstream.

> 1. **Normalizzazione per Pointwise Mutual Information (PMI positiva) o Sorpresività binomiale:** Sia *WAB*​ il peso totale degli archi tra la bolla *A* e la bolla *B*, e *SA*​\=∑*C*​*WAC*​ il volume uscente di *A*. Il legame vero non è *WAB*​, ma quanto il flusso supera l'atteso casuale:  
>    PMI\+(*A*,*B*)=max(0,log*SA*​⋅*SB*​*WAB*​⋅*W*tot​​)  
> 2. **Backbone Extraction (Disparity Filter di Serrano o Mutual *k*\-NN con *k*\=6):** Per ogni bolla *A*, mantieni solo i primi *k*∈\[5,8\] vicini per PMI\+ (o quelli con *p*\-value\<*α* secondo il Disparity Filter, che testa se un arco porta una frazione sproporzionata del peso uscente di *A*). Questo abbatte il grado mediano da **1.103 a \~6 ponti direzionali nitidi**, preservando esattamente le transizioni culturali che hai osservato a mano (*Fassbinder → Wenders/Herzog*, *Romero → Argento/Cronenberg*).

### **B. Gerarchia vs Embedding 2D**

> * **No all'embedding 2D (UMAP/t-SNE) come struttura di navigazione:** come hai notato, le bolle si legano lungo **6 assi diversi** (autore, scuola, lingua, genere, epoca, franchise). Proiettare una varietà a 6 dimensioni in R2 crea inevitabilmente "strappi" topologici e false adiacenze al centro della mappa.  
> * **Sì a una gerarchia a 3 livelli sopra le bolle \+ "Bussola dei vicini tipizzati":** Applicando Leiden (o clustering agglomerativo su grafo sparsificato PMI\+) **sopra** la matrice 5.297×5.297 delle bolle, ottieni naturalmente:  
  * **L1 (\~25–35 Macro-Mondi):** utile per l'ingresso a freddo o per la vista d'insieme.  
  * **L2 (\~300–400 Costellazioni):** utile per generare cataloghi tematici dinamici (sostituendo in modo pulito il vecchio HierarchicalGraph.js e chiudendo il todo 2\_dynamic\_topos\_catalogs.md).  
  * **L3 (le 5.297 Bolle atomiche):** dove avviene la raccomandazione fine.  
  * **Bonus — Etichettare il *perché* due bolle sono vicine:** poiché conosci i componenti separati (DIR, CAST, KW, COLL, CF, TV), per ogni arco forte tra la bolla *A* e la bolla *B* sai quale componente contribuisce di più (es. arco dominato da KW \= "stesso tema"; dominato da DIR/CAST \= "stessa scuola/scuderia"; dominato da CF/TV \= "stesso pubblico"). Questo ti dà assi di navigazione espliciti gratis.

### **C. Scelta Popolare / Nicchia: locale alla bolla, mai globale**

La leva Popolare/Nicchia **deve operare per quantile/ruolo dentro la bolla**, con un solo pavimento di sicurezza globale (vote\_count \>= floor).

> * Se usassi un parametro globale di popolarità, chiedere "Popolare" dentro la bolla *Cinema Polacco* o *Rossellini* restituirebbe zero titoli (o l'unico intruso hollywoodiano finito nella bolla per errore), mentre chiedere "Nicchia" dentro la bolla *Sci-Fi Blockbuster* pescherebbe film amatoriali da 12 voti.  
> * **La formula a due coordinate dentro la bolla *B*:** Per ogni titolo *i*∈*B*, calcola due quantità già disponibili dal grafo:  
  1. **Purezza interna (*pi*​):** frazione del peso degli archi di *i* che cade *dentro* la bolla *B* (misura quanto *i* è un vero membro archetipico della bolla e non un visitatore di confine).  
  2. **Percentile di popolarità locale (*qi*​∈\[0,1\]):** posizione di *i* per popolarità/voti *rispetto agli altri membri di B*.  
  * **Selettore "Popolare / Porta d'ingresso della bolla":** massimizza *pi*​⋅*qi*​ (i capolavori canonici e più accessibili di quel micro-mondo).  
  * **Selettore "Nicchia / Deep Cut della bolla":** filtra per alta purezza (*pi*​\>mediana*B*​, così non peschi rumore) e ordina per *qi*​ crescente (o fascia *qi*​∈\[0.10,0.50\]), garantendo un titolo *fedelissimo al filo della bolla ma poco battuto*.

## **3\. L'adattamento del modello: 13 feature su 531 utenti e l'Oracolo del Cesto al 12%**

I due numeri che hai riportato chiudono la questione senza ambiguità:

> 1. Il modello cattura già il **29% dell'oracolo del cesto** (3,41% su un soffitto teorico del 12% @10), che per un problema di ranking su 50.000+ item in split temporale è una frazione altissima.  
> 2. Il divario del **42%** tra calibrazione (5,85%) e verifica (3,41%) dimostra che 13 feature su 531 utenti stanno fittando il rumore campionario.

### **Dove investire: 80% sul Cesto, 20% sulla potatura drastica del Ranker**

> * **1\. Il collo di bottiglia è il Cesto (Candidate Generation):** Se l'oracolo del cesto è al 12%, nell'88% dei casi il titolo che l'utente guarderà non è nemmeno tra i candidati estratti dalla camminata. Perché il cesto perde così tanto in temporale?  
  * **Causa 1 (Aggregazione piatta del profilo):** se fai partire la camminata da tutti i titoli del 60% storico dell'utente con peso uniforme, i gusti vecchi di 4 anni diluiscono ciò che l'utente sta guardando *adesso* (appena prima del taglio temporale *T*).  
  * **Causa 2 (Monocromia del cesto):** un utente ha 3–5 filoni d'interesse distinti (es. anime shonen, crime nordico, commedia italiana — YACA già modella V\_clusters in dnaEngine.js). Una singola camminata globale premia i ponti generici a metà strada tra i cluster invece di pescare i vertici di ciascun cluster.  
  * **Rimedio sul cesto:** (a) pesa i semi del profilo con un **decadimento esponenziale sulla data di visione** (watched\_at vicino a *T* pesa 5× rispetto a inizio storia); (b) genera il cesto per **allocazione multi-bolla / multi-cluster** (quota di candidati proporzionale agli ultimi cluster attivi dell'utente). Vedrai l'oracolo del cesto salire ben più di quanto qualunque ranker possa fare.  
> * **2\. Potatura del Ranker: da 13 feature a 3–4 con vincolo di monotonicità (o L2 lineare):** Con 531 utenti, un albero di decisione o un modello libero su 13 feature impara regole spurie del tipo *"se feature\_7 \> 0.12 e pop \< 400 allora promuovi"*.  
  * Scendi a **3-4 feature al massimo** (1. score della camminata con decay temporale sui semi; 2\. affinità col cluster recente; 3\. qualità/popolarità bayesiana; 4\. copertura cross-canale).  
  * Usa una **Logistic Regression / Ridge Pairwise con regolarizzazione L2 forte** e **pesi costretti a essere non-negativi (≥0)** (o GBDT con monotone\_constraints e max\_depth=2). Se costringi i pesi a essere monotoni, il divario calibrazione/verifica scenderà dal 42% a meno del 5–8%.

## **4\. Il test onesto: il grafo a tempo *T* e il conflitto fra i banchi**

### **A. Vale la pena ricostruire CF a tempo *T*? Sì, ma con un trucco che costa zero modifiche alla pipeline**

Non serve ricostruire il grafo per ogni utente al suo tempo *Tu*​. Il motivo per cui il grafo "conosce il futuro" ha due componenti molto diverse:

> 1. **Titoli già esistenti prima di *Tu*​** (es. *Il Padrino* ↔ *Goodfellas*): la struttura di co-visione tra classici o titoli usciti da più di 2 anni è **stazionaria**. Ricostruirla a tempo *T* non cambia quasi nulla.  
> 2. **Titoli usciti intorno o dopo *Tu*​** (o esplosi dopo *Tu*​): nel grafo statico odierno, un film uscito a *Tu*​\+1 mese possiede già migliaia di archi CF/B accumulati nei 2 anni successivi. È qui che avviene il *data leakage* temporale.

**Come impostarlo in mezza giornata senza rifare la pipeline:**

> * **Livello 1 (Mascheramento istantaneo sul grafo attuale):** Nella funzione di valutazione temporale, per l'utente *u* tagliato alla data *Tu*​, **azzera gli archi comportamentali (CF, B, TV) di tutti i titoli con release\_date \> T\_u \- 90 giorni**, lasciando attivi per quei titoli solo i componenti noti all'uscita (CFst, KW, DIR, CAST, COLL). Inoltre, escludi dal cesto i titoli con release\_date \> T\_u\_{\\text{fine\\\_test}}. Questo simula fedelmente la cecità comportamentale sui titoli freschi senza ricalcolare CF.  
> * **Livello 2 (Un singolo snapshot globale *T*cut​ su MovieLens):** Invece di *N* grafi per *N* utenti, scegli **una sola data di taglio globale** *T*cut​ (es. il percentile 75% dei timestamp di MovieLens 32M). Lancia lo script che genera cf-spazio una sola volta filtrando timestamp \< T\_{\\text{cut}} e salvalo come cf-spazio-Tcut. Usa quello per validare gli utenti dopo *T*cut​. Un solo build, zero refactoring.

### **B. Come sciogliere il conflitto fra i banchi (Trakt vs MovieLens)**

È fisiologico che il banco Trakt premi i componenti nati da Trakt (B, curatela) e il banco MovieLens premi CF: stai osservando l'**auto-correlazione della distribuzione di campionamento**.

> * **Regola del Cross-Domain Transfer (Criterio di Invarianza):** Valuta i componenti **incrociando sorgente e banco**. Un componente estratto da TMDB/Trakt è validato se migliora (o non degrada) il banco MovieLens; un componente estratto da MovieLens (CF, CFst) è validato se migliora il banco Trakt.  
> * **Usare una metrica Minimax (Worst-Case Regret) normalizzata sul tetto di ciascun banco:** Poiché le scale assolute dei due banchi differiscono, misura per ogni ricetta la percentuale del tetto (o il guadagno relativo rispetto alla baseline di popolarità di *quel* banco) e scegli la ricetta che massimizza min(GainML​,GainTrakt​).  
> * **Costruire il micro-banco "YACA Nativo":** Anche se non hai toccato src/, il database MongoDB Atlas di produzione contiene già WatchHistory e UserLibraryItem degli utenti reali di YACA (nella documentazione sono citati 368 item sulla libreria di produzione). Esportare uno snapshot anonimizzato delle librerie/cronologie reali di YACA (anche solo una manciata di profili reali con split temporale) ti dà la bussola per sapere se la demografia di YACA assomiglia di più a Trakt o a MovieLens.

## **5\. La curatela (3.417 legami) e le 540 liste Trakt come supervisione**

Come archi diretti nel grafo dei titoli, 3.417 legami manuali fanno male perché hanno una distribuzione di grado artificiale (pochi nodi iper-connessi secondo il gusto dell'autore) che funge da "wormhole" per la camminata aleatoria, distorcendo le stazionarie di PageRank e rompendo le bolle di Leiden.

Tuttavia, **buttarli via è uno spreco**. Ecco cosa vale la pena fare e cosa no:

> * **NON usarli per addestrare embedding densi (es. MLP / Contrastive sui metadati):** 3.417 coppie su 60.000 titoli coprono una frazione infinitesimale dello spazio prodotto; qualsiasi modello ad alta capacità memorizzerebbe i nodi presenti nei legami (esattamente come visto in §5.9).  
> * **SÌ a usarli per apprendere i pesi di combinazione a bassa dimensionalità (\< 10 parametri):** Hai \~10 componenti candidati (CF, CFst, B, TV, KW, DIR, CAST, COLL, più le 540 liste). Impostare un problema di **metric learning a 8–10 pesi scalari** *w*1​,…,*wk*​≥0 (dove la similarità tra *i* e *j* è ∑*c*​*wc*​*Sc*​(*i*,*j*)) massimizzando il margine tra i 3.417 legami curati e negativi campionati per popolarità appaiata (10-banco-appaiato-popolarita.md) **non può andare in overfitting** (hai 3.417 vincoli per 8 gradi di libertà\!) e ti dà i pesi relativi ideali per fondere i componenti nelle bolle.  
> * **SÌ a trasformare le 540 liste Trakt in un componente di co-occorrenza LIST:** 540 liste curate da umani in .cache/trakt/lists/ sono un segnale enorme se normalizzate per la lunghezza della lista: due titoli *i*,*j* che co-occorrono nella lista *L* ricevono un incremento Δ*ij*​\=log2​(1+∣*L*∣)1​ (così una lista curata da 15 titoli pesa molto, un megadump da 1.500 titoli pesa pochissimo). Normalizzato col grado binario di canone.py, LIST è il ponte naturale tra comportamento e curatela.  
> * **SÌ a usare i 3.417 legami al livello delle Bolle (Grafo Quoziente):** Se proietti i 3.417 legami non tra titolo *i* e titolo *j*, ma tra **Bolla$(i)$ e Bolla$(j)$**, smettono di distorcere la camminata sui singoli titoli e diventano un segnale d'oro per scegliere quali bolle mostrare come "Mondi affini" nella navigazione (§7.2).

## **6\. Cosa butterei rifacendo tutto da zero**

Con il senno dei 74 report, se ripartissi oggi da un foglio bianco **non costruirei questi quattro pezzi**:

| Pezzo che butterei | Perché il dominio non lo ripaga | Cosa farei al suo posto |
| :---- | :---- | :---- |
| **1\. Fusione a due stadi (RRF / Teacher-Student in cascata)** | È nata per rattoppare a valle i buchi del grafo, ha generato il falso positivo più costoso (argsort sulla matrice nulla, §4.1–4.2) ed è neutra sul prodotto. | Fondere i segnali **dentro la matrice di transizione** (normalizzazione per componente *prima* del mixing, come in canone.py). Lo studente CFst serve solo a popolare gli archi dei nodi senza CF. |
| **2\. Ranker supervisionato a 13 feature** | Con l'oracolo del cesto al 12% e 531 utenti, un secondo stadio pesante impara solo il bias di popolarità e overfitta del 42% in temporale. | Camminata sul grafo con **semi pesati per recency** \+ debiasing del grado (*β*\=0.25) \+ diversificazione/temperatura a valle. |
| **3\. Spazi continui / SVD / Contrastivi sui metadati (Pc)** | Ridurre keyword, cast e registi a vettori densi con SVD o reti contrastive o imbroglia (se supervisionato da CF) o memorizza/sfoca i legami specifici. | Grafi bipartiti/discreti espliciti (KW, DIR, CAST, COLL): due film dello stesso regista o con 4 keyword rare in comune devono avere un arco netto, non un coseno annacquato in R128. |
| **4\. Ottimizzazione su split casuale e Modularità** | Lo split casuale misura il co-consumo sincrono (gonfiato 2–3×); la modularità premia grafi frammentati e penalizza i ponti semantici. | Split temporale con decay sui semi fin dal giorno 1; validazione delle bolle tramite Intruder Test e purezza assiale. |

## **7\. I tre "Falsi Negativi" (§5) che chiudono i "Buchi" (§6) a costo minimo**

Guardando la vostra tabella dei componenti attuali, c'è una contraddizione strutturale tra l'**obiettivo dichiarato in §1** (*agnosticismo fra i medium: suggerire serie a chi guarda film e viceversa*) e la **ricetta di recupero di §3**:

> * Il catalogo FILM usa solo CF (che è MovieLens: **49.041 film e zero serie**).  
> * Il catalogo SERIE usa CFst \+ B (dove B è il related di Trakt, che è **mono-medium**: serie → serie).

In questa configurazione, l'unico ponte tra film e serie nel recupero è CFst (una predizione da metadati). Nel frattempo, avete in casa i pezzi che risolvono esattamente questo problema e gli altri due buchi principali:

> 1. **Portare TV (le 1.200 cronologie Trakt, §5.2) dal grafo delle bolle al grafo di RECUPERO:** TV è l'**unico segnale comportamentale vero che attraversa il confine Film ↔ Serie** e copre la coda dei film dove MovieLens è cieco. Avete già verificato che migliora molto le bolle: tenetene fuori un fold di utenti per il test (es. 5-fold cross-validation sulle 1.200 cronologie: 960 costruiscono TV, 240 fanno da banco temporale) e iniettatelo nel recupero di *entrambi* i cataloghi.  
> 2. **Usare le Date (§5.4) e i plays / voti (§5.3) per pesare il vettore di partenza della camminata:** Non servono feature complesse nel ranker: nella camminata canone.py, invece di dare peso 1/∣*Pu*​∣ a ogni titolo del profilo utente *Pu*​, assegna al seme *i*∈*Pu*​ il peso:  
>    *su*​(*i*)∝*w*azione​(*i*)⋅2−*τTu*​−*tu*​(*i*)​  
>    con emivita *τ*∈\[180,365\] giorni (in linea con la filosofia di computeTimeDecay già presente in src/dna/dnaEngine.js). Questo riallinea la camminata al gusto dell'utente al tempo *Tu*​ e recupera subito una quota consistente del crollo temporale (§4.5).  
> 3. **Risolvere i Titoli Nuovi (§6.3: 2,4% vs 28,5%) con il gating per grado su KW \+ DIR \+ CAST \+ COLL:** CFst da solo dà \+0,31 punti perché spalma il titolo nuovo su un pubblico medio previsto. Ma per le bolle avete già costruito KW (copertura **99,6%**), DIR, CAST e COLL. Perché nell'ablation del recupero i metadati facevano male? Perché sui titoli *warm* (che hanno già ottimi archi CF e B) aggiungere i metadati introduce rumore rispetto al comportamento vero\!  
   * **La soluzione è il mixing condizionato al grado comportamentale:** Sia *d*behav​(*i*) il grado del nodo *i* nei componenti comportamentali (CF \+ B \+ TV). Definisci il peso del blocco strutturale (CFst \+ KW \+ DIR \+ CAST \+ COLL) per il nodo *i* come:  
     *λ*cold​(*i*)=*τ*0​\+*d*behav​(*i*)*τ*0​​  
     Per un classico con 500 archi comportamentali, *λ*cold​≈0 (comanda puro CF/B/TV, nessuna degradazione sulla testa). Per un titolo appena uscito o di nicchia (*d*behav​\=0), *λ*cold​\=1: il titolo entra nel grafo di recupero agganciandosi esattamente ai film dello stesso regista (DIR), franchise (COLL), attori (CAST) e micro-keyword (KW), e viene immediatamente collocato nella sua bolla per baricentro degli archi incidenti.

## **8\. Sequenza operativa consigliata (prima di toccare src/)**

> 1. **Test rapido su canone.py (1 giorno):**  
   * Aggiungi il **decay temporale sui semi del profilo** nello split temporale.  
   * Aggiungi il **mixing condizionato al grado *λ*cold​(*i*)** usando KW \+ DIR \+ CAST \+ COLL \+ CFst solo per i nodi a basso grado comportamentale.  
   * Inserisci **TV (in 5-fold CV)** nel recupero serie e film per verificare il salto cross-medium.  
> 2. Metriche in canone-misure.py:  
   * Affianca alla Recall@10 globale la **Recall@10\_Mid+Tail** (escludendo la top 5% popolarità) e separa il banco curato in Curato-Warm (83) e Curato-Cold (163).  
> 3. **Costruzione della mappa delle bolle:**  
   * Sparsifica la matrice 5.297×5.297 con PMI\+ \+ top-6 vicini per bolla, fai un passo di Leiden sopra per ottenere le \~300 costellazioni L2 e definisci l'ordinamento interno alla bolla tramite (*pi*​ purezza,*qi*​ quantile locale di popolaritaˋ).

Vuoi che scriviamo insieme la formulazione esatta per canone.py del mixing condizionato al grado *λ*cold​(*i*) e della sparsificazione PMI\+ tra le 5.297 bolle?

---

*User prompt: Hai altri consigli per migliorare la qualità delle bolle stesse e dei collegamenti tra loro?*

Response: Per alzare la qualità da 88/100 bolle coerenti a \>95/100 e trasformare quella mediana di 1.103 vicini in una rete di ponti nitidi, bisogna intervenire sui due difetti strutturali di Leiden applicato a grafi multi-componente: **l'inquinamento da nodi-ponte (attori ubiqui, keyword generiche, film ibridi)** dentro le bolle, e **l'aggregazione ingenua per somma** tra le bolle.

## **1\. Come migliorare la purezza interna delle bolle (quel 12% di bolle sfocate)**

Quando una bolla in bolle-100.py non ha un filo nominabile, quasi sempre cade in uno di questi quattro casi: è una **bolla-chimera** (due mondi fusi per colpa di un attore o di una keyword condivisa), una **bolla-pattumiera** (nodi a basso grado che Leiden raggruppa per inerzia), un **cortocircuito di formato** (cortometraggi, documentari *making-of* o stand-up mescolati ai film), oppure una vittima del **limite di risoluzione uniforme**.

### **A. Pesi di specificità (IDF \+ Entropia di carriera) dentro CAST, KW e DIR**

Non tutti i legami strutturali hanno la stessa capacità di definire un "mondo":

> * **CAST pesato per ordine di fatturazione (billing) ed entropia di carriera:** Un caratterista prolifico (es. Willem Dafoe, Samuel L. Jackson, Danny Trejo) compare in 100+ film attraversando horror, cinecomic, cinema d'autore e animazione. Se gli archi CAST pesano tutti uguale, questi attori funzionano da super-colla e fondono bolle incompatibili.  
  * Pesa la presenza dell'attore *a* nel titolo *i* con *wia*​\=rank(*i*,*a*)​1​ (i primi 3 protagonisti contano, il 9° nome nel cast quasi zero).  
  * Moltiplica il contributo dell'attore per la sua **concentrazione tematica** (inverso dell'entropia di Shannon dei generi/paesi in cui ha recitato): Takeshi Kitano o Klaus Kinski hanno bassa entropia e definiscono una bolla; un turnista hollywoodiano ad alta entropia viene depotenziato.  
> * **Potatura delle keyword "ortogonali al gusto" in KW:** Anche con una pesatura TF-IDF, su TMDB esistono keyword ad alta frequenza media che sono **strutturali ma non estetiche** (based on novel or book, sequel, remake, duringcreditsstinger, woman director, independent film, murder, flashback). Due film non appartengono allo stesso mondo perché entrambi hanno una scena dopo i titoli di coda o sono tratti da un libro.  
  * **Filtro automatico tramite coerenza comportamentale:** Per ogni keyword *k*, calcola la similarità media in CF \+ TV tra le coppie di titoli che condividono *k*. Se una keyword ha molti film ma similarità comportamentale media vicina al caso (es. independent film o flashback), **buttala via prima di costruire KW**. Tieni solo le keyword la cui co-occorrenza predice co-visione sopra la media (micro-tropi veri come time loop, giallo, wuxia, heist, cyberpunk).

### **B. Separazione a monte dei formati spurii (Corti, Stand-up, Making-of)**

Nel repo avete già affrontato il rumore di corti e documentari nei cataloghi (.scratch/qc-cataloghi/issues/07-corti-e-trailer.md). Nel grafo delle bolle questo problema esplode: il documentario *making-of* di *Star Wars* o un corto Pixar di 6 minuti condivide COLL, DIR, CAST e KW con i film principali, rubando spazio nella bolla.

> * Aggiungi in componenti-nuovi.py una penalità (o maschera) di compatibilità di formato usando runtime e il genere 99 (Documentario):  
  * Un film con runtime \< 45 (cortometraggio) può collegarsi forte ad altri corti o all'animazione d'autore, ma il suo arco verso i lungometraggi viene scalato di ×0.25.  
  * Un documentario (genre 99\) ha archi pieni verso altri documentari, ma archi ridotti (×0.20) verso la fiction, a meno che non sia supportato da CF/TV fortissimo.

### **C. Il componente mancante: STUDIO / NETWORK \+ EPOCA \+ PAESE**

Dai metadati già presenti in movies.parquet e tv.parquet (production\_companies, networks, production\_countries, original\_language, release\_date / first\_air\_date) potete estrarre un componente leggerissimo ma micidiale per la coda lunga e per le serie: **la Firma Produttiva (PROD)**.

> * Due titoli non condividono un arco perché entrambi sono "USA" o entrambi "anni '90" (troppo generico), ma condividono un arco forte se coincidono nella **combinazione (Studio/Network di nicchia) oppure (Paese non-US \+ Decennio \+ Genere)**:  
  * Esempi che risolvono bolle intere: A24, Studio Ghibli, Shaw Brothers, Toho, Cannon Films, Hammer Film Productions, HBO anni 2000, FX, Poliziottesco (IT \+ Anni '70 \+ Crime), New French Extremity (FR \+ Anni 2000 \+ Horror).  
> * Questo componente ha copertura quasi 100% e impedisce gli **anacronismi nelle bolle** (es. un film muto del 1925 che finisce in una bolla di thriller anni '90 solo perché condividono 3 keyword TMDB).

### **D. Risoluzione adattiva: *Split delle Chimere* e *Assorbimento delle Briciole***

Leiden (leiden.py) usa un singolo parametro di risoluzione *γ* su tutto il grafo, ma i mondi cinematografici hanno taglie naturali diverse (la filmografia di un autore è di 15 titoli, un sottogenere è di 80). Dopo aver girato Leiden, applica un passo di **rifinitura locale** (30 righe di Python):

> 1. **Split delle bolle bimodali (Chimere):** Prendi ogni bolla *B* con ∣*B*∣≥35 o con conducibilità interna bassa. Fai girare un taglio spettrale a 2 vie (o Leiden a 2 cluster) sul **solo sottografo indotto da *B***. Se la densità di archi *tra* le due metà *B*1​,*B*2​ è meno di 41​ della densità interna di *B*1​ e *B*2​ (cioè le due metà stavano insieme solo per 1-2 film ponte), **dividi *B* in *B*1​ e *B*2​**.  
> 2. **Assorbimento delle micro-bolle (≤3 titoli):** Se una bolla ha 1, 2 o 3 titoli e non è un franchise chiuso (COLL), riassegna i suoi nodi alla bolla adiacente verso cui hanno il massimo peso normalizzato.  
> 3. **Appartenenza multipla solo per i "Film-Portale" (Top 5% di partecipazione):** Costringere ogni titolo in una sola bolla fa male ai capolavori di confine (*Alien* è sia Sci-Fi che Horror; *Blade Runner* è sia Cyberpunk che Noir; *Ran* è sia Kurosawa che Shakespeare).  
   * Calcola per ogni nodo *i*∈*B* la sua **purezza interna** *pi*​\=*w*(*i*,*V*)*w*(*i*,*B*)​.  
   * Se un nodo ha un legame fortissimo con la propria bolla *B*1​ (*pi*,*B*1​​≈0.45) ma anche un legame secondario netto con un'altra bolla *B*2​ (*pi*,*B*2​​≥0.30, con *B*2​ che lo accoglie da almeno 3 nodi distinti), **non spostarlo**: lascialo in *B*1​ come membro primario e aggiungilo a *B*2​ come **ospite/portale**. La bolla *B*2​ diventa più completa e guadagni il titolo di transizione perfetto per passare da *B*1​ a *B*2​.

## **2\. Come migliorare i collegamenti tra le bolle (da 1.103 vicini a ponti veri)**

La mediana di **1.103 vicini su 5.297 bolle** non dipende dal fatto che le bolle siano sbagliate, ma da **come costruisci gli archi del grafo quoziente**. Se definisci il peso tra la bolla *A* e la bolla *B* come la semplice somma degli archi tra i loro membri (*WAB*​\=∑*i*∈*A*,*j*∈*B*​*wij*​), basta **un solo film famoso** dentro la bolla *A* per collegare *A* a 800 altre bolle.

### **A. Aggregazione "Core-to-Core" e Filtro di Supporto Multi-Nodo (≥*m* testimoni)**

Un vero legame culturale tra due bolle (es. *Fassbinder → Wenders/Herzog* o *Romero → Argento*) non passa mai per un solo film: è una **fascia di archi paralleli** che collega più opere di *A* a più opere di *B*.

> 1. **Pesa i nodi per la loro purezza interna (*pi*​) prima di sommare tra bolle:**  
>    *WAB*core​\=*i*∈*A*,*j*∈*B*∑​*pi*​⋅*pj*​⋅*wij*​  
>    In questo modo, gli archi che partono dagli archetipi puri di *A* (*pi*​≈0.8) e arrivano agli archetipi puri di *B* (*pj*​≈0.8) contano pieno; gli archi che partono da un intruso o da un blockbuster di confine (*pi*​≈0.15) vengono abbattuti di 30×.  
> 2. **Regola dei Testimoni Disgiunti (Supporto strutturale minimo):** Un arco tra la bolla *A* e la bolla *B* è ammesso **solo se** coinvolge almeno:  
>    *n*src​(*A*→*B*)=∣{*i*∈*A*:∃*j*∈*B* con *wij*​\>0}∣≥min(3,⌈0.25∣*A*∣⌉)  
>    e simmetricamente su *B* (o ancor meglio: se il *matching massimo* bipartito tra *A* e *B* ha cardinalità ≥3).  
   * **Effetto immediato:** Se applichi questa sola regola di "almeno 3 coppie disgiunte di film che si parlano", la mediana di 1.103 vicini crolla istantaneamente di un ordine di grandezza, eliminando il 90% dei collegamenti accidentali dovuti a un singolo attore o a un singolo utente rumoroso.

### **B. Non sommare i componenti sul grafo delle bolle: tienili come *Canali Tipizzati***

Quando costruisci il grafo dei singoli titoli, sommi i componenti normalizzati (CF, TV, B, KW, DIR, CAST, COLL) per dare a Leiden un'unica matrice su cui trovare le bolle. Ma **una volta trovate le 5.297 bolle**, non usare la matrice sommata per collegarle\! Calcola invece la PMI positiva (PMI*AB*\+​) **separatamente su due assi**:

> * **Asse Comportamentale (*WAB*behav​):** calcolato solo su CF \+ TV \+ B \+ LIST (le 540 liste Trakt in .cache/trakt/lists/).  
> * **Asse Strutturale/Metadati (*WAB*struct​):** calcolato solo su DIR \+ CAST \+ KW \+ COLL.

Incrociando i due assi ottieni una tassonomia dei ponti tra bolle che risolve sia il rumore sia l'effetto "sorprendente":

| Tipo di Ponte tra Bolla *A* e Bolla *B* | *WAB*behav​ | *WAB*struct​ | Cosa significa davvero | Come usarlo nel prodotto |
| :---- | :---- | :---- | :---- | :---- |
| **1\. Ponte Canonico** | Alto | Alto | Stessa scuola/tema **e** stesso pubblico (es. *Kurosawa ↔ Oshima/Kobayashi*). | Navigazione primaria ("Mondi contigui"). |
| **2\. Ponte "Sorprendente \+ Azzeccato" (Vibe/Cult)** | **Alto** | **Basso / Zero** | Metadati, paese o medium totalmente diversi, ma **lo stesso pubblico di appassionati li ama entrambi** (es. *Noir anni '70 ↔ Anime Cyberpunk*, o *Film di Tarantino ↔ Spaghetti Western*). | **È il vostro oro:** risolve il requisito "sorprendente" senza dover usare temperatura casuale sui punteggi\! |
| **3\. Collisione Lessicale (Falso Positivo)** | **Zero** | **Alto** | Condividono una keyword generica o un attore secondario, ma nessun umano che guarda *A* guarda mai *B*. | **Da potare:** è il rumore che gonfia i 1.103 vicini. |

**Corollario fondamentale sul "sorprendente" (§1 del tuo Handoff):** Nel §1 hai scritto che il "sorprendente" è stato dichiarato non apprendibile e va applicato a valle come temperatura sui punteggi finali. Attenzione: **alzare la temperatura di campionamento sui punteggi finali non produce scelte sorprendenti, produce scelte sub-ottimali (rumore uniforme)**. Il vero *sorprendente ma azzeccato* è deterministico ed è esattamente la riga 2 della tabella sopra: **alta affinità comportamentale (CF \+ TV \+ LIST) a fronte di alta distanza nei metadati (1 \- KW/DIR/CAST)**.

### **C. Sparsificazione Simmetrica \+ Quote Cross-Medium garantite**

Dopo aver filtrato per supporto multi-nodo (≥3 testimoni) e scartato le collisioni lessicali (Riga 3), costruisci la lista di adiacenza finale di ogni bolla *A* non con una soglia fissa, ma per **quote bilanciate** (es. 8 vicini per bolla):

> 1. **4 slot "Continuità Canonica":** i 4 vicini con massimo punteggio combinato PMIbehav\+​(*A*,*B*)+PMIstruct\+​(*A*,*B*).  
> 2. **2 slot "Salto Sorprendente (Vibe Bridge)":** i 2 vicini con massimo PMIbehav\+​(*A*,*B*) tra le bolle che hanno bassa sovrapposizione di genere/keyword con *A*.  
> 3. **2 slot "Ponte Cross-Medium" (Agnosticismo Film ↔ Serie):** se *A* è una bolla a maggioranza Film, riserva 2 slot alle bolle a maggioranza Serie (e viceversa) con il massimo legame su TV \+ KW \+ CAST \+ LIST.

### **D. Direzionalità pedagogica sugli archi (*A*→*B* non è *B*→*A*)**

Assegna a ogni bolla *A* la sua **accessibilità media** *M*(*A*) (mediana di log10​(vote\_count) dei suoi titoli core). Ogni arco tra due bolle *A* e *B* acquista un segno:

> * Se *M*(*B*)\<*M*(*A*), l'arco *A*→*B* è un **approfondimento (Deepening / Rabbit Hole)**: porta l'utente da un mondo noto (es. *Thriller psicologici mainstream*) alla sua radice d'autore o di culto (es. *Giallo all'italiana* o *Kiyoshi Kurosawa*).  
> * Se *M*(*B*)\>*M*(*A*), l'arco *A*→*B* è un **allargamento (Broadening / Mainstream Bridge)**. Questo ti permette, sia nel recupero automatico sia nell'interfaccia, di decidere se "scendere in profondità" o "allargare l'orizzonte" a partire da ciò che l'utente ha appena visto.

## **3\. Tre diagnostiche veloci da lanciare domani su bolle\*.npy**

Prima ancora di rigenerare le bolle da capo, puoi misurare quanto guadagni su .cache/movielens/bolle\*.npy con un singolo script di diagnosi:

> 1. **Test dei Testimoni Disgiunti:** Calcola quanti dei 1.103 vicini mediani di una bolla sopravvivono se chiedi che l'arco *A*↔*B* sia supportato da almeno 3 coppie disgiunte di titoli (*i*1​,*j*1​),(*i*2​,*j*2​),(*i*3​,*j*3​) e pesato per *pi*​⋅*pj*​.  
> 2. **Caccia alle Chimere:** Elenca le 50 bolle con taglia \>35 che hanno il rapporto più basso tra il secondo autovalore del Laplaciano normalizzato (*λ*2​, algebric connectivity) e il grado medio interno: se trovi dentro quelle 50 la quasi totalità del tuo 12% di bolle "senza filo nominabile", lo *Split delle Chimere* te le ripara in automatico.  
> 3. **Estrazione dei Vibe Bridges:** Prendi le tue 100 bolle già lette in bolle-lette.md e stampa, per ciascuna, le 2 bolle vicine che massimizzano PMICF+TV\+​(*A*,*B*)−PMIKW+DIR\+​(*A*,*B*): vedrai subito se i salti "sorprendenti ma azzeccati" emergono da soli dal contrasto tra comportamento e metadati.

Vuoi che abbozziamo lo script Python per fare queste tre misure direttamente sulle matrici sparse e sul file bolle\*.npy che avete già in .cache/movielens/?

---

