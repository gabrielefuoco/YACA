"""Costruisce i blocchi fissi del modello: trama (1024-d) e keyword (proiezione casuale 512-d).

La proiezione casuale ±1/sqrt(k) preserva i coseni (Johnson-Lindenstrauss): il blocco keyword
resta una versione densa e compatta del TF-IDF, non una sua reinterpretazione appresa.
Salva `data/blocks.npz`: Bp (N,1024), Bk (N,512), keep (maschera colonne di X_meta senza keyword).
"""
from __future__ import annotations
import time
import numpy as np
import scipy.sparse as sp
from . import config as C
from . import data as D

KPROJ = 512
SEED = 42


def main():
    t0 = time.time()
    B = D.basic(); N = B["N"]
    Xp, hp, _ = D.plot_embedding(B)
    X = D.tfidf(); V = D.vocab()
    kwcols = np.array([c for t, c in V.items() if t.startswith("kw:")], dtype=np.int64)
    Xk = X[:, kwcols].tocsr()
    n = np.sqrt(np.asarray(Xk.multiply(Xk).sum(1)).ravel()) + 1e-9
    Xk = sp.diags(1.0 / n) @ Xk
    rng = np.random.default_rng(SEED)
    R = rng.choice(np.array([-1.0, 1.0], np.float32),
                   size=(len(kwcols), KPROJ)) / np.sqrt(KPROJ)
    Bk = np.asarray(Xk @ R, dtype=np.float32)
    Bk /= (np.linalg.norm(Bk, axis=1, keepdims=True) + 1e-9)
    Xm = D.features(B, extra=True)
    keep = np.ones(Xm.shape[1], bool)
    keep[kwcols] = False
    np.savez_compressed(C.DATA / "blocks.npz", Bp=Xp.astype(np.float16),
                        Bk=Bk.astype(np.float16), keep=keep, kwcols=kwcols,
                        KPROJ=np.array(KPROJ), SEED=np.array(SEED))
    print(f"blocchi: Bp {Xp.shape} · Bk {Bk.shape} · keep {int(keep.sum()):,}/{len(keep):,} "
          f"· Bp pieni {hp.mean():.1%} · t {time.time()-t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
