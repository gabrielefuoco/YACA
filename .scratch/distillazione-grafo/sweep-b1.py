"""Frontiera di b1: ricalcola z con pesi diversi del blocco meta, senza riaddestrare."""
from __future__ import annotations
import numpy as np, torch
from services.graph_dense import config as C, data as D, eval as E
from services.graph_dense.train_b1 import BlockStudent, _batch_meta
from services.graph import canon as K

def main():
    B=D.basic(); S=D.triangle(); N=B["N"]
    sp_=np.load(C.DATA/"split.npz"); split={k:sp_[k] for k in sp_.files}
    test=split["test_idx"]
    SOBG, BERS, US, COL, WARM = K.banco_curato_split(B["row_of"]); warm=WARM[COL]
    zbl=np.load(C.DATA/"blocks.npz")
    Bp=torch.from_numpy(zbl["Bp"].astype(np.float32)); Bk=torch.from_numpy(zbl["Bk"].astype(np.float32))
    keep=zbl["keep"]; X=D.features(B, extra=True)[:, keep].tocsr()
    dev="cuda" if torch.cuda.is_available() else "cpu"
    m=BlockStudent(X.shape[1], d_meta=512).to(dev)
    m.load_state_dict(torch.load(C.DATA/"b2-model.pt", map_location=dev, weights_only=True))
    m.eval()
    H=np.zeros((N,512),np.float32)
    with torch.no_grad():
        for st in range(0,N,2048):
            rows=np.arange(st,min(st+2048,N)); idx,off,val=_batch_meta(X,rows,np.random.default_rng(0),drop=False)
            h=torch.nn.functional.gelu(m.ln(m.bag(idx.to(dev),off.to(dev),per_sample_weights=val.to(dev))))
            h=torch.nn.functional.normalize(m.proj(h+m.res(h)),dim=1); H[rows]=h.float().cpu().numpy()
    Bpn=Bp.numpy(); Bkn=Bk.numpy()
    sub=test[::3]  # 534 test per il grafo, per velocita'
    for wm in (0.2,0.35,0.5,0.7,1.0,1.4):
        Z=np.concatenate([0.8*Bpn, 0.57*Bkn, wm*H],1)
        Z/=(np.linalg.norm(Z,axis=1,keepdims=True)+1e-9)
        # grafo
        rec=np.full(len(sub),np.nan,np.float32)
        for t,i in enumerate(sub):
            i=int(i); row=S.getrow(i); o=np.argsort(-row.data)[:20]; veri=set(int(row.indices[x]) for x in o)
            cos=Z[i]@Z.T; cos[i]=-np.inf; top=np.argpartition(-cos,20)[:20]
            rec[t]=len(veri&set(int(x) for x in top))/len(veri)
        # curato
        rank=np.zeros(len(SOBG),np.float32)
        for j,u in enumerate(US):
            sc=Z[int(u)]@Z.T; sc[int(u)]=-np.inf
            for i in np.where(COL==j)[0]:
                t=int(BERS[i]); rank[i]=1+float((sc>sc[t]).sum())
        cur=" · ".join(f"@{n} {np.mean(rank[warm]<n):.3f}/{np.mean(rank[~warm]<n):.3f}" for n in (10,20,50,100))
        print(f"wm={wm:4.2f} · grafo {np.nanmean(rec):.4f} · curato {cur}", flush=True)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
