"""Griglia di pesi e reciprocal rank fusion sull'ensemble lc150/t1/a10 (top-150 per modello)."""
from __future__ import annotations
import numpy as np
from services.graph_dense import config as C, data as D

MODELS = ["lc150", "t1", "a10", "a12"]
TOPK = 150


def main():
    B = D.basic(); S = D.triangle()
    sp = np.load(C.DATA / "split.npz"); split = {k: sp[k] for k in sp.files}
    test = split["test_idx"]
    veri = []
    for i in test:
        row = S.getrow(int(i)); o = np.argsort(-row.data)[:20]
        veri.append(set(int(row.indices[x]) for x in o))
    Zs, tops, ranks = {}, {}, {}
    for n in MODELS:
        Z = np.load(C.DATA / f"{n}.npz")["Z"].astype(np.float32)
        Zs[n] = Z
        T = np.zeros((len(test), TOPK), np.int64)
        for t, i in enumerate(test):
            i = int(i); cos = Z[i] @ Z.T; cos[i] = -np.inf
            T[t] = np.argpartition(-cos, TOPK)[:TOPK]
        tops[n] = T
        ranks[n] = np.zeros((len(test), B["N"]), np.int16)  # rango per RRF (0 = fuori)
        for t in range(len(test)):
            ranks[n][t, T[t]] = np.arange(1, TOPK + 1, dtype=np.int16)
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

    def rrf(combo, pesi, k=60):
        rec = np.zeros(len(test), np.float32)
        for t, i in enumerate(test):
            i = int(i)
            cand = np.unique(np.concatenate([tops[n][t] for n in combo]))
            s = np.zeros(len(cand), np.float32)
            for n, w in zip(combo, pesi):
                rk = ranks[n][t, cand]
                s += w * np.where(rk > 0, 1.0 / (k + rk), 0.0)
            top = cand[np.argsort(-s)[:20]]
            rec[t] = len(veri[t] & set(int(x) for x in top)) / max(len(veri[t]), 1)
        return rec.mean()

    grid = [((("lc150", "t1"), (2, 1))), ((("lc150", "t1"), (3, 1))), ((("lc150", "t1"), (1, 1))),
            ((("lc150", "t1", "a10"), (2, 1, 1))), ((("lc150", "t1", "a10"), (3, 1, 1))),
            ((("lc150", "t1", "a10"), (2, 2, 1))), ((("lc150", "t1", "a10"), (3, 2, 1))),
            ((("lc150", "t1", "a10"), (4, 1, 1))), ((("lc150", "t1", "a10"), (2, 1, 0.5))),
            ((("lc150", "t1", "a10", "a12"), (2, 1, 1, 0.5)))]
    for combo, pesi in grid:
        print(f"late {'+'.join(combo):28s} pesi {pesi} -> {late(combo, pesi):.4f}", flush=True)
    for combo, pesi in [(("lc150", "t1", "a10"), (2, 1, 1)), ((("lc150", "t1"), (2, 1))),
                        ((("lc150", "t1", "a10"), (1, 1, 1)))]:
        print(f"rrf  {'+'.join(combo):28s} pesi {pesi} -> {rrf(combo, pesi):.4f}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
