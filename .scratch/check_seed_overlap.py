import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

from collections import Counter
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

print("=== CHECK SEED OVERLAP AT N=8 AND N=14 ===")
for n in [8, 14]:
    print(f"\n--- TESTING N={n} ---")
    for p in profs:
        chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
        shs = I.scaffali(engine, chiavi, n=n, W_aff=W)
        seed_counts = Counter()
        for sh in shs:
            for idx in sh.seeds_indices:
                seed_counts[idx] += 1
        overlapping_seeds = {idx: cnt for idx, cnt in seed_counts.items() if cnt > 1}
        if overlapping_seeds:
            print(f"Profile {p} (N={n}): {len(shs)} shelves, {len(overlapping_seeds)} overlapping seeds!")
            for idx, cnt in sorted(overlapping_seeds.items(), key=lambda x: -x[1])[:5]:
                shelves_with_seed = [sh.nome for sh in shs if idx in sh.seeds_indices]
                print(f"   Seed {idx} ({chiavi[idx]}) in {cnt} shelves: {shelves_with_seed}")
        else:
            print(f"Profile {p} (N={n}): {len(shs)} shelves, 0 overlapping seeds")

# Also check across ALL eligible raw clusters before selection
print("\n--- CHECK OVERLAP ACROSS ALL ELIGIBLE CLUSTERS (BEFORE SELECTION) ---")
for p in profs:
    chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
    cand_clusters = I.clusters(engine, righe, eta=eta, plays=plays, W_aff=W)
    seed_counts = Counter()
    for c in cand_clusters:
        for idx in c.seeds_indices:
            seed_counts[idx] += 1
    overlapping_seeds = {idx: cnt for idx, cnt in seed_counts.items() if cnt > 1}
    print(f"Profile {p}: {len(cand_clusters)} cand clusters, {len(overlapping_seeds)} overlapping seeds")
