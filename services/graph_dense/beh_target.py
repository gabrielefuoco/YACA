"""Target comportamentale per Z_beh: top-50 di beh_puro = 0.5*graph + 0.5*Yc_full.

Uso: py -m services.graph_dense.beh_target
Output: data/beh-target-v2.npz (idx (N,50) int32, w (N,50) fp16)
"""
from __future__ import annotations

import numpy as np

from . import config as C
from . import data as D

TOPK = 50


def main():
    B = D.basic(); N = B["N"]; is_tv = B["is_tv"]
    date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.float32)
    Yc = np.load(C.DATA / "yc-full.npz")["Yc_full"].astype(np.float32)
    S = D.triangle().tocsr()
    keep = np.load(C.DATA / "canon-clean.npz")["keep"]
    idx = np.full((N, TOPK), -1, np.int32)
    w = np.zeros((N, TOPK), np.float16)
    for i in range(N):
        if not keep[i]:
            continue
        cov = Yc[i] @ Yc.T
        cov[i] = -1e4
        if not is_tv[i] and date[i] > 0:
            near = (~is_tv) & (date > 0) & (np.abs(date - date[i]) < 120)
            cov[near] *= 0.2
        row = S.getrow(i)
        g = np.zeros(N, np.float32); g[row.indices] = row.data; g[i] = -1e4
        beh = 0.5 * (g / (g.max() + 1e-9)) + 0.5 * (cov / (cov.max() + 1e-9))
        top = np.argsort(-beh)[:TOPK]
        v = np.maximum(beh[top], 0.0)
        v = v / (v.sum() + 1e-9)
        idx[i] = top
        w[i] = v.astype(np.float16)
        if i % 5000 == 0:
            print(f"{i}/{N}", flush=True)
    np.savez_compressed(C.DATA / "beh-target-v2.npz", idx=idx, w=w)
    print("scritto", C.DATA / "beh-target-v2.npz", int((idx >= 0).any(1).sum()), "/", N)


if __name__ == "__main__":
    main()
