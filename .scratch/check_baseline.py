from __future__ import annotations

import sys
from pathlib import Path
from collections import Counter
import numpy as np
import scipy.sparse as sp

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

PROFILI_10 = [
    "sangam456",
    "hammers-lists",
    "sappss",
    "flixinatoor99",
    "moppierhead",
    "castoffcrown",
    "warnok",
    "pepsipex",
    "carverclan",
    "1jacobjohn",
]

def main():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()

    print(f"{'Profilo':15s} | {'Tot':4s} | {'Elig':4s} | {'Tax':3s} | {'N=6 Cov':8s} | {'N=8 Cov':8s} | {'All Elig Cov':12s}")
    print("-" * 75)

    for p in PROFILI_10:
        chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
        semi = [{"key": k, "plays": float(pl), "eta": float(et)} for k, pl, et in zip(chiavi, plays, eta)]
        n_tot = len(chiavi)

        righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)
        eta_arr = np.asarray(eta, dtype=np.float32)
        plays_arr = np.asarray(plays, dtype=np.float32)

        eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)
        n_elig = len(eligible)
        n_tax = sum(1 for c in eligible if c.nome_fonte == "tassonomia")

        all_elig_seeds = set()
        for c in eligible:
            all_elig_seeds.update(c.seeds_indices)
        cov_all = len(all_elig_seeds) / n_tot * 100.0

        # Served N=6
        served_6 = I.scaffali(engine, semi, n=6, W_aff=W)
        cov_6_seeds = set()
        for s in served_6:
            cov_6_seeds.update(s.seeds_indices)
        cov_6 = len(cov_6_seeds) / n_tot * 100.0

        # Served N=8
        served_8 = I.scaffali(engine, semi, n=8, W_aff=W)
        cov_8_seeds = set()
        for s in served_8:
            cov_8_seeds.update(s.seeds_indices)
        cov_8 = len(cov_8_seeds) / n_tot * 100.0

        print(f"{p:15s} | {n_tot:4d} | {n_elig:4d} | {n_tax:3d} | {cov_6:5.1f}% ({len(served_6)}) | {cov_8:5.1f}% ({len(served_8)}) | {cov_all:5.1f}%")

if __name__ == "__main__":
    main()
