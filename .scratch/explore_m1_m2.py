from __future__ import annotations

import numpy as np
import scipy.sparse as sp
from collections import Counter, defaultdict
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from graph.tassonomia import TASSONOMIA_36, assegna_etichetta_cluster

def explore():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()
    chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")
    righe_arr = np.asarray(righe, dtype=np.int64)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    # Step 1: sim affinity
    S = I.calcola_sim_affinity(righe_arr, W)

    # Step 2: micro clustering
    micros, unclustered = I.micro_clustering(S, min_affinity=0.02)
    print(f"Base micros count: {len(micros)}, unclustered: {len(unclustered)}")

    # Check soft assignment for seeds
    # For each seed, compute sim to each micro-cluster (mean of S[i, member])
    m_soft = [set(m) for m in micros]
    soft_additions = 0
    for i in range(len(righe_arr)):
        sims = []
        for m_idx, m_members in enumerate(micros):
            sim_val = np.mean(S[i, m_members])
            sims.append((sim_val, m_idx))
        sims.sort(key=lambda x: -x[0])
        best_sim, best_m = sims[0]
        second_sim, second_m = sims[1] if len(sims) > 1 else (0.0, -1)

        # Condition: second_best >= 0.7 * best and best_sim > 0.02
        if best_sim >= 0.02 and second_sim >= 0.7 * best_sim and second_sim >= 0.02:
            if i not in m_soft[second_m]:
                m_soft[second_m].add(i)
                soft_additions += 1

    print(f"Soft assignment added {soft_additions} seed memberships across {len(micros)} micros")

    # Now let's test macro-merge with base micros vs soft micros
    base_macros = I.macro_merge(engine, righe_arr, micros, tau=0.03)
    soft_micros_list = [sorted(list(s)) for s in m_soft]
    soft_macros = I.macro_merge(engine, righe_arr, soft_micros_list, tau=0.03)

    print(f"Base macros count: {len(base_macros)}")
    print(f"Soft macros count: {len(soft_macros)}")

    # Check sizes of base macros vs soft macros
    print("Base macros top sizes:", [len(m) for m in base_macros[:10]])
    print("Soft macros top sizes:", [len(m) for m in soft_macros[:10]])

if __name__ == "__main__":
    explore()
