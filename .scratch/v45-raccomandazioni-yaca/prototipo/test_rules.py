import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
import pickle
from collections import Counter
from pathlib import Path
import numpy as np

with open('.scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl', 'rb') as f:
    evals = pickle.load(f)

print("=== EXPLORING SMALLEST ADDITIONAL RULES TO FIX SHELVES > 10 ===")

# Let's test a few clean, elegant rules:
# Rule 1: Marginal seed contribution threshold (stop if a shelf contributes < 3% or < 4% of total clustered seeds)
# Rule 2: Minimum cluster size scaled by log or sqrt of seeds: e.g. min_size = max(3, int(np.sqrt(total_seeds)/2))
# Rule 3: Stop when cumulative coverage of RECENT seeds (eta <= 365 days) reaches 80%
# Rule 4: Stop at the elbow of cumulative coverage (marginal contribution < 5%)

for u, d in evals.items():
    tot = d['n_seeds']
    eta = d['eta']
    macros = [m for m in d['macros'] if m['size'] >= 3]
    if not macros:
        continue
    # rank macros
    macros.sort(key=lambda x: x["min_eta"])
    for r_idx, item in enumerate(macros): item["r_rec"] = r_idx + 1
    macros.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
    for r_idx, item in enumerate(macros):
        item["r_sup"] = r_idx + 1
        item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0
    
    best_freshest = min(macros, key=lambda x: (x["min_eta"], x["r_comb"]))
    rem = [c for c in macros if c["id"] != best_freshest["id"]]
    rem.sort(key=lambda x: (x["r_comb"], -x["consistency"], -x["size"], -x["plays"]))
    ranked = [best_freshest] + rem

    tot_clust = sum(m['size'] for m in d['macros'])
    
    # Test Rule A: Marginal contribution stop: stop when shelf.size / tot_clust < 0.03 (3%)
    sel_A = []
    cum_A = 0
    for m in ranked:
        if (m['size'] / tot_clust) < 0.025: # less than 2.5%
            break
        sel_A.append(m)
        cum_A += m['size']
        if cum_A >= 0.80 * tot_clust:
            break
            
    # Test Rule B: Active recency filter (min_eta <= 365 days, active within last year)
    sel_B = []
    cum_B = 0
    for m in ranked:
        if m['min_eta'] > 365:
            continue
        sel_B.append(m)
        cum_B += m['size']
        if cum_B >= 0.80 * tot_clust:
            break

    # Test Rule C: 80% of top-100 seeds mass
    target_C = 0.80 * min(tot_clust, 100)
    sel_C = []
    cum_C = 0
    for m in ranked:
        sel_C.append(m)
        cum_C += m['size']
        if cum_C >= target_C:
            break

    # Test Rule D: Marginal return elbow (stop if marginal gain < 4% or max 10)
    sel_D = []
    cum_D = 0
    for m in ranked:
        if cum_D > 0 and (m['size'] / tot_clust) < 0.02:
            break
        sel_D.append(m)
        cum_D += m['size']
        if cum_D >= 0.80 * tot_clust:
            break

    print(f"{u:15s} | Tot={tot:3d} | Base 80%: ? | Rule A (marg>=2.5%): {len(sel_A):2d} | Rule B (active<=1yr): {len(sel_B):2d} | Rule C (80% of top-100): {len(sel_C):2d}")
