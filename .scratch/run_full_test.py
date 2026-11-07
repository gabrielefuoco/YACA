"""run_full_test.py — Run the full test across the 10 profiles and report everything."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))
sys.path.insert(0, str(ROOT / ".scratch"))

from collections import Counter, defaultdict
import numpy as np
import scipy.sparse as sp

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import valuta_cluster, assegna_etichetta_cluster

from test_complete_solution import (
    FULL_TAXONOMY,
    tight_auteur_kws,
    tight_classic_kws,
    is_seed_excluded_from_entry,
)

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

def run_experiment():
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

    all_profile_results = {}

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
        tot_mass = float(np.sum(seed_weights))

        # Base clusters generated using the new taxonomy!
        base_eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)
        # Re-evaluate base cluster names against FULL_TAXONOMY
        for c in base_eligible:
            ev, _ = build_evidence(c.seeds_indices, righe_arr, plays_arr, eta_arr)
            nome_t, fonte_t, conf_t, match_t = assegna_etichetta_cluster(ev, tassonomia=FULL_TAXONOMY)
            c.nome = nome_t
            c.nome_fonte = fonte_t
            c.confidenza = conf_t
            c.matched_entry = match_t.nome if match_t else None

        # Build normalized vectors
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

                    # Two DIFFERENT taxonomy entries must NOT merge!
                    if g1["tax"] and g2["tax"] and g1["tax"] != g2["tax"]:
                        continue

                    union_tax = g1["tax"] | g2["tax"]
                    merged_seeds = g1["seeds"] | g2["seeds"]
                    m_sorted = sorted(merged_seeds, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))[:40]
                    ev, med_u = build_evidence(m_sorted, righe_arr, plays_arr, eta_arr)
                    nome_u, fonte_u, conf_u, match_u = assegna_etichetta_cluster(ev, tassonomia=FULL_TAXONOMY)

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

        # Build shelves with member exclusion filtering
        shelves = []
        for g in active_groups:
            all_m = sorted(g["seeds"], key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
            
            # Apply exclusion filter if taxonomy-named!
            if g["nome_fonte"] == "tassonomia":
                admitted_seeds = []
                for s_idx in all_m:
                    r = righe_arr[s_idx]
                    k_seme = engine.keys[r]
                    kws = get_member_kws(r)
                    lang = extra_info.get(k_seme, {}).get("orig_lang")
                    if is_seed_excluded_from_entry(kws, lang, g["nome"]):
                        continue  # Excluded stray!
                    admitted_seeds.append(s_idx)
                m_sorted = admitted_seeds[:40]
            else:
                m_sorted = all_m[:40]

            if len(m_sorted) < 2:
                continue

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

        # Greedy selection on weighted support (mass)
        cand_shelves = [s for s in shelves]
        cand_shelves.sort(key=lambda x: x.min_eta)
        for r_idx, item in enumerate(cand_shelves): item._r_rec = r_idx + 1

        cand_shelves.sort(key=lambda x: (-x.weighted_support, -x.consistenza))
        for r_idx, item in enumerate(cand_shelves):
            item._r_sup = r_idx + 1
            item.r_comb = round((item._r_rec + item._r_sup) / 2.0, 1)

        def ensure_top10(cand: I.Shelf) -> None:
            if not cand.top10_cands:
                semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": float(seed_weights[i])} for i in cand.seeds_indices]
                racs = engine.raccomanda(semi_rac, cap=10, medium=cand.medium, esclusi=chiavi)
                cand.top10_cands = set(r["key"] for r in racs[:10])
                cand.titoli = racs[:10]

        max_n = 8
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

                uncovered_score = float(sum(seed_weights[i] for i in uncovered))
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

        cov_titles = len(covered_seeds) / n_seeds * 100.0
        served_mass = float(sum(seed_weights[i] for i in covered_seeds))
        cov_mass = (served_mass / tot_mass) * 100.0 if tot_mass > 0 else 0.0

        all_profile_results[p] = {
            "n_seeds": n_seeds,
            "tot_mass": tot_mass,
            "chosen": chosen,
            "cov_titles": cov_titles,
            "cov_mass": cov_mass,
            "served_mass": served_mass,
        }

    return all_profile_results

if __name__ == "__main__":
    results = run_experiment()
    print("\n" + "=" * 90)
    print("SINTESI RISULTATI PER TUTTI I 10 PROFILI")
    print("=" * 90)
    for p, r in results.items():
        print(f"{p:<15} | Scaffali: {len(r['chosen'])} | Copertura Titoli: {r['cov_titles']:>5.1f}% | Copertura Massa: {r['cov_mass']:>5.1f}%")
        for idx, sh in enumerate(r['chosen'], 1):
            print(f"   {idx}. {sh.nome} (semi={sh.size}, mass={sh.weighted_support:.1f}) [{sh.nome_fonte}]")
        print()
