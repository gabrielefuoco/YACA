"""test_exact_p2_function.py — Implementa e testa la logica P2 su tutti i 10 profili."""
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

import numpy as np
from graph.runtime import Engine
from graph import canon as K, interessi as I

def run_test():
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    print("="*90)
    print(f"{'Profilo':16} {'Semi':>5} {'Floor':>5} {'Base Shs':>8} {'Base Cov':>8} {'P2 Rows':>8} {'P2 Cov':>8} {'P2 Sup':>8}")
    print("="*90)

    for p in profili:
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        righe = [engine.row_of[k] for k in chiavi]
        righe_arr = np.asarray(righe, dtype=np.int64)
        eta_list = list(range(len(chiavi)))
        plays_list = [1.0] * len(chiavi)
        eta_arr = np.asarray(eta_list, dtype=np.float32)
        plays_arr = np.asarray(plays_list, dtype=np.float32)

        floor = I.calcola_adaptive_floor(len(chiavi))

        prof_has_movie = any(k.startswith("movie:") for k in chiavi)
        prof_has_series = any(k.startswith("tv:") for k in chiavi)

        # Baseline
        base_shs = I.scaffali(engine, chiavi, n=8, W_aff=W_aff)
        base_cov = set()
        for s in base_shs:
            base_cov.update(s.seeds_indices)

        # Simulate P2:
        # Step 1: get eligible clusters from louvain
        eligible = I.clusters(engine, righe_arr, eta=eta_list, plays=plays_list, W_aff=W_aff)

        # Step 2: for each cluster, apply strict homogeneous medium rule and P2
        p2_shelves = []
        p2_suppressed = 0
        for s in eligible:
            m_mov = [i for i in s.seeds_indices if engine.keys[righe_arr[i]].startswith("movie:")]
            m_ser = [i for i in s.seeds_indices if engine.keys[righe_arr[i]].startswith("tv:")]

            # Primary medium of cluster
            if len(m_mov) >= floor and s.medium == "movie":
                # Primary movie shelf
                s_mov = I.Shelf(
                    catalog_id=f"yaca_{engine.keys[righe_arr[m_mov[0]]].split(':')[1]}_movie",
                    nome=s.nome,
                    nome_fonte=s.nome_fonte,
                    confidenza=s.confidenza,
                    medium="movie",
                    semi_rappresentativi=[
                        {"tmdbId": int(engine.keys[righe_arr[i]].split(":")[1]), "medium": "movie"}
                        for i in m_mov[:3]
                    ],
                    semi_membri=[
                        {"tmdbId": int(engine.keys[righe_arr[i]].split(":")[1]), "medium": "movie"}
                        for i in m_mov
                    ],
                    size=len(m_mov),
                    min_eta=float(min(eta_arr[i] for i in m_mov)),
                    matched_entry=s.matched_entry,
                    seeds_indices=m_mov,
                    dom_coll=s.dom_coll,
                )
                p2_shelves.append(s_mov)

                # Counterpart series shelf?
                if prof_has_series:
                    if len(m_ser) >= 1: # or len(m_ser) >= floor?
                        s_ser = I.Shelf(
                            catalog_id=f"yaca_{engine.keys[righe_arr[m_ser[0]]].split(':')[1]}_series",
                            nome=s.nome,
                            nome_fonte=s.nome_fonte,
                            confidenza=s.confidenza,
                            medium="series",
                            semi_rappresentativi=[
                                {"tmdbId": int(engine.keys[righe_arr[i]].split(":")[1]), "medium": "series"}
                                for i in m_ser[:3]
                            ],
                            semi_membri=[
                                {"tmdbId": int(engine.keys[righe_arr[i]].split(":")[1]), "medium": "series"}
                                for i in m_ser
                            ],
                            size=len(m_ser),
                            min_eta=float(min(eta_arr[i] for i in m_ser)),
                            matched_entry=s.matched_entry,
                            seeds_indices=m_ser,
                            dom_coll=s.dom_coll,
                        )
                        p2_shelves.append(s_ser)
                    else:
                        p2_suppressed += 1
                else:
                    p2_suppressed += 1

            elif len(m_ser) >= floor and s.medium == "series":
                # Primary series shelf
                s_ser = I.Shelf(
                    catalog_id=f"yaca_{engine.keys[righe_arr[m_ser[0]]].split(':')[1]}_series",
                    nome=s.nome,
                    nome_fonte=s.nome_fonte,
                    confidenza=s.confidenza,
                    medium="series",
                    semi_rappresentativi=[
                        {"tmdbId": int(engine.keys[righe_arr[i]].split(":")[1]), "medium": "series"}
                        for i in m_ser[:3]
                    ],
                    semi_membri=[
                        {"tmdbId": int(engine.keys[righe_arr[i]].split(":")[1]), "medium": "series"}
                        for i in m_ser
                    ],
                    size=len(m_ser),
                    min_eta=float(min(eta_arr[i] for i in m_ser)),
                    matched_entry=s.matched_entry,
                    seeds_indices=m_ser,
                    dom_coll=s.dom_coll,
                )
                p2_shelves.append(s_ser)

                # Counterpart movie shelf?
                if prof_has_movie:
                    if len(m_mov) >= 1:
                        s_mov = I.Shelf(
                            catalog_id=f"yaca_{engine.keys[righe_arr[m_mov[0]]].split(':')[1]}_movie",
                            nome=s.nome,
                            nome_fonte=s.nome_fonte,
                            confidenza=s.confidenza,
                            medium="movie",
                            semi_rappresentativi=[
                                {"tmdbId": int(engine.keys[righe_arr[i]].split(":")[1]), "medium": "movie"}
                                for i in m_mov[:3]
                            ],
                            semi_membri=[
                                {"tmdbId": int(engine.keys[righe_arr[i]].split(":")[1]), "medium": "movie"}
                                for i in m_mov
                            ],
                            size=len(m_mov),
                            min_eta=float(min(eta_arr[i] for i in m_mov)),
                            matched_entry=s.matched_entry,
                            seeds_indices=m_mov,
                            dom_coll=s.dom_coll,
                        )
                        p2_shelves.append(s_mov)
                    else:
                        p2_suppressed += 1
                else:
                    p2_suppressed += 1
            else:
                # Neither medium reached floor!
                # "If a cluster under the floor cannot be split by medium, it is served split or not served at all"
                # Not served at all: dropped!
                p2_suppressed += 1

        p2_cov = set()
        for s in p2_shelves:
            p2_cov.update(s.seeds_indices)

        print(f"{p:16} {len(chiavi):5d} {floor:5d} {len(base_shs):8d} {len(base_cov):8d} {len(p2_shelves):8d} {len(p2_cov):8d} {p2_suppressed:8d}")

if __name__ == "__main__":
    run_test()
