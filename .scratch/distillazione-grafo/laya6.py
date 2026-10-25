import json,time,urllib.request,numpy as np,pandas as pd
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
    return f"{B['titoli'][j]} ({yr(j)}) [{I.get('gen','')}] ({I.get('rt','?')} min) — {(ovm.get(k,'') or '')[:60]}"
def card(k,i):
    I=INFO.get(k,{})
    s=f"FILM: {B['titoli'][i]} ({yr(i)})\nGENRES: {I.get('gen','')}\nRUNTIME: {I.get('rt','?')} min\n"
    for lab,key in (("DIRECTOR","crew"),("CAST","cast"),("COMPANIES","co"),("KEYWORDS","kw")):
        if I.get(key): s+=f"{lab}: {', '.join(I[key])}\n"
    return s+f"OVERVIEW: {(ovm.get(k,'') or '')[:300]}\n"
CR={"cov":"Same MovieLens audience.","trama":"Plot-summary similarity.","kw":"Shared keywords.","meta":"Same cast, crew, studio, collection, era.","cont":"Blend plot+keywords+metadata.","combo":"Blend co-vision+content.","none":"None is good."}
CASES=[("movie:872585","Oppenheimer"),("movie:792307","Povere creature!"),("movie:381341","Perfetti"),("movie:346698","Barbie"),("movie:150540","Inside Out"),("tv:94997","House of the Dragon")]
for k,nome in CASES:
    i=ro[k]
    cov=Yc[i]@Yc.T; cov[i]=-1e4
    if not is_tv[i] and date[i]>0:
        near=(~is_tv)&(date>0)&(np.abs(date-date[i])<120); cov[near]*=0.2
    tr=Bp[i]@Bp.T; tr[i]=-1e4; kw=Bk[i]@Bk.T; kw[i]=-1e4; me=Bm[i]@Bm.T; me[i]=-1e4
    co=CONT[i]@CONT.T; co[i]=-1e4
    cb=0.5*(cov/(cov.max()+1e-9))+0.5*(co/(co.max()+1e-9)); cb[i]=-1e4
    S={"cov":cov,"trama":tr,"kw":kw,"meta":me,"cont":co,"combo":cb}
    st=card(k,i)
    for n in ("cov","trama","kw","meta","cont","combo"):
        st+=f"\nLIST {n.upper()}:\n"+"\n".join("- "+de(j) for j in np.argsort(-S[n])[:8])
    b={"model":"laya8k","state":st,"questions":{"best":{"type":"choice","instructions":"Which list is the BEST set of films SIMILAR to the film (theme, tone, style, audience)? Same brand/title, release window or popularity alone do not count. A children's cartoon is not similar to an adult live-action film even with the same brand. If none is good choose none.","criteria":CR}}}
    t0=time.time()
    req=urllib.request.Request("http://localhost:11434/v1/systemone",data=json.dumps(b).encode(),headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=120) as r: a=json.load(r)["answers"]["best"]
    print(f"\n{nome}: {a['choice']} ({a['probabilities']}) conf {a.get('confidence'):.2f} · {time.time()-t0:.2f}s",flush=True)
