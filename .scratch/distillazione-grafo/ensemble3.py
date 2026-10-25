"""Ensemble a quattro: lc150, lc150s (seed 7), t1, a10. Griglia di pesi."""
from __future__ import annotations
import numpy as np
from services.graph_dense import config as C, data as D

M = ["lc150", "lc150s", "t1", "a10"]
TOPK = 150


def main():
    B = D.basic(); S = D.triangle()
    sp = np.load(C.DATA / "split.npz"); split = {k: sp[k] for k in sp.files}
    test = split["test_idx"]
    veri = []
    for i in test:
        row = S.getrow(int(i)); o = np.argsort(-row.data)[:20]
        veri.append(set(int(row.indices[x]) for x in o))
    Zs, tops = {}, {}
    for n in M:
        Z = np.load(C.DATA / f"{n}.npz")["Z"].astype(np.float32); Zs[n] = Z
        T = np.zeros((len(test), TOPK), np.int64)
        for t, i in enumerate(test):
            i = int(i); cos = Z[i] @ Z.T; cos[i] = -np.inf
            T[t] = np.argpartition(-cos, TOPK)[:TOPK]
        tops[n] = T
        print("pronto", n, flush=True)

    def late(combo, pesi):
        rec = np.zeros(len(test), np.float32)
        for t, i in enumerate(test):
            i = int(i)
            cand = np.unique(np.concatenate([tops[n][t] for n in combo]))
            s = np.zeros(len(cand), np.float32)
            for n, w in zip(combo, pesi):
                s += w * (Zs[n][i] @ Zs[n][cand].T)
            top = cand[np.argsort(-s)[:20]]
            rec[t] = len(veri[t] & set(int(x) for x in top)) / max(len(veri[t]), 1)
        return rec.mean()

    grid = [((("lc150", "lc150s", "t1", "a10"), (3, 3, 1, 1))),
            ((("lc150", "lc150s", "t1", "a10"), (3, 2, 1, 1))),
            ((("lc150", "lc150s", "t1", "a10"), (2, 2, 1, 1))),
            ((("lc150", "lc150s", "t1", "a10"), (4, 2, 1, 1))),
            ((("lc150", "t1", "a10"), (3, 1, 1)))]
    for combo, pesi in grid:
        print(f"{'+'.join(combo):32s} {pesi} -> {late(combo, pesi):.4f}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
