# Il modulo denso: cosa è stato costruito e cosa dicono i numeri

**Data**: 21-22/10/2026 · **Modulo nuovo**: `services/graph_dense/` · **Vecchio modulo**: intatto.
**Tickets**: `.scratch/distillazione-grafo/issues/01…09` · **Mappa**: `map.md`.
**Trama**: 35.891 embedding qwen3, fatti sulla RTX 3060 in **864 s**.

---

## 0. In una pagina

| | own | quartiere | recall@20 |
|---|---:|---:|---:|
| **collocatore V1** | **78,6%** | **84,1%** | — |
| collocatore V3 | 54,3% | 62,7% | — |
| A0 SVD+Ridge (senza trama) | 15,1% | 33,1% | 9,7% |
| A0 SVD+Ridge (con trama) | 15,6% | 34,9% | 10,2% |
| A1 gated MLP (senza trama) | 17,6% | 36,5% | 11,6% |
| **A1 gated MLP (con trama)** | **19,4%** | **38,8%** | **12,7%** |
| A2 512-d + distillazione collocatore | 18,4% | 37,2% | 12,6% |
| A3 testa sparsa 81k→2.922 (V3) | 15,4% | 32,2% | — |
| A3 testa sparsa 81k→2.922 (V1) | 15,4% | 31,9% | — |
| A5 set di cluster keyword (PMA) | 18,1% | 36,7% | 12,4% |
| A6 softmax pieno multi-positivo | 17,7% | 35,5% | 11,7% |
| A7 keyword del film (bge + cluster) | 18,0% | 36,8% | 12,6% |
| **A8 feature nuove** (collection, writers, lingua, rating) | **20,2%** | 38,7% | **13,0%** |
| A10 A8 + target intera riga del grafo | 21,9% | 40,7% | 15,2% |
| **A12 A10, γ=0,5 (artefatto)** | **22,1%** | **41,2%** | **15,2%** |
| bolla oracolo + denso (leaky, vedi §10) | — | — | 32,3% |

La trama aggiunge **+1,8 punti** di own e +1,1 di recall ad A1; A1 batte A0 di +3,8 own e +2,5
recall. Ma il collocatore V1 resta **59 punti sopra**. I modelli più grandi non aiutano: A2
(512-d + distillazione del collocatore) fa 18,4%; A3 (testa sparsa 81k→2.922, la capacità del
collocatore) fa 15,4% — **peggio** di A1. Il 256-d A1 è il migliore dello spazio denso. La
conclusione: **il collocatore resta il classificatore di bolla; lo spazio denso serve per il
retrieval/re-ranking e come feature**. La testa bolla ad alta capacità generalizza male sui titoli
tenuti fuori (overfit sui token del training); il collocatore vince perché i suoi centroidi sono
fissi e ad alta dimensionalità.

Il multi-vettore delle keyword (§10) **non sposta il recall**: i cluster sono già in `X_meta` e
la co-visione non premia i sinonimi. Il 78,6% del collocatore è **un artefatto di laboratorio**
(i suoi centroidi includono il titolo di test: senza, il nearest-centroid onesto scende a 18,6%),
quindi l'ibrido al 28,5% è ritirato. Il soffitto vero sono le **feature**: il kNN sul TF-IDF grezzo
fa 11,0%, il modello 12,7% — la rete aggiunge +1,7 punti, non 40.

## 1. Il teacher: il floor giusto (e il conto del senior sbagliato)

Il floor del senior (2% del **peso grezzo**) tagliava i hub: Spider-Man max 259,894 → 2% = 5,198,
il 7° peso 9,342, l'8° 5,079 → **7 archi**; Breaking Bad max 83,34 → 2% = 1,667, l'8° 1,900, il 9°
1,301 → **8 archi**. Il floor usato è **5% del peso trasformato**
`log1p(w)·sqrt(v_min/(v_min+50))` + 0,02 assoluto:

- **1.606.148 archi** (top-25 pieno 2.322.016); mediana **25** archi/riga;
- 6 seed: 25 / 25 / 25 / 25 / 25 / **23**;
- *Inkheart → bolla 674*: **0** archi (17 nel grafo pieno, pesi 0,128-0,190) — il ponte sparisce
  senza affamare i hub;
- 784 righe 1-5, 752 6-10, 1.789 11-20, **62.934 21-25**.

File: `data/teacher.npz`, `data/teacher-stats.json`.

## 2. Split e collocatore

1.600 test (seed 13): 300 film main plot + 300 film main no-plot + 300 serie main plot + 300 serie
main no-plot + 200 film low-vote + 200 serie low-vote. Archi dei test azzerati nel teacher; nessuna
bolla con <2 membri di training; bolla di ground truth dalla partizione completa (**limite**).

Collocatore sulla stessa split: **V1 78,6% own / 84,1% quartiere**; V3 54,3% / 62,7%. Per strato V1:
film plot 85,0/89,7; film no-plot 79,3/82,0; serie plot 83,0/88,0; serie no-plot 72,0/82,7; film low
79,5/82,0; serie low 70,0/77,5. Sono più alti del 63,0/35,3 generali perché lo split è più facile
(bolle ≥6, VOT ≥20): il confronto interno vale, quello col numero generale no.

File: `data/split.npz`, `split.json`, `collocator.json`.

## 3. A0 e A1, per strato (con la trama)

**A0**: SVD-256 randomized sul teacher simmetrizzato (holdout), target centrato per medium,
Ridge(α=30) su `X_meta` + trama. Senza trama 41 s; con la trama **585 s** (il blocco denso 66k×1024
pesa nel Ridge).

**A1**: gated two-branch, `EmbeddingBag` per i metadati, `Linear` per la trama, loss InfoNCE pesata
+ ancora SVD + CrossEntropy bolla, dropout feature, serie ×1,5, 256-d, 25 epoche. Senza trama
440 s; con la trama **640 s** (CPU).

| strato | V1 own | A0 own | A1 own | A1 quart. | A1 recall |
|---|---:|---:|---:|---:|---:|
| film main plot | 85,0% | 14,0% | **15,7%** | 33,7% | 11,0% |
| film main no-plot | 79,3% | 9,7% | **10,7%** | 25,3% | 5,8% |
| serie main plot | 83,0% | 21,7% | **30,3%** | 51,0% | 19,7% |
| serie main no-plot | 72,0% | 20,3% | **26,3%** | 51,7% | 16,4% |
| film low-vote | 79,5% | 6,0% | **7,0%** | 16,0% | 5,8% |
| serie low-vote | 70,0% | 20,0% | **24,0%** | 52,0% | 16,5% |
| **totale** | **78,6%** | **15,6%** | **19,4%** | **38,8%** | **12,7%** |

La trama aiuta soprattutto le **serie** (+5,3 plot, +1,3 no-plot) e i **film main plot** (+1,7);
i low-vote restano il punto nero (film 7%). La testa bolla è valutata sui **centroidi di `Z`**, non
sui prototipi appresi: è la via del prodotto, ma i prototipi vanno provati.

File: `a0-metrics.json`, `a1-metrics.json`, `a0-test.npz`, `a1.npz`, `a1-model.pt`, `a1-plot.log`.

## 4. La trama: fatta

`python -m services.graph_dense.embed_trama`, ripreso dal checkpoint CPU dei 500, **RTX 3060 Laptop**
(driver 565.90, CUDA 12.6, `torch 2.14.1+cu126`): **35.891/35.891 in 864 s**, ~42 trame/s,
checkpoint ogni 500. File: `data/trama-qwen3b.npy` (259 MB, N×1024 con zeri dove manca) +
`trama-qwen3b-idx.npy`; `trama-state.json` dice `device: cuda`, `fatte: 35891`.

La lezione operativa: il venv aveva `torch 2.13.0+cpu`; il primo job è partito su CPU e ha fatto
500 trame in 94 minuti. **Prima di un job lungo si controlla `torch.cuda.is_available()`**.

## 5. L'artefatto

`data/spazio-denso-v10.npz` (30 MB): `Z` (66.259×256, float16, L2, centrato per medium), `mu` (2×256),
`proto` (2.922×256), `dim`, e le impronte di partizione, triangolo, TF-IDF/vocab, keyword graph,
**trama** (ora presente), teacher, split, ricetta. Modello: `data/a1-model.pt`. Per un titolo nuovo:
`data.features` + `data.plot_embedding` → modello → sottrarre `mu[is_tv]` → L2. I centroidi densi
delle bolle sono la media di `Z` sui membri di training, normalizzata; regola voti/medium come
`collocator.py`. **Le impronte vanno verificate**: un `Z` su una partizione diversa è sbagliato in
silenzio.

## 6. Differenze dal piano del senior

| punto | senior | qui | perché |
|---|---|---|---|
| floor | 2% del grezzo | **5% del trasformato** | il 2% lasciava 7/8 archi ai hub |
| primo layer | `Linear(81k,256)` denso | **`EmbeddingBag`** | 20,8 M parametri e batch 166 MB; lo sparse è la strada |
| trama | file assunto | **35.891 su GPU, 864 s** | il file era stato potato; rigenerato |
| esito | A1 > collocatore | **A1 19,4% vs V1 78,6%** | il 256-d perde i centroids TF-IDF; il teacher SVD è globale |
| cold start | 1.200 test | **1.600** (low-vote compreso) | il senior escludeva VOT<20; le uscite vere sono lì |
| valutazione | bolla + recall + Sim_trama | bolla + recall + collocatore | `Sim_trama` non eseguita |
| iperparametri | «migliori» | valori motivati, non cercati | il primo giro è un baseline, non una ricerca |

## 7. Cosa resta

1. **Il teacher per il retrieval**: node2vec/LightGCN o una SVD a più componenti; il teacher
   spettrale globale è la causa più probabile del 12,7% di recall. Misurare con la stessa split.
2. **L'ibrido**: il collocatore per la bolla (78,6%), lo spazio denso per il retrieval/re-ranking
   dentro la bolla. È l'unica architettura che usa il meglio dei due; il prodotto non deve
   sostituire il collocatore.
3. **`Sim_trama`** e la valutazione delle uscite nuove (`uscite-collocate.npz`), il banco
   `intero.py` con il re-ranking denso.
4. **Ablazioni**: top-20/25/30, floor 2/5/10%, λ_bolla 0/0,3; A0 costa 1-10 min, A1 7-11 min.
5. **La testa bolla**: se si vuole, una lista nera/curata dei contenitori (la lezione del §14 della
   mappa) invece di un'altra testa.

## 8. File

```
services/graph_dense/
  config.py data.py teacher.py split.py model.py train_a0.py train_a1.py train_a2.py
  train_a3.py eval.py embed_trama.py artefatto.py run.py README.md
  data/graph/      copia read-only V10 (131 MB)
  data/teacher.npz teacher-stats.json split.npz split.json collocator.json
       a0-test.npz a0-metrics.json a1.npz a1-metrics.json a1-model.pt a1-plot.log
       a2.npz a2-metrics.json a2-model.pt a3-v3-metrics.json a3-v1-metrics.json
       trama-qwen3b.npy trama-qwen3b-idx.npy trama-state.json
       spazio-denso-v10.npz embed-gpu.log
```

Il vecchio `services/graph/` non è stato modificato: codice intatto, `data/` vuota com'era.

---

## 9. La lettura empirica: il vicinato reale (22/10)

Il recall@20 meccanico è 12,7% (A1 256 + trama). Il test successivo — **A4 LightGCN** a 2 layer
sul teacher potato (1,6M archi, 50 epoche, loss 0,407) — ha prodotto `nan` nel Ridge (`U`/`A`
numerico); l'A1 con il target LightGCN è **0,195 / 0,384 / 0,127**, identico all'A1 con l'SVD.
**Il teacher non è il collo di bottiglia**: il limite sono le feature e la loss, non la sorgente
degli archi.

Ma il numero 12,7% va letto con l'occhio. I 6 titoli sonda (overlap denso/grafo e giudizio):

| titolo | overlap | il denso | il grafo | giudizio |
|---|---:|---|---|---|
| Spider-Man | **10/20** | Spider-Man, MCU (Iron Man, Ant-Man, Black Panther, Deadpool) | pre-MCU (Daredevil, Batman Begins, Watchmen, Spirit) | denso **flessibile**, grafo più specifico |
| Breaking Bad | 3/20 | crime TV (Ozark, The Night Of, Snowfall, Dopesick) | drama coreano, The Big C, Lost, 1992 | **denso migliore** |
| Inkheart | 4/20 | family fantasy (Harry Potter, Miss Peregrine, Narnia, Oz) | YA fantasy specifico (Spiderwick, Stardust, Eragon) | denso **più largo**, grafo più preciso |
| Terabithia | 2/20 | Narnia, Pan, Wild Things, Brave, Rapunzel | Spiderwick, Water Horse, Magorium, Zathura | denso **più largo** |
| Inception | 1/20 | Bourne, Minority Report, Lucy, Skyfall | Nolan/smart sci-fi (Prestige, Memento, Arrival) | denso **peggiore** |
| Perfetti sconosciuti | 4/20 | commedia italiana (Immaturi, Tre uomini e una gamba, Odio l'estate) | chamber thriller/remake (Carnage, The Place, El cuerpo) | denso **altro mondo** |

**La conclusione**: il grafo top-20 è rumoroso (il drama coreano al rango 14 di Breaking Bad, la
TV tedesca in Inkheart); il denso è **più flessibile** e a volte **migliore** (Breaking Bad,
Spider-Man), a volte più largo (family fantasy), a volte sbaglia mondo (Inception, Perfetti). Il
recall@20 non è l'unica misura: va affiancato alla lettura del vicinato. Il 50% è un obiettivo
ragionevole per il recall, ma il valore vero è **un vicinato che regge all'occhio**, non la
riproduzione del rumore del grafo.

**Prossimo**: A5 sulle feature (embedding bge del grafo keyword, `X_meta` più ricco, trama) e
sulla loss contrastiva; poi la lettura empirica su 20-30 titoli, non solo sui 6. L'ibrido
(collocatore per la bolla + denso per il retrieval) resta l'architettura di prodotto.

---

## 10. A5-A7: il multi-vettore delle keyword, e il soffitto vero (22/10)

**Cosa è stato provato.** Il grafo gerarchico delle 6.125 keyword (`kw_to_L1` → L1 1.382 →
L2 469 → L3 131) è stato usato per costruire un **set** di token per film, non una media:
`keywords.py` calcola gli embedding `BAAI/bge-small-en-v1.5` (384-d), i centroidi dei cluster e,
per ogni film, fino a 12 token per livello con peso TF-IDF; `SetPool` (PMA: `MultiheadAttention`
con query appresa, maschera e peso) riduce il set a un vettore; il gate a 3 vie mescola metadati,
trama e keyword; 256-d. Varianti misurate sulla stessa split:

| modello | token | own | quartiere | recall@20 |
|---|---|---:|---:|---:|
| A1 (riferimento) | — | **19,4%** | **38,8%** | **12,7%** |
| A5 | centroidi L1/L2/L3, 36 token | 18,1% | 36,7% | 12,4% |
| A5 senza SVD | centroidi, 36 | 18,2% | 37,2% | 12,6% |
| A5 bolla ×1,0 | centroidi, 36 | 19,3% | 38,7% | 12,6% |
| A6 softmax pieno | centroidi, 36 | 17,7% | 35,5% | 11,7% |
| A7 keyword del film | bge delle keyword, 12 | 18,0% | 36,8% | 12,6% |

**Il risultato negativo, spiegato.** Il multi-vettore di **centroidi** non aggiunge informazione:
i centroidi sono funzione del cluster, e il blocco L1/L2/L3 è **già dentro `X_meta`**
(`data.features`). Aggiunge la stessa informazione, levigata: per questo A5 ≈ A1 e il gate impara
a ignorarlo. La variante A7 (embedding delle keyword **del film**, cluster L2 come etichetta del
token) porta semantica nuova, ma il recall non si muove: la co-visione non premia i sinonimi.
Anche togliere l'ancora SVD (λ 0,5 → 0) e il softmax pieno multi-positivo (tutti i 66k come
negativi, tutti i 25 vicini come positivi: A6) non spostano il numero. **La loss non è il collo di
bottiglia; il target top-20 è.**

**Due misure che cambiano la diagnosi.**

1. **Il teacher SVD non recupera il top-20.** `recall@20` della SVD-256 del teacher: **0,07%**
   (SVD-512: 0,08%). Non è un soffitto: è un bersaglio quasi ortogonale al metrico. L'A1 (12,7%)
   sta **sopra** il teacher, quindi il segnale viene dalle feature, non dalla distillazione.
2. **Il 48,5% dei vicini top-20 sta nella stessa bolla** (per peso 56,5%). Un modello che azzecca
   la bolla e ordina bene al suo interno ha un soffitto di **48,5%** — vicino al 50% chiesto. Il
   denso azzecca la bolla al 19,4%; il collocatore V1 al **78,6%**. Il collo di bottiglia non è
   né il teacher né le keyword: è la **collocazione in bolla**.

**Il collocatore è leaky: l'ibrido va ritirato.** Bolla dal collocatore V1, ranking dentro la
bolla con lo spazio denso: 28,5% (bonus λ=1); bolla oracolo: 32,3%. Sembrava il raddoppio. Ma i
centroidi del collocatore sono costruiti **su tutti i membri, titolo di test compreso** (il
docstring del vecchio modulo lo dice: il LOO serviva «a non autoconfermarsi in laboratorio»). Con
un nearest-centroid onesto, centroidi dai soli membri di training e coseno sullo stesso `X_meta`:

| nearest-centroid su `X_meta` (81k) | own |
|---|---:|
| senza i titoli di test (onesto) | **18,6%** |
| con i titoli di test (come il collocatore) | 40,9% |

Il 78,6% del collocatore sta sopra anche al 40,9% per la regola macro/voti e per i suoi centroidi
V1 ad alta dimensionalità, ma la distanza 18,6 → 78,6 è in larghissima parte **self-inclusion**,
non capacità. In produzione un titolo nuovo non è in nessun centroide: il numero onesto è ~19%,
esattamente il nostro modello. **Nessun ibrido**: 12,7% è la misura pulita, e il denso è già al
livello delle feature.

**Il soffitto sono le feature.** kNN coseno sul TF-IDF grezzo (81k), stessi 1.600 test: **11,0%**
di recall@20 (film plot 6,3%, serie 14,9-18,5%). Il modello addestrato fa 12,7%: la rete aggiunge
**+1,7 punti** al nearest-neighbor. Non c'è architettura che colmi il resto: il top-20 del grafo
contiene co-visione che i metadati non descrivono (marketing, timing, gusto). Per alzare il numero
servono **feature nuove**, non loss nuove.

**Il target: top-25 contro intera riga.** Il teacher butta 11,6 milioni di archi deboli su 13,2.
A10 li rimette: per ogni ancora il target è la **distribuzione intera** della riga del grafo
(pesi normalizzati), con softmax pieno su tutti i 66k e memory bank. Risultato: **21,9% own /
15,2% recall** (contro 20,2/13,0 di A8). Gli archi deboli portano la struttura della bolla che il
top-25 non ha; è il guadagno più grosso dopo la trama. Con γ=0,5 (target più piatto) si pareggia
il recall e si migliora la collocazione: **A12 22,1% / 41,2% / 15,2%**, ed è il modello
dell'artefatto. Le keyword sopra A10 non aggiungono (A11: 15,1%).

**Cosa manca nelle feature** (misurato sui top-20 dei test):

| segnale | copertura | quota top-20 (archi / peso) | in `X_meta`? |
|---|---:|---|---|
| `collection_id` (franchise) | 14,5% dei film | 13,1% / **49,8%** | **no** |
| `networks` TV | 100% delle serie | 11,4% / — | sì (`rt:`) |
| `writers` | — | — | **no** |
| `original_language` | — | — | **no** (`lg:` assente dal vocabolario) |
| `content_rating` | — | — | **no** |

La collection da sola pesa **metà del peso** dei vicini per i film in franchise: è il segnale che
il modello non ha. È lì che si gioca il prossimo punto, non nella loss. (A8: `X_meta` + collection,
writers, lingua, rating.)

**La lettura empirica su 30 titoli** (`lettura-a5.md`, A1 vs A7, primi 10 vicini ciascuno):
A7 è **migliore in 13**, equivalente in 12, peggiore in 5.

- A7 meglio: *Inception* (Memento, Source Code, Gattaca, Scanner Darkly, π invece di Bourne e
  Lucy), *Matrix* (Her, Upgrade, A.I., Blade Runner 2049), *Spider-Man* (Batman Returns/Forever,
  Catwoman, Daredevil: supereroi di ogni epoca, non solo MCU), *Silenzio degli innocenti* (Seven,
  Prisoners, Insomnia), *Titanic* (Anna Karenina, Poseidon, Master & Commander), *Barbie*
  (animazione mainstream invece dei film per bambini con Barbie), *Star Wars* (9/10 nel grafo
  contro 7/10), *Il padrino* (Mean Streets, Casinò), *Breaking Bad* (Banshee, Dexter).
- A7 peggio: *Mad Max* (perde la trilogia: le keyword non codificano il franchise), *Fight Club*
  (infila *C'era una volta in America*), *Il Trono di Spade* (deriva su Merlino), *Toy Story*
  (animazione generica invece di Pixar), *Rick and Morty* (deriva sul live-action sci-fi).

**Conclusione.** Il multi-vettore delle keyword è **utile alla lettura** (vicinato più semantico,
meno franchise) ma **non al recall**: il metrico premia la riproduzione della co-visione, e la
co-visione non è nei sinonimi. Il collocatore non è un'alternativa onesta (leak), e l'ibrido è
ritirato. Le due leve che hanno funzionato sono **feature nuove** (A8: +0,8 own, +0,3 recall) e
**target pieno** (A10: +1,7 own, +2,2 recall): 12,7% → **15,2%**, con kNN a 11,0%. Il resto non è
architettura: il top-20 del grafo è comportamento, e i metadati ne spiegano una parte.

---

## 11. Memorizzazione: il collo di bottiglia è l'encoder (22/10)

Domanda: il modello non cattura la matrice perché non ha capacità, o perché non può? Misura del
**recall@20 sui dati di training** (3.000 ancore, top-20 della riga intera):

| modello | regime | train recall@20 | test recall@20 |
|---|---|---:|---:|
| A12 | 256-d, fdrop 0,25, bank 1×epoca | 17,0% | 15,2% |
| m1 | 512-d, fdrop 0, dropout 0,05, **bank aggiornata a ogni passo** | 27,7% | **16,9%** |
| t1 | **transformer sui token** (self-attention, CLS) | 31,2% | 16,3% |
| **tabella libera** | 66k×256 vettori liberi, nessun encoder | **63,5%** (e sale) | — |

Tre conseguenze.

1. **Il target è rappresentabile**: una tabella libera di 66k vettori, con la stessa loss, rifà il
   63,5% del top-20 (e la curva sale ancora). Non è la loss, non è il target, non è la dimensione
   dello spazio: è il passaggio **feature → vettore** che perde metà della struttura.
2. **Il transformer non risolve**: aumenta il fit (31,2% vs 27,7%) ma **peggiora** il test (16,3%
   vs 16,9%). Primo segno che siamo sul pianoro dello sweet spot: più capacità da sola non paga.
3. **Il gap train-test è ~11-15 punti**: è il costo di generalizzare dai metadati. Il gap
   tabella-libera vs encoder (~32 punti) è l'informazione che le feature non contengono.

Il modello migliore diventa **m1** (24,9% own / 41,9% quartiere / 16,9% recall), e l'artefatto va
ricostruito da lì. Direzioni proposte (vedi handoff per il senior): item bias libero + encoder
delle feature (wide & deep), multi-vettore in uscita con late interaction, target denoised.

---

## 12. Le raccomandazioni del senior, eseguite (22/10, sera)

Il senior ha chiesto: tabella libera come teacher/bank e ancora diretta, niente multi-vettore,
valutazione sul teacher ripulito + NDCG, target riga intera con denoising voti, sinossi per i
senza-trama, consolidare m1. Esecuzione e numeri.

| esperimento | cosa cambia | train rec | own | quartiere | recall@20 |
|---|---|---:|---:|---:|---:|
| **m1** (riferimento) | 512-d, bank mobile, γ=0,5, 54% trame | 27,7% | **24,9%** | **41,9%** | **16,9%** |
| f1 | bank fissa = tabella libera 512-d + **ancora coseno λ=1** | 30,2% | 21,2% | 40,6% | 13,6% |
| f2 | bank fissa, senza ancora, + votsup + token pg | 31,7% | 21,6% | 40,9% | 13,6% |
| f3 | m1 + token pg + **99,7% trame** | 30,3% | 23,4% | 42,7% | 16,4% |
| f4 | m1 + **99,7% trame**, niente pg | 29,2% | 23,2% | 41,8% | 16,3% |
| f5 | m1 + votsup, niente pg | 29,2% | 23,4% | 42,4% | 16,4% |
| lc | m1 con **50 epoche** (trame 99,7%) | 42,9% | 24,8% | 42,6% | 17,8% |
| lc100 | 100 epoche, T_max=100 | 52,1% | 27,4% | 44,8% | 20,7% |
| **lc150** | +50 epoche di coda (resume, lr 1e-4→1e-5) — artefatto | **52,2%** | **27,8%** | **45,4%** | **20,9%** |
| tabella libera 512-d | solo diagnosi | **65,7%** | — | — | — |

**1. Tabella libera come ancora/bank: no.** f1 e f2 alzano il train (+2,5/+4) e **affondano il
test** (-3,3). La geometria della tabella libera contiene le idiosincrasie di ogni titolo; l'encoder
che la insegue memorizza, non generalizza. Il tetto della tabella libera a 512-d è 65,7% (non 100%):
il resto del top-20 non è rappresentabile nemmeno con vettori liberi.

**2. Multi-vettore: non fatto**, come da tuo consiglio; le prove già raccolte (A5/A7 12,4-12,6%,
t1 16,3%) lo sconsigliano.

**3. Metrica sul teacher ripulito + NDCG**: `eval-teacher.py`, top-20 della riga **senza** holdout
(il teacher mascherato azzera le righe di test, quindi non è valutabile). m1: **17,34% recall /
20,61 NDCG@20**; f3: 16,96 / 19,81. La classifica non cambia: m1 resta davanti.

**4. Riga intera e γ=0,5: confermati** (m1 li usa). Il **denoising voti** è isolato in f5.
I **token pg: neutri o lievemente negativi** (f3 16,4 con pg vs f4 16,3 senza, ma entrambi sotto
m1 a 16,9: l'effetto è dentro il rumore).

**5. Senza trama: verifica e dati veri.** Il 70,6% dei film senza sinossi ha <50 voti (82% delle
serie), il 96,4% <200; le eccezioni buone esistono ma sono 811 film con ≥200 voti e 120 con ≥500.
Nessuna sinossi in altre lingue nei Parquet (`ita` è un booleano, non una traduzione). **La sinossi
però esiste su TMDB**: `fetch_overview.py` ha recuperato **30.157 sinossi vere** (99,3% delle
mancanti, tutte en-US) in ~16 min; `embed_trama.py` le ha embeddate e la copertura è passata da
**35.891 a 66.048 (54,2% → 99,7%)** in 434 s. Effetto sul metrico: **nessuno** (f4 16,3 vs m1
16,9; lo strato senza trama resta ~0,10). Le sinossi recuperate sono di titoli oscuri e poco
informative: la pseudo-trama generata sarebbe stata lo stesso tempo buttato, come dicevi.

**6. Tetto 20-25%: coerente.** m1 16,9%, teacher 17,3%, bolla oracolo 32,3%, kNN 11,0%.

**Learning curve**: non satura. 25 epoche 16,9% → 50 epoche 17,8% → **100 epoche 20,7%**
(train 27,7% → 42,9% → 52,1%, ancora in salita). Il +2,9 del secondo raddoppio è più del +0,9 del
primo: con T_max=100 il learning rate resta alto più a lungo e la convergenza è migliore. Il test
non è piatto fino a 100 epoche; poi la coda a lr basso (lc150) dà solo +0,2: **il plateau è a
~100 epoche, train ~52%, test ~21%**. Il tetto della tabella libera (65,7%) lascia 13 punti di
train che l'encoder non riesce a prendere: sono informazione, non addestramento. Effetto collaterale importante:
lo strato **film senza trama** passa da 9,7% a **15,0%** e i film low-vote da 9,5% a **13,3%** —
le sinossi vere recuperate da TMDB servono, ma solo con addestramento lungo. Teacher ripulito:
lc100 **21,09% recall / 25,02 NDCG@20** (m1 17,34/20,61). L'artefatto è da `lc150`.

**Conclusione**: nessuna delle leve "architetturali" del senior ha battuto m1. Il divario con la
tabella libera (65,7% train) resta informazione, non capacità: le feature non contengono la
posizione comportamentale del titolo. L'artefatto resta m1 (512-d).

---

## 13. Ensemble: 20,9% → 24,5% (22/10, notte)

I singoli modelli sono saturi, ma i loro errori sono diversi. La fusione tardiva (somma pesata
delle similarita') di modelli gia' addestrati, senza un solo secondo di training:

| ensemble | pesi | own | quartiere | recall@20 |
|---|---|---:|---:|---:|
| lc150 | — | 27,8% | 45,4% | 20,9% |
| lc150 + t1 | 2:1 | — | — | 22,6% |
| lc150 + t1 + a10 | 3:1:1 | 30,4% | 48,6% | 22,7% |
| **lc150 + lc150s + t1 + a10** | **3:3:1:1** | **31,6%** | **50,7%** | **24,5%** |

`lc150s` e' lo stesso modello con seed 7: la diversita' dei **seed** vale quanto quella
architetturale (+1,7). RRF peggiore della fusione lineare (19-20%). CSLS inutile (20,9%).

La fusione lineare e' **un solo vettore**: concatenando i blocchi con peso `sqrt(w)` e
rinormalizzando, il coseno e' la somma pesata dei coseni. L'artefatto `spazio-denso-ensemble.npz`
e' 66.259 x 1536 (512+512+256+256); per un titolo nuovo servono i quattro encoder.

Prossimo passo ovvio: un terzo seed (45 min), atteso +0,6-1,0.

## 14. Trame in inglese e gate per film: due risultati negativi (ticket 17)

### 14.1 Trame EN: peggiora tutto

Sono state scaricate **66.014 sinossi en-US** (19,6 min, `overview-en.parquet`) e ri-embeddate
tutte le 66.049 trame (826 s). Confronto a parita' di keyword e di formula (λ=0,5):

| | grafo (@20) | curato @10 (calde/fredde) | curato @50 |
|---|---:|---:|---:|
| trame miste (IT+EN) | **12,8%** | **10,1% / 10,8%** | 18,2% / 26,3% |
| trame EN | 10,3% | 7,8% / 9,5% | 17,3% / 22,6% |

Il calo non e' un problema di scala: il coseno casuale medio sale da **0,298 a 0,328** (spazio
piu' compresso), e la whiten (512 o 1024 componenti) non recupera (curato @10 7,8-8,4, grafo
9,4-10,1). Le sinossi sono traduzioni dirette (stesso contenuto, EN piu' lunghe: 283 vs 223
caratteri): il problema e' la **geometria dell'embedding inglese** di qwen3-0.6B, piu' isotropa.

La frontiera di b2 ricalcolata sui blocchi EN crolla:

| wm | grafo | curato @10 | (blocchi misti: grafo / curato @10) |
|---:|---:|---:|---|
| 0,20 | 11,1% | 8,6 / 9,2 | 14,0% / 10,4 / 11,3 |
| 0,35 | 12,8% | 8,1 / 9,5 | 15,7% / 10,1 / 11,6 |
| 0,50 | 14,4% | 7,8 / 8,5 | 16,8% / 8,6 / 10,2 |
| 0,70 | 15,2% | 6,1 / 8,2 | 17,1% / 7,8 / 9,0 |

**Conclusione**: per questi due KPI le trame miste sono migliori delle EN. I blocchi sono stati
ripristinati (`trama-qwen3b.npy` originale; copie EN conservate come `*.bak.npy`). Il dato EN
resta in `overview-en.parquet` per la pipeline notturna, ma il grafo non lo usa.

### 14.2 Gate per film: collassa sul meta

b3 (gate a 3 pesi per film, inizializzato 0,8/0,57/0,5, penalita' di entropia 0,01, 100 epoche)
e' stato addestrato sui blocchi EN. Esito:

- gate medio **(0,25 / 0,15 / 0,60)** → massa ≈ **81% meta**, 14% trama, 5% keyword;
- deviazione standard per film 0,11 / 0,08 / 0,08: il gate **si differenzia**, ma la media e'
  tutta sul meta;
- grafo **14,6%**, curato @10 **5,5 / 9,0** — peggio di b2 a qualunque wm.

Il gate funziona come meccanismo (i pesi variano per film) ma **non** come rimedio: lasciato
libero, il modello sceglie il blocco addestrabile (il meta), che e' la via di minor resistenza
per il target. E' la conferma empirica dell'intuizione «il grafo pesa troppo»: non e' un problema
di peso globale, e' che il meta e' **troppo espressivo** rispetto ai blocchi fissi.

Per riprovare il gate servirebbe un'**ancora** (KL verso i pesi iniziali) o un meta piu' piccolo;
su questi numeri non vale il tempo: la frontiera globale resta migliore.

### 14.3 Stato finale

La frontiera di b2 sui blocchi originali e' confermata (tabella sopra): il punto similarita'-prima
resta **wm=0,35** (grafo 15,7%, curato 10,1/11,6), il punto bilanciato **wm=0,5** (grafo 16,8%,
curato 8,6/10,2). Nessun modello nuovo batte b2. Restano aperti: (a) testare trame **it-IT** per
tutte (il misto batte l'EN, l'IT pieno non e' stato provato); (b) gate con ancora, se si vuole
insistere sull'idea.
