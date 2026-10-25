"""Filtro morbido: mix 6 pool -> 50 candidati -> p per candidato -> score = mix*(0.2+p). 67 in parallelo."""
import json, os, time, threading, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd
from services.graph_dense import config as C, data as D
from services.graph_dense.data import _nomi

B=D.basic(); ro=B["row_of"]; N=B["N"]; is_tv=B["is_tv"]; date=np.load(C.DATA/"uscite-ordinali.npy")
Yc=np.load(C.DATA/"ml-yc.npz")["Yc"].astype(np.float32); Yc/=(np.linalg.norm(Yc,axis=1,keepdims=True)+1e-9)
Bp=np.load(C.DATA/"trama-qwen3b.npy").astype(np.float32); Bp/=(np.linalg.norm(Bp,axis=1,keepdims=True)+1e-9)
Bk=np.load(C.DATA/"blocks.npz")["Bk"].astype(np.float32); Bm=np.load(C.DATA/"meta-jl.npz")["Bm"].astype(np.float32)
CONT=np.concatenate([Bp,np.sqrt(0.5)*Bk,np.sqrt(0.5)*Bm],1); CONT/=(np.linalg.norm(CONT,axis=1,keepdims=True)+1e-9)
ov=pd.read_parquet(C.DATA/"overview-en.parquet"); ovm={str(r.chiave):r.overview for r in ov.itertuples()}
INFO={}
for tipo,f,cr in (("movie","movies.parquet","directors"),("tv","tv.parquet","created_by")):
    d=pd.read_parquet(C.TMDB/f,columns=["id","genres","runtime","original_language",cr,"cast","production_companies","keywords"])
    for r in d.itertuples(index=False):
        INFO[f"{tipo}:{int(r.id)}"]={"gen":", ".join(_nomi(r.genres)),"rt":getattr(r,"runtime",None),"lg":getattr(r,"original_language",""),"crew":_nomi(getattr(r,cr))[:2],"cast":_nomi(getattr(r,"cast"))[:5],"co":_nomi(getattr(r,"production_companies"))[:3],"kw":_nomi(getattr(r,"keywords"))[:8]}
_rev={r:k for k,r in ro.items()}
def yr(i): return int(date[i]//365.25+1970) if date[i]>0 else "?"
def de(j):
    j=int(j); k=_rev.get(j); I=INFO.get(k,{})
    return f"{B['titoli'][j]} ({yr(j)}) [{I.get('gen','')}] ({I.get('rt','?')} min) — {(ovm.get(k,'') or '')[:70]}"
def card(k,i):
    I=INFO.get(k,{})
    s=f"FILM: {B['titoli'][i]} ({yr(i)})\nGENRES: {I.get('gen','')}\nRUNTIME: {I.get('rt','?')} min\n"
    for lab,key in (("DIRECTOR/CREATOR","crew"),("CAST","cast"),("COMPANIES","co"),("KEYWORDS","kw")):
        if I.get(key): s+=f"{lab}: {', '.join(I[key])}\n"
    return s+f"OVERVIEW: {(ovm.get(k,'') or '')[:350]}\n"
def scores(i):
    cov=Yc[i]@Yc.T; cov[i]=-1e4
    if not is_tv[i] and date[i]>0:
        near=(~is_tv)&(date>0)&(np.abs(date-date[i])<120); cov[near]*=0.2
    tr=Bp[i]@Bp.T; tr[i]=-1e4; kw=Bk[i]@Bk.T; kw[i]=-1e4; me=Bm[i]@Bm.T; me[i]=-1e4
    co=CONT[i]@CONT.T; co[i]=-1e4
    cb=0.5*(cov/(cov.max()+1e-9))+0.5*(co/(co.max()+1e-9)); cb[i]=-1e4
    return {"cov":cov,"trama":tr,"kw":kw,"meta":me,"cont":co,"combo":cb},bool(np.linalg.norm(Yc[i])>1e-6)
CR={"cov":"Same MovieLens audience.","trama":"Plot-summary similarity.","kw":"Shared keywords.","meta":"Same cast, crew, studio, collection, era.","cont":"Blend plot+keywords+metadata.","combo":"Blend co-vision+content.","none":"None is good."}
KEY=os.environ["OPENROUTER_API_KEY"]; MODEL=os.environ.get("JEV_MODEL","inception/mercury-decide:free")
lock=threading.Lock(); STAT={"ok":0,"retry":0,"429":0,"err":0}
def ask(state, questions):
    for t in range(5):
        try:
            b={"model":MODEL,"state":state,"questions":questions}
            req=urllib.request.Request("https://openrouter.ai/api/alpha/decisions",data=json.dumps(b).encode(),
                headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
            with urllib.request.urlopen(req,timeout=180) as r:
                with lock: STAT["ok"]+=1
                return json.load(r)["answers"]
        except urllib.error.HTTPError as e:
            with lock:
                if e.code==429: STAT["429"]+=1
                else: STAT["err"]+=1
                STAT["retry"]+=1
            if e.code==429: time.sleep(2+3*t)
            else: time.sleep(1+t)
        except Exception:
            with lock: STAT["err"]+=1; STAT["retry"]+=1
            time.sleep(1+t)
    raise RuntimeError("ask failed")
def one(k):
    i=ro[k]; S,has=scores(i)
    lists={n:([de(j) for j in np.argsort(-s)[:8]] if (n!="cov" or has) else ["(no MovieLens co-vision)"]) for n,s in S.items()}
    st=card(k,i)
    for n in ("cov","trama","kw","meta","cont","combo"):
        st+=f"\nLIST {n.upper()}:\n"+"\n".join("- "+x for x in lists[n])
    a1=ask(st,{"best":{"type":"choice","instructions":"Which candidate list is the BEST set of films SIMILAR to the film described (theme, tone, style, intended audience)? Same brand/title, release window or broad popularity alone do not count. A children's cartoon is not similar to an adult live-action film even with the same brand. If none is good, choose none.","criteria":CR}})["best"]
    pr=a1.get("probabilities",{}); valid={x:v for x,v in pr.items() if x!="none" and (x!="cov" or has) and v>0}
    if not valid: valid={"cont":1.0}
    tot=sum(valid.values()); mix=np.zeros(N,np.float32)
    for x,v in valid.items():
        sc=S[x].copy(); sc[i]=-1e4; mix+=(v/tot)*(sc/(sc.max()+1e-9))
    mix[i]=-1e4; cand=np.argsort(-mix)[:50]
    st2=card(k,i)+"\nCANDIDATI:\n"+"\n".join(f"{q+1}. {de(j)}" for q,j in enumerate(cand))
    a2=ask(st2,{f"c{q+1}":{"type":"noul","instructions":f"Is candidate {q+1} a good similar film for the film described (theme, tone, style, intended audience)? Same broad popularity or same release window is not enough."} for q in range(50)})
    p=np.array([a2[f"c{q+1}"]["noul"] for q in range(50)],np.float32)
    soft=mix[cand]*(0.2+p); o=np.argsort(-soft)
    idx=cand[o]; w=soft[o]; w=w/(w.sum()+1e-9)
    return {"key":k,"titolo":B["titoli"][i],"choice":a1.get("choice"),"none":pr.get("none",0),"conf":a1.get("confidence"),
            "kept":int((p>=0.3).sum()),"maxp":float(p.max()),"empty":bool(p.max()<0.2),
            "top10":[B["titoli"][int(j)] for j in idx[:10]],"idx":idx.tolist(),"w":w.tolist()}
keys=[json.loads(l)["key"] for l in open(C.DATA/"mercury-sample100.jsonl",encoding="utf-8")]
t0=time.time()
with ThreadPoolExecutor(max_workers=len(keys)) as ex: res=list(ex.map(one,keys))
print(f"{len(res)} film in {time.time()-t0:.0f}s · azioni {STAT}",flush=True)
with open(C.DATA/"soft67.jsonl","w",encoding="utf-8") as f:
    for r in res: f.write(json.dumps(r,ensure_ascii=False)+"\n")
idx=np.zeros((len(res),50),np.int32); w=np.zeros((len(res),50),np.float16); ks=[]
for q,r in enumerate(res): idx[q]=r["idx"]; w[q]=r["w"]; ks.append(r["key"])
np.savez_compressed(C.DATA/"soft67.npz",idx=idx,w=w,keys=np.array(ks))
kept=np.array([r["kept"] for r in res]); print(f"kept mediana {int(np.median(kept))} · 0-2: {int((kept<=2).sum())} · vuoti {sum(r['empty'] for r in res)} · none>0.2 {sum(r['none']>0.2 for r in res)}",flush=True)
for r in res:
    if r["key"] in ("movie:346698","movie:792307","movie:8587","movie:129","movie:597","movie:694","movie:872585","movie:381341","movie:150540","movie:155","movie:862","tv:94997"):
        print(f"\n{r['titolo'][:22]:22s} kept {r['kept']:2d} maxp {r['maxp']:.2f} none {r['none']:.2f} -> " + " · ".join(x[:24] for x in r['top10'][:5]),flush=True)
