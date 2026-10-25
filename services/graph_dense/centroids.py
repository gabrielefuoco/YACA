"""Centroidi regista/collection con Leave-One-Out e shrinkage — solo Yc grezza.

Per il film i:
    mu_dir(i)  = ( sum_{j in D(d)\\{i}} Yc_j + m * mu0 ) / ( |D(d)\\{i}| + m )
    mu_coll(i) = ( sum_{j in C(c)\\{i}} Yc_j + m * mu0 ) / ( |C(c)\\{i}| + m )

- Solo film con Yc grezza (>0): niente leakage, né a 1 hop né a 2 hop.
- m = 3 (shrinkage verso il prior globale mu0).
- Per registi/collection con 1 solo film il risultato tende a mu0.

Uso: py -m services.graph_dense.centroids
Output: data/centroids.npz  (mu_dir (N,64), mu_coll (N,64), mu0 (64,), raw (N,))
"""
from __future__ import annotations

import numpy as np

from . import config as C
from . import data as D

M = 3.0


def _loo(Yc, raw, group, mu0, m=M):
    """Yc: (N,64) con zeri sui non-raw. group: (N,) interi (>=0). Ritorna (N,64)."""
    N = len(raw)
    valid = raw & (group > 0)
    g = np.where(valid, group, -1)
    ng = int(g.max()) + 1 if g.max() >= 0 else 0
    if ng == 0:
        return np.repeat(mu0[None], N, 0)
    sums = np.zeros((ng, Yc.shape[1]), np.float32)
    cnt = np.zeros(ng, np.float32)
    np.add.at(sums, g[valid], Yc[valid])
    np.add.at(cnt, g[valid], 1.0)
    gi = np.where(g >= 0, g, 0)
    num = sums[gi] - Yc            # toglie il film stesso (zero se non raw: non era nella somma)
    den = cnt[gi] - raw.astype(np.float32)
    out = (num + m * mu0[None]) / (den[:, None] + m)
    # righe senza gruppo: solo prior
    out[~valid] = mu0
    return out.astype(np.float32)


def build():
    B = D.basic()
    Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32)
    n = np.linalg.norm(Yc, axis=1)
    raw = n > 1e-6
    ycs = C.DATA / "yc-split.npz"
    if ycs.exists():
        raw[np.load(ycs)["A"]] = False   # Set A induttivo: fuori dai centroidi
    Yc[raw] /= n[raw, None]
    mu0 = Yc[raw].mean(0)
    mu_dir = _loo(Yc, raw, B["DIR"].astype(np.int64), mu0)
    mu_coll = _loo(Yc, raw, B["COLL"].astype(np.int64), mu0)
    n_dir = len(np.unique(B["DIR"][raw]))
    n_coll = len(np.unique(B["COLL"][raw]))
    print(f"centroidi: {n_dir:,} registi · {n_coll:,} collection · raw {int(raw.sum()):,}", flush=True)
    np.savez_compressed(C.DATA / "centroids.npz", mu_dir=mu_dir, mu_coll=mu_coll, mu0=mu0, raw=raw)
    print("scritto", C.DATA / "centroids.npz")


if __name__ == "__main__":
    build()
