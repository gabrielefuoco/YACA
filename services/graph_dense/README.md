# graph_dense — il grafo V10 in uno spazio denso

Modulo **nuovo** (21/10/2026): non scrive in `services/graph/`. Gli artefatti V10 sono copiati
read-only in `data/graph/`; i risultati stanno in `data/` (gitignored). Il vecchio modulo resta
intatto e le sue misure restano la verità sul grafo.

## Cosa c'è

| file | cosa fa |
|---|---|
| `config.py` | iperparametri e percorsi, un posto solo |
| `data.py` | canone, triangolo, feature TF-IDF V3 + cluster L1-L3 + strutturali, trama, Parquet |
| `teacher.py` | matrice top-25 con `log1p(w)·supporto` e floor row-adaptive (5% del max trasformato) |
| `split.py` | split cold-start (600+600+low-vote) e baseline `collocator.py` V1/V3 |
| `model.py` / `train_a1.py` | studente gated con `EmbeddingBag`, loss InfoNCE + SVD + bolla |
| `keywords.py` | 6.125 keyword bge → centroidi di cluster L1/L2/L3 e keyword del film (`kw-set.npz`) |
| `train_a5.py` | A5/A7: set di token keyword + `SetPool` (PMA), gate a 3 vie, negativi opzionali |
| `train_a6.py` | A6: softmax pieno multi-positivo con memory bank (esperimento negativo) |
| `eval.py` | bolla/quartiere e recall@20 contro gli archi completi |
| `embed_trama.py` | embedding qwen3 in background, checkpoint ogni 500, ripartibile |
| `artefatto.py` | `spazio-denso-v10.npz` con le impronte |

## Risultato (trama qwen3 inclusa)

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
| A8 feature nuove (collection, writers, lingua, rating) | 20,2% | 38,7% | 13,0% |
| A10 A8 + target intera riga del grafo | 21,9% | 40,7% | 15,2% |
| A12 A10, γ=0,5 | 22,1% | 41,2% | 15,2% |
| **m1 memorizzazione (512-d, bank aggiornata) — artefatto** | **24,9%** | **41,9%** | **16,9%** |
| t1 transformer sui token | 22,9% | 41,2% | 16,3% |

**La conclusione è negativa e va detta**: lo spazio denso costruito così **non sostituisce il
collocatore** sulla collocazione in bolla; lo migliora di poco rispetto ad A0 (15,1 → 17,6) ma resta
molto sotto V1 (78,6). Il collocatore TF-IDF ha centroids ad alta dimensionalità che il collo di
bottiglia a 256-d perde. Lo spazio può servire per **retrieval/re-ranking** e come feature, non come
classificatore di bolla. La trama è arrivata (35.891, 864 s su RTX 3060) e ha aggiunto +1,8 punti; un teacher migliore
(node2vec/LightGCN) è il prossimo passo; il prototipo della testa bolla non è stato usato nella valutazione (si usano i
centroidi di `Z`, che è la via del prodotto).

## Comandi

```bash
# dalla radice della repo, con il venv offline
python -m services.graph_dense.run stato       # canone, bolle, archi
python -m services.graph_dense.run teacher     # matrice teacher + stats
python -m services.graph_dense.run split       # split + collocatore V1/V3
python -m services.graph_dense.run a0          # baseline SVD+Ridge
python -m services.graph_dense.run a1          # studente gated (richiede a0-test.npz)
python -m services.graph_dense.run artefatto   # spazio-denso-v10.npz
python -m services.graph_dense.keywords        # kw-set.npz (bge, ~25 s su GPU)
python -m services.graph_dense.train_a5 --tok film --svd 0 --nome a7
python -m services.graph_dense.train_a5 --tok cluster --nome a5
python -m services.graph_dense.train_a6 --nome a6
# il modello dell'artefatto: feature nuove + riga intera del grafo, gamma 0.5
python -m services.graph_dense.train_a6 --kw 0 --extra 1 --soft 1 --gamma 0.5 --nome a12
# il modello dell'artefatto: memorizzazione (512-d, fdrop 0, bank aggiornata a ogni passo)
python -m services.graph_dense.train_a6 --dim 512 --drop 0.05 --fdrop 0 --bank-update 1        --bolla 0 --soft 1 --gamma 0.5 --extra 1 --nome m1
python -m services.graph_dense.train_t1 --epoche 25 --drop 0.05 --fdrop 0 --bank-update 1        --bolla 0 --gamma 0.5 --extra 1 --nome t1
python -m services.graph_dense.artefatto --nome m1
python -m services.graph_dense.run all         # tutto in fila
# trama in background (checkpoint ogni 500):
nohup python -m services.graph_dense.embed_trama > services/graph_dense/data/embed.log 2>&1 &
```

Il job della trama è in `data/embed.log`; `data/trama-state.json` dice quante ne ha fatte; i file
`data/trama-qwen3b.npy` + `-idx` sono atomici (si salvano ogni 500). Con la GPU basta che
`torch.cuda.is_available()` sia vero: il device è scelto all'avvio.

## Interfaccia dell'artefatto

`spazio-denso-v10.npz`:

| campo | senso |
|---|---|
| `Z` | (66.259, 256) `float16`, righe del canone, L2-normalizzate e centrate per medium |
| `mu` | (2, 256) medie di centratura (film, serie) — per un titolo nuovo |
| `proto` | (2.922, 256) prototipi della testa bolla (A1) |
| `dim` | 256 |
| `partizione_sha`, `triangolo_sha` | gli artefatti V10 su cui è costruito |
| `tfidf_sha`, `vocab_sha`, `keyword_sha` | le feature |
| `trama_sha` | l'embedding qwen3 (vuoto finché il job non finisce) |
| `teacher_sha`, `split_sha`, `ricetta_sha` | il teacher, lo split, gli iperparametri |

**Titoli esistenti**: `Z[i]` è già pronto; il coseno è il prodotto scalare.
**Titolo nuovo**: `data.features` sulla sua riga + `data.plot_embedding` (qwen3) → `model.state_dict`
(`a1-model.pt`) → sottrarre `mu[is_tv]` → L2. I centroidi densi delle bolle sono la media di `Z` sui
membri di training, normalizzata; la regola voti/medium è quella di `collocator.py`.
**Attenzione**: le impronte vanno verificate prima di servire; un `Z` costruito su una partizione
diversa è sbagliato in silenzio, come nel vecchio modulo.

## Le keyword e il soffitto (22/10)

Il multi-vettore delle keyword **non sposta il recall** (12,4-12,6% contro 12,7%): i cluster
L1/L2/L3 sono già dentro `X_meta`, e la co-visione non premia i sinonimi. Cambia però il carattere
del vicinato: più semantico, meno franchise (meglio in 13 titoli su 30 letti a occhio).
Il teacher SVD ha recall@20 0,07%: non è un soffitto. Il **collocatore è leaky** (centroidi con il
titolo di test dentro: nearest-centroid onesto 18,6%, con il test 40,9%), quindi l'ibrido al 28,5%
è ritirato. Le leve che funzionano sono due, entrambe legittime: **feature nuove** (A8: collection,
writers, lingua, rating) e **target pieno** (A10/A12: la riga intera del triangolo, 13,2M archi,
non i top-25). Il risultato onesto è **15,2% di recall / 22,1% own**, contro un kNN sul TF-IDF
grezzo di 11,0%. Il 50% non è raggiungibile con i metadati: il top-20 del grafo è comportamento.
Dettagli nel report `.scratch/distillazione-grafo/report-modulo.md` §10-11 e nei ticket 13-15.
La diagnosi finale: la tabella libera rifà il 63,5% del top-20 sui dati di training, l'encoder si
ferma al 31% — il collo di bottiglia è il passaggio feature → vettore, non la loss né lo spazio.

## Cosa non è

- Non è il prodotto: `src/` non è toccato; l'integrazione in `collocator.py`/`uscite.py` è una
  decisione a valle, non presa qui.
- Non è una sostituzione del collocatore: il primo giro dice il contrario.
- Non è la camminata: il top-16/20/25 della camminata resta una domanda separata.
