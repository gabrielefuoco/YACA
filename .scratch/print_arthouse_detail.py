"""Inspect the arthouse shelf on castoffcrown for M1 and M2 in full detail."""
from __future__ import annotations

import json
import numpy as np
import pandas as pd
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

def main():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()

    df_m = pd.read_parquet('.cache/tmdb/movies.parquet', columns=['id', 'title', 'vote_count', 'release_date'])
    m_dict = df_m.set_index('id').to_dict(orient='index')

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")
    righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)

    # Import run_m1_profile and run_m2_profile from experiment_e3_merge
    from experiment_e3_merge import run_m1_profile, run_m2_profile

    print("================================================================================")
    print("M1 (W_aff): Arthouse shelf on castoffcrown across tau in {0.03, 0.05, 0.08, 0.12}")
    print("================================================================================")
    for tau in [0.03, 0.05, 0.08, 0.12]:
        res = run_m1_profile(engine, "castoffcrown", tau_m=tau, rep="W_aff", W_aff=W, max_n=8)
        # Find arthouse shelf (look for Paterson, Il filo nascosto, Past Lives, Perfect Days)
        art_shelves = [
            s for s in res["chosen"]
            if any(x in [m["titolo"] for m in s.semi_membri] for x in ["Il filo nascosto", "Paterson", "Past Lives", "Perfect Days", "Beau Travail"])
        ]
        print(f"\n--- M1 (W_aff) tau = {tau} (Total served: {len(res['chosen'])}, cov = {res['coverage_pct']:.1f}%) ---")
        for sh in art_shelves:
            print(f"Shelf: '{sh.nome}' | size = {sh.size} | medium = {sh.medium} | fonte = {sh.nome_fonte}")
            print(f"  3 Rep Seeds: {[m['titolo'] for m in sh.semi_rappresentativi[:3]]}")
            all_m_tits = [m['titolo'] for m in sh.semi_membri]
            print(f"  Contains key seeds: {[x for x in ['Il filo nascosto', 'Paterson', 'Past Lives', 'Drive My Car', 'Beau Travail', 'Ghost in the Shell'] if x in all_m_tits]}")
            # Ensure top10 recommendations
            semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": 1.0} for i in sh.seeds_indices]
            racs = engine.raccomanda(semi_rac, cap=10, medium=sh.medium, esclusi=chiavi)
            print("  Top 10 candidates recommended:")
            for r in racs:
                k = r["key"]
                mid = int(k.split(":")[1])
                tit = titles[engine.row_of[k]]
                yr = int(years[engine.row_of[k]]) if years is not None and not np.isnan(years[engine.row_of[k]]) else 0
                vc = m_dict.get(mid, {}).get("vote_count", 0)
                print(f"    - {tit} ({yr}) — vote_count: {vc}")

    print("\n================================================================================")
    print("M1 (Tr): Arthouse shelf on castoffcrown across tau in {0.03, 0.05, 0.08, 0.12}")
    print("================================================================================")
    for tau in [0.03, 0.05, 0.08, 0.12]:
        res = run_m1_profile(engine, "castoffcrown", tau_m=tau, rep="Tr", W_aff=W, max_n=8)
        art_shelves = [
            s for s in res["chosen"]
            if any(x in [m["titolo"] for m in s.semi_membri] for x in ["Il filo nascosto", "Paterson", "Past Lives", "Perfect Days", "Beau Travail"])
        ]
        print(f"\n--- M1 (Tr) tau = {tau} (Total served: {len(res['chosen'])}, cov = {res['coverage_pct']:.1f}%) ---")
        for sh in art_shelves:
            print(f"Shelf: '{sh.nome}' | size = {sh.size} | medium = {sh.medium} | fonte = {sh.nome_fonte}")
            print(f"  3 Rep Seeds: {[m['titolo'] for m in sh.semi_rappresentativi[:3]]}")
            all_m_tits = [m['titolo'] for m in sh.semi_membri]
            print(f"  Contains key seeds: {[x for x in ['Il filo nascosto', 'Paterson', 'Past Lives', 'Drive My Car', 'Beau Travail', 'Ghost in the Shell'] if x in all_m_tits]}")
            semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": 1.0} for i in sh.seeds_indices]
            racs = engine.raccomanda(semi_rac, cap=10, medium=sh.medium, esclusi=chiavi)
            print("  Top 10 candidates recommended:")
            for r in racs:
                k = r["key"]
                mid = int(k.split(":")[1])
                tit = titles[engine.row_of[k]]
                yr = int(years[engine.row_of[k]]) if years is not None and not np.isnan(years[engine.row_of[k]]) else 0
                vc = m_dict.get(mid, {}).get("vote_count", 0)
                print(f"    - {tit} ({yr}) — vote_count: {vc}")

    print("\n================================================================================")
    print("M2 (Soft Assignment): Arthouse shelf on castoffcrown")
    print("================================================================================")
    res_m2 = run_m2_profile(engine, "castoffcrown", tau_macro=0.03, sim_ratio=0.7, W_aff=W, max_n=8)
    art_shelves_m2 = [
        s for s in res_m2["chosen"]
        if any(x in [m["titolo"] for m in s.semi_membri] for x in ["Il filo nascosto", "Paterson", "Past Lives", "Perfect Days", "Beau Travail"])
    ]
    print(f"\n--- M2 (Total served: {len(res_m2['chosen'])}, cov = {res_m2['coverage_pct']:.1f}%) ---")
    for sh in art_shelves_m2:
        print(f"Shelf: '{sh.nome}' | size = {sh.size} | medium = {sh.medium} | fonte = {sh.nome_fonte}")
        print(f"  3 Rep Seeds: {[m['titolo'] for m in sh.semi_rappresentativi[:3]]}")
        all_m_tits = [m['titolo'] for m in sh.semi_membri]
        print(f"  Contains key seeds: {[x for x in ['Il filo nascosto', 'Paterson', 'Past Lives', 'Drive My Car', 'Beau Travail', 'Ghost in the Shell'] if x in all_m_tits]}")
        semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": 1.0} for i in sh.seeds_indices]
        racs = engine.raccomanda(semi_rac, cap=10, medium=sh.medium, esclusi=chiavi)
        print("  Top 10 candidates recommended:")
        for r in racs:
            k = r["key"]
            mid = int(k.split(":")[1])
            tit = titles[engine.row_of[k]]
            yr = int(years[engine.row_of[k]]) if years is not None and not np.isnan(years[engine.row_of[k]]) else 0
            vc = m_dict.get(mid, {}).get("vote_count", 0)
            print(f"    - {tit} ({yr}) — vote_count: {vc}")

if __name__ == "__main__":
    main()
