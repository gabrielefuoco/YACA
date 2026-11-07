"""Script per analizzare nel dettaglio gli scaffali, la coerenza tematica (criterio c)
e la presenza dei vecchi grab bag su castoffcrown e pepsipex.
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

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


def seed_taxonomy_labels(
    r_idx: int,
    engine: Engine,
    meta: dict,
    extra_info: dict,
    kw_names: list[str],
    X_kw: sp.csr_matrix | None,
) -> list[str]:
    """Valuta quali etichette di tassonomia (se ve ne sono) si applicano al singolo seme."""
    k = engine.keys[r_idx]
    is_tv = k.startswith("tv:")
    med = "series" if is_tv else "movie"
    anime = bool(meta["ANIME"][r_idx]) if meta.get("ANIME") is not None else False
    adulto = bool(meta["ADULTO"][r_idx]) if meta.get("ADULTO") is not None else False
    
    kws = set()
    if X_kw is not None:
        s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
        cols = X_kw.indices[s:e]
        kws = set(kw_names[c] for c in cols if kw_names[c] not in NOISE_KEYWORDS)

    info = extra_info.get(k, {})
    lang = info.get("orig_lang")
    country = info.get("orig_country")

    ev = {
        "size": 1,
        "medium": med,
        "anime_pct": 1.0 if anime else 0.0,
        "adult_pct": 1.0 if adulto else 0.0,
        "member_kws": [kws],
        "languages": {lang: 1} if lang else {},
        "countries": {country: 1} if country else {},
        "repr_seeds": [str(meta["TIT"][r_idx])],
        "is_piccolo": True,
    }

    matching = []
    for entry in TASSONOMIA_36:
        ok, conf = valuta_cluster(ev, entry)
        if ok:
            matching.append(entry.nome)
    return matching


def inspect_variant(variant_name: str, staple_cap: int, unnameable_bisect: bool):
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W_aff = carica_matrice_affinita()
    meta = K.metadati()
    anno_arr, tit_arr = meta["ANNO"], meta["TIT"]
    extra_info = _carica_tmdb_extra()
    kw_tuple = _carica_tfidf_keywords()
    kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

    def nome_chiave(key: str) -> str:
        r = engine.row_of.get(key)
        if r is None:
            return key
        a = anno_arr[r]
        return f"{tit_arr[r]} ({int(a)})" if a else str(tit_arr[r])

    from misura_varianti import run_pipeline

    for p in ["castoffcrown", "pepsipex", "warnok"]:
        res = run_pipeline(
            engine,
            p,
            staple_cap=staple_cap,
            unnameable_bisect=unnameable_bisect,
            unnameable_cap=12,
            W_aff=W_aff,
            max_n=10,
        )
        chiavi, righe, plays, eta = K.storia_trakt(p, ordine="recente")
        righe_arr = np.asarray(righe, dtype=np.int64)

        print(f"\n==================== {variant_name} — PROFILO {p} ====================")
        chosen = res["chosen"]
        for idx, sh in enumerate(chosen, 1):
            cand_txt = " · ".join(nome_chiave(c["key"]) for c in sh.titoli[:5])
            rep_txt = " · ".join(f"{m['titolo']} ({m['anno']})" for m in sh.semi_rappresentativi[:3])
            
            # Analisi tassonomia dei membri
            all_tax_labels = set()
            seed_tax_counts = Counter()
            for s_idx in sh.seeds_indices:
                r_seme = righe_arr[s_idx]
                labels = seed_taxonomy_labels(r_seme, engine, meta, extra_info, kw_names, X_kw)
                for lbl in labels:
                    seed_tax_counts[lbl] += 1
                    all_tax_labels.add(lbl)

            # Controllo presenze note grab bag
            m_titles = [str(tit_arr[righe_arr[s_idx]]) for s_idx in sh.seeds_indices]
            has_er = any("E.R." in t for t in m_titles)
            has_philly = any("Philadelphia" in t for t in m_titles)
            has_shameless = any("Shameless" in t for t in m_titles)
            grab_marker = ""
            if has_er or has_philly or has_shameless:
                grab_marker = f" [GRAB BAG ALERT: ER={has_er}, Philly={has_philly}, Shameless={has_shameless}]"

            print(f"Row {idx:2d}: {sh.nome} | size={sh.size:2d} | rep: {rep_txt} | cands: {cand_txt}{grab_marker}")
            print(f"        -> Font: {sh.nome_fonte} | Distinct taxonomy labels in members: {len(all_tax_labels)} -> {seed_tax_counts.most_common(5)}")


if __name__ == "__main__":
    print("ANALISI VARIANTE V2 (staple 40, no unnameable bisect):")
    inspect_variant("V2", 40, False)
    print("\n\nANALISI VARIANTE V3 (staple 60, no unnameable bisect):")
    inspect_variant("V3", 60, False)
