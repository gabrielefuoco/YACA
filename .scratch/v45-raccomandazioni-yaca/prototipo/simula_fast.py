import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
import pickle
from collections import Counter
from pathlib import Path
import numpy as np

from graph import canon as K
from graph.runtime import Engine

engine = Engine.carica_transizione(pota=16)
meta = K.metadati()
coll = meta["COLL"]

with open('.scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl', 'rb') as f:
    evals = pickle.load(f)

def jaccard(s1: set, s2: set) -> float:
    if not s1 and not s2: return 1.0
    u = len(s1 | s2)
    return len(s1 & s2) / u if u > 0 else 0.0

print("\n================== SIMULATION FROM CACHED MACROS (>=3 SEEDS) ==================\n")

for u, d in evals.items():
    k = d['k']
    righe = d['righe']
    plays = d['plays']
    eta = d['eta']
    raw_macros = d['macros']
    total_seeds = d['n_seeds']

    # Clustered seeds count
    clustered_seeds = set()
    for m in raw_macros:
        for idx in m['seeds']:
            clustered_seeds.add(idx)
    n_clustered = len(clustered_seeds)

    # Filter rules:
    # Rule 1: size >= 3
    # Rule 2: medium-homogeneous (already homogeneous if size >= 3 in split_bounded)
    # Let's count drops:
    dropped_size = sum(1 for m in raw_macros if m['size'] < 3)
    # Check if any size >= 3 is not homogeneous
    dropped_medium = 0
    qualifying = []
    for m in raw_macros:
        if m['size'] < 3:
            continue
        meds = ['series' if k[i].startswith('tv:') else 'movie' for i in m['seeds']]
        if len(set(meds)) > 1:
            dropped_medium += 1
        else:
            qualifying.append(m)

    # Ranking:
    # position 1 = smallest min_eta; positions 2..n by combined rank
    # calculate r_rec and r_sup
    for m in qualifying:
        # Dominant collection
        c_coll = coll[righe[m['seeds']]]
        pos = [x for x in c_coll if x > 0]
        dom_coll = None
        if pos:
            dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
            if (dom_cnt / m['size']) >= 0.5:
                dom_coll = int(dom_cid)
        m['dom_coll'] = dom_coll

    qualifying.sort(key=lambda x: x["min_eta"])
    for r_idx, item in enumerate(qualifying): item["r_rec"] = r_idx + 1
    qualifying.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
    for r_idx, item in enumerate(qualifying):
        item["r_sup"] = r_idx + 1
        item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0

    if qualifying:
        best_freshest = min(qualifying, key=lambda x: (x["min_eta"], x["r_comb"]))
        rem = [c for c in qualifying if c["id"] != best_freshest["id"]]
        rem.sort(key=lambda x: (x["r_comb"], -x["consistency"], -x["size"], -x["plays"]))
        ranked = [best_freshest] + rem
    else:
        ranked = []

    # Sequential selection with family dedupe and overlap dedupe (top 10 recommendations)
    selected = []
    seen_colls = set()
    selected_top10s = []
    cum_seeds = 0
    dropped_family = 0
    dropped_overlap = 0

    target_80_clustered = 0.80 * n_clustered

    for c in ranked:
        if c["dom_coll"] is not None and c["dom_coll"] in seen_colls:
            dropped_family += 1
            continue

        # Top 10 recs
        semi_rac = [
            {"tmdbId": int(k[idx].split(":")[1]), "medium": "series" if k[idx].startswith("tv:") else "movie", "tipo": "watched", "peso": 1.0}
            for idx in c['seeds']
        ]
        racs = engine.raccomanda(semi_rac, cap=10, medium=c['medium'], esclusi=k)
        c_top10 = set(r["key"] for r in racs[:10])

        has_overlap = False
        for s_top10 in selected_top10s:
            if jaccard(c_top10, s_top10) >= 0.5:
                has_overlap = True
                break
        if has_overlap:
            dropped_overlap += 1
            continue

        selected.append(c)
        if c["dom_coll"] is not None:
            seen_colls.add(c["dom_coll"])
        selected_top10s.append(c_top10)
        cum_seeds += c['size']

        if cum_seeds >= target_80_clustered:
            break

    pct_clustered = (cum_seeds / n_clustered * 100) if n_clustered > 0 else 0.0
    pct_total = (cum_seeds / total_seeds * 100) if total_seeds > 0 else 0.0
    print(f"{u:15s} | Tot={total_seeds:3d} | Clust={n_clustered:3d} | Shelves={len(selected):2d} | Seeds={cum_seeds:3d} ({pct_clustered:5.1f}% clust, {pct_total:5.1f}% tot) | Drops: sz={dropped_size:2d}, med={dropped_medium:2d}, fam={dropped_family:2d}, ovlp={dropped_overlap:2d}")
