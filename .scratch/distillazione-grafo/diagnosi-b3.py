"""Diagnosi dei punti di rottura di b3: top-10 per singolo blocco (trama/keyword/meta) + gate."""
from __future__ import annotations
import numpy as np, torch, torch.nn.functional as F
from services.graph_dense import config as C, data as D
from services.graph_dense.train_b1 import _batch_meta
from services.graph_dense.train_b3 import BlockStudentG

B=D.basic(); N=B["N"]; ro=B["row_of"]
z=np.load(C.DATA/"b3-en-b3.npz"); Z=z["Z"].astype(np.float32); G=z["G"].astype(np.float32)
Bp=np.load(C.DATA/"trama-qwen3b-en.bak.npy").astype(np.float32)
Bp/=(np.linalg.norm(Bp,axis=1,keepdims=True)+1e-9)
Bk=np.load(C.DATA/"blocks.npz")["Bk"].astype(np.float32)
keep=np.load(C.DATA/"blocks.npz")["keep"]; X=D.features(B,extra=True)[:,keep].tocsr()
dev="cuda" if torch.cuda.is_available() else "cpu"
m=BlockStudentG(X.shape[1],d_meta=512).to(dev)
m.load_state_dict(torch.load(C.DATA/"b3-en-model.pt",map_location=dev,weights_only=True)); m.eval()
H=np.zeros((N,512),np.float32)
with torch.no_grad():
    for st in range(0,N,2048):
        rows=np.arange(st,min(st+2048,N)); idx,off,val=_batch_meta(X,rows,np.random.default_rng(0),drop=False)
        h=F.gelu(m.ln(m.bag(idx.to(dev),off.to(dev),per_sample_weights=val.to(dev))))
        h=F.normalize(m.proj(h+m.res(h)),dim=1); H[rows]=h.float().cpu().numpy()
def t(i):
    a=int(B["ANNO"][int(i)]) if B["ANNO"][int(i)]>0 else 0
    return f"{B['titoli'][int(i)][:40]} ({a})" if a else B["titoli"][int(i)][:40]
def top(S_,i,k=10):
    c=S_[i]@S_.T; c[i]=-np.inf; return np.argsort(-c)[:k], c
for key in ("movie:346698","movie:150540","movie:597","movie:872585"):
    i=ro[key]; print(f"\n=== {B['titoli'][i]} · gate {G[i][0]:.2f}/{G[i][1]:.2f}/{G[i][2]:.2f}")
    for nome,Mat in (("TRAMA",Bp),("KEYWORD",Bk),("META",H),("COMBINATO",Z)):
        idx,c=top(Mat,i)
        print(f"  {nome:9s}: " + " | ".join(f"{t(j)[:30]} {c[j]:.2f}" for j in idx[:6]))
