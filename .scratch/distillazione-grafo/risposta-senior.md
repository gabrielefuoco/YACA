### 0. Il verdetto in sintesi: dove serve davvero lo spazio denso (e dove no)

Distillare il grafo in uno spazio vettoriale denso **è la strada giusta**, ma a una condizione architetturale precisa: **lo spazio denso non deve sostituire la camminata di `camminata.py` sui nodi caldi, deve sostituire `collocator.py` (V1/V3 TF-IDF) e `spazi-trakt.py` (`Pc`/`Pb`/`CFst`)**.

Il grafo attuale (66.259 titoli, 13,25M archi, 3.497 bolle) fa già benissimo il lavoro topologico locale fino al rango 16–20 (100% di precisione nel top-10, 92% nel top-20 sulla sonda dei 6 titoli). Dove invece la struttura discreta fallisce strutturalmente — e dove un embedding denso risolve tre problemi in un colpo solo — è:

1. **Cold start e `uscite.py` (Ticket 10)**: oggi `collocator.py` colloca le novità usando solo un TF-IDF sparso a 79.281 colonne (`05-tfidf.npz`), **ignorando del tutto i 1024 float della trama `qwen3**` (`04-trama-qwen3b.npy`). Inoltre soffre del **bug geometrico dei centroidi** documentato in `measure/legacy/geometria.py`: la normalizzazione L2 su bolle grandi (100+ titoli, migliaia di token attivi) schiaccia i pesi dei token principali di 3–4× rispetto alle micro-bolle da 5 titoli (100% di successo sotto i 10 titoli, 21% sopra i 120). In uno spazio denso 256-d con norma fissa, questo bias dimensionale scompare per costruzione.
2. **Le serie TV e il ponte cross-medium**: in `upstream/spazi-trakt.py` il secondo teacher viene azzerato sulle serie (`Pb[is_tv] = 0.0`), e la collocazione delle serie è ferma al **63,0%** con V1 (e crolla al **35,3%** con V3).
3. **La pulizia della coda e il recupero dei "fratelli lontani"**: oltre il rango 20–30 l'ordine per peso nel triangolo non è più un ordine di significato (*Breaking Bad* ha un drama coreano da 13 voti al rango 14 e *I Soprano* al rango 90; *Inkheart* ha 11 comedy/TV tedesche della bolla 674 fra i ranghi 41 e 58). Un coseno nello spazio denso permette di filtrare le allucinazioni topologiche a basso supporto e recuperare i vicini semantici/comportamentali che la potatura top-16 aveva tagliato fuori.

---

### 1. Diagnosi sulla fotografia del grafo: perché la coda deraglia

Guardando insieme `fotografia-grafo.csv`, `bubbles.py` e `steps/02_partizione.py`, si capisce esattamente **perché** i pesi del triangolo V10 vanno da $0.03$ a $402.85$ e perché compaiono intrusi con 12–30 voti nei top-20/50:

* **L'amplificazione moltiplicativa nel triangolo**: in `02_partizione.py` il triangolo `bolle-eterogeneo-V10-p1.0-r200-triangolo.npz` viene salvato **dopo** tre trasformazioni non lineari in `bubbles.py`:

1. `shrink_riga(M, tau_rel=1.0)` sulla somma delle 10 viste;
2. `chiusura_triangolare`: moltiplica ogni arco per $(O_{ij} + 0.1)$, dove $O_{ij} = (\mathbb{I}_{M>0} \cdot \mathbb{I}_{M>0}^T)_{ij}$ è il **numero intero di vicini binari condivisi** su tutte le 10 viste (che può valere 50–150);
3. `consenso_multivista` $\times$ `archi_leiden`: moltiplica per $(0.5 + 0.5 N_{ij})$ e per il bonus di reciprocità $2.0 \sqrt{M_{ij} M_{ji}}$.

* **L'effetto sulle code e sui titoli freddi**: quando un titolo oscuro (es. *은수 좋은 날*, 2025, 13 voti, rango 14 di *Breaking Bad*, `w_raw = 0.702`; oppure *Днюха!*, 2018, 12 voti, rango 18 di *Perfetti sconosciuti*, `w_raw = 0.181`) condivide una trama simile (`TRAMA`, top-30) o una manciata di keyword/paese (`pa:DE` per la co-produzione tedesca di *Inkheart* verso la bolla 674), eredita decine di vicini binari comuni nella vista `TRAMA` o `KW`. La chiusura triangolare $O_{ij}$ moltiplica quell'arco di puro contenuto per 15–20×, facendogli scavalcare *I Soprano* o *Ozark*, i cui archi comportamentali (`B`/`TV`) sono stati attenuati dalla correzione d'hub (`correggi_hub_2`, $\beta=0.25$).

---

### 2. Risposte puntuali alle domande (Fotografia §6 + Handoff §4)

#### 2.1 Pesi, Supporto, Simmetria e Taglio Top-$K$ (Fotografia Q1, Q2, Q3, Q6 · Handoff Q2, Q9, Q11)

| Scelta progettuale                             | Raccomandazione secca                                                                    | Motivazione sui numeri del grafo |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------- |
| **Camminata servita (`camminata.py`)** | **Tenere `POTA_PER_RIGA = 16**` (testare al massimo `20`; **non salire a 25**) |                                  |

 | Da `topk.txt`, salire da 16 a 25 aggiunge **+792.626 archi (+51,8%)**, abbassa la massa intra-bolla dal **70,4% al 66,8%**, la massa saghe dal **29,1% al 25,1%** e su *Breaking Bad* i ranghi 17–25 portano solo 3 giusti contro 4 dubbi e 2 sbagliati. Con 20 iterazioni di PageRank (`ALPHA=0.60`), gli archi spuri tra rango 17 e 25 aprono ponti verso bolle aliene.

 |
| **Taglio per la matrice Teacher ($N \times K$)** | **Top-25 per riga** (con ablation a 20 e 30)

 | Il top-20 copre il **58,5%** del peso mediano di riga (20° peso al **20,9%** del max), il top-30 il **71,9%** (30° al **14,2%**). Nei ranghi 21–25 la precisione marginale è ancora al **77%** (23/30 giusti), mentre tra 26–30 scende al **67%** e oltre il 30 crolla al **40–54%**. **25** massimizza il richiamo senza imbarcare la spazzatura dei ranghi 31+.

 |
| **Pavimento (Floor) sugli archi** | **Doppio pavimento**: relativo $w_{ij} \ge 0.02 \cdot \max_k w_{ik}$ (2% del max di riga) **E** assoluto $w_{ij} \ge 0.15$ | In `fotografia-grafo.csv`, l'intero ponte spurio *Inkheart $\to$ bolla 674* vive tra l'**1,04% e l'1,54%** del massimo di riga (`w_raw` $0.128 - 0.189$). Un floor al **2% del max** lo azzera al 100%, e taglia anche tutta la coda di blockbuster familiari di *Spider-Man* dal rango 16 in giù (che sta sotto l'1,1% del max).

 |
| **Supporto (Co-spettatori vs Voti)** | **Non ricalcolare l'upstream CF**; applicare uno **shrinkage di supporto sui voti TMDB** $\text{VOT}_i, \text{VOT}_j$ già in `metadati-canone.npz` | L'upstream CF MovieLens copre solo i film e non le serie né le liste Trakt. Invece `VOT` (`vote_count` TMDB) copre il 100% del canone ed è l'esatto discriminante dei falsi positivi: i vicini sbagliati hanno mediana **70–610 voti** (12 voti per *Днюха!*, 13 per *은수 좋은 날*, 13–34 nella bolla 674).

 |
| **Formula del peso Teacher $p_{ij}$** | **Compressione `log1p` $\times$ confidenza di supporto, normalizzata L1 sulla riga**:

$\tilde{w}_{ij} = \log(1 + w_{ij}) \cdot \sqrt{\frac{\min(\text{VOT}_i, \text{VOT}_j)}{\min(\text{VOT}_i, \text{VOT}_j) + 50}}$

$p_{ij} = \frac{\tilde{w}_{ij}}{\sum_{k \in \text{Top25}(i)} \tilde{w}_{ik}}$ | Il peso grezzo ha dinamica estrema (`Spider-Man 2` = 259,9; `Better Call Saul` = 83,3, pari al 63,2% dell'intera riga di *Breaking Bad*): senza `log1p`, la riga di *Breaking Bad* insegna un solo vicino. Il rango puro invece appiattisce il salto 4°$\to$5° di *Spider-Man* ($24.9 \to 16.8$). Il fattore $\sqrt{\frac{v_{\min}}{v_{\min}+50}}$ dimezza il peso dei titoli con 12–15 voti lasciando intatti quelli sopra i 300 voti.

 |
| **Feature extra nel peso (bolla, regia, saga, trama)** | **Nessun bonus aggiuntivo nella formula del peso** | Nel triangolo V10, `COLL` pesa già 3×, e `chiusura_triangolare` ha già portato il peso intra-bolla al **52,8%** (con il 10,8% degli archi) e il peso intra-saga al **17,4%** (con lo 0,2% degli archi). Moltiplicarli ancora sarebbe doppio conteggio. La **bolla** va usata invece come **testa/loss ausiliaria** dello studente.

 |
| **Simmetria della matrice $N \times 25$** | **Diretta per la loss contrastiva** (ogni riga $i$ ha i *suoi* $\le 25$ positivi con pesi $\sum_j p_{ij} = 1$); **simmetrizzata $\frac{1}{2}(P + P^T)$ solo per estrarre l'ancora spettrale SVD** | Se simmetrizzi la lista dei positivi *dopo* il top-25, i mega-hub (*Il cavaliere oscuro*, *Shrek*, *Matrix*) entrano come archi inversi nei positivi di centinaia di titoli di nicchia, insegnando allo studente a spingere tutto verso gli hub.

 |

---

#### 2.2 Baseline vs Architettura dello Studente (Handoff Q1, Q3, Q4)

1. **Il Baseline obbligatorio (Giorno 1)**:
   Prima di toccare PyTorch, il baseline da battere non è il vecchio `spazi-trakt.py` (che aveva `Pb[is_tv]=0` e non usava né V10 né `qwen3`), ma **SVD + Ridge sul nuovo Teacher**:

* Costruisci la matrice sparsa riga-stocastica $P$ ($66.259 \times 66.259$) dai top-25 con la formula $\tilde{w}_{ij}$ qui sopra;
* Calcola `svds((P + P.T) / 2, k=256)` $\to$ ottieni l'embedding spettrale del teacher $U_{\text{svd}} \in \mathbb{R}^{N \times 256}$ L2-normalizzato;
* Concatena orizzontalmente `05-tfidf.npz` (pesato V3), i cluster `L1/L2/L3` di `hierarchical_graph.json` e l'embedding `04-trama-qwen3b.npy` (1024-d L2-normalizzato, zero-padded dove manca la trama);
* Addestra `Ridge(alpha=30.0, solver="lsqr")` per predire $U_{\text{svd}}$ e applica `canon.centra(Z, is_tv)`.
* *Perché non basta fermarsi al Ridge?* Per due motivi matematici:

1. **Il buco del 46% senza trama**: un modello lineare somma $W_{\text{meta}} x_{\text{meta}} + W_{\text{plot}} x_{\text{plot}}$. Quando $x_{\text{plot}} = \mathbf{0}$ (sul 46% dei titoli), la norma e la direzione del vettore predetto subiscono uno *shift* sistematico perché $W_{\text{meta}}$ è stato calibrato assumendo la presenza di $x_{\text{plot}}$.
2. **Allineamento diretto sui vicini e sulle bolle**: la regressione L2 sulle coordinate SVD minimizza l'errore quadratico medio sugli autovettori principali, ma non massimizza il margine coseno sui 25 vicini reali né sui 2.922 centroidi di bolla.
3. **Lo Studente consigliato: Gated Two-Branch Residual MLP (256-d, `float16`)**:

* **Dimensione**: **$d = 256$**, salvato in `float16` ($66.259 \times 256 \times 2\text{ byte} = \mathbf{32,35\text{ MB}}$, oppure $64,71\text{ MB}$ in `float32`). Sta comodamente sotto il budget RAM del container (contro i $129,4\text{ MB}$ di un 512-d `float32`) ed evita di sovra-parametrizzare i 16.550 nodi serie.
* **Fusione delle feature (Gated Modality Fusion)**:
* **Ramo Trama (`PlotBranch`)**: prende il vettore `qwen3` 1024-d L2-normalizzato $\to$ `Linear(1024, 256) -> LayerNorm -> GELU -> Dropout(0.25)` $\to h_{\text{plot}} \in \mathbb{R}^{256}$.
* **Ramo Metadati + Keyword Graph (`MetaBranch`)**: prende la matrice sparsa combinata di:
* token V3 di `05-tfidf.npz` (`kw:`, `ge:`, `rt:`, `co:`, `pa:`, `lg:`, `ca:`, `di:`);
* cluster gerarchici **L1 (1.382) + L2 (469) + L3 (131)** da `hierarchical_graph.json` pesati IDF (non serve ricalcolare `bge-small` né addestrare un GNN separato sul grafo keyword: Leiden L1–L3 in `build_graph.py` ha già fuso `0.4 * PPMI + 0.6 * Cosine(bge-small)` con taglio NSFW!);
* feature strutturali serie/film sicure: `is_tv`, `decade` one-hot, `log1p(number_of_seasons)`, `log1p(number_of_episodes)`, `status`, `runtime / 120`.
  Passa da `Linear(V_meta, 256) -> LayerNorm -> GELU -> Dropout(0.20)` $\to h_{\text{meta}} \in \mathbb{R}^{256}$.
* **Gate di modalità**:

$$
g_i = \sigma\!\left(W_g [h_{\text{meta}, i} \,\|\, h_{\text{plot}, i} \,\|\, \text{has\_plot}_i \,\|\, \text{is\_tv}_i]\right) \in (0, 1)^{256}
$$

When $\text{has\_plot}_i = 0$ (o quando la trama viene mascherata durante il training), forziamo $g_i = \mathbf{0}$ così $h_i = h_{\text{meta}, i}$ puro, senza rumore di bias; quando la trama c'è, il gate impara dimensione per dimensione quanto fidarsi della trama rispetto ai metadati, più un layer residuale finale e normalizzazione L2: $z_i = \text{L2Norm}(\text{MLP}(h_i))$.

---

#### 2.3 La Loss e la difesa dal Leakage delle feature condivise (Fotografia Q4 · Handoff Q4, Q7)

Il rischio più insidioso che hai individuato in §2.2 e §4.7 dell'handoff è reale: **teacher e studente condividono `KW`, `CAST`, `DIR`, `COLL` e `TRAMA**`. Se non interveniamo, lo studente impara la funzione identità sulle keyword e sul regista, ottenendo un'ottima loss sul grafo ma fallendo sui titoli freddi dove contano le associazioni comportamentali (`CF`, `B`, `TV`, `LIST`).

Ecco le **tre difese congiunte**:

1. **Igiene rigorosa delle colonne di input (Zero Outcome Leak)**:
   In `spazi-trakt.py`, la matrice `FX` conteneva `log1p(vote_count)`, `bayes`, `log1p(popularity)`, `log1p(budget)` e `log1p(revenue)`. **Vanno rimossi tutti dallo studente**, insieme a `recommendations`. Lo studente deve rappresentare *che cos'è* un titolo, non *quanto ha incassato*.
2. **Asymmetric Feature & Modality Dropout durante il training**:
   Ad ogni batch, per ciascun titolo $i$ applichiamo:

* **Plot Dropout ($p = 0.35$)**: anche se il titolo ha la trama `qwen3`, nel 35% delle epoche la azzeriamo (`has_plot = 0`). Così il ramo `MetaBranch` è costretto a predire gli stessi vicini che `TRAMA` ha generato nel teacher!
* **Token Dropout ($p = 0.25$)**: spegniamo casualmente il 25% dei token `kw:`, `ca:`, `di:`, `co:` in ingresso al `MetaBranch`. Così il ramo `PlotBranch` e i cluster macro `L1–L3` devono sopperire all'assenza del regista o dell'attore condiviso.

3. **Loss composita a 3 teste (Locale + Globale + Bolla)**:

$$
\mathcal{L} = \mathcal{L}_{\text{listwise}}(Z) + 0.5 \cdot \mathcal{L}_{\text{svd}}(Z, U_{\text{svd}}) + 0.3 \cdot \mathcal{L}_{\text{bolla}}(Z, b)
$$

* **$\mathcal{L}_{\text{listwise}}$ (Soft-Target InfoNCE sulla riga $N \times 25$)**:
  Per ogni ancora $i$ nel batch e per i suoi vicini positivi $j \in \mathcal{N}_{25}(i)$ con pesi normalizzati $p_{ij}$ ($\sum_j p_{ij} = 1$), usiamo il resto del mini-batch $B$ come negativi in-batch (mascherando eventuali positivi o compagni della stessa bolla $b_n = b_i$ per evitare *false negatives*!):

$$
\mathcal{L}_{\text{listwise}}(i) = - \sum_{j \in \mathcal{N}_{25}(i)} p_{ij} \log \frac{\exp(\langle z_i, z_j \rangle / \tau)}{\exp(\langle z_i, z_j \rangle / \tau) + \sum_{n \in B, \, b_n \ne b_i} \exp(\langle z_i, z_n \rangle / \tau)}, \quad \tau = 0.07
$$

* **$\mathcal{L}_{\text{svd}} = 1 - \langle z_i, u_{i}^{\text{svd}} \rangle$**: allinea lo studente allo spettro globale a 256 dimensioni del grafo simmetrizzato, garantendo convergenza rapida e geometria globale coerente.
* **$\mathcal{L}_{\text{bolla}}$ (Cosine Cross-Entropy sulle 2.922 bolle con $\ge 5$ membri)**: una matrice di prototipi di bolla $C_b \in \mathbb{R}^{2922 \times 256}$ L2-normalizzata calcola $\text{CrossEntropy}(z_i \cdot C_b^T / \tau_b, \, b_i)$ con $\tau_b = 0.10$ e label smoothing $0.05$. Per un titolo in **cold start assoluto** (zero archi in $N \times 25$), la sua bolla o i suoi vicini V3 forniscono comunque supervisione, e a fine training i prototipi (o i centroidi mediati $\mu_b = \text{L2Norm}(\sum_{i \in b} z_i)$) diventano i nuovi centroidi drop-in per `collocator.py` e `uscite.py`!

---

#### 2.4 Le Serie TV e il trasferimento Film $\to$ Serie (Handoff Q6)

* **Unico spazio condiviso 256-d, non due modelli separati**: separare i modelli impedirebbe alle 16.550 serie di sfruttare la densità comportamentale dei 49.709 film (MovieLens + Trakt) e romperebbe i ponti cross-medium (`MAPPA_CROSS = 2` in `06_mappa.py` e `banco_curato`).
* **Come evitare che le serie vengano "filmizzate"**:

1. Unificazione dei generi tramite la mappa `TV2MOVIE` (già in `spazi-trakt.py`) **più** il mantenimento dei token specifici TV (`rt:networks`, `log1p(NEP)`, `log1p(seasons)`, `status`, `created_by` mappato su `di:`).
2. **Up-sampling / bilanciamento del peso delle serie nella loss**: poiché le serie sono il 25% del canone ma il 53% delle storie utente, moltiplichiamo per $w_{\text{tv}} = 1.5$ la loss sui nodi `is_tv == True`.
3. **Centratura post-training per medium (`canon.centra`)**: prima di salvare l'artefatto finale, sottraiamo la media dei film ai film e la media delle serie alle serie, rinormalizzando L2. Questo allinea i due emisferi sulla stessa ipersfera unitaria.

---

#### 2.5 Valutazione, Protocollo Cold-Start e Ablation (Fotografia Q5 · Handoff Q5, Q8)

Non usare la *Fidelity@k* verso il teacher come metrica decisionale: uno studente che memorizza i difetti di `CAST` o `KW` avrebbe fidelity altissima e pessima generalizzazione.

**Il protocollo di split rigoroso (Hold-out Induttivo)**:
Prima di calcolare `svds` e prima di addestrare lo studente, estrai **1.200 titoli di test** (`seed=13`, **600 film + 600 serie** con grado comportamentale $>0$ in `CF + B + TV`, stratificati 50% con trama e 50% senza trama).

* **Cancellazione totale degli archi di test dal Teacher**: nella matrice $N \times 25$ (e nell'SVD), azzera sia le righe sia le colonne dei 1.200 titoli (`P[test, :] = 0; P[:, test] = 0`). Per il teacher quei 1.200 titoli **non esistono**: sono vere uscite del 2026.

**Le 3 metriche che decidono (e i numeri da battere)**:

1. **Collocazione Cold-Start in Bolla (`measure/legacy/banco.py` + `collocator.py`)** sui 1.200 titoli tenuti fuori, applicando la regola del piano dei voti `[V/10, V*10]` e la regola del medium su $\mu_b = \text{L2Norm}(\sum_{i \in b \setminus \text{test}} z_i)$:

* **Numero da battere sulle Serie**: **63,0%** nella propria bolla (V1) e **87,3%** nel quartiere (propria + adiacente sulla mappa 6+2).
* **Numero da battere sui Film**: **27,7%** nella propria bolla al banco (e controllo di leggibilità a occhio sulle 20 sentinelle di `sonda.py` + *Verity*).

2. **Recall@20 Comportamentale Puro (Senza Feature Condivise)**: per i 1.200 titoli di test, prendi i loro archi veri nei soli componenti comportamentali (`CF + B + TV + LIST`, escludendo `KW, CAST, DIR, TRAMA`) e misura quanti cadono nei top-20 vicini coseno di $z_i$. Va riportata separatamente su:

* *Con trama*;
* *Senza trama per natura* (il 46% del canone);
* *Trama cancellata artificialmente a test-time* (per verificare la tenuta del Modality Dropout).

3. **Arbitro esterno `Sim_trama` (`measure/legacy/sim_trama.py`)** calcolato quando lo studente gira **con la trama spenta** (`has_plot=0`): misura se i 10 vicini scelti dai soli metadati nello spazio 256-d hanno trame `qwen3` più simili rispetto a V1 (`0.7437`) e V3 (`0.7480`). Infine, verifica di non-regressione su **`measure/intero.py`** (precisione $\ge 5,0-6,4\%$, lift $\ge 63\times$).

**Le 4 Ablation essenziali (in ordine di esecuzione)**:

1. **A0 (Baseline Lineare)**: SVD-256 su $N \times 25$ + Ridge($\alpha=30$) su `05-tfidf` + `L1-L3` + `qwen3`.
2. **A1 (MLP Gated vs Ridge)**: stesso input e stesso teacher, ma con Gated MLP + Modality Dropout + loss ibrida (InfoNCE + SVD + Bolla).
3. **A2 (Taglio e Pesi Teacher)**: Top-20 vs **Top-25** vs Top-30, e peso grezzo vs `log1p` $\times$ supporto voti.
4. **A3 (Keyword Graph)**: solo `05-tfidf` grezzo vs aggiunta dei cluster gerarchici `L1+L2+L3` di `hierarchical_graph.json`.

---

### 3. Piano operativo di 10 giorni

* **Giorni 1–2 (Dati, Split Induttivo e Baseline A0)**: script di estrazione della matrice $N \times 25$ dal triangolo V10 con pavimento $2\%$ max / $0.15$ e shrinkage di supporto $\sqrt{v_{\min}/(v_{\min}+50)}$; creazione della maschera fissa dei 1.200 titoli di test (600 film, 600 serie); esecuzione di `svds(k=256)` + `Ridge(alpha=30)` (tempo totale su CPU: ~45 secondi) e misura sulle 3 metriche. **Hai il primo segnale entro 48 ore.**
* **Giorni 3–5 (Training Gated MLP e Ablation A1–A3)**: training dello script PyTorch qui sotto (su CPU impiega ~90–120 secondi per 25 epoche; su Colab T4 ~12 secondi); confronto diretto contro A0 e contro `collocator.py` (V1/V3) su film, serie e sottoinsieme senza trama.
* **Giorni 6–8 (Ispezione delle Sentinelle e Reranking della Coda)**: lettura a occhio dei top-20 vicini coseno sui 6 titoli sonda (*Spider-Man*, *Inkheart*, *Terabithia*, *Inception*, *Perfetti sconosciuti*, *Breaking Bad*) e sulle 20 sentinelle di `sonda.py` per verificare che la bolla 674 sia sparita da *Inkheart* e che *Ozark* / *I Soprano* risalgano nei primi 15 di *Breaking Bad*.
* **Giorni 9–10 (Integrazione drop-in offline e Contratto Impronte)**: salvataggio di `spazio-denso-v10.npz` (`float16`, 32,4 MB) + centroidi densi per `collocator.py` e `uscite.py`, protetti da `canon.segna_partizione` e `assert_allineamento_spazi`.

---

### 4. Bozza dello script di addestramento (`steps/07_distilla_grafo.py`)

Lo script è autoconsistente, rispetta la struttura di `services/graph/`, carica sia dal triangolo `.npz` sia da una eventuale matrice $N \times K$ pre-esportata (`.parquet`/`.csv`), costruisce il target depurato, esegue sia il **Baseline Ridge** sia il **Gated MLP** su CPU (8 GB RAM) o GPU, valuta il cold-start rigoroso (con e senza trama) e salva l'artefatto con le impronte del contratto.

```python
"""07_distilla_grafo.py — Distillazione del grafo V10 in uno spazio denso 256-d.

Costruisce la matrice sparsa Top-K dal triangolo V10 (con pavimento relativo/assoluto e
shrinkage di supporto sui voti TMDB), isola 1.200 titoli di test in cold-start induttivo
(zero archi nel teacher), valuta il baseline SVD+Ridge e addestra lo studente Gated MLP
con Modality/Feature Dropout e loss ibrida (Listwise InfoNCE + Ancora SVD + Bolla).

Uso (da services/graph/ o radice repo, gira su CPU 8 GB in ~2 min o GPU in ~15 s):
    python services/graph/steps/07_distilla_grafo.py
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp
from scipy.sparse.linalg import svds
from sklearn.linear_model import Ridge

import torch
import torch.nn as nn
import torch.nn.functional as F

# ==============================================================================
# IPERPARAMETRI SCELTI E MOTIVATI (ogni scelta ha un numero o un'ipotesi dietro)
# ==============================================================================
# 1. Matrice Teacher (N x TOPK_TEACHER)
TOPK_TEACHER = 25          # Rango 21-25 ancora al 77% giusto; oltre il 30 scende al 40-54% (topk.txt).
FLOOR_REL_MAX = 0.02       # Taglia archi < 2% del max di riga (elimina il ponte Inkheart->bolla 674 all'1.0-1.5%).
FLOOR_ABS = 0.15           # Taglia la polvere assoluta nelle righe piatte a basso grado.
SUPPORTO_M0 = 50.0         # Shrinkage sqrt(v_min / (v_min + 50)): penalizza i falsi positivi da 12-15 voti.

# 2. Spazio e Architettura Studente
DIM_EMB = 256              # 66.259 x 256 in float16 = 32.35 MB (1/4 del budget RAM, zero overfitting sulle serie).
HIDDEN_DIM = 256           # Stessa larghezza dei rami Plot (1024->256) e Meta (V->256) per il gate elemento-per-elemento.
DROPOUT_LAYER = 0.20       # Regolarizzazione standard sui layer densi per 66k esempi.
MODALITY_DROPOUT_P = 0.35  # Azzera la trama nel 35% dei casi: obbliga i metadati a supplire sul 46% senza trama.
FEATURE_DROPOUT_P = 0.25   # Azzera il 25% dei token sparsi: impedisce allo studente di copiare KW/CAST/DIR del teacher.

# 3. Ottimizzazione e Loss
LR = 1.5e-3                # Learning rate per AdamW con CosineAnnealingLR su MLP con LayerNorm.
WEIGHT_DECAY = 1e-4        # Previene l'esplosione dei pesi sui token rari (df >= 3) del ramo sparso.
BATCH_SIZE = 512           # 512 titoli/batch = 511 negativi in-batch per InfoNCE; < 1.2 GB RAM su CPU.
EPOCHS = 25                # ~3.200 step totali: bastano per convergere grazie all'ancora spettrale SVD.
TEMP_INFONCE = 0.07        # Temperatura per coseni L2: separa i 25 vicini (cos ~0.6-0.8) dai negativi in-batch.
TEMP_BOLLA = 0.10          # Temperatura sui centroidi di bolla (2.922 classi con >= 5 membri).
LAMBDA_SVD = 0.50          # Peso dell'ancora globale (1 - cos(z_i, u_svd)): stabilizza la geometria macro.
LAMBDA_BOLLA = 0.30        # Peso della Cross-Entropy sulla bolla: allinea lo spazio al collocatore (+0.942 PMI).
TV_LOSS_WEIGHT = 1.50      # Le serie sono il 25% del canone ma il 53% delle storie: evita che vengano "filmizzate".

# 4. Split Cold-Start e Riproducibilità
N_TEST_FILM = 600          # Stessa taglia del banco storico (measure/legacy/banco.py).
N_TEST_SERIE = 600         # 600 serie tenute fuori dal teacher per confrontarsi col 63.0% di collocator.py.
RIDGE_ALPHA = 30.0         # Baseline lineare (stesso alpha=30 di upstream/spazi-trakt.py).
SEED = 20261021

# Percorsi del modulo
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services"))
from graph import canon as K
from graph import bubbles as B
from graph import parametri as P

DATA = K.DATA


# ==============================================================================
# 1. COSTRUZIONE DEL TEACHER (O CARICAMENTO DA CSV/PARQUET N x K)
# ==============================================================================
def costruisci_matrice_teacher(
    VOT: np.ndarray,
    holdout_mask: np.ndarray,
    csv_override: pathlib.Path | None = None,
) -> tuple[sp.csr_matrix, np.ndarray, np.ndarray, np.ndarray]:
    """Restituisce:
      - P_sym: matrice sparsa (N, N) simmetrizzata per l'SVD del teacher (con holdout azzerato)
      - nbr_idx: int32 (N, TOPK_TEACHER) indici dei top-K vicini per riga (-1 = padding)
      - nbr_w:   float32 (N, TOPK_TEACHER) pesi riga-normalizzati (sommano a 1 sui validi)
      - has_teacher: bool (N,) True se il nodo ha almeno un arco valido (e non è in holdout)
    """
    N = len(VOT)
    if csv_override is not None and csv_override.exists():
        # Supporta il caricamento diretto di una tabella N x K pre-calcolata (CSV o Parquet)
        df = (pd.read_parquet(csv_override) if csv_override.suffix == ".parquet"
              else pd.read_csv(csv_override))
        r = df["src_row"].to_numpy(np.int32)
        c = df["dst_row"].to_numpy(np.int32)
        w = df["w_raw"].to_numpy(np.float32)
        W = sp.csr_matrix((w, (r, c)), shape=(N, N), dtype=np.float32)
    else:
        tri_name = "bolle-eterogeneo-V10-p1.0-triangolo.npz"
        q = np.load(K.A(tri_name))
        W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N), dtype=np.float32)
        W = (W + W.T).tocsr()
        W.setdiag(0)
        W.eliminate_zeros()

    # INDUTTIVITÀ STRETTA: i titoli di holdout perdono tutti gli archi in entrata e in uscita
    keep_node = (~holdout_mask).astype(np.float32)
    W = sp.diags(keep_node) @ W @ sp.diags(keep_node)
    W = W.tocsr()
    W.eliminate_zeros()

    nbr_idx = np.full((N, TOPK_TEACHER), -1, dtype=np.int32)
    nbr_w = np.zeros((N, TOPK_TEACHER), dtype=np.float32)
    rows_p, cols_p, vals_p = [], [], []

    vot_clamped = np.maximum(VOT, 0.0)
    for i in range(N):
        if holdout_mask[i]:
            continue
        lo, hi = W.indptr[i], W.indptr[i + 1]
        if hi <= lo:
            continue
        idx = W.indices[lo:hi]
        val = W.data[lo:hi]
        w_max = float(val.max())
        if w_max <= 0:
            continue

        # Doppio pavimento: >= 2% del max di riga E >= 0.15 assoluto
        soglia = max(FLOOR_ABS, FLOOR_REL_MAX * w_max)
        ok = val >= soglia
        if not ok.any():
            # Fallback: per i nodi deboli tieni almeno i primi 3 se superano 0.05
            ok = val >= min(0.05, 0.5 * w_max)
        idx, val = idx[ok], val[ok]
        if len(idx) == 0:
            continue

        # Shrinkage di supporto sul minimo dei voti della coppia (abbatte le allucinazioni a 10 voti)
        v_min = np.minimum(vot_clamped[i], vot_clamped[idx])
        conf = np.sqrt(v_min / (v_min + SUPPORTO_M0))
        w_trasf = np.log1p(val) * conf

        if len(w_trasf) > TOPK_TEACHER:
            top_sel = np.argpartition(-w_trasf, TOPK_TEACHER)[:TOPK_TEACHER]
            idx, w_trasf = idx[top_sel], w_trasf[top_sel]

        ordine = np.argsort(-w_trasf)
        idx, w_trasf = idx[ordine], w_trasf[ordine]
        somma = float(w_trasf.sum())
        if somma <= 1e-9:
            continue
        p = (w_trasf / somma).astype(np.float32)

        k_eff = len(idx)
        nbr_idx[i, :k_eff] = idx
        nbr_w[i, :k_eff] = p
        rows_p.extend([i] * k_eff)
        cols_p.extend(idx.tolist())
        vals_p.extend(p.tolist())

    P_dir = sp.csr_matrix((vals_p, (rows_p, cols_p)), shape=(N, N), dtype=np.float32)
    P_sym = ((P_dir + P_dir.T) * 0.5).tocsr()
    has_teacher = (nbr_idx[:, 0] >= 0) & (~holdout_mask)
    return P_sym, nbr_idx, nbr_w, has_teacher


# ==============================================================================
# 2. COSTRUZIONE FEATURE DELLO STUDENTE (ZERO LEAK DI POPOLARITÀ/ESITO)
# ==============================================================================
def carica_feature_studente(N: int, is_tv: np.ndarray) -> tuple[sp.csr_matrix, np.ndarray, np.ndarray]:
    """Carica e unisce:
      1. X_meta: matrice sparsa (N, V_meta) = 05-tfidf (V3) + cluster L1/L2/L3 + feature sicure
      2. X_plot: array denso (N, 1024) = embedding qwen3 L2-normalizzati (0 dove assente)
      3. has_plot: bool (N,) True per i 35.829 titoli con trama
    Nota: NESSUNA colonna di vote_count, vote_average, popularity, budget, revenue o recommendations.
    """
    # 2.1 TF-IDF V3 (già con pesi per tipo ge:, rt:, kw:, di:, ca:, co:, pa:, lg:)
    X_tfidf = sp.load_npz(K.A("05-tfidf.npz")).tocsr().astype(np.float32)

    # 2.2 Cluster L1, L2, L3 dal grafo gerarchico delle keyword (se presente)
    hg_path = ROOT / "src" / "data" / "hierarchical_graph.json"
    blocchi_sparsi = [X_tfidf]
    if hg_path.exists():
        vocab_v3 = json.load(open(K.A("05-vocab.json"), encoding="utf-8"))
        G = json.loads(hg_path.read_text(encoding="utf-8"))
        l1_map = {k: i for i, k in enumerate(G.get("L1", {}))}
        l2_map = {k: i for i, k in enumerate(G.get("L2", {}))}
        l3_map = {k: i for i, k in enumerate(G.get("L3", {}))}
        n_l1, n_l2, n_l3 = len(l1_map), len(l2_map), len(l3_map)

        # Mappa colonna keyword di 05-vocab -> (col_L1, col_L2, col_L3)
        kw_cols, hier_cols = [], []
        for tok, col_idx in vocab_v3.items():
            if not tok.startswith("kw:"):
                continue
            kw_name = tok[3:]
            c_l1 = G.get("kw_to_L1", {}).get(kw_name)
            if not c_l1 or c_l1 not in l1_map:
                continue
            kw_cols.append(col_idx)
            hier_cols.append(l1_map[c_l1])
            c_l2 = (G["L1"].get(c_l1) or {}).get("parent")
            if c_l2 and c_l2 in l2_map:
                kw_cols.append(col_idx)
                hier_cols.append(n_l1 + l2_map[c_l2])
                c_l3 = (G["L2"].get(c_l2) or {}).get("parent")
                if c_l3 and c_l3 in l3_map:
                    kw_cols.append(col_idx)
                    hier_cols.append(n_l1 + n_l2 + l3_map[c_l3])

        if kw_cols:
            P_kw2h = sp.csr_matrix(
                (np.ones(len(kw_cols), np.float32), (kw_cols, hier_cols)),
                shape=(X_tfidf.shape[1], n_l1 + n_l2 + n_l3),
                dtype=np.float32,
            )
            X_hier = (X_tfidf > 0).astype(np.float32) @ P_kw2h
            X_hier.data = np.log1p(X_hier.data)
            nor_h = np.sqrt(np.asarray(X_hier.multiply(X_hier).sum(1)).ravel()) + 1e-9
            X_hier = sp.diags(1.0 / nor_h) @ X_hier
            blocchi_sparsi.append(X_hier.tocsr().astype(np.float32))

    # 2.3 Feature strutturali sicure (anno/decennio, episodi NEP, medium is_tv — NO VOTI/POPOLARITÀ)
    meta = K.metadati()
    anno = meta["ANNO"].astype(np.float32)
    nep = meta["NEP"].astype(np.float32)
    anno_norm = np.where(anno > 1900, np.clip((anno - 1990.0) / 35.0, -2.5, 1.5), 0.0)
    nep_norm = np.log1p(np.maximum(nep - 1.0, 0.0)) / 6.0
    struct_dense = np.column_stack([
        is_tv.astype(np.float32),
        (~is_tv).astype(np.float32),
        anno_norm.astype(np.float32),
        nep_norm.astype(np.float32),
    ]) * 0.25  # Scala ridotta per non sovrastare la norma L2 del TF-IDF
    blocchi_sparsi.append(sp.csr_matrix(struct_dense, dtype=np.float32))

    X_meta = sp.hstack(blocchi_sparsi, format="csr", dtype=np.float32)

    # 2.4 Embedding Trama qwen3 (35.829 x 1024) allineato alle N righe del canone
    E_raw = np.load(K.A("04-trama-qwen3b.npy")).astype(np.float32)
    IDX_plot = np.load(K.A("04-trama-qwen3b-idx.npy")).astype(np.int32)
    E_norm = E_raw / (np.linalg.norm(E_raw, axis=1, keepdims=True) + 1e-9)

    X_plot = np.zeros((N, E_norm.shape[1]), dtype=np.float32)
    X_plot[IDX_plot] = E_norm
    has_plot = np.zeros(N, dtype=bool)
    has_plot[IDX_plot] = True

    return X_meta, X_plot, has_plot


# ==============================================================================
# 3. MODELLO STUDENTE: GATED TWO-BRANCH RESIDUAL MLP
# ==============================================================================
class GatedGraphStudent(nn.Module):
    """Fonde metadati sparsi (V_meta) e trama densa (1024-d) con un gate appreso e Modality Dropout."""

    def __init__(self, v_meta: int, d_plot: int = 1024, d_emb: int = DIM_EMB, n_bolle: int = 2922):
        super().__init__()
        self.meta_proj = nn.Linear(v_meta, HIDDEN_DIM, bias=True)
        self.meta_ln = nn.LayerNorm(HIDDEN_DIM)

        self.plot_proj = nn.Linear(d_plot, HIDDEN_DIM, bias=True)
        self.plot_ln = nn.LayerNorm(HIDDEN_DIM)

        self.med_emb = nn.Embedding(2, HIDDEN_DIM)
        self.gate_net = nn.Sequential(
            nn.Linear(HIDDEN_DIM * 2 + 2, HIDDEN_DIM),
            nn.Sigmoid(),
        )
        self.drop = nn.Dropout(DROPOUT_LAYER)

        # Blocco residuale non lineare prima della normalizzazione sulla sfera
        self.res_block = nn.Sequential(
            nn.Linear(HIDDEN_DIM, HIDDEN_DIM),
            nn.LayerNorm(HIDDEN_DIM),
            nn.GELU(),
            nn.Dropout(DROPOUT_LAYER),
            nn.Linear(HIDDEN_DIM, d_emb),
        )
        self.out_proj = nn.Linear(HIDDEN_DIM, d_emb, bias=False) if HIDDEN_DIM != d_emb else nn.Identity()

        # Testa ausiliaria sui centroidi di bolla (Cosine Classifier)
        self.bolla_prototypes = nn.Parameter(torch.randn(n_bolle, d_emb) * 0.05)

    def forward(
        self,
        x_meta: torch.Tensor,
        x_plot: torch.Tensor,
        has_plot: torch.Tensor,
        is_tv: torch.Tensor,
    ) -> torch.Tensor:
        h_meta = self.drop(F.gelu(self.meta_ln(self.meta_proj(x_meta))))
        h_plot = self.drop(F.gelu(self.plot_ln(self.plot_proj(x_plot))))

        # Se la trama è assente (o spenta dal Modality Dropout), il ramo plot è forzato a zero
        mask_p = has_plot.float().unsqueeze(1)
        h_plot = h_plot * mask_p

        gate_in = torch.cat([h_meta, h_plot, mask_p, is_tv.float().unsqueeze(1)], dim=1)
        g = self.gate_net(gate_in) * mask_p  # g = 0 esattamente quando non c'è trama

        h = (1.0 - 0.5 * g) * h_meta + g * h_plot + self.med_emb(is_tv.long())
        z = self.out_proj(h) + self.res_block(h)
        return F.normalize(z, p=2, dim=1)

    def bolla_logits(self, z: torch.Tensor) -> torch.Tensor:
        proto = F.normalize(self.bolla_prototypes, p=2, dim=1)
        return (z @ proto.T) / TEMP_BOLLA


# ==============================================================================
# 4. ARBITRO DI VALUTAZIONE COLD-START (BOLLA + RECALL COMPORTAMENTALE)
# ==============================================================================
def valuta_cold_start(
    Z: np.ndarray,
    test_idx: np.ndarray,
    mem: np.ndarray,
    bolle_cand: np.ndarray,
    is_tv: np.ndarray,
    VOT: np.ndarray,
    vicini_mappa: list[set[int]],
    etichetta: str = "",
) -> dict[str, float]:
    """Misura sui 1.200 titoli tenuti fuori:
      - % collocazione nella PROPRIA bolla e nel QUARTIERE (propria + adiacente sulla mappa 6+2)
        usando la regola del piano dei voti [V/10, V*10] e la regola del medium (collocator.py).
    """
    N = len(mem)
    NB = int(mem.max()) + 1
    in_test = np.zeros(N, dtype=bool)
    in_test[test_idx] = True

    # Centroidi calcolati SOLO sui membri di training (zero data leakage LOO)
    pos_b = {int(b): k for k, b in enumerate(bolle_cand)}
    C_bolle = np.zeros((len(bolle_cand), Z.shape[1]), dtype=np.float32)
    med_voti = np.zeros(len(bolle_cand), dtype=np.float32)
    is_bolla_serie = np.zeros(len(bolle_cand), dtype=bool)

    for k, b in enumerate(bolle_cand):
        membri_tr = np.where((mem == b) & (~in_test))[0]
        if len(membri_tr) == 0:
            continue
        mu = Z[membri_tr].mean(axis=0)
        C_bolle[k] = mu / (np.linalg.norm(mu) + 1e-9)
        med_voti[k] = K.mediana_voti(VOT[membri_tr])
        is_bolla_serie[k] = float(is_tv[membri_tr].mean()) > 0.5

    risultati = {}
    for nome_pop, mask_pop in (("FILM", ~is_tv[test_idx]), ("SERIE", is_tv[test_idx])):
        sub = test_idx[mask_pop]
        propria = quartiere = valutabili = 0
        for i in sub:
            b_vera = int(mem[i])
            if b_vera not in pos_b:
                continue
            valutabili += 1
            cos = Z[i] @ C_bolle.T

            # Regola del piano dei voti [V/10, V*10] (come in collocator.py)
            vc = float(VOT[i])
            cos_f = cos.copy()
            if vc > 0:
                ok_v = (med_voti >= vc / P.COLLOCA_FATTORE_VOTI) & (med_voti <= vc * P.COLLOCA_FATTORE_VOTI)
                if ok_v.any():
                    cos_f = np.where(ok_v, cos, -np.inf)

            # Regola del medium
            stesso_med = (is_bolla_serie == bool(is_tv[i])) & np.isfinite(cos_f)
            if stesso_med.any():
                cos_f = np.where(stesso_med, cos_f, -np.inf)

            b_pred = int(bolle_cand[int(np.argmax(cos_f))])
            if b_pred == b_vera:
                propria += 1
                quartiere += 1
            elif b_pred in vicini_mappa[b_vera]:
                quartiere += 1

        p_pct = 100.0 * propria / max(valutabili, 1)
        q_pct = 100.0 * quartiere / max(valutabili, 1)
        risultati[f"{nome_pop}_propria"] = p_pct
        risultati[f"{nome_pop}_quartiere"] = q_pct
        print(f"  [{etichetta:<22}] {nome_pop:<5} (n={valutabili:>3}) -> "
              f"propria bolla: {p_pct:5.1f}% · quartiere (mappa 6+2): {q_pct:5.1f}%", flush=True)
    return risultati


# ==============================================================================
# 5. MAIN: PIPELINE DI TRAINING E VALIDAZIONE
# ==============================================================================
def main() -> int:
    t0 = time.time()
    rng = np.random.default_rng(SEED)
    torch.manual_seed(SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    keys, row_of, N, is_tv = K.titoli()
    meta = K.metadati()
    VOT = meta["VOT"].astype(np.float32)
    mem = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
    NB = int(mem.max()) + 1
    sz = np.bincount(mem)
    bolle_cand = np.where(sz >= P.CENTROIDI_MIN_MEMBRI)[0]
    b2class = np.full(NB, -1, dtype=np.int64)
    for k, b in enumerate(bolle_cand):
        b2class[int(b)] = k

    # Mappa 6+2 per misurare il "quartiere" (propria bolla + adiacenti)
    M_map = np.load(K.A("mappa-finale-6-2.npz"), allow_pickle=True)
    W_map = sp.csr_matrix((M_map["grafo_data"], M_map["grafo_indices"], M_map["grafo_indptr"]), shape=(NB, NB))
    vicini_mappa = [set(W_map.getrow(b).indices.tolist()) for b in range(NB)]

    print("=" * 96)
    print(f"DISTILLAZIONE GRAFO V10 -> SPAZIO DENSO {DIM_EMB}-D (device: {device})")
    print("=" * 96, flush=True)

    # 1. Selezione dei 1.200 titoli di hold-out (in bolle >= 6 membri così la bolla non resta sotto 5)
    elig = np.isin(mem, np.where(sz >= P.CENTROIDI_MIN_MEMBRI + 1)[0]) & (VOT >= 20)
    cand_film = np.where(elig & (~is_tv))[0]
    cand_serie = np.where(elig & is_tv)[0]
    test_film = rng.choice(cand_film, size=min(N_TEST_FILM, len(cand_film)), replace=False)
    test_serie = rng.choice(cand_serie, size=min(N_TEST_SERIE, len(cand_serie)), replace=False)
    test_idx = np.concatenate([test_film, test_serie])
    holdout_mask = np.zeros(N, dtype=bool)
    holdout_mask[test_idx] = True

    # 2. Costruzione Matrice Teacher N x 25 (senza gli archi dei 1.200 titoli di test)
    P_sym, nbr_idx, nbr_w, has_teacher = costruisci_matrice_teacher(VOT, holdout_mask)
    print(f"  Teacher Top-{TOPK_TEACHER}: {P_sym.nnz:,} archi simmetrici · "
          f"nodi con teacher: {int(has_teacher.sum()):,}/{N:,} ({time.time()-t0:.1f}s)", flush=True)

    # 3. Ancora Spettrale SVD (256-d) sul Teacher
    u_svd, s_svd, _ = svds(P_sym.astype(np.float64), k=DIM_EMB, random_state=SEED)
    ordine_sv = np.argsort(-s_svd)
    u_svd = u_svd[:, ordine_sv].astype(np.float32)
    U_svd = u_svd / (np.linalg.norm(u_svd, axis=1, keepdims=True) + 1e-9)
    print(f"  SVD-{DIM_EMB} completata ({time.time()-t0:.1f}s)", flush=True)

    # 4. Caricamento Feature Studente (TF-IDF V3 + L1/L2/L3 + Trama qwen3)
    X_meta, X_plot, has_plot = carica_feature_studente(N, is_tv)
    print(f"  Feature Studente: X_meta {X_meta.shape} (nnz={X_meta.nnz:,}) · "
          f"Trame qwen3 {int(has_plot.sum()):,}/{N:,} ({time.time()-t0:.1f}s)", flush=True)

    # 5. BASELINE A0: SVD + Multi-Output Ridge (Metadati + Trama -> U_svd)
    print("\n--- BASELINE A0: SVD-256 + Ridge(alpha=30) ---", flush=True)
    X_ridge = sp.hstack([X_meta, sp.csr_matrix(X_plot * 0.5)], format="csr", dtype=np.float32)
    ridge = Ridge(alpha=RIDGE_ALPHA, solver="lsqr", max_iter=600)
    ridge.fit(X_ridge[has_teacher], U_svd[has_teacher])
    Z_ridge = K.centra(ridge.predict(X_ridge).astype(np.float32), is_tv)
    valuta_cold_start(Z_ridge, test_idx, mem, bolle_cand, is_tv, VOT, vicini_mappa, "A0 Ridge (con trama)")

    # Test del baseline Ridge quando la trama viene a mancare a test-time
    X_ridge_noplot = sp.hstack([X_meta, sp.csr_matrix(np.zeros_like(X_plot))], format="csr", dtype=np.float32)
    Z_ridge_np = Z_ridge.copy()
    Z_ridge_np[test_idx] = ridge.predict(X_ridge_noplot[test_idx]).astype(np.float32)
    Z_ridge_np = K.centra(Z_ridge_np, is_tv)
    valuta_cold_start(Z_ridge_np, test_idx, mem, bolle_cand, is_tv, VOT, vicini_mappa, "A0 Ridge (NO trama)")

    # 6. TRAINING STUDENTE A1: Gated Two-Branch MLP
    print(f"\n--- TRAINING A1: Gated MLP ({EPOCHS} epoche, batch {BATCH_SIZE}) ---", flush=True)
    model = GatedGraphStudent(v_meta=X_meta.shape[1], d_plot=X_plot.shape[1],
                              d_emb=DIM_EMB, n_bolle=len(bolle_cand)).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=EPOCHS, eta_min=1e-4)

    train_nodes = np.where(has_teacher)[0]
    y_bolla_all = b2class[mem]
    X_plot_t = torch.from_numpy(X_plot).to(device)
    has_plot_t = torch.from_numpy(has_plot).to(device)
    is_tv_t = torch.from_numpy(is_tv).to(device)
    U_svd_t = torch.from_numpy(U_svd).to(device)

    def batch_meta_tensor(rows: np.ndarray, drop_tokens: bool = False) -> torch.Tensor:
        sub = X_meta[rows].tocoo()
        if drop_tokens and len(sub.data) > 0:
            keep = rng.random(len(sub.data)) >= FEATURE_DROPOUT_P
            vals = sub.data * keep.astype(np.float32) / (1.0 - FEATURE_DROPOUT_P)
        else:
            vals = sub.data
        mat = sp.csr_matrix((vals, (sub.row, sub.col)), shape=sub.shape, dtype=np.float32).toarray()
        return torch.from_numpy(mat).to(device)

    for ep in range(1, EPOCHS + 1):
        model.train()
        perm = rng.permutation(train_nodes)
        loss_ep = 0.0
        n_batches = 0

        for start in range(0, len(perm), BATCH_SIZE):
            b_nodes = perm[start:start + BATCH_SIZE]
            if len(b_nodes) < 32:
                continue

            # Campionamento di 1 vicino positivo per ancora (proporzionale a p_ij) per l'InfoNCE in-batch
            pos_nodes = np.empty(len(b_nodes), dtype=np.int32)
            for k, u in enumerate(b_nodes):
                valid_m = nbr_idx[u] >= 0
                cand_u = nbr_idx[u, valid_m]
                prob_u = nbr_w[u, valid_m]
                prob_u = prob_u / prob_u.sum()
                pos_nodes[k] = int(rng.choice(cand_u, p=prob_u))

            # Unione di ancore e positivi per un singolo forward pass
            all_nodes, inv = np.unique(np.concatenate([b_nodes, pos_nodes]), return_inverse=True)
            idx_anc = inv[:len(b_nodes)]
            idx_pos = inv[len(b_nodes):]

            xm = batch_meta_tensor(all_nodes, drop_tokens=True)
            xp = X_plot_t[all_nodes]
            hp = has_plot_t[all_nodes].clone()
            # Modality Dropout: spegne la trama sul 35% dei nodi durante il training
            drop_p = torch.rand(len(all_nodes), device=device) < MODALITY_DROPOUT_P
            hp = hp & (~drop_p)

            z_all = model(xm, xp, hp, is_tv_t[all_nodes])
            z_anc = z_all[idx_anc]
            z_pos = z_all[idx_pos]

            # Peso per medium (1.5x sulle serie TV)
            w_med = torch.where(is_tv_t[b_nodes], TV_LOSS_WEIGHT, 1.0)

            # 1) Loss InfoNCE in-batch con maschera sui compagni della stessa bolla (niente falsi negativi)
            sim_mat = (z_anc @ z_pos.T) / TEMP_INFONCE
            bolle_anc = mem[b_nodes]
            bolle_pos = mem[pos_nodes]
            same_b_mask = torch.from_numpy(bolle_anc[:, None] == bolle_pos[None, :]).to(device)
            same_b_mask.fill_diagonal_(False)
            sim_mat = sim_mat.masked_fill(same_b_mask, -1e4)
            labels_nce = torch.arange(len(b_nodes), device=device)
            loss_nce = (F.cross_entropy(sim_mat, labels_nce, reduction="none") * w_med).mean()

            # 2) Loss Ancora Spettrale SVD
            cos_svd = (z_anc * U_svd_t[b_nodes]).sum(dim=1)
            loss_svd = ((1.0 - cos_svd) * w_med).mean()

            # 3) Loss Ausiliaria sulla Bolla (sulle bolle >= 5 membri)
            yb = torch.from_numpy(y_bolla_all[b_nodes]).to(device)
            ok_b = yb >= 0
            if ok_b.any():
                logits_b = model.bolla_logits(z_anc[ok_b])
                loss_b = F.cross_entropy(logits_b, yb[ok_b], label_smoothing=0.05)
            else:
                loss_b = torch.tensor(0.0, device=device)

            loss = loss_nce + LAMBDA_SVD * loss_svd + LAMBDA_BOLLA * loss_b
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 2.0)
            opt.step()

            loss_ep += float(loss.item())
            n_batches += 1

        sched.step()
        if ep in (1, 5, 10, 15, 20, EPOCHS):
            print(f"    epoca {ep:>2}/{EPOCHS} · loss {loss_ep / max(n_batches, 1):.4f} "
                  f"({time.time()-t0:.1f}s)", flush=True)

    # 7. Inferenza sull'intero canone (a blocchi per restare < 500 MB RAM)
    model.eval()
    Z_mlp = np.zeros((N, DIM_EMB), dtype=np.float32)
    Z_mlp_noplot = np.zeros((N, DIM_EMB), dtype=np.float32)
    with torch.no_grad():
        for start in range(0, N, 1024):
            rows = np.arange(start, min(start + 1024, N))
            xm = batch_meta_tensor(rows, drop_tokens=False)
            xp = X_plot_t[rows]
            hp = has_plot_t[rows]
            tv_r = is_tv_t[rows]
            Z_mlp[rows] = model(xm, xp, hp, tv_r).cpu().numpy()
            Z_mlp_noplot[rows] = model(xm, xp, torch.zeros_like(hp), tv_r).cpu().numpy()

    Z_mlp = K.centra(Z_mlp, is_tv)
    Z_mlp_np = Z_mlp.copy()
    Z_mlp_np[test_idx] = K.centra(Z_mlp_noplot, is_tv)[test_idx]

    print("\n--- VERDETTO COLD-START SU 1.200 TITOLI TENUTI FUORI ---", flush=True)
    valuta_cold_start(Z_mlp, test_idx, mem, bolle_cand, is_tv, VOT, vicini_mappa, "A1 Gated MLP (pieno)")
    valuta_cold_start(Z_mlp_np, test_idx, mem, bolle_cand, is_tv, VOT, vicini_mappa, "A1 Gated MLP (NO trama)")

    # 8. Salvataggio artefatto in float16 (~32.35 MB) con le impronte del contratto
    out_npz = DATA / "spazio-denso-v10.npz"
    sha_part = K.sha_file("bolle-eterogeneo-subvoti.npy")
    sha_tri = K.sha_file("bolle-eterogeneo-V10-p1.0-triangolo.npz")
    np.savez_compressed(
        out_npz,
        Z=Z_mlp.astype(np.float16),
        partizione_sha=np.array(sha_part),
        triangolo_sha=np.array(sha_tri),
        ricetta_sha=np.array(P.impronta()),
    )
    print(f"\n  Salvato: {out_npz} ({out_npz.stat().st_size / 1e6:.2f} MB) · "
          f"partizione {sha_part} ({time.time()-t0:.1f}s)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

```
