"""
.scratch/ml-collaborativo/reconcile-svd.py

RICONCILIAZIONE dei due script che danno lo spazio bersaglio diverso:
  build-film-graph.py -> coseno del vettore medio coi bersagli = 0,224
  probe4-features.py  -> 0,056

Stessa matrice in un solo processo, tre varianti del peso anti-popolare e due insiemi
di item, per isolare la causa. La misura di controllo e' il coseno del VETTORE MEDIO
con gli item: se lo spazio e' sano e' alto (la direzione comune), se e' rumoroso crolla.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/reconcile-svd.py
"""
import json
import pathlib

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.sparse.linalg import svds

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / ".cache" / "movielens" / "ml-32m"
PQ = ROOT / ".cache" / "tmdb"
EMB_DIM = 64

def log(m): print(m, flush=True)

links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"])
links["tmdbId"] = links["tmdbId"].astype("int64"); links["movieId"] = links["movieId"].astype("int64")
movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))

mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "keywords"])
mv = mv.dropna(subset=["keywords"])
mv = mv[mv["keywords"].map(lambda s: len(json.loads(s)) > 0)]
our_movie_ids = set(int(x) for x in mv["id"])

log("carico i voti una volta sola (32M righe)...")
ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")

def build_and_check(label, item_ids, weight_mode):
    mids = sorted(item_ids)
    mid_pos = {m: i for i, m in enumerate(mids)}
    r = ratings[ratings["movieId"].isin(mid_pos)].copy()
    r["i"] = r["movieId"].map(mid_pos).astype("int32")
    X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                          shape=(int(r["userId"].max()) + 1, len(mids)))
    X.sum_duplicates(); X.data[:] = 1.0
    n_item = np.asarray(X.sum(axis=0)).ravel()
    zeros = int((n_item == 0).sum())
    if weight_mode == "inf":            # come build-film-graph.py
        w = 1.0 / np.log1p(n_item)
    elif weight_mode == "max1":         # come probe4-features.py
        w = 1.0 / np.log1p(np.maximum(n_item, 1))
    else:                               # nessun peso
        w = np.ones_like(n_item)
    Xw = X.multiply(w[None, :]).tocsr()
    bad = int((~np.isfinite(Xw.data)).sum())
    U, S, Vt = svds(Xw, k=min(EMB_DIM, min(Xw.shape) - 1))
    Z = Vt.T
    Z = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
    mean = Z.mean(axis=0)
    cos_mean = float((Z @ (mean / (np.linalg.norm(mean) + 1e-9))).mean())
    cos_pair = float(np.mean([float(Z[i] @ Z[j]) for i, j in zip(range(0, min(2000, len(Z) - 1)), range(1, min(2000, len(Z))) )]))
    log(f"  {label:<44} item {len(mids):>6,} · colonne vuote {zeros:>5} · pesi non finiti {bad:>6} · "
        f"varianza 1ª comp. {100*(S[-1]**2)/(S**2).sum():5.1f}% · **cos medio {cos_mean:.3f}** · cos fra item {cos_pair:.3f}")
    return cos_mean

# gli item del teacher come li sceglie build-film-graph.py: film del pool (>=20 voti) + quelli visti
counts = ratings[ratings["movieId"].isin(movieid_by_tmdb.values())].groupby("movieId").size()
pool = [m for m, c in counts.items() if c >= 20]
pool_ours = [int(t) for t, m in movieid_by_tmdb.items() if m in set(pool)]
log(f"\nfilm con >=20 voti MovieLens mappati sul nostro catalogo: {len(pool_ours):,}")
log(f"film con >=20 voti E con keyword: {len(set(pool_ours) & our_movie_ids):,}")

log("\n=== varianti ===")
build_and_check("TUTTI i coperti (>=20 voti), peso inf", pool_ours, "inf")
build_and_check("TUTTI i coperti (>=20 voti), peso max(1)", pool_ours, "max1")
build_and_check("SOLO con keyword, peso inf", sorted(set(pool_ours) & our_movie_ids), "inf")
build_and_check("SOLO con keyword, peso max(1)", sorted(set(pool_ours) & our_movie_ids), "max1")
build_and_check("SOLO con keyword, SENZA peso", sorted(set(pool_ours) & our_movie_ids), "none")
