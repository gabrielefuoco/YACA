import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
import json
import pickle
from collections import Counter
from pathlib import Path
import numpy as np
import pandas as pd

from graph import canon as K
from graph.runtime import Engine
from tassonomia import TASSONOMIA_36, assegna_etichetta_cluster

engine = Engine.carica_transizione(pota=16)
meta = K.metadati()
coll = meta["COLL"]
anime_flags = meta["ANIME"]

# Precarica info linguistiche e geografiche TMDB
extra_info = {}
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

from graph.build import data as D
V = D.vocab()
kw_items = [(t.split(":", 1)[1], c) for t, c in V.items() if t.startswith("kw:")]
kw_names = [x[0] for x in kw_items]
kw_cols = [x[1] for x in kw_items]
X = D.tfidf()
X_kw = X[:, kw_cols].tocsr()

def get_member_kws(r: int) -> set[str]:
    s, e = X_kw.indptr[r], X_kw.indptr[r+1]
    cols = X_kw.indices[s:e]
    return set(kw_names[c] for c in cols if kw_names[c] not in {"duringcreditsstinger", "aftercreditsstinger"})

def jaccard(s1: set, s2: set) -> float:
    if not s1 and not s2: return 1.0
    u = len(s1 | s2)
    return len(s1 & s2) / u if u > 0 else 0.0

with open('.scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl', 'rb') as f:
    evals = pickle.load(f)

PROFILI_DRY_RUN = ["warnok", "carverclan", "pepsipex"]
contratto_output = {
    "versione_contratto": "2.0-no-cap-content-ids",
    "ricetta": "v45-m12-tau0.03-top100cos-tax36-combmineta-stop80",
    "versioni": {
        "artefatto": "bolle-eterogeneo-V45-p1.0-triangolo.npz",
        "ricetta": "v45-m12-tau0.03-top100cos-tax36-combmineta-stop80"
    },
    "profili": {}
}

for u in PROFILI_DRY_RUN:
    d = evals[u]
    k = d['k']
    righe = d['righe']
    plays = d['plays']
    eta = d['eta']
    tot_seeds = d['n_seeds']

    # Clustered seeds
    raw_macros = d['macros']
    clustered_seeds = set(idx for m in raw_macros for idx in m['seeds'])
    n_clust = len(clustered_seeds)

    # Qualification: size >= 3, medium-homogeneous
    dropped_size = sum(1 for m in raw_macros if m['size'] < 3)
    dropped_medium = 0
    qual = []
    for m in raw_macros:
        if m['size'] < 3:
            continue
        meds = ['series' if k[i].startswith('tv:') else 'movie' for i in m['seeds']]
        if len(set(meds)) > 1:
            dropped_medium += 1
        else:
            qual.append(m)

    # Dominant collection
    for m in qual:
        c_coll = coll[righe[m['seeds']]]
        pos = [x for x in c_coll if x > 0]
        dom_coll = None
        if pos:
            dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
            if (dom_cnt / m['size']) >= 0.5:
                dom_coll = int(dom_cid)
        m['dom_coll'] = dom_coll

    # Ranking: position 1 = smallest min_eta, positions 2..n by combined rank
    if qual:
        qual.sort(key=lambda x: x["min_eta"])
        for r_idx, item in enumerate(qual): item["r_rec"] = r_idx + 1
        qual.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
        for r_idx, item in enumerate(qual):
            item["r_sup"] = r_idx + 1
            item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0

        best_freshest = min(qual, key=lambda x: (x["min_eta"], x["r_comb"]))
        rem = [c for c in qual if c["id"] != best_freshest["id"]]
        rem.sort(key=lambda x: (x["r_comb"], -x["consistency"], -x["size"], -x["plays"]))
        ranked = [best_freshest] + rem
    else:
        ranked = []

    # Selection with family dedupe, overlap dedupe, and stopping rule
    selected = []
    seen_colls = set()
    selected_top10s = []
    cum_seeds = 0
    dropped_family = 0
    dropped_overlap = 0
    target_80 = 0.80 * n_clust

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
        for s_top10 in selected_top10s:
            if jaccard(c_top10, s_top10) >= 0.5:
                has_overlap = True
                break
        if has_overlap:
            dropped_overlap += 1
            continue

        selected.append((c, racs))
        if c["dom_coll"] is not None:
            seen_colls.add(c["dom_coll"])
        selected_top10s.append(c_top10)
        cum_seeds += c['size']

        if cum_seeds >= target_80:
            break

    # Now build shelves JSON
    shelves_json = []
    catalog_ids_list = []

    for s_idx, (sel_item, racs) in enumerate(selected, start=1):
        m = sel_item['seeds']
        m_rows = [righe[idx] for idx in m]
        sz = len(m)
        macro_med = sel_item['medium']

        anime_pct = float(anime_flags[m_rows].mean())
        m_sorted = sorted(m, key=lambda idx: (-plays[idx], eta[idx]))
        repr_seeds_titles = [str(meta["TIT"][righe[idx]]) for idx in m_sorted[:3]]

        # Derivation of catalog ID: yaca_<top_representative_tmdbId>_<medium>
        top_seed_key = k[m_sorted[0]]
        top_tmdb_id = int(top_seed_key.split(":")[1])
        catalog_id = f"yaca_{top_tmdb_id}_{macro_med}"
        catalog_ids_list.append(catalog_id)

        # Naming via tassonomia
        cluster_evidence = {
            "size": sz,
            "medium": macro_med,
            "anime_pct": anime_pct,
            "adult_pct": float(meta["ADULTO"][m_rows].mean()),
            "member_kws": [get_member_kws(r) for r in m_rows],
            "languages": Counter(extra_info.get(k[idx], {}).get("orig_lang") for idx in m if extra_info.get(k[idx], {}).get("orig_lang")),
            "countries": Counter(extra_info.get(k[idx], {}).get("orig_country") for idx in m if extra_info.get(k[idx], {}).get("orig_country")),
            "repr_seeds": repr_seeds_titles,
            "is_piccolo": False,
        }
        nome_base, nome_fonte, conf, matched_entry = assegna_etichetta_cluster(cluster_evidence)

        # Build candidate items (top 10 for sample payload)
        titoli = []
        for r in racs[:10]:
            r_row = engine.row_of[r["key"]]
            titoli.append({
                "tmdbId": int(r["key"].split(":")[1]),
                "type": r["medium"],
                "titolo": str(meta["TIT"][r_row]),
                "anno": int(meta["ANNO"][r_row]) if meta["ANNO"][r_row] > 0 else None,
                "punteggio": float(r["punteggio"]),
                "motivo": f"Affinità con i {sz} semi del cluster «{nome_base}»"
            })

        repr_seeds_objs = []
        for idx in m_sorted[:3]:
            r_idx = righe[idx]
            repr_seeds_objs.append({
                "tmdbId": int(k[idx].split(":")[1]),
                "medium": "series" if k[idx].startswith("tv:") else "movie",
                "titolo": str(meta["TIT"][r_idx]),
                "anno": int(meta["ANNO"][r_idx]) if meta["ANNO"][r_idx] > 0 else None,
                "plays": float(plays[idx]),
                "eta_giorni": float(eta[idx]),
            })

        member_seeds_objs = []
        for idx in m:
            r_idx = righe[idx]
            member_seeds_objs.append({
                "tmdbId": int(k[idx].split(":")[1]),
                "medium": "series" if k[idx].startswith("tv:") else "movie",
                "titolo": str(meta["TIT"][r_idx]),
                "anno": int(meta["ANNO"][r_idx]) if meta["ANNO"][r_idx] > 0 else None,
            })

        shelves_json.append({
            "catalog_id": catalog_id,
            "slot_position": s_idx,
            "nome": nome_base,
            "nome_fonte": nome_fonte,
            "confidenza": float(conf),
            "matched_entry": matched_entry.nome if matched_entry else None,
            "medium": macro_med,
            "consistenza": float(sel_item["consistency"]),
            "is_piccolo": False,
            "min_eta": float(sel_item["min_eta"]),
            "r_comb": float(sel_item.get("r_comb", 0.0)),
            "n_semi": sz,
            "semi_rappresentativi": repr_seeds_objs,
            "semi_membri": member_seeds_objs,
            "titoli": titoli
        })

    contratto_output["profili"][u] = {
        "tipo_profilo": d["tipo_gap"],
        "n_semi_totali": tot_seeds,
        "n_semi_clusterizzati": n_clust,
        "n_scaffali_serviti": len(shelves_json),
        "semi_coperti_serviti": cum_seeds,
        "quota_semi_coperti_pct": round((cum_seeds / n_clust * 100), 2) if n_clust > 0 else 0.0,
        "quota_semi_totali_pct": round((cum_seeds / tot_seeds * 100), 2) if tot_seeds > 0 else 0.0,
        "scarti": {
            "size_lt_3": dropped_size,
            "medium_heterogeneous": dropped_medium,
            "family_dedupe": dropped_family,
            "overlap_dedupe": dropped_overlap
        },
        "catalog_ids": catalog_ids_list,
        "scaffali": shelves_json
    }
    print(f"Generato profilo {u:12s}: {len(shelves_json)} scaffali, {cum_seeds} semi coperti ({contratto_output['profili'][u]['quota_semi_coperti_pct']}%), catalog_ids: {len(catalog_ids_list)}", flush=True)

out_path = Path(".scratch/v45-raccomandazioni-yaca/prototipo/contratto-scaffali.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(contratto_output, f, indent=2, ensure_ascii=False)
print(f"Salvataggio completato su {out_path}!", flush=True)
