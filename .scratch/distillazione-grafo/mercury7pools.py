"""Mercury con 7 pool: grafo (teacher) + cov/trama/kw/meta/cont/combo. 7 casi (incluso Titanic)."""
import json,os,time,urllib.request,numpy as np,pandas as pd
from services.graph_dense import config as C, data as D
from services.graph_dense.data import _nomi
B=D.basic(); ro=B["row_of"]; N=B["N"]; is_tv=B["is_tv"]; date=np.load(C.DATA/"uscite-ordinali.npy")
Yc=np.load(C.DATA/"ml-yc.npz")["Yc"].astype(np.float32); Yc/=(np.linalg.norm(Yc,axis=1,keepdims=True)+1e-9)
Bp=np.load(C.DATA/"trama-qwen3b.npy").astype(np.float32); Bp/=(np.linalg.norm(Bp,axis=1,keepdims=True)+1e-9)
Bk=np.load(C.DATA/"blocks.npz")["Bk"].astype(np.float32); Bm=np.load(C.DATA/"meta-jl.npz")["Bm"].astype(np.float32)
CONT=np.concatenate([Bp,np.sqrt(0.5)*Bk,np.sqrt(0.5)*Bm],1); CONT/=(np.linalg.norm(CONT,axis=1,keepdims=True)+1e-9)
S=D.triangle()
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
CR={"graph":"The knowledge graph's own co-viewing neighborhood (the teacher): real audience and curated structure.",
"cov":"Same MovieLens audience only.","trama":"Plot-summary similarity.","kw":"Shared keywords.","meta":"Same cast, crew, studio, collection, era.","cont":"Blend plot+keywords+metadata.","combo":"Blend co-vision+content.","none":"None is good."}
CASES=[("movie:597","Titanic"),("movie:872585","Oppenheimer"),("movie:792307","Povere creature!"),("movie:381341","Perfetti"),("movie:346698","Barbie"),("movie:150540","Inside Out"),("tv:94997","House of the Dragon")]
KEY=os.environ["OPENROUTER_API_KEY"]; MODEL=os.environ.get("JEV_MODEL","inception/mercury-decide:free")
for k,nome in CASES:
    i=ro[k]
    cov=Yc[i]@Yc.T; cov[i]=-1e4
    if not is_tv[i] and date[i]>0:
        near=(~is_tv)&(date>0)&(np.abs(date-date[i])<120); cov[near]*=0.2
    tr=Bp[i]@Bp.T; tr[i]=-1e4; kw=Bk[i]@Bk.T; kw[i]=-1e4; me=Bm[i]@Bm.T; me[i]=-1e4
    co=CONT[i]@CONT.T; co[i]=-1e4; cb=0.5*(cov/(cov.max()+1e-9))+0.5*(co/(co.max()+1e-9)); cb[i]=-1e4
    row=S.getrow(i); gs=np.zeros(N,np.float32); gs[row.indices]=row.data
    S7={"graph":gs,"cov":cov,"trama":tr,"kw":kw,"meta":me,"cont":co,"combo":cb}
    st=card(k,i)
    for n in ("graph","cov","trama","kw","meta","cont","combo"):
        st+=f"\nLIST {n.upper()}:\n"+"\n".join("- "+de(j) for j in np.argsort(-S7[n])[:8])
    b={"model":MODEL,"state":st,"questions":{"best":{"type":"choice","instructions":"Which candidate list is the BEST set of films SIMILAR to the film described (theme, tone, style, intended audience)? Same brand/title, release window or broad popularity alone do not count. A children's cartoon is not similar to an adult live-action film even with the same brand. If none is good, choose none.","criteria":CR}}}
    req=urllib.request.Request("https://openrouter.ai/api/alpha/decisions",data=json.dumps(b).encode(),headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=120) as r: a=json.load(r)["answers"]["best"]
    pr=a["probabilities"]; best=sorted(pr.items(),key=lambda x:-x[1])[:3]
    print(f"{nome:18s} -> {a['choice']} ({', '.join(f'{x}:{v:.2f}' for x,v in best)})",flush=True)
