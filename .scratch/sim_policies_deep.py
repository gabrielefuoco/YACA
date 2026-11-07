"""sim_policies_deep.py — Simulazione completa e misurazioni di P1 e P2 sui 10 profili."""
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

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    print("=== RACCOLTA DATI POLICY SUI 10 PROFILI ===")

    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)

        prof_has_movie = any(k.startswith("movie:") for k in chiavi)
        prof_has_series = any(k.startswith("tv:") for k in chiavi)

        print(f"\n=================== Profilo: {p} (Tot semi: {len(chiavi)}) ===================")
        print(f"Storia profilo: has_movies={prof_has_movie}, has_series={prof_has_series}")

        # Baseline stats
        base_covered = set()
        for s in shs:
            base_covered.update(s.seeds_indices)
        print(f"Baseline: {len(shs)} scaffali, {len(base_covered)} semi coperti")

        # Let's inspect each shelf
        for idx, s in enumerate(shs, 1):
            mov_members = [m for m in s.semi_membri if m["medium"] == "movie"]
            ser_members = [m for m in s.semi_membri if m["medium"] == "series"]
            print(f"  Shelf {idx}: '{s.nome}' ({s.medium}, {s.nome_fonte}) | Membri: {len(mov_members)} mov, {len(ser_members)} ser")

    # Let's inspect film-only clusters on the two long profiles (warnok, castoffcrown / pepsipex)
    # and print their series counterpart (3 seeds + 5 candidates)
    print("\n\n=== ESEMPI CONTROPARTI SERIE PER CLUSTER FILM-ONLY ===")
    long_profiles = ["warnok", "castoffcrown", "pepsipex"]
    for p in long_profiles:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)
        for s in shs:
            mov_members = [m for m in s.semi_membri if m["medium"] == "movie"]
            ser_members = [m for m in s.semi_membri if m["medium"] == "series"]
            if len(ser_members) == 0 and len(mov_members) > 0:
                print(f"\n--- Profilo {p}: Cluster Film-Only '{s.nome}' ({s.nome_fonte}) ---")
                print(f"Semi membri film: {len(mov_members)}")
                # 3 representative seeds
                semi_rep = s.semi_rappresentativi[:3]
                print("3 Semi rappresentativi (film):")
                for sr in semi_rep:
                    print(f"  * {sr.get('titolo')} ({sr.get('anno')}) [tmdb:{sr.get('tmdbId')}]")

                # Walk for series candidates (cross-medium walk)
                semi_rac = [
                    {"key": chiavi[i], "tipo": "watched", "peso": 1.0}
                    for i in s.seeds_indices
                ]
                tutti_esclusi = set(chiavi)
                racs_series = engine.raccomanda(semi_rac, cap=5, medium="series", esclusi=tutti_esclusi)
                print("5 Candidati serie raccomandati dalla controparte:")
                for r in racs_series:
                    k_c = r["key"]
                    r_idx = engine.row_of[k_c]
                    tit = titles[r_idx] if titles is not None else k_c
                    an = int(years[r_idx]) if years is not None else 0
                    print(f"  -> {tit} ({an}) [punteggio: {r['punteggio']:.6f}]")

if __name__ == "__main__":
    main()
