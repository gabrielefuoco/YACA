"""Script per calcolare esattamente:
1. Cosa lasciamo fuori (distribuzione dimensioni cluster non serviti, cluster più grande non servito, semi in cluster >= 20 non serviti).
2. Quanti semi vengono scartati all'ingestione (fuori canone, ecc.).
3. Metriche alternative: quota di massa play (play mass) coperta dagli scaffali serviti e quota servita in cluster >= 20 semi.
"""
from __future__ import annotations

import json
from pathlib import Path
import numpy as np
import scipy.sparse as sp
import pandas as pd

from graph import canon as K
from graph.runtime import Engine
from graph.interessi import (
    carica_matrice_affinita,
    calcola_adaptive_floor,
    calcola_sim_affinity,
    micro_clustering,
    macro_merge,
    bisect_cluster,
    Shelf,
    _carica_tmdb_extra,
    _carica_tfidf_keywords,
    NOISE_KEYWORDS,
)
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster

PROFILI = ["castoffcrown", "warnok", "pepsipex"]


def analizza_profilo_v1(engine: Engine, W_aff: sp.csr_matrix, profilo: str):
    # Dati grezzi Trakt (prima del filtro canone) per verificare out-of-canon
    tk_dir = Path(".cache/trakt/users")
    raw_movie_p = tk_dir / f"movie-{profilo}.json"
    raw_show_p = tk_dir / f"show-{profilo}.json"

    raw_items = []
    for p, tipo in [(raw_movie_p, "movie"), (raw_show_p, "show")]:
        if p.is_file():
            try:
                j = json.loads(p.read_text(encoding="utf-8"))
                for voce in (j["list"] if isinstance(j, dict) else j):
                    ids = (voce.get(tipo) or {}).get("ids") or {}
                    tmdb = ids.get("tmdb")
                    if tmdb is not None:
                        ch = f"{'tv' if tipo == 'show' else 'movie'}:{int(tmdb)}"
                        raw_items.append((ch, int(voce.get("plays") or 1)))
            except Exception:
                pass

    tot_raw = len(raw_items)
    in_canon = [x for x in raw_items if x[0] in engine.row_of]
    out_of_canon = [x for x in raw_items if x[0] not in engine.row_of]

    # Storia Trakt canonica
    chiavi, righe, plays, eta = K.storia_trakt(profilo, ordine="recente")
    righe_arr = np.asarray(righe, dtype=np.int64)
    n_seeds = len(righe_arr)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)
    tot_play_mass = float(np.sum(plays_arr))

    # Esegui V1
    from misura_varianti import run_pipeline
    res = run_pipeline(
        engine,
        profilo,
        staple_cap=40,
        unnameable_bisect=True,
        unnameable_cap=12,
        W_aff=W_aff,
        max_n=6,
    )

    eligible_shelves = res["eligible_shelves"]
    chosen_shelves = res["chosen"][:6]

    # Cluster serviti vs non serviti
    chosen_ids = set(id(s) for s in chosen_shelves)
    served_shelves = [s for s in eligible_shelves if id(s) in chosen_ids]
    unserved_shelves = [s for s in eligible_shelves if id(s) not in chosen_ids]

    # Semi serviti e play mass servita
    served_seed_indices = set(idx for s in served_shelves for idx in s.seeds_indices)
    served_titles_count = len(served_seed_indices)
    served_play_mass = float(np.sum(plays_arr[list(served_seed_indices)])) if served_seed_indices else 0.0

    # Cluster serviti >= 20 semi
    served_ge_20 = [s for s in served_shelves if s.size >= 20]
    served_ge_20_seed_indices = set(idx for s in served_ge_20 for idx in s.seeds_indices)
    served_ge_20_play_mass = float(np.sum(plays_arr[list(served_ge_20_seed_indices)])) if served_ge_20_seed_indices else 0.0

    # Cluster non serviti
    unserved_sizes = [s.size for s in unserved_shelves]
    unserved_sizes.sort()

    if unserved_sizes:
        u_min = min(unserved_sizes)
        u_q1 = float(np.percentile(unserved_sizes, 25))
        u_med = float(np.percentile(unserved_sizes, 50))
        u_q3 = float(np.percentile(unserved_sizes, 75))
        u_max = max(unserved_sizes)
    else:
        u_min = u_q1 = u_med = u_q3 = u_max = 0

    # Singolo cluster non servito più grande
    if unserved_shelves:
        largest_unserved = max(unserved_shelves, key=lambda s: (s.size, -s.min_eta))
        lus_size = largest_unserved.size
        lus_nome = largest_unserved.nome
        lus_fonte = largest_unserved.nome_fonte
        lus_min_eta = largest_unserved.min_eta
        lus_rep = [m["titolo"] for m in largest_unserved.semi_rappresentativi[:3]]
    else:
        largest_unserved = None
        lus_size = 0
        lus_nome = "N/A"
        lus_fonte = "N/A"
        lus_min_eta = 0.0
        lus_rep = []

    # Cluster non serviti di dimensione >= 20
    unserved_ge_20 = [s for s in unserved_shelves if s.size >= 20]
    unserved_ge_20_seeds = set(idx for s in unserved_ge_20 for idx in s.seeds_indices)
    unserved_ge_20_count = len(unserved_ge_20_seeds)
    unserved_ge_20_share = (unserved_ge_20_count / n_seeds * 100.0) if n_seeds > 0 else 0.0

    return {
        "profilo": profilo,
        "tot_raw_trakt": tot_raw,
        "in_canon": len(in_canon),
        "out_of_canon": len(out_of_canon),
        "n_seeds_canon": n_seeds,
        "tot_play_mass": tot_play_mass,
        "n_eligible": len(eligible_shelves),
        "n_served": len(served_shelves),
        "n_unserved": len(unserved_shelves),
        "served_titles_count": served_titles_count,
        "served_titles_pct": served_titles_count / n_seeds * 100.0,
        "served_play_mass": served_play_mass,
        "served_play_mass_pct": served_play_mass / tot_play_mass * 100.0,
        "served_ge_20_titles_count": len(served_ge_20_seed_indices),
        "served_ge_20_titles_pct": len(served_ge_20_seed_indices) / n_seeds * 100.0,
        "served_ge_20_play_mass": served_ge_20_play_mass,
        "served_ge_20_play_mass_pct": served_ge_20_play_mass / tot_play_mass * 100.0,
        "unserved_dist": {
            "min": u_min,
            "q1": u_q1,
            "median": u_med,
            "q3": u_q3,
            "max": u_max,
            "all_sizes": unserved_sizes,
        },
        "largest_unserved": {
            "size": lus_size,
            "nome": lus_nome,
            "fonte": lus_fonte,
            "min_eta": lus_min_eta,
            "rep": lus_rep,
        },
        "unserved_ge_20": {
            "clusters_count": len(unserved_ge_20),
            "seeds_count": unserved_ge_20_count,
            "share_pct": unserved_ge_20_share,
            "details": [
                {
                    "size": s.size,
                    "nome": s.nome,
                    "fonte": s.nome_fonte,
                    "min_eta": s.min_eta,
                    "rep": [m["titolo"] for m in s.semi_rappresentativi[:3]],
                }
                for s in unserved_ge_20
            ],
        },
        "served_shelves_details": [
            {
                "size": s.size,
                "nome": s.nome,
                "fonte": s.nome_fonte,
                "min_eta": s.min_eta,
            }
            for s in served_shelves
        ],
    }


def main():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W_aff = carica_matrice_affinita()

    results = {}
    for p in PROFILI:
        r = analizza_profilo_v1(engine, W_aff, p)
        results[p] = r
        print(f"\n==================== RISULTATI {p} ====================")
        print(f"Semi canone: {r['n_seeds_canon']} (da Trakt grezzo: {r['tot_raw_trakt']}, out of canon: {r['out_of_canon']})")
        print(f"Play mass totale: {r['tot_play_mass']:.1f}")
        print(f"Scaffali ammissibili totali: {r['n_eligible']} (serviti: {r['n_served']}, non serviti: {r['n_unserved']})")
        print(f"Distribuzione dimensioni cluster non serviti: min={r['unserved_dist']['min']}, Q1={r['unserved_dist']['q1']}, med={r['unserved_dist']['median']}, Q3={r['unserved_dist']['q3']}, max={r['unserved_dist']['max']}")
        print(f"Cluster non servito più grande: {r['largest_unserved']}")
        print(f"Semi in cluster non serviti >= 20: {r['unserved_ge_20']['seeds_count']} ({r['unserved_ge_20']['share_pct']:.1f}% del profilo), n_cluster={r['unserved_ge_20']['clusters_count']}")
        if r['unserved_ge_20']['details']:
            print(f"  Dettagli cluster >= 20 non serviti: {r['unserved_ge_20']['details']}")
        print(f"METRICHE ALTERNATIVE:")
        print(f"  Copertura titoli serviti: {r['served_titles_count']}/{r['n_seeds_canon']} = {r['served_titles_pct']:.1f}%")
        print(f"  Quota Play Mass servita: {r['served_play_mass']:.1f}/{r['tot_play_mass']:.1f} = {r['served_play_mass_pct']:.1f}%")
        print(f"  Copertura titoli serviti >= 20 semi: {r['served_ge_20_titles_count']}/{r['n_seeds_canon']} = {r['served_ge_20_titles_pct']:.1f}%")
        print(f"  Quota Play Mass in cluster serviti >= 20 semi: {r['served_ge_20_play_mass']:.1f}/{r['tot_play_mass']:.1f} = {r['served_ge_20_play_mass_pct']:.1f}%")

    with open(".scratch/v45-raccomandazioni-yaca/analisi_coda_v1.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print("\nSalvato .scratch/v45-raccomandazioni-yaca/analisi_coda_v1.json")


if __name__ == "__main__":
    main()
