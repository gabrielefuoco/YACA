import pickle
from collections import Counter

with open('.scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl', 'rb') as f:
    evals = pickle.load(f)

for u, d in evals.items():
    k = d['k']
    plays = d['plays']
    eta = d['eta']
    macros = [m for m in d['macros'] if m['size'] >= 3]
    ids = []
    for m in macros:
        m_sorted = sorted(m['seeds'], key=lambda idx: (-plays[idx], eta[idx]))
        top_seed_key = k[m_sorted[0]] # e.g. tv:83095 or movie:60059
        tmdb_id = top_seed_key.split(":")[1]
        cat_id = f"yaca_{tmdb_id}_{m['medium']}"
        ids.append(cat_id)
    c = Counter(ids)
    dups = [item for item, cnt in c.items() if cnt > 1]
    if dups:
        print(f"{u}: duplicate IDs found with single seed! {dups}")
    else:
        print(f"{u}: all {len(ids)} IDs unique with yaca_<tmdbId>_<medium>")
