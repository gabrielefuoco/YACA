"""Target pulito: toglie dai positivi i candidati dei pool scartati (i negativi), proteggendo il top-3 del pool scelto."""
import numpy as np
from services.graph_dense import config as C, data as D
B=D.basic(); ro=B["row_of"]; date=np.load(C.DATA/"uscite-ordinali.npy")
t=np.load(C.DATA/"mercury-target.npz"); n=np.load(C.DATA/"mercury-negatives.npz")
idx=t["idx"]; w=t["w"]; ni=n["idx"]
oi=np.full_like(idx,-1); ow=np.zeros_like(w); counts=[]
for i in range(len(idx)):
    if idx[i,0]<0: continue
    neg=set(int(x) for x in ni[i] if x>=0)
    keep=[(int(j),float(ww)) for j,ww in zip(idx[i],w[i]) if j>=0 and int(j) not in neg]
    counts.append(len(keep))
    for q,(j,ww) in enumerate(keep[:50]): oi[i,q]=j; ow[i,q]=ww
np.savez_compressed(C.DATA/"mercury-target-clean.npz", idx=oi, w=ow, choice=t["choice"], none=t["none"], kept=t["kept"], maxp=t["maxp"])
c=np.array(counts); print("puliti",len(c),"· positivi medi",round(float(c.mean()),1),"· mediana",int(np.median(c)),"· min",int(c.min()),"· 0",int((c==0).sum()))
def t_(j): return f"{B['titoli'][int(j)]} ({int(date[j]//365.25+1970) if date[j]>0 else '?'})"
for key in ("movie:597","movie:346698","movie:792307","movie:8587"):
    i=ro[key]; print(f"\n{B['titoli'][i][:22]}: " + " · ".join(t_(j) for j in oi[i][:8] if j>=0))
