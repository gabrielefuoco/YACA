import pickle
from collections import Counter
from pathlib import Path
import numpy as np

with open('.scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl', 'rb') as f:
    evals = pickle.load(f)

for u, d in evals.items():
    k = d['k']
    macros = d['macros'] # these are split_bounded items
    # Let's inspect raw bounded if we can recompute or check
    print(f"=== {u} ===")
    lt3 = 0
    mixed = 0
    pure_ge3 = 0
    for m in macros:
        sz = len(m['seeds'])
        meds = ['series' if k[i].startswith('tv:') else 'movie' for i in m['seeds']]
        ctr = Counter(meds)
        is_mixed = len(ctr) > 1
        if sz < 3:
            lt3 += 1
        elif is_mixed:
            mixed += 1
        else:
            pure_ge3 += 1
    print(f"  split_bounded macros: total={len(macros)}, sz < 3: {lt3}, sz >= 3 & mixed: {mixed}, sz >= 3 & pure: {pure_ge3}")
