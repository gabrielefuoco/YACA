"""Mercury sceglie la variante migliore per ogni titolo (40 titoli x 10 varianti)."""
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
            "lg":getattr(r,"original_language",""),"crew":_nomi(getattr(r,cr))[:2],"cast":_nomi(getattr(r,"cast"))[:5],
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
KEY=os.environ.get("OPENROUTER_API_KEY") or __import__("json").load(open("C:/Users/gabri/.pi/agent/auth.json"))["openrouter"]["key"]; MODEL=os.environ.get("JEV_MODEL","inception/mercury-decide:free")
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
G=pickle.load(open(C.DATA/"rerank-eval.pkl","rb")); KEYS,LAM,OUT=G["keys"],G["lam"],G["out"]
LAB=[f"lambda={l}" for l in LAM]
def desc(l):
    if l==0: return "Pure latent similarity of the dense model: no behaviour boost at all."
    return (f"Neighbours re-ranked with a behaviour boost lambda={l}: higher lambda pushes the ranking toward "
            "audience / co-vision behaviour and away from pure latent similarity.")
CRIT={l:desc(l) for l in LAM}
INSTR=("The lists below contain the 20 nearest neighbours of the film described in a dense similarity space. "
       "They differ ONLY in how strongly the ranking was pushed toward AUDIENCE / co-vision behaviour (lambda) versus pure latent similarity (lambda=0). "
       "Pick the list that is the best set of films SIMILAR to the film described (theme, tone, style, intended audience). "
       "Same brand/title, same release window or broad popularity alone do not count. A children's cartoon is not similar to an "
       "adult live-action film even with the same brand. Judge the quality of the whole list, not one title.")
def one(k):
    i=int(ro[k]); st=card(k,i)
    for l in LAM:
        st += "\nLIST lambda=%s:\n" % l + "\n".join("- "+de(x) for x in OUT[(k,l)])
    a=ask(st,{"best":{"type":"choice","instructions":INSTR,"criteria":CRIT}})["best"]
    return {"key":k,"titolo":B["titoli"][i],"choice":a.get("choice"),"prob":a.get("probabilities",{}),"conf":a.get("confidence")}
OUTP=C.DATA/"rerank-mercury.jsonl"
res=[json.loads(l) for l in open(OUTP,encoding="utf-8")] if OUTP.exists() else []
done={r["key"] for r in res}
todo=[k for k in KEYS if k in ro and k not in done]
print("da fare:",len(todo))
with ThreadPoolExecutor(max_workers=8) as ex, open(OUTP,"a",encoding="utf-8") as fh:
    fut={ex.submit(one,k):k for k in todo}
    for fu in as_completed(fut):
        try: r=fu.result()
        except Exception as e: print("ERR",fut[fu],e); continue
        fh.write(json.dumps(r,ensure_ascii=False)+"\n"); fh.flush(); res.append(r); print("ok",r["titolo"],r["choice"],flush=True)
agg={l:0.0 for l in LAB}
for r in res:
    for l in LAB: agg[l]+=float(r["prob"].get(l,0))
n=max(1,len(res)); print("\n=== aggregato (media prob) ===")
for l,v in sorted(agg.items(),key=lambda x:-x[1]): print(f"{l:12s} {v/n:.3f}")
