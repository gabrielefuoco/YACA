"""Ensemble di Z gia' addestrati (late fusion) e correzione di hubness (CSLS) su lc150."""
from __future__ import annotations
import itertools
import numpy as np
from services.graph_dense import config as C, data as D

MODELS = ["lc150", "lc100", "m1", "t1", "a10", "a12", "a7", "f3"]
TOPK = 150


def veri_top20(S, test):
    out = []
    for i in test:
        row = S.getrow(int(i)); o = np.argsort(-row.data)[:20]
        out.append(set(int(row.indices[x]) for x in o))
    return out


def top_idx(Z, test, k=TOPK):
    out = np.zeros((len(test), k), np.int64)
    for t, i in enumerate(test):
        i = int(i); cos = Z[i] @ Z.T; cos[i] = -np.inf
        out[t] = np.argpartition(-cos, k)[:k]
    return out


def main():
    B = D.basic(); S = D.triangle()
    sp = np.load(C.DATA / "split.npz"); split = {k: sp[k] for k in sp.files}
    test = split["test_idx"]; veri = veri_top20(S, test)
    Zs, tops = {}, {}
    for n in MODELS:
        Z = np.load(C.DATA / f"{n}.npz")["Z"].astype(np.float32)
        Zs[n] = Z
        tops[n] = top_idx(Z, test)
        print("pronto", n, flush=True)

    def recall(combo, pesi=None):
        pesi = pesi or [1.0] * len(combo)
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

    combos = [("lc150",), ("lc150", "t1"), ("lc150", "t1", "a10"),
              ("lc150", "t1", "a12"), ("lc150", "m1", "t1", "a10", "a12", "a7"),
              ("lc150", "t1", "a10", "a12")]
    for c in combos:
        print(f"ensemble {'+'.join(c):45s} {recall(c):.4f}", flush=True)
    print(f"ensemble lc150 x2 + t1 + a10{'':24s} {recall(('lc150','t1','a10'), (2.0,1.0,1.0)):.4f}", flush=True)

    # CSLS: r(x) = similarita' media verso un campione; s' = cos - 0.5*(r_i + r_j)
    Z = Zs["lc150"]; rng = np.random.default_rng(3)
    camp = rng.choice(B["N"], 4096, replace=False)
    r = (Z @ Z[camp].T).mean(1)
    rec = np.zeros(len(test), np.float32)
    for t, i in enumerate(test):
        i = int(i); cos = Z[i] @ Z.T
        cos = cos - 0.5 * (r[i] + r)
        cos[i] = -np.inf
        top = np.argpartition(-cos, 20)[:20]
        rec[t] = len(veri[t] & set(int(x) for x in top)) / max(len(veri[t]), 1)
    print(f"lc150 + CSLS (campione 4k){'':25s} {rec.mean():.4f}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
