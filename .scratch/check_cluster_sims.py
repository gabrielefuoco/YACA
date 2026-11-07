from __future__ import annotations

import numpy as np
import scipy.sparse as sp

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

def main():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()

    chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")
    righe_arr = np.asarray(righe, dtype=np.int64)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

    eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)
    print(f"Total eligible clusters: {len(eligible)}")

    # Compute centroids using engine.Tr
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

    # Compute centroids using W_aff
    # B for top-100
    n = len(righe_arr)
    n_canon = W.shape[0]
    rows_list, cols_list, data_list = [], [], []
    for i, r in enumerate(righe_arr):
        s, e = W.indptr[r], W.indptr[r + 1]
        c_r = W.indices[s:e]
        v_r = W.data[s:e]
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

    print("\nPairwise cluster similarities (top pairs > 0.03):")
    pairs_tr = []
    pairs_w = []
    for i in range(len(eligible)):
        for j in range(i + 1, len(eligible)):
            pairs_tr.append((S_tr[i, j], i, j))
            pairs_w.append((S_w[i, j], i, j))

    pairs_tr.sort(key=lambda x: -x[0])
    pairs_w.sort(key=lambda x: -x[0])

    print("\n--- TOP PAIRS using engine.Tr ---")
    for s_val, i, j in pairs_tr[:25]:
        c1, c2 = eligible[i], eligible[j]
        print(f"sim={s_val:6.4f} | {c1.size:2d} semi '{c1.nome[:30]}' <---> {c2.size:2d} semi '{c2.nome[:30]}'")

    print("\n--- TOP PAIRS using W_aff (top-100) ---")
    for s_val, i, j in pairs_w[:25]:
        c1, c2 = eligible[i], eligible[j]
        print(f"sim={s_val:6.4f} | {c1.size:2d} semi '{c1.nome[:30]}' <---> {c2.size:2d} semi '{c2.nome[:30]}'")

if __name__ == "__main__":
    main()
