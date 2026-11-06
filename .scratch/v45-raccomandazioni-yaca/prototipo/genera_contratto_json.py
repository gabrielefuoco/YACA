import sys
sys.path.extend(['services', '.scratch/v45-raccomandazioni-yaca/prototipo'])
from pathlib import Path
from collections import Counter
import json
import pickle
import numpy as np

from graph import canon as K
from graph.runtime import Engine
from tassonomia import assegna_etichetta_cluster

print("Loading engine and metadata...", flush=True)
engine = Engine.carica_transizione(pota=16)
meta = K.metadati()
coll = meta["COLL"]
anime_flags = meta["ANIME"]
adult_flags = meta["ADULTO"]

cache_file = Path(".scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl")
with open(cache_file, "rb") as f:
    profiles_eval = pickle.load(f)

# Preload language/country info if available
import pandas as pd
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
    return set(kw_names[c] for c in cols if kw_names[c] not in {'duringcreditsstinger', 'aftercreditsstinger'})

def build_profile_dry_run(u: str):
    p = profiles_eval[u]
    k = p['k']
    righe = p['righe']
    plays = p['plays']
    eta = p['eta']
    macros = list(p['macros'])
    n_seeds = len(righe)

    # Ranking combinato recenza + supporto, tie-break consistenza
    macros.sort(key=lambda x: x["min_eta"])
    for r_idx, item in enumerate(macros): item["r_rec"] = r_idx + 1

    macros.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
    for r_idx, item in enumerate(macros):
        item["r_sup"] = r_idx + 1
        item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0

    macros.sort(key=lambda x: (x["r_comb"], -x["consistency"], -x["size"], -x["plays"]))

    selected = []
    seen_colls = set()

    for item in macros:
        if item["size"] < 2:
            continue
        m = item["seeds"]
        c_coll = coll[righe[m]]
        pos = [x for x in c_coll if x > 0]
        dom_coll = None
        if pos:
            dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
            if (dom_cnt / len(m)) >= 0.5:
                dom_coll = int(dom_cid)
        if dom_coll is not None and dom_coll in seen_colls:
            continue
        if dom_coll is not None:
            seen_colls.add(dom_coll)
        selected.append(item)
        if len(selected) == 5:
            break

    raw_shelves = []
    for s_idx, sel in enumerate(selected, start=1):
        m = sel["seeds"]
        m_rows = [righe[idx] for idx in m]
        sz = len(m)
        macro_med = sel["medium"]
        is_piccolo = sel.get("is_piccolo", False) or sz < 3
        anime_pct = float(anime_flags[m_rows].mean())

        m_sorted = sorted(m, key=lambda idx: (-plays[idx], eta[idx]))
        repr_seeds = [str(meta["TIT"][righe[idx]]) for idx in m_sorted[:3]]

        cluster_evidence = {
            "size": sz,
            "medium": macro_med,
            "anime_pct": anime_pct,
            "adult_pct": float(adult_flags[m_rows].mean()),
            "member_kws": [get_member_kws(r) for r in m_rows],
            "languages": Counter(extra_info.get(k[idx], {}).get("orig_lang") for idx in m if extra_info.get(k[idx], {}).get("orig_lang")),
            "countries": Counter(extra_info.get(k[idx], {}).get("orig_country") for idx in m if extra_info.get(k[idx], {}).get("orig_country")),
            "repr_seeds": repr_seeds,
            "is_piccolo": is_piccolo,
        }
        nome_base, nome_fonte, conf, matched_entry = assegna_etichetta_cluster(cluster_evidence)

        # Recommendation candidates
        semi_rac = [
            {
                "tmdbId": int(k[idx].split(":")[1]),
                "medium": "series" if k[idx].startswith("tv:") else "movie",
                "tipo": "watched",
                "peso": 1.0,
            }
            for idx in m
        ]
        racs = engine.raccomanda(semi_rac, cap=20, medium=macro_med, esclusi=k)

        cand_items = []
        for r in racs:
            row_idx = engine.row_of[r['key']]
            cand_items.append({
                "tmdbId": int(r['key'].split(":")[1]),
                "type": "series" if r['key'].startswith("tv:") else "movie",
                "titolo": str(meta["TIT"][row_idx]),
                "anno": int(meta["ANNO"][row_idx]),
                "punteggio": round(float(r['punteggio']), 6),
                "motivo": f"Affinità con i {sz} semi del cluster «{nome_base}»"
            })

        semi_rappresentativi = []
        for idx in m_sorted[:3]:
            r_idx = righe[idx]
            semi_rappresentativi.append({
                "tmdbId": int(k[idx].split(":")[1]),
                "medium": "series" if k[idx].startswith("tv:") else "movie",
                "titolo": str(meta["TIT"][r_idx]),
                "anno": int(meta["ANNO"][r_idx]),
                "plays": float(plays[idx]),
                "eta_giorni": float(eta[idx]),
            })

        semi_membri = []
        for idx in m:
            r_idx = righe[idx]
            semi_membri.append({
                "tmdbId": int(k[idx].split(":")[1]),
                "medium": "series" if k[idx].startswith("tv:") else "movie",
                "titolo": str(meta["TIT"][r_idx]),
                "anno": int(meta["ANNO"][r_idx]),
            })

        suffisso = "movies" if macro_med == "movie" else "series"
        raw_shelves.append({
            "slot_id": f"yaca_shelf_{s_idx}_{suffisso}",
            "shelf_index": s_idx,
            "nome": nome_base,
            "nome_fonte": nome_fonte,
            "confidenza": round(float(conf), 3),
            "matched_entry": matched_entry.nome if matched_entry else None,
            "medium": macro_med,
            "consistenza": round(float(sel["consistency"]), 4),
            "is_piccolo": bool(is_piccolo),
            "n_semi": sz,
            "semi_rappresentativi": semi_rappresentativi,
            "semi_membri": semi_membri,
            "titoli": cand_items,
        })

    return {
        "profilo": u,
        "n_semi_totali": n_seeds,
        "n_scaffali_serviti": len(raw_shelves),
        "scaffali": raw_shelves
    }

print("Generating dry run for warnok...", flush=True)
dry_warnok = build_profile_dry_run("warnok")

print("Generating dry run for carverclan...", flush=True)
dry_carver = build_profile_dry_run("carverclan")

contract_payload = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "contratto_versione": 2,
    "timestamp_congelamento": "2026-11-06T22:07:00Z",
    "versioni": {
        "artefatto": "bolle-eterogeneo-V45-p1.0-triangolo.npz",
        "ricetta": "v45-m12-tau0.03-top100cos-tax36-combmineta"
    },
    "specifiche_ricetta": {
        "M_bisection_cap": 12,
        "tau_macro_merge": 0.03,
        "min_affinity_micro": 0.02,
        "ranking": "r_comb = (r_rec + r_sup)/2.0, tie-break consistenza",
        "n_scaffali_max": 5,
        "family_dedupe": True,
        "waiver_cluster_piccolo": True
    },
    "esempi_reali_dry_run": {
        "warnok": dry_warnok,
        "carverclan": dry_carver
    }
}

out_path = Path(".scratch/v45-raccomandazioni-yaca/prototipo/contratto-scaffali.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(contract_payload, f, indent=2, ensure_ascii=False)

print(f"Salvataggio completato su {out_path}!", flush=True)
