"""Test di prodotto in miniatura: due titoli, top-20. Salva b2-w05.npz per riuso."""
import sys
import numpy as np, torch
from services.graph_dense import config as C, data as D
from services.graph_dense.train_b1 import BlockStudent, _batch_meta

def main(keys):
    B=D.basic(); N=B["N"]; S=D.triangle(); ro=B["row_of"]
    zbl=np.load(C.DATA/"blocks.npz"); Bp=zbl["Bp"].astype(np.float32); Bk=zbl["Bk"].astype(np.float32)
    keep=zbl["keep"]; X=D.features(B,extra=True)[:,keep].tocsr(); dev="cuda"
    m=BlockStudent(X.shape[1],d_meta=512).to(dev)
    m.load_state_dict(torch.load(C.DATA/"b2-model.pt",map_location=dev,weights_only=True)); m.eval()
    H=np.zeros((N,512),np.float32)
    with torch.no_grad():
        for st in range(0,N,2048):
            rows=np.arange(st,min(st+2048,N)); idx,off,val=_batch_meta(X,rows,np.random.default_rng(0),drop=False)
            h=torch.nn.functional.gelu(m.ln(m.bag(idx.to(dev),off.to(dev),per_sample_weights=val.to(dev))))
            H[rows]=torch.nn.functional.normalize(m.proj(h+m.res(h)),dim=1).float().cpu().numpy()
    WM=0.5
    Z=np.concatenate([0.8*Bp,0.57*Bk,WM*H],1); Z/=(np.linalg.norm(Z,axis=1,keepdims=True)+1e-9)
    is_tv=B["is_tv"]; tr=~np.load(C.DATA/"split.npz")["holdout"]
    for k,msk in ((0,~is_tv),(1,is_tv)):
        mu=Z[tr&msk].mean(0); Z[msk]-=mu
    Z/=(np.linalg.norm(Z,axis=1,keepdims=True)+1e-9)
    np.savez_compressed(C.DATA/"b2-w05.npz", Z=Z.astype(np.float16))
    V=D.vocab(); ge={c:t[3:] for t,c in V.items() if t.startswith("ge:")}
    def gen(i):
        row=X.getrow(i); return sorted({ge[int(c)] for c in row.indices if int(c) in ge})
    for key in keys:
        i=ro[key]; row=S.getrow(i); o=np.argsort(-row.data)[:20]; grafo=set(int(row.indices[x]) for x in o)
        cos=Z[i]@Z.T; cos[i]=-np.inf; top=np.argsort(-cos)[:20]
        print(f"\n## {B['titoli'][i]} · {gen(i)} · bolla {int(B['mem'][i])} · VOT {int(B['VOT'][i])}")
        for k,j in enumerate(top,1):
            mark="✓" if int(j) in grafo else " "
            a=int(B["ANNO"][int(j)]) if B["ANNO"][int(j)]>0 else 0
            print(f"{k:2d}. {mark} {B['titoli'][int(j)][:52]:52s} ({a}) {cos[j]:.3f}")
    return 0

if __name__=="__main__":
    raise SystemExit(main(sys.argv[1:] or ["movie:792307","tv:94997"]))
