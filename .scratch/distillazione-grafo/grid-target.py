"""10 varianti di target (boost/floor sui pool di comportamento). Target standard intatto."""
import json, os, sys, numpy as np, pandas as pd
from services.graph_dense import config as C, data as D
from services.graph_dense.data import _nomi
B=D.basic(); ro=B["row_of"]; N=B["N"]; is_tv=B["is_tv"]; date=np.load(C.DATA/"uscite-ordinali.npy")
Yc=np.load(C.DATA/"ml-yc.npz")["Yc"].astype(np.float32); Yc/=(np.linalg.norm(Yc,axis=1,keepdims=True)+1e-9)
Bp=np.load(C.DATA/"trama-qwen3b.npy").astype(np.float32); Bp/=(np.linalg.norm(Bp,axis=1,keepdims=True)+1e-9)
Bk=np.load(C.DATA/"blocks.npz")["Bk"].astype(np.float32); Bm=np.load(C.DATA/"meta-jl.npz")["Bm"].astype(np.float32)
CONT=np.concatenate([Bp,np.sqrt(.5)*Bk,np.sqrt(.5)*Bm],1); CONT/=(np.linalg.norm(CONT,axis=1,keepdims=True)+1e-9)
S=D.triangle()
ov=pd.read_parquet(C.DATA/"overview-en.parquet"); ovm={str(r.chiave):r.overview for r in ov.itertuples()}
INFO={}
for tipo,f,cr in (("movie","movies.parquet","directors"),("tv","tv.parquet","created_by")):
    d=pd.read_parquet(C.TMDB/f,columns=["id","genres","runtime","original_language",cr,"cast","production_companies","keywords"])
    for r in d.itertuples(index=False):
        INFO[f"{tipo}:{int(r.id)}"]={"gen":", ".join(_nomi(r.genres)),"rt":getattr(r,"runtime",None),
            "lg":getattr(r,"original_language",""),"crew":_nomi(getattr(r,cr))[:2],"cast":_nomi(getattr(r,"cast"))[:5],
            "co":_nomi(getattr(r,"production_companies"))[:3],"kw":_nomi(getattr(r,"keywords"))[:8]}
_rev={r:k for k,r in ro.items()}
def yr(i): return int(date[i]//365.25+1970) if date[i]>0 else "?"
def de(j):
    j=int(j); k=_rev.get(j); I=INFO.get(k,{})
    return f"{B['titoli'][j]} ({yr(j)}) [{I.get('gen','')}] — {(ovm.get(k,'') or '')[:70]}"
def scores(i):
    cov=Yc[i]@Yc.T; cov[i]=-1e4
    if not is_tv[i] and date[i]>0:
        near=(~is_tv)&(date>0)&(np.abs(date-date[i])<120); cov[near]*=0.2
    tr=Bp[i]@Bp.T; tr[i]=-1e4; kw=Bk[i]@Bk.T; kw[i]=-1e4; me=Bm[i]@Bm.T; me[i]=-1e4
    co=CONT[i]@CONT.T; co[i]=-1e4
    cb=.5*(cov/(cov.max()+1e-9))+.5*(co/(co.max()+1e-9)); cb[i]=-1e4
    row=S.getrow(i); gs=np.zeros(N,np.float32); gs[row.indices]=row.data; gs[i]=-1e4
    return {"graph":gs,"cov":cov,"trama":tr,"kw":kw,"meta":me,"cont":co,"combo":cb}, bool(np.linalg.norm(Yc[i])>1e-6)
BEH={"graph","cov","combo"}
def mix_variant(S7,has,pr,boost,floor):
    beh={x:max(pr.get(x,0.0),floor) for x in ("graph","cov","combo") if (x!="cov" or has)}
    cont={x:pr.get(x,0.0) for x in ("cont","trama","kw","meta")}
    beh={x:v for x,v in beh.items() if v>0}; cont={x:v for x,v in cont.items() if v>0}
    if not cont and not beh: cont={"cont":1.0}
    def blend(d):
        if not d: return None
        t=sum(d.values()); m=np.zeros(N,np.float32)
        for x,v in d.items():
            sc=S7[x].copy(); sc[i0]=-1e4; m+=(v/t)*(sc/(sc.max()+1e-9))
        m[i0]=-1e4; return m
    cm=blend(cont); bm=blend(beh)
    a=boost/(1.0+boost)
    if cm is None: a=1.0
    if bm is None: a=0.0
    ct=np.argsort(-cm)[:10] if cm is not None else np.array([],int)
    bt=np.argsort(-bm)[:10] if bm is not None else np.array([],int)
    cand=np.unique(np.concatenate([ct,bt]))
    score=((1-a)*cm if cm is not None else 0)+(a*bm if bm is not None else 0); score[i0]=-1e4
    top=cand[np.argsort(-score[cand])][:20]
    if len(top)<20:
        rest=np.argsort(-score)[:20]; top=np.unique(np.concatenate([top,rest]))[:20]
    return top
def std_top(S7,has,pr):
    w={x:pr.get(x,0.0) for x in ("graph","cov","combo","cont","trama","kw","meta") if (x!="cov" or has)}
    if not any(v>0 for v in w.values()): w={"cont":1.0}
    t=sum(w.values()); m=np.zeros(N,np.float32)
    for x,v in w.items():
        sc=S7[x].copy(); sc[i0]=-1e4; m+=(v/t)*(sc/(sc.max()+1e-9))
    m[i0]=-1e4
    top=np.argsort(-m)[:20]
    return top
rows={}
for line in open(C.DATA/"mercury-target.jsonl",encoding="utf-8"):
    try:
        r=json.loads(line)
        if "idx" in r: rows[r["key"]]=r
    except Exception: pass
FILM=[597,872585,346698,792307,150540,575813,348,8587,129,496243,550,693134,545611,157336,238,680,27205,155,244786,313369,
      466420,467244,666277,930094,523607,1029575,753342,787699,572802,508883]
TV=[94997,93405,1438,60059,87108,1399,84773,100088,95396,83867]
KEYS=[f"movie:{i}" for i in FILM]+[f"tv:{i}" for i in TV]
VAR=[(-1.0,-1.0),(1.0,0.0)]+[(b,f) for b in (1.5,2.0,3.0) for f in (0.0,0.1,0.2)]
print("varianti:",VAR)
out={}
for ki,k in enumerate(KEYS):
    if k not in ro: print("MISS",k); continue
    i0=int(ro[k]); S7,has=scores(i0)
    pr=(rows.get(k) or {}).get("prob") or {}
    for boost,floor in VAR:
        top=std_top(S7,has,pr) if (boost,floor)==(-1.0,-1.0) else mix_variant(S7,has,pr,boost,floor)
        out[(k,boost,floor)]=[int(x) for x in top]
    print(f"{ki+1}/{len(KEYS)} {k} {B['titoli'][i0]}",flush=True)
import pickle; pickle.dump({"keys":KEYS,"var":VAR,"out":out,"de":{k:[de(x) for x in v] for k,v in [(k,out[(k,1.0,0.0)]) for k in KEYS if k in ro]}},open(C.DATA/"grid-target.pkl","wb"))
np.savez_compressed(C.DATA/"grid-target.npz",keys=np.array(KEYS),var=np.array(VAR),
    tops=np.array([[out[(k,b,f)] for k in KEYS if k in ro] for b,f in VAR]))
print("ok",len(KEYS))
