"""E3 — FUZZY MERGE Experiment
Tests M1 (post-merge) and M2 (soft assignment) on all 10 profiles.
"""
from __future__ import annotations

import json
from pathlib import Path
from collections import Counter, defaultdict
import numpy as np
import scipy.sparse as sp
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform
import pandas as pd

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

def load_parquet_dicts():
    df_m = pd.read_parquet('.cache/tmdb/movies.parquet', columns=['id', 'title', 'vote_count', 'release_date'])
    df_t = pd.read_parquet('.cache/tmdb/tv.parquet', columns=['id', 'name', 'vote_count', 'first_air_date'])
    m_dict = df_m.set_index('id').to_dict(orient='index')
    t_dict = df_t.set_index('id').to_dict(orient='index')
    return m_dict, t_dict

def greedy_select(eligible: list[I.Shelf], engine: Engine, chiavi: list[str], max_n: int = 8) -> list[I.Shelf]:
    def ensure_top10(cand: I.Shelf) -> None:
        if not cand.top10_cands:
            semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": 1.0} for i in cand.seeds_indices]
            racs = engine.raccomanda(semi_rac, cap=10, medium=cand.medium, esclusi=chiavi)
            cand.top10_cands = set(r["key"] for r in racs[:10])
            cand.titoli = racs[:10]

    chosen: list[I.Shelf] = []
    covered_seeds: set[int] = set()
    seen_tax: set[str] = set()
    seen_colls: set[int] = set()

    while len(chosen) < max_n:
        best_cand: I.Shelf | None = None
        best_key: tuple[int, float, float] | None = None

        for cand in eligible:
            if any(c is cand for c in chosen):
                continue
            if cand.nome_fonte == "tassonomia" and cand.nome in seen_tax:
                continue
            if cand.dom_coll is not None and cand.dom_coll in seen_colls:
                continue

            uncovered_added = len(set(cand.seeds_indices) - covered_seeds)
            if uncovered_added <= 0:
                continue

            cand_key = (uncovered_added, -cand.min_eta, cand.consistenza)
            if best_cand is not None and cand_key <= best_key:
                continue

            ensure_top10(cand)
            if any(I.jaccard(cand.top10_cands, s.top10_cands) >= 0.5 for s in chosen):
                continue

            best_cand = cand
            best_key = cand_key

        if best_cand is None:
            break

        ensure_top10(best_cand)
        chosen.append(best_cand)
        covered_seeds.update(best_cand.seeds_indices)
        if best_cand.nome_fonte == "tassonomia":
            seen_tax.add(best_cand.nome)
        if best_cand.dom_coll is not None:
            seen_colls.add(best_cand.dom_coll)

    return chosen


def run_m1_profile(
    engine: Engine,
    profilo: str,
    tau_m: float,
    rep: str = "W_aff", # "W_aff" or "Tr"
    W_aff: sp.csr_matrix | None = None,
    cap: int = 40,
    max_n: int = 8,
):
    chiavi, righe, plays, eta = K.storia_trakt(profilo, ordine="recente")
    n_seeds = len(chiavi)
    righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

    if W_aff is None:
        W_aff = I.carica_matrice_affinita()

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

    def build_evidence(m_indices: list[int]):
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

    # Baseline clusters
    base_eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W_aff)
    if not base_eligible:
        return None

    # Compute centroids
    if rep == "Tr":
        V = engine.Tr[righe_arr, :]
        norms = np.array(np.sqrt(V.multiply(V).sum(axis=1))).ravel()
        norms[norms == 0] = 1.0
        V_norm = sp.diags(1.0 / norms) @ V
    else:
        # W_aff
        n = len(righe_arr)
        n_canon = W_aff.shape[0]
        rows_list, cols_list, data_list = [], [], []
        for i, r in enumerate(righe_arr):
            s, e = W_aff.indptr[r], W_aff.indptr[r + 1]
            c_r, v_r = W_aff.indices[s:e], W_aff.data[s:e]
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
    C = np.array(c_vecs)
    S_clust = C @ C.T

    # Merge clusters if S_clust > tau_m (average linkage)
    if len(base_eligible) > 1:
        d = np.clip(1.0 - S_clust, 0.0, 1.0)
        np.fill_diagonal(d, 0.0)
        Z = linkage(squareform(d), method="average")
        labels = fcluster(Z, t=1.0 - tau_m, criterion="distance")
    else:
        labels = [1]

    groups = defaultdict(list)
    for idx, lbl in enumerate(labels):
        groups[lbl].append(idx)

    merged_shelves: list[I.Shelf] = []
    for g in groups.values():
        if len(g) == 1:
            merged_shelves.append(base_eligible[g[0]])
            continue

        # Merge clusters in group g
        union_seeds_set = set()
        tax_labels_in_group = set()
        for idx in g:
            union_seeds_set.update(base_eligible[idx].seeds_indices)
            if base_eligible[idx].nome_fonte == "tassonomia":
                tax_labels_in_group.add(base_eligible[idx].nome)

        # Cap at 40
        m_sorted = sorted(union_seeds_set, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
        capped_seeds = m_sorted[:cap]

        # Determine label:
        # "merged shelf keeps the cap (40) and the smaller label wins or a new name comes from the union's taxonomy evidence."
        ev, union_med = build_evidence(capped_seeds)
        nome_u, fonte_u, conf_u, match_u = assegna_etichetta_cluster(ev)

        if fonte_u == "tassonomia":
            final_nome = nome_u
            final_fonte = fonte_u
            final_conf = conf_u
            matched_entry_name = match_u.nome if match_u else None
        else:
            # smaller label wins
            # pick the member cluster with the smallest size that has a taxonomy label, or smallest size overall
            tax_members = [base_eligible[i] for i in g if base_eligible[i].nome_fonte == "tassonomia"]
            if tax_members:
                best_sh = min(tax_members, key=lambda x: x.size)
            else:
                best_sh = min([base_eligible[i] for i in g], key=lambda x: x.size)
            final_nome = best_sh.nome
            final_fonte = best_sh.nome_fonte
            final_conf = best_sh.confidenza
            matched_entry_name = best_sh.matched_entry

        top_seed_idx = capped_seeds[0]
        top_row = righe_arr[top_seed_idx]
        top_key = engine.keys[top_row]
        top_tmdb_id = int(top_key.split(":")[1]) if ":" in top_key else top_row
        cat_id = f"yaca_{top_tmdb_id}_{union_med}"

        semi_rappresentativi = []
        for idx in m_sorted[:3]:
            r = righe_arr[idx]
            k_seme = engine.keys[r]
            semi_rappresentativi.append({
                "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                "medium": "series" if k_seme.startswith("tv:") else "movie",
                "titolo": str(titles[r]) if titles is not None else k_seme,
                "anno": int(years[r]) if years is not None and not np.isnan(years[r]) else 0,
                "plays": float(plays_arr[idx]),
                "eta_giorni": float(eta_arr[idx]),
            })

        semi_membri = []
        for idx in capped_seeds:
            r = righe_arr[idx]
            k_seme = engine.keys[r]
            semi_membri.append({
                "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                "medium": "series" if k_seme.startswith("tv:") else "movie",
                "titolo": str(titles[r]) if titles is not None else k_seme,
                "anno": int(years[r]) if years is not None and not np.isnan(years[r]) else 0,
            })

        sh = I.Shelf(
            catalog_id=cat_id,
            nome=final_nome,
            nome_fonte=final_fonte,
            confidenza=round(float(final_conf), 3),
            medium=union_med,
            semi_rappresentativi=semi_rappresentativi,
            semi_membri=semi_membri,
            size=len(capped_seeds),
            min_eta=float(min(eta_arr[idx] for idx in capped_seeds)),
            matched_entry=matched_entry_name,
            seeds_indices=capped_seeds,
            dom_coll=None,
        )
        sh._mixed_tax_labels = tax_labels_in_group
        merged_shelves.append(sh)

    # Compute consistenza for merged shelves
    S_sim = I.calcola_sim_affinity(righe_arr, W_aff)
    for sh in merged_shelves:
        sz = len(sh.seeds_indices)
        if sz >= 2:
            sub = S_sim[np.ix_(sh.seeds_indices, sh.seeds_indices)]
            iu = np.triu_indices(sz, k=1)
            sh.consistenza = round(float(np.mean(sub[iu])), 4)
        else:
            sh.consistenza = 0.0

    merged_shelves.sort(key=lambda x: x.min_eta)
    for r_idx, item in enumerate(merged_shelves): item._r_rec = r_idx + 1
    merged_shelves.sort(key=lambda x: (-x.size, -x.consistenza))
    for r_idx, item in enumerate(merged_shelves):
        item._r_sup = r_idx + 1
        item.r_comb = round((item._r_rec + item._r_sup) / 2.0, 1)

    # Greedy select max_n
    chosen = greedy_select(list(merged_shelves), engine, chiavi, max_n=max_n)
    covered_seeds = set(s for c in chosen for s in c.seeds_indices)
    cov_pct = len(covered_seeds) / n_seeds * 100.0

    return {
        "profilo": profilo,
        "n_seeds": n_seeds,
        "tau_m": tau_m,
        "rep": rep,
        "remaining_clusters": len(merged_shelves),
        "chosen_count": len(chosen),
        "covered_seeds": len(covered_seeds),
        "coverage_pct": cov_pct,
        "eligible": merged_shelves,
        "chosen": chosen,
    }


def run_m2_profile(
    engine: Engine,
    profilo: str,
    tau_macro: float = 0.03,
    sim_ratio: float = 0.7,
    W_aff: sp.csr_matrix | None = None,
    cap: int = 40,
    max_n: int = 8,
):
    chiavi, righe, plays, eta = K.storia_trakt(profilo, ordine="recente")
    n_seeds = len(chiavi)
    righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

    if W_aff is None:
        W_aff = I.carica_matrice_affinita()
    S = I.calcola_sim_affinity(righe_arr, W_aff)

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")
    anime_flags = meta.get("ANIME")
    adult_flags = meta.get("ADULTO")
    coll = meta.get("COLL")
    extra_info = I._carica_tmdb_extra()
    kw_tuple = I._carica_tfidf_keywords()
    kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

    def get_member_kws(r_idx: int) -> set[str]:
        if X_kw is None: return set()
        s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
        cols = X_kw.indices[s:e]
        return set(kw_names[c] for c in cols if kw_names[c] not in I.NOISE_KEYWORDS)

    def build_evidence(m_indices: list[int]):
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

    # 2. Micro-clustering
    micros, unclustered = I.micro_clustering(S, min_affinity=0.02)
    if not micros:
        return None

    # M2 soft assignment:
    m_soft = [set(m) for m in micros]
    for i in range(n_seeds):
        sims = []
        for m_idx, m_members in enumerate(micros):
            other_m = [j for j in m_members if j != i]
            sim_val = float(np.mean(S[i, other_m])) if other_m else 0.0
            sims.append((sim_val, m_idx))
        sims.sort(key=lambda x: -x[0])
        best_sim, best_m = sims[0]
        second_sim, second_m = sims[1] if len(sims) > 1 else (0.0, -1)
        if best_sim >= 0.02 and second_sim >= sim_ratio * best_sim and second_sim >= 0.02:
            m_soft[second_m].add(i)

    soft_micros = [sorted(list(s)) for s in m_soft]

    # 3. Macro-merge
    raw_macros = I.macro_merge(engine, righe_arr, soft_micros, tau=tau_macro)
    clustered_seeds = set(idx for m in raw_macros for idx in m)
    floor = I.calcola_adaptive_floor(len(clustered_seeds))

    def eval_macro(m_indices: list[int]) -> list[dict[str, Any]]:
        sz = len(m_indices)
        if sz > cap:
            c1, c2 = I.bisect_cluster(engine, righe_arr, m_indices)
            return eval_macro(c1) + eval_macro(c2)

        ev, macro_med = build_evidence(m_indices)
        nome_base, nome_fonte, conf, matched_entry = assegna_etichetta_cluster(ev)

        if nome_fonte == "tassonomia":
            if sz >= floor:
                return [{
                    "seeds": m_indices,
                    "size": sz,
                    "medium": macro_med,
                    "nome": nome_base,
                    "nome_fonte": nome_fonte,
                    "conf": conf,
                    "matched_entry": matched_entry.nome if matched_entry else None,
                }]
            return []
        else:
            if sz > 12:
                c1, c2 = I.bisect_cluster(engine, righe_arr, m_indices)
                return eval_macro(c1) + eval_macro(c2)
            else:
                if sz >= floor:
                    return [{
                        "seeds": m_indices,
                        "size": sz,
                        "medium": macro_med,
                        "nome": nome_base,
                        "nome_fonte": nome_fonte,
                        "conf": conf,
                        "matched_entry": None,
                    }]
                return []

    eligible_raw = []
    for m in raw_macros:
        eligible_raw.extend(eval_macro(m))

    shelves = []
    for item in eligible_raw:
        m_indices = item["seeds"]
        m_sorted = sorted(m_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
        top_seed_idx = m_sorted[0]
        top_row = righe_arr[top_seed_idx]
        top_key = engine.keys[top_row]
        top_tmdb_id = int(top_key.split(":")[1]) if ":" in top_key else top_row
        cat_id = f"yaca_{top_tmdb_id}_{item['medium']}"

        dom_coll = None
        if coll is not None:
            c_coll = coll[righe_arr[m_indices]]
            pos = [x for x in c_coll if x > 0]
            if pos:
                dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
                if (dom_cnt / len(m_indices)) >= 0.5:
                    dom_coll = int(dom_cid)

        semi_rappresentativi = []
        for idx in m_sorted[:3]:
            r = righe_arr[idx]
            k_seme = engine.keys[r]
            semi_rappresentativi.append({
                "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                "medium": "series" if k_seme.startswith("tv:") else "movie",
                "titolo": str(titles[r]) if titles is not None else k_seme,
                "anno": int(years[r]) if years is not None and not np.isnan(years[r]) else 0,
                "plays": float(plays_arr[idx]),
                "eta_giorni": float(eta_arr[idx]),
            })

        semi_membri = []
        for idx in m_indices:
            r = righe_arr[idx]
            k_seme = engine.keys[r]
            semi_membri.append({
                "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                "medium": "series" if k_seme.startswith("tv:") else "movie",
                "titolo": str(titles[r]) if titles is not None else k_seme,
                "anno": int(years[r]) if years is not None and not np.isnan(years[r]) else 0,
            })

        sh = I.Shelf(
            catalog_id=cat_id,
            nome=item["nome"],
            nome_fonte=item["nome_fonte"],
            confidenza=round(float(item["conf"]), 3),
            medium=item["medium"],
            semi_rappresentativi=semi_rappresentativi,
            semi_membri=semi_membri,
            size=item["size"],
            min_eta=float(min(eta_arr[idx] for idx in m_indices)),
            matched_entry=item["matched_entry"],
            seeds_indices=m_indices,
            dom_coll=dom_coll,
        )
        sh._mixed_tax_labels = {sh.nome} if sh.nome_fonte == "tassonomia" else set()
        shelves.append(sh)

    for sh in shelves:
        sz = len(sh.seeds_indices)
        if sz >= 2:
            sub = S[np.ix_(sh.seeds_indices, sh.seeds_indices)]
            iu = np.triu_indices(sz, k=1)
            sh.consistenza = round(float(np.mean(sub[iu])), 4)
        else:
            sh.consistenza = 0.0

    shelves.sort(key=lambda x: x.min_eta)
    for r_idx, item in enumerate(shelves): item._r_rec = r_idx + 1
    shelves.sort(key=lambda x: (-x.size, -x.consistenza))
    for r_idx, item in enumerate(shelves):
        item._r_sup = r_idx + 1
        item.r_comb = round((item._r_rec + item._r_sup) / 2.0, 1)

    chosen = greedy_select(list(shelves), engine, chiavi, max_n=max_n)
    covered_seeds = set(s for c in chosen for s in c.seeds_indices)
    cov_pct = len(covered_seeds) / n_seeds * 100.0

    return {
        "profilo": profilo,
        "n_seeds": n_seeds,
        "remaining_clusters": len(shelves),
        "chosen_count": len(chosen),
        "covered_seeds": len(covered_seeds),
        "coverage_pct": cov_pct,
        "eligible": shelves,
        "chosen": chosen,
    }


def main():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()
    m_dict, t_dict = load_parquet_dicts()
    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    TAU_VALS = [0.03, 0.05, 0.08, 0.12]
    all_m1_results = {}
    all_m2_results = {}

    print("--- Running M1 Sweeps ---")
    for rep in ["W_aff", "Tr"]:
        all_m1_results[rep] = {}
        for tau in TAU_VALS:
            all_m1_results[rep][str(tau)] = {}
            for p in PROFILI_10:
                res = run_m1_profile(engine, p, tau_m=tau, rep=rep, W_aff=W, max_n=8)
                if res:
                    all_m1_results[rep][str(tau)][p] = {
                        "n_seeds": res["n_seeds"],
                        "remaining_clusters": res["remaining_clusters"],
                        "chosen_count": res["chosen_count"],
                        "covered_seeds": res["covered_seeds"],
                        "coverage_pct": res["coverage_pct"],
                        "chosen_shelves": [
                            {
                                "catalog_id": s.catalog_id,
                                "nome": s.nome,
                                "nome_fonte": s.nome_fonte,
                                "size": s.size,
                                "medium": s.medium,
                                "min_eta": s.min_eta,
                                "mixed_tax": list(getattr(s, "_mixed_tax_labels", set())),
                                "reps": [m["titolo"] for m in s.semi_rappresentativi[:3]],
                            }
                            for s in res["chosen"]
                        ],
                    }

    print("--- Running M2 Sweeps ---")
    all_m2_results["0.03"] = {}
    for p in PROFILI_10:
        res = run_m2_profile(engine, p, tau_macro=0.03, sim_ratio=0.7, W_aff=W, max_n=8)
        if res:
            all_m2_results["0.03"][p] = {
                "n_seeds": res["n_seeds"],
                "remaining_clusters": res["remaining_clusters"],
                "chosen_count": res["chosen_count"],
                "covered_seeds": res["covered_seeds"],
                "coverage_pct": res["coverage_pct"],
                "chosen_shelves": [
                    {
                        "catalog_id": s.catalog_id,
                        "nome": s.nome,
                        "nome_fonte": s.nome_fonte,
                        "size": s.size,
                        "medium": s.medium,
                        "min_eta": s.min_eta,
                        "mixed_tax": list(getattr(s, "_mixed_tax_labels", set())),
                        "reps": [m["titolo"] for m in s.semi_rappresentativi[:3]],
                    }
                    for s in res["chosen"]
                ],
            }

    Path(".scratch/e3_m1_results.json").write_text(json.dumps(all_m1_results, indent=2), encoding="utf-8")
    Path(".scratch/e3_m2_results.json").write_text(json.dumps(all_m2_results, indent=2), encoding="utf-8")
    print("Saved .scratch/e3_m1_results.json and .scratch/e3_m2_results.json")

if __name__ == "__main__":
    main()

