"""Confronto testa a testa: b10 puro, m1 puro, b10+rerank, m1+rerank. Mercury giudice."""
import json, os, pickle, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np, pandas as pd
from services.graph_dense import config as C, data as D
from services.graph_dense.data import _nomi

B=D.basic(); ro=B["row_of"]; date=np.load(C.DATA/"uscite-ordinali.npy"); _rev={r:k for k,r in ro.items()}
ov=pd.read_parquet(C.DATA/"overview-en.parquet"); ovm={str(r.chiave):r.overview for r in ov.itertuples()}
INFO={}
for tipo,f,cr in (("movie","movies.parquet","directors"),("tv","tv.parquet","created_by")):
    d=pd.read_parquet(C.TMDB/f,columns=["id","genres","runtime","original_language",cr,"cast","production_companies","keywords"])
    for r in d.itertuples(index=False):
        INFO[f"{tipo}:{int(r.id)}"]={"gen":", ".join(_nomi(r.genres)),"rt":getattr(r,"runtime",None),
            "crew":_nomi(getattr(r,cr))[:2],"cast":_nomi(getattr(r,"cast"))[:5],
            "co":_nomi(getattr(r,"production_companies"))[:3],"kw":_nomi(getattr(r,"keywords"))[:8]}
def yr(i): return int(date[i]//365.25+1970) if date[i]>0 else "?"
def de(j):
    j=int(j); k=_rev.get(j); I=INFO.get(k,{})
    return f"{B['titoli'][j]} ({yr(j)}) [{I.get('gen','')}] — {(ovm.get(k,'') or '')[:60]}"
def card(k,i):
    I=INFO.get(k,{}); s=f"FILM: {B['titoli'][i]} ({yr(i)})\nGENRES: {I.get('gen','')}\nRUNTIME: {I.get('rt','?')} min\n"
    for lab,key in (("DIRECTOR/CREATOR","crew"),("CAST","cast"),("COMPANIES","co"),("KEYWORDS","kw")):
        if I.get(key): s+=f"{lab}: {', '.join(I[key])}\n"
    return s+f"OVERVIEW: {(ovm.get(k,'') or '')[:300]}\n"
KEY=os.environ.get("OPENROUTER_API_KEY") or json.load(open(os.path.expanduser("~/.pi/agent/auth.json")))["openrouter"]["key"]
MODEL=os.environ.get("JEV_MODEL","inception/mercury-decide:free")
def ask(state,questions):
    body=json.dumps({"model":MODEL,"state":state,"questions":questions}).encode()
    req=urllib.request.Request("https://openrouter.ai/api/alpha/decisions",data=body,
        headers={"Authorization":f"Bearer {KEY}","Content-Type":"application/json"})
    for t in range(8):
        try:
            with urllib.request.urlopen(req,timeout=180) as r: return json.loads(r.read())["answers"]
        except urllib.error.HTTPError as e:
            if e.code in (429,500,502,503,504): time.sleep(0.5+0.5*t); continue
            raise
    raise RuntimeError("give up")
Gb=pickle.load(open(C.DATA/"rerank-eval.pkl","rb")); Gm=pickle.load(open(C.DATA/"rerank-eval-m1.pkl","rb"))
KEYS=[k for k in Gb["keys"] if k in ro]
LISTE=[("b10",Gb,0.0),("m1",Gm,0.0),("b10+rerank",Gb,0.3),("m1+rerank",Gm,0.3)]
CRIT={"b10":"Nearest neighbours in the b10 dense space (plot + keywords + behaviour-student + metadata), pure similarity, no rerank.",
      "m1":"Nearest neighbours in the m1 dense space (field embeddings, content only: plot + keywords + metadata), pure similarity, no rerank.",
      "b10+rerank":"b10 neighbours re-ranked with a behaviour boost (audience / co-vision), lambda=0.3.",
      "m1+rerank":"m1 neighbours re-ranked with a behaviour boost (audience / co-vision), lambda=0.3."}
INSTR=("The four lists below contain the 20 nearest neighbours of the film described, produced by two different dense models "
       "(b10, m1) and, for each, also re-ranked with a behaviour boost (audience / co-vision) of lambda=0.3. "
       "Pick the list that is the best set of films SIMILAR to the film described (theme, tone, style, intended audience). "
       "Same brand/title, same release window or broad popularity alone do not count. A children's cartoon is not similar to an "
       "adult live-action film even with the same brand. Judge the quality of the whole list, not one title.")
def one(k):
    i=int(ro[k]); st=card(k,i)
    for lab,G,lam in LISTE:
        st += "\nLIST %s:\n" % lab + "\n".join("- "+de(x) for x in G["out"][(k,lam)])
    a=ask(st,{"best":{"type":"choice","instructions":INSTR,"criteria":CRIT}})["best"]
    return {"key":k,"titolo":B["titoli"][i],"choice":a.get("choice"),"prob":a.get("probabilities",{}),"conf":a.get("confidence")}
OUTP=C.DATA/"confronto-spazi.jsonl"
res=[json.loads(l) for l in open(OUTP,encoding="utf-8")] if OUTP.exists() else []
done={r["key"] for r in res}
todo=[k for k in KEYS if k not in done]
print("da fare:",len(todo))
with ThreadPoolExecutor(max_workers=6) as ex, open(OUTP,"a",encoding="utf-8") as fh:
    fut={ex.submit(one,k):k for k in todo}
    for fu in as_completed(fut):
        try: r=fu.result()
        except Exception as e: print("ERR",fut[fu],e); continue
        fh.write(json.dumps(r,ensure_ascii=False)+"\n"); fh.flush(); res.append(r); print("ok",r["titolo"],r["choice"],flush=True)
agg={l:0.0 for l in CRIT}
for r in res:
    for l in CRIT: agg[l]+=float(r["prob"].get(l,0))
n=max(1,len(res))
print("\n=== media prob ===")
for l,v in sorted(agg.items(),key=lambda x:-x[1]): print(f"  {l:12s} {v/n:.3f}")
