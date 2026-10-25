"""Confronto finale: recall@20 sul grafo + recall curato (calde/fredde) per piu' spazi."""
from __future__ import annotations
import sys
import numpy as np, scipy.sparse as sp
from services.graph_dense import config as C, data as D, eval as E
from services.graph import canon as K

def main(nomi):
    B=D.basic(); S=D.triangle()
    sp_=np.load(C.DATA/"split.npz"); split={k:sp_[k] for k in sp_.files}
    SOGG, BERS, US, COL, WARM = K.banco_curato_split(B["row_of"]); warm=WARM[COL]
    for nome in nomi:
        Z=np.load(C.DATA/f"{nome}.npz")["Z"].astype(np.float32)
        r,_=E.recall_eval(Z,B,split,S,20)
        rank=np.zeros(len(SOGG),np.float32)
        for j,u in enumerate(US):
            sc=Z[int(u)]@Z.T; sc[int(u)]=-np.inf
            for i in np.where(COL==j)[0]:
                t=int(BERS[i]); rank[i]=1+float((sc>sc[t]).sum())
        cur=" · ".join(f"@{n} {np.mean(rank[warm]<n):.3f}/{np.mean(rank[~warm]<n):.3f}" for n in (10,20,50,100))
        print(f"{nome:24s} grafo {r['recall20']:.4f} · curato {cur}", flush=True)
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:] or ["sem1"]))
