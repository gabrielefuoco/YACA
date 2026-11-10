"""test_complete_gap_fix.py — Implementazione e verifica prototipale di GAP 2, GAP 3, GAP 4."""
from __future__ import annotations
import sys
from pathlib import Path
from collections import Counter
import math

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

import numpy as np
import scipy.sparse as sp
from graph.runtime import Engine
from graph import canon as K, interessi as I
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster

TAU_CONTROPARTE: float = 0.025  # 2.5% permissiva
TINY_PROFILE_FLOOR: int = 8

def custom_clusters(
    engine: Engine,
    righe: Sequence[int],
    medium: str | None = None,
    eta: Sequence[float] | None = None,
    plays: Sequence[float] | None = None,
    W_aff: sp.csr_matrix | None = None,
) -> list[I.Shelf]:
    righe_arr = np.asarray(righe, dtype=np.int64)
    n_seeds = len(righe_arr)
    if n_seeds == 0:
        return []

    eta_arr = np.asarray(eta, dtype=np.float64) if eta is not None else np.zeros(n_seeds, dtype=np.float64)
    plays_arr = np.asarray(plays, dtype=np.float64) if plays is not None else np.ones(n_seeds, dtype=np.float64)

    if W_aff is None:
        W_aff = I.carica_matrice_affinita()
    S = I.calcola_sim_affinity(righe_arr, W_aff)

    micros, _ = I.micro_clustering(S, min_affinity=0.02)
    is_tiny_profile = n_seeds < TINY_PROFILE_FLOOR

    if not micros:
        if is_tiny_profile:
            raw_macros = [[i] for i in range(n_seeds)]
        else:
            return []
    else:
        raw_macros = I.macro_merge(engine, righe_arr, micros, tau=0.03)

    clustered_seeds = set(idx for m in raw_macros for idx in m)
    floor = I.calcola_adaptive_floor(len(clustered_seeds))
    min_cluster_size = 1 if is_tiny_profile else floor

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
        if X_kw is None:
            return set()
        s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
        cols = X_kw.indices[s:e]
        return set(kw_names[c] for c in cols if kw_names[c] not in I.NOISE_KEYWORDS)

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
        if sz > 40:
            c1, c2 = I.bisect_cluster(engine, righe_arr, m_indices)
            return eval_macro(c1) + eval_macro(c2)

        ev, macro_med = build_evidence(m_indices)
        nome_base, nome_fonte, conf, matched_entry = assegna_etichetta_cluster(ev)

        if nome_fonte == "tassonomia":
            if sz >= min_cluster_size:
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
                if sz >= min_cluster_size:
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

    tassonomia_map = {e.nome: e for e in TASSONOMIA_36}
    shelves: list[I.Shelf] = []
    for item in eligible_raw:
        raw_mov = [idx for idx in item["seeds"] if not engine.keys[righe_arr[idx]].startswith("tv:")]
        raw_ser = [idx for idx in item["seeds"] if engine.keys[righe_arr[idx]].startswith("tv:")]

        candidati_media: list[tuple[str, list[int], list[int]]] = []
        if medium == "movie":
            candidati_media = [("movie", raw_mov, raw_ser)]
        elif medium == "series":
            candidati_media = [("series", raw_ser, raw_mov)]
        else:
            candidati_media = [("movie", raw_mov, raw_ser), ("series", raw_ser, raw_mov)]

        for m_type, raw_indices, other_indices in candidati_media:
            if len(raw_indices) < min_cluster_size:
                continue

            m_indices = raw_indices

            entry_obj = tassonomia_map.get(item["nome"])
            if entry_obj and (entry_obj.excluded_keywords or entry_obj.excluded_languages):
                pruned_indices = []
                for s_idx in m_indices:
                    r = righe_arr[s_idx]
                    k_seme = engine.keys[r]
                    kws = get_member_kws(r)
                    lang = extra_info.get(k_seme, {}).get("orig_lang")
                    if entry_obj.excluded_languages and lang in entry_obj.excluded_languages:
                        continue
                    if entry_obj.excluded_keywords and any(k in entry_obj.excluded_keywords for k in kws):
                        continue
                    pruned_indices.append(s_idx)
                m_indices = pruned_indices

            if len(m_indices) < min_cluster_size:
                continue

            m_sorted = sorted(m_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
            top_seed_idx = m_sorted[0]
            top_row = righe_arr[top_seed_idx]
            top_key = engine.keys[top_row]
            top_tmdb_id = int(top_key.split(":")[1]) if ":" in top_key else top_row

            catalog_id = f"yaca_{top_tmdb_id}_{m_type}"

            dom_coll = None
            if coll is not None:
                c_coll = coll[righe_arr[m_indices]]
                pos = [x for x in c_coll if x > 0]
                if pos:
                    dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
                    if (dom_cnt / len(m_indices)) >= 0.5:
                        dom_coll = int(dom_cid)

            nome_scaffale = item["nome"]
            if item["nome_fonte"] == "perche_hai_visto":
                repr_titles = [str(titles[righe_arr[idx]]) for idx in m_sorted[:3]]
                if len(repr_titles) == 1:
                    nome_scaffale = f"Perché hai visto {repr_titles[0]}"
                elif len(repr_titles) == 2:
                    nome_scaffale = f"Perché hai visto {repr_titles[0]} e {repr_titles[1]}"
                elif len(repr_titles) >= 3:
                    nome_scaffale = f"Perché hai visto {repr_titles[0]}, {repr_titles[1]} e {repr_titles[2]}"

            semi_rappresentativi = []
            for idx in m_sorted[:3]:
                r = righe_arr[idx]
                k_seme = engine.keys[r]
                semi_rappresentativi.append({
                    "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                    "medium": m_type,
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
                    "medium": m_type,
                    "titolo": str(titles[r]) if titles is not None else k_seme,
                    "anno": int(years[r]) if years is not None else 0,
                })

            sh = I.Shelf(
                catalog_id=catalog_id,
                nome=nome_scaffale,
                nome_fonte=item["nome_fonte"],
                confidenza=round(float(item["conf"]), 3),
                medium=m_type,
                semi_rappresentativi=semi_rappresentativi,
                semi_membri=semi_membri,
                size=len(m_indices),
                min_eta=float(min(eta_arr[idx] for idx in m_indices)),
                matched_entry=item["matched_entry"],
                seeds_indices=m_indices,
                dom_coll=dom_coll,
            )
            # Annotiamo gli indici dell'altro medium provenienti dallo stesso macro
            sh._other_indices = other_indices
            shelves.append(sh)

    return shelves


def custom_scaffali(
    engine: Engine,
    semi: Sequence[Any],
    n: int = 8,
    medium: str | None = None,
    W_aff: sp.csr_matrix | None = None,
    cap: int = 60,
    cand_cap: int | None = None,
    weighted_support: bool = True,
    esclusi: Sequence[str] | None = None,
) -> list[I.Shelf]:
    if cand_cap is None:
        cand_cap = cap
    if not semi:
        return []

    righe: list[int] = []
    eta_list: list[float] = []
    plays_list: list[float] = []
    chiavi: list[str] = []

    for idx, s in enumerate(semi):
        r_idx = None
        s_eta = float(idx)
        s_plays = 1.0

        if isinstance(s, int):
            r_idx = s
        elif isinstance(s, str):
            r_idx = engine.row_of.get(s)
        elif isinstance(s, dict):
            k = s.get("key")
            if not k:
                tid = s.get("tmdbId") or s.get("tmdb_id")
                med = s.get("medium")
                if tid is not None:
                    pref = "tv" if med in ("tv", "series") else "movie"
                    k = f"{pref}:{int(tid)}"
            if k:
                r_idx = engine.row_of.get(k)
            s_eta = float(s.get("eta_giorni", s.get("eta", s.get("min_eta", idx))))
            s_plays = float(s.get("plays", 1.0))

        if r_idx is not None and 0 <= r_idx < engine.n:
            righe.append(r_idx)
            eta_list.append(s_eta)
            plays_list.append(s_plays)
            chiavi.append(engine.keys[r_idx])

    if not righe:
        return []

    righe_arr = np.asarray(righe, dtype=np.int64)
    plays_arr = np.asarray(plays_list, dtype=np.float32)
    eta_arr = np.asarray(eta_list, dtype=np.float32)

    eligible = custom_clusters(
        engine,
        righe=righe_arr,
        medium=medium,
        eta=eta_list,
        plays=plays_list,
        W_aff=W_aff,
    )
    if not eligible:
        return []

    if W_aff is None:
        W_aff = I.carica_matrice_affinita()
    S = I.calcola_sim_affinity(righe_arr, W_aff)

    for sh in eligible:
        sz = len(sh.seeds_indices)
        if sz >= 2:
            sub = S[np.ix_(sh.seeds_indices, sh.seeds_indices)]
            iu = np.triu_indices(sz, k=1)
            sh.consistenza = round(float(np.mean(sub[iu])), 4)
        else:
            sh.consistenza = 0.0

    nep_arr = engine.nep[righe_arr] if len(engine.nep) > 0 else np.ones(len(righe_arr))
    is_tv_arr = np.array([k.startswith("tv:") for k in chiavi])
    seed_weights = np.where(
        is_tv_arr & (nep_arr > 1.0),
        1.0 + 2.0 * np.minimum(plays_arr / nep_arr, 1.0),
        np.minimum(plays_arr, 3.0),
    )
    for sh in eligible:
        sh.weighted_support = float(sum(seed_weights[idx] for idx in sh.seeds_indices))

    eligible.sort(key=lambda x: x.min_eta)
    for r_idx, item in enumerate(eligible):
        item._r_rec = r_idx + 1

    eligible.sort(key=lambda x: (-getattr(x, "weighted_support", float(x.size)), -x.consistenza))
    for r_idx, item in enumerate(eligible):
        item._r_sup = r_idx + 1
        item.r_comb = round((item._r_rec + item._r_sup) / 2.0, 1)

    tutti_esclusi = set(chiavi) | set(esclusi or [])

    # Step 10: Selezione Greedy Two-Tier per Budget N
    def ensure_top10(cand: I.Shelf) -> None:
        if not cand.top10_cands:
            semi_rac = [
                {"key": chiavi[i], "tipo": "watched", "peso": float(seed_weights[i]) if weighted_support else 1.0}
                for i in cand.seeds_indices
            ]
            racs = engine.raccomanda(semi_rac, cap=10, medium=cand.medium, esclusi=tutti_esclusi)
            cand.top10_cands = set(r["key"] for r in racs[:10])

    chosen: list[I.Shelf] = []
    covered_seeds: set[int] = set()
    seen_tax_labels: set[str] = set()
    seen_colls: set[int] = set()

    for tier_source in ("tassonomia", "perche_hai_visto"):
        if len(chosen) >= n:
            break

        while len(chosen) < n:
            best_cand: I.Shelf | None = None
            best_key: tuple[float, float, float] | None = None

            for cand in eligible:
                if cand.nome_fonte != tier_source:
                    continue
                if any(c is cand for c in chosen):
                    continue
                if cand.nome_fonte == "tassonomia" and cand.nome in seen_tax_labels:
                    continue
                if cand.dom_coll is not None and cand.dom_coll in seen_colls:
                    continue

                uncovered_set = set(cand.seeds_indices) - covered_seeds
                if not uncovered_set:
                    continue

                uncovered_score = float(sum(seed_weights[i] for i in uncovered_set))
                cand_key = (uncovered_score, -cand.min_eta, cand.consistenza)
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
                seen_tax_labels.add(best_cand.nome)
            if best_cand.dom_coll is not None:
                seen_colls.add(best_cand.dom_coll)

    if not chosen:
        return []

    # Ordinamento Step 9 per esposizione UI
    named_shelves = [c for c in chosen if c.nome_fonte == "tassonomia"]
    unnamed_shelves = [c for c in chosen if c.nome_fonte == "perche_hai_visto"]

    if named_shelves:
        best_freshest = min(named_shelves, key=lambda x: (x.min_eta, x.r_comb))
        rem_named = [c for c in named_shelves if c is not best_freshest]
        rem_named.sort(key=lambda x: (x.r_comb, -x.consistenza, -x.size))
        unnamed_shelves.sort(key=lambda x: (x.r_comb, -x.consistenza, -x.size))
        ordered_shelves = [best_freshest] + rem_named + unnamed_shelves
    else:
        best_freshest = min(unnamed_shelves, key=lambda x: (x.min_eta, x.r_comb))
        rem = [c for c in unnamed_shelves if c is not best_freshest]
        rem.sort(key=lambda x: (x.r_comb, -x.consistenza, -x.size))
        ordered_shelves = [best_freshest] + rem

    # Decoupling: Riempimento candidati per le righe servite fino a cand_cap (GAP 2)
    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    for sh in ordered_shelves:
        semi_rac = [
            {"key": chiavi[i], "tipo": "watched", "peso": float(seed_weights[i]) if weighted_support else 1.0}
            for i in sh.seeds_indices
        ]
        recs = engine.raccomanda(semi_rac, cap=cand_cap, medium=sh.medium, esclusi=tutti_esclusi)
        sh.titoli = recs

    # GAP 4: Generazione controparti cross-medium con filtro tau = 2.5%
    counterpart_shelves: list[I.Shelf] = []
    if medium is None:
        for sh in ordered_shelves:
            c_med = "series" if sh.medium == "movie" else "movie"
            semi_rac = [
                {"key": chiavi[i], "tipo": "watched", "peso": float(seed_weights[i]) if weighted_support else 1.0}
                for i in sh.seeds_indices
            ]
            recs_c = engine.raccomanda(semi_rac, cap=cand_cap, medium=c_med, esclusi=tutti_esclusi)
            top1_p = sh.titoli[0]["punteggio"] if sh.titoli else 0.0
            top1_c = recs_c[0]["punteggio"] if recs_c else 0.0
            ratio = (top1_c / top1_p) if top1_p > 0 else 0.0

            if ratio >= TAU_CONTROPARTE and recs_c:
                # Prepara membri e rappresentativi dell'altro medium se presenti nel macro
                other_indices = getattr(sh, "_other_indices", [])
                other_members = []
                other_rep = []
                if other_indices:
                    other_sorted = sorted(other_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
                    for idx in other_sorted:
                        r = righe_arr[idx]
                        k_seme = engine.keys[r]
                        other_members.append({
                            "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                            "medium": c_med,
                            "titolo": str(titles[r]) if titles is not None else k_seme,
                            "anno": int(years[r]) if years is not None else 0,
                        })
                    for idx in other_sorted[:3]:
                        r = righe_arr[idx]
                        k_seme = engine.keys[r]
                        other_rep.append({
                            "tmdbId": int(k_seme.split(":")[1]) if ":" in k_seme else r,
                            "medium": c_med,
                            "titolo": str(titles[r]) if titles is not None else k_seme,
                            "anno": int(years[r]) if years is not None else 0,
                            "plays": float(plays_arr[idx]),
                            "eta_giorni": float(eta_arr[idx]),
                        })
                    covered_seeds.update(other_indices)

                cat_prefix = sh.catalog_id.rsplit("_", 1)[0]
                sh_c = I.Shelf(
                    catalog_id=f"{cat_prefix}_{c_med}",
                    nome=sh.nome,
                    nome_fonte=sh.nome_fonte,
                    confidenza=sh.confidenza,
                    medium=c_med,
                    semi_rappresentativi=other_rep,
                    semi_membri=other_members,
                    size=len(other_indices),
                    min_eta=sh.min_eta,
                    matched_entry=sh.matched_entry,
                    seeds_indices=other_indices,
                    dom_coll=sh.dom_coll,
                )
                sh_c.titoli = recs_c
                sh_c._ratio = ratio
                counterpart_shelves.append(sh_c)

    all_served = ordered_shelves + counterpart_shelves
    for slot_idx, sh in enumerate(all_served, 1):
        sh.slot_position = slot_idx

    return all_served


def main():
    engine = Engine.carica_transizione()
    W_aff = I.carica_matrice_affinita()

    profili = [
        "warnok", "pepsipex", "castoffcrown", "moppierhead", "1jacobjohn",
        "sappss", "flixinatoor99", "hammers-lists", "sangam456", "carverclan"
    ]

    all_cands_counts = []
    print("="*100)
    print("ESECUZIONE TEST COMPLETO SUI 10 PROFILI CON GAP 2, GAP 3, GAP 4")
    print("="*100)

    for p in profili:
        ch, _, pl, et = K.storia_trakt(p, ordine="recente")
        semi_input = [{"key": k, "plays": float(pl[i]), "eta_giorni": float(et[i])} for i, k in enumerate(ch)]
        shs = custom_scaffali(engine, semi_input, n=8, W_aff=W_aff, cap=60)

        cands = [len(s.titoli) for s in shs]
        all_cands_counts.extend(cands)

        base_shs = [s for s in shs if not hasattr(s, "_ratio")]
        count_shs = [s for s in shs if hasattr(s, "_ratio")]

        print(f"\nPROFILO {p:14}: Tot={len(shs)} righe (Base={len(base_shs)}, Controparti={len(count_shs)})")
        for s in shs:
            is_c = hasattr(s, "_ratio")
            r_str = f" [controparte ratio={s._ratio*100:.2f}%]" if is_c else ""
            print(f"  Slot {s.slot_position:2d}: [{s.medium:6}] '{s.nome}'{r_str} | membri={len(s.semi_membri)} | candidati={len(s.titoli)}")

    print("\n" + "="*100)
    print("METRICHE CANDIDATI PER RIGA (TUTTE LE RIGHE SERVITE):")
    print(f"Min candidati:    {min(all_cands_counts)}")
    print(f"Median candidati: {np.median(all_cands_counts):.1f}")
    print(f"Max candidati:    {max(all_cands_counts)}")
    print("="*100)

if __name__ == "__main__":
    main()
