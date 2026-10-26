"""Confronto a occhio: vicini del GRAFO originale vs prodotto (rrfstudent+rerank+cap)."""
import numpy as np
from services.graph_dense import config as C, data as D

B = D.basic(); N = B["N"]; ro = B["row_of"]; is_tv = B["is_tv"]; coll = B["COLL"].astype(np.int64)
date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32)
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32); Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
Z = np.load(C.DATA / "rrfstudent.npz")["Z"].astype(np.float32)
S = D.triangle()
def graph(i, k=8):
    row = S.getrow(i); g = np.zeros(N, np.float32); g[row.indices] = row.data; g[i] = -1e9
    return np.argsort(-g)[:k]
def product(i, k=8):
    cos = Z @ Z[i]; cos[i] = -1e9
    beh = Yc[i] @ Yc.T; beh[i] = -1e9
    if not is_tv[i] and date[i] > 0:
        near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120); beh[near] *= 0.2
    s = cos + 0.3 * beh
    o = np.argsort(-s)[:80]
    out, seen = [], set()
    for x in o:
        c = coll[x]
        if c > 0 and c in seen: continue
        out.append(x); seen.add(c)
        if len(out) == k: break
    return np.array(out)
FILM = [(597,"Titanic"),(872585,"Oppenheimer"),(346698,"Barbie"),(792307,"Povere creature!"),(150540,"Inside Out"),
        (381341,"Perfetti"),(348,"Alien"),(8587,"Il re leone"),(129,"La citta incantata"),(496243,"Parasite"),
        (550,"Fight Club"),(545611,"EEAAO"),(157336,"Interstellar"),(238,"Il padrino"),(680,"Pulp Fiction"),
        (27205,"Inception"),(155,"Batman"),(244786,"Whiplash"),(313369,"La La Land"),(694,"Shining")]
for tid, nome in FILM:
    key = f"movie:{tid}"
    if key not in ro: continue
    i = int(ro[key])
    print(f"\n### {nome}")
    print("  GRAFO : " + " · ".join(B["titoli"][int(x)] for x in graph(i)))
    print("  PROD  : " + " · ".join(B["titoli"][int(x)] for x in product(i)))
