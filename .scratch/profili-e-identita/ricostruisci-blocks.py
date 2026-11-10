"""Ricostruisce `blocks.npz` — lo strato d'ingresso dello studente — con la ricetta originale.

L'originale (`.scratch/graph_dense-archive/blocks.py`) e' stato cancellato col ticket 15, ma la
ricetta e' deterministica: proiezione casuale ±1/sqrt(k) con SEED=42 su keyword normalizzate,
blocco trama 1024-d, maschera `keep` delle colonne meta senza keyword. Stessa ricetta, stesso file.

  py .scratch/profili-e-identita/ricostruisci-blocks.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from services.graph_dense import data as D, config as C  # noqa: E402

KPROJ = 512
SEED = 42


def main() -> int:
    t0 = time.time()
    B = D.basic(); N = B["N"]
    print(f"canone {N:,}", flush=True)

    Xp, hp, _ = D.plot_embedding(B)
    print(f"trama pronta {Xp.shape} · copertura {hp.mean():.1%} ({time.time()-t0:.0f}s)", flush=True)

    X = D.tfidf(); V = D.vocab()
    kwcols = np.array([c for t, c in V.items() if t.startswith("kw:")], dtype=np.int64)
    Xk = X[:, kwcols].tocsr()
    n = np.sqrt(np.asarray(Xk.multiply(Xk).sum(1)).ravel()) + 1e-9
    Xk = sp.diags(1.0 / n) @ Xk
    rng = np.random.default_rng(SEED)
    R = rng.choice(np.array([-1.0, 1.0], np.float32), size=(len(kwcols), KPROJ)) / np.sqrt(KPROJ)
    Bk = np.asarray(Xk @ R, dtype=np.float32)
    Bk /= (np.linalg.norm(Bk, axis=1, keepdims=True) + 1e-9)
    print(f"keyword proiettate {Bk.shape} ({time.time()-t0:.0f}s)", flush=True)

    Xm = D.features(B, extra=True)
    keep = np.ones(Xm.shape[1], bool)
    keep[kwcols] = False
    out = C.DATA / "blocks.npz"
    np.savez_compressed(out, Bp=Xp.astype(np.float16), Bk=Bk.astype(np.float16),
                        keep=keep, kwcols=kwcols, KPROJ=np.array(KPROJ), SEED=np.array(SEED))
    print(f"scritto {out} · meta {Xm.shape[1]:,} colonne · tenute {int(keep.sum()):,} · "
          f"{out.stat().st_size/2**20:.0f} MB · {time.time()-t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
