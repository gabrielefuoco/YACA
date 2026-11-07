"""Evaluate declared acceptance across combinations of filters + merge on long profiles."""
from __future__ import annotations

import json
from pathlib import Path
import numpy as np
import scipy.sparse as sp
from collections import Counter, defaultdict
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster

LONG_PROFILES = ["castoffcrown", "warnok", "pepsipex"]

def evaluate_combination(engine, W, rep="W_aff", tau_m=0.05, age_n=None, size_s=None, max_n=8):
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

    profile_results = {}
    for p in LONG_PROFILES:
        chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
        n_seeds = len(chiavi)
        righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)
        eta_arr = np.asarray(eta, dtype=np.float32)
        plays_arr = np.asarray(plays, dtype=np.float32)

        base_eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)

        # Apply age filter if specified
        if age_n is not None:
            base_eligible = [c for c in base_eligible if c.min_eta <= age_n]

        # Apply size filter if specified
        if size_s is not None:
            base_eligible = [c for c in base_eligible if c.size >= size_s or c.min_eta < 90.0]

        if not base_eligible:
            profile_results[p] = {"pass": False, "reason": "No eligible clusters", "cov": 0.0, "n_rows": 0, "max_tax": 0}
            continue

        # Post-merge M1
        if rep == "Tr":
            V = engine.Tr[righe_arr, :]
            norms = np.array(np.sqrt(V.multiply(V).sum(axis=1))).ravel()
            norms[norms == 0] = 1.0
            V_norm = sp.diags(1.0 / norms) @ V
        else:
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
        C = np.array(c_vecs)
        S_clust = C @ C.T

        if len(base_eligible) > 1 and tau_m is not None:
            d = np.clip(1.0 - S_clust, 0.0, 1.0)
            np.fill_diagonal(d, 0.0)
            Z = linkage(squareform(d), method="average")
            labels = fcluster(Z, t=1.0 - tau_m, criterion="distance")
        else:
            labels = list(range(1, len(base_eligible) + 1))

        groups = defaultdict(list)
        for idx, lbl in enumerate(labels):
            groups[lbl].append(idx)

        merged_shelves = []
        for g in groups.values():
            if len(g) == 1:
                sh = base_eligible[g[0]]
                sh._mixed_tax = {sh.nome} if sh.nome_fonte == "tassonomia" else set()
                merged_shelves.append(sh)
                continue

            union_seeds = set(s for i in g for s in base_eligible[i].seeds_indices)
            tax_labels = set(base_eligible[i].nome for i in g if base_eligible[i].nome_fonte == "tassonomia")

            m_sorted = sorted(union_seeds, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))[:40]
            ev, med_u = build_evidence(m_sorted, righe_arr, plays_arr, eta_arr)
            nome_u, fonte_u, conf_u, match_u = assegna_etichetta_cluster(ev)

            if fonte_u == "tassonomia":
                fn, ff, fc = nome_u, fonte_u, conf_u
            else:
                tax_m = [base_eligible[i] for i in g if base_eligible[i].nome_fonte == "tassonomia"]
                if tax_m:
                    best_m = min(tax_m, key=lambda x: x.size)
                else:
                    best_m = min([base_eligible[i] for i in g], key=lambda x: x.size)
                fn, ff, fc = best_m.nome, best_m.nome_fonte, best_m.confidenza

            top_seed_idx = m_sorted[0]
            top_row = righe_arr[top_seed_idx]
            top_key = engine.keys[top_row]
            top_tmdb_id = int(top_key.split(":")[1]) if ":" in top_key else top_row
            cat_id = f"yaca_{top_tmdb_id}_{med_u}"

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
            for idx in m_sorted:
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
                nome=fn,
                nome_fonte=ff,
                confidenza=round(float(fc), 3),
                medium=med_u,
                semi_rappresentativi=semi_rappresentativi,
                semi_membri=semi_membri,
                size=len(m_sorted),
                min_eta=float(min(eta_arr[idx] for idx in m_sorted)),
                matched_entry=match_u.nome if match_u else None,
                seeds_indices=m_sorted,
                dom_coll=None,
            )
            sh._mixed_tax = tax_labels
            merged_shelves.append(sh)

        # Greedy select
        S_sim = I.calcola_sim_affinity(righe_arr, W)
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

        def ensure_top10(cand: I.Shelf) -> None:
            if not cand.top10_cands:
                semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": 1.0} for i in cand.seeds_indices]
                racs = engine.raccomanda(semi_rac, cap=10, medium=cand.medium, esclusi=chiavi)
                cand.top10_cands = set(r["key"] for r in racs[:10])
                cand.titoli = racs[:10]

        chosen = []
        covered_seeds = set()
        seen_tax = set()
        while len(chosen) < max_n:
            best_cand = None
            best_key = None
            for cand in merged_shelves:
                if any(c is cand for c in chosen): continue
                if cand.nome_fonte == "tassonomia" and cand.nome in seen_tax: continue
                uncovered_added = len(set(cand.seeds_indices) - covered_seeds)
                if uncovered_added <= 0: continue
                cand_key = (uncovered_added, -cand.min_eta, cand.consistenza)
                if best_cand is not None and cand_key <= best_key: continue
                ensure_top10(cand)
                if any(I.jaccard(cand.top10_cands, s.top10_cands) >= 0.5 for s in chosen): continue
                best_cand = cand
                best_key = cand_key
            if best_cand is None: break
            ensure_top10(best_cand)
            chosen.append(best_cand)
            covered_seeds.update(best_cand.seeds_indices)
            if best_cand.nome_fonte == "tassonomia": seen_tax.add(best_cand.nome)

        cov_pct = len(covered_seeds) / n_seeds * 100.0
        max_mixed_tax = max((len(getattr(s, "_mixed_tax", set())) for s in chosen), default=0)

        # Acceptance checks:
        # rows <= 8
        # cov >= 45%
        # max_mixed_tax <= 2
        p_pass = (len(chosen) <= 8) and (cov_pct >= 45.0) and (max_mixed_tax <= 2)
        profile_results[p] = {
            "pass": p_pass,
            "rows": len(chosen),
            "cov": cov_pct,
            "max_tax": max_mixed_tax,
            "chosen_shelves": [
                {
                    "nome": s.nome,
                    "size": s.size,
                    "mixed_tax": list(getattr(s, "_mixed_tax", set())),
                }
                for s in chosen
            ]
        }

    return profile_results

if __name__ == "__main__":
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()

    print("Checking combinations for acceptance on long profiles...")
    configs = [
        ("M1 W_aff tau=0.03 (no filters)", "W_aff", 0.03, None, None),
        ("M1 W_aff tau=0.05 (no filters)", "W_aff", 0.05, None, None),
        ("M1 W_aff tau=0.08 (no filters)", "W_aff", 0.08, None, None),
        ("M1 W_aff tau=0.12 (no filters)", "W_aff", 0.12, None, None),
        ("M1 Tr tau=0.03 (no filters)", "Tr", 0.03, None, None),
        ("M1 Tr tau=0.05 (no filters)", "Tr", 0.05, None, None),
        ("M1 Tr tau=0.08 (no filters)", "Tr", 0.08, None, None),
        ("M1 Tr tau=0.12 (no filters)", "Tr", 0.12, None, None),
        ("M1 W_aff tau=0.05 + Age=365", "W_aff", 0.05, 365, None),
        ("M1 W_aff tau=0.05 + Size=5", "W_aff", 0.05, None, 5),
        ("M1 Tr tau=0.05 + Size=5", "Tr", 0.05, None, 5),
    ]

    for label, rep, tau, age_n, size_s in configs:
        res = evaluate_combination(engine, W, rep=rep, tau_m=tau, age_n=age_n, size_s=size_s)
        pass_all = all(res[p]["pass"] for p in LONG_PROFILES)
        print(f"\n{label} -> ALL PASS: {pass_all}")
        for p in LONG_PROFILES:
            r = res[p]
            print(f"  {p:15s}: PASS={str(r['pass']):5s} | rows={r['rows']} | cov={r['cov']:5.1f}% | max_tax={r['max_tax']}")
