"""generate_final_report.py — Final verification and numbers for the ticket report."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

from collections import Counter
import numpy as np
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
W = I.carica_matrice_affinita()

profs = [
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

print("=" * 90)
print("1. PROFILI E RIPARTIZIONE NAMED VS UNNAMED (BUDGET N=8)")
print("=" * 90)
zero_unnamed = 0
results = {}

for p in profs:
    chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
    shs = I.scaffali(engine, chiavi, n=8, W_aff=W)
    named = [s for s in shs if s.nome_fonte == "tassonomia"]
    unnamed = [s for s in shs if s.nome_fonte == "perche_hai_visto"]
    if len(unnamed) == 0:
        zero_unnamed += 1
    
    # Check seed overlap
    seed_counts = Counter()
    for s in shs:
        for idx in s.seeds_indices:
            seed_counts[idx] += 1
    overlap_count = sum(1 for cnt in seed_counts.values() if cnt > 1)

    # Coverage
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
    
    covered_seeds = set(idx for s in shs for idx in s.seeds_indices)
    cov_seeds_cnt = len(covered_seeds)
    cov_seeds_pct = (cov_seeds_cnt / n_seeds * 100.0) if n_seeds > 0 else 0.0
    served_mass = float(sum(seed_weights[i] for i in covered_seeds))
    cov_mass_pct = (served_mass / tot_mass * 100.0) if tot_mass > 0 else 0.0

    results[p] = {
        "shs": shs,
        "named_cnt": len(named),
        "unnamed_cnt": len(unnamed),
        "overlap_count": overlap_count,
        "n_seeds": n_seeds,
        "tot_mass": tot_mass,
        "cov_seeds_cnt": cov_seeds_cnt,
        "cov_seeds_pct": cov_seeds_pct,
        "served_mass": served_mass,
        "cov_mass_pct": cov_mass_pct,
    }

    print(f"{p:<15} | Tot: {len(shs)} | Named: {len(named)} | Unnamed: {len(unnamed)} | Seed Overlap: {overlap_count}")

print(f"\nProfili con ZERO righe unnamed: {zero_unnamed} / {len(profs)}")

print("\n" + "=" * 90)
print("2. COPERTURA A 8 RIGHE SUI PROFILI LUNGHI")
print("=" * 90)
for p in ["castoffcrown", "warnok", "pepsipex", "1jacobjohn"]:
    r = results[p]
    print(f"{p:<15} | Semi: {r['cov_seeds_cnt']:>3}/{r['n_seeds']} ({r['cov_seeds_pct']:>5.1f}%) | Massa: {r['served_mass']:>5.1f}/{r['tot_mass']:>5.1f} ({r['cov_mass_pct']:>5.1f}%) | Named: {r['named_cnt']}/8")

print("\n" + "=" * 90)
print("3. LISTING COMPLETO A 8 RIGHE PER CASTOFFCROWN, WARNOK, PEPSIPEX")
print("=" * 90)
for p in ["castoffcrown", "warnok", "pepsipex"]:
    print(f"\n--- PROFILO: {p} ---")
    shs = results[p]["shs"]
    for s in shs:
        print(f"Slot {s.slot_position}: {s.nome:<35} | Semi: {s.size:>2} | Massa: {s.weighted_support:>4.1f} | Età: {s.min_eta:>3.0f} gg | [{s.nome_fonte}]")
