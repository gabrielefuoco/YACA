"""Confronta 3 costruzioni del target sullo stesso campione: mix completo, solo pool scelto, mix con taglio (p>=0.15)."""
import json, numpy as np, pandas as pd
from services.graph_dense import config as C, data as D
from services.graph_dense.data import _nomi
B=D.basic(); ro=B["row_of"]; N=B["N"]; is_tv=B["is_tv"]
Yc=np.load(C.DATA/"ml-yc.npz")["Yc"].astype(np.float32); Yc/=(np.linalg.norm(Yc,axis=1,keepdims=True)+1e-9)
Bp=np.load(C.DATA/"trama-qwen3b.npy").astype(np.float32); Bp/=(np.linalg.norm(Bp,axis=1,keepdims=True)+1e-9)
Bk=np.load(C.DATA/"blocks.npz")["Bk"].astype(np.float32); Bm=np.load(C.DATA/"meta-jl.npz")["Bm"].astype(np.float32)
CONT=np.concatenate([Bp,np.sqrt(0.5)*Bk,np.sqrt(0.5)*Bm],1); CONT/=(np.linalg.norm(CONT,axis=1,keepdims=True)+1e-9)
date=np.load(C.DATA/"uscite-ordinali.npy")
def yr(i): return int(date[i]//365.25+1970) if date[i]>0 else "?"
def t(j): return f"{B['titoli'][int(j)]} ({yr(int(j))})"
def scores(i):
    hasyc=bool(np.linalg.norm(Yc[i])>1e-6)
    cov=Yc[i]@Yc.T; cov[i]=-1e4
    if hasyc and not is_tv[i] and date[i]>0:
        near=(~is_tv)&(date>0)&(np.abs(date-date[i])<120); cov[near]*=0.2
    tr=Bp[i]@Bp.T; tr[i]=-1e4; kw=Bk[i]@Bk.T; kw[i]=-1e4; me=Bm[i]@Bm.T; me[i]=-1e4
    co=CONT[i]@CONT.T; co[i]=-1e4
    cb=0.5*(cov/(cov.max()+1e-9))+0.5*(co/(co.max()+1e-9)); cb[i]=-1e4
    return {"cov":cov,"trama":tr,"kw":kw,"meta":me,"cont":co,"combo":cb},hasyc
rows=[json.loads(l) for l in open(C.DATA/"mercury-sample100.jsonl",encoding="utf-8")]
for r in rows:
    k=r["key"]; i=ro[k]; SCS,has=scores(i); pr=r["prob"]
    valid={x:v for x,v in pr.items() if x!="none" and (x!="cov" or has) and v>0}
    if not valid: valid={"cont":1.0}
    top1=max(valid,key=valid.get)
    trunc={x:v for x,v in valid.items() if v>=0.15} or {top1:1.0}
    def build(W):
        tot=sum(W.values()); mix=np.zeros(N,np.float32)
        for x,v in W.items():
            sc=SCS[x].copy(); sc[i]=-1e4; mix+=(v/tot)*(sc/(sc.max()+1e-9))
        mix[i]=-1e4; return np.argsort(-mix)[:5]
    m=build(valid); t1=np.argsort(-SCS[top1])[:5]; tr=build(trunc)
    odd=k in ("movie:8587","movie:129","movie:597","movie:76341","movie:694")
    if odd or k in ("movie:155","movie:862","movie:496243","movie:381341","movie:493922","movie:115","tv:1396","movie:62","movie:680","movie:603","movie:872585","movie:346698","movie:120","movie:150540","movie:792307","tv:94997"):
        print(f"\n{r['titolo'][:24]:24s} scelta {r['scelta']:5s} top1 {top1:5s} trunc {list(trunc)}")
        print("  mix  : "+" · ".join(t(j) for j in m))
        print("  top1 : "+" · ".join(t(j) for j in t1))
        print("  trunc: "+" · ".join(t(j) for j in tr))
