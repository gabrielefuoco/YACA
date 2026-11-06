import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
from pathlib import Path
from collections import Counter
import json
import pickle
import time
import math
import numpy as np
import scipy.sparse as sp
import pandas as pd

from graph import canon as K
from graph.runtime import Engine
from graph.build import data as D
from cluster import clusterizza_semi
from macro import aggrega_macro_cluster_tau, bisect_cluster
from tassonomia import TASSONOMIA_36, assegna_etichetta_cluster, valuta_cluster
from dieci_storie import carica_wider_bags, calcola_sim_wider, jaccard, PROFILI_10, NOISE_KEYWORDS

print("=== RUNNING FULL EXPERIMENT: BUDGET SPENT BY COVERAGE ===", flush=True)

engine = Engine.carica_transizione(pota=16)
meta = K.metadati()
coll = meta["COLL"]
anime_flags = meta["ANIME"]
adult_flags = meta["ADULTO"]

# Pre-carica extra_info da Parquet TMDB
extra_info: dict[str, dict] = {}
for fn, tipo, id_col in [
    ("movies.parquet", "movie", "id"),
    ("tv.parquet", "tv", "id"),
    ("anime-extra-movies.parquet", "movie", "id"),
    ("anime-extra-tv.parquet", "tv", "id"),
]:
    p = Path(".cache/tmdb") / fn
    if p.exists():
        df = pd.read_parquet(p, columns=[id_col, "original_language", "production_countries"])
        for row in df.itertuples(index=False):
            rd = row._asdict()
            k_item = f"{tipo}:{int(rd[id_col])}"
            p_c = rd.get("production_countries")
            c_code = None
            if p_c and isinstance(p_c, str):
                try:
                    p_list = json.loads(p_c)
                    if isinstance(p_list, list) and p_list:
                        c_code = p_list[0].get("iso_3166_1")
                except Exception:
                    pass
            extra_info[k_item] = {
                "orig_lang": rd.get("original_language"),
                "orig_country": c_code,
            }

# Matrice TF-IDF per keyword
V = D.vocab()
kw_items = [(t.split(":", 1)[1], c) for t, c in V.items() if t.startswith("kw:")]
kw_names = [x[0] for x in kw_items]
kw_cols = [x[1] for x in kw_items]
X = D.tfidf()
X_kw = X[:, kw_cols].tocsr()

def get_member_kws(r: int) -> set[str]:
    s, e = X_kw.indptr[r], X_kw.indptr[r+1]
    cols = X_kw.indices[s:e]
    return set(kw_names[c] for c in cols if kw_names[c] not in NOISE_KEYWORDS)

storie = {}
for u, _, _ in PROFILI_10:
    k, righe, plays, eta = K.storia_trakt(u, ordine="recente")
    storie[u] = (k, righe, plays, eta)

all_righe = sorted(list({r for u in storie for r in storie[u][1]}))
wider_bags = carica_wider_bags(all_righe, Path("services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz"))

cache_path = Path(".scratch/v45-raccomandazioni-yaca/prototipo/seed_top10_cache.pkl")
if cache_path.exists():
    with open(cache_path, "rb") as f:
        global_seed_cache = pickle.load(f)
else:
    global_seed_cache = {}

def run_experiment(use_tot_seeds_for_floor=True, tie_breaker="min_eta"):
    results_by_profile = {}
    
    for u, desc_gap, tipo_gap in PROFILI_10:
        k, righe, plays, eta = storie[u]
        S = calcola_sim_wider(righe, wider_bags)
        micros, _, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
        raw_macros = aggrega_macro_cluster_tau(engine, righe, micros, tau=0.03)

        tot_seeds = len(righe)
        clustered_seeds_set = set(idx for m in raw_macros for idx in m)
        tot_clustered = len(clustered_seeds_set)

        if use_tot_seeds_for_floor:
            soglia = min(4, max(2, math.ceil(tot_seeds / 4)))
        else:
            soglia = min(4, max(2, math.ceil(tot_clustered / 4)))

        def get_top10(idx: int, med: str) -> set[str]:
            ckey = (k[idx], med)
            if ckey not in global_seed_cache:
                racs = engine.raccomanda([{"tmdbId": int(k[idx].split(":")[1]), "medium": "series" if k[idx].startswith("tv:") else "movie", "tipo": "watched", "peso": 1.0}], cap=10, medium=med, esclusi=k)
                global_seed_cache[ckey] = set(r["key"] for r in racs[:10])
            return global_seed_cache[ckey]

        def build_evidence(m: list[int]) -> tuple[dict, str]:
            sz = len(m)
            m_rows = [righe[idx] for idx in m]
            media_list = ["series" if k[idx].startswith("tv:") else "movie" for idx in m]
            c_med = Counter(media_list)
            if c_med["series"] > c_med["movie"]:
                macro_med = "series"
            elif c_med["movie"] > c_med["series"]:
                macro_med = "movie"
            else:
                best_idx = max(m, key=lambda idx: (plays[idx], -eta[idx]))
                macro_med = "series" if k[best_idx].startswith("tv:") else "movie"

            anime_pct = float(anime_flags[m_rows].mean())
            m_sorted = sorted(m, key=lambda idx: (-plays[idx], eta[idx]))
            repr_seeds = [str(meta["TIT"][righe[idx]]) for idx in m_sorted[:3]]

            ev = {
                "size": sz,
                "medium": macro_med,
                "anime_pct": anime_pct,
                "adult_pct": float(adult_flags[m_rows].mean()),
                "member_kws": [get_member_kws(r) for r in m_rows],
                "languages": Counter(extra_info.get(k[idx], {}).get("orig_lang") for idx in m if extra_info.get(k[idx], {}).get("orig_lang")),
                "countries": Counter(extra_info.get(k[idx], {}).get("orig_country") for idx in m if extra_info.get(k[idx], {}).get("orig_country")),
                "repr_seeds": repr_seeds,
                "is_piccolo": False,
            }
            return ev, macro_med

        def eval_macro(m: list[int]) -> list[dict]:
            sz = len(m)
            # Staple diet split: any macro > 40 is bisected regardless of matching
            if sz > 40:
                c1, c2 = bisect_cluster(engine, righe, m)
                return eval_macro(c1) + eval_macro(c2)

            ev, macro_med = build_evidence(m)
            nome_base, nome_fonte, conf, matched_entry = assegna_etichetta_cluster(ev)

            if nome_fonte == "tassonomia":
                if sz >= soglia:
                    return [{
                        "seeds": m,
                        "size": sz,
                        "medium": macro_med,
                        "nome": nome_base,
                        "nome_fonte": nome_fonte,
                        "conf": conf,
                        "matched_entry": matched_entry,
                        "is_phv": False,
                    }]
                else:
                    return []
            else:
                # Does NOT match any taxonomy entry
                if sz > 12:
                    c1, c2 = bisect_cluster(engine, righe, m)
                    return eval_macro(c1) + eval_macro(c2)
                else:
                    if sz >= soglia:
                        return [{
                            "seeds": m,
                            "size": sz,
                            "medium": macro_med,
                            "nome": nome_base,
                            "nome_fonte": nome_fonte,
                            "conf": conf,
                            "matched_entry": None,
                            "is_phv": True,
                        }]
                    else:
                        return []

        eligible = []
        for m in raw_macros:
            eligible.extend(eval_macro(m))

        # Precompute metrics and shelf recommendations
        for item in eligible:
            m = item["seeds"]
            m_eta = [eta[idx] for idx in m]
            item["min_eta"] = min(m_eta)
            item["plays"] = sum(plays[idx] for idx in m)

            sz = len(m)
            top10_list = [get_top10(idx, item["medium"]) for idx in m]
            pairs = [jaccard(top10_list[i], top10_list[j]) for i in range(sz) for j in range(i + 1, sz)]
            item["consistency"] = float(np.mean(pairs)) if pairs else 0.0

            c_coll = coll[righe[m]]
            pos = [x for x in c_coll if x > 0]
            dom_coll = None
            if pos:
                dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
                if (dom_cnt / sz) >= 0.5:
                    dom_coll = int(dom_cid)
            item["dom_coll"] = dom_coll

            # Shelf recommendation top10
            semi_rac = [
                {"tmdbId": int(k[idx].split(":")[1]), "medium": "series" if k[idx].startswith("tv:") else "movie", "tipo": "watched", "peso": 1.0}
                for idx in m
            ]
            racs = engine.raccomanda(semi_rac, cap=10, medium=item['medium'], esclusi=k)
            item["top10"] = set(r["key"] for r in racs[:10])

        # Ranks for combined rank tie breaker
        eligible.sort(key=lambda x: x["min_eta"])
        for r_idx, item in enumerate(eligible): item["r_rec"] = r_idx + 1
        eligible.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
        for r_idx, item in enumerate(eligible):
            item["r_sup"] = r_idx + 1
            item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0

        # Greedy selection for N in {5, 6, 8}
        def greedy_pick(budget_N: int) -> list[dict]:
            served = []
            covered_seeds = set()
            seen_tax_labels = set()
            seen_colls = set()

            while len(served) < budget_N:
                best_cand = None
                best_key = None

                for cand in eligible:
                    if cand in served:
                        continue
                    if cand["nome_fonte"] == "tassonomia" and cand["nome"] in seen_tax_labels:
                        continue
                    if cand["dom_coll"] is not None and cand["dom_coll"] in seen_colls:
                        continue
                    if any(jaccard(cand["top10"], s["top10"]) >= 0.5 for s in served):
                        continue

                    uncovered_added = len(set(cand["seeds"]) - covered_seeds)
                    if uncovered_added <= 0:
                        continue

                    # Define comparison key based on tie_breaker
                    if tie_breaker == "min_eta":
                        # maximize uncovered, minimize min_eta (freshest first), maximize consistency
                        cand_key = (uncovered_added, -cand["min_eta"], cand["consistency"])
                    elif tie_breaker == "r_comb":
                        # maximize uncovered, minimize r_comb, maximize consistency
                        cand_key = (uncovered_added, -cand["r_comb"], cand["consistency"])
                    elif tie_breaker == "consistency":
                        cand_key = (uncovered_added, cand["consistency"], -cand["min_eta"])
                    else:
                        cand_key = (uncovered_added, -cand["min_eta"])

                    if best_cand is None or cand_key > best_key:
                        best_cand = cand
                        best_key = cand_key

                if best_cand is None:
                    break

                served.append(best_cand)
                covered_seeds.update(best_cand["seeds"])
                if best_cand["nome_fonte"] == "tassonomia":
                    seen_tax_labels.add(best_cand["nome"])
                if best_cand["dom_coll"] is not None:
                    seen_colls.add(best_cand["dom_coll"])

            return served

        prof_res = {
            "tot_seeds": tot_seeds,
            "tot_clustered": tot_clustered,
            "soglia": soglia,
            "eligible_count": len(eligible),
            "by_N": {}
        }

        for N in [5, 6, 8]:
            s_list = greedy_pick(N)
            cov_seeds = len(set(idx for s in s_list for idx in s["seeds"]))
            pct_tot = (cov_seeds / tot_seeds * 100.0) if tot_seeds > 0 else 0.0
            pct_clust = (cov_seeds / tot_clustered * 100.0) if tot_clustered > 0 else 0.0
            prof_res["by_N"][N] = {
                "n_served": len(s_list),
                "served": s_list,
                "labels": [s["nome"] for s in s_list],
                "sizes": [s["size"] for s in s_list],
                "cov_seeds": cov_seeds,
                "pct_tot": pct_tot,
                "pct_clust": pct_clust,
            }

        results_by_profile[u] = prof_res

    return results_by_profile

print("Esecuzione test con tie_breaker='min_eta'...", flush=True)
res_min_eta = run_experiment(use_tot_seeds_for_floor=True, tie_breaker="min_eta")

print("Esecuzione test con tie_breaker='r_comb'...", flush=True)
res_r_comb = run_experiment(use_tot_seeds_for_floor=True, tie_breaker="r_comb")

# Salva risultati
with open(cache_path, "wb") as f:
    pickle.dump(global_seed_cache, f)

with open(".scratch/v45-raccomandazioni-yaca/prototipo/greedy_experiment_results.pkl", "wb") as f:
    pickle.dump({"min_eta": res_min_eta, "r_comb": res_r_comb}, f)

print("Esperimento completato e risultati salvati.", flush=True)
