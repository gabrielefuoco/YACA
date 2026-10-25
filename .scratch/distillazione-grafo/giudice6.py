import json,os,uuid,urllib.request,urllib.error, numpy as np, pandas as pd
from services.graph_dense import config as C, data as D
B=D.basic(); ro=B["row_of"]; N=B["N"]; is_tv=B["is_tv"]
Yc=np.load(C.DATA/"ml-yc.npz")["Yc"].astype(np.float32); Yc/=(np.linalg.norm(Yc,axis=1,keepdims=True)+1e-9)
Bp=np.load(C.DATA/"trama-qwen3b.npy").astype(np.float32); Bp/=(np.linalg.norm(Bp,axis=1,keepdims=True)+1e-9)
Bk=np.load(C.DATA/"blocks.npz")["Bk"].astype(np.float32); Bm=np.load(C.DATA/"meta-jl.npz")["Bm"].astype(np.float32)
CONT=np.concatenate([Bp,np.sqrt(0.5)*Bk,np.sqrt(0.5)*Bm],1); CONT/=(np.linalg.norm(CONT,axis=1,keepdims=True)+1e-9)
date=np.load(C.DATA/"uscite-ordinali.npy")
ov=pd.read_parquet(C.DATA/"overview-en.parquet"); ovm={str(r.chiave):r.overview for r in ov.itertuples()}
def yr(i): return int(date[i]//365.25+1970) if date[i]>0 else "?"
def t(i): return f"{B['titoli'][int(i)]} ({yr(int(i))})"
CASES=[("movie:872585","Oppenheimer"),("movie:792307","Povere creature!"),("movie:381341","Perfetti sconosciuti"),
       ("movie:346698","Barbie"),("movie:150540","Inside Out"),("tv:94997","House of the Dragon")]
def lists(key):
    i=ro[key]
    cc=CONT[i]@CONT.T; cc[i]=-1e4; tc=np.argsort(-cc)[:8]
    cy=Yc[i]@Yc.T; cy[i]=-1e4
    if not is_tv[i] and date[i]>0:
        near=(~is_tv)&(date>0)&(np.abs(date-date[i])<120); cy[near]*=0.2
    ty=np.argsort(-cy)[:8]
    return [t(j) for j in tc], [t(j) for j in ty]
k=json.load(open(os.path.expanduser("~/.pi/agent/auth.json")))["opencode-go"]["key"]
H={"Authorization":f"Bearer {k}","Content-Type":"application/json","User-Agent":"yaca-judge/1.0","Accept":"application/json","x-opencode-session":str(uuid.uuid4())}
def ask(state):
    b={"model":"qwen3.8-max","messages":[{"role":"user","content":"You are a film similarity judge. Given a film and two candidate neighbor lists, choose the list that is the better set of films SIMILAR to it (theme, style, genre, audience taste), not just 'watched in the same period'. Reply ONLY with JSON: {\"choice\":\"A|B|both|neither\",\"confidence\":0.0-1.0,\"reason\":\"short\"}.\n\n"+state}],"max_tokens":200}
    req=urllib.request.Request("https://opencode.ai/inference/go/v1/chat/completions",data=json.dumps(b).encode(),headers=H,method="POST")
    try:
        with urllib.request.urlopen(req,timeout=90) as r:
            j=json.load(r); return j["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e: return "ERR "+str(e.code)+" "+e.read(200).decode()[:200]
for key,nome in CASES:
    i=ro[key]; A,Bl=lists(key); state=f"FILM: {B['titoli'][i]} ({yr(i)})\nGENRES: {', '.join(sorted({x for x in []}))}\nOVERVIEW: {ovm.get(key,'')[:400]}\n\nLIST A (content: plot+keywords+metadata):\n"+"\n".join('- '+x for x in A)+"\n\nLIST B (MovieLens co-vision: same audience):\n"+"\n".join('- '+x for x in Bl)
    print(f"\n### {nome}\nA: {' · '.join(A)}\nB: {' · '.join(Bl)}\n-> {ask(state)[:300]}")
