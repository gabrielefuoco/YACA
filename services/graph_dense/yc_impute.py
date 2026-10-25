"""Imputazione a 1 hop della co-visione (solo per il TARGET, mai per i centroidi).

Ŷc[missing] = A[missing, raw] · Yc[raw], con A = righe normalizzate del grafo V10.
Un titolo scoperto non ha un proprio Yc da far trapelare, quindi il LOO sui centroidi
resta pulito: i centroidi usano solo `Yc` grezza (vedi centroids.py).

Uso: py -m services.graph_dense.yc_impute
Output: data/yc-full.npz  (Yc_full (N,64) float32, raw (N,) bool, imp (N,) bool)
"""
from __future__ import annotations

import numpy as np

from . import config as C
from . import data as D


def build():
    B = D.basic()
    N = B["N"]
    Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
    norm = np.linalg.norm(Yc, axis=1)
    raw = norm > 1e-6
    Yc[raw] /= norm[raw, None]
    miss = ~raw
    S = D.masked_yc_and_graph()
    Yfull = Yc.copy()
    if miss.any():
        A = S[miss][:, raw].astype(np.float32)          # (n_miss, n_raw)
        rs = np.asarray(A.sum(1)).ravel()
        A = A.multiply((1.0 / np.maximum(rs, 1e-9))[:, None]).tocsr()   # righe a somma 1
        Yfull[miss] = np.asarray(A @ Yc[raw], dtype=np.float32)
        n = np.linalg.norm(Yfull[miss], axis=1)
        ok = n > 1e-6
        Yfull[miss] = np.where(ok[:, None], Yfull[miss] / np.maximum(n, 1e-9)[:, None], 0.0)
    print(f"Yc: raw {int(raw.sum()):,} · imputati con vicini {int(((~raw) & (np.linalg.norm(Yfull, axis=1) > 1e-6)).sum()):,} "
          f"· ancora vuoti {int(((~raw) & (np.linalg.norm(Yfull, axis=1) <= 1e-6)).sum()):,}", flush=True)
    np.savez_compressed(C.DATA / "yc-full.npz", Yc_full=Yfull, raw=raw, imp=miss)
    print("scritto", C.DATA / "yc-full.npz")


if __name__ == "__main__":
    build()
