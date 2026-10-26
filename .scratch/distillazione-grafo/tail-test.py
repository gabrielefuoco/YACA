"""Test sulla coda: film con pochi voti, grafo vs prodotto."""
import numpy as np
from services.graph_dense import config as C, data as D

B = D.basic(); N = B["N"]; ro = B["row_of"]; is_tv = B["is_tv"]; coll = B["COLL"].astype(np.int64)
VOT = B["VOT"]; date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32)
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32); Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
S = D.triangle()
def graph(i, k=6):
    row = S.getrow(i)
    if row.nnz == 0: return None
    g = np.zeros(N, np.float32); g[row.indices] = row.data; g[i] = -1e9
    return np.argsort(-g)[:k]
def product(i, k=6):
    cos = Z @ Z[i]; cos[i] = -1e9
    beh = Yc[i] @ Yc.T; beh[i] = -1e9
    if not is_tv[i] and date[i] > 0:
        near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120); beh[near] *= 0.2
    s = cos + 0.3 * beh; o = np.argsort(-s)[:60]
    out, seen = [], []
    for x in o:
        c = coll[x]
        if c > 0 and c in seen: continue
        out.append(x); seen.append(c)
        if len(out) == k: break
    return np.array(out)
# coda: film con VOT <= 30 e almeno una trama
idx = np.where((VOT <= 30) & (~is_tv))[0]
deg = np.asarray(S.sum(1)).ravel()
idx = idx[np.argsort(deg[idx])][:12]     # i 12 con meno archi
for i in idx:
    print(f"\n### {B['titoli'][int(i)]} ({int(np.where(date>0,(date/365.25).astype(int),0)[i])}) · voti {int(VOT[i])} · archi {int(deg[i])}")
    g = graph(i)
    print("  GRAFO : " + ("(nessun arco)" if g is None else " · ".join(B["titoli"][int(x)] for x in g)))
    print("  PROD  : " + " · ".join(B["titoli"][int(x)] for x in product(i)))
