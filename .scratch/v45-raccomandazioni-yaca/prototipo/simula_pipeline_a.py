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

PROFILI_10 = [
    ("sangam456", "Corto storico (10 semi)", "Campione originale"),
    ("hammers-lists", "Corto storico (11 semi)", "Campione originale"),
    ("sappss", "Medio-basso storico (25 semi)", "Campione originale"),
    ("flixinatoor99", "Medio storico (32 semi)", "Campione originale"),
    ("moppierhead", "Medio storico (38 semi)", "Campione originale"),
    ("castoffcrown", "Lungo storico (412 semi)", "Campione originale"),
    ("warnok", "Lungo storico (476 semi)", "Campione originale"),
    ("pepsipex", "Massimo storico (568 semi)", "Campione originale"),
    ("carverclan", "Ultra-corto (<10 semi, 7 semi)", "Gap Ultra-Cold Start"),
    ("1jacobjohn", "Intermedio (167 semi)", "Gap Utente Medio Attivo (100-300 semi)"),
]

storie = {}
for u, _, _ in PROFILI_10:
    k, righe, plays, eta = K.storia_trakt(u, ordine="recente")
    storie[u] = (k, righe, plays, eta)

all_righe = sorted(list({r for u in storie for r in storie[u][1]}))
wider_bags = carica_wider_bags(all_righe, Path("services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz"))

def jaccard(s1: set, s2: set) -> float:
    if not s1 and not s2: return 1.0
    u = len(s1 | s2)
    return len(s1 & s2) / u if u > 0 else 0.0

print("\n================== PIPELINE SIMULATION ==================\n")

for u, desc_gap, tipo_gap in PROFILI_10:
    k, righe, plays, eta = storie[u]
    S = calcola_sim_wider(righe, wider_bags)
    micros, _, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
    bounded = bounded_macros_for_profile(engine, righe, micros, M=12, tau=0.03)

    total_profile_seeds = len(righe)
    # Total covered (clustered) seeds in profile
    clustered_seeds_set = set()
    for m in bounded:
        for idx in m:
            clustered_seeds_set.add(idx)
    total_clustered_seeds = len(clustered_seeds_set)

    # Let's inspect Pipeline A: Raw bounded macros as candidates
    # We rank them by min_eta / support
    # First compute properties for each bounded macro
    raw_candidates = []
    seed_cache = {}
    for m_idx, m in enumerate(bounded):
        sz = len(m)
        meds = ['series' if k[i].startswith('tv:') else 'movie' for i in m]
        med_counts = Counter(meds)
        is_homo = len(med_counts) == 1
        majority_med = med_counts.most_common(1)[0][0]

        # consistency
        top10_list = []
        for idx in m:
            ckey = (idx, majority_med)
            if ckey not in seed_cache:
                racs = engine.raccomanda([{"key": k[idx], "plays": 1.0}], cap=10, medium=majority_med, esclusi=k)
                seed_cache[ckey] = set(r["key"] for r in racs)
            top10_list.append(seed_cache[ckey])
        pairs = [jaccard(top10_list[i], top10_list[j]) for i in range(sz) for j in range(i + 1, sz)]
        consistency = float(np.mean(pairs)) if pairs else 0.0

        m_eta = [eta[idx] for idx in m]
        min_e = min(m_eta)
        tot_pl = sum(plays[idx] for idx in m)

        # Dominant collection
        c_coll = coll[righe[m]]
        pos = [x for x in c_coll if x > 0]
        dom_coll = None
        if pos:
            dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
            if (dom_cnt / sz) >= 0.5:
                dom_coll = int(dom_cid)

        # Top 10 recommendations for cluster
        semi_rac = [
            {"tmdbId": int(k[idx].split(":")[1]), "medium": "series" if k[idx].startswith("tv:") else "movie", "tipo": "watched", "peso": 1.0}
            for idx in m
        ]
        racs_cluster = engine.raccomanda(semi_rac, cap=10, medium=majority_med, esclusi=k)
        top10_cand_keys = set(r["key"] for r in racs_cluster[:10])

        raw_candidates.append({
            "id": m_idx,
            "seeds": m,
            "size": sz,
            "medium": majority_med,
            "is_homo": is_homo,
            "min_eta": min_e,
            "plays": tot_pl,
            "consistency": consistency,
            "dom_coll": dom_coll,
            "top10_cands": top10_cand_keys
        })

    # Ranking rules:
    # "position 1 is always the cluster with the smallest min_eta (freshest); positions 2..n by combined rank."
    # How combined rank is calculated:
    raw_candidates.sort(key=lambda x: x["min_eta"])
    for r_idx, item in enumerate(raw_candidates): item["r_rec"] = r_idx + 1
    raw_candidates.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
    for r_idx, item in enumerate(raw_candidates):
        item["r_sup"] = r_idx + 1
        item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0

    # Let's test two ordering ways:
    # Way 1: Sort by r_comb first, but pick the min_eta one as #1
    # Way 2: Find best qualifying cluster for min_eta -> place first, then sort remainder by r_comb

    # Let's test filtering on raw_candidates:
    # Filter 1: size >= 3
    # Filter 2: medium-homogeneous
    # Filter 3: family dedupe
    # Filter 4: overlap < 50%
    # Stopping rule: cumulative share of covered seeds reaches 80%

    print(f"\n--- Profilo {u} (Total seeds={total_profile_seeds}, Clustered seeds={total_clustered_seeds}, Raw macros={len(raw_candidates)}) ---")
    
    # Let's run selection with Way 2:
    # First, which clusters qualify individually for size & medium?
    qualifying = []
    dropped_size = 0
    dropped_medium = 0
    for c in raw_candidates:
        if c["size"] < 3:
            dropped_size += 1
        elif not c["is_homo"]:
            dropped_medium += 1
        else:
            qualifying.append(c)

    print(f"  Individually dropped by size (<3): {dropped_size}")
    print(f"  Individually dropped by medium (heterogeneous): {dropped_medium}")
    print(f"  Qualifying for size & medium: {len(qualifying)}")

    # Order qualifying: position 1 = smallest min_eta; positions 2..n by r_comb
    if qualifying:
        # Find item with min min_eta
        best_freshest = min(qualifying, key=lambda x: (x["min_eta"], x["r_comb"]))
        rem = [c for c in qualifying if c["id"] != best_freshest["id"]]
        rem.sort(key=lambda x: (x["r_comb"], -x["consistency"], -x["size"], -x["plays"]))
        ranked_qualifying = [best_freshest] + rem
    else:
        ranked_qualifying = []

    # Now apply family dedupe, overlap dedupe, and stopping rule
    selected = []
    seen_colls = set()
    selected_top10s = []
    cum_seeds = 0
    dropped_family = 0
    dropped_overlap = 0

    target_80_clustered = 0.80 * total_clustered_seeds
    target_80_total = 0.80 * total_profile_seeds

    for c in ranked_qualifying:
        # Check family
        if c["dom_coll"] is not None and c["dom_coll"] in seen_colls:
            dropped_family += 1
            continue
        # Check overlap
        has_overlap = False
        for s_top10 in selected_top10s:
            if jaccard(c["top10_cands"], s_top10) >= 0.5:
                has_overlap = True
                break
        if has_overlap:
            dropped_overlap += 1
            continue

        # Accepted shelf
        selected.append(c)
        if c["dom_coll"] is not None:
            seen_colls.add(c["dom_coll"])
        selected_top10s.append(c["top10_cands"])
        cum_seeds += c["size"]

        # Stopping rule: reached 80% of covered seeds?
        if cum_seeds >= target_80_clustered:
            break

    print(f"  SELECTED SHELVES: {len(selected)}")
    print(f"  Cumulative seeds served: {cum_seeds} / {total_clustered_seeds} clustered ({cum_seeds/total_clustered_seeds*100:.1f}%) | / {total_profile_seeds} total ({cum_seeds/total_profile_seeds*100:.1f}%)")
    print(f"  Drops during sequential selection: family={dropped_family}, overlap={dropped_overlap}")
    print(f"  Total drops: size={dropped_size}, medium={dropped_medium}, family={dropped_family}, overlap={dropped_overlap}")
