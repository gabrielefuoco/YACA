"""Confronto a occhio: vicini Yc veri vs rrfstudent-yc vs b10."""
import numpy as np
from services.graph_dense import config as C, data as D

B = D.basic(); N = B["N"]; ro = B["row_of"]; is_tv = B["is_tv"]
date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32)
Yc = np.load(C.DATA / "ml-yc.npz")["Yc"].astype(np.float32); Yc /= (np.linalg.norm(Yc, axis=1, keepdims=True) + 1e-9)
Z1 = np.load(C.DATA / "rrfstudent-yc.npz")["Z"].astype(np.float32)
Z0 = np.load(C.DATA / "b10.npz")["Z"].astype(np.float32)
def top_yc(i, k=8):
    c = Yc[i] @ Yc.T; c[i] = -1e9
    if not is_tv[i] and date[i] > 0:
        near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120); c[near] *= 0.2
    return np.argsort(-c)[:k]
def top_z(Z, i, k=8):
    c = Z @ Z[i]; c[i] = -1e9
    return np.argsort(-c)[:k]
FILM = [(346698,"Barbie"),(872585,"Oppenheimer"),(792307,"Povere creature!"),(496243,"Parasite"),
        (550,"Fight Club"),(597,"Titanic"),(348,"Alien"),(157336,"Interstellar"),(238,"Il padrino"),(680,"Pulp Fiction")]
for tid, nome in FILM:
    key = f"movie:{tid}"
    if key not in ro: print(f"\n### {nome} FUORI"); continue
    i = int(ro[key])
    print(f"\n### {nome}")
    print("  Yc  : " + " · ".join(B["titoli"][int(x)] for x in top_yc(i)))
    print("  rrfy: " + " · ".join(B["titoli"][int(x)] for x in top_z(Z1, i)))
    print("  b10 : " + " · ".join(B["titoli"][int(x)] for x in top_z(Z0, i)))
