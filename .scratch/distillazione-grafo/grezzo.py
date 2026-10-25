"""Pavimento semantico grezzo: trama + lambda*keyword, zero addestramento.

Z = normalize([Bp, sqrt(lam)*Bk]) riproduce il punteggio combinato cos_trama + lam*cos_kw
usato dal target semantico. Valuta grafo (recall@20) e curato (calde/fredde), grezzo e centrato.

Uso: py .scratch/distillazione-grafo/grezzo.py [--lam 0.5]
"""
from __future__ import annotations
import argparse
import numpy as np
from services.graph_dense import config as C, data as D, eval as E
from services.graph import canon as K


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--lam", type=float, default=0.5)
    a = ap.parse_args(argv)
    B = D.basic(); S = D.triangle(); N = B["N"]
    sp_ = np.load(C.DATA / "split.npz"); split = {k: sp_[k] for k in sp_.files}
    zbl = np.load(C.DATA / "blocks.npz")
    Bp = zbl["Bp"].astype(np.float32); Bk = zbl["Bk"].astype(np.float32)
    Z = np.concatenate([Bp, np.sqrt(a.lam) * Bk], 1)
    Z /= (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
    SOG, BERS, US, COL, WARM = K.banco_curato_split(B["row_of"]); warm = WARM[COL]

    def valuta(nome, Zv):
        r, _ = E.recall_eval(Zv, B, split, S, 20)
        rank = np.zeros(len(SOG), np.float32)
        for j, u in enumerate(US):
            sc = Zv[int(u)] @ Zv.T; sc[int(u)] = -np.inf
            for i in np.where(COL == j)[0]:
                t = int(BERS[i]); rank[i] = 1 + float((sc > sc[t]).sum())
        cur = " · ".join(f"@{n} {np.mean(rank[warm] < n):.3f}/{np.mean(rank[~warm] < n):.3f}"
                         for n in (10, 20, 50, 100))
        print(f"{nome:16s} grafo {r['recall20']:.4f} · curato {cur}", flush=True)

    valuta(f"grezzo l={a.lam}", Z)
    # centrato per medio (come i modelli addestrati)
    tr = ~split["holdout"]; is_tv = B["is_tv"]
    Q = Z.copy()
    for k, m in ((0, ~is_tv), (1, is_tv)):
        Q[m] -= Z[tr & m].mean(0)
    Q /= (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
    valuta("grezzo centrato", Q)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
