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
from collections import defaultdict, Counter
from tqdm import tqdm

CACHE_DIR = 'cache'
MIN_KEYWORD_FREQ = 15
ALPHA = 0.4
TOP_K_EDGES_PER_NODE = 10
LEIDEN_RESOLUTION = 150.0

CACHE_KWS = os.path.join(CACHE_DIR, f'kws_f{MIN_KEYWORD_FREQ}.pkl')
CACHE_PPMI = os.path.join(CACHE_DIR, f'ppmi_f{MIN_KEYWORD_FREQ}.npz')
CACHE_EMB = os.path.join(CACHE_DIR, f'emb_f{MIN_KEYWORD_FREQ}.npy')
CACHE_COSINE = os.path.join(CACHE_DIR, f'cosine_f{MIN_KEYWORD_FREQ}_t0.75.npz')

BAD_KEYWORDS = [
    'rape', 'gang rape', 'statutory rape', 'male rape', 'rape and revenge', 'rape attempt',
    'sexual abuse', 'child abuse', 'child sexual abuse', 'sexual assault', 'sexual violence', 
    'sexual harassment', 'sexual torture', 'sexual predator', 'sexual murder', 'incest', 
    'mother son incest', 'father daughter incest', 'brother sister incest', 'pedophilia', 'pedophile',
    'pornography', 'porn', 'child pornography', 'internet porn', 'hardcore', 'hardcore porn',
    'softcore', 'softcore porn', 'sex tape', 'snuff', 'snuff film', 'bestiality', 'necrophilia',
    'child prostitution', 'forced prostitution', 'illegal prostitution', 'prostitution', 'sex slavery',
    'sex trafficking', 'sexploitation', 'roman porno', 'pink eiga',
    'torture porn', 'video nasty', 'snuff movie', 'sadism', 'masochism', 'sadomasochism', 
    'sadistic', 'extreme violence', 'dismemberment', 'castration', 'emasculation', 'mutilation',
    'evisceration', 'blood splatter', 'gore', 'splatter', 'school shooting', 'mass shooting',
    'animal abuse', 'animal cruelty',
    'sex toy', 'bdsm', 'bondage', 'fetish', 'nymphomaniac', 'orgasm', 'masturbation', 
    'voyeurism', 'peeping tom', 'swingers', 'cuckold', 'brothel', 'strip club', 'stripper'
]

def main():
    print("[START] Estrazione Keyword NSFW tramite Grafo Fittizio...")

    # 1. Caricamento Cache
    with open(CACHE_KWS, 'rb') as f:
        valid_keywords, kw_to_id, id_to_kw = pickle.load(f)
    N = len(valid_keywords)
    PPMI_matrix = sp.load_npz(CACHE_PPMI)
    Cosine_matrix = sp.load_npz(CACHE_COSINE)

    # 2. Fusione Matrici (Standard)
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

    # 3. Isolamento NSFW Assoluto (Grafo Fittizio)
    # Creiamo una RegEx con tutti i trigger
    nsfw_pattern = re.compile(r'\b(' + '|'.join([re.escape(w) for w in BAD_KEYWORDS]) + r')\b', re.IGNORECASE)
    
    # Includiamo anche la vecchia regex di base di rebuild_graph per sicurezza
    base_nsfw = re.compile(r'\b(sex|sexy|sexual|sexuality|porn\w*|eroti\w*|nude|nudity|rape|incest|masturbat\w*|vibrator|dildo|bdsm|fetish\w*|orgasm|3p|4p|sexually broken|pinku eiga|av idol|hentai|ero|エロ|辱め)\b', re.IGNORECASE)

    is_node_nsfw = np.zeros(N, dtype=bool)
    for i in range(N):
        kw = id_to_kw[i]
        if nsfw_pattern.search(kw) or base_nsfw.search(kw):
            is_node_nsfw[i] = True

    cx_fused = Fused_matrix.tocoo()
    # RIMUOVIAMO GLI ARCHI TRA SANE E MALATE
    keep_mask = is_node_nsfw[cx_fused.row] == is_node_nsfw[cx_fused.col]
    cx_fused.data[~keep_mask] = 0
    Fused_matrix = cx_fused.tocsr()
    Fused_matrix.eliminate_zeros()

    # 4. Clustering su Grafo Fittizio
    cx_fused = Fused_matrix.tocoo()
    ig_G = ig.Graph(n=N, edges=list(zip(cx_fused.row, cx_fused.col)), directed=False)
    partition = leidenalg.find_partition(ig_G, leidenalg.RBConfigurationVertexPartition, weights=cx_fused.data, resolution_parameter=150.0)
    clusters = list(partition)

    # 5. Estrazione delle keyword
    extracted_nsfw_keywords = []
    
    for c_id, nodes in enumerate(clusters):
        # Se il cluster contiene almeno un nodo NSFW, allora l'intero cluster è NSFW
        # (visto che abbiamo rimosso gli archi SFW-NSFW, questo cluster conterrò SOLO roba NSFW
        # o roba che era così fortemente legata a NSFW da esserci finita dentro comunque).
        is_nsfw = any(is_node_nsfw[n] for n in nodes)
        if is_nsfw:
            for n in nodes:
                extracted_nsfw_keywords.append(id_to_kw[n])

    extracted_nsfw_keywords = list(set(extracted_nsfw_keywords))
    extracted_nsfw_keywords.sort()

    out_file = '../scripts/extracted_nsfw_keywords.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(extracted_nsfw_keywords, f, ensure_ascii=False, indent=2)

    print(f"[DONE] Estrazione completata! {len(extracted_nsfw_keywords)} keyword NSFW trovate.")
    print(f"Salvato in {out_file}")

if __name__ == "__main__":
    main()
