"""Compare unweighted support vs weighted support shelf selection under new naming rules."""
from __future__ import annotations

import json
import numpy as np
import scipy.sparse as sp
from collections import Counter, defaultdict

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster, valuta_cluster

LONG_PROFILES = ["castoffcrown", "warnok", "pepsipex"]

def run_shelf_selection_experiment(engine, W, tau_m=0.05, small_limit=12, max_n=8):
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

        # Seed weights from plays / series formula
        nep_arr = engine.nep[righe_arr]
        # Sum of signals / canonical weights: min(plays, 3) for movie, 1 + 2*min(plays/nep, 1) for series
        is_tv_arr = np.array([k.startswith("tv:") for k in chiavi])
        seed_weights = np.where(
            is_tv_arr & (nep_arr > 1.0),
            1.0 + 2.0 * np.minimum(plays_arr / nep_arr, 1.0),
            np.minimum(plays_arr, 3.0)
        )

        base_eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)

        # Build normalized representation
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

        rejections_3plus_tax = 0
        rejections_unnameable = 0
        accepted_merges = 0

        # Pairwise greedy merge
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

                    # Rule 2a: union spans 3+ taxonomy labels
                    union_tax = g1["tax"] | g2["tax"]
                    if len(union_tax) >= 3:
                        rejections_3plus_tax += 1
                        continue

                    # Rule 1 & 2b: recompute label on union
                    merged_seeds = g1["seeds"] | g2["seeds"]
                    m_sorted = sorted(merged_seeds, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))[:40]
                    ev, med_u = build_evidence(m_sorted, righe_arr, plays_arr, eta_arr)
                    nome_u, fonte_u, conf_u, match_u = assegna_etichetta_cluster(ev)

                    is_nameable = (fonte_u == "tassonomia")
                    is_small = (len(m_sorted) <= small_limit)

                    if not is_nameable and not is_small:
                        rejections_unnameable += 1
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
            accepted_merges += 1

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

        # Build shelves
        def build_shelves_from_groups():
            shelves = []
            for g in active_groups:
                m_sorted = sorted(g["seeds"], key=lambda idx: (-plays_arr[idx], eta_arr[idx]))[:40]
                top_seed_idx = m_sorted[0]
                top_row = righe_arr[top_seed_idx]
                top_key = engine.keys[top_row]
                top_tmdb_id = int(top_key.split(":")[1]) if ":" in top_key else top_row
                cat_id = f"yaca_{top_tmdb_id}_{g['medium']}"

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
                    nome=g["nome"],
                    nome_fonte=g["nome_fonte"],
                    confidenza=round(float(g["conf"]), 3),
                    medium=g["medium"],
                    semi_rappresentativi=semi_rappresentativi,
                    semi_membri=semi_membri,
                    size=len(m_sorted),
                    min_eta=float(min(eta_arr[idx] for idx in m_sorted)),
                    matched_entry=g["matched_entry"],
                    seeds_indices=m_sorted,
                    dom_coll=None,
                )
                sh.weighted_support = float(sum(seed_weights[idx] for idx in m_sorted))
                sh._mixed_tax = g["tax"]
                shelves.append(sh)

            # Consistenza
            S_sim = I.calcola_sim_affinity(righe_arr, W)
            for sh in shelves:
                sz = len(sh.seeds_indices)
                if sz >= 2:
                    sub = S_sim[np.ix_(sh.seeds_indices, sh.seeds_indices)]
                    iu = np.triu_indices(sz, k=1)
                    sh.consistenza = round(float(np.mean(sub[iu])), 4)
                else:
                    sh.consistenza = 0.0
            return shelves

        def select_shelves(shelves_list, weighted_mode=False):
            cand_shelves = [s for s in shelves_list]
            cand_shelves.sort(key=lambda x: x.min_eta)
            for r_idx, item in enumerate(cand_shelves): item._r_rec = r_idx + 1

            if weighted_mode:
                cand_shelves.sort(key=lambda x: (-x.weighted_support, -x.consistenza))
            else:
                cand_shelves.sort(key=lambda x: (-x.size, -x.consistenza))

            for r_idx, item in enumerate(cand_shelves):
                item._r_sup = r_idx + 1
                item.r_comb = round((item._r_rec + item._r_sup) / 2.0, 1)

            def ensure_top10(cand: I.Shelf) -> None:
                if not cand.top10_cands:
                    semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": float(seed_weights[i])} for i in cand.seeds_indices]
                    racs = engine.raccomanda(semi_rac, cap=10, medium=cand.medium, esclusi=chiavi)
                    cand.top10_cands = set(r["key"] for r in racs[:10])
                    cand.titoli = racs[:10]

            chosen = []
            covered_seeds = set()
            seen_tax = set()
            while len(chosen) < max_n:
                best_cand = None
                best_key = None
                for cand in cand_shelves:
                    if any(c is cand for c in chosen): continue
                    if cand.nome_fonte == "tassonomia" and cand.nome in seen_tax: continue
                    uncovered = set(cand.seeds_indices) - covered_seeds
                    if not uncovered: continue

                    if weighted_mode:
                        uncovered_score = float(sum(seed_weights[i] for i in uncovered))
                    else:
                        uncovered_score = float(len(uncovered))

                    cand_key = (uncovered_score, -cand.min_eta, cand.consistenza)
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

            # Rule 4: Mechanical verification
            verifications = []
            fails = 0
            for sh in chosen:
                if sh.nome_fonte == "tassonomia":
                    t_entry = next((e for e in TASSONOMIA_36 if e.nome == sh.nome), None)
                    if t_entry is None:
                        verifications.append((sh.nome, "FAIL (no entry)", 0.0))
                        fails += 1
                    else:
                        ev, _ = build_evidence(sh.seeds_indices, righe_arr, plays_arr, eta_arr)
                        ok, cov = valuta_cluster(ev, t_entry)
                        status = "PASS" if ok and cov >= 0.50 else "FAIL"
                        if status == "FAIL": fails += 1
                        verifications.append((sh.nome, f"{status} ({cov*100:.1f}%)", cov))
                else:
                    verifications.append((sh.nome, "PASS (fallback «Perché hai visto»)", 1.0))

            return chosen, cov_pct, verifications, fails

        shelves_unweighted = build_shelves_from_groups()
        chosen_unw, cov_unw, ver_unw, fails_unw = select_shelves(shelves_unweighted, weighted_mode=False)

        shelves_weighted = build_shelves_from_groups()
        chosen_w, cov_w, ver_w, fails_w = select_shelves(shelves_weighted, weighted_mode=True)

        profile_results[p] = {
            "n_seeds": n_seeds,
            "merges_acc": accepted_merges,
            "rej_3plus": rejections_3plus_tax,
            "rej_unnameable": rejections_unnameable,
            "unweighted": {
                "chosen": chosen_unw,
                "cov": cov_unw,
                "verifications": ver_unw,
                "fails": fails_unw,
            },
            "weighted": {
                "chosen": chosen_w,
                "cov": cov_w,
                "verifications": ver_w,
                "fails": fails_w,
            }
        }

    return profile_results

if __name__ == "__main__":
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()

    for sl in [12, 30]:
        print(f"\n{'='*100}")
        print(f"RUNNING COMPARISON WITH small_limit = {sl}")
        print(f"{'='*100}")
        res = run_shelf_selection_experiment(engine, W, tau_m=0.05, small_limit=sl, max_n=8)
        for p in LONG_PROFILES:
            r = res[p]
            print(f"\n--- PROFILE: {p} (Total seeds: {r['n_seeds']}) | Merges: Acc={r['merges_acc']} Rej_3plus={r['rej_3plus']} Rej_unnameable={r['rej_unnameable']} ---")
            print(f"  [UNWEIGHTED SUPPORT] Cov={r['unweighted']['cov']:.1f}% | FAILs={r['unweighted']['fails']}")
            for idx, sh in enumerate(r['unweighted']['chosen'], 1):
                ver = r['unweighted']['verifications'][idx-1][1]
                print(f"    Row {idx}: '{sh.nome[:50]}' ({sh.size} semi) [{sh.nome_fonte}] -> {ver}")

            print(f"  [WEIGHTED SUPPORT]   Cov={r['weighted']['cov']:.1f}% | FAILs={r['weighted']['fails']}")
            for idx, sh in enumerate(r['weighted']['chosen'], 1):
                ver = r['weighted']['verifications'][idx-1][1]
                print(f"    Row {idx}: '{sh.nome[:50]}' ({sh.size} semi, w={sh.weighted_support:.1f}) [{sh.nome_fonte}] -> {ver}")
