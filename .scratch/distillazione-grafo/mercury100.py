"""Campione 100 film -> Mercury Decide (free): scelta del pool + target ad hoc."""
import json, os, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd
from services.graph_dense import config as C, data as D
from services.graph_dense.data import _nomi

B=D.basic(); ro=B["row_of"]; N=B["N"]; is_tv=B["is_tv"]; vot=B["VOT"].astype(np.float32)
Yc=np.load(C.DATA/"ml-yc.npz")["Yc"].astype(np.float32); Yc/=(np.linalg.norm(Yc,axis=1,keepdims=True)+1e-9)
Bp=np.load(C.DATA/"trama-qwen3b.npy").astype(np.float32); Bp/=(np.linalg.norm(Bp,axis=1,keepdims=True)+1e-9)
Bk=np.load(C.DATA/"blocks.npz")["Bk"].astype(np.float32); Bm=np.load(C.DATA/"meta-jl.npz")["Bm"].astype(np.float32)
CONT=np.concatenate([Bp,np.sqrt(0.5)*Bk,np.sqrt(0.5)*Bm],1); CONT/=(np.linalg.norm(CONT,axis=1,keepdims=True)+1e-9)
date=np.load(C.DATA/"uscite-ordinali.npy")
ov=pd.read_parquet(C.DATA/"overview-en.parquet"); ovm={str(r.chiave):r.overview for r in ov.itertuples()}
INFO={}; GEN={}
for tipo,f,crew in (("movie","movies.parquet","directors"),("tv","tv.parquet","created_by")):
    d=pd.read_parquet(C.TMDB/f,columns=["id","genres","runtime","original_language",crew,"cast","production_companies","keywords"])
    for r in d.itertuples(index=False):
        k=f"{tipo}:{int(r.id)}"; gl=_nomi(r.genres)
        GEN[k]=gl
        INFO[k]={"gen":", ".join(gl),"rt":getattr(r,"runtime",None),"lg":getattr(r,"original_language",""),
                 "crew":_nomi(getattr(r,crew))[:2],"cast":_nomi(getattr(r,"cast"))[:5],
                 "co":_nomi(getattr(r,"production_companies"))[:3],"kw":_nomi(getattr(r,"keywords"))[:8]}
_rev={r:k for k,r in ro.items()}
def yr(i): return int(date[i]//365.25+1970) if date[i]>0 else "?"
def desc(j):
    j=int(j); k=_rev.get(j); I=INFO.get(k,{})
    return f"{B['titoli'][j]} ({yr(j)}) [{I.get('gen','')}] ({I.get('rt','?')} min) — {(ovm.get(k,'') or '')[:70]}"
def card(k,I,i):
    s=f"FILM: {B['titoli'][i]} ({yr(i)})\nGENRES: {I.get('gen','')}\nRUNTIME: {I.get('rt','?')} min\nLANGUAGE: {I.get('lg','')}\n"
    for lab,key in (("DIRECTOR/CREATOR","crew"),("CAST","cast"),("COMPANIES","co"),("KEYWORDS","kw")):
        if I.get(key): s+=f"{lab}: {', '.join(I[key])}\n"
    return s+f"OVERVIEW: {(ovm.get(k,'') or '')[:350]}\n"
CRITERI={"cov":"Same MovieLens audience (real co-vision). Captures taste, can include same-window releases.",
"trama":"Plot-summary similarity. Captures story/theme, can be fooled by names.",
"kw":"Shared keywords/themes. Sparse, can be noisy.","meta":"Same cast, crew, studio, collection, era.",
"cont":"Blend of plot, keywords and metadata.","combo":"Blend of audience co-vision and content.",
"none":"None of these lists is a good set of similar films."}
def pools(i):
    hasyc=bool(np.linalg.norm(Yc[i])>1e-6)
    cov=Yc[i]@Yc.T; cov[i]=-1e4
    if hasyc and not is_tv[i] and date[i]>0:
        near=(~is_tv)&(date>0)&(np.abs(date-date[i])<120); cov[near]*=0.2
    tr=Bp[i]@Bp.T; tr[i]=-1e4; kw=Bk[i]@Bk.T; kw[i]=-1e4; me=Bm[i]@Bm.T; me[i]=-1e4
    co=CONT[i]@CONT.T; co[i]=-1e4
    cb=0.5*(cov/(cov.max()+1e-9))+0.5*(co/(co.max()+1e-9)); cb[i]=-1e4
    scs={"cov":cov,"trama":tr,"kw":kw,"meta":me,"cont":co,"combo":cb}
    out={}
    for n,s in scs.items():
        out[n]=([desc(j) for j in np.argsort(-s)[:8]] if (n!="cov" or hasyc) else ["(no MovieLens co-vision available)"])
    return out,scs,hasyc
KNOWN=["movie:155","movie:862","movie:8587","movie:496243","movie:129","movie:381341","movie:694","movie:493922",
"movie:115","tv:1396","tv:66732","movie:62","movie:597","movie:680","movie:603","movie:872585","movie:346698",
"movie:120","movie:150540","movie:76341","movie:792307","tv:94997"]
rng=np.random.default_rng(42)
def pick(pool,n,exclude):
    c=[k for k in pool if k not in exclude]; rng.shuffle(c); return c[:n]
allm=[k for k in ro if k.startswith("movie:")]; allt=[k for k in ro if k.startswith("tv:")]
ital=[k for k in allm if INFO.get(k,{}).get("lg")=="it" and vot[ro[k]]>=100]
doc=[k for k in allm if "Documentary" in GEN.get(k,[]) and vot[ro[k]]>=30]
hor=[k for k in allm if "Horror" in GEN.get(k,[]) and vot[ro[k]]>=50]
ani=[k for k in allm if "Animation" in GEN.get(k,[]) and vot[ro[k]]>=50]
low=[k for k in allm if 10<=vot[ro[k]]<=300]
ser=[k for k in allt if vot[ro[k]]>=100]
sel=list(dict.fromkeys(KNOWN))
for pool,n in ((ser,15),(doc,15),(ital,15),(low,15),(ani,10),(hor,10)):
    sel+=pick(pool,n,set(sel))
sel=list(dict.fromkeys(sel))[:100]
print("campione:",len(sel),"· film",sum(1 for k in sel if k.startswith("movie")),"· serie",sum(1 for k in sel if k.startswith("tv")),flush=True)
KEY=os.environ["OPENROUTER_API_KEY"]; MODEL=os.environ.get("JEV_MODEL","inception/mercury-decide:free")
def one(k):
    i=ro[k]; P,SCS,hasyc=pools(i)
    st=card(k,INFO.get(k,{}),i)
    for n in ("cov","trama","kw","meta","cont","combo"):
        st+=f"\nLIST {n.upper()}:\n"+"\n".join("- "+x for x in P[n])
    b={"model":MODEL,"state":st,"questions":{"best":{"type":"choice",
       "instructions":"Which candidate list is the BEST set of films SIMILAR to the film described (theme, tone, style, intended audience)? Same brand/title, same release window or broad popularity alone do not count. A children's cartoon is not similar to an adult live-action film even with the same brand. If none is good, choose none.",
       "criteria":CRITERI}}}
    for t in range(3):
        try:
            req=urllib.request.Request("https://openrouter.ai/api/alpha/decisions",data=json.dumps(b).encode(),
                headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
            with urllib.request.urlopen(req,timeout=90) as r: ans=json.load(r)["answers"]["best"]
            pr=ans.get("probabilities",{}); w={x:v for x,v in pr.items() if x!="none" and v>0}
            if not w: w={"cont":1.0}
            tot=sum(w.values()); mix=np.zeros(N,np.float32)
            for x,v in w.items():
                sc=SCS[x].copy(); sc[i]=-1e4; mix+=(v/tot)*(sc/(sc.max()+1e-9))
            mix[i]=-1e4; top=np.argsort(-mix)[:50]
            return {"key":k,"titolo":B["titoli"][i],"scelta":ans.get("choice"),"prob":pr,
                    "conf":ans.get("confidence"),"none":pr.get("none",0),
                    "top10":[B["titoli"][int(j)] for j in top[:10]],"idx":top.tolist()}
        except Exception as e:
            if t==2: return {"key":k,"errore":str(e)[:200]}
            time.sleep(1.5*(t+1))
t0=time.time()
with ThreadPoolExecutor(max_workers=8) as ex: res=list(ex.map(one,sel))
print(f"chiamate: {len(res)} in {time.time()-t0:.0f}s",flush=True)
ok=[r for r in res if "idx" in r]; err=[r for r in res if "errore" in r]
with open(C.DATA/"mercury-sample100.jsonl","w",encoding="utf-8") as f:
    for r in res: f.write(json.dumps(r,ensure_ascii=False)+"\n")
idx=np.zeros((len(ok),50),np.int32); w=np.zeros((len(ok),50),np.float16); keys=[r["key"] for r in ok]
for q,r in enumerate(ok):
    idx[q]=r["idx"]; s=np.linspace(1,0.1,50); w[q]=(s/s.sum()).astype(np.float16)
np.savez_compressed(C.DATA/"mercury-sample100.npz",idx=idx,w=w,keys=np.array(keys))
from collections import Counter
print("scelte:",dict(Counter(r["scelta"] for r in ok)),"· errori:",len(err))
print("none medio: %.3f · conf medio: %.3f · none>0.2: %d" % (
    np.mean([r["none"] for r in ok]),np.mean([r["conf"] for r in ok]),sum(1 for r in ok if r["none"]>0.2)))
for r in ok[:22]:
    print(f"\n{r['key']} {r['titolo'][:26]:26s} · {r['scelta']} (none {r['none']:.2f}) -> " + " · ".join(x[:24] for x in r['top10'][:5]))
