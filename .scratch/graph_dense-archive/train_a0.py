"""A0: SVD-256 del teacher + Ridge sui metadati (baseline lineare)."""
from __future__ import annotations

import json
import time

import numpy as np
import scipy.sparse as sp
from sklearn.decomposition import TruncatedSVD
from sklearn.linear_model import Ridge

from . import config as C
from . import data as D
from . import eval as E
from . import teacher as T


def main():
    t0 = time.time()
    B = D.basic(); S = D.triangle()
    sp_ = np.load(C.DATA / "split.npz")
    split = {k: sp_[k] for k in sp_.files}
    hold, is_tv = split["holdout"], B["is_tv"]
    tr = T.build(B, S, holdout_mask=hold, salva=False)
    svd = TruncatedSVD(n_components=C.DIM, algorithm="randomized", n_iter=5, random_state=C.SEED)
    U = svd.fit_transform(tr["P_sym"]).astype(np.float32)
    X = D.features(B)
    Xp, hp, _ = D.plot_embedding(B)
    if Xp is not None:
        X = sp.hstack([X, sp.csr_matrix(Xp * 0.5)], format="csr", dtype=np.float32)
        print(f"trama: {int(hp.sum()):,} · {Xp.shape[1]}-d", flush=True)
    train = (~hold) & tr["has_teacher"]
    def center(Z):
        Q = Z.copy(); mu = np.zeros((2, Z.shape[1]), np.float32)
        for k, m in ((0, ~is_tv), (1, is_tv)):
            mu[k] = Z[train & m].mean(0); Q[m] -= mu[k]
        return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9), mu
    Uc, mu = center(U)
    ridge = Ridge(alpha=C.RIDGE_ALPHA, solver="lsqr", max_iter=100).fit(X[train], Uc[train])
    Z = ridge.predict(X).astype(np.float32)
    Z /= (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
    np.savez_compressed(C.DATA / "a0-test.npz", Z=Z.astype(np.float16), U=Uc.astype(np.float16),
                        mu=mu.astype(np.float16))
    vic = D.mappa(B)
    bub, _, _ = E.bubble_eval(Z, B, split, vic)
    rec, _ = E.recall_eval(Z, B, split, S, 20)
    coll = json.load(open(C.DATA / "collocator.json"))
    E.salva("a0-metrics", bub, coll, rec, extra={"tempo_s": time.time() - t0})
    print("A0 bolla own %.3f quartiere %.3f · recall@20 %.3f · %.1fs" %
          (bub["own"], bub["quartiere"], rec["recall20"], time.time() - t0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
