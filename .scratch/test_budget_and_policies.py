"""test_budget_and_policies.py — Simula diverse interpretazioni di P1 e P2 e calcola le metriche esatte."""
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

import numpy as np
from graph.runtime import Engine
from graph import canon as K, interessi as I

def main():
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    print("Analisi approfondita su tutte le 10 timeline...")

    # Let's inspect baseline shelves first
    results = {}
    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)

        prof_has_movie = any(k.startswith("movie:") for k in chiavi)
        prof_has_series = any(k.startswith("tv:") for k in chiavi)

        # Baseline
        base_cov = set()
        for s in shs:
            base_cov.update(s.seeds_indices)

        # INTERPRETATION A:
        # P1 = Every shelf selected by baseline generates 2 rows (movie + series).
        # Total rows = 2 * len(shs).
        # P2 = Counterpart row generated only if profile has that medium in history.
        # If profile has no movies, suppress movie counterparts. If no series, suppress series counterparts.

        p1_rows_A = []
        p2_rows_A = []
        p2_suppressed_A = []

        for s in shs:
            # P1: movie version + series version
            p1_rows_A.append((s, "movie"))
            p1_rows_A.append((s, "series"))

            # P2:
            # Main row always included
            p2_rows_A.append((s, s.medium))
            # Counterpart row conditional on profile
            c_med = "series" if s.medium == "movie" else "movie"
            if c_med == "series" and not prof_has_series:
                p2_suppressed_A.append(f"{s.medium} cluster '{s.nome}' whose series counterpart is suppressed because profile has no series")
            elif c_med == "movie" and not prof_has_movie:
                p2_suppressed_A.append(f"{s.medium} cluster '{s.nome}' whose movie counterpart is suppressed because profile has no movies")
            else:
                p2_rows_A.append((s, c_med))

        # INTERPRETATION B:
        # Counterpart row generated only if the CLUSTER itself has seeds of that medium (or if profile has that medium in cluster).
        # Under P1: every shelf generates counterpart regardless of cluster seeds.
        # Under P2_cluster: counterpart generated only if cluster has seeds of that medium.
        p2_rows_B = []
        p2_suppressed_B = []
        for s in shs:
            p2_rows_B.append((s, s.medium))
            c_med = "series" if s.medium == "movie" else "movie"
            c_seeds = [m for m in s.semi_membri if m["medium"] == c_med]
            if not c_seeds:
                p2_suppressed_B.append(f"{s.medium} cluster '{s.nome}' whose {c_med} counterpart is suppressed because cluster has no {c_med}")
            else:
                p2_rows_B.append((s, c_med))

        results[p] = {
            "semi_tot": len(chiavi),
            "prof_has_movie": prof_has_movie,
            "prof_has_series": prof_has_series,
            "base_shs": len(shs),
            "base_cov": len(base_cov),
            "p1_rows_A": len(p1_rows_A),
            "p2_rows_A": len(p2_rows_A),
            "p2_suppressed_A": p2_suppressed_A,
            "p2_rows_B": len(p2_rows_B),
            "p2_suppressed_B": p2_suppressed_B,
        }

    print("\n" + "="*80)
    print(f"{'Profilo':16} {'Semi':>5} {'Base Shs':>8} {'Base Cov':>8} | {'P1 Rows':>8} | {'P2(prof)':>8} {'P2(prof) Sup':>12} | {'P2(clus)':>8} {'P2(clus) Sup':>12}")
    print("="*80)
    for p, r in results.items():
        print(f"{p:16} {r['semi_tot']:5d} {r['base_shs']:8d} {r['base_cov']:8d} | {r['p1_rows_A']:8d} | {r['p2_rows_A']:8d} {len(r['p2_suppressed_A']):12d} | {r['p2_rows_B']:8d} {len(r['p2_suppressed_B']):12d}")

if __name__ == "__main__":
    main()
