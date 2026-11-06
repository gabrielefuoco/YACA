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

print("\n================== PIPELINE B (MEDIUM SPLIT) ==================\n", flush=True)

for u, desc_gap, tipo_gap in PROFILI_10:
    k, righe, plays, eta = storie[u]
    S = calcola_sim_wider(righe, wider_bags)
    micros, _, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
    bounded = bounded_macros_for_profile(engine, righe, micros, M=12, tau=0.03)

    total_profile_seeds = len(righe)
    clustered_seeds_set = set(idx for m in bounded for idx in m)
    total_clustered_seeds = len(clustered_seeds_set)

    # In Ticket 05 step 5:
    # bounded macros are split by medium if mixed
    # Let's count how many split clusters are produced and track drops:
    # If raw macro has < 3 seeds -> dropped by size (or waived if carverclan)
    # If raw macro >= 3 seeds and mixed:
    #   split into movie and series.
    #   if sub_m < 3 seeds -> dropped by size (or medium?)
    
    split_items = []
    dropped_size = 0
    dropped_medium = 0

    for m in bounded:
        if len(m) < 3:
            dropped_size += 1
            # In ticket 05, carverclan had waiver, but rule here says: "shelf = macro with >= 3 seeds"
            continue
        media_list = ["series" if k[idx].startswith("tv:") else "movie" for idx in m]
        if len(set(media_list)) > 1:
            # Macro was mixed: split into medium components
            for med_type in ("series", "movie"):
                sub_m = [idx for idx in m if ("series" if k[idx].startswith("tv:") else "movie") == med_type]
                if len(sub_m) >= 3:
                    split_items.append((sub_m, med_type))
                elif len(sub_m) > 0:
                    dropped_size += 1
        else:
            split_items.append((m, media_list[0]))

    # Now evaluate split_items
    candidates = []
    seed_cache = {}
    for c_idx, (m, med_type) in enumerate(split_items):
        sz = len(m)
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

        # Top 10 recommendations
        semi_rac = [
            {"tmdbId": int(k[idx].split(":")[1]), "medium": "series" if k[idx].startswith("tv:") else "movie", "tipo": "watched", "peso": 1.0}
            for idx in m
        ]
        racs_cluster = engine.raccomanda(semi_rac, cap=10, medium=med_type, esclusi=k)
        top10_cand_keys = set(r["key"] for r in racs_cluster[:10])

        # Consistency
        top10_list = []
        for idx in m:
            ckey = (idx, med_type)
            if ckey not in seed_cache:
                racs = engine.raccomanda([{"key": k[idx], "plays": 1.0}], cap=10, medium=med_type, esclusi=k)
                seed_cache[ckey] = set(r["key"] for r in racs)
            top10_list.append(seed_cache[ckey])
        pairs = [jaccard(top10_list[i], top10_list[j]) for i in range(sz) for j in range(i + 1, sz)]
        consistency = float(np.mean(pairs)) if pairs else 0.0

        candidates.append({
            "id": c_idx,
            "seeds": m,
            "size": sz,
            "medium": med_type,
            "min_eta": min_e,
            "plays": tot_pl,
            "consistency": consistency,
            "dom_coll": dom_coll,
            "top10_cands": top10_cand_keys
        })

    # Ranking:
    if candidates:
        candidates.sort(key=lambda x: x["min_eta"])
        for r_idx, item in enumerate(candidates): item["r_rec"] = r_idx + 1
        candidates.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
        for r_idx, item in enumerate(candidates):
            item["r_sup"] = r_idx + 1
            item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0

        best_freshest = min(candidates, key=lambda x: (x["min_eta"], x["r_comb"]))
        rem = [c for c in candidates if c["id"] != best_freshest["id"]]
        rem.sort(key=lambda x: (x["r_comb"], -x["consistency"], -x["size"], -x["plays"]))
        ranked = [best_freshest] + rem
    else:
        ranked = []

    selected = []
    seen_colls = set()
    selected_top10s = []
    cum_seeds = 0
    dropped_family = 0
    dropped_overlap = 0

    target_80 = 0.80 * total_clustered_seeds

    for c in ranked:
        if c["dom_coll"] is not None and c["dom_coll"] in seen_colls:
            dropped_family += 1
            continue
        has_overlap = False
        for s_top10 in selected_top10s:
            if jaccard(c["top10_cands"], s_top10) >= 0.5:
                has_overlap = True
                break
        if has_overlap:
            dropped_overlap += 1
            continue

        selected.append(c)
        if c["dom_coll"] is not None:
            seen_colls.add(c["dom_coll"])
        selected_top10s.append(c["top10_cands"])
        cum_seeds += c["size"]

        if cum_seeds >= target_80:
            break

    print(f"--- Profilo {u:12s} (Total={total_profile_seeds}, Clustered={total_clustered_seeds}) ---", flush=True)
    print(f"  Qualifying candidates: {len(candidates)}", flush=True)
    print(f"  SELECTED SHELVES: {len(selected)}", flush=True)
    print(f"  Cumulative seeds served: {cum_seeds} / {total_clustered_seeds} ({cum_seeds/total_clustered_seeds*100:.1f}%)", flush=True)
    print(f"  Drops: size={dropped_size}, medium={dropped_medium}, family={dropped_family}, overlap={dropped_overlap}", flush=True)
