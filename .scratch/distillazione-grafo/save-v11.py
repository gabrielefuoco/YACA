"""Salva il triangolo V11 = V10 + archi rrf (0.6*cos)."""
import numpy as np, scipy.sparse as sp
from services.graph_dense import config as C, data as D
B = D.basic(); N = B["N"]; is_tv = B["is_tv"]; coll = B["COLL"].astype(np.int64)
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
S10 = D.triangle().tocsr()
TOPK = 20; W = 0.6
rows, cols, vals = [], [], []
for st in range(0, N, 1024):
    blk = np.arange(st, min(st + 1024, N)); cos = Z[blk] @ Z.T
    for q, i in enumerate(blk):
        c = cos[q].copy(); c[i] = -1e9
        o = np.argsort(-c)[:TOPK * 2]; out, seen = [], []
        for x in o:
            cc = coll[x]
            if cc > 0 and cc in seen: continue
            out.append(x); seen.append(cc)
            if len(out) == TOPK: break
        rows += [i] * len(out); cols += out; vals += (W * c[out]).tolist()
R = sp.csr_matrix((vals, (rows, cols)), shape=(N, N), dtype=np.float32)
S11 = (S10 + R).tocsr(); S11.setdiag(0); S11.eliminate_zeros()
S11 = ((S11 + S11.T) * 0.5).tocsr(); S11.eliminate_zeros()
out = C.SRC / "bolle-eterogeneo-V11-p1.0-triangolo.npz"
np.savez_compressed(out, indptr=S11.indptr, indices=S11.indices, data=S11.data)
print("scritto", out, "· archi", S11.nnz, "· V10", S10.nnz, "· rrf", R.nnz)
