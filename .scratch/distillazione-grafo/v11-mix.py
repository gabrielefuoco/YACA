"""V11-mix: rrf come 11esimo componente della miscela (peso 1/11), poi simmetrizzazione.
Confronto con V10 e con V11-after (rrf sommato dopo)."""
import numpy as np, scipy.sparse as sp
from services.graph import bubbles as BB, canon as K
from services.graph_dense import config as C, data as D

B = D.basic(); N = B["N"]; ro = B["row_of"]; is_tv = B["is_tv"]; coll = B["COLL"].astype(np.int64)
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
BB.N = N
S10 = D.triangle().tocsr()
# archi rrf (top20, cap, cos)
TOPK = 20
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
        rows += [i] * len(out); cols += out; vals += c[out].tolist()
R = sp.csr_matrix((vals, (rows, cols)), shape=(N, N), dtype=np.float32)
print("archi rrf:", R.nnz, flush=True)

# i componenti V10
Cm = BB.carica_componenti(ricostruisci=False)
print("componenti:", list(Cm.keys()), flush=True)
pesi = {k: 1.0 for k in Cm}
beta = 0.5
Cm11 = dict(Cm); Cm11["RRF"] = R
pesi11 = dict(pesi); pesi11["RRF"] = 1.0
print("miscela (11 comp)...", flush=True)
M11 = BB.costruisci_2(Cm11, pesi11, beta)
S11mix = BB.simmetrizza(M11)
S11mix.setdiag(0); S11mix.eliminate_zeros()
print("archi V11-mix:", S11mix.nnz, flush=True)
# V11-after
S11after = (S10 + 0.6 * R).tocsr(); S11after.setdiag(0); S11after.eliminate_zeros(); S11after = (S11after + S11after.T).tocsr()
print("archi V11-after:", S11after.nnz, flush=True)

FILM = [(597,"Titanic"),(872585,"Oppenheimer"),(346698,"Barbie"),(792307,"Povere creature!"),(150540,"Inside Out"),
        (348,"Alien"),(129,"La citta incantata"),(496243,"Parasite"),(550,"Fight Club"),(238,"Il padrino"),(694,"Shining")]
def tp(S, i, k=6):
    r = S.getrow(i)
    if r.nnz == 0: return "(nessun arco)"
    g = np.zeros(N, np.float32); g[r.indices] = r.data; g[i] = -1e9
    return " · ".join(B["titoli"][int(x)] for x in np.argsort(-g)[:k])
for tid, nome in FILM:
    i = int(ro[f"movie:{tid}"])
    print(f"\n### {nome}")
    print("  V10    : " + tp(S10, i))
    print("  mix11  : " + tp(S11mix, i))
    print("  after  : " + tp(S11after, i))
