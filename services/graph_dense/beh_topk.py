"""Costruisce il target comportamentale da B-mf (free512): top-K vicini + pesi.

B-mf e' la tabella libera addestrata solo sul target di grafo (nessun metadato). Qui se ne
estrae il top-50 per titolo, con peso = similarita' (>=0) normalizzata per riga.
Output `data/beh-top50.npz`: idx (N,K) int32, w (N,K) float16.
"""
from __future__ import annotations
import time
import numpy as np
from . import config as C
from . import data as D

K = 50
CHUNK = 2048


def main():
    t0 = time.time()
    B = D.basic(); N = B["N"]
    E = np.load(C.DATA / "free512.npz")["E"].astype(np.float32)
    E /= (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
    import torch
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    Et = torch.from_numpy(E).to(dev)
    idx = np.zeros((N, K), np.int32); w = np.zeros((N, K), np.float16)
    for st in range(0, N, CHUNK):
        rows = np.arange(st, min(st + CHUNK, N))
        S = Et[rows] @ Et.T
        S[torch.arange(len(rows)), torch.from_numpy(rows).to(dev)] = -1e4
        sc, ii = torch.topk(S, K, dim=1)
        sc = sc.clamp(min=0).float().cpu().numpy(); ii = ii.cpu().numpy()
        somma = sc.sum(1, keepdims=True); somma[somma <= 0] = 1
        idx[rows] = ii; w[rows] = (sc / somma).astype(np.float16)
        if st % (CHUNK * 8) == 0:
            print(f"  {st:,}/{N:,} · t {time.time()-t0:.0f}s", flush=True)
    np.savez_compressed(C.DATA / "beh-top50.npz", idx=idx, w=w, K=np.array(K))
    print(f"scritto beh-top50.npz · {N:,}x{K} · t {time.time()-t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
