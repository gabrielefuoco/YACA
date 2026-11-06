"""A4 — teacher LightGCN (2 layer) per il recall, non per la bolla.

La SVD del triangolo è globale; un LightGCN a 2 layer propaga sui vicini e cattura la struttura
locale. Lo studente è A1 (256-d + trama); si misura recall@20 contro gli archi completi tenuti
fuori, per strato, e si leggono i vicini veri (denso vs grafo).
"""
from __future__ import annotations

import json
import time

import numpy as np
import scipy.sparse as sp
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.linear_model import Ridge

from . import config as C
from . import data as D
from . import eval as E
from . import teacher as T


def main():
    t0 = time.time()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    B = D.basic(); S = D.triangle()
    sp_ = np.load(C.DATA / "split.npz"); split = {k: sp_[k] for k in sp_.files}
    hold = split["holdout"]
    keep = (~hold).astype(np.float32)
    S = (sp.diags(keep) @ S @ sp.diags(keep)).tocsr(); S.eliminate_zeros()
    tr = T.build(B, S, holdout_mask=hold, salva=False)
    # il teacher potato (1.6M) invece del triangolo pieno (12.6M): 8x meno lavoro per layer
    A = (tr["P"] + sp.eye(B["N"], format="csr")).tocsr()
    d = np.asarray(A.sum(1)).ravel(); dinv = 1.0 / np.sqrt(np.maximum(d, 1e-9))
    A = (sp.diags(dinv) @ A @ sp.diags(dinv)).tocsr().astype(np.float32)
    Acoo = A.tocoo()
    idx = torch.from_numpy(np.vstack([Acoo.row, Acoo.col]).astype(np.int64)).to(device)
    val = torch.from_numpy(Acoo.data.astype(np.float32)).to(device)
    A_t = torch.sparse_coo_tensor(idx, val, A.shape).coalesce()
    # archi positivi del teacher (una volta per arco)
    u = np.repeat(np.arange(B["N"]), (tr["nbr_idx"] >= 0).sum(1))
    v = tr["nbr_idx"][tr["nbr_idx"] >= 0]
    pos = np.column_stack([u, v]); rng = np.random.default_rng(C.SEED)
    print(f"archi BPR {len(pos):,} · A {A.nnz:,} · t {time.time()-t0:.0f}s", flush=True)
    emb = nn.Embedding(B["N"], 256).to(device)
    opt = torch.optim.Adam(emb.parameters(), lr=1e-3)
    def get_U():
        E0 = emb.weight
        E1 = torch.sparse.mm(A_t, E0)
        E2 = torch.sparse.mm(A_t, E1)
        U = (E0 + E1 + E2) / 3.0
        return F.normalize(U, p=2, dim=1)
    for ep in range(1, 51):
        emb.train(); perm = rng.permutation(len(pos)); tot = 0.0; nb = 0
        for st in range(0, len(perm), 8192):
            b = pos[perm[st:st + 8192]]
            ut = torch.from_numpy(b[:, 0]).to(device); vt = torch.from_numpy(b[:, 1]).to(device)
            jt = torch.randint(0, B["N"], (len(b),), device=device)
            U = get_U()
            s_pos = (U[ut] * U[vt]).sum(1); s_neg = (U[ut] * U[jt]).sum(1)
            loss = -F.logsigmoid(s_pos - s_neg).mean()
            opt.zero_grad(); loss.backward(); opt.step()
            tot += float(loss.item()); nb += 1
        if ep in (1, 5, 10, 20, 30, 40, 50):
            print(f"  ep {ep:2d}/50 loss {tot/max(nb,1):.4f} t {time.time()-t0:.0f}s", flush=True)
    emb.eval()
    with torch.no_grad():
        U = get_U().cpu().numpy()
    is_tv = B["is_tv"]; train = (~hold) & tr["has_teacher"]
    def center(Z):
        Q = Z.copy(); mu = np.zeros((2, Z.shape[1]), np.float32)
        for k, m in ((0, ~is_tv), (1, is_tv)):
            mu[k] = Z[train & m].mean(0); Q[m] -= mu[k]
        return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9), mu
    Uc, mu = center(U)
    X = D.features(B)
    ridge = Ridge(alpha=C.RIDGE_ALPHA, solver="lsqr", max_iter=100).fit(X[train], Uc[train])
    Z0 = ridge.predict(X).astype(np.float32); Z0 /= (np.linalg.norm(Z0, axis=1, keepdims=True) + 1e-9)
    np.savez_compressed(C.DATA / "a4-test.npz", Z=Z0.astype(np.float16), U=Uc.astype(np.float16),
                        mu=mu.astype(np.float16))
    rec, _ = E.recall_eval(Z0, B, split, S, 20)
    print(f"A4 Ridge recall@20 {rec['recall20']:.3f} · t {time.time()-t0:.0f}s", flush=True)
    import shutil
    shutil.copy(C.DATA / "a4-test.npz", C.DATA / "a0-test.npz")
    from . import train_a1
    train_a1.main()
    Z1 = np.load(C.DATA / "a1.npz")["Z"].astype(np.float32)
    seeds = [("Spider-Man (2002)", "movie:557"), ("Inkheart (2008)", "movie:2309"),
             ("Un ponte per Terabithia (2007)", "movie:1265"), ("Inception (2010)", "movie:27205"),
             ("Perfetti sconosciuti (2016)", "movie:381341"), ("Breaking Bad (2008)", "tv:1396")]
    for nome, key in seeds:
        i = B["row_of"][key]; row = S.getrow(i); o = np.argsort(-row.data)[:20]
        veri = [int(x) for x in row.indices[o]]
        cos = Z1[i] @ Z1.T; cos[i] = -np.inf; top = np.argpartition(-cos, 20)[:20]
        presi = [int(x) for x in top]
        com = len(set(veri) & set(presi))
        print("\n" + nome + ": overlap " + str(com) + "/20")
        print("  grafo :", " · ".join(B["titoli"][x] for x in veri))
        print("  denso :", " · ".join(B["titoli"][x] for x in presi))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
