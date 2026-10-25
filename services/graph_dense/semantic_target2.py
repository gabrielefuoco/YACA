"""Target semantico v2: candidati dall'unione di trama e keyword (non solo trama).

Il v1 prendeva i 100 candidati SOLO dalla trama; le keyword potevano solo riordinare. Cosi' un
film giusto per keyword ma non per trama (Inside Out -> Pixar) non entrava mai nel target.
Qui: top-100 trama UNIONE top-100 keyword (via la proiezione JL Bk, 512-d, veloce), poi
punteggio esatto `trama + lam * keyword` sui candidati e top-K. Output `sem-top25-union.npz`.

Uso: py -m services.graph_dense.semantic_target2 [--lam 1.0] [--cand 100]
"""
from __future__ import annotations

import argparse
import time

import numpy as np
import scipy.sparse as sp

from . import config as C
from . import data as D

K = 25


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--lam", type=float, default=1.0)
    ap.add_argument("--cand", type=int, default=100)
    a = ap.parse_args(argv)
    t0 = time.time()
    B = D.basic(); N = B["N"]
    Xp, hp, _ = D.plot_embedding(B)
    X = D.tfidf(); V = D.vocab()
    cols = [c for t, c in V.items() if t.startswith("kw:")]
    Xk = X[:, cols].tocsr()
    n = np.sqrt(np.asarray(Xk.multiply(Xk).sum(1)).ravel()) + 1e-9
    Xk = (sp.diags(1.0 / n) @ Xk).tocsr()
    Bk = np.load(C.DATA / "blocks.npz")["Bk"].astype(np.float32)  # JL del TF-IDF keyword
    print(f"trama {Xp.shape} · keyword {Xk.shape} · Bk {Bk.shape} · λ={a.lam} · "
          f"cand={a.cand}+{a.cand}", flush=True)

    import torch
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    Pt = torch.from_numpy(Xp).to(dev)
    Kt = torch.from_numpy(Bk).to(dev)
    idx = np.zeros((N, K), np.int32)
    w = np.zeros((N, K), np.float16)
    for st in range(0, N, 1024):
        rows = np.arange(st, min(st + 1024, N))
        Sp = Pt[rows] @ Pt.T
        Sp[torch.arange(len(rows)), torch.from_numpy(rows).to(dev)] = -1e4
        Sk = Kt[rows] @ Kt.T
        Sk[torch.arange(len(rows)), torch.from_numpy(rows).to(dev)] = -1e4
        _, ip = torch.topk(Sp, a.cand, dim=1)
        _, ik = torch.topk(Sk, a.cand, dim=1)
        ip = ip.cpu().numpy(); ik = ik.cpu().numpy()
        for r in range(len(rows)):
            i = int(rows[r])
            cand = np.unique(np.concatenate([ip[r], ik[r]]))
            cos_p = np.asarray((Xp[i:i + 1] @ Xp[cand].T)).ravel()
            cos_k = np.asarray((Xk[i] @ Xk[cand].T).todense()).ravel()
            comb = np.maximum(cos_p + a.lam * cos_k, 0.0)
            o = np.argsort(-comb)[:K]
            idx[i] = cand[o]
            w[i] = comb[o]
        if st % (1024 * 8) == 0:
            print(f"  {st:,}/{N:,} · t {time.time()-t0:.0f}s", flush=True)
    np.savez_compressed(C.DATA / "sem-top25-union.npz", idx=idx, w=w,
                        lam=np.array(a.lam), K=np.array(K))
    print(f"scritto sem-top25-union.npz · {N:,}x{K} · t {time.time()-t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
