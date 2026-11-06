import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
import pickle
from collections import Counter
from pathlib import Path
from graph import canon as K
from graph.runtime import Engine
from cluster import clusterizza_semi
from macro import bounded_macros_for_profile
from dieci_storie import carica_wider_bags, calcola_sim_wider

engine = Engine.carica_transizione(pota=16)
with open('.scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl', 'rb') as f:
    evals = pickle.load(f)

for u, d in evals.items():
    k = d['k']
    righe = d['righe']
    # Let's inspect bounded directly
    # In evals[u], we have n_bounded_raw.
    print(f"=== {u} ===")
    print(f"  raw bounded count: {d['n_bounded_raw']}, split macros count: {len(d['macros'])}")
