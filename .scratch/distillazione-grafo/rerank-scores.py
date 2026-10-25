"""Salva i punteggi del rerank (cos + 0.3*beh) per le top-20, b10 e m1."""
import pickle, numpy as np
from services.graph_dense import config as C, data as D
B=D.basic(); ro=B["row_of"]; N=B["N"]; is_tv=B["is_tv"]; date=np.load(C.DATA/"uscite-ordinali.npy")
Yc=np.load(C.DATA/"ml-yc.npz")["Yc"].astype(np.float32); Yc/=(np.linalg.norm(Yc,axis=1,keepdims=True)+1e-9)
S=D.triangle(); Zs={"b10":np.load(C.DATA/"b10.npz")["Z"].astype(np.float32),
                    "m1":np.load(C.DATA/"m1.npz")["Z"].astype(np.float32)}
G=pickle.load(open(C.DATA/"rerank-eval.pkl","rb")); KEYS=[k for k in G["keys"] if k in ro]
def beh(i):
    cov=Yc[i]@Yc.T; cov[i]=-1e4
    if not is_tv[i] and date[i]>0:
        near=(~is_tv)&(date>0)&(np.abs(date-date[i])<120); cov[near]*=0.2
    row=S.getrow(i); gs=np.zeros(N,np.float32); gs[row.indices]=row.data; gs[i]=-1e4
    return 0.5*(gs/(gs.max()+1e-9))+0.5*(cov/(cov.max()+1e-9))
out={}
for n,k in enumerate(KEYS):
    i=int(ro[k]); bh=beh(i)
    for nome,Z in Zs.items():
        cos=Z@Z[i]; cos[i]=-1e4; cand=np.argsort(-cos)[:50]
        sc=cos[cand]+0.3*bh[cand]; o=np.argsort(-sc)[:20]
        out[(k,nome)]={"idx":[int(x) for x in cand[o]],"score":[float(x) for x in sc[o]],
                       "cos":[float(x) for x in cos[cand[o]]],"beh":[float(x) for x in bh[cand[o]]]}
    print(f"{n+1}/{len(KEYS)}",flush=True)
pickle.dump(out,open(C.DATA/"rerank-scores.pkl","wb")); print("ok")
