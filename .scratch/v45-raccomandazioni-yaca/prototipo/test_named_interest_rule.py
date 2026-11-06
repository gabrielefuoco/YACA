import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
from pathlib import Path
from collections import Counter
import json
import pickle
import time
import numpy as np
import scipy.sparse as sp
import pandas as pd

from graph import canon as K
from graph import provenance as _PV
from graph.runtime import Engine
from graph.build import data as D
from cluster import clusterizza_semi
from macro import aggrega_macro_cluster_tau, bisect_cluster
from tassonomia import TASSONOMIA_36, assegna_etichetta_cluster, valuta_cluster, TaxonomyEntry
from dieci_storie import carica_wider_bags, calcola_sim_wider, jaccard, PROFILI_10, NOISE_KEYWORDS

print("=== INIZIALIZZAZIONE TEST 'A SHELF IS A NAMED INTEREST' ===", flush=True)

engine = Engine.carica_transizione(pota=16)
meta = K.metadati()
coll = meta["COLL"]
anime_flags = meta["ANIME"]
adult_flags = meta["ADULTO"]

# Pre-carica extra_info da Parquet TMDB
print("Caricamento metadati linguistici e geografici da Parquet TMDB...", flush=True)
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

print("\n=== ESECUZIONE SIMULAZIONE ===", flush=True)

# Cache persistente per top10 raccomandazioni
cache_path = Path(".scratch/v45-raccomandazioni-yaca/prototipo/seed_top10_cache.pkl")
if cache_path.exists():
    with open(cache_path, "rb") as f:
        global_seed_cache = pickle.load(f)
else:
    global_seed_cache = {}

results = {}

for u, desc_gap, tipo_gap in PROFILI_10:
    t_u = time.time()
    k, righe, plays, eta = storie[u]
    S = calcola_sim_wider(righe, wider_bags)
    micros, _, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
    raw_macros = aggrega_macro_cluster_tau(engine, righe, micros, tau=0.03)

    tot_seeds = len(righe)
    clustered_seeds_set = set(idx for m in raw_macros for idx in m)
    tot_clustered = len(clustered_seeds_set)

    stats = {"bisections": 0, "small_phv": 0}

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
        if sz < 4 and sz <= 12:
            # Cannot be eligible (needs >= 4 seeds) and not > 12 so not bisected
            return []

        ev, macro_med = build_evidence(m)
        nome_base, nome_fonte, conf, matched_entry = assegna_etichetta_cluster(ev)

        if nome_fonte == "tassonomia":
            if sz >= 4:
                # Eligible as taxonomy shelf
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
                # Bisect and re-test children
                stats["bisections"] += 1
                c1, c2 = bisect_cluster(engine, righe, m)
                return eval_macro(c1) + eval_macro(c2)
            else:
                # sz <= 12
                if sz >= 4:
                    stats["small_phv"] += 1
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

    # Precompute metrics for ranking: min_eta, consistency, plays, dominant collection
    for item in eligible:
        m = item["seeds"]
        m_eta = [eta[idx] for idx in m]
        item["min_eta"] = min(m_eta)
        item["plays"] = sum(plays[idx] for idx in m)

        # Consistency
        sz = len(m)
        top10_list = [get_top10(idx, item["medium"]) for idx in m]
        pairs = [jaccard(top10_list[i], top10_list[j]) for i in range(sz) for j in range(i + 1, sz)]
        item["consistency"] = float(np.mean(pairs)) if pairs else 0.0

        # Dominant collection
        c_coll = coll[righe[m]]
        pos = [x for x in c_coll if x > 0]
        dom_coll = None
        if pos:
            dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
            if (dom_cnt / sz) >= 0.5:
                dom_coll = int(dom_cid)
        item["dom_coll"] = dom_coll

    # Combined ranking
    eligible.sort(key=lambda x: x["min_eta"])
    for r_idx, item in enumerate(eligible): item["r_rec"] = r_idx + 1

    eligible.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
    for r_idx, item in enumerate(eligible):
        item["r_sup"] = r_idx + 1
        item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0

    if eligible:
        best_freshest = min(eligible, key=lambda x: (x["min_eta"], x["r_comb"]))
        rem = [c for c in eligible if id(c) != id(best_freshest)]
        rem.sort(key=lambda x: (x["r_comb"], -x["consistency"], -x["size"], -x["plays"]))
        ranked = [best_freshest] + rem
    else:
        ranked = []

    # Sequential dedupe: family dedupe and overlap dedupe (no cap on count)
    served = []
    seen_colls = set()
    served_top10s = []
    dropped_family = 0
    dropped_overlap = 0

    for c in ranked:
        if c["dom_coll"] is not None and c["dom_coll"] in seen_colls:
            dropped_family += 1
            continue

        semi_rac = [
            {"tmdbId": int(k[idx].split(":")[1]), "medium": "series" if k[idx].startswith("tv:") else "movie", "tipo": "watched", "peso": 1.0}
            for idx in c['seeds']
        ]
        racs = engine.raccomanda(semi_rac, cap=10, medium=c['medium'], esclusi=k)
        c_top10 = set(r["key"] for r in racs[:10])

        has_overlap = False
        for s_top10 in served_top10s:
            if jaccard(c_top10, s_top10) >= 0.5:
                has_overlap = True
                break
        if has_overlap:
            dropped_overlap += 1
            continue

        served.append(c)
        if c["dom_coll"] is not None:
            seen_colls.add(c["dom_coll"])
        served_top10s.append(c_top10)

    # Compute stats
    served_seeds_set = set(idx for c in served for idx in c["seeds"])
    n_served_seeds = len(served_seeds_set)
    pct_served_tot = (n_served_seeds / tot_seeds * 100.0) if tot_seeds > 0 else 0.0
    pct_served_clust = (n_served_seeds / tot_clustered * 100.0) if tot_clustered > 0 else 0.0
    sizes = [c["size"] for c in served]

    served_phv_count = sum(1 for c in served if c["is_phv"])

    print(f"Elaborato {u:16s}: raw={len(raw_macros):2d} -> serviti={len(served):2d} scaffali (dim: {sizes}) in {time.time()-t_u:.2f}s", flush=True)

    results[u] = {
        "tot_seeds": tot_seeds,
        "tot_clustered": tot_clustered,
        "n_served": len(served),
        "sizes": sizes,
        "n_served_seeds": n_served_seeds,
        "pct_served_tot": pct_served_tot,
        "pct_served_clust": pct_served_clust,
        "bisections": stats["bisections"],
        "eligible_phv": stats["small_phv"],
        "served_phv": served_phv_count,
        "served": served,
        "dropped_family": dropped_family,
        "dropped_overlap": dropped_overlap,
    }

with open(cache_path, "wb") as f:
    pickle.dump(global_seed_cache, f)

with open(".scratch/v45-raccomandazioni-yaca/prototipo/named_interest_results.pkl", "wb") as f:
    pickle.dump(results, f)

print("\n" + "="*120)
print(f"{'PROFILO':16s} | {'SEMI':4s} | {'SCAFF':5s} | {'DIMENSIONI':25s} | {'SEMI SERVITI':15s} | {'BISEZ':5s} | {'PHV SERV':8s}")
print("="*120)

for u, d in results.items():
    sizes_str = str(d["sizes"]) if d["sizes"] else "[]"
    cov_str = f"{d['n_served_seeds']} ({d['pct_served_tot']:.1f}%)"
    print(f"{u:16s} | {d['tot_seeds']:4d} | {d['n_served']:5d} | {sizes_str:25s} | {cov_str:15s} | {d['bisections']:5d} | {d['served_phv']:8d}")

print("\n" + "="*120)
print("VERIFICA CRITERI DI ACCETTAZIONE DICHIARATI:")
print("="*120)

# Criterio 1: almeno 8 su 10 timeline tra 3 e 10 scaffali
c1_pass = sum(1 for d in results.values() if 3 <= d["n_served"] <= 10)
print(f"1. Almeno 8 su 10 tra 3 e 10 scaffali: {c1_pass}/10 -> {'PASS' if c1_pass >= 8 else 'FAIL'}")
for u, d in results.items():
    if not (3 <= d["n_served"] <= 10):
        print(f"   - {u}: {d['n_served']} scaffali (fuori dal range 3-10)")

# Criterio 2: nessuna timeline supera 10
c2_fails = [u for u, d in results.items() if d["n_served"] > 10]
print(f"2. Nessuna timeline supera 10 scaffali: {'PASS' if not c2_fails else 'FAIL'} (superano: {c2_fails})")

# Criterio 3: ogni profilo con >= 25 semi serve almeno 3 scaffali
c3_fails = [u for u, d in results.items() if d["tot_seeds"] >= 25 and d["n_served"] < 3]
print(f"3. Ogni profilo >= 25 semi serve >= 3 scaffali: {'PASS' if not c3_fails else 'FAIL'} (falliscono: {c3_fails})")

# Criterio 4: lo scaffale più grande non supera 40 semi
c4_fails = []
for u, d in results.items():
    if d["sizes"] and max(d["sizes"]) > 40:
        c4_fails.append((u, max(d["sizes"])))
print(f"4. Nessuno scaffale supera 40 semi: {'PASS' if not c4_fails else 'FAIL'} (superano: {c4_fails})")

# Dettaglio scaffali per pepsihx (pepsipex) e castoffcrown
for target_u in ["pepsipex", "castoffcrown"]:
    d = results[target_u]
    k, righe, plays, eta = storie[target_u]
    print("\n" + "="*120)
    print(f"DETTAGLIO SCAFFALI PER {target_u.upper()} (Totale serviti: {d['n_served']})")
    print("="*120)
    for idx, s in enumerate(d["served"], start=1):
        titles = [f"{meta['TIT'][righe[i]]} ({int(meta['ANNO'][righe[i]])})" for i in s["seeds"][:4]]
        src_tag = "TASSONOMIA" if s["nome_fonte"] == "tassonomia" else "PHV"
        print(f"[{idx:2d}] «{s['nome']}» [{src_tag}, {s['medium']}, {s['size']} semi, min_eta={s['min_eta']:.1f}gg]")
        print(f"     Semi campione: {', '.join(titles)}")

