"""build_complete_census.py — Aggregates all unnameable clusters across the 10 timelines into recurring themes."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

import json
from collections import Counter, defaultdict
import numpy as np
import scipy.sparse as sp

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster

PROFILI_10 = [
    "sangam456",
    "hammers-lists",
    "sappss",
    "flixinatoor99",
    "moppierhead",
    "castoffcrown",
    "warnok",
    "pepsipex",
    "carverclan",
    "1jacobjohn",
]

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
W = I.carica_matrice_affinita()
meta = K.metadati()
titles = meta.get("TIT")
years = meta.get("ANNO")
extra_info = I._carica_tmdb_extra()
kw_tuple = I._carica_tfidf_keywords()
kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

def get_member_kws(r_idx: int) -> set[str]:
    if X_kw is None: return set()
    s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
    cols = X_kw.indices[s:e]
    return set(kw_names[c] for c in cols if kw_names[c] not in I.NOISE_KEYWORDS)

raw_unnameable_list = []

for p in PROFILI_10:
    try:
        chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
    except Exception as exc:
        print(f"Skipping profile {p}: {exc}")
        continue

    n_seeds = len(chiavi)
    if n_seeds == 0: continue

    righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

    nep_arr = engine.nep[righe_arr]
    is_tv_arr = np.array([k.startswith("tv:") for k in chiavi])
    seed_weights = np.where(
        is_tv_arr & (nep_arr > 1.0),
        1.0 + 2.0 * np.minimum(plays_arr / nep_arr, 1.0),
        np.minimum(plays_arr, 3.0)
    )

    base_eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)

    # Collect all base unnameable clusters with >= 3 seeds
    for idx, c in enumerate(base_eligible):
        if c.nome_fonte == "perche_hai_visto" and len(c.seeds_indices) >= 3:
            m_sorted = sorted(c.seeds_indices, key=lambda i: (-plays_arr[i], eta_arr[i]))
            c_titles = [str(titles[righe_arr[i]]) for i in m_sorted]
            c_weights = [float(seed_weights[i]) for i in m_sorted]
            c_keys = [chiavi[i] for i in m_sorted]
            
            # Keywords and metadata
            kws = Counter()
            langs = Counter()
            countries = Counter()
            for i, r in enumerate(righe_arr[m_sorted]):
                k = c_keys[i]
                for kw in get_member_kws(r): kws[kw] += 1
                ex = extra_info.get(k, {})
                if ex.get("orig_lang"): langs[ex["orig_lang"]] += 1
                if ex.get("orig_country"): countries[ex["orig_country"]] += 1

            raw_unnameable_list.append({
                "profile": p,
                "type": "base",
                "cluster_idx": idx,
                "label": c.nome,
                "medium": c.medium,
                "size": len(m_sorted),
                "mass": sum(c_weights),
                "titles": c_titles,
                "keys": c_keys,
                "weights": c_weights,
                "top_kws": kws.most_common(10),
                "langs": dict(langs),
                "countries": dict(countries),
            })

print(f"Total base unnameable clusters with >= 3 seeds: {len(raw_unnameable_list)}")

with open(".scratch/base_unnameable.json", "w", encoding="utf-8") as f:
    json.dump(raw_unnameable_list, f, ensure_ascii=False, indent=2)
