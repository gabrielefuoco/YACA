# Follow-up alla risposta del senior — 21/10/2026

Ho letto tutta la risposta. **Il verdetto lo accetto**: lo spazio denso deve sostituire
`collocator.py` e `spazi-trakt.py` (`Pc`/`Pb`/`CFst`), non la camminata; la diagnosi
dell'amplificazione triangolare è coerente col codice (`chiusura_triangolare` moltiplica per
`O + 0.1`, `consenso_multivista` per `0.5 + 0.5·N`, `archi_leiden` **somma** `2·√(M·Mᵀ)`), e la
formula `log1p × supporto` è una buona base. Anche l'architettura (gated two-branch, 256-d,
`float16`), la loss a tre teste e il protocollo A0→A1 sono la direzione giusta.

Prima di far partire il Day 1, però, ho **tre cose bloccanti** e **cinque da chiudere**. Le scrivo
in ordine di gravità, con i numeri che ho verificato sui file che hai già.

---

## Bloccanti

### 1. Il pavimento al 2% non taglia il rango 16: **affama i due hub più importanti**

Hai scritto che il floor al 2% del massimo di riga taglia «la coda di *Spider-Man* dal rango 16 in
giù (che sta sotto l'1,1% del max)». La matematica dice un'altra cosa:

- *Spider-Man*: max = **259,894**; 2% = **5,198**. Il 7° peso è **9,342**, l'8° è **5,079** →
  il floor lascia **7 archi**, non 16. Spariscono X-Men 3, Hulk, Batman Begins, Watchmen, Fantastici 4
  e tutto il resto.
- *Breaking Bad*: max = **83,34**; 2% = **1,667**. L'8° peso è **1,900**, il 9° è **1,301** →
  il floor lascia **8 archi**.
- Per *Inception*, *Inkheart*, *Terabithia*, *Perfetti* il 2% sta **sotto** il 25° peso, quindi lì
  taglia il cap a 25, non il floor. Cioè: il floor è selettivo **solo** per le righe con un top-1
  dominante — proprio i due nodi che contano di più.

Non è un dettaglio: la matrice N×25 diventa una N×7 per Spider-Man e una N×8 per Breaking Bad, e
la parte buona (X-Men 3, Hulk, Batman Begins, Watchmen, Sons of Anarchy, The Shield…) sparisce
**prima** del supporto. Il `fotografia-grafo.csv` lo mostra: la riga di Spider-Man ha 15 archi sopra
l'1,1% del max, ma il 2% è al rango 8.

**Domanda**: il floor deve essere **row-adaptive**, non una percentuale fissa del massimo. Le
alternative che vedo:

1. **rank-first**: tieni i top-20/25 per peso, poi applica il floor solo sotto una soglia bassa
   (0,5% del max) e il supporto; oppure
2. **quantile di riga**: scarta il 20-30% più debole dei top-25, non una frazione del massimo; oppure
3. **floor assoluto dopo la trasformazione** `log1p × supporto`, non sul peso grezzo, così le righe
   piatte e quelle con un top-1 enorme si comportano allo stesso modo.

E soprattutto: **dammi una tabella di archi per riga dopo il floor** (i 6 seed + la distribuzione
globale, mediana/p10/p90), e il numero di nodi che restano senza teacher. Se il floor azzera anche
i titoli oscuri, il cold start perde proprio il suo bersaglio.

### 2. Il file della trama non c'è: `04-trama-qwen3b.npy` / `-idx.npy`

Non è che la trama non sia stata calcolata: il log `.scratch/coerenza/log/04h-embed-qwen3.log`
dice **«salvate 35.829 × 1024 in 04-trama-qwen3.npy (140,0 MiB) in 995s»**, cioè ~36 trame/s con
`qwen3-embedding:0.6b`. Il **file** però non è più nella cartella degli artefatti: `services/graph/data/`
ha 30 file per 143 MB (l'embedding da solo è ~140-146 MB), `backup-20261020/` ha solo
`metadati-canone.npz` e `titoli-canone.txt`, e la ricerca su `C:\Users\gabri` (laptop) e su
`/srv /home /var/lib/docker /tmp /opt` (mate) non trova né `04-trama-qwen3.npy` (nome vecchio) né
`04-trama-qwen3b.npy` + `-idx` (nome del `steps/00` attuale). La cartella è stata potata: il README
dichiara **55 file / 422 MB**, oggi sono **30 / 143 MB**. Ho cercato anche in **tutti i `.scratch`**
(YACA, worktree, temp, orca, `.gemini`): nessun `.npy`/`.npz`, solo gli script e i log delle misure;
l'unico file >20 MB è `.scratch/mappa-pesata/bolle-nuovi.jsonl` (23,7 MB), che non c'entra.
Quindi il file **non è in `.scratch`**.

Quindi `carica_feature_studente()` chiama `K.A("04-trama-qwen3b.npy")` e il tuo script si ferma con
`FileNotFoundError` **prima** del baseline. Non è un dettaglio di percorso: è il ramo `PlotBranch`
che manca. Il componente **TRAMA** nel triangolo è rimasto (la k-NN costruita dagli embedding), ma
non è la stessa cosa: è un grafo sparso N×N, non i vettori 1024-d per titolo; e per un titolo nuovo
non esiste comunque.

**Domanda**:

- **se il file esiste** su un altro disco, un backup, un vecchio clone o Drive/Colab, va copiato in
  `services/graph/data/` e si usa subito: i nomi da cercare sono `04-trama-qwen3b.npy` +
  `04-trama-qwen3b-idx.npy` (attuale) o `04-trama-qwen3.npy` (vecchio; serve l'indice vecchio).
  È esattamente l'embedding precalcolato, non va ricalcolato.
- **se non c'è**, quanto costa rigenerarlo? Il log dice ~17 min a 36 trame/s (probabilmente con GPU)
  con `steps/00_embedding_trame.py` + Ollama `qwen3-embedding:0.6b` + i Parquet; su CPU sarà molto
  più lento. Va deciso **dove** gira: il mate non ha Ollama (verificato), quindi o si usa il laptop,
  o si aggiunge un servizio Ollama, o si accetta il fallback. **Piano concordato**: si riattiva la
  GPU e si rigenera; il comando è `steps/00_embedding_trame.py` (input `.cache/tmdb/{movies,tv}.parquet`,
  che sta nel volume `yaca_tmdb` sul mate e va copiato/montato; output
  `services/graph/data/04-trama-qwen3b.npy` + `-idx`). È incrementale ogni 2.000, quindi ripartibile.
- **per le uscite nuove** il file precalcolato non basta comunque: qwen3 deve embeddare la nuova
  `overview` all'ingestione (il file copre solo i 35.829 titoli esistenti). Il tuo piano usa `X_plot`
  precalcolato per il training, ma non dice dove gira l'embedding della trama a inference-time.
- **fallback** che rende lo script eseguibile subito: `try/except` su `K.A(...)` e ramo plot spento
  (`has_plot=0`) per A0/A1; il gate `has_plot` esiste già. In alternativa un `TruncatedSVD` del
  componente TRAMA (N×256) come feature provvisoria, dichiarandolo come esperimento diverso.

### 3. Il costo del baseline e del training non è credibile su CPU 8 GB

Due numeri tuoi che non tornano:

- **A0**: `X_ridge = hstack([X_meta, csr_matrix(X_plot*0.5)])`. Il blocco `X_plot` è 66.259 × 1024
  **denso**, quindi `csr_matrix` crea ~**67,8 M di non-zero**; più `X_meta`. `Ridge(alpha=30,
  solver="lsqr")` su **256 output** = 256 risoluzioni iterative su una matrice da ~800 MB. Il
  «~45 secondi» è ottimistico; va misurato. E il target `U_svd` è a 66.259 × 256.
- **A1**: `meta_proj = Linear(81k, 256)` = **20,8 M parametri**, e `batch_meta_tensor` **densifica**
  512 × 81k = **41 M float = 166 MB per batch**. 25 epoche su 66k titoli, a quel costo, non stanno
  in «90-120 secondi» su CPU. Il collo di bottiglia è il `Linear` denso su TF-IDF sparso: è il
  classico caso da `nn.EmbeddingBag` (indici + valori), non da vettore denso.

**Domanda**:

- un **benchmark misurato** dei tre passi (SVD, Ridge, una epoca MLP) sulla macchina target, non
  una stima;
- oppure un design più leggero: `nn.EmbeddingBag`/sparse linear per `X_meta`; `TruncatedSVD`/
  PCA della trama a 128/256 per A0 e per il ramo plot; vocabolario ridotto (df ≥ 5 o top 20k);
  `SGDRegressor`/una testa lineare addestrata con lo stesso ottimizzatore per A0; prima un A0 su
  10k titoli per validare la pipeline, poi lo scale-up.
- Se serve una GPU (Colab), dillo: la macchina di casa è CPU 8 GB e il container del grafo è da
  512 MB (e **non ha `torch`** in `requirements.txt`: il training va in un environment a parte).

---

## Da chiudere (validità e rigore)

### 4. Il cold-start test è biased e non del tutto induttivo

Il codice seleziona i test con:

```python
elig = np.isin(mem, np.where(sz >= P.CENTROIDI_MIN_MEMBRI + 1)[0]) & (VOT >= 20)
```

ma il testo dice «stratificati 50% con trama e 50% senza trama». Non c'è nessuna stratificazione su
`has_plot`; c'è `VOT >= 20`, che **esclude proprio le uscite nuove** (le vere cold start hanno 0-5
voti); e non c'è un controllo sul grado comportamentale. In più:

- la **bolla di ground truth** viene dalla partizione completa, costruita **con** gli archi del
  titolo di test: togli gli archi dal teacher, ma la label della bolla ha già usato quel
  comportamento. Non è un cold start totalmente induttivo;
- il campione casuale può prendere **tutti i membri** di una bolla da 6, lasciando il centroide
  senza membri di training (`C_bolle[k] = 0`);
- il baseline vero, `collocator.py` V1/V3, **non viene eseguito sulla stessa split**: il 63,0% e il
  27,7% sono numeri generali, non misurati su questi 1.200 titoli. Il confronto A0/A1 è contro il
  centroide denso, non contro il collocatore.

**Domanda**: rifare lo split con:

- **strati**: 50/50 `has_plot`; uno strato a **VOT < 20** (o `uscite-collocate.npz` per le uscite
  recenti); almeno 2 membri di training per bolla (max 20-30% di ogni bolla in test);
- **label di bolla** ricalcolata senza i titoli di test, oppure un sottoinsieme «bolla stabile» in
  cui la rimozione del titolo non cambia la bolla;
- **collocatore V1/V3** sulla stessa split, come baseline, oltre ad A0;
- 3 seed / intervalli, non un solo split.

### 5. La loss ausiliaria sulla bolla può insegnare la partizione, non il grafo

`L_bolla` allena lo studente a predire la bolla completa; la valutazione usa la **stessa** bolla.
Lo studente può imparare la partizione (che è già costruita con le stesse feature + il grafo)
invece della struttura degli archi. Il peso 0,3 è una scelta a intuito.

**Domanda**: ablation `λ_bolla = 0`; valutazione su una label di bolla **non usata in training**
(partizione ricalcolata o bolla tenuta fuori); report separato di **recall sugli archi**
(componenti comportamentali `CF+B+TV+LIST`) e **accuratezza di bolla**; quanto della metrica di
cold start viene dalla testa bolla e quanto dagli archi.

### 6. `U_svd` non è centrato, `Z` sì: ancora e valutazione sono disallineate

`U_svd` è l'SVD grezzo; `Z_mlp = K.centra(...)`; `loss_svd = 1 - cos(z_anc, U_svd)` è calcolata su
un target **non centrato**, mentre la valutazione usa `Z` centrato. Lo stesso per A0: il Ridge fitta
`U_svd` non centrato e poi `K.centra` centra la previsione. `K.centra` è una trasformazione
non lineare che la loss non ha ottimizzato — e la media di centratura include i titoli di test
(transduttiva).

**Domanda**: centrare `U_svd` per medium **prima** dell'ancora e fittare il Ridge sul target
centrato (oppure togliere il `K.centra` post-hoc e mettere il target centrato nella loss); calcolare
la media di centratura **solo sui nodi di training** e applicarla ai test. E definire la geometria
finale (centrata o no) prima di scegliere le loss.

### 7. «I migliori iperparametri» sono ipotesi motivate, non una ricerca

Hai dato una motivazione per ognuno — ed è utile — ma non c'è una validation curve né un range:
`LAMBDA_SVD=0.5`, `LAMBDA_BOLLA=0.3`, `TEMP_INFONCE=0.07`, `MODALITY_DROPOUT=0.35`,
`FEATURE_DROPOUT=0.25`, `EPOCHS=25`, `LR=1.5e-3`, `FLOOR=0.02/0.15`, `SUPPORTO_M0=50`, `DIM=256`.
L'utente ha chiesto **i migliori** e **perché**; il perché c'è, il «migliore» no.

**Domanda**: un protocollo di ricerca piccolo e onesto:

- 3 seed, split di validation (oltre ai 1.200 test), 3 valori per i 3 iperparametri più sensibili
  (floor, `λ_bolla`, `λ_svd`; forse dropout), tabella «valore → metrica di cold start»;
- se il budget non lo permette, dire quali 2-3 sono **misurati** e quali sono **ipotesi** da
  verificare, e quali sono fissati dal budget RAM (256-d) e non vanno cercati.

### 8. Il contratto dell'artefatto e l'integrazione non sono definiti

Lo script salva `partizione_sha`, `triangolo_sha`, `ricetta_sha`, ma **non** chiama
`canon.segna_partizione` / `assert_allineamento_spazi`. Il nuovo spazio dipende anche da
`05-tfidf`/`05-vocab`, `hierarchical_graph.json`, dall'embedding della trama e dalla matrice
teacher: nessuna di queste impronte è nell'artefatto. Se il TF-IDF o la trama cambiano, il prodotto
serve uno spazio vecchio **in silenzio** — è la trappola che il progetto ha già pagato.

**Domanda**: il contratto esatto:

- campi dell'artefatto: `Z` float16, `partizione_sha`, `triangolo_sha`, `ricetta_sha`,
  `tfidf_sha`/`vocab_sha`, `keyword_graph_sha`, `trama_sha`, `dim`, le medie di centratura per
  medium;
- percorso di caricamento per `collocator.py` e `uscite.py`; come si calcolano i **centroidi densi**
  delle bolle; come si applicano la regola dei voti e quella del medium; cosa succede a un titolo
  **senza trama** (46%) e a un'uscita nuova con 0 voti; come si sceglie fra TF-IDF e spazio denso.

Senza questo, il «drop-in» del Day 9-10 resta una promessa.

### 9. La diagnosi dell'amplificazione non è verificata

La formula dei pesi parte dall'ipotesi che il ponte *Inkheart → 674* sia amplificato da
`chiusura_triangolare` (`O_ij`) e dalle viste `KW`/`PROD`/`TRAMA`. È plausibile, ma la
`fotografia-grafo.csv` non porta `O_ij`, `N_ij` né i pesi dei 10 componenti: la diagnosi non è
misurata.

**Domanda**: una tabella di decomposizione per 3 archi — *Inkheart–Spiderwick* (buono),
*Inkheart–TV tedesca* (spurio), *Spider-Man–X-Men 2* (buono) — con i pesi dei 10 componenti prima
del triangolo, `O_ij`, `N_ij` e il peso finale. Se i componenti non sono disponibili, dire quale
artefatto manca e come ricostruirlo (`bubbles.carica_componenti` + i Parquet). Questo è anche il
modo per rispondere davvero alla domanda «**cosa sfruttare precisamente** per i pesi».

---

## Nota sul codice

La bozza è ben strutturata e il `__main__` c'è, ma non è eseguibile oggi per il punto 2 (trama
mancante) e probabilmente non nei tempi dichiarati per il punto 3. Non serve riscriverla tutta:
bastano le correzioni dei punti 1, 3 e 6 (floor row-adaptive, `EmbeddingBag`/SVD randomized,
centratura del target) e un `try/except`/fallback per la trama. Il resto può restare com'è.

Se il floor row-adaptive cambia la matrice, la formula `log1p × supporto` va rirulata: il supporto
`min(VOT)/(min(VOT)+50)` è ragionevole, ma va misurato l'effetto sui **vicini buoni ma oscuri**
(non solo sui ponti sporchi), altrimenti il cold start perde proprio i titoli che vuole recuperare.
