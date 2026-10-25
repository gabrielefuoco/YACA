"""Token condivisi con nomi corretti, inclusi i token extra (cl:, co:, ge:, du:, de:...)."""
import numpy as np, pandas as pd
from collections import Counter
from services.graph_dense import config as C, data as D
from services.graph_dense.data import _nomi, _durata
B=D.basic(); ro=B["row_of"]; V=D.vocab()
# ricostruisce i token extra (stessa logica di data.extra_features)
per=[[] for _ in range(B["N"])]
for tipo,f in (("movie","movies.parquet"),("tv","tv.parquet")):
    cols=["id","original_language","content_rating","runtime","production_countries","genres"]
    cols+= ["collection_id","writers","release_date"] if tipo=="movie" else ["number_of_seasons","first_air_date"]
    d=pd.read_parquet(C.TMDB/f,columns=cols)
    for r in d.itertuples(index=False):
        i=ro.get(f"{tipo}:{int(r.id)}")
        if i is None: continue
        t=per[i]; lg=r.original_language
        if isinstance(lg,str) and lg.strip(): t.append(f"lg:{lg.strip().lower()}")
        cr=r.content_rating
        if isinstance(cr,str) and cr.strip(): t.append(f"cr:{cr.strip().lower()}")
        rt=r.runtime
        if isinstance(rt,(int,float)) and rt==rt and 10<=rt<=400: t.append(f"du:{_durata(rt)}")
        ds=getattr(r,"release_date",None) if tipo=="movie" else getattr(r,"first_air_date",None)
        anno=int(ds[:4]) if isinstance(ds,str) and len(ds)>=4 and ds[:4].isdigit() else 0
        if anno>1880:
            dec=anno//10*10; t.append(f"de:{dec}")
            paesi=[c.strip().upper() for c in _nomi(r.production_countries)]
            fuori=[c for c in paesi if c not in ("US","GB")]
            if fuori and C.EXTRA_PG:
                for g in _nomi(r.genres)[:4]: t.append(f"pg:{fuori[0]}|{dec}|{g}")
        if tipo=="movie":
            cid=getattr(r,"collection_id",None)
            if isinstance(cid,(int,float)) and cid==cid: t.append(f"cl:{int(cid)}")
            for w in _nomi(r.writers): t.append(f"wr:{w}")
        else:
            se=getattr(r,"number_of_seasons",None)
            if isinstance(se,(int,float)) and se==se and se>=1: t.append(f"se:{min(int(se),5)}")
df=Counter(tok for toks in per for tok in set(toks))
tieni=sorted(t for t,c in df.items() if c>=3 or t[:3] in ("lg:","cr:","du:","se:"))
X=D.features(B,extra=True); keep=np.load(C.DATA/"blocks.npz")["keep"]; orig=np.where(keep)[0]
n_extra=len(tieni); off=X.shape[1]-n_extra; inv={c:t for t,c in V.items()}
tok=[inv.get(int(c)) or (tieni[int(c)-off] if int(c)>=off else f"h/struct:{int(c)}") for c in orig]
def trova(fram):
    for i,t in enumerate(B["titoli"]):
        if fram.lower() in t.lower(): return i
def coppia(a,fram):
    i=ro[a]; j=trova(fram)
    if j is None: print("non trovato",fram); return
    ra=X.getrow(i); rb=X.getrow(j)
    da={int(c):float(v) for c,v in zip(ra.indices,ra.data)}; db={int(c):float(v) for c,v in zip(rb.indices,rb.data)}
    # rimappa gli indici alle posizioni di keep
    pos={int(o):k for k,o in enumerate(orig)}
    da={pos[c]:v for c,v in da.items() if c in pos}; db={pos[c]:v for c,v in db.items() if c in pos}
    com=sorted(((da[c]*db[c],c) for c in set(da)&set(db)),reverse=True)
    print(f"\n{B['titoli'][i][:30]} <-> {B['titoli'][j][:30]}")
    print("  "+" | ".join(f"{tok[c][:34]} {s:.4f}" for s,c in com[:10]))
for a,f in (("movie:346698","grande citt"),("movie:346698","Dreamtopia"),("movie:150540","Pigeon"),
            ("movie:150540","Fantastic Flying"),("movie:346698","Red")):
    coppia(a,f)
