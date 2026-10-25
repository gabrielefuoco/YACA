"""Rerank dello spazio b10 con il comportamento: 5 lambda, 33 titoli. Nessun training."""
import json, pickle, numpy as np, pandas as pd
from services.graph_dense import config as C, data as D
from services.graph_dense.data import _nomi
B=D.basic(); ro=B["row_of"]; N=B["N"]; is_tv=B["is_tv"]; date=np.load(C.DATA/"uscite-ordinali.npy")
Yc=np.load(C.DATA/"ml-yc.npz")["Yc"].astype(np.float32); Yc/=(np.linalg.norm(Yc,axis=1,keepdims=True)+1e-9)
Bp=np.load(C.DATA/"trama-qwen3b.npy").astype(np.float32); Bp/=(np.linalg.norm(Bp,axis=1,keepdims=True)+1e-9)
Bk=np.load(C.DATA/"blocks.npz")["Bk"].astype(np.float32); Bm=np.load(C.DATA/"meta-jl.npz")["Bm"].astype(np.float32)
CONT=np.concatenate([Bp,np.sqrt(.5)*Bk,np.sqrt(.5)*Bm],1); CONT/=(np.linalg.norm(CONT,axis=1,keepdims=True)+1e-9)
S=D.triangle(); Z=np.load(C.DATA/"m1.npz")["Z"].astype(np.float32)
ov=pd.read_parquet(C.DATA/"overview-en.parquet"); ovm={str(r.chiave):r.overview for r in ov.itertuples()}
INFO={}
for tipo,f,cr in (("movie","movies.parquet","directors"),("tv","tv.parquet","created_by")):
    d=pd.read_parquet(C.TMDB/f,columns=["id","genres","runtime","original_language",cr,"cast","production_companies","keywords"])
    for r in d.itertuples(index=False):
        INFO[f"{tipo}:{int(r.id)}"]={"gen":", ".join(_nomi(r.genres)),"rt":getattr(r,"runtime",None),
            "crew":_nomi(getattr(r,cr))[:2],"cast":_nomi(getattr(r,"cast"))[:5],
            "co":_nomi(getattr(r,"production_companies"))[:3],"kw":_nomi(getattr(r,"keywords"))[:8]}
_rev={r:k for k,r in ro.items()}
def yr(i): return int(date[i]//365.25+1970) if date[i]>0 else "?"
def de(j):
    j=int(j); k=_rev.get(j); I=INFO.get(k,{})
    return f"{B['titoli'][j]} ({yr(j)}) [{I.get('gen','')}] — {(ovm.get(k,'') or '')[:60]}"
def card(k,i):
    I=INFO.get(k,{}); s=f"FILM: {B['titoli'][i]} ({yr(i)})\nGENRES: {I.get('gen','')}\nRUNTIME: {I.get('rt','?')} min\n"
    for lab,key in (("DIRECTOR/CREATOR","crew"),("CAST","cast"),("COMPANIES","co"),("KEYWORDS","kw")):
        if I.get(key): s+=f"{lab}: {', '.join(I[key])}\n"
    return s+f"OVERVIEW: {(ovm.get(k,'') or '')[:300]}\n"
def beh(i):
    cov=Yc[i]@Yc.T; cov[i]=-1e4
    if not is_tv[i] and date[i]>0:
        near=(~is_tv)&(date>0)&(np.abs(date-date[i])<120); cov[near]*=0.2
    row=S.getrow(i); gs=np.zeros(N,np.float32); gs[row.indices]=row.data; gs[i]=-1e4
    return 0.5*(gs/(gs.max()+1e-9))+0.5*(cov/(cov.max()+1e-9))
G=pickle.load(open(C.DATA/"grid-target.pkl","rb"))
KEYS=[k for k in G["keys"] if k in ro]
LAM=[0.0,0.15,0.3,0.6,1.0]
out={}
for n,k in enumerate(KEYS):
    i=int(ro[k]); cos=Z@Z[i]; cos[i]=-1e4
    cand=np.argsort(-cos)[:50]; bh=beh(i)
    for lam in LAM:
        sc=cos.copy(); sc[cand]=cos[cand]+lam*bh[cand]
        top=cand[np.argsort(-sc[cand])][:20]
        out[(k,lam)]=[int(x) for x in top]
    print(f"{n+1}/{len(KEYS)} {B['titoli'][i]}",flush=True)
pickle.dump({"keys":KEYS,"lam":LAM,"out":out,"de":{k:[de(x) for x in out[(k,0.0)]] for k in KEYS}},open(C.DATA/"rerank-eval-m1.pkl","wb"))
np.savez_compressed(C.DATA/"rerank-eval-m1.npz",keys=np.array(KEYS),lam=np.array(LAM),
    tops=np.array([[out[(k,l)] for k in KEYS] for l in LAM]))
print("ok",len(KEYS))
