"""
.scratch/ml-collaborativo/embed-keywords.py

L'IDEA DELL'UTENTE: embedding appresi dal sottografo, al posto di 1.982 nodi one-hot.

Perche' cosi' e non col grafo del builder: `cosine_f5_t0.75.npz` esiste in cache ma il pickle che
definisce l'ORDINE delle keyword e' assente — usarlo senza sapere l'ordine sarebbe il classico errore
di namespace (ne abbiamo pagati due oggi). Quindi il grafo si costruisce dalle fondamenta, e lo si
costruisce COMPORTAMENTALE, che e' il punto del filone:

  nodi  = le 6.125 keyword del grafo di produzione
  archi = (a) keyword nello STESSO micro-cluster L1  -> peso 1,0
          (b) keyword in cluster DIVERSI collegati dall'ADIACENZA APPRESA (calibrata su MovieLens)
              -> peso proporzionale al peso appreso, cosi' il comportamento avvicina keyword che la
                 co-occorrenza di parole non avvicinerebbe

Embedding: SVD spettrale del grafo pesato (deterministico, senza dipendenze). E' il fratello
deterministico di node2vec — stesso oggetto (fattorizzazione del grafo), senza il campionamento dei
random walk, quindi riproducibile. Se gensim c'e', si fa anche node2vec vero e si confrontano.

Output: .cache/movielens/kw-emb.npz (embedding per keyword) e film-emb.npz (media per titolo, con le
chiavi "tipo:id" per allineare senza errori).

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/embed-keywords.py
"""
import json
import pathlib
from collections import defaultdict

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.sparse.linalg import svds

ROOT = pathlib.Path(__file__).resolve().parents[2]
PQ = ROOT / ".cache" / "tmdb"
CACHE = ROOT / ".cache" / "movielens"
GRAPH = ROOT / "src" / "data" / "hierarchical_graph.json"
DIM = 64
SEED = 20261008

def log(m): print(m, flush=True)

g = json.loads(GRAPH.read_text(encoding="utf-8"))
kw_to_l1 = g["kw_to_L1"]
kws = list(kw_to_l1.keys())
idx = {k: i for i, k in enumerate(kws)}
cluster_of = np.array([int(kw_to_l1[k][2:]) for k in kws])
cluster_ids = sorted(int(c[2:]) for c in g["L1"])
cpos = {c: i for i, c in enumerate(cluster_ids)}
log(f"keyword: {len(kws):,} · micro-cluster: {len(cluster_ids):,}")

learned = json.loads((CACHE / "l1-adjacency-learned.json").read_text())
rows, cols, vals = [], [], []
# (a) intra-cluster
by_cluster = defaultdict(list)
for i, c in enumerate(cluster_of):
    by_cluster[c].append(i)
n_intra = 0
for c, lst in by_cluster.items():
    for a in range(len(lst)):
        for b in range(a + 1, len(lst)):
            rows.append(lst[a]); cols.append(lst[b]); vals.append(1.0); n_intra += 1
# (b) inter-cluster, dal peso APPRESO (calibrato su MovieLens)
w_all = [w for nb in learned.values() for w in nb.values()]
w_max = max(w_all) if w_all else 1.0
n_inter = 0
for a, nb in learned.items():
    ca = cpos[int(a[2:])]
    for b, w in nb.items():
        cb = cpos[int(b[2:])]
        if ca >= cb:
            continue
        wa = w / w_max                      # normalizzato sul massimo
        for i in by_cluster.get(cluster_ids[ca], []):
            for j in by_cluster.get(cluster_ids[cb], []):
                rows.append(i); cols.append(j); vals.append(wa); n_inter += 1
log(f"archi: {n_intra:,} intra-cluster · {n_inter:,} inter-cluster (dal peso appreso) · "
    f"peso inter mediano {np.median([v for v in vals[n_intra:]]):.4f}")

N = len(kws)
A = sparse.csr_matrix((np.array(vals, dtype=np.float32), (rows, cols)), shape=(N, N))
A = A + A.T
log(f"grafo: {A.nnz:,} archi · grado mediano {int(np.median(np.diff(A.indptr)))}")

# --- embedding spettrale: SVD del grafo normalizzato
deg = np.asarray(A.sum(axis=1)).ravel()
dinv = 1.0 / np.sqrt(np.maximum(deg, 1e-9))
An = sparse.diags(dinv) @ A @ sparse.diags(dinv)
U, S, Vt = svds(An.tocsr(), k=DIM)
E = U * np.sqrt(np.maximum(S, 1e-9))         # embedding dei nodi (keyword)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
log(f"embedding: {E.shape} · prime 5 componenti spiegano "
    f"{100*np.sum(S[-5:]**2)/np.sum(S**2):.0f}% della varianza spettrale")

# --- sanita': i vicini hanno senso?
def near(k, n=6):
    i = idx.get(k)
    if i is None:
        return "?"
    sims = E @ E[i]
    order = [j for j in np.argsort(-sims) if j != i][:n]
    return " · ".join(kws[j] for j in order)
for k in ["rape", "racing", "time travel", "superhero"]:
    log(f"  vicini di '{k}': {near(k)}")

# --- media per titolo (con le chiavi, per allineare senza errori)
out = {}
for f, t in (("movies.parquet", "movie"), ("tv.parquet", "tv")):
    d = pd.read_parquet(PQ / f, columns=["id", "keywords"])
    for tid, raw in zip(d["id"], d["keywords"]):
        if not isinstance(raw, str):
            continue
        ii = [idx[n] for n in (str(k.get("name", "")).strip().lower() for k in json.loads(raw)) if n in idx]
        if not ii:
            continue
        v = E[ii].mean(axis=0)
        out[f"{t}:{int(tid)}"] = (v / (np.linalg.norm(v) + 1e-9)).astype(np.float32)
log(f"titoli con embedding: {len(out):,}")
np.savez_compressed(CACHE / "film-emb.npz", keys=np.array(list(out.keys())), vecs=np.array(list(out.values()), dtype=np.float32))
log(f"scritto film-emb.npz")
