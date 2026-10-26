"""Rerank Yc + penalita' collection SOLO se il seguito e' nei primi 3, poi cap 1/collection."""
import numpy as np
from services.graph_dense import config as C, data as D

B = D.basic(); N = B["N"]; ro = B["row_of"]; is_tv = B["is_tv"]; coll = B["COLL"].astype(np.int64)
date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32)
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32); Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
BETA = 0.2
def cap(order, k=8):
    out, seen = [], set()
    for x in order:
        c = coll[x]
        if c > 0 and c in seen: continue
        out.append(x); seen.add(c)
        if len(out) == k: break
    return out
def lists(tid, nome):
    k = f"movie:{tid}"
    if k not in ro: return
    i = int(ro[k]); cos = Z @ Z[i]; cos[i] = -1e9
    beh = Yc[i] @ Yc.T; beh[i] = -1e9
    near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120); beh[near] *= 0.2
    s = cos + 0.3 * beh
    o0 = np.argsort(-s)
    seen3 = {int(coll[x]) for x in o0[:3] if coll[x] > 0}
    s2 = s.copy()
    if seen3:
        mask = np.isin(coll, list(seen3)) & (coll > 0)
        s2[mask] -= BETA
    o = np.argsort(-s2)[:60]
    print(f"\n### {nome}")
    print("  cap      : " + " · ".join(B["titoli"][int(x)] for x in cap(o0[:60], 8)))
    print("  cond     : " + " · ".join(B["titoli"][int(x)] for x in cap(o, 8)))
for tid, nome in ((671,"HP1"),(673,"HP3"),(120,"LOTR"),(238,"Il padrino"),(155,"Batman"),(27205,"Inception"),(348,"Alien"),(346698,"Barbie")):
    lists(tid, nome)
