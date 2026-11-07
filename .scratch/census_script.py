"""census_script.py — Full census of unnameable clusters across the 10 timelines."""
from __future__ import annotations
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

import json
from collections import Counter, defaultdict
import numpy as np
import scipy.sparse as sp
import pandas as pd

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster, valuta_cluster

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

def run_census():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")
    anime_flags = meta.get("ANIME")
    adult_flags = meta.get("ADULTO")
    extra_info = I._carica_tmdb_extra()
    kw_tuple = I._carica_tfidf_keywords()
    kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

    def get_member_kws(r_idx: int) -> set[str]:
        if X_kw is None: return set()
        s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
        cols = X_kw.indices[s:e]
        return set(kw_names[c] for c in cols if kw_names[c] not in I.NOISE_KEYWORDS)

    def build_evidence(m_indices: list[int], righe_arr, plays_arr, eta_arr):
        sz = len(m_indices)
        m_rows = righe_arr[m_indices]
        m_keys = [engine.keys[r] for r in m_rows]
        media_list = ["series" if k.startswith("tv:") else "movie" for k in m_keys]
        c_med = Counter(media_list)
        m_med = "series" if c_med["series"] > c_med["movie"] else "movie"
        anime_pct = float(anime_flags[m_rows].mean()) if anime_flags is not None else 0.0
        adult_pct = float(adult_flags[m_rows].mean()) if adult_flags is not None else 0.0
        m_sorted = sorted(m_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
        repr_seeds = [str(titles[righe_arr[idx]]) for idx in m_sorted[:3]]
        ev = {
            "size": sz,
            "medium": m_med,
            "anime_pct": anime_pct,
            "adult_pct": adult_pct,
            "member_kws": [get_member_kws(r) for r in m_rows],
            "languages": Counter(extra_info.get(m_keys[i], {}).get("orig_lang") for i in range(sz) if extra_info.get(m_keys[i], {}).get("orig_lang")),
            "countries": Counter(extra_info.get(m_keys[i], {}).get("orig_country") for i in range(sz) if extra_info.get(m_keys[i], {}).get("orig_country")),
            "repr_seeds": repr_seeds,
            "is_piccolo": sz < 3,
        }
        return ev, m_med

    all_unnameable_clusters = []

    for p in PROFILI_10:
        try:
            chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
        except Exception as exc:
            print(f"Skipping profile {p}: {exc}")
            continue

        n_seeds = len(chiavi)
        if n_seeds == 0:
            continue

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

        # Build normalized representation for M2 merge
        n = len(righe_arr)
        n_canon = W.shape[0]
        rows_list, cols_list, data_list = [], [], []
        for i, r in enumerate(righe_arr):
            s, e = W.indptr[r], W.indptr[r + 1]
            c_r, v_r = W.indices[s:e], W.data[s:e]
            top_idx = np.argpartition(-v_r, min(100, len(c_r)))[:100] if len(c_r) > 100 else range(len(c_r))
            rows_list.append(np.full(len(top_idx), i, dtype=np.int32))
            cols_list.append(c_r[top_idx].astype(np.int32))
            data_list.append(v_r[top_idx].astype(np.float32))
        B = sp.csr_matrix((np.concatenate(data_list), (np.concatenate(rows_list), np.concatenate(cols_list))), shape=(n, n_canon), dtype=np.float32)
        norms = np.array(np.sqrt(B.multiply(B).sum(axis=1))).ravel()
        norms[norms == 0] = 1.0
        V_norm = sp.diags(1.0 / norms) @ B

        c_vecs = []
        for c in base_eligible:
            v = np.array(V_norm[c.seeds_indices, :].sum(axis=0)).ravel()
            nv = np.linalg.norm(v)
            c_vecs.append(v / (nv if nv > 0 else 1.0))

        active_groups = []
        for i, c in enumerate(base_eligible):
            tax = {c.nome} if c.nome_fonte == "tassonomia" else set()
            active_groups.append({
                "members": [i],
                "seeds": set(c.seeds_indices),
                "medium": c.medium,
                "tax": tax,
                "vec": c_vecs[i],
                "nome": c.nome,
                "nome_fonte": c.nome_fonte,
                "conf": c.confidenza,
                "matched_entry": c.matched_entry,
            })

        tau_m = 0.05
        small_limit = 12

        while True:
            best_pair = None
            best_sim = -1.0
            best_union_info = None

            for i in range(len(active_groups)):
                for j in range(i + 1, len(active_groups)):
                    g1 = active_groups[i]
                    g2 = active_groups[j]
                    if g1["medium"] != g2["medium"]:
                        continue
                    sim = float(np.dot(g1["vec"], g2["vec"]))
                    if sim < tau_m:
                        continue

                    union_tax = g1["tax"] | g2["tax"]
                    if len(union_tax) >= 3:
                        continue

                    merged_seeds = g1["seeds"] | g2["seeds"]
                    m_sorted = sorted(merged_seeds, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))[:40]
                    ev, med_u = build_evidence(m_sorted, righe_arr, plays_arr, eta_arr)
                    nome_u, fonte_u, conf_u, match_u = assegna_etichetta_cluster(ev)

                    is_nameable = (fonte_u == "tassonomia")
                    is_small = (len(m_sorted) <= small_limit)

                    if not is_nameable and not is_small:
                        continue

                    if sim > best_sim:
                        best_sim = sim
                        best_pair = (i, j)
                        best_union_info = {
                            "nome": nome_u,
                            "nome_fonte": fonte_u,
                            "conf": conf_u,
                            "matched_entry": match_u.nome if match_u else None,
                            "seeds": set(m_sorted),
                            "medium": med_u,
                            "tax": union_tax,
                        }

            if best_pair is None:
                break

            i, j = best_pair
            g1 = active_groups[i]
            g2 = active_groups[j]

            m_sorted = sorted(best_union_info["seeds"], key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
            v = np.array(V_norm[m_sorted, :].sum(axis=0)).ravel()
            nv = np.linalg.norm(v)
            new_vec = v / (nv if nv > 0 else 1.0)

            new_g = {
                "members": g1["members"] + g2["members"],
                "seeds": best_union_info["seeds"],
                "medium": best_union_info["medium"],
                "tax": best_union_info["tax"],
                "vec": new_vec,
                "nome": best_union_info["nome"],
                "nome_fonte": best_union_info["nome_fonte"],
                "conf": best_union_info["conf"],
                "matched_entry": best_union_info["matched_entry"],
            }
            active_groups.pop(j)
            active_groups.pop(i)
            active_groups.append(new_g)

        # Inspect unnameable clusters in active_groups (sz >= 3)
        for g_idx, g in enumerate(active_groups):
            m_indices = list(g["seeds"])
            sz = len(m_indices)
            if sz < 3:
                continue

            if g["nome_fonte"] == "perche_hai_visto":
                m_sorted = sorted(m_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
                ev, _ = build_evidence(m_sorted, righe_arr, plays_arr, eta_arr)
                c_titles = [str(titles[righe_arr[i]]) for i in m_sorted]
                c_years = [int(years[righe_arr[i]]) if years is not None and not np.isnan(years[righe_arr[i]]) else 0 for i in m_sorted]
                c_weights = [float(seed_weights[i]) for i in m_sorted]
                tot_mass = sum(c_weights)

                # Collect all keywords across members
                all_kws = Counter()
                for kws in ev["member_kws"]:
                    for kw in kws:
                        all_kws[kw] += 1

                all_unnameable_clusters.append({
                    "profile": p,
                    "nome": g["nome"],
                    "medium": g["medium"],
                    "size": sz,
                    "mass": tot_mass,
                    "titles": c_titles,
                    "years": c_years,
                    "weights": c_weights,
                    "top_keywords": all_kws.most_common(8),
                    "languages": dict(ev["languages"]),
                    "countries": dict(ev["countries"]),
                })

    return all_unnameable_clusters

if __name__ == "__main__":
    clusters = run_census()
    print(f"Total unnameable clusters with >= 3 seeds: {len(clusters)}")
    for idx, c in enumerate(clusters, 1):
        print(f"\n--- [{idx}] Profile: {c['profile']} | Medium: {c['medium']} | Size: {c['size']} | Mass: {c['mass']:.1f} ---")
        print(f"Name: {c['nome']}")
        print(f"Titles: {c['titles']}")
        print(f"Top Keywords: {c['top_keywords']}")
        print(f"Languages: {c['languages']} | Countries: {c['countries']}")
