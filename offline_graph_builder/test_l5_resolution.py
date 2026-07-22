import pandas as pd
import numpy as np
import scipy.sparse as sp
import igraph as ig
import leidenalg
import pickle
import os
import re
from itertools import combinations
from collections import defaultdict, Counter

CACHE_DIR = 'cache'
MIN_KEYWORD_FREQ = 15
ALPHA = 0.4
TOP_K_EDGES_PER_NODE = 10
LEIDEN_RESOLUTION = 150.0

CACHE_KWS = os.path.join(CACHE_DIR, f'kws_f{MIN_KEYWORD_FREQ}.pkl')
CACHE_PPMI = os.path.join(CACHE_DIR, f'ppmi_f{MIN_KEYWORD_FREQ}.npz')
CACHE_COSINE = os.path.join(CACHE_DIR, f'cosine_f{MIN_KEYWORD_FREQ}_t0.75.npz')

MOOD_KEYWORDS = {
    'powerful', 'admiring', 'intense', 'awestruck', 'enthusiastic', 'adoring', 
    'bold', 'vibrant', 'exuberant', 'thrilling', 'exhilarated', 'foreboding', 
    'complex', 'blunt', 'ghoulish', 'ambiguous', 'dreary', 'critical', 
    'bewildered', 'complicated', 'strange', 'weird', 'crazy', 'bizarre', 
    'quirky', 'strangeness', 'depressing', 'baffling', 'pretentious', 
    'bewildering', 'dark', 'uplifting', 'atmospheric', 'surreal', 'existential', 
    'contemplative', 'psychological', 'emotional', 'romantic', 'dramatic'
}

print("Caricamento dati...")
with open(CACHE_KWS, 'rb') as f:
    valid_keywords, kw_to_id, id_to_kw = pickle.load(f)
N = len(valid_keywords)
PPMI_matrix = sp.load_npz(CACHE_PPMI)
Cosine_matrix = sp.load_npz(CACHE_COSINE)

ppmi_mask = PPMI_matrix.copy()
ppmi_mask.data = np.ones_like(ppmi_mask.data)
cosine_in_ppmi = Cosine_matrix.multiply(ppmi_mask)
cosine_not_in_ppmi = Cosine_matrix - cosine_in_ppmi
mask = cosine_not_in_ppmi.data < 0.85
cosine_not_in_ppmi.data[mask] = 0
cosine_not_in_ppmi.eliminate_zeros()
cosine_penalized = cosine_in_ppmi + (cosine_not_in_ppmi * 0.9)
Fused_matrix = (ALPHA * PPMI_matrix) + ((1 - ALPHA) * cosine_penalized)
Fused_matrix = Fused_matrix.tocsr()
for i in range(N):
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

mood_indices = [i for i, kw in enumerate(id_to_kw) if kw in MOOD_KEYWORDS]
if mood_indices:
    cx_fused = Fused_matrix.tocoo()
    is_mood = np.zeros(N, dtype=bool)
    is_mood[mood_indices] = True
    mood_to_mood_mask = is_mood[cx_fused.row] & is_mood[cx_fused.col]
    cx_fused.data[mood_to_mood_mask] = 0
    Fused_matrix = cx_fused.tocsr()
    Fused_matrix.eliminate_zeros()

nsfw_pattern = re.compile(r'\b(sex|sexy|sexual|sexuality|porn\w*|eroti\w*|nude|nudity|rape|incest|masturbat\w*|vibrator|dildo|bdsm|fetish\w*|orgasm|3p|4p|sexually broken|pinku eiga|av idol|hentai|ero|エロ|辱め)\b', re.IGNORECASE)
is_node_nsfw = np.zeros(N, dtype=bool)
for i in range(N):
    if nsfw_pattern.search(id_to_kw[i]):
        is_node_nsfw[i] = True

cx_fused = Fused_matrix.tocoo()
keep_mask = is_node_nsfw[cx_fused.row] == is_node_nsfw[cx_fused.col]
cx_fused.data[~keep_mask] = 0
Fused_matrix = cx_fused.tocsr()
Fused_matrix.eliminate_zeros()

cx_fused = Fused_matrix.tocoo()
ig_G = ig.Graph(n=N, edges=list(zip(cx_fused.row, cx_fused.col)), directed=False)
partition = leidenalg.find_partition(ig_G, leidenalg.RBConfigurationVertexPartition, weights=cx_fused.data, resolution_parameter=LEIDEN_RESOLUTION)
clusters = list(partition)

id_to_cluster = {}
valid_l1_clusters = set()

for c_id, nodes in enumerate(clusters):
    is_nsfw = any(is_node_nsfw[n] for n in nodes)
    if not is_nsfw:
        valid_l1_clusters.add(c_id)
    for node in nodes:
        id_to_cluster[node] = c_id

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

l1_edges = [(l1_to_idx[e[0]], l1_to_idx[e[1]]) for e in cluster_adj.keys()]
l1_weights = list(cluster_adj.values())

ig_G_L1 = ig.Graph(n=len(l1_list), edges=l1_edges, directed=False)
partition_L2 = leidenalg.find_partition(ig_G_L1, leidenalg.RBConfigurationVertexPartition, weights=l1_weights, resolution_parameter=10.0)
clusters_L2 = list(partition_L2)

id_to_L2 = {}
for l2_id, l1_idxs in enumerate(clusters_L2):
    for idx in l1_idxs:
        id_to_L2[idx_to_l1[idx]] = l2_id

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

id_to_L3 = {}
for l3_id, l2_nodes in enumerate(clusters_L3):
    for l2_node in l2_nodes:
        id_to_L3[l2_node] = l3_id

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

id_to_L4 = {}
for l4_id, l3_nodes in enumerate(clusters_L4):
    for l3_node in l3_nodes:
        id_to_L4[l3_node] = l4_id

l4_adj = defaultdict(float)
for (l3_1, l3_2), w in l3_adj.items():
    l4_1 = id_to_L4[l3_1]
    l4_2 = id_to_L4[l3_2]
    if l4_1 != l4_2:
        edge = tuple(sorted([l4_1, l4_2]))
        l4_adj[edge] += w

# L4 Medoids helper
def get_l4_medoid(l4_id):
    import json
    with open('../src/data/hierarchical_graph.json', 'r', encoding='utf-8') as f:
        g = json.load(f)
    return g['L4'][f'm_{l4_id}']['medoid']

print("--- Dettagli Res 1.10 e 1.15 ---")
ig_G_L4 = ig.Graph(n=len(clusters_L4), edges=list(l4_adj.keys()), directed=False)

for res in [1.10, 1.15]:
    partition_L5 = leidenalg.find_partition(ig_G_L4, leidenalg.RBConfigurationVertexPartition, weights=list(l4_adj.values()), resolution_parameter=res)
    clusters_L5 = list(partition_L5)
    
    print(f"\n=======================")
    print(f"RISOLUZIONE {res:.2f}")
    print(f"=======================")
    main_clusters = [c for c in clusters_L5 if len(c) > 1]
    for i, c in enumerate(main_clusters):
        print(f"\nRoot [{i}] (Size: {len(c)}):")
        for l4_id in c:
            try:
                medoid = get_l4_medoid(l4_id)
            except:
                medoid = "Unknown"
            print(f"  - {medoid}")
