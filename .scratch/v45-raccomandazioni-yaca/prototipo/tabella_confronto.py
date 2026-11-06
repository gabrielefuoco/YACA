import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
import pickle
from collections import Counter
from pathlib import Path
import numpy as np

from graph import canon as K
from graph.runtime import Engine
from cluster import clusterizza_semi
from macro import bounded_macros_for_profile
from dieci_storie import carica_wider_bags, calcola_sim_wider

engine = Engine.carica_transizione(pota=16)
meta = K.metadati()
coll = meta["COLL"]

with open('.scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl', 'rb') as f:
    evals = pickle.load(f)

def jaccard(s1: set, s2: set) -> float:
    if not s1 and not s2: return 1.0
    u = len(s1 | s2)
    return len(s1 & s2) / u if u > 0 else 0.0

print("=== CONFRONTO DETTAGLIATO SULLE 10 TIMELINE ===")
print("PROFILO          | TOT | CLUST | A_SCAFF | A_SEMI (A_COV%) | A_DROPS (sz, med, fam, ov) | B_SCAFF | B_SEMI (B_COV%) | B_DROPS (sz, med, fam, ov)")
print("-" * 125)

for u, d in evals.items():
    k = d['k']
    righe = d['righe']
    plays = d['plays']
    eta = d['eta']
    tot_seeds = d['n_seeds']

    # --- PIPELINE B (Medium-split macros) ---
    raw_macros_b = d['macros']
    clustered_seeds_b = set(idx for m in raw_macros_b for idx in m['seeds'])
    n_clust_b = len(clustered_seeds_b)

    dropped_size_b = sum(1 for m in raw_macros_b if m['size'] < 3)
    dropped_med_b = 0
    qual_b = []
    for m in raw_macros_b:
        if m['size'] < 3:
            continue
        meds = ['series' if k[i].startswith('tv:') else 'movie' for i in m['seeds']]
        if len(set(meds)) > 1:
            dropped_med_b += 1
        else:
            qual_b.append(m)

    for m in qual_b:
        c_coll = coll[righe[m['seeds']]]
        pos = [x for x in c_coll if x > 0]
        dom_coll = None
        if pos:
            dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
            if (dom_cnt / m['size']) >= 0.5:
                dom_coll = int(dom_cid)
        m['dom_coll'] = dom_coll

    qual_b.sort(key=lambda x: x["min_eta"])
    for r_idx, item in enumerate(qual_b): item["r_rec"] = r_idx + 1
    qual_b.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
    for r_idx, item in enumerate(qual_b):
        item["r_sup"] = r_idx + 1
        item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0

    if qual_b:
        best_freshest = min(qual_b, key=lambda x: (x["min_eta"], x["r_comb"]))
        rem = [c for c in qual_b if c["id"] != best_freshest["id"]]
        rem.sort(key=lambda x: (x["r_comb"], -x["consistency"], -x["size"], -x["plays"]))
        ranked_b = [best_freshest] + rem
    else:
        ranked_b = []

    sel_b = []
    seen_colls_b = set()
    selected_top10s_b = []
    cum_seeds_b = 0
    dropped_fam_b = 0
    dropped_ov_b = 0
    target_80_b = 0.80 * n_clust_b

    for c in ranked_b:
        if c["dom_coll"] is not None and c["dom_coll"] in seen_colls_b:
            dropped_fam_b += 1
            continue
        semi_rac = [
            {"tmdbId": int(k[idx].split(":")[1]), "medium": "series" if k[idx].startswith("tv:") else "movie", "tipo": "watched", "peso": 1.0}
            for idx in c['seeds']
        ]
        racs = engine.raccomanda(semi_rac, cap=10, medium=c['medium'], esclusi=k)
        c_top10 = set(r["key"] for r in racs[:10])

        has_overlap = False
        for s_top10 in selected_top10s_b:
            if jaccard(c_top10, s_top10) >= 0.5:
                has_overlap = True
                break
        if has_overlap:
            dropped_ov_b += 1
            continue

        sel_b.append(c)
        if c["dom_coll"] is not None:
            seen_colls_b.add(c["dom_coll"])
        selected_top10s_b.append(c_top10)
        cum_seeds_b += c['size']
        if cum_seeds_b >= target_80_b:
            break

    cov_pct_b = (cum_seeds_b / n_clust_b * 100) if n_clust_b > 0 else 0.0

    # Pipeline A numbers from task-345 log:
    # sangam: 2, 6, 100%, drops: (0, 0, 0, 0)
    # hammers: 1, 6, 75%, drops: (1, 0, 0, 0)
    # sappss: 2, 7, 35%, drops: (2, 2, 0, 0)
    # flixinatoor: 4, 14, 51.9%, drops: (2, 1, 0, 0)
    # moppierhead: 4, 25, 80.6%, drops: (1, 0, 0, 0)
    # castoffcrown: 32, 215, 56.7%, drops: (39, 14, 0, 0)
    # warnok: 49, 312, 68.1%, drops: (43, 12, 0, 1)
    # pepsipex: 49, 313, 56.7%, drops: (33, 26, 0, 0)
    # carverclan: 0, 0, 0%, drops: (2, 0, 0, 0)
    # 1jacobjohn: 17, 101, 65.6%, drops: (20, 3, 0, 0)
    t345_data = {
        "sangam456": (2, 6, 100.0, 0, 0, 0, 0),
        "hammers-lists": (1, 6, 75.0, 1, 0, 0, 0),
        "sappss": (2, 7, 35.0, 2, 2, 0, 0),
        "flixinatoor99": (4, 14, 51.9, 2, 1, 0, 0),
        "moppierhead": (4, 25, 80.6, 1, 0, 0, 0),
        "castoffcrown": (32, 215, 56.7, 39, 14, 0, 0),
        "warnok": (49, 312, 68.1, 43, 12, 0, 1),
        "pepsipex": (49, 313, 56.7, 33, 26, 0, 0),
        "carverclan": (0, 0, 0.0, 2, 0, 0, 0),
        "1jacobjohn": (17, 101, 65.6, 20, 3, 0, 0),
    }
    a_scaff, a_semi, a_cov, a_sz, a_med, a_fam, a_ov = t345_data[u]

    print(f"{u:16s} | {tot_seeds:3d} | {n_clust_b:5d} | {a_scaff:7d} | {a_semi:6d} ({a_cov:5.1f}%) | ({a_sz:2d}, {a_med:2d}, {a_fam:2d}, {a_ov:2d})          | {len(sel_b):7d} | {cum_seeds_b:6d} ({cov_pct_b:5.1f}%) | ({dropped_size_b:2d}, {dropped_med_b:2d}, {dropped_fam_b:2d}, {dropped_ov_b:2d})")
