"""E1 — AGE FILTER Experiment
Sweep N in {90, 180, 365} days across the 10 timelines.
A cluster whose MOST RECENT seed is older than N days is dropped.
"""
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

def greedy_select(eligible: list[I.Shelf], engine: Engine, chiavi: list[str], max_n: int = 6) -> list[I.Shelf]:
    def ensure_top10(cand: I.Shelf) -> None:
        if not cand.top10_cands:
            semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": 1.0} for i in cand.seeds_indices]
            racs = engine.raccomanda(semi_rac, cap=10, medium=cand.medium, esclusi=chiavi)
            cand.top10_cands = set(r["key"] for r in racs[:10])
            cand.titoli = racs[:10]

    chosen: list[I.Shelf] = []
    covered_seeds: set[int] = set()
    seen_tax: set[str] = set()
    seen_colls: set[int] = set()

    while len(chosen) < max_n:
        best_cand: I.Shelf | None = None
        best_key: tuple[int, float, float] | None = None

        for cand in eligible:
            if any(c is cand for c in chosen):
                continue
            if cand.nome_fonte == "tassonomia" and cand.nome in seen_tax:
                continue
            if cand.dom_coll is not None and cand.dom_coll in seen_colls:
                continue

            uncovered_added = len(set(cand.seeds_indices) - covered_seeds)
            if uncovered_added <= 0:
                continue

            cand_key = (uncovered_added, -cand.min_eta, cand.consistenza)
            if best_cand is not None and cand_key <= best_key:
                continue

            ensure_top10(cand)
            if any(I.jaccard(cand.top10_cands, s.top10_cands) >= 0.5 for s in chosen):
                continue

            best_cand = cand
            best_key = cand_key

        if best_cand is None:
            break

        ensure_top10(best_cand)
        chosen.append(best_cand)
        covered_seeds.update(best_cand.seeds_indices)
        if best_cand.nome_fonte == "tassonomia":
            seen_tax.add(best_cand.nome)
        if best_cand.dom_coll is not None:
            seen_colls.add(best_cand.dom_coll)

    return chosen


def run_e1():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()

    N_VALS = [90, 180, 365]

    results = {}

    print("Running E1 across 10 profiles...")
    for p in PROFILI_10:
        chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
        n_seeds = len(chiavi)
        righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)
        eta_arr = np.asarray(eta, dtype=np.float32)
        plays_arr = np.asarray(plays, dtype=np.float32)

        base_eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)

        # Base consistency
        S = I.calcola_sim_affinity(righe_arr, W)
        for sh in base_eligible:
            sz = len(sh.seeds_indices)
            if sz >= 2:
                sub = S[np.ix_(sh.seeds_indices, sh.seeds_indices)]
                iu = np.triu_indices(sz, k=1)
                sh.consistenza = round(float(np.mean(sub[iu])), 4)
            else:
                sh.consistenza = 0.0

        all_base_seeds = set(s for c in base_eligible for s in c.seeds_indices)

        # Baseline served
        base_served_6 = greedy_select(list(base_eligible), engine, chiavi, max_n=6)
        cov_base_served_6 = len(set(s for c in base_served_6 for s in c.seeds_indices))

        base_served_8 = greedy_select(list(base_eligible), engine, chiavi, max_n=8)
        cov_base_served_8 = len(set(s for c in base_served_8 for s in c.seeds_indices))

        results[p] = {
            "n_seeds": n_seeds,
            "base_n_cl": len(base_eligible),
            "base_cov_all": len(all_base_seeds) / n_seeds * 100.0,
            "base_served_6": len(base_served_6),
            "base_cov_6": cov_base_served_6 / n_seeds * 100.0,
            "base_served_8": len(base_served_8),
            "base_cov_8": cov_base_served_8 / n_seeds * 100.0,
            "sweeps": {},
        }

        for N in N_VALS:
            survived = [c for c in base_eligible if c.min_eta <= N]
            dropped = [c for c in base_eligible if c.min_eta > N]
            dropped_tax = sum(1 for c in dropped if c.nome_fonte == "tassonomia")
            dropped_tax_names = [c.nome for c in dropped if c.nome_fonte == "tassonomia"]

            surv_seeds = set(s for c in survived for s in c.seeds_indices)
            cov_surv_all = len(surv_seeds) / n_seeds * 100.0

            served_6 = greedy_select(list(survived), engine, chiavi, max_n=6)
            cov_s6_seeds = len(set(s for c in served_6 for s in c.seeds_indices))

            served_8 = greedy_select(list(survived), engine, chiavi, max_n=8)
            cov_s8_seeds = len(set(s for c in served_8 for s in c.seeds_indices))

            results[p]["sweeps"][N] = {
                "n_dropped": len(dropped),
                "n_survived": len(survived),
                "dropped_tax": dropped_tax,
                "dropped_tax_names": dropped_tax_names,
                "cov_all_pct": cov_surv_all,
                "served_6": len(served_6),
                "cov_6_pct": cov_s6_seeds / n_seeds * 100.0,
                "served_8": len(served_8),
                "cov_8_pct": cov_s8_seeds / n_seeds * 100.0,
            }

    return results

if __name__ == "__main__":
    res = run_e1()
    import json
    Path(".scratch/e1_results.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    print("Saved .scratch/e1_results.json")
