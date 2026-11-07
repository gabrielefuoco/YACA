import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
from pathlib import Path
from collections import Counter
import json
import pickle
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

print("=== GENERAZIONE CONTRATTO SCAFFALI N=6 DRY RUN ===", flush=True)

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

cache_path = Path(".scratch/v45-raccomandazioni-yaca/prototipo/seed_top10_cache.pkl")
if cache_path.exists():
    with open(cache_path, "rb") as f:
        global_seed_cache = pickle.load(f)
else:
    global_seed_cache = {}

TARGET_PROFILES = ["warnok", "castoffcrown", "pepsipex"]
storie = {}
for u in TARGET_PROFILES:
    storie[u] = K.storia_trakt(u, ordine="recente")

all_righe = sorted(list({r for u in storie for r in storie[u][1]}))
wider_bags = carica_wider_bags(all_righe, Path("services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz"))

output_json = {
    "versione_contratto": "3.0-n6-named-interests",
    "ricetta": "v45-tau0.03-staple40-m12-adaptivefloor-n6-greedy-tax36",
    "versioni": {
        "artefatto": "bolle-eterogeneo-V45-p1.0-triangolo.npz",
        "ricetta": "v45-tau0.03-staple40-m12-adaptivefloor-n6-greedy-tax36"
    },
    "budget_n": 6,
    "profili": {}
}

for u in TARGET_PROFILES:
    k, righe, plays, eta = storie[u]
    S = calcola_sim_wider(righe, wider_bags)
    micros, _, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
    raw_macros = aggrega_macro_cluster_tau(engine, righe, micros, tau=0.03)

    tot_seeds = len(righe)
    clustered_seeds_set = set(idx for m in raw_macros for idx in m)
    tot_clustered = len(clustered_seeds_set)
    soglia = min(4, max(2, math.ceil(tot_seeds / 4)))

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
                    "matched_entry": matched_entry.nome if matched_entry else None,
                    "is_phv": False,
                }]
            else:
                return []
        else:
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

        # Recommendations for shelf
        semi_rac = [
            {"tmdbId": int(k[idx].split(":")[1]), "medium": "series" if k[idx].startswith("tv:") else "movie", "tipo": "watched", "peso": 1.0}
            for idx in m
        ]
        racs = engine.raccomanda(semi_rac, cap=10, medium=item['medium'], esclusi=k)
        item["top10"] = set(r["key"] for r in racs[:10])
        item["racs"] = racs[:10]

    eligible.sort(key=lambda x: x["min_eta"])
    for r_idx, item in enumerate(eligible): item["r_rec"] = r_idx + 1
    eligible.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
    for r_idx, item in enumerate(eligible):
        item["r_sup"] = r_idx + 1
        item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0

    # Greedy pick for N=6
    chosen = []
    covered_seeds = set()
    seen_tax_labels = set()
    seen_colls = set()

    while len(chosen) < 6:
        best_cand = None
        best_key = None
        for cand in eligible:
            if cand in chosen: continue
            if cand["nome_fonte"] == "tassonomia" and cand["nome"] in seen_tax_labels: continue
            if cand["dom_coll"] is not None and cand["dom_coll"] in seen_colls: continue
            if any(jaccard(cand["top10"], s["top10"]) >= 0.5 for s in chosen): continue

            uncovered_added = len(set(cand["seeds"]) - covered_seeds)
            if uncovered_added <= 0: continue
            cand_key = (uncovered_added, -cand["min_eta"], cand["consistency"])
            if best_cand is None or cand_key > best_key:
                best_cand = cand
                best_key = cand_key

        if best_cand is None: break
        chosen.append(best_cand)
        covered_seeds.update(best_cand["seeds"])
        if best_cand["nome_fonte"] == "tassonomia": seen_tax_labels.add(best_cand["nome"])
        if best_cand["dom_coll"] is not None: seen_colls.add(best_cand["dom_coll"])

    # Presentation order: Slot 1 = smallest min_eta, Slots 2..N by r_comb
    best_freshest = min(chosen, key=lambda x: (x["min_eta"], x["r_comb"]))
    rem = [c for c in chosen if id(c) != id(best_freshest)]
    rem.sort(key=lambda x: (x["r_comb"], -x["consistency"], -x["size"], -x["plays"]))
    ordered_shelves = [best_freshest] + rem

    shelves_data = []
    cat_ids = []
    for slot_idx, s in enumerate(ordered_shelves, 1):
        m_sorted = sorted(s["seeds"], key=lambda idx: (-plays[idx], eta[idx]))
        top_seed_idx = m_sorted[0]
        top_tmdb_id = int(k[top_seed_idx].split(":")[1])
        catalog_id = f"yaca_{top_tmdb_id}_{s['medium']}"
        cat_ids.append(catalog_id)

        semi_rappresentativi = []
        for idx in m_sorted[:3]:
            r = righe[idx]
            semi_rappresentativi.append({
                "tmdbId": int(k[idx].split(":")[1]),
                "medium": "series" if k[idx].startswith("tv:") else "movie",
                "titolo": str(meta["TIT"][r]),
                "anno": int(meta["ANNO"][r]),
                "plays": float(plays[idx]),
                "eta_giorni": float(eta[idx]),
            })

        semi_membri = []
        for idx in s["seeds"]:
            r = righe[idx]
            semi_membri.append({
                "tmdbId": int(k[idx].split(":")[1]),
                "medium": "series" if k[idx].startswith("tv:") else "movie",
                "titolo": str(meta["TIT"][r]),
                "anno": int(meta["ANNO"][r]),
            })

        titoli_rac = []
        for r_item in s["racs"]:
            r_row = engine.row_of.get(r_item["key"])
            titolo_str = str(meta["TIT"][r_row]) if r_row is not None else r_item["key"]
            anno_int = int(meta["ANNO"][r_row]) if r_row is not None else 0
            titoli_rac.append({
                "tmdbId": r_item["tmdbId"],
                "type": r_item["medium"],
                "titolo": titolo_str,
                "anno": anno_int,
                "punteggio": round(float(r_item["punteggio"]), 6),
                "motivo": f"Affinità con i {s['size']} semi del cluster «{s['nome']}»",
            })

        shelves_data.append({
            "catalog_id": catalog_id,
            "slot_position": slot_idx,
            "nome": s["nome"],
            "nome_fonte": s["nome_fonte"],
            "confidenza": round(float(s["conf"]), 3),
            "matched_entry": s["matched_entry"],
            "medium": s["medium"],
            "consistenza": round(float(s["consistency"]), 4),
            "is_piccolo": False,
            "min_eta": round(float(s["min_eta"]), 1),
            "r_comb": round(float(s["r_comb"]), 1),
            "n_semi": s["size"],
            "semi_rappresentativi": semi_rappresentativi,
            "semi_membri": semi_membri,
            "titoli": titoli_rac,
        })

    cov_seeds = len(covered_seeds)
    output_json["profili"][u] = {
        "tipo_profilo": "Campione storico",
        "n_semi_totali": tot_seeds,
        "n_semi_clusterizzati": tot_clustered,
        "n_scaffali_serviti": len(shelves_data),
        "semi_coperti_serviti": cov_seeds,
        "quota_semi_coperti_pct": round(cov_seeds / tot_clustered * 100.0, 2),
        "quota_semi_totali_pct": round(cov_seeds / tot_seeds * 100.0, 2),
        "catalog_ids": cat_ids,
        "scaffali": shelves_data,
    }
    print(f"{u}: serviti {len(shelves_data)} scaffali, {cov_seeds}/{tot_clustered} semi ({cov_seeds/tot_clustered*100:.1f}%)", flush=True)

out_path = Path(".scratch/v45-raccomandazioni-yaca/prototipo/contratto-scaffali.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(output_json, f, indent=2, ensure_ascii=False)

print(f"Scritto {out_path} con successo.", flush=True)
