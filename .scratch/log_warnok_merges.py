"""log_warnok_merges.py — Log all pairwise merges in warnok."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

import numpy as np
import scipy.sparse as sp
from collections import Counter
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
W = I.carica_matrice_affinita()
meta = K.metadati()
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

def build_evidence(m_indices: list[int], righe_arr, plays_arr, eta_arr):
    sz = len(m_indices)
    m_rows = righe_arr[m_indices]
    m_keys = [engine.keys[r] for r in m_rows]
    media_list = ["series" if k.startswith("tv:") else "movie" for k in m_keys]
    c_med = Counter(media_list)
    m_med = "series" if c_med["series"] > c_med["movie"] else "movie"
    m_sorted = sorted(m_indices, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
    repr_seeds = [str(titles[righe_arr[idx]]) for idx in m_sorted[:3]]
    ev = {
        "size": sz,
        "medium": m_med,
        "anime_pct": 0.0,
        "adult_pct": 0.0,
        "member_kws": [get_member_kws(r) for r in m_rows],
        "languages": Counter(extra_info.get(m_keys[i], {}).get("orig_lang") for i in range(sz) if extra_info.get(m_keys[i], {}).get("orig_lang")),
        "countries": Counter(extra_info.get(m_keys[i], {}).get("orig_country") for i in range(sz) if extra_info.get(m_keys[i], {}).get("orig_country")),
        "repr_seeds": repr_seeds,
        "is_piccolo": sz < 3,
    }
    return ev, m_med

if __name__ == "__main__":
    import sys
    prof = sys.argv[1] if len(sys.argv) > 1 else "warnok"
    chiavi, righe, plays, eta = K.storia_trakt(prof, ordine="recente")
    righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

    base_eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)
    print(f"=== PROFILE: {prof} (Base count: {len(base_eligible)}) ===")

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
            "id": i,
            "seeds": set(c.seeds_indices),
            "medium": c.medium,
            "tax": tax,
            "vec": c_vecs[i],
            "nome": c.nome,
            "nome_fonte": c.nome_fonte,
        })

    tau_m = 0.05
    small_limit = 12

    merge_step = 0
    while True:
        best_pair = None
        best_sim = -1.0
        best_union_info = None

        for i in range(len(active_groups)):
            for j in range(i + 1, len(active_groups)):
                g1 = active_groups[i]
                g2 = active_groups[j]
                if g1["medium"] != g2["medium"]: continue
                sim = float(np.dot(g1["vec"], g2["vec"]))
                if sim < tau_m: continue
                union_tax = g1["tax"] | g2["tax"]
                if len(union_tax) >= 3: continue
                merged_seeds = g1["seeds"] | g2["seeds"]
                m_sorted = sorted(merged_seeds, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))[:40]
                ev, med_u = build_evidence(m_sorted, righe_arr, plays_arr, eta_arr)
                nome_u, fonte_u, conf_u, match_u = assegna_etichetta_cluster(ev)
                is_nameable = (fonte_u == "tassonomia")
                is_small = (len(m_sorted) <= small_limit)
                if not is_nameable and not is_small: continue
                if sim > best_sim:
                    best_sim = sim
                    best_pair = (i, j)
                    best_union_info = {
                        "nome": nome_u,
                        "nome_fonte": fonte_u,
                        "seeds": set(m_sorted),
                        "medium": med_u,
                        "tax": union_tax,
                    }
        if best_pair is None: break
        i, j = best_pair
        g1 = active_groups[i]
        g2 = active_groups[j]
        merge_step += 1
        print(f"Merge {merge_step:2d} (sim={best_sim:.3f}):")
        print(f"   G1: {g1['nome']} (sz={len(g1['seeds'])})")
        print(f"   G2: {g2['nome']} (sz={len(g2['seeds'])})")
        print(f"   -> UNION: {best_union_info['nome']} (sz={len(best_union_info['seeds'])}, {best_union_info['nome_fonte']})")
        m_sorted = sorted(best_union_info["seeds"], key=lambda idx: (-plays_arr[idx], eta_arr[idx]))
        v = np.array(V_norm[m_sorted, :].sum(axis=0)).ravel()
        nv = np.linalg.norm(v)
        new_vec = v / (nv if nv > 0 else 1.0)
        new_g = {
            "id": f"{g1['id']}+{g2['id']}",
            "seeds": best_union_info["seeds"],
            "medium": best_union_info["medium"],
            "tax": best_union_info["tax"],
            "vec": new_vec,
            "nome": best_union_info["nome"],
            "nome_fonte": best_union_info["nome_fonte"],
        }
        active_groups.pop(j)
        active_groups.pop(i)
        active_groups.append(new_g)
