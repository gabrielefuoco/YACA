from __future__ import annotations
import numpy as np
import scipy.sparse as sp
from collections import Counter
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster, valuta_cluster

def main():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()
    chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")
    righe_arr = np.asarray(righe, dtype=np.int64)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

    eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)

    meta = K.metadati()
    titles = meta.get("TIT")
    anime_flags = meta.get("ANIME")
    adult_flags = meta.get("ADULTO")
    extra_info = I._carica_tmdb_extra()
    kw_tuple = I._carica_tfidf_keywords()
    kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

    def get_member_kws(r_idx: int) -> set[str]:
        if X_kw is None:
            return set()
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

    # Find clusters with arthouse seeds
    arthouse_seeds = ["Il filo nascosto", "Ghost in the Shell", "Arrivederci ragazzi", "Parasite", "Perfect Days"]
    arthouse_clusters = []
    for idx, c in enumerate(eligible):
        titoli = [str(titles[righe_arr[s]]) for s in c.seeds_indices]
        for a in arthouse_seeds:
            if any(a in t for t in titoli):
                ev, _ = build_evidence(c.seeds_indices)
                nome_base, nome_fonte, conf, matched = assegna_etichetta_cluster(ev)
                # val_res = valuta_cluster(ev)
                print(f"Cluster {idx} (sz={c.size}): {c.nome}")
                print(f"  Titles: {titoli}")
                print(f"  Assigned: nome={nome_base}, fonte={nome_fonte}, conf={conf}, matched={matched.nome if matched else None}")
                # print(f"  Valuta candidates: {[(m.entry.nome, m.confidenza) for m in val_res.matches]}")
                arthouse_clusters.append(c)
                break

    # Now let's test union of some or all of these arthouse clusters
    all_art_indices = set()
    for c in arthouse_clusters:
        all_art_indices.update(c.seeds_indices)
    ev_union, med_union = build_evidence(list(all_art_indices))
    nome_u, fonte_u, conf_u, match_u = assegna_etichetta_cluster(ev_union)
    # val_u = valuta_cluster(ev_union)
    print("\n--- UNION OF ARTHOUSE CLUSTERS ---")
    print(f"Total union size: {len(all_art_indices)}")
    print(f"Union Assigned: nome={nome_u}, fonte={fonte_u}, conf={conf_u}, matched={match_u.nome if match_u else None}")
    # print(f"Union Valuta: {[(m.entry.nome, m.confidenza) for m in val_u.matches]}")

if __name__ == "__main__":
    main()
