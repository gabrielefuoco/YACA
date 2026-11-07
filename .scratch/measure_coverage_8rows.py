"""measure_coverage_8rows.py — Measure title and mass coverage at 8 rows under two-tier rule."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))
sys.path.insert(0, str(ROOT / ".scratch"))

import numpy as np
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from test_two_tier_implementation import scaffali_two_tier

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
W = I.carica_matrice_affinita()

long_profs = ["castoffcrown", "warnok", "pepsipex", "1jacobjohn"]

print("=== COVERAGE AT 8 ROWS UNDER TWO-TIER RULE ===")
for p in long_profs:
    chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
    n_seeds = len(chiavi)
    righe_arr = np.asarray(righe, dtype=np.int64)
    plays_arr = np.asarray(plays, dtype=np.float32)
    nep_arr = engine.nep[righe_arr] if len(engine.nep) > 0 else np.ones(len(righe_arr))
    is_tv_arr = np.array([k.startswith("tv:") for k in chiavi])
    seed_weights = np.where(
        is_tv_arr & (nep_arr > 1.0),
        1.0 + 2.0 * np.minimum(plays_arr / nep_arr, 1.0),
        np.minimum(plays_arr, 3.0),
    )
    tot_mass = float(np.sum(seed_weights))

    shs = scaffali_two_tier(chiavi, n=8)
    
    covered_seeds = set()
    for s in shs:
        covered_seeds.update(s.seeds_indices)
        
    n_cov = len(covered_seeds)
    cov_titles_pct = (n_cov / n_seeds) * 100.0
    served_mass = float(sum(seed_weights[i] for i in covered_seeds))
    cov_mass_pct = (served_mass / tot_mass) * 100.0

    print(f"\nProfile {p}:")
    print(f"  Total seeds: {n_seeds} | Total mass: {tot_mass:.1f}")
    print(f"  Served seeds: {n_cov} ({cov_titles_pct:.1f}%) | Served mass: {served_mass:.1f} ({cov_mass_pct:.1f}%)")
    print(f"  Shelves ({len(shs)}):")
    for s in shs:
        print(f"    Slot {s.slot_position}: {s.nome} (seeds={s.size}, mass={s.weighted_support:.1f}) [{s.nome_fonte}]")
