"""
.scratch/ml-collaborativo/build-teacher-heldout.py

IL TEACHER SENZA GLI UTENTI DI VALUTAZIONE.

Il teacher attuale e' costruito con tutti i 200.948 utenti MovieLens: i 200 utenti del test set
sarebbero dentro lo spazio denso che li valuta. Qui si escludono (testset-users.json) e si
riscrive lo spazio con lo STESSO metodo (SVD pesata anti-popolare, 64 dimensioni, stessa soglia).

Output: .cache/movielens/teacher-Z-heldout.npz
Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/build-teacher-heldout.py
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
OUT = ROOT / ".cache" / "movielens" / "teacher-Z-heldout.npz"
EXCLUDE = ROOT / ".cache" / "movielens" / "testset-users.json"
EMB_DIM = 64

def log(m): print(m, flush=True)

eval_users = set(int(u) for u in json.loads(EXCLUDE.read_text())["eval_users"])
log(f"utenti di valutazione da escludere: {len(eval_users):,}")

links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
movieid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "keywords"])
mv = mv[mv["keywords"].map(lambda s: isinstance(s, str) and len(json.loads(s)) > 0)]
covered = sorted(set(movieid_by_tmdb[int(x)] for x in mv["id"] if int(x) in movieid_by_tmdb))
mid_pos = {m: i for i, m in enumerate(covered)}
log(f"film con teacher (stesso insieme di prima): {len(covered):,}")

ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
log(f"voti totali: {len(ratings):,}")
ratings = ratings[~ratings["userId"].isin(eval_users)]
log(f"voti dopo l'esclusione: {len(ratings):,} ({100*len(ratings)/31500000:.1f}% del totale) · utenti rimasti: {ratings['userId'].nunique():,}")
ratings = ratings[ratings["movieId"].isin(mid_pos)]

r = ratings.copy()
r["i"] = r["movieId"].map(mid_pos).astype("int32")
X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                      shape=(int(r["userId"].max()) + 1, len(covered)))
X.sum_duplicates(); X.data[:] = 1.0
n_item = np.asarray(X.sum(axis=0)).ravel()
Xw = X.multiply((1.0 / np.log1p(np.maximum(n_item, 1)))[None, :]).tocsr()
U, S, Vt = svds(Xw, k=EMB_DIM)
Z = Vt.T
Z = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
np.savez_compressed(OUT, Z=Z, mids=np.array(covered))
log(f"prima componente: {100*(S[-1]**2)/(S**2).sum():.1f}% di varianza (confronto: 39,5% col teacher intero)")
log(f"scritto {OUT.name}  {Z.shape}")
