from __future__ import annotations

import numpy as np
import scipy.sparse as sp
from collections import Counter, defaultdict

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import assegna_etichetta_cluster

def run_pipeline_with_m2(
    engine: Engine,
    profilo: str,
    tau_macro: float = 0.03,
    sim_ratio: float = 0.7,
    W_aff: sp.csr_matrix | None = None,
    max_n: int = 8,
):
    chiavi, righe, plays, eta = K.storia_trakt(profilo, ordine="recente")
    righe_arr = np.asarray(righe, dtype=np.int64)
    n_seeds = len(righe_arr)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

    if W_aff is None:
        W_aff = I.carica_matrice_affinita()
    S = I.calcola_sim_affinity(righe_arr, W_aff)

    # 2. Micro-clustering
    micros, unclustered = I.micro_clustering(S, min_affinity=0.02)
    if not micros:
        return None

    # M2 soft assignment:
    # Each seed may belong to more than one micro-cluster when its similarity to the second-best micro is >= 0.7 of the best
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

    # Adaptive floor
    clustered_seeds = set(idx for m in raw_macros for idx in m)
    floor = I.calcola_adaptive_floor(len(clustered_seeds))

    # Evaluate macros through Steps 4, 5, 7, 8
    meta = K.metadati()
    coll = meta.get("COLL")
    anime_flags = meta.get("ANIME")
    adult_flags = meta.get("ADULTO")
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

    def eval_macro(m_indices: list[int]) -> list[dict[str, Any]]:
        sz = len(m_indices)
        if sz > 40:
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
        shelves.append(sh)

    # Consistency
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

    def ensure_top10(cand: I.Shelf) -> None:
        if not cand.top10_cands:
            semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": 1.0} for i in cand.seeds_indices]
            racs = engine.raccomanda(semi_rac, cap=10, medium=cand.medium, esclusi=chiavi)
            cand.top10_cands = set(r["key"] for r in racs[:10])
            cand.titoli = racs[:10]

    chosen = []
    covered_seeds = set()
    seen_tax = set()
    seen_colls = set()
    while len(chosen) < max_n:
        best_cand = None
        best_key = None
        for cand in shelves:
            if any(c is cand for c in chosen): continue
            if cand.nome_fonte == "tassonomia" and cand.nome in seen_tax: continue
            if cand.dom_coll is not None and cand.dom_coll in seen_colls: continue
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
        if best_cand.dom_coll is not None: seen_colls.add(best_cand.dom_coll)

    cov_pct = len(covered_seeds) / n_seeds * 100.0
    return {
        "n_seeds": n_seeds,
        "eligible": shelves,
        "chosen": chosen,
        "covered_seeds": len(covered_seeds),
        "coverage_pct": cov_pct,
    }

if __name__ == "__main__":
    eng = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    res = run_pipeline_with_m2(eng, "castoffcrown")
    print(f"M2 on castoffcrown: {len(res['eligible'])} eligible, {len(res['chosen'])} chosen, cov={res['coverage_pct']:.1f}%")
    for s in res["chosen"]:
        print(f"  {s.nome} (sz={s.size}, src={s.nome_fonte})")
