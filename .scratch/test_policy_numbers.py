"""test_policy_numbers.py — Calcola esattamente i numeri per tutte le varianti di P1 e P2."""
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

    print("=== MISURAZIONI POLITICHE DI MEDIO ===")

    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)

        prof_has_movie = any(k.startswith("movie:") for k in chiavi)
        prof_has_series = any(k.startswith("tv:") for k in chiavi)

        # Baseline
        base_covered = set()
        for s in shs:
            base_covered.update(s.seeds_indices)
        n_base_shs = len(shs)
        n_base_cov = len(base_covered)

        # Case 1: P1 (Pure double: each shelf produces 2 rows: 1 movie row + 1 series row)
        # Suppressed rows under P1: 0
        p1_rows = len(shs) * 2

        # Case 2: P2 (Conditional on profile history having that medium)
        # If profile has no movies, suppress movie counterparts.
        # If profile has no series, suppress series counterparts.
        p2_suppressed = []
        p2_rows = 0
        for s in shs:
            # Main row of shelf:
            p2_rows += 1
            # Counterpart row:
            counterpart_medium = "series" if s.medium == "movie" else "movie"
            if counterpart_medium == "series" and not prof_has_series:
                p2_suppressed.append(f"{s.medium} cluster '{s.nome}' whose series counterpart is suppressed because profile has no series")
            elif counterpart_medium == "movie" and not prof_has_movie:
                p2_suppressed.append(f"{s.medium} cluster '{s.nome}' whose movie counterpart is suppressed because profile has no movies")
            else:
                p2_rows += 1

        # Case 3: What if P1 / P2 rows are generated from clusters where members are strictly homogeneous?
        # Let's count how many clusters have both movie and series members vs single-medium members
        n_mixed_clusters = 0
        n_single_clusters = 0
        for s in shs:
            mov_cnt = sum(1 for m in s.semi_membri if m["medium"] == "movie")
            ser_cnt = sum(1 for m in s.semi_membri if m["medium"] == "series")
            if mov_cnt > 0 and ser_cnt > 0:
                n_mixed_clusters += 1
            else:
                n_single_clusters += 1

        print(f"\nPROFILO: {p} (semi={len(chiavi)}, has_mov={prof_has_movie}, has_ser={prof_has_series})")
        print(f"  Baseline: {n_base_shs} scaffali, {n_base_cov} semi coperti")
        print(f"  P1 (Double): {p1_rows} righe")
        print(f"  P2 (Conditional profile-level): {p2_rows} righe, {len(p2_suppressed)} soppressi")
        for sup in p2_suppressed:
            print(f"    - {sup}")
        print(f"  Cluster composizione: {n_mixed_clusters} misti, {n_single_clusters} omogenei")

if __name__ == "__main__":
    main()
