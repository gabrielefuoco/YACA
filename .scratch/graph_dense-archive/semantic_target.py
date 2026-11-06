"""Costruisce il target semantico: top-K vicini per trama + 0,5 * keyword.

Per ogni titolo: si prendono i 100 vicini di trama (GPU, veloce), si riordina quel sottoinsieme
con il coseno delle keyword (λ=0,5) e si tengono i primi K. Output `data/sem-top25.npz`:
`idx` (N,K) int32, `w` (N,K) float16 (similarita' combinata, >=0), `lam`, `K`.
"""
from __future__ import annotations

import time

import numpy as np
import scipy.sparse as sp

from . import config as C
from . import data as D

K = 25
LAM = 0.5
CAND = 100
CHUNK = 1024


def main():
    t0 = time.time()
    B = D.basic(); N = B["N"]
    Xp, hp, _ = D.plot_embedding(B)
    X = D.tfidf(); V = D.vocab()
    cols = [c for t, c in V.items() if t.startswith("kw:")]
    Xk = X[:, cols].tocsr()
    n = np.sqrt(np.asarray(Xk.multiply(Xk).sum(1)).ravel()) + 1e-9
    Xk = sp.diags(1.0 / n) @ Xk
    Xk = Xk.tocsr()
    print(f"trama {Xp.shape} · keyword {Xk.shape} · λ={LAM}", flush=True)

    import torch
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    Pt = torch.from_numpy(Xp).to(dev)
    idx = np.zeros((N, K), np.int32)
    w = np.zeros((N, K), np.float16)
    for st in range(0, N, CHUNK):
        rows = np.arange(st, min(st + CHUNK, N))
        S = Pt[rows] @ Pt.T
        S[torch.arange(len(rows)), torch.from_numpy(rows).to(dev)] = -1e4
        sc, ii = torch.topk(S, CAND, dim=1)
        sc = sc.float().cpu().numpy(); ii = ii.cpu().numpy()
        for r in range(len(rows)):
            kw = np.asarray((Xk[rows[r]] @ Xk[ii[r]].T).todense()).ravel()
            comb = np.maximum(sc[r] + LAM * kw, 0.0)
            o = np.argsort(-comb)[:K]
            idx[rows[r]] = ii[r][o]
            w[rows[r]] = comb[o]
        if st % (CHUNK * 8) == 0:
            print(f"  {st:,}/{N:,} · t {time.time()-t0:.0f}s", flush=True)
    np.savez_compressed(C.DATA / "sem-top25.npz", idx=idx, w=w,
                        lam=np.array(LAM), K=np.array(K))
    print(f"scritto sem-top25.npz · {N:,}x{K} · t {time.time()-t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
