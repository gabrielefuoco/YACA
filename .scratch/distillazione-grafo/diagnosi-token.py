"""Perche' il blocco meta avvicina due titoli: token condivisi con il contributo piu' alto."""
import numpy as np
from services.graph_dense import config as C, data as D
B=D.basic(); ro=B["row_of"]; V=D.vocab()
X0=D.features(B,extra=True); keep=np.load(C.DATA/"blocks.npz")["keep"]
X=X0[:,keep].tocsr(); orig=np.where(keep)[0]
tok=[None]*X.shape[1]
inv={c:t for t,c in V.items()}
for k,c in enumerate(orig): tok[k]=inv.get(int(c),"")
def trova(frammento):
    for i,t in enumerate(B["titoli"]):
        if frammento.lower() in t.lower(): return i
    return None
COPPIE=[("movie:346698","Barbie"),("movie:150540","Pigeon: Impossible"),
        ("movie:150540","Fantastic Flying Books"),("movie:346698","Red"),
        ("tv:94997","Trono di Spade")]
for a,fram in COPPIE:
    i=ro[a]; j=trova(fram)
    if j is None or j==i: print("skip",fram); continue
    ra=X.getrow(i); rb=X.getrow(j)
    da={int(c):float(v) for c,v in zip(ra.indices,ra.data)}
    db={int(c):float(v) for c,v in zip(rb.indices,rb.data)}
    com=sorted(((da[c]*db[c],c) for c in set(da)&set(db)), reverse=True)
    print(f"\n{B['titoli'][i][:34]} <-> {B['titoli'][j][:34]} · {len(com)} token comuni")
    print("  " + " | ".join(f"{tok[c][:30]} {s:.4f}" for s,c in com[:12]))
