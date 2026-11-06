import pickle
from collections import Counter
from pathlib import Path
import numpy as np

def jaccard(s1: set, s2: set) -> float:
    if not s1 and not s2:
        return 1.0
    u = len(s1 | s2)
    return len(s1 & s2) / u if u > 0 else 0.0

with open('.scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl', 'rb') as f:
    evals = pickle.load(f)

for u, d in evals.items():
    k = d['k']
    macros = d['macros']
    print(f"=== {u} (Total seeds: {d['n_seeds']}, Bounded raw: {d['n_bounded_raw']}, Split macros: {len(macros)}) ===")
    for idx, m in enumerate(macros):
        meds = ['series' if k[i].startswith('tv:') else 'movie' for i in m['seeds']]
        ctr = Counter(meds)
        if len(ctr) > 1:
            print(f"  Macro {idx}: mixed media! {ctr}")
print("Check done.")
