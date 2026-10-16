import pandas as pd
import numpy as np
import scipy.sparse as sp
import igraph as ig
import leidenalg
from sentence_transformers import SentenceTransformer
import json
import math
import os
import pickle
import re
from itertools import combinations
from collections import defaultdict, Counter
from tqdm import tqdm

# --- CONFIGURAZIONE PARAMETRI DI TUNING ---
DATASET_PATH = '../movies.parquet'
OUTPUT_JSON = '../src/data/graph_data.json'
CACHE_DIR = 'cache'

# Parametri Tuning
MIN_KEYWORD_FREQ = 5        # 5 in 25k movies is equivalent to ~200 in 1M movies. Perfetto per pulire il rumore.
ALPHA = 0.4                 # Compromesso: 40% PPMI, 60% Semantica
TOP_K_EDGES_PER_NODE = 10   # Sparsità forzata: ogni keyword si lega al max a 10 altre keyword
LEIDEN_RESOLUTION = 150.0   # Forziamo lo spezzettamento estremo in micro-cluster da ~5 nodi
COSINE_THRESHOLD = 0.75     # Soglia alta di somiglianza semantica

os.makedirs(CACHE_DIR, exist_ok=True)

# Generazione nomi cache basati sui parametri core per non ricalcolare se non cambiano
CACHE_KWS = os.path.join(CACHE_DIR, f'kws_f{MIN_KEYWORD_FREQ}.pkl')
CACHE_PPMI = os.path.join(CACHE_DIR, f'ppmi_f{MIN_KEYWORD_FREQ}.npz')
CACHE_EMB = os.path.join(CACHE_DIR, f'emb_f{MIN_KEYWORD_FREQ}.npy')
CACHE_COSINE = os.path.join(CACHE_DIR, f'cosine_f{MIN_KEYWORD_FREQ}_t{COSINE_THRESHOLD}.npz')

def main():
    print("[START] Inizio Fase 1: Pre-Processing Offline del Grafo YACA\n")
    
    # 1-4: Gestione Keyword e Matrice PPMI
    if os.path.exists(CACHE_KWS) and os.path.exists(CACHE_PPMI):
        print("-> Cache trovata! Caricamento Keyword e PPMI dal disco...")
        with open(CACHE_KWS, 'rb') as f:
            valid_keywords, kw_to_id, id_to_kw = pickle.load(f)
        N = len(valid_keywords)
        PPMI_matrix = sp.load_npz(CACHE_PPMI)
        print(f"   [OK] {N} keyword caricate. Matrice PPMI caricata ({PPMI_matrix.nnz} archi).\n")
    else:
        print("1. Caricamento dataset TMDB (Parquet)...")
        try:
            df = pd.read_parquet(DATASET_PATH, columns=['keywords'])
        except Exception as e:
            print(f"[ERROR] Errore nel caricamento del dataset. Verifica il percorso: {DATASET_PATH}\n{e}")
            return

        df = df.dropna(subset=['keywords'])
        print(f"   [OK] Trovati {len(df)} film con keywords.\n")

        print("2. Estrazione e filtraggio delle keyword...")
        movies_keywords = []
        keyword_counts = Counter()
        
        for row in tqdm(df['keywords'], desc="Parsing keywords"):
            try:
                # The parquet has keywords as JSON array string: [{"id":123,"name":"magic"}, ...]
                kw_list = json.loads(row)
                kws = [k['name'].strip().lower() for k in kw_list if 'name' in k and k['name'].strip()]
                if kws:
                    movies_keywords.append(kws)
                    keyword_counts.update(kws)
            except:
                continue
            
        valid_keywords = {k for k, v in keyword_counts.items() if v >= MIN_KEYWORD_FREQ}
        print(f"   [OK] Keyword uniche totali: {len(keyword_counts)}")
        print(f"   [OK] Keyword mantenute (frequenza >= {MIN_KEYWORD_FREQ}): {len(valid_keywords)}\n")
        
        if len(valid_keywords) == 0:
            print("[ERROR] Nessuna keyword ha superato la soglia di filtraggio.")
            return

        kw_to_id = {kw: i for i, kw in enumerate(valid_keywords)}
        id_to_kw = {i: kw for kw, i in kw_to_id.items()}
        N = len(valid_keywords)
        
        print("3. Calcolo delle frequenze di co-occorrenza...")
        pair_counts = Counter()
        degree = defaultdict(int)
        
        for kws in tqdm(movies_keywords, desc="Analisi co-occorrenze"):
            filtered_kws = [k for k in kws if k in valid_keywords]
            pairs = list(combinations(sorted(filtered_kws), 2))
            pair_counts.update(pairs)
            
        for (a, b), c in pair_counts.items():
            degree[a] += c
            degree[b] += c
            
        D = sum(degree.values())
        print(f"   [OK] Coppie uniche trovate: {len(pair_counts)}\n")

        print("4. Costruzione della matrice PPMI (Realtà Strutturale)...")
        row_ind, col_ind, data_ppmi = [], [], []
        
        for (a, b), count_ab in tqdm(pair_counts.items(), desc="Calcolo PPMI"):
            p_ab = count_ab / D
            p_a = degree[a] / D
            p_b = degree[b] / D
            
            pmi = math.log2(p_ab / (p_a * p_b))
            ppmi = max(0, pmi)
            
            if ppmi > 0:
                i = kw_to_id[a]
                j = kw_to_id[b]
                row_ind.extend([i, j])
                col_ind.extend([j, i])
                data_ppmi.extend([ppmi, ppmi])
                
        if len(data_ppmi) > 0:
            max_ppmi = max(data_ppmi)
            data_ppmi = [x / max_ppmi for x in data_ppmi]
                
        PPMI_matrix = sp.csr_matrix((data_ppmi, (row_ind, col_ind)), shape=(N, N))
        
        # Salvataggio in cache
        with open(CACHE_KWS, 'wb') as f:
            pickle.dump((valid_keywords, kw_to_id, id_to_kw), f)
        sp.save_npz(CACHE_PPMI, PPMI_matrix)
        print(f"   [OK] Matrice PPMI calcolata e salvata in cache. Archi non nulli: {PPMI_matrix.nnz}\n")

    # 5. Generazione Embeddings
    if os.path.exists(CACHE_EMB):
        print("-> Cache trovata! Caricamento Embeddings dal disco...")
        embeddings = np.load(CACHE_EMB)
        print(f"   [OK] Embeddings caricati.\n")
    else:
        print(f"5. Generazione Embeddings con il modello BAAI/bge-small-en-v1.5...")
        model = SentenceTransformer('BAAI/bge-small-en-v1.5')
        kw_list = [id_to_kw[i] for i in range(N)]
        embeddings = model.encode(kw_list, show_progress_bar=True, normalize_embeddings=True)
        np.save(CACHE_EMB, embeddings)
        print(f"   [OK] Embeddings generati e salvati in cache.\n")
    
    # 6. Matrice Cosine Similarity a Blocchi
    if os.path.exists(CACHE_COSINE):
        print(f"-> Cache trovata! Caricamento Matrice Cosine (Soglia {COSINE_THRESHOLD}) dal disco...")
        Cosine_matrix = sp.load_npz(CACHE_COSINE)
        print(f"   [OK] Matrice Cosine caricata ({Cosine_matrix.nnz} archi).\n")
    else:
        print("6. Calcolo Matrice Cosine Similarity a blocchi...")
        batch_size = 1000
        cosine_row_ind, cosine_col_ind, cosine_data = [], [], []
        
        for i in tqdm(range(0, N, batch_size), desc="Cosine Similarity"):
            end_i = min(i + batch_size, N)
            sim_batch = np.dot(embeddings[i:end_i], embeddings.T)
            sim_batch = np.clip(sim_batch, 0, 1)
            for r in range(end_i - i):
                sim_batch[r, i + r] = 0
                
            rows, cols = np.where(sim_batch >= COSINE_THRESHOLD)
            for r, c in zip(rows, cols):
                cosine_row_ind.append(i + r)
                cosine_col_ind.append(c)
                cosine_data.append(sim_batch[r, c])
        
        Cosine_matrix = sp.csr_matrix((cosine_data, (cosine_row_ind, cosine_col_ind)), shape=(N, N))
        sp.save_npz(CACHE_COSINE, Cosine_matrix)
        print(f"   [OK] Matrice Cosine completata e salvata in cache. Archi sopra soglia: {Cosine_matrix.nnz}\n")
    
    # 7. Fusione Matrici (con Veto Strutturale)
    print("7. Fusione Matrici (PPMI + Cosine) con Veto Strutturale (Penalty x0.5 se PPMI=0)...")
    
    # Maschera binaria di dove il PPMI esiste (>0)
    ppmi_mask = PPMI_matrix.copy()
    ppmi_mask.data = np.ones_like(ppmi_mask.data)
    
    # Estraiamo gli archi Cosine che esistono anche nel PPMI
    cosine_in_ppmi = Cosine_matrix.multiply(ppmi_mask)
    
    # Estraiamo gli archi Cosine che NON esistono nel PPMI (allucinazioni semantiche potenziali)
    cosine_not_in_ppmi = Cosine_matrix - cosine_in_ppmi
    
    # VETO SEMANTICO RIGIDO: Se due parole non appaiono MAI insieme nei film (PPMI=0), 
    # la loro somiglianza semantica deve essere palese (>= 0.85) per considerarli sinonimi veri 
    # (es. "cab driver" e "taxi driver" -> 0.94). 
    # Questo distrugge allucinazioni come "toy" e "sex toy" (0.77).
    mask = cosine_not_in_ppmi.data < 0.85
    cosine_not_in_ppmi.data[mask] = 0
    cosine_not_in_ppmi.eliminate_zeros()
    
    # Quelli che sopravvivono sono veri sinonimi mai co-occorsi. Li penalizziamo leggermente.
    cosine_penalized = cosine_in_ppmi + (cosine_not_in_ppmi * 0.9)
    
    Fused_matrix = (ALPHA * PPMI_matrix) + ((1 - ALPHA) * cosine_penalized)
    print(f"   [OK] Matrice Fusa completata. Archi totali: {Fused_matrix.nnz}\n")
    
    # 8. KNN Sparsification Pre-Leiden
    print(f"8. KNN Sparsification (Top {TOP_K_EDGES_PER_NODE} archi per nodo)...")
    Fused_matrix = Fused_matrix.tocsr()
    
    for i in tqdm(range(N), desc="Taglio archi deboli"):
        row_start = Fused_matrix.indptr[i]
        row_end = Fused_matrix.indptr[i+1]
        
        if row_end - row_start > TOP_K_EDGES_PER_NODE:
            data = Fused_matrix.data[row_start:row_end]
            # Troviamo gli indici dei TOP_K_EDGES_PER_NODE elementi più grandi
            top_k_idx = np.argpartition(data, -TOP_K_EDGES_PER_NODE)[-TOP_K_EDGES_PER_NODE:]
            
            mask = np.ones(len(data), dtype=bool)
            mask[top_k_idx] = False
            # Azzeriamo gli altri
            Fused_matrix.data[row_start:row_end][mask] = 0

    Fused_matrix.eliminate_zeros()
    # Rendiamo simmetrico il grafo (se A->B è nei top 10, teniamo anche B->A per sicurezza)
    # Fused_matrix = Fused_matrix.maximum(Fused_matrix.T) -> Opzionale, ma aiuta Leiden
    Fused_matrix = Fused_matrix.maximum(Fused_matrix.T)
    print(f"   [OK] Grafo sparsificato. Archi ridotti a: {Fused_matrix.nnz}\n")

    # 8.5. Amputazione Pre-Clustering (Separazione chirugica NSFW vs SFW)
    print("8.5. Amputazione Pre-Clustering: Recisione archi ibridi tra nodi SFW e NSFW...")
    
    # Usiamo \b (word boundary) per evitare di matchare "sex" dentro "essex" o "heterosexual"
    nsfw_pattern = re.compile(r'\b(sex|sexy|sexual|sexuality|porn\w*|eroti\w*|nude|nudity|rape|incest|masturbat\w*|vibrator|dildo|bdsm|fetish\w*|orgasm)\b')
    
    is_node_nsfw = np.zeros(N, dtype=bool)
    for i in range(N):
        if nsfw_pattern.search(id_to_kw[i]):
            is_node_nsfw[i] = True
            
    print(f"   [INFO] Identificate {is_node_nsfw.sum()} keyword NSFW pure.")
    
    cx_fused = Fused_matrix.tocoo()
    
    # Maschera: manteniamo l'arco solo se ENTRAMBI i nodi sono dello stesso tipo (entrambi NSFW o entrambi SFW)
    keep_mask = is_node_nsfw[cx_fused.row] == is_node_nsfw[cx_fused.col]
    
    cx_fused.data[~keep_mask] = 0
    Fused_matrix = cx_fused.tocsr()
    Fused_matrix.eliminate_zeros()
    
    print(f"   [OK] Archi ibridi recisi. Archi rimasti nel grafo separato: {Fused_matrix.nnz}\n")

    # 9. Leiden Clustering
    print(f"9. Esecuzione Algoritmo di Leiden (Resolution: {LEIDEN_RESOLUTION})...")
    cx_fused = Fused_matrix.tocoo()
    edges = list(zip(cx_fused.row, cx_fused.col))
    weights = cx_fused.data
    
    ig_G = ig.Graph(n=N, edges=edges, directed=False)
    
    partition = leidenalg.find_partition(
        ig_G, 
        leidenalg.RBConfigurationVertexPartition, 
        weights=weights, 
        resolution_parameter=LEIDEN_RESOLUTION
    )
    
    clusters = list(partition)
    
    # Stats: Quanti cluster hanno 1 nodo? Quanti > 10?
    cluster_sizes = [len(c) for c in clusters]
    avg_size = sum(cluster_sizes)/len(clusters)
    max_size = max(cluster_sizes)
    
    print(f"   [OK] Trovati {len(clusters)} micro-cluster.")
    print(f"   [INFO] Dimensione media: {avg_size:.1f} nodi | Max: {max_size} nodi\n")
    
    id_to_cluster = {}
    for cluster_id, nodes in enumerate(clusters):
        for node in nodes:
            id_to_cluster[node] = str(cluster_id)
            
    # 10. Estrazione Adiacenza Cluster L1 (Micro-Cluster)
    print("10. Compattazione del grafo a livello L1 e Sparsificazione...")
    cluster_adj = defaultdict(float)
    
    cx = PPMI_matrix.tocoo()
    for i, j, v in tqdm(zip(cx.row, cx.col, cx.data), desc="Accumulo archi L1", total=len(cx.data)):
        c_i = int(id_to_cluster[i])
        c_j = int(id_to_cluster[j])
        if c_i != c_j:
            edge = tuple(sorted([c_i, c_j]))
            cluster_adj[edge] += v
            
    # Sparsificazione L1 (Top 50 per output legacy se necessario, o per visualizzazione)
    adj_list_l1 = defaultdict(list)
    for (c1, c2), weight in cluster_adj.items():
        adj_list_l1[c1].append((c2, weight))
        adj_list_l1[c2].append((c1, weight))
        
    final_adjacency_l1 = {}
    for c, neighbors in adj_list_l1.items():
        neighbors.sort(key=lambda x: x[1], reverse=True)
        top_neighbors = neighbors[:50]
        final_adjacency_l1[f'c_{c}'] = {f'c_{n}': round(w, 4) for n, w in top_neighbors}

    # 11. Generazione L2 (Topoi Narrativi)
    print("11. Esecuzione Leiden su L1 per generare L2 (Resolution: 10.0)...")
    N_L1 = len(clusters)
    l1_edges = list(cluster_adj.keys())
    l1_weights = list(cluster_adj.values())
    
    ig_G_L1 = ig.Graph(n=N_L1, edges=l1_edges, directed=False)
    partition_L2 = leidenalg.find_partition(
        ig_G_L1, 
        leidenalg.RBConfigurationVertexPartition, 
        weights=l1_weights, 
        resolution_parameter=10.0
    )
    clusters_L2 = list(partition_L2)
    print(f"   [OK] Trovati {len(clusters_L2)} Topoi L2.")
    
    id_to_L2 = {}
    for l2_id, l1_nodes in enumerate(clusters_L2):
        for l1_node in l1_nodes:
            id_to_L2[l1_node] = l2_id

    # 12. Generazione L3 (Macro-Vibes)
    print("12. Compattazione L2 ed esecuzione Leiden per generare L3 (Resolution: 1.0)...")
    l2_adj = defaultdict(float)
    for (c1, c2), w in cluster_adj.items():
        l2_1 = id_to_L2[c1]
        l2_2 = id_to_L2[c2]
        if l2_1 != l2_2:
            edge = tuple(sorted([l2_1, l2_2]))
            l2_adj[edge] += w
            
    N_L2 = len(clusters_L2)
    l2_edges = list(l2_adj.keys())
    l2_weights = list(l2_adj.values())
    
    ig_G_L2 = ig.Graph(n=N_L2, edges=l2_edges, directed=False)
    partition_L3 = leidenalg.find_partition(
        ig_G_L2, 
        leidenalg.RBConfigurationVertexPartition, 
        weights=l2_weights, 
        resolution_parameter=1.0
    )
    clusters_L3 = list(partition_L3)
    print(f"   [OK] Trovati {len(clusters_L3)} Macro-Vibes L3.\n")
    
    id_to_L3 = {}
    for l3_id, l2_nodes in enumerate(clusters_L3):
        for l2_node in l2_nodes:
            id_to_L3[l2_node] = l3_id

    # 12.1 Generazione L4 (Macro-Generi)
    print("12.1. Compattazione L3 ed esecuzione Leiden per generare L4 (Resolution: 0.1)...")
    l3_adj = defaultdict(float)
    for (l2_1, l2_2), w in l2_adj.items():
        l3_1 = id_to_L3[l2_1]
        l3_2 = id_to_L3[l2_2]
        if l3_1 != l3_2:
            edge = tuple(sorted([l3_1, l3_2]))
            l3_adj[edge] += w
            
    N_L3 = len(clusters_L3)
    l3_edges = list(l3_adj.keys())
    l3_weights = list(l3_adj.values())
    
    ig_G_L3 = ig.Graph(n=N_L3, edges=l3_edges, directed=False)
    partition_L4 = leidenalg.find_partition(
        ig_G_L3, 
        leidenalg.RBConfigurationVertexPartition, 
        weights=l3_weights, 
        resolution_parameter=0.1
    )
    clusters_L4 = list(partition_L4)
    print(f"   [OK] Trovati {len(clusters_L4)} Macro-Generi L4.\n")
    
    id_to_L4 = {}
    for l4_id, l3_nodes in enumerate(clusters_L4):
        for l3_node in l3_nodes:
            id_to_L4[l3_node] = l4_id

    # 12.2 Generazione L5 (Radici)
    print("12.2. Compattazione L4 ed esecuzione Leiden per generare L5 (Resolution: 0.01)...")
    l4_adj = defaultdict(float)
    for (l3_1, l3_2), w in l3_adj.items():
        l4_1 = id_to_L4[l3_1]
        l4_2 = id_to_L4[l3_2]
        if l4_1 != l4_2:
            edge = tuple(sorted([l4_1, l4_2]))
            l4_adj[edge] += w
            
    N_L4 = len(clusters_L4)
    l4_edges = list(l4_adj.keys())
    l4_weights = list(l4_adj.values())
    
    ig_G_L4 = ig.Graph(n=N_L4, edges=l4_edges, directed=False)
    partition_L5 = leidenalg.find_partition(
        ig_G_L4, 
        leidenalg.RBConfigurationVertexPartition, 
        weights=l4_weights, 
        resolution_parameter=0.01
    )
    clusters_L5 = list(partition_L5)
    print(f"   [OK] Trovati {len(clusters_L5)} Radici Universali L5.\n")
    
    id_to_L5 = {}
    for l5_id, l4_nodes in enumerate(clusters_L5):
        for l4_node in l4_nodes:
            id_to_L5[l4_node] = l5_id

    print("13. Marcatura Quarantena NSFW dei cluster...")
    cluster_nsfw_flags = {}
    for c_id, nodes in enumerate(clusters):
        is_nsfw = any(is_node_nsfw[n] for n in nodes)
        cluster_nsfw_flags[str(c_id)] = bool(is_nsfw)
        
    print("14. Strutturazione JSON Gerarchico...")
    
    kw_to_L1 = {kw: f"c_{id_to_cluster[kw_to_id[kw]]}" for kw in valid_keywords}
    
    # L1 dict
    L1_dict = {}
    for c_id, nodes in enumerate(clusters):
        l2_parent = id_to_L2[c_id]
        L1_dict[f"c_{c_id}"] = {
            "keywords": [id_to_kw[n] for n in nodes],
            "parent": f"t_{l2_parent}",
            "is_nsfw": cluster_nsfw_flags[str(c_id)]
        }
        
    # L2 dict
    L2_dict = {}
    for l2_id, l1_nodes in enumerate(clusters_L2):
        l3_parent = id_to_L3[l2_id]
        l2_kws = []
        for l1 in l1_nodes:
            l2_kws.extend([id_to_kw[n] for n in clusters[l1]])
        
        counts = Counter(l2_kws)
        top_kws = [k for k,v in counts.most_common(20)]
        
        L2_dict[f"t_{l2_id}"] = {
            "top_keywords": top_kws,
            "children_L1": [f"c_{l1}" for l1 in l1_nodes],
            "parent": f"v_{l3_parent}"
        }
        
    # L3 dict
    L3_dict = {}
    for l3_id, l2_nodes in enumerate(clusters_L3):
        l4_parent = id_to_L4[l3_id]
        l3_kws = []
        for l2 in l2_nodes:
            for l1 in clusters_L2[l2]:
                l3_kws.extend([id_to_kw[n] for n in clusters[l1]])
                
        counts = Counter(l3_kws)
        top_kws = [k for k,v in counts.most_common(25)]
        
        L3_dict[f"v_{l3_id}"] = {
            "top_keywords": top_kws,
            "children_L2": [f"t_{l2}" for l2 in l2_nodes],
            "parent": f"m_{l4_parent}"
        }

    # L4 dict
    L4_dict = {}
    for l4_id, l3_nodes in enumerate(clusters_L4):
        l5_parent = id_to_L5[l4_id]
        l4_kws = []
        for l3 in l3_nodes:
            for l2 in clusters_L3[l3]:
                for l1 in clusters_L2[l2]:
                    l4_kws.extend([id_to_kw[n] for n in clusters[l1]])
                    
        counts = Counter(l4_kws)
        top_kws = [k for k,v in counts.most_common(30)]
        
        L4_dict[f"m_{l4_id}"] = {
            "top_keywords": top_kws,
            "children_L3": [f"v_{l3}" for l3 in l3_nodes],
            "parent": f"r_{l5_parent}"
        }

    # L5 dict
    L5_dict = {}
    for l5_id, l4_nodes in enumerate(clusters_L5):
        l5_kws = []
        for l4 in l4_nodes:
            for l3 in clusters_L4[l4]:
                for l2 in clusters_L3[l3]:
                    for l1 in clusters_L2[l2]:
                        l5_kws.extend([id_to_kw[n] for n in clusters[l1]])
                        
        counts = Counter(l5_kws)
        top_kws = [k for k,v in counts.most_common(35)]
        
        L5_dict[f"r_{l5_id}"] = {
            "top_keywords": top_kws,
            "children_L4": [f"m_{l4}" for l4 in l4_nodes]
        }
        
    output_data = {
        "metadata": {
            "version": "2.0",
            "total_keywords": len(valid_keywords),
            "L1_count": len(clusters),
            "L2_count": len(clusters_L2),
            "L3_count": len(clusters_L3),
            "L4_count": len(clusters_L4),
            "L5_count": len(clusters_L5)
        },
        "kw_to_L1": kw_to_L1,
        "L1": L1_dict,
        "L1_adjacency": final_adjacency_l1,
        "L2": L2_dict,
        "L3": L3_dict,
        "L4": L4_dict,
        "L5": L5_dict
    }
    
    print("\n15. Esportazione JSON finale...")
    OUTPUT_JSON = '../src/data/hierarchical_graph.json'
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False)
        
    print(f"[DONE] Finito! Il grafo gerarchico offline è stato generato e salvato in: {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
