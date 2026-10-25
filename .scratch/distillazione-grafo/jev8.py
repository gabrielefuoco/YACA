"""Jev con scheda completa del film + 6 pool; 6 casi."""
import json, os, urllib.request, urllib.error
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
for tipo,f,crew in (("movie","movies.parquet","directors"),("tv","tv.parquet","created_by")):
    d=pd.read_parquet(C.TMDB/f,columns=["id","genres","runtime","original_language",crew,"cast","production_companies","keywords"])
    for r in d.itertuples(index=False):
        k=f"{tipo}:{int(r.id)}"
        INFO[k]={"gen":", ".join(_nomi(r.genres)),"rt":getattr(r,"runtime",None),
                 "lg":getattr(r,"original_language",""),"crew":_nomi(getattr(r,crew))[:2],
                 "cast":_nomi(getattr(r,"cast"))[:5],"co":_nomi(getattr(r,"production_companies"))[:3],
                 "kw":_nomi(getattr(r,"keywords"))[:8]}
def yr(i): return int(date[i]//365.25+1970) if date[i]>0 else "?"
def desc(j):
    j=int(j); k=_rev.get(j); I=INFO.get(k,{})
    return f"{B['titoli'][j]} ({yr(j)}) [{I.get('gen','')}] ({I.get('rt','?')} min) — {(ovm.get(k,'') or '')[:70]}"
def card(k,I,i):
    s=f"FILM: {B['titoli'][i]} ({yr(i)})\nGENRES: {I.get('gen','')}\nRUNTIME: {I.get('rt','?')} min\nLANGUAGE: {I.get('lg','')}\n"
    if I.get('crew'): s+=f"DIRECTOR/CREATOR: {', '.join(I['crew'])}\n"
    if I.get('cast'): s+=f"CAST: {', '.join(I['cast'])}\n"
    if I.get('co'): s+=f"COMPANIES: {', '.join(I['co'])}\n"
    if I.get('kw'): s+=f"KEYWORDS: {', '.join(I['kw'])}\n"
    s+=f"OVERVIEW: {(ovm.get(k,'') or '')[:350]}\n"
    return s
_rev={r:k for k,r in ro.items()}
CASES=[("movie:872585","Oppenheimer"),("movie:792307","Povere creature!"),("movie:381341","Perfetti sconosciuti"),
       ("movie:346698","Barbie"),("movie:150540","Inside Out"),("tv:94997","House of the Dragon")]
CRITERI={"cov":"Same MovieLens audience (real co-vision). Captures taste, but can include same-window releases.",
"trama":"Plot-summary similarity. Captures story/theme, can be fooled by names.",
"kw":"Shared keywords/themes. Sparse, can be noisy.",
"meta":"Same cast, crew, studio, collection, era. Structural/franchise similarity.",
"cont":"Blend of plot, keywords and metadata.",
"combo":"Blend of audience co-vision and content.",
"none":"None of these lists is a good set of similar films."}
def pools(i):
    cov=Yc[i]@Yc.T; cov[i]=-1e4
    if not is_tv[i] and date[i]>0:
        near=(~is_tv)&(date>0)&(np.abs(date-date[i])<120); cov[near]*=0.2
    tr=Bp[i]@Bp.T; tr[i]=-1e4; kw=Bk[i]@Bk.T; kw[i]=-1e4; me=Bm[i]@Bm.T; me[i]=-1e4
    co=CONT[i]@CONT.T; co[i]=-1e4
    cb=0.5*(cov/(cov.max()+1e-9))+0.5*(co/(co.max()+1e-9)); cb[i]=-1e4
    scs={"cov":cov,"trama":tr,"kw":kw,"meta":me,"cont":co,"combo":cb}
    return {n:[desc(j) for j in np.argsort(-s)[:8]] for n,s in scs.items()}, scs
def main():
    key=os.environ.get("OPENROUTER_API_KEY") or json.load(open(os.path.expanduser("~/.pi/agent/auth.json")))["openrouter"]["key"]
    for k,nome in CASES:
        i=ro[k]; P,SCS=pools(i)
        stato=card(k,INFO.get(k,{}),i)
        for n in ("cov","trama","kw","meta","cont","combo"):
            stato+=f"\nLIST {n.upper()}:\n"+"\n".join("- "+x for x in P[n])
        b={"model":os.environ.get("JEV_MODEL","typesafe/jev-1.14"),"state":stato,"questions":{"best":{"type":"choice",
           "instructions":"Which candidate list is the BEST set of films SIMILAR to the film described (theme, tone, style, intended audience)? Same brand/title, same release window or broad popularity alone do not count. A children's cartoon is not similar to an adult live-action film even with the same brand. If none is good, choose none.",
           "criteria":CRITERI}}}
        req=urllib.request.Request("https://openrouter.ai/api/alpha/decisions",data=json.dumps(b).encode(),
            headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"})
        try:
            with urllib.request.urlopen(req,timeout=90) as r: ans=json.load(r)["answers"]["best"]
            print(f"\n### {nome}\nJEV: {json.dumps(ans)}",flush=True)
            pr=ans.get("probabilities",{}); w={k2:v for k2,v in pr.items() if k2!="none" and v>0}; tot=sum(w.values()) or 1
            mix=np.zeros(N,np.float32)
            for k2,v in w.items(): sc=SCS[k2].copy(); sc[i]=-1e4; mix+=(v/tot)*(sc/(sc.max()+1e-9))
            mix[i]=-1e4
            print("TARGET: "+" · ".join(desc(j) for j in np.argsort(-mix)[:6])+f" · none={pr.get('none',0):.2f}",flush=True)
        except urllib.error.HTTPError as e: print(f"\n### {nome} HTTP {e.code} {e.read(200).decode()[:200]}",flush=True)
        except Exception as e: print(f"\n### {nome} ERR {e}",flush=True)
if __name__=="__main__": main()
