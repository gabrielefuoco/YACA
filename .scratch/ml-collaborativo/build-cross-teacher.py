"""build-cross-teacher.py — lo spazio del teacher cross-medium.
Adiacenza dal dataset curato -> SPPMI -> SVD(256). Chiavi nello STESSO ordine di spazi-trakt.npz,
cosi' le righe si allineano direttamente. NON centro per medium: lo scopo e' attraversare i medium."""
import json, pathlib, os
import numpy as np
from scipy.sparse import coo_matrix
from sklearn.decomposition import TruncatedSVD
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
G = ROOT/".scratch"/"ml-collaborativo"/"gold"
DIMS = int(os.environ.get("DIMS", 256))
SHIFT = float(os.environ.get("SHIFT", 10.0))
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
keys = [f"{t}:{int(i)}" for t, i in zip(z["tipo"], z["tmdb"])]
row_of = {k: r for r, k in enumerate(keys)}; n = len(keys)
d = json.loads((G/os.environ.get("CROSS", "cross-merged.json")).read_text(encoding="utf-8"))
r_, c_, v_ = [], [], []
narchi = 0
for s in d["sources"]:
    a = row_of.get(s["id"])
    if a is None: continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None: continue
        w = float(l.get("w", 1))
        r_ += [a, b]; c_ += [b, a]; v_ += [w, w]; narchi += 1
A = coo_matrix((v_, (r_, c_)), shape=(n, n)).tocsr(); A.sum_duplicates()
print(f"adiacenza: {narchi} legami su {int((A.getnnz(1)>0).sum()):,} titoli coinvolti")
tot = A.sum()
rs = np.asarray(A.sum(1)).ravel(); cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.log((Co.data * tot) / (rs[Co.row] * cs[Co.col] + 1e-9) + 1e-9)
pmi = np.maximum(pmi - np.log(SHIFT), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
svd = TruncatedSVD(n_components=DIMS, random_state=0)
E = svd.fit_transform(P).astype(np.float32)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
print(f"coordinate: {E.shape} · varianza {svd.explained_variance_ratio_.sum():.2f} · non-zero righe {int((np.abs(E).sum(1)>0).sum()):,}")
np.savez_compressed(ML/"cross-teacher.npz", E=E, keys=np.array(keys))
print(f"scritto: {ML/'cross-teacher.npz'}")
