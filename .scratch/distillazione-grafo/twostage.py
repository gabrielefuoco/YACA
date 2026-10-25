"""Due stadi Mercury: (1) scelta del pool, (2) filtro dei 50 candidati del pool scelto."""
import json, os, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd
from services.graph_dense import config as C, data as D
from services.graph_dense.data import _nomi

B=D.basic(); ro=B["row_of"]; N=B["N"]; is_tv=B["is_tv"]
Yc=np.load(C.DATA/"ml-yc.npz")["Yc"].astype(np.float32); Yc/=(np.linalg.norm(Yc,axis=1,keepdims=True)+1e-9)
Bp=np.load(C.DATA/"trama-qwen3b.npy").astype(np.float32); Bp/=(np.linalg.norm(Bp,axis=1,keepdims=True)+1e-9)
Bk=np.load(C.DATA/"blocks.npz")["Bk"].astype(np.float32); Bm=np.load(C.DATA/"meta-jl.npz")["Bm"].astype(np.float32)
CONT=np.concatenate([Bp,np.sqrt(0.5)*Bk,np.sqrt(0.5)*Bm],1); CONT/=(np.linalg.norm(CONT,axis=1,keepdims=True)+1e-9)
date=np.load(C.DATA/"uscite-ordinali.npy")
ov=pd.read_parquet(C.DATA/"overview-en.parquet"); ovm={str(r.chiave):r.overview for r in ov.itertuples()}
INFO={}
for tipo,f,cr in (("movie","movies.parquet","directors"),("tv","tv.parquet","created_by")):
    d=pd.read_parquet(C.TMDB/f,columns=["id","genres","runtime","original_language",cr,"cast","production_companies","keywords"])
    for r in d.itertuples(index=False):
        INFO[f"{tipo}:{int(r.id)}"]={"gen":", ".join(_nomi(r.genres)),"rt":getattr(r,"runtime",None),"lg":getattr(r,"original_language",""),
        "crew":_nomi(getattr(r,cr))[:2],"cast":_nomi(getattr(r,"cast"))[:5],"co":_nomi(getattr(r,"production_companies"))[:3],"kw":_nomi(getattr(r,"keywords"))[:8]}
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
CR={"cov":"Same MovieLens audience. Can include same-window releases.","trama":"Plot-summary similarity. Can be fooled by names.",
"kw":"Shared keywords. Sparse, noisy.","meta":"Same cast, crew, studio, collection, era.","cont":"Blend plot+keywords+metadata.",
"combo":"Blend co-vision+content.","none":"None of these lists is a good set of similar films."}
KEY=os.environ["OPENROUTER_API_KEY"]; MODEL=os.environ.get("JEV_MODEL","inception/mercury-decide:free")
def ask(state, questions):
    b={"model":MODEL,"state":state,"questions":questions}
    req=urllib.request.Request("https://openrouter.ai/api/alpha/decisions",data=json.dumps(b).encode(),
        headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=120) as r: return json.load(r)["answers"]
def one(k):
    i=ro[k]; S,has=scores(i)
    lists={n:([de(j) for j in np.argsort(-s)[:8]] if (n!="cov" or has) else ["(no MovieLens co-vision)"]) for n,s in S.items()}
    st=card(k,i)
    for n in ("cov","trama","kw","meta","cont","combo"):
        st+=f"\nLIST {n.upper()}:\n"+"\n".join("- "+x for x in lists[n])
    a1=ask(st,{"best":{"type":"choice","instructions":"Which candidate list is the BEST set of films SIMILAR to the film described (theme, tone, style, intended audience)? Same brand/title, release window or broad popularity alone do not count. A children's cartoon is not similar to an adult live-action film even with the same brand. If none is good, choose none.","criteria":CR}})["best"]
    pr=a1.get("probabilities",{}); valid={x:v for x,v in pr.items() if x!="none" and (x!="cov" or has) and v>0}
    pool=max(valid,key=valid.get) if valid else "cont"
    cand=np.argsort(-S[pool])[:50]
    st2=card(k,i)+"\nCANDIDATI:\n"+"\n".join(f"{q+1}. {de(j)}" for q,j in enumerate(cand))
    qs={f"c{q+1}":{"type":"noul","instructions":f"Is candidate {q+1} a good similar film for the film described (theme, tone, style, intended audience)? Same broad popularity or same release window is not enough."} for q in range(len(cand))}
    a2=ask(st2,qs)
    p=np.array([a2[f"c{q+1}"]["noul"] for q in range(len(cand))],np.float32)
    o=np.argsort(-p); idx=cand[o].tolist(); w=p[o]
    kept=int((p>=0.3).sum()); empty=bool(p.max()<0.2)
    return {"key":k,"titolo":B["titoli"][i],"pool":pool,"choice":a1.get("choice"),"none":pr.get("none",0),
            "conf":a1.get("confidence"),"kept":kept,"maxp":float(p.max()),"empty":empty,
            "top10":[B["titoli"][int(j)] for j in idx[:10]],"idx":idx,"w":w.tolist()}
keys=[json.loads(l)["key"] for l in open(C.DATA/"mercury-sample100.jsonl",encoding="utf-8")]
t0=time.time()
with ThreadPoolExecutor(max_workers=8) as ex: res=list(ex.map(one,keys))
print(f"{len(res)} film in {time.time()-t0:.0f}s",flush=True)
with open(C.DATA/"twostage.jsonl","w",encoding="utf-8") as f:
    for r in res: f.write(json.dumps(r,ensure_ascii=False)+"\n")
from collections import Counter
print("pool:",dict(Counter(r["pool"] for r in res)))
kept=np.array([r["kept"] for r in res]); mx=np.array([r["maxp"] for r in res])
print(f"tenuti>=0.3: mediana {int(np.median(kept))} · min {kept.min()} · max {kept.max()} · 0-2 tenuti: {int((kept<=2).sum())}/{len(res)}")
print(f"vuoti (max<0.2): {sum(r['empty'] for r in res)} · none>0.2: {sum(r['none']>0.2 for r in res)}")
for r in res[:22]:
    print(f"\n{r['key']} {r['titolo'][:24]:24s} {r['pool']:5s} kept {r['kept']:2d} max {r['maxp']:.2f} empty {r['empty']} -> " + " · ".join(x[:24] for x in r['top10'][:5]))
