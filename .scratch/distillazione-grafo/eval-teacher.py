"""Valutazione sul teacher ripulito (top-20) con recall e NDCG@20, come chiesto dal senior."""
from __future__ import annotations
import sys
import numpy as np
from services.graph_dense import config as C, data as D, teacher as T

def main(names):
    B = D.basic(); S = D.triangle()
    sp = np.load(C.DATA / "split.npz"); split = {k: sp[k] for k in sp.files}
    hold, test = split["holdout"], split["test_idx"]
    tr = T.build(B, S, holdout_mask=np.zeros(B["N"], bool), salva=False)
    idx, w = tr["nbr_idx"], tr["nbr_w"]
    for nome in names:
        Z = np.load(C.DATA / f"{nome}.npz")["Z"].astype(np.float32)
        rec = []; ndcg = []
        for i in test:
            i = int(i)
            ok = idx[i] >= 0
            if not ok.any():
                continue
            cand = idx[i][ok][:20]; gain = w[i][ok][:20].astype(np.float64)
            veri = set(int(x) for x in cand)
            cos = Z[i] @ Z.T; cos[i] = -np.inf
            top = np.argpartition(-cos, 20)[:20]
            presi = list(int(x) for x in top)
            rec.append(len(veri & set(presi)) / len(veri))
            dcg = sum(1.0 / np.log2(2 + r) for r, x in enumerate(presi) if x in veri)
            ig = np.sort(gain)[::-1]
            idcg = sum(1.0 / np.log2(2 + r) for r in range(min(20, len(ig))))
            ndcg.append(dcg / idcg)
        print(f"{nome:4s} teacher recall@20 {np.mean(rec):.4f} · NDCG@20 {np.mean(ndcg):.4f}", flush=True)
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:] or ["m1"]))
