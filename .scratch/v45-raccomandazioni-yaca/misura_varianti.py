"""Script per misurare le tre varianti V1, V2, V3 su warnok, castoffcrown, pepsipex.
"""
from __future__ import annotations

import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import scipy.sparse as sp

from graph import canon as K
from graph.runtime import Engine
from graph.tassonomia import TASSONOMIA_36, TaxonomyEntry, assegna_etichetta_cluster, valuta_cluster
from graph.interessi import (
    Shelf,
    carica_matrice_affinita,
    calcola_adaptive_floor,
    calcola_sim_affinity,
    micro_clustering,
    macro_merge,
    bisect_cluster,
    jaccard,
    _carica_tmdb_extra,
    _carica_tfidf_keywords,
    NOISE_KEYWORDS,
)

PROFILI = ["warnok", "castoffcrown", "pepsipex"]


def run_pipeline(
    engine: Engine,
    profilo: str,
    staple_cap: int = 40,
    unnameable_bisect: bool = True,
    unnameable_cap: int = 12,
    W_aff: sp.csr_matrix | None = None,
    max_n: int = 10,
):
    chiavi, righe, plays, eta = K.storia_trakt(profilo, ordine="recente")
    righe_arr = np.asarray(righe, dtype=np.int64)
    n_seeds = len(righe_arr)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

    # 1. Matrice di affinità
    if W_aff is None:
        W_aff = carica_matrice_affinita()
    S = calcola_sim_affinity(righe_arr, W_aff)

    # 2. Micro-clustering
    micros, _ = micro_clustering(S, min_affinity=0.02)
    if not micros:
        return []

    # 3. Macro-merge
    raw_macros = macro_merge(engine, righe_arr, micros, tau=0.03)

    clustered_seeds = set(idx for m in raw_macros for idx in m)
    floor = calcola_adaptive_floor(len(clustered_seeds))

    meta = K.metadati()
    coll = meta.get("COLL")
    anime_flags = meta.get("ANIME")
    adult_flags = meta.get("ADULTO")
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    extra_info = _carica_tmdb_extra()
    kw_tuple = _carica_tfidf_keywords()
    kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

    def get_member_kws(r_idx: int) -> set[str]:
        if X_kw is None:
            return set()
        s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
        cols = X_kw.indices[s:e]
        return set(kw_names[c] for c in cols if kw_names[c] not in NOISE_KEYWORDS)

    def build_evidence(m_indices: list[int]) -> tuple[dict[str, Any], str]:
        sz = len(m_indices)
        m_rows = righe_arr[m_indices]
        m_keys = [engine.keys[r] for r in m_rows]
        media_list = ["series" if k.startswith("tv:") else "movie" for k in m_keys]
        c_med = Counter(media_list)

        if c_med["series"] > c_med["movie"]:
            m_med = "series"
        elif c_med["movie"] > c_med["series"]:
            m_med = "movie"
        else:
            best_idx = max(m_indices, key=lambda idx: (plays_arr[idx], -eta_arr[idx]))
            m_med = "series" if m_keys[m_indices.index(best_idx)].startswith("tv:") else "movie"

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

    def eval_macro(m_indices: list[int]) -> list[dict[str, Any]]:
        sz = len(m_indices)
        if sz > staple_cap:
            c1, c2 = bisect_cluster(engine, righe_arr, m_indices)
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
            if unnameable_bisect and sz > unnameable_cap:
                c1, c2 = bisect_cluster(engine, righe_arr, m_indices)
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

    eligible_raw: list[dict[str, Any]] = []
    for m in raw_macros:
        eligible_raw.extend(eval_macro(m))

    shelves: list[Shelf] = []
    for item in eligible_raw:
        m_indices = item["seeds"]
        m_sorted = sorted(m_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
        top_seed_idx = m_sorted[0]
        top_row = righe_arr[top_seed_idx]
        top_key = engine.keys[top_row]
        top_tmdb_id = int(top_key.split(":")[1]) if ":" in top_key else top_row

        catalog_id = f"yaca_{top_tmdb_id}_{item['medium']}"

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
                "anno": int(years[r]) if years is not None else 0,
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
                "anno": int(years[r]) if years is not None else 0,
            })

        sh = Shelf(
            catalog_id=catalog_id,
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
        shelves.append(sh)

    # Calcolo consistenza intra-cluster
    for sh in shelves:
        sz = len(sh.seeds_indices)
        if sz >= 2:
            sub = S[np.ix_(sh.seeds_indices, sh.seeds_indices)]
            iu = np.triu_indices(sz, k=1)
            sh.consistenza = round(float(np.mean(sub[iu])), 4)
        else:
            sh.consistenza = 0.0

    shelves.sort(key=lambda x: x.min_eta)
    for r_idx, item in enumerate(shelves):
        item._r_rec = r_idx + 1

    shelves.sort(key=lambda x: (-x.size, -x.consistenza))
    for r_idx, item in enumerate(shelves):
        item._r_sup = r_idx + 1
        item.r_comb = round((item._r_rec + item._r_sup) / 2.0, 1)

    def ensure_top10(cand: Shelf) -> None:
        if not cand.top10_cands:
            semi_rac = [
                {"key": chiavi[i], "tipo": "watched", "peso": 1.0}
                for i in cand.seeds_indices
            ]
            racs = engine.raccomanda(semi_rac, cap=10, medium=cand.medium, esclusi=chiavi)
            cand.top10_cands = set(r["key"] for r in racs[:10])
            cand.titoli = racs[:10]

    # Greedy row by row up to max_n
    chosen: list[Shelf] = []
    covered_seeds: set[int] = set()
    seen_tax_labels: set[str] = set()
    seen_colls: set[int] = set()
    coverage_steps: list[tuple[int, float, int]] = [] # (row, coverage_pct, uncovered_added)

    while len(chosen) < max_n:
        best_cand: Shelf | None = None
        best_key: tuple[int, float, float] | None = None

        for cand in shelves:
            if any(c is cand for c in chosen):
                continue
            if cand.nome_fonte == "tassonomia" and cand.nome in seen_tax_labels:
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
            if any(jaccard(cand.top10_cands, s.top10_cands) >= 0.5 for s in chosen):
                continue

            best_cand = cand
            best_key = cand_key

        if best_cand is None:
            break

        ensure_top10(best_cand)
        chosen.append(best_cand)
        added_count = len(set(best_cand.seeds_indices) - covered_seeds)
        covered_seeds.update(best_cand.seeds_indices)
        cov_pct = len(covered_seeds) / n_seeds * 100.0
        coverage_steps.append((len(chosen), cov_pct, added_count))

        if best_cand.nome_fonte == "tassonomia":
            seen_tax_labels.add(best_cand.nome)
        if best_cand.dom_coll is not None:
            seen_colls.add(best_cand.dom_coll)

    return {
        "n_seeds": n_seeds,
        "eligible_shelves": shelves,
        "chosen": chosen,
        "coverage_steps": coverage_steps,
        "final_coverage": len(covered_seeds) / n_seeds * 100.0,
        "total_covered": len(covered_seeds),
    }


def main():
    print("Inizializzazione Engine...", flush=True)
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W_aff = carica_matrice_affinita()

    variants = [
        ("V1", 40, True, 12),
        ("V2", 40, False, 12),
        ("V3", 60, False, 12),
    ]

    for p in PROFILI:
        print(f"\n==================== PROFILO {p} ====================", flush=True)
        for v_name, staple_cap, unnameable_bisect, unnameable_cap in variants:
            res = run_pipeline(
                engine,
                p,
                staple_cap=staple_cap,
                unnameable_bisect=unnameable_bisect,
                unnameable_cap=unnameable_cap,
                W_aff=W_aff,
                max_n=10,
            )
            print(f"\n--- Variante {v_name} (staple={staple_cap}, unnameable_bisect={unnameable_bisect}) ---")
            print(f"Totale semi profilo: {res['n_seeds']}")
            print(f"Candidati ammissibili: {len(res['eligible_shelves'])}")
            print("Passi di copertura per riga (1..10):")
            for r, cov, added in res["coverage_steps"]:
                pct_added = added / res["n_seeds"] * 100.0
                print(f"  Riga {r}: {cov:.1f}% (+{pct_added:.1f} pp, {added} semi)")
            
            # Check at N=6
            c6 = res["chosen"][:6]
            c6_cov = len(set(idx for s in c6 for idx in s.seeds_indices)) / res["n_seeds"] * 100.0
            tax_count6 = sum(1 for s in c6 if s.nome_fonte == "tassonomia")
            phv_count6 = sum(1 for s in c6 if s.nome_fonte == "perche_hai_visto")
            max_s6 = max((s.size for s in c6), default=0)
            print(f"At N=6: cov={c6_cov:.1f}%, shelves={len(c6)}, max_shelf={max_s6}, tax={tax_count6}, phv={phv_count6}")

            # Check at N=8
            c8 = res["chosen"][:8]
            c8_cov = len(set(idx for s in c8 for idx in s.seeds_indices)) / res["n_seeds"] * 100.0
            tax_count8 = sum(1 for s in c8 if s.nome_fonte == "tassonomia")
            phv_count8 = sum(1 for s in c8 if s.nome_fonte == "perche_hai_visto")
            max_s8 = max((s.size for s in c8), default=0)
            print(f"At N=8: cov={c8_cov:.1f}%, shelves={len(c8)}, max_shelf={max_s8}, tax={tax_count8}, phv={phv_count8}")

            # Check at N=10
            c10 = res["chosen"][:10]
            c10_cov = len(set(idx for s in c10 for idx in s.seeds_indices)) / res["n_seeds"] * 100.0
            tax_count10 = sum(1 for s in c10 if s.nome_fonte == "tassonomia")
            phv_count10 = sum(1 for s in c10 if s.nome_fonte == "perche_hai_visto")
            max_s10 = max((s.size for s in c10), default=0)
            print(f"At N=10: cov={c10_cov:.1f}%, shelves={len(c10)}, max_shelf={max_s10}, tax={tax_count10}, phv={phv_count10}")


if __name__ == "__main__":
    main()
