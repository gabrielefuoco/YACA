"""measure_coverage_and_waiver.py — Misura copertura semi esatta con e senza waiver e per P1/P2."""
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

    print("=== MISURA COPERTURA SEMI E POLICY ===")

    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)

        prof_has_movie = any(k.startswith("movie:") for k in chiavi)
        prof_has_series = any(k.startswith("tv:") for k in chiavi)

        # Baseline:
        # Currently, each shelf in shs contains ALL seeds in s.seeds_indices (mixed)
        base_covered = set()
        for s in shs:
            base_covered.update(s.seeds_indices)

        # Strict homogeneous members:
        # In a row of medium M, members can ONLY be seeds of medium M.
        # If a cluster is served as medium M, only seeds of medium M are members.
        strict_covered = set()
        for s in shs:
            for idx in s.seeds_indices:
                k = engine.keys[righe_from_chiavi(chiavi, engine)[idx]]
                med = "series" if k.startswith("tv:") else "movie"
                if med == s.medium:
                    strict_covered.add(idx)

        # If P1 is in place (both movie and series versions are served):
        # Movie row has movie members; series row has series members.
        # So ALL seeds of BOTH media are covered!
        p1_covered = set(base_covered)

        # If P2 is in place:
        # A counterpart row is created if profile/cluster has that medium.
        # If counterpart is created, both media seeds are covered.
        # If counterpart is suppressed, only the shelf's medium seeds are covered.
        p2_covered = set()
        for s in shs:
            # Main row covers its medium
            for idx in s.seeds_indices:
                k = engine.keys[righe_from_chiavi(chiavi, engine)[idx]]
                med = "series" if k.startswith("tv:") else "movie"
                if med == s.medium:
                    p2_covered.add(idx)
            # Counterpart row if profile has that medium
            c_med = "series" if s.medium == "movie" else "movie"
            has_c_med = prof_has_series if c_med == "series" else prof_has_movie
            if has_c_med:
                for idx in s.seeds_indices:
                    k = engine.keys[righe_from_chiavi(chiavi, engine)[idx]]
                    med = "series" if k.startswith("tv:") else "movie"
                    if med == c_med:
                        p2_covered.add(idx)

        print(f"\n{p:16} (semi={len(chiavi):3d})")
        print(f"  Baseline coperti:     {len(base_covered):3d}")
        print(f"  P1 coperti:           {len(p1_covered):3d}")
        print(f"  P2 (prof) coperti:    {len(p2_covered):3d}")
        print(f"  Strict (no counterp): {len(strict_covered):3d}")

def righe_from_chiavi(chiavi, engine):
    return [engine.row_of[k] for k in chiavi]

if __name__ == "__main__":
    main()
