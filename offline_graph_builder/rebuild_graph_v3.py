import pandas as pd
import numpy as np
import scipy.sparse as sp
import igraph as ig
import leidenalg
import json
import math
import os
import pickle
import re
from itertools import combinations
from collections import defaultdict, Counter
from tqdm import tqdm
from scipy.spatial.distance import cdist

CACHE_DIR = 'cache'
MIN_KEYWORD_FREQ = 15
ALPHA = 0.4
TOP_K_EDGES_PER_NODE = 10
LEIDEN_RESOLUTION = 150.0

CACHE_KWS = os.path.join(CACHE_DIR, f'kws_f{MIN_KEYWORD_FREQ}.pkl')
CACHE_PPMI = os.path.join(CACHE_DIR, f'ppmi_f{MIN_KEYWORD_FREQ}.npz')
CACHE_EMB = os.path.join(CACHE_DIR, f'emb_f{MIN_KEYWORD_FREQ}.npy')
CACHE_COSINE = os.path.join(CACHE_DIR, f'cosine_f{MIN_KEYWORD_FREQ}_t0.75.npz')

def main():
    print("[START] Inizio Fase 1: Re-build Graph con Livelli L1(150), L2(10), L3(3.16), L4(1.5), L5(1.0)")

    # 1. Caricamento Cache
    with open(CACHE_KWS, 'rb') as f:
        valid_keywords, kw_to_id, id_to_kw = pickle.load(f)
    N = len(valid_keywords)
    PPMI_matrix = sp.load_npz(CACHE_PPMI)
    embeddings = np.load(CACHE_EMB)
    Cosine_matrix = sp.load_npz(CACHE_COSINE)
    print(f"   [OK] Cache caricata. Nodi: {N}")

    # 2. Fusione Matrici
    ppmi_mask = PPMI_matrix.copy()
    ppmi_mask.data = np.ones_like(ppmi_mask.data)
    cosine_in_ppmi = Cosine_matrix.multiply(ppmi_mask)
    cosine_not_in_ppmi = Cosine_matrix - cosine_in_ppmi
    
    mask = cosine_not_in_ppmi.data < 0.85
    cosine_not_in_ppmi.data[mask] = 0
    cosine_not_in_ppmi.eliminate_zeros()
    
    cosine_penalized = cosine_in_ppmi + (cosine_not_in_ppmi * 0.9)
    Fused_matrix = (ALPHA * PPMI_matrix) + ((1 - ALPHA) * cosine_penalized)

    # 3. Sparsification
    Fused_matrix = Fused_matrix.tocsr()
    for i in tqdm(range(N), desc="Sparsification"):
        row_start = Fused_matrix.indptr[i]
        row_end = Fused_matrix.indptr[i+1]
        if row_end - row_start > TOP_K_EDGES_PER_NODE:
            data = Fused_matrix.data[row_start:row_end]
            top_k_idx = np.argpartition(data, -TOP_K_EDGES_PER_NODE)[-TOP_K_EDGES_PER_NODE:]
            mask = np.ones(len(data), dtype=bool)
            mask[top_k_idx] = False
            Fused_matrix.data[row_start:row_end][mask] = 0
    Fused_matrix.eliminate_zeros()
    Fused_matrix = Fused_matrix.maximum(Fused_matrix.T)

    # 4. Amputazione NSFW ibridi (per isolarli nel clustering)
    nsfw_pattern = re.compile(r'\b(sex|sexy|sexual|sexuality|porn\w*|eroti\w*|nude|nudity|rape|incest|masturbat\w*|vibrator|dildo|bdsm|fetish\w*|orgasm)\b')
    is_node_nsfw = np.zeros(N, dtype=bool)
    for i in range(N):
        if nsfw_pattern.search(id_to_kw[i]):
            is_node_nsfw[i] = True

    cx_fused = Fused_matrix.tocoo()
    keep_mask = is_node_nsfw[cx_fused.row] == is_node_nsfw[cx_fused.col]
    cx_fused.data[~keep_mask] = 0
    Fused_matrix = cx_fused.tocsr()
    Fused_matrix.eliminate_zeros()

    # 5. L1 Clustering (150.0)
    cx_fused = Fused_matrix.tocoo()
    ig_G = ig.Graph(n=N, edges=list(zip(cx_fused.row, cx_fused.col)), directed=False)
    partition = leidenalg.find_partition(ig_G, leidenalg.RBConfigurationVertexPartition, weights=cx_fused.data, resolution_parameter=LEIDEN_RESOLUTION)
    clusters = list(partition)
    
    id_to_cluster = {}
    cluster_nsfw_flags = {}
    valid_l1_clusters = set()

    for c_id, nodes in enumerate(clusters):
        is_nsfw = any(is_node_nsfw[n] for n in nodes)
        cluster_nsfw_flags[str(c_id)] = bool(is_nsfw)
        if not is_nsfw:
            valid_l1_clusters.add(c_id)
        for node in nodes:
            id_to_cluster[node] = c_id

    print(f"   [OK] L1: {len(clusters)} clusters ({len(valid_l1_clusters)} SFW)")

    def get_medoid(kw_indices):
        if not kw_indices: return "Unknown"
        if len(kw_indices) == 1: return id_to_kw[kw_indices[0]]
        vecs = embeddings[kw_indices]
        mean_vec = np.mean(vecs, axis=0, keepdims=True)
        dists = cdist(mean_vec, vecs, metric='cosine')[0]
        return id_to_kw[kw_indices[np.argmin(dists)]]

    cluster_adj = defaultdict(float)
    cx = PPMI_matrix.tocoo()
    for i, j, v in zip(cx.row, cx.col, cx.data):
        c_i = id_to_cluster[i]
        c_j = id_to_cluster[j]
        if c_i != c_j and c_i in valid_l1_clusters and c_j in valid_l1_clusters:
            edge = tuple(sorted([c_i, c_j]))
            cluster_adj[edge] += v

    l1_list = list(valid_l1_clusters)
    l1_to_idx = {c: i for i, c in enumerate(l1_list)}
    idx_to_l1 = {i: c for i, c in enumerate(l1_list)}

    # 6. L2 Clustering (10.0)
    l1_edges = [(l1_to_idx[e[0]], l1_to_idx[e[1]]) for e in cluster_adj.keys()]
    l1_weights = list(cluster_adj.values())
    
    ig_G_L1 = ig.Graph(n=len(l1_list), edges=l1_edges, directed=False)
    partition_L2 = leidenalg.find_partition(ig_G_L1, leidenalg.RBConfigurationVertexPartition, weights=l1_weights, resolution_parameter=10.0)
    clusters_L2 = list(partition_L2)
    print(f"   [OK] L2: {len(clusters_L2)} Topoi (solo SFW)")

    id_to_L2 = {}
    for l2_id, l1_idxs in enumerate(clusters_L2):
        for idx in l1_idxs:
            id_to_L2[idx_to_l1[idx]] = l2_id

    # 7. L3 Clustering (3.16)
    l2_adj = defaultdict(float)
    for (c1, c2), w in cluster_adj.items():
        l2_1 = id_to_L2[c1]
        l2_2 = id_to_L2[c2]
        if l2_1 != l2_2:
            edge = tuple(sorted([l2_1, l2_2]))
            l2_adj[edge] += w

    ig_G_L2 = ig.Graph(n=len(clusters_L2), edges=list(l2_adj.keys()), directed=False)
    partition_L3 = leidenalg.find_partition(ig_G_L2, leidenalg.RBConfigurationVertexPartition, weights=list(l2_adj.values()), resolution_parameter=3.16)
    clusters_L3 = list(partition_L3)
    print(f"   [OK] L3 (3.16): {len(clusters_L3)} Intermedi Superiori")

    id_to_L3 = {}
    for l3_id, l2_nodes in enumerate(clusters_L3):
        for l2_node in l2_nodes:
            id_to_L3[l2_node] = l3_id

    # 8. L4 Clustering (1.5)
    l3_adj = defaultdict(float)
    for (l2_1, l2_2), w in l2_adj.items():
        l3_1 = id_to_L3[l2_1]
        l3_2 = id_to_L3[l2_2]
        if l3_1 != l3_2:
            edge = tuple(sorted([l3_1, l3_2]))
            l3_adj[edge] += w

    ig_G_L3 = ig.Graph(n=len(clusters_L3), edges=list(l3_adj.keys()), directed=False)
    partition_L4 = leidenalg.find_partition(ig_G_L3, leidenalg.RBConfigurationVertexPartition, weights=list(l3_adj.values()), resolution_parameter=1.5)
    clusters_L4 = list(partition_L4)
    print(f"   [OK] L4 (1.5): {len(clusters_L4)} Nuovi Macro-Vibes")

    id_to_L4 = {}
    for l4_id, l3_nodes in enumerate(clusters_L4):
        for l3_node in l3_nodes:
            id_to_L4[l3_node] = l4_id

    # 9. L5 Clustering (1.0)
    l4_adj = defaultdict(float)
    for (l3_1, l3_2), w in l3_adj.items():
        l4_1 = id_to_L4[l3_1]
        l4_2 = id_to_L4[l3_2]
        if l4_1 != l4_2:
            edge = tuple(sorted([l4_1, l4_2]))
            l4_adj[edge] += w

    ig_G_L4 = ig.Graph(n=len(clusters_L4), edges=list(l4_adj.keys()), directed=False)
    partition_L5 = leidenalg.find_partition(ig_G_L4, leidenalg.RBConfigurationVertexPartition, weights=list(l4_adj.values()), resolution_parameter=1.0)
    clusters_L5 = list(partition_L5)
    print(f"   [OK] L5 (1.0): {len(clusters_L5)} Old L3 (Root)")

    id_to_L5 = {}
    for l5_id, l4_nodes in enumerate(clusters_L5):
        for l4_node in l4_nodes:
            id_to_L5[l4_node] = l5_id

    # 10. Costruzione JSON con Medoidi
    kw_to_L1 = {id_to_kw[i]: f"c_{id_to_cluster[i]}" for i in range(N)}
    
    L1_dict = {}
    for c_id, nodes in enumerate(clusters):
        parent = f"t_{id_to_L2[c_id]}" if c_id in valid_l1_clusters else None
        L1_dict[f"c_{c_id}"] = {
            "medoid": get_medoid(nodes),
            "keywords": [id_to_kw[n] for n in nodes],
            "parent": parent,
            "is_nsfw": cluster_nsfw_flags[str(c_id)]
        }

    L2_dict = {}
    for l2_id, l1_idxs in enumerate(clusters_L2):
        all_kw_idxs = []
        for idx in l1_idxs:
            all_kw_idxs.extend(clusters[idx_to_l1[idx]])
        L2_dict[f"t_{l2_id}"] = {
            "medoid": get_medoid(all_kw_idxs),
            "top_keywords": [k for k,v in Counter([id_to_kw[i] for i in all_kw_idxs]).most_common(20)],
            "children_L1": [f"c_{idx_to_l1[idx]}" for idx in l1_idxs],
            "parent": f"v_{id_to_L3[l2_id]}"
        }

    L3_dict = {}
    for l3_id, l2_nodes in enumerate(clusters_L3):
        all_kw_idxs = []
        for l2 in l2_nodes:
            for idx in clusters_L2[l2]:
                all_kw_idxs.extend(clusters[idx_to_l1[idx]])
        L3_dict[f"v_{l3_id}"] = {
            "medoid": get_medoid(all_kw_idxs),
            "top_keywords": [k for k,v in Counter([id_to_kw[i] for i in all_kw_idxs]).most_common(20)],
            "children_L2": [f"t_{l2}" for l2 in l2_nodes],
            "parent": f"m_{id_to_L4[l3_id]}"
        }

    L4_dict = {}
    for l4_id, l3_nodes in enumerate(clusters_L4):
        all_kw_idxs = []
        for l3 in l3_nodes:
            for l2 in clusters_L3[l3]:
                for idx in clusters_L2[l2]:
                    all_kw_idxs.extend(clusters[idx_to_l1[idx]])
        L4_dict[f"m_{l4_id}"] = {
            "medoid": get_medoid(all_kw_idxs),
            "top_keywords": [k for k,v in Counter([id_to_kw[i] for i in all_kw_idxs]).most_common(20)],
            "children_L3": [f"v_{l3}" for l3 in l3_nodes],
            "parent": f"r_{id_to_L5[l4_id]}"
        }

    L5_dict = {}
    for l5_id, l4_nodes in enumerate(clusters_L5):
        all_kw_idxs = []
        for l4 in l4_nodes:
            for l3 in clusters_L4[l4]:
                for l2 in clusters_L3[l3]:
                    for idx in clusters_L2[l2]:
                        all_kw_idxs.extend(clusters[idx_to_l1[idx]])
        L5_dict[f"r_{l5_id}"] = {
            "medoid": get_medoid(all_kw_idxs),
            "top_keywords": [k for k,v in Counter([id_to_kw[i] for i in all_kw_idxs]).most_common(20)],
            "children_L4": [f"m_{l4}" for l4 in l4_nodes]
        }

    output_data = {
        "metadata": {
            "version": "2.2",
            "total_keywords": N,
            "L1_count": len(clusters),
            "L2_count": len(clusters_L2),
            "L3_count": len(clusters_L3),
            "L4_count": len(clusters_L4),
            "L5_count": len(clusters_L5)
        },
        "kw_to_L1": kw_to_L1,
        "L1": L1_dict,
        "L2": L2_dict,
        "L3": L3_dict,
        "L4": L4_dict,
        "L5": L5_dict
    }

    OUTPUT_JSON = '../src/data/hierarchical_graph.json'
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False)
    print("[DONE] Grafo ricostruito con 5 livelli!")

if __name__ == "__main__":
    main()
