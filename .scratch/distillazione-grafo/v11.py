"""Grafo V11 = archi V10 (comportamento, peso 1.0) + archi rrf (contenuto, peso 0.6*cos).
Test: vicini del V11 vs V10 vs prodotto su 20 film + 10 di coda."""
import numpy as np, scipy.sparse as sp
from services.graph_dense import config as C, data as D

B = D.basic(); N = B["N"]; ro = B["row_of"]; is_tv = B["is_tv"]; coll = B["COLL"].astype(np.int64)
date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32)
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32); Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
S10 = D.triangle().tocsr()
VOT = B["VOT"]
TOPK = 20; W_RRF = 0.6
rows, cols, vals = [], [], []
for st in range(0, N, 512):
    blk = np.arange(st, min(st + 512, N))
    cos = Z[blk] @ Z.T
    for q, i in enumerate(blk):
        c = cos[q].copy(); c[i] = -1e9
        o = np.argsort(-c)[:TOPK * 2]
        out, seen = [], []
        for x in o:
            cc = coll[x]
            if cc > 0 and cc in seen: continue
            out.append(x); seen.append(cc)
            if len(out) == TOPK: break
        rows += [i] * len(out); cols += out; vals += (W_RRF * c[out]).tolist()
R = sp.csr_matrix((vals, (rows, cols)), shape=(N, N), dtype=np.float32)
S11 = (S10 + R).tocsr(); S11.setdiag(0); S11.eliminate_zeros()
S11 = (S11 + S11.T).tocsr()   # simmetrico
print(f"archi V10 {S10.nnz:,} · rrf {R.nnz:,} · V11 {S11.nnz:,}", flush=True)
# test
FILM = [(597,"Titanic"),(872585,"Oppenheimer"),(346698,"Barbie"),(792307,"Povere creature!"),(150540,"Inside Out"),
        (381341,"Perfetti"),(348,"Alien"),(8587,"Il re leone"),(129,"La citta incantata"),(496243,"Parasite"),
        (550,"Fight Club"),(545611,"EEAAO"),(157336,"Interstellar"),(238,"Il padrino"),(680,"Pulp Fiction"),
        (27205,"Inception"),(155,"Batman"),(244786,"Whiplash"),(313369,"La La Land"),(694,"Shining")]
def tp(S, i, k=6):
    r = S.getrow(i)
    if r.nnz == 0: return None
    g = np.zeros(N, np.float32); g[r.indices] = r.data; g[i] = -1e9
    return np.argsort(-g)[:k]
for tid, nome in FILM:
    key = f"movie:{tid}"
    if key not in ro: continue
    i = int(ro[key])
    a, b = tp(S10, i), tp(S11, i)
    print(f"\n### {nome}")
    print("  V10 : " + ("(nessun arco)" if a is None else " · ".join(B["titoli"][int(x)] for x in a)))
    print("  V11 : " + ("(nessun arco)" if b is None else " · ".join(B["titoli"][int(x)] for x in b)))
deg = np.asarray(S10.sum(1)).ravel()
idx = np.where((VOT <= 30) & (~is_tv))[0]; idx = idx[np.argsort(deg[idx])][:10]
print("\n\n===== CODA =====")
for i in idx:
    print(f"\n### {B['titoli'][int(i)]} · voti {int(VOT[i])} · archi V10 {int(deg[i])}")
    print("  V11 : " + " · ".join(B["titoli"][int(x)] for x in tp(S11, int(i))))
