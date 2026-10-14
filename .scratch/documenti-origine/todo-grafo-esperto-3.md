Il salto di qualità sulle bolle in `bolle-nitrile` è netto e verificato: passare da 5.297 micro-bolle (mediana 9) a \*\*1.617 bolle con mediana 34 (`V7`)\*\*, in cui \*\*18 sentinelle su 20 leggono un mondo nominabile\*\* (dal \*film noir americano\* alla \*commedia sexy all'italiana\*, fino all'\*iyashikei\* intatto) e in cui \*Into Darkness - Star Trek\* esce dalla bolla di \*Guerre stellari\* per diventare una bolla \*vicina\* (peso 71), risolve il problema strutturale che teneva fermo il grafo. Anche sull'inserimento dei film nuovi a freddo, \*\*27,7% nella propria bolla esatta (450× il caso) e 0,0% in bolle scollegate\*\* in 7,7 ms per titolo dimostra che il collocatore per i film è pronto.



Prima di rispondere alle quattro domande del §4 di `handoff-senior-3.md`, ti segnalo \*\*tre dettagli meccanici nel codice di `bolle.py` e `10-vicinanza.py\*\*` (letti in `digest\_2.txt`) che spiegano alcuni comportamenti inattesi che hai osservato.



\---



\## 0. Tre bug silenziosi nel codice di `bolle-nitrile` (`digest\_2.txt`)



1\. \*\*`"genres"` manca da `COLS\_M` e `COLS\_T` in `bolle.py` (righe 347–350) — per questo la maschera di genere ha tagliato il 76,3% di `DIR`:\*\*

In `bolle.py` (`costruisci\_insiemi`) le colonne lette dai Parquet sono:





```python

COLS\_M = \["id", "keywords", "cast", "directors", "runtime", "release\_date",

&#x20;         "production\_companies", "production\_countries", "collection\_id"]



```





A differenza di `07-componenti.py` (riga 79), qui \*\*`"genres"` è stato dimenticato nella lista delle colonne\*\*. Di conseguenza `dd.get("genres")` (riga 375) restituisce sempre `None` e \*\*`GEN\[r]` è l'insieme vuoto per tutti i 66.259 titoli\*\*.





\* Effetto 1: in `maschera\_genere` (riga 218), `(GENF\[i] \& GENF\[j])` è sempre falso, quindi la maschera ha tenuto solo le coppie regista/attore che condividevano almeno una \*\*keyword esatta\*\* (`KWF\[i] \& KWF\[j]`). Ecco perché ha abbattuto ben il \*\*76,3% degli archi `DIR\*\*` (e il 39,5% di `CAST`) — un filtro severissimo che alla lettura si è rivelato benefico, ma che operava solo sulle keyword e non sui generi!





\* Effetto 2: in `costruisci\_insiemi` (riga 396), le firme `pg:{paese}|{decennio}|{genere}` di `PROD` non vengono mai generate perché il ciclo `for g in GEN\[r]:` gira a vuoto.









2\. \*\*La soglia `min\_sim = 0.12` combinata con lo shrinkage L2 azzera quasi tutto `CAST` (Ticket 02):\*\*

In `topk\_shrink` (`bolle.py`, riga 70), aggiungendo $\\tau^2$ sotto radice nella norma L2, i coseni massimi scendono fisiologicamente da $\[0, 1]$ a $\\approx \[0, 0.25]$. Applicare `min\_sim = 0.12` \*dopo\* lo shrinkage L2 taglia fuori gli archi validi di `CAST` (portando la mediana del grado di `CAST` a 0, come hai notato nell'esito del Ticket 02). Con lo shrinkage L2 attivo, `min\_sim` può restare a `0.02–0.04` perché i falsi `1.000` dei titoli con un solo attore/keyword sono già abbattuti da $\\tau^2$.





3\. \*\*In `potatura\_nucleo` (`bolle.py`, riga 290), la riassegnazione legge solo metà degli archi (`j > r`):\*\*

A `potatura\_nucleo(mem, W)` viene passato `W`, che è \*\*solo il triangolo superiore (`row < col`)\*\*. Mentre nelle righe 261 e 273 sommi correttamente `sum(1) + sum(0)` per tenere conto dei due versi, alla riga 290 (`vicini = fuori.getrow(r)`) cerchi la nuova bolla del nodo espulso `r` leggendo solo la riga `r` del triangolo superiore (`j > r`) e ignorando tutti i vicini con indice `j < r`. Basta usare `(peso + peso.T).tocsr()` per `fuori`.







\---



\## 1. Domanda 1 — Perché le serie nuove si collocano al 2,2% (contro il 27,7% dei film) e come accoglierle?



Il divario tra film (27,7% nella propria bolla) e serie (2,2% con lo studente film, 1,3% con lo studente serie) non dipende da un errore di addestramento: dipende da \*\*cosa tiene insieme una bolla di serie in `V7` rispetto a cosa vede lo studente\*\*.



\### A. Perché entrambi gli studenti a livello di singolo titolo falliscono sulle serie



1\. \*\*Asimmetria dei metadati TMDB tra film e serie:\*\* Un film ha un regista (`directors`) che spesso ha girato 10–20 film dello stesso filone e attori (`cast`) che ruotano in decine di pellicole affini. Una serie TV ha un `created\_by` che nel 70% dei casi ha creato solo quella serie, e un cast che resta fisso in quella serie per anni senza apparire altrove.





2\. \*\*Cosa forma davvero le bolle-serie in `V7`:\*\* In `V7` (`B7`), le 349 bolle-serie sono scolpite quasi interamente da \*\*`B` (`boot-B.npz`, 4 milioni di archi `related` Trakt) e `TV` (co-visione Trakt)\*\*. Al contrario, i metadati che identificano davvero il "mondo" di una serie TV a freddo — cioè \*\*il Network (`HBO`, `FX`, `Netflix`, `BBC`, `Tokyo MX`), lo Studio d'animazione o di produzione (`MAPPA`, `Kyoto Animation`, `A24`, `Studio Dragon`), il Paese + Lingua (`KR`, `JP`, `TR`, `ES`, `NO`) e il Genere\*\* — sono pochissimo sfruttati o assenti nello spazio bersaglio dello studente.





3\. \*\*Rumore nel vicinato 1-a-1:\*\* Quando proietti una serie nuova in $\\mathbb{R}^{128}$ e cerchi le \*\*singole serie\*\* più vicine per coseno, un singolo titolo televisivo con 3 keyword generiche ha un vettore rumorosissimo.







\### B. La soluzione in due mosse: Centroidi di Bolla Diretti (per il 100%) + Ponte Film→Serie (per il 58,7%)



Non devi scegliere tra il ponte via film e i mondi solo-serie (anime, dorama, K-drama): \*\*vanno combinati come due voti sulla stessa partizione di 349 bolle-serie\*\*.



1\. \*\*Voto 1 — Matching diretto contro i 349 Centroidi di Bolla-Serie (risolve il 41,3% solo-serie come \*Banana Fish\* e \*Star Trek: Discovery\*):\*\*

Una singola serie ha metadati sparsi (magari solo 3 keyword e 1 network), ma \*\*una bolla di 34 serie ha un profilo aggregato ricchissimo\*\*!





\* Per ciascuna delle \*\*349 bolle a maggioranza serie\*\*, costruisci \*\*un unico vettore centroide TF-IDF\*\* $\\mu\_b$ aggregando tutte le feature dei suoi 30–40 membri (pesati per la loro purezza interna): `keywords` + \*\*`genres` (ripristinati!)\*\* + \*\*`networks`\*\* + \*\*`production\_companies`\*\* + \*\*`production\_countries` / `original\_language\*\*` + `cast` + `created\_by`.





\* Nella bolla di \*Banana Fish\* il centroide $\\mu\_b$ avrà pesi altissimi su `anime`, `seinen`, `MAPPA`, `JP`, `based on manga`; nella bolla di \*Star Trek: Discovery\* avrà `space opera`, `Paramount+ / CBS`, `Star Trek` cast/franchise.





\* Quando arriva una serie nuova $s$, invece di fare k-NN contro 17.000 serie rumorose, calcoli direttamente il prodotto scalare $S\_{\\text{diretto}}(s, b) = \\langle \\text{tfidf}(s), \\mu\_b \\rangle$ contro i \*\*349 centroidi delle bolle-serie\*\*!









2\. \*\*Voto 2 — Il passo in due tempi via Film (sfrutta il 58,7% con appoggio film, come documentari, crime, sci-fi):\*\*

\* Usa lo studente dei film (che fa il \*\*27,7%\*\* sulla propria bolla e \*\*0% fuori quartiere\*\*!) per trovare la distribuzione di probabilità della nuova serie sulle bolle-film $P(b\_{\\text{film}} \\mid s)$, e moltiplicala per la matrice di adiacenza bolla-film $\\to$ bolla-serie $BB\_{\\text{film} \\to \\text{serie}}$:







$$S\_{\\text{ponte}}(s, b\_{\\text{serie}}) = \\sum\_{b\_{\\text{film}}} P(b\_{\\text{film}} \\mid s) \\cdot \\tilde{BB}(b\_{\\text{film}}, b\_{\\text{serie}})$$









3\. \*\*Fusione a livello di bolla (349 candidati):\*\*

Assegna la serie nuova alla bolla-serie che massimizza $S\_{\\text{diretto}}(s, b) + \\lambda \\cdot S\_{\\text{ponte}}(s, b)$.





\* Dove il ponte film esiste (documentari, thriller, sci-fi live-action: il 58,7%), i due voti si sommano e blindano la scelta.





\* Dove il mondo è solo-serie (il 41,3%: anime \*seinen/iyashikei\*, K-drama, telenovelas), $S\_{\\text{ponte}} \\approx 0$ e decide interamente il centroide $\\mu\_b$ di studio/network/lingua/keyword.











\---



\## 2. Domanda 2 — La mappa a 8 slot: esistono gli slot "vibe" a questo livello, o stiamo costruendo una tassonomia che non c'è?



\*\*A questo livello di granularità (`V7`, 1.617 bolle), la divisione "4 canonici + 2 vibe" è una tassonomia artificiale che non serve più: buttala via e tieni solo `6 vicini diretti + 2 ponti cross-medium\*\*`.



C'è un motivo meccanico preciso per cui in `10-vicinanza.py` hai trovato che \*\*156 coppie su 160 sono "comportamento"\*\*:



\* Guarda le righe 47–69 di `10-vicinanza.py`:





```python

BEH = ("CF", "CFst", "B", "TV", "LIST")

STR = ("KW", "CAST", "DIR", "COLL")



```





Quando due bolle $b\_1 \\neq b\_2$ sono distinte nella partizione `V7`, quasi tutti gli archi di `COLL` (stessa saga) e `DIR` (stesso regista) sono già finiti \*\*dentro\*\* la stessa bolla (perché `COLL` pesa 3 e Leiden ha già raggruppato le saghe e le filmografie!). In più, `CAST` aveva grado mediano 0 per via della soglia `0.12`, mentre `CFst` (che è predetto dai metadati) è stato messo dentro `BEH`!





\* Quindi \*\*fra bolle diverse\*\*, per costruzione, gli archi strutturali residui sono quasi zero (salvo \*Star Wars film ↔ Star Wars TV\* che sono rimasti separati per medium), mentre i ponti tra una bolla e l'altra sono portati dalla \*\*co-visione degli utenti (`CF`, `B`, `TV`, `LIST`)\*\*.





\* Ed è una notizia \*\*eccellente\*\*: come hai letto in `10-vicinanza.py` (esito del Ticket 10), i primi 8 vicini per peso di `BB` (`knn\_diretto`) danno già quartieri culturali perfetti (\*Film Noir\* $\\to$ \*Hitchcock / Espressionismo tedesco\*; \*Tarkovsky\* $\\leftrightarrow$ \*Kurosawa\*; \*Fantasy anni '80\* $\\to$ \*Stand by Me / WarGames / Ghostbusters\*).







\*\*Come risolvere l'asimmetria del ponte Cross-Medium (§2.4):\*\*

Hai notato che \*Guerre stellari\* (film) vede \*The Mandalorian\* (serie) nei suoi primi 8 vicini, ma \*The Mandalorian\* non vede \*Guerre stellari\* perché ha altre 8 bolle-serie con peso più alto.

Il rimedio è banale e deterministico: invece di fare un unico `knn\_diretto(BB, k=8)` su tutte le 1.617 bolle indistintamente, \*\*separa l'estrazione per medium della bolla di arrivo\*\*:



\* \*\*6 slot Intra-Medium:\*\* i 6 vicini di peso massimo in `BB` che hanno la \*\*stessa maggioranza di medium\*\* della bolla di partenza;

\* \*\*2 slot Cross-Medium (simmetrizzati):\*\* i 2 vicini di peso massimo (su `BB` + `KW/COLL/CAST`) che hanno \*\*maggioranza di medium opposta\*\*, forzando la simmetria (se la bolla-film $F$ sceglie la bolla-serie $S$ come ponte cross-medium, aggiungi anche $F$ ai ponti cross-medium di $S$). Così \*The Mandalorian\* e \*Guerre stellari\* si vedono sempre in entrambe le direzioni.







\---



\## 3. Domanda 3 — La dimensione delle bolle: 162 titoli (mediana 34) è un mondo o è già troppo per un carosello?



\*\*È la dimensione giusta per il prodotto, e non va rimpicciolita\*\*.



Confondere la \*\*taglia di una bolla\*\* (34 di mediana, 114–162 per i grandi movimenti storici come il \*Film Noir Americano\* o la \*Commedia Sexy all'Italiana\*) con la \*\*lunghezza di una riga UI\*\* (20 locandine) era l'equivoco implicito della vecchia partizione da 5.297 bolle:



1\. \*\*In YACA (`docs/ALGORITHMS.md`, §4 e §6.1), una pagina di catalogo Stremio mostra 20 card\*\*, ma applica una \*\*penalità di invecchiamento delle impressioni (`calculateImpressionPenalty`)\*\* dopo 3 giorni di visualizzazione per far ruotare il carosello.





2\. Se una bolla ha solo 9–12 titoli (come nella vecchia partizione), \*\*non riesce nemmeno a riempire una singola riga da 20 card\*\* e dopo una settimana di rotazione delle impressioni è completamente prosciugata.





3\. Con \*\*mediana 34 (e 100–160 per i filoni classici)\*\*:

\* La leva \*\*Porta d'Ingresso\*\* (`purezza \* pct\_locale`, Ticket 14) estrae dai 114 film noir i \*\*20 capolavori archetipici\*\* (\*La fiamma del peccato, Gilda, Rififi, Giungla d'asfalto\*) per il carosello principale;





\* La leva \*\*Deep Cut\*\* (`purezza > mediana`, `pct\_locale` in `\[0.05, 0.45]`) estrae dallo stesso bacino di 114 film le \*\*20 perle nascoste\*\* per \*Hidden Gems\*;





\* Se inoltre vuoi ordinare i 162 membri di una bolla grande in modo personalizzato per l'utente che ci è arrivato da un seme $i$, ti basta ordinare i membri $j \\in B$ combinando la leva locale con il peso diretto nel grafo dei titoli $W\_{ij}$.











Il Ticket 09 ha dimostrato sperimentalmente che a RB 200 i mondi si frantumano e a RB 60 colano: \*\*congelate `V7` (RB 100) come partizione definitiva\*\*.



\---



\## 4. Domanda 4 — Come evitare catene di misure fragili in cui la precisione numerica o il tasso base decidono al posto vostro?



Se guardi i sei artefatti che avete smascherato dall'inizio del progetto (il teacher nullo del Report 58, il riferimento del Report 41, l'inversione di `verifica-popolare.py`, il `row < col` su matrice asimmetrica, la maschera `Pn = 0.0` sulle serie in `inserimento` e il tasso base del 79,4% sulle bolle adiacenti), \*\*non sono errori di teoria: sono tutti passaggi silenziosi di array degeneri attraverso `argsort` o prodotti matriciali\*\*.



Per blindare la pipeline senza moltiplicare gli esperimenti manuali, trasforma i vostri controlli in \*\*tre contratti automatici (`assert` bloccanti nel codice canonico)\*\*:



1\. \*\*Contratto Anti-Pareggio dentro `ranghi()` e prima di ogni `argsort`:\*\*

Cinque dei vostri sei falsi positivi sono nati perché una riga o colonna di punteggi è diventata \*\*costante\*\* (`0.0` o `-inf`) per una fetta di nodi, e `np.argsort` ha silenziosamente ordinato per indice di catalogo `\[0, 1, 2, ...]`.

Inserisci queste 4 righe direttamente dentro `canone.py:ranghi()`:





```python

\# Vietato calcolare ranghi su colonne costanti o con >50% di pareggi nei primi K

val = S\[filtro] if filtro is not None else S

top\_k = np.partition(val, -50, axis=0)\[-50:]

assert np.all(np.ptp(top\_k, axis=0) > 1e-7), "ERRORE: colonna con top-50 costante (artefatto di argsort)!"



```





Con questo singolo `assert`, il bug della maschera sulle serie in `inserimento` e il bug di `verifica-popolare.py` avrebbero lanciato un'`AssertionError` al primo secondo invece di stampare una tabella di percentuali.





2\. \*\*Contratto di Tasso Base (Cohen's $\\kappa$ automatico):\*\*

Vieta a qualsiasi script di stampare una percentuale di successo $H\_{\\text{oss}}$ senza calcolare, nella stessa funzione e sulla stessa matrice, il valore atteso $H\_{\\text{caso}}$ ottenuto permutando casualmente le etichette (`rng.permutation`), stampando sempre la coppia `(H\_oss, H\_caso, lift = H\_oss / H\_caso, kappa = (H\_oss - H\_caso) / (1 - H\_caso))`. Così un `95%` su un grafo denso all'`80%` viene immediatamente ridimensionato da `lift = 1.19x`.





3\. \*\*Contratto di Non-Vuotezza dei Componenti (`assert\_componente`):\*\*

In `bolle.py`, quando costruisci un insieme di feature (`GEN`, `KW`, `CA`, `SIG`) o una matrice `C\[nome]`, metti un `assert` sul grado mediano e sulla copertura (es. `assert sum(len(x) for x in GEN) > 0` e `assert np.median(gradi\[gradi > 0]) >= 3`). Questo avrebbe intercettato all'istante sia `"genres"` mancante da `COLS\_M` sia l'azzeramento di `CAST` con soglia `0.12`.







\---



\## 5. Il passo successivo consigliato (l'ultimo prima di `src/`)



Avete chiuso il cerchio su recupero (`grafo-servibile` Ticket 24), bolle (`bolle-nitrile` `V7`) e inserimento film (`inserimento` Ticket 04). Vi mancano solo due verifiche rapide da 30 minuti per chiudere anche l'inserimento delle serie e il Ticket 10 (`10-mappa-nuova.md`):



1\. \*\*In `inserimento` (per le serie nuove):\*\* costruisci i \*\*349 centroidi TF-IDF $\\mu\_b$ delle bolle-serie di `V7\*\*` (includendo `genres`, `networks`, `production\_companies`, `production\_countries`, `keywords`, `cast`, `created\_by`) e misura sul banco delle 600 serie nascoste quanti tornano nella \*\*propria bolla\*\* combinando il coseno diretto col centroide $\\mu\_b$ e il ponte a due passi dai film.





2\. \*\*In `bolle-nitrile` (Ticket 10):\*\* salva la mappa finale di `V7` con \*\*6 vicini intra-medium + 2 ponti cross-medium simmetrizzati\*\* e ricalcola `(purezza, pct\_locale)` del Ticket 14 sulle 1.617 bolle di `V7`.







Vuoi che scriviamo lo script per il \*\*matching diretto sui 349 centroidi delle bolle-serie\*\* (più il ponte via film) per vedere subito di quanto balza quel 2,2% sulle serie?

