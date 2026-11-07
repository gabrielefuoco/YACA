from __future__ import annotations

import numpy as np
import scipy.sparse as sp
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform
from collections import Counter, defaultdict

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster

def test_m1_sweep():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()
    chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")
    righe_arr = np.asarray(righe, dtype=np.int64)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

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

    eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)
    n_cl = len(eligible)

    # 1. Tr representation
    V_tr = engine.Tr[righe_arr, :]
    norms_tr = np.array(np.sqrt(V_tr.multiply(V_tr).sum(axis=1))).ravel()
    norms_tr[norms_tr == 0] = 1.0
    V_tr_norm = sp.diags(1.0 / norms_tr) @ V_tr
    c_vecs_tr = []
    for c in eligible:
        v = np.array(V_tr_norm[c.seeds_indices, :].sum(axis=0)).ravel()
        n = np.linalg.norm(v)
        c_vecs_tr.append(v / (n if n > 0 else 1.0))
    C_tr = np.array(c_vecs_tr)
    S_tr = C_tr @ C_tr.T

    # 2. W_aff representation
    n = len(righe_arr)
    n_canon = W.shape[0]
    rows_list, cols_list, data_list = [], [], []
    for i, r in enumerate(righe_arr):
        s, e = W.indptr[r], W.indptr[r + 1]
        c_r, v_r = W.indices[s:e], W.data[s:e]
        if len(c_r) <= 100:
            top_cols, top_vals = c_r, v_r
        else:
            top_idx = np.argpartition(-v_r, 100)[:100]
            top_cols, top_vals = c_r[top_idx], v_r[top_idx]
        rows_list.append(np.full(len(top_cols), i, dtype=np.int32))
        cols_list.append(top_cols.astype(np.int32, copy=False))
        data_list.append(top_vals.astype(np.float32, copy=False))
    B = sp.csr_matrix((np.concatenate(data_list), (np.concatenate(rows_list), np.concatenate(cols_list))), shape=(n, n_canon), dtype=np.float32)
    norms_b = np.array(np.sqrt(B.multiply(B).sum(axis=1))).ravel()
    norms_b[norms_b == 0] = 1.0
    B_norm = sp.diags(1.0 / norms_b) @ B
    c_vecs_w = []
    for c in eligible:
        v = np.array(B_norm[c.seeds_indices, :].sum(axis=0)).ravel()
        n = np.linalg.norm(v)
        c_vecs_w.append(v / (n if n > 0 else 1.0))
    C_w = np.array(c_vecs_w)
    S_w = C_w @ C_w.T

    for name, S_mat in [("engine.Tr", S_tr), ("W_aff", S_w)]:
        print(f"\n==================== {name} ====================")
        for tau in [0.03, 0.05, 0.08, 0.12]:
            d = np.clip(1.0 - S_mat, 0.0, 1.0)
            np.fill_diagonal(d, 0.0)
            Z = linkage(squareform(d), method="average")
            labels = fcluster(Z, t=1.0 - tau, criterion="distance")
            groups = defaultdict(list)
            for idx, lbl in enumerate(labels):
                groups[lbl].append(idx)
            merged_groups = [v for v in groups.values() if len(v) > 1]
            print(f"\ntau = {tau:.2f} -> {len(groups)} clusters remaining ({len(merged_groups)} multi-cluster merges)")
            for g in merged_groups:
                cl_names = [f"'{eligible[i].nome[:25]}' ({eligible[i].size})" for i in g]
                union_seeds = set(s for i in g for s in eligible[i].seeds_indices)
                ev, _ = build_evidence(list(union_seeds))
                nome_u, fonte_u, conf_u, match_u = assegna_etichetta_cluster(ev)
                print(f"  Merged ({len(union_seeds)} seeds): {' + '.join(cl_names)}")
                print(f"    -> Label: '{nome_u}' (fonte={fonte_u}, conf={conf_u:.2f})")

if __name__ == "__main__":
    test_m1_sweep()
