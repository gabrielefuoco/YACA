"""Coerenza di genere del top-10 per genere, su b1 / grezzo kw+trama / ensemble."""
from __future__ import annotations
import numpy as np, scipy.sparse as sp
from services.graph_dense import config as C, data as D

def main():
    B=D.basic(); N=B["N"]
    X=D.tfidf(); V=D.vocab(); ge={c:t[3:] for t,c in V.items() if t.startswith("ge:")}
    gen=[set() for _ in range(N)]
    for i in range(N):
        row=X.getrow(i); gen[i]={ge[int(c)] for c in row.indices if int(c) in ge}
    Xp,hp,_=D.plot_embedding(B)
    cols=[c for t,c in V.items() if t.startswith("kw:")]
    Xk=X[:,cols].tocsr(); n=np.sqrt(np.asarray(Xk.multiply(Xk).sum(1)).ravel())+1e-9
    Xk=sp.diags(1.0/n)@Xk
    Zb1=np.load(C.DATA/"b1.npz")["Z"].astype(np.float32)
    Ze=np.load(C.DATA/"spazio-denso-ensemble.npz")["Z"].astype(np.float32)
    rng=np.random.default_rng(33); samp=rng.choice(N,1500,replace=False)
    from collections import defaultdict
    acc=defaultdict(lambda: defaultdict(list))
    for i in samp:
        i=int(i); g=gen[i]
        if not g: continue
        prim=sorted(g)[0]
        # b1
        cos=Zb1[i]@Zb1.T; cos[i]=-np.inf; top=np.argsort(-cos)[:10]
        acc[prim]["b1"].append(np.mean([len(g&gen[int(j)])/max(len(g|gen[int(j)]),1) for j in top]))
        # grezzo
        sc=Xp[i]@Xp.T+0.5*np.asarray((Xk[i]@Xk.T).todense()).ravel(); sc[i]=-np.inf
        top=np.argsort(-sc)[:10]
        acc[prim]["kw+trama"].append(np.mean([len(g&gen[int(j)])/max(len(g|gen[int(j)]),1) for j in top]))
        # ensemble
        cos=Ze[i]@Ze.T; cos[i]=-np.inf; top=np.argsort(-cos)[:10]
        acc[prim]["ensemble"].append(np.mean([len(g&gen[int(j)])/max(len(g|gen[int(j)]),1) for j in top]))
    righe=[(k, len(v["b1"]), np.mean(v["b1"]), np.mean(v["kw+trama"]), np.mean(v["ensemble"])) for k,v in acc.items() if len(v["b1"])>=25]
    righe.sort(key=lambda x: x[2])
    print(f"{'genere':20s} {'n':>4s} {'b1':>6s} {'kw+trama':>8s} {'ensemble':>8s}")
    for k,n_,a,b,c in righe:
        print(f"{k:20s} {n_:4d} {a:6.3f} {b:8.3f} {c:8.3f}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
