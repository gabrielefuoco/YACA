Il lavoro fatto in `todo-grafo` e `mappa-pesata` ha chiuso il buco più grande rimasto aperto nel terzo handoff: scoprire che `leggi()` in `bolle.py` scartava le stringhe di `production_countries` (perdendo 34.331 titoli non angloamericani e 44.279 firme `pg:`) e passare al voto diretto sui centroidi TF-IDF ha portato la collocazione a freddo delle serie **dal 2,2% al 35,3% sulla propria bolla (41,9% a parità di bolle candidate, lift 119×, 0,3% di bolle scollegate)** in 8,7 ms per titolo e senza modelli da riaddestrare.

Ancora più importante è l'obiezione su *Verity*, perché ha portato alla luce il conflitto strutturale tra **ciò che premia il banco (la co-visione storica)** e **ciò che vede l'occhio umano su un titolo nuovo (la coerenza di genere/tema)**. Di seguito trovi le risposte dirette alle quattro domande del §4 di `handoff-senior-4.md`.

---

## 1. La partizione è il limite, o lo è il metodo? E come si misura la coerenza di un mondo senza umani?

**Il limite che hai toccato su *Verity* è nella partizione dura (hard clustering su grafo misto), non nel collocatore V3**. Ed è un fenomeno strutturale preciso, visibile leggendo `bolle-esempi.md`:

### A. Perché in V8 non esiste la bolla "thriller psicologico" (e perché esiste la bolla 820)

Guarda i membri della **bolla 820** in cui atterra *Verity*: *Inception, Fight Club, Shutter Island, Seven, The Truman Show, Gone Girl, The Prestige, Memento, Se mi lasci ti cancello, Il cigno nero, Donnie Darko, Prisoners*.

* Dal punto di vista tematico per un titolo del 2026 è un minestrone (c'è sci-fi onirica, dramma satirico, thriller domestico). Ma dal punto di vista **comportamentale (`CF + TV + LIST`)** non è affatto un errore di Leiden: quella è esattamente la **"Bolla del Canone IMDb Top-100 / Mind-Bending anni '90–2010"**.


* Poiché nel grafo che genera V8 i segnali di co-visione e liste pesano molto, sui film celebri **l'attrattore comportamentale ("chi guarda Fincher guarda anche Nolan e Scorsese") batte l'attrattore tassonomico ("thriller psicologico domestico")**. Di conseguenza, i capolavori del thriller psicologico (*Gone Girl, Shutter Island, Seven, Prisoners*) vengono "sequestrati" dentro la bolla 820 dal pubblico generalista, lasciando i restanti thriller psicologici di medio budget sparpagliati in 20 bolle diverse divise per epoca, paese o sottotema (505, 551, 776, 930).


* Un secondo effetto opposto si vede nella **bolla 594** di `bolle-esempi.md` (*Lo spaghetti western*), che mescola western italiani (*Django il bastardo, Mannaja*) con horror italiani e turchi (*Zeder, Demoni 3, Dabbe*): una volta ripristinati `"genres"` e `"production_countries"` in `bolle.py`, la firma `pg:IT|1970|...` e la maschera `(GENF[i] & GENF[j])` (che lascia passare qualunque coppia di film di un regista/attore purché condividano anche un solo macro-genere) hanno saldato insieme due generi diversi fatti dagli stessi artigiani italiani negli stessi anni.



### B. Come misurare automaticamente se un "mondo" è frantumato o se una bolla è una chimera

Il Ticket 09 di `bolle-nitrile` guardava la mediana globale delle taglie, che non vede se un genere specifico si è polverizzato. Per misurare la coerenza dei singoli mondi **senza chiedere a un umano**, puoi usare due metriche algebriche duali sulle ancore tematiche (le ~500 keyword/tropi con $30 \le \text{df} \le 1.500$, come `kw:psychological thriller`, `kw:spaghetti western`, `kw:film noir`, `kw:cyberpunk`, `kw:iyashikei`):

1. **Indice di Frammentazione del Mondo (Numero Effettivo di Bolle per Tropo, $N_{\text{eff}}(t)$):**
Dato un tropo tematico $t$ (es. `kw:psychological thriller`), calcola la distribuzione $P(b \mid t)$ (frazione dei titoli con il tropo $t$ che cade nella bolla $b$) e il suo inverso di Herfindahl (Inverse Participation Ratio):

$$N_{\text{eff}}(t) = \frac{1}{\sum_{b} P(b \mid t)^2}$$


* Se $N_{\text{eff}}(\text{film noir}) \approx 2{,}1$, il mondo del noir è raccolto e coeso (come nella bolla 104).


* Se $N_{\text{eff}}(\text{psychological thriller}) \approx 18{,}5$, lo script ti segnala in automatico che quel mondo è **polverizzato in 20 bolle** senza bisogno che un umano cerchi *Verity*.




2. **Indice di Chimera Interna (PMI negativa tra i Token Dominanti della bolla):**
Per ogni bolla $b$, prendi i suoi 5 token tematici (`ge:` e `kw:`) con il peso più alto nel centroide V3. Calcola la Pointwise Mutual Information (PMI) tra tutte le coppie di quei 5 token sull'intero catalogo TMDB:


* Nella bolla 750 (*Fantasy anni '80*: `kw:sword and sorcery`, `kw:magic`, `ge:fantasy`) tutte le coppie hanno $\text{PMI} \gg 0$.


* Nella bolla 594 (`kw:spaghetti western` + `ge:horror`) la coppia ha $\text{PMI} < 0$ nel catalogo globale: una PMI negativa tra i due descrittori di testa di un centroide identifica meccanicamente una **bolla-chimera** (due mondi incompatibili incollati da un terzo fattore come paese o regista).





---

## 2. Due livelli invece di uno (Bolla Macro + 10 Vicini Micro): è la strada giusta o un modo di non decidere?

**È la strada giusta, ed è la soluzione strutturale definitiva al problema di *Verity***. Non è un compromesso per evitare di scegliere: risponde al fatto matematico che **una partizione globale e un vicinato locale risolvono due problemi geometricamente incompatibili**:

* **Perché fonderli in una scelta sola produce sempre errori sui bordi:** Una partizione come V8 divide una varietà continua a 10 dimensioni in 1.625 poliedri disgiunti (mediana 33 titoli, ma il 49% dei titoli vive in bolle da 60 a 552 titoli). Se un titolo cade vicino al bordo di una bolla grande — o se la bolla è un attrattore di popolarità come la 820 — il centroide della bolla conterrà inevitabilmente titoli lontani dal punto di atterraggio del singolo film (*Fight Club* o *The Truman Show* rispetto a *Verity*).


* **Come separare i ruoli dei due livelli in `colloca_finale.py` e in `src/`:**
1. **Livello Micro — I 10–15 Titoli più vicini (`k-NN` su `05-tfidf.npz` V3, senza vincolo di bolla):**
Rappresenta il **mondo immediato del titolo** (*Le Grand Jeu, El páramo, Dark Cloud, Il silenzio della palude, Gone Girl*). In produzione va usato ogni volta che il punto di partenza è il singolo titolo: per iniettare un titolo nuovo nel *Seed Network* (`src/engines/hybrid/scoringEngine.js`) e per popolare i suggerimenti diretti "Simili a questo".


2. **Livello Macro — La Bolla (o le Top-2 Bolle quando la confidenza è divisa):**
Rappresenta l'**indirizzo postale sulla mappa** ($1.625 \times 1.625$). Serve per: (a) trovare le bolle adiacenti sulla mappa pesata `6+2` (`mappa-pesata-6-2.npz`), (b) applicare i tetti di diversità (`getItemNarrativeStrand` in `ProfileScorer.js`), e (c) estrarre *Porta d'Ingresso* e *Deep Cut*.


3. **Il raccordo tra Micro e Macro dentro una bolla grande:** Quando mostri i titoli di una bolla da 60–160 membri a un utente che ci è arrivato tramite un titolo $x$, non ordinare la bolla solo per `purezza * pct_locale` statico: moltiplica per $(1 + \cos_{\text{V3}}(x, j))$, così dentro la bolla 820 chi entra da *Verity* vede affiorare in testa *Gone Girl*, *Shutter Island* e *Prisoners*, mentre *Inception* e *The Truman Show* scivolano in fondo.





---

## 3. Il banco non è l'arbitro: come misurare la qualità semantica senza dipendere dalla co-visione

Hai dimostrato con chiarezza perché il 35,3% (o il 32,0% di V3) sul banco LOO non basta: **la "bolla vera" del banco è stata creata con il comportamento (`CF + B + TV + LIST`)**, quindi quando V3 mette un thriller psicologico insieme ad altri thriller psicologici invece che insieme a *Fight Club* (dove l'aveva spinto la co-visione), il banco lo segna come errore mentre per l'umano è un miglioramento.

Per avere un arbitro automatico della **qualità semantica pura** (che valga anche per le uscite del 2026 prive di co-visione), affianca al LOO sulla bolla due misure che non usano né `CF/B/TV` né le feature usate dal collocatore:

1. **Coerenza Cross-Vista sul Testo della Trama (`overview` embedding $\cos$):**
Il collocatore V3 usa `genres`, `keywords`, `cast`, `directors`, `networks`, `companies`, `countries` — ma **non usa mai il testo libero della trama (`overview`)**.
In `offline_graph_builder/build_graph.py` avete già in casa `SentenceTransformer('BAAI/bge-small-en-v1.5')`:


* Codifica una sola volta le `overview` dei 66.259 titoli in una matrice densa `E_trama` ($66.259 \times 384$, ~95 MB su disco).


* Per ogni titolo nuovo o di test $i$, misura la similarità coseno media su `E_trama` tra $i$ e i **suoi 10 vicini Micro** (e tra $i$ e il **centroide di trama della bolla predetta**), rapportata al tasso base casuale sullo stesso medium ($\text{Lift}_{\text{trama}}$ e $\kappa_{\text{trama}}$).


* Poiché `overview` non entra in V3, se una modifica ai pesi dei token (come passare da V1 a V3 in `05-peso-token.py`) fa scendere il LOO comportamentale da 35,3% a 32,0% ma **fa salire la similarità sulla trama $\text{Sim}_{\text{trama}}$**, hai la prova oggettiva e indipendente che i film scelti raccontano storie più simili.




2. **Scomposizione degli "Errori" del Banco in *Promozioni Semantiche* vs *Errori Veri*:**
Sul 68% di casi in cui `bolla_predetta != bolla_vera` nel LOO delle 600 serie, calcola la sovrapposizione di generi e keyword pure (`ge:` + `kw:`) del titolo $i$ con `bolla_predetta` rispetto a `bolla_vera`:


* Se $\text{Sim}_{\text{ge+kw}}(i, b_{\text{predetta}}) > \text{Sim}_{\text{ge+kw}}(i, b_{\text{vera}})$, non è un errore del collocatore: è un caso in cui la bolla comportamentale originaria era eterogenea e il collocatore ha scelto una bolla tematicamente più pura. Contare separatamente `Propria Bolla (32,0%) + Bolla Tematicamente Più Pura (X%)` ti toglie il falso trade-off tra V1 e V3.





---

## 4. Che forma ha un contratto sulla *coerenza* di un risultato (per fermare i numeri gonfiati)?

I contratti di non-degenerazione (`assert_non_degenere`, `assert_componente`) guardano **un solo array** e verificano che non sia piatto o vuoto. Ma i due incidenti di questo giro — il **63,7% del LOO incompleto** e il **58,27% di tasso base sbagliato** (più i 94 titoli fuori lista) — sono errori **relazionali**: il singolo array di output ha una distribuzione bellissima e non degenere, ma viola un'identità rispetto ai dati di input.

Per intercettare automaticamente i numeri gonfiati o disallineati, aggiungi al modulo dei contratti (`03-contratti.py`) **tre invarianti relazionali**:

### 1. Contratto di Invarianza "Brute-Force Spot Check" (contro il Data Leakage nel LOO)

Quando si scrive un Leave-One-Out vettorializzato veloce su matrici sparse, è facilissimo dimenticare di sottrarre il contributo di $i$ da una normalizzazione, da un IDF o da un denominatore, gonfiando il risultato da 35,3% a 63,7%.

* **Forma del contratto (`assert_loo_esatto`):** La funzione di valutazione riceve la matrice dei punteggi `S_loo` calcolata dal metodo veloce e, prima di restituire la metrica, estrae **5 item a caso**, cancella fisicamente la loro riga dalla matrice delle feature $X[i, :] = 0$, ricalcola da zero il centroide della loro bolla $\mu_b^{(-i)}$ e verifica:
```python
for i in campione_5:
    b = int(mem[i])
    membri_puri = [m for m in np.where(mem == b)[0] if m != i]
    centroide_puro = normalizza_l2(X[membri_puri].mean(axis=0))
    sim_pura = float(X_orig[i] @ centroide_puro.T)
    assert np.isclose(S_loo[i, b], sim_pura, atol=1e-5), (
        f"LEAKAGE LOO su riga {i}: veloce={S_loo[i,b]:.5f} vs puro={sim_pura:.5f}"
    )

```


Costa 2 millisecondi e rende **impossibile per costruzione** qualsiasi LOO parziale: il 63,7% sarebbe esploso alla prima riga con `AssertionError: LEAKAGE LOO`.



### 2. Contratto di Somma delle Parti e Copertura dell'Universo (`assert_universo`)

L'equivoco delle 94 serie escluse (506/600 con bolla fra le candidate) e il `tasso_base` al 58,27% nascono quando l'insieme dei bersagli possibili $B_{\text{target}}$ dei dati di test non è contenuto nell'insieme dei candidati valutati $B_{\text{cand}}$, oppure quando il tasso base permuta una matrice diversa da quella di decisione.

* **Forma del contratto:** Ogni funzione `valuta_collocazione(pred, vero, candidati)` deve verificare in ingresso:
1. Quale frazione di `vero` appartiene a `candidati` (`copertura_tetto = np.isin(vero, candidati).mean()`), stampando obbligatoriamente il tetto massimo raggiungibile (es. `tetto = 84,3%`) accanto al risultato.


2. Che il `tasso_base` sia calcolato **esattamente con la stessa funzione di perdita `metrica(pred, rng.permutation(vero))**` passata come callback, vietando di passare un tasso base calcolato a parte o con default impliciti.





### 3. Contratto di Autovalidazione sui Centroidi (`assert_allineamento_spazi`)

Nel §5 segnali il rischio silenzioso più insidioso per la messa in produzione: se `05-centroidi.npz`, `05-tfidf.npz`, `05-vocab.json` e `05-idf.npy` si disallineano (es. si rigenera il vocabolario o l'IDF senza rigenerare i centroidi), il prodotto scalare restituisce numeri finiti ma privi di senso.

* **Forma del contratto (da mettere all'avvio di `colloca_finale.py`):**
1. Salva dentro ogni `.npz` un hash `sha256` del vettore `idf` e del vocabolario, e verifica l'uguaglianza esatta al caricamento.


2. **Sanity check semantico di boot (3 millisecondi):** all'import di `colloca_finale.py`, prendi 10 bolle pure (con un solo membro o con purezza $1{,}00$) e verifica che, passando i metadati grezzi del loro titolo archetipico alla funzione `colloca()`, la bolla #1 restituita sia esattamente la sua bolla al 100% e il top-1 micro sia il titolo stesso con coseno $> 0{,}99$. Se qualcuno carica `tfidf` senza `idf` o scambia due file, il modulo rifiuta di avviarsi al millisecondo zero.





---

## 5. Semaforo verde per il job notturno e `src/`

L'architettura che avete congelato in `ricerche/04-proposta-src.md` e `colloca_finale.py` — **job notturno offline** che aggiorna gli artefatti, combinato con la restituzione di **(Bolla Macro + Top-10 Micro)** su V3 — è solida, leggerissima (8,7 ms/titolo) e non tocca il percorso caldo delle richieste HTTP di Stremio.

---


Se restiamo in laboratorio per alzare la qualità prima di toccare `src/`, abbiamo un vantaggio enorme: `bolle-esempi.md` e `handoff-senior-4.md` mettono a nudo **cinque difetti strutturali precisi** che spiegano sia i casi brutti visti a occhio (*Verity*, gli horror dentro gli spaghetti western, i *Flintstones* vicini al true crime, *Emmanuelle* vicino a *Batman*), sia i limiti numerici (il 32–35% del collocatore e il crollo dal 100% al 21% sulle bolle grandi).

Ecco i **5 interventi ad alto impatto** su cui ti consiglio di aprire il prossimo ciclo di test.

---

## 1. Il bug geometrico dei centroidi: perché fai 100% sulle bolle $<10$ titoli e 21% su quelle $>120$

In fondo a `bolle-esempi.md` hai notato il fenomeno chiave: *«la collocazione a freddo riesce al 100% sulle bolle sotto i 10 titoli e al 21% su quelle sopra i 120»* (e il 49% di tutto il catalogo vive in bolle sopra i 60 titoli). Non è colpa dei dati, è una **distorsione matematica della normalizzazione L2 sui centroidi**:

* In una bolla di **5 titoli** (es. bolla 1508: *Frieren, Dungeon Food*), i membri condividono ~15 token; quando normalizzi il centroide a norma L2 $= 1$, i token dominanti hanno valori altissimi ($\approx 0{,}35$).


* In una bolla di **120–200 titoli** (il 49% dei titoli), la media dei membri ha **migliaia di token non nulli** (tutti gli attori, registi e keyword secondarie di 150 film). Quando dividi per la norma L2, la coda di migliaia di feature diluisce il vettore e **compatta verso il basso i pesi dei token principali di un fattore $3\text{–}4\times$**.


* Di conseguenza, nel prodotto scalare `tfidf(titolo) @ centroide`, **le micro-bolle battono sistematicamente le bolle grandi** perché hanno vettori più appuntiti.

**Cosa testare (`colloca_finale.py` / `05-centroidi.npz`):**

1. **Top-$M$ Sparsification del centroide prima della norma L2:** per ogni bolla (grande o piccola che sia), calcola la media dei vettori dei membri, **mantieni solo i $M \in [25, 35]$ token con il valore più alto** (azzerando tutti gli altri) e **solo dopo** normalizza a L2 $= 1$.
2. **Scoring Ibrido *Centroide + Top-5 Esemplari* (Max-K Pooling per bolla):** una bolla grande da 100 titoli contiene più sotto-filoni. Invece di misurare l'affinità di un titolo nuovo $x$ con la bolla $b$ solo tramite la media $\langle x, \mu_b \rangle$, definisci il voto della bolla $b$ come:

$$\text{Score}(x, b) = 0{,}5 \cdot \langle x, \mu_b^{(M)} \rangle + 0{,}5 \cdot \frac{1}{5} \sum_{j \in \text{Top5}(b, x)} \langle x, v_j \rangle$$



dove $\text{Top5}(b, x)$ sono i 5 membri della bolla $b$ più simili a $x$ su `05-tfidf.npz`. Se dentro una bolla di 100 film ci sono 5 thriller psicologici gemelli di *Verity* (*Gone Girl, Prisoners, Shutter Island*), quei 5 fanno vincere la bolla senza essere annacquati dagli altri 95 membri.



---

## 2. Spezzare le "Bolle-Continente" ($>60$ titoli) e liberare i thriller psicologici dalla Bolla 820

Il motivo per cui in V8 non esiste la bolla "thriller psicologico" è che il **49% dei titoli è concentrato in 364 maxi-bolle da 60 a 552 titoli**. Nella bolla 820 (*Inception, Fight Club, Shutter Island, Seven, The Truman Show, Gone Girl, The Prestige*), il segnale comportamentale (`CF + LIST`: la "IMDb Top 100") ha agito da buco nero gravitazionale, risucchiando i capolavori di generi diversi in un unico calderone e lasciando gli altri thriller psicologici orfani in 20 bolle minori.

**Cosa testare (in `bolle.py`):**

1. **Estendere la `maschera_genere` anche a `CF`, `LIST`, `B` e `TV` (non solo a `DIR` e `CAST`):**
Oggi in `bolle.py` la maschera di compatibilità tematica viene applicata solo a `DIR` e `CAST`. Applicala (con un fattore morbido, es. $\times 0{,}30$) anche agli archi di `CF` e `LIST` quando due film non condividono **né un genere specifico** (escluso *Drama*) **né una keyword**: così il pubblico di MovieLens e le liste Trakt legano *Gone Girl* a *Shutter Island* e *Prisoners*, ma smettono di incollarli a *The Truman Show* o a *Inception*.


2. **Sub-clustering ricorsivo sulle sole bolle $> 60$ titoli:**
Non cambiare la risoluzione globale RB 100 (che sulle nicchie da 15–40 titoli come il *Fantasy anni '80* [41], il *K-BL* [37] o il *Seinen* [58] è perfetta). Prendi **solo le 364 bolle con $> 60$ titoli** e fai girare un secondo passo di Leiden sul loro sottografo (pesando di più l'asse strutturale V3 rispetto a `CF`), dividendole finché nessuna bolla supera i 60–70 titoli. Vedrai la bolla 820 dividersi naturalmente in *Sci-Fi Mind-Bending* (*Inception, The Prestige, Source Code*) e *Thriller Psicologico/Investigativo* (*Gone Girl, Seven, Prisoners, Shutter Island*).



---

## 3. Eliminare le "Bolle-Chimera" (*Zeder* negli Spaghetti Western, *Emmanuelle* coi Supereroi)

Leggendo `bolle-esempi.md` saltano all'occhio tre contaminazioni che nascono da un effetto collaterale del ripristino di `"genres"` e `"production_countries"` in V8:

1. **Bolla 594 (*Lo spaghetti western*):** contiene *Django il bastardo* e *Mannaja*, ma i primi due titoli sono ***Zeder* (horror di Pupi Avati) e *Dabbe* (horror turco)**, più ***Demoni 3***! Perché? Perché quando in V8 avete rimesso `"genres"` in `bolle.py`, la condizione `if not ((GENF[i] & GENF[j]) or (KWF[i] & KWF[j]))` (riga 218) è passata dal richiedere una **keyword** in comune (com'era in V7 quando `GEN` era vuoto!) al lasciar passare qualunque coppia che condivida un macro-genere generico (`Action`, `Thriller`, `Horror`), mentre le nuove firme `pg:IT|1970|...` hanno saldato il cinema bis italiano western con quello horror.


2. **Bolla 1145 (vicina di *Batman* nella bolla 289):** contiene ***Emmanuelle in Space 6* ed *Emmanuelle in Space 7*** insieme a *Freedom Fighters: The Ray*! In `offline_graph_builder/build_graph.py` (riga 183) avevate il filtro `nsfw_pattern` che recideva gli archi tra titoli erotici e titoli normali, ma non è stato portato in `bolle.py`.



**Cosa testare (in `bolle.py`):**

* **Ripristinare la severità di `maschera_genere` di V7:** per non abbattere un arco `DIR`/`CAST`, non deve bastare condividere un solo genere generico; chiedi che condividano **almeno una keyword (`KWF[i] & KWF[j]`) OPPURE almeno due generi specifici (o lo stesso genere primario)**.


* **Aggiungere i Veti di Quarantena pre-Leiden:** azzera gli archi tra due titoli se uno è **NSFW/Erotico** (usando la regex di `build_graph.py:183`) e l'altro no (*via Emmanuelle da DC Comics*), o se uno è **Horror** (senza `Western`) e l'altro è **Western** (senza `Horror`) (*via Zeder, Demoni 3 e Dabbe dagli Spaghetti Western*).



---

## 4. Ripulire la Mappa dai "Falsi Vicini" giganti (*Miss Bala* vicino a *Vinland Saga*, *Flintstones* vicino a *Ted Bundy*)

Guarda i vicini sulla mappa pesata in `bolle-esempi.md`:

* La bolla 525 (*Seinen Anime*: *Vinland Saga, Banana Fish, Dororo*) ha come **3° vicino più forte la bolla 18 (155 titoli: *Miss Bala, Il postino suona sempre due volte, Caccia spietata*)**!


* La bolla 560 (*Late-Night Talk Show*: *John Oliver, Jimmy Fallon*) ha come **2° vicino la bolla 21 (138 titoli: *Papà, La parola ai giurati, The Hot Spot*)**!


* La bolla 12 (*True Crime*: *Ted Bundy, Making a Murderer*) ha come **1° vicino la bolla 588 (*Concerto di Natale con i Flintstones*)** e come **4° vicino la bolla 350 (*La guerra dei Roses, L'allegra fattoria*)**!



**Perché succede:** in `10-vicinanza.py` (riga 34), il peso tra due bolle `BB = S.T @ Ws @ S` è la **somma grezza degli archi** tra i loro membri. Una bolla gigante da 138–155 titoli (come la 18, la 21, la 32, la 67) ha un volume di fuoco $5\times$ superiore a una bolla normale e **non subisce alcun filtro di coerenza semantica tra i due centroidi**.

**Cosa testare (in `mappa-pesata`):**
Sostituisci il peso grezzo $BB_{ab}$ tra la bolla $a$ e la bolla $b$ con il **flusso normalizzato per taglia e moltiplicato per la coerenza tra i centroidi V3**:


$$W_{\text{mappa}}(a, b) = \frac{BB_{ab}}{\sqrt{\vert{}a\vert{} \cdot \vert{}b\vert{}}} \cdot \max\left(0, \, \cos(\mu_a^{\text{V3}}, \mu_b^{\text{V3}})\right)$$

* Dividere per $\sqrt{\vert{}a\vert{} \cdot \vert{}b\vert{}}$ toglie il vantaggio di volume alle bolle da 150 titoli.


* Moltiplicare per $\cos(\mu_a^{\text{V3}}, \mu_b^{\text{V3}})$ (che hai già pronto in `05-centroidi.npz`!) azzera all'istante qualsiasi legame spurio tra *Vinland Saga* e *Il postino suona sempre due volte*, o tra *Jimmy Fallon* e *La parola ai giurati*, perché i loro centroidi V3 hanno coseno prossimo a zero!



---

## 5. Chiudere il cerchio: portare i pesi V3 *dentro* la costruzione delle bolle (V9)

Nel Ticket 05 di `mappa-pesata` hai dimostrato che le regole V3 (`df >= 3`, tetto sull'IDF per tagliare `baffled`/`dreary`, pesi per tipo di token) eliminano il rumore lessicale. Però finora avete applicato V3 **solo a valle** (nel collocatore `05-tfidf.npz`), mentre i componenti `KW`, `CAST`, `DIR` e `PROD` che costruiscono le bolle V8 usano ancora `matrice_idf` di `bolle.py` (riga 44) **senza `df >= 3` e senza tetto IDF**!

* Portare `df >= 3` e il tetto IDF dentro `bolle.py:matrice_idf` prima di fare `topk_shrink` allinea finalmente il modo in cui nascono le bolle con il modo in cui i titoli nuovi ci vengono collocati dentro.



