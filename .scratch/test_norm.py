import sys
sys.path.insert(0, 'services')
import json
import numpy as np
import pandas as pd
from graph import canon as K

keys, row_of, N, is_tv = K.titoli()
meta = K.metadati()
titoli_str = meta['TIT']

# Load test_axes logic with normalization
from graph import canon as K
sys.path.insert(0, '.scratch')
from test_axes import (
    TONO_CUPO_KEYWORDS, TONO_LEGGERO_KEYWORDS,
    COMPLESSITA_ESIGENTE_KEYWORDS, COMPLESSITA_LINEARE_KEYWORDS,
    m_data, tv_data
)

for divisor_mode in ['raw', 'sqrt', 'log']:
    scores_comp = np.zeros(N, dtype=np.float32)
    scores_tono = np.zeros(N, dtype=np.float32)
    
    for i, k in enumerate(keys):
        is_series = is_tv[i]
        tid = int(k.split(':')[1])
        item = tv_data.get(tid) if is_series else m_data.get(tid)
        if not item:
            continue
        kws = item['keywords']
        n_k = len(kws)
        
        c_score = sum(TONO_CUPO_KEYWORDS.get(w, 0.0) for w in kws)
        l_score = sum(TONO_LEGGERO_KEYWORDS.get(w, 0.0) for w in kws)
        
        e_score = sum(COMPLESSITA_ESIGENTE_KEYWORDS.get(w, 0.0) for w in kws)
        lin_score = sum(COMPLESSITA_LINEARE_KEYWORDS.get(w, 0.0) for w in kws)
        
        if divisor_mode == 'sqrt':
            norm = np.sqrt(max(n_k, 1))
            c_score /= norm
            l_score /= norm
            e_score /= norm
            lin_score /= norm
        elif divisor_mode == 'log':
            norm = np.log2(n_k + 2)
            c_score /= norm
            l_score /= norm
            e_score /= norm
            lin_score /= norm
            
        # Runtime
        if not is_series:
            rt = item['runtime']
            if rt >= 160: e_score += 0.5
            elif rt >= 135: e_score += 0.25
            elif rt < 85: lin_score += 0.3
            
        va = item['vote_average']
        if va >= 8.2: e_score += 0.2
        elif va < 5.8: lin_score += 0.2
            
        scores_tono[i] = np.tanh((c_score - l_score) / (1.5 if divisor_mode != 'raw' else 3.0))
        scores_comp[i] = np.tanh((e_score - lin_score) / (1.5 if divisor_mode != 'raw' else 3.0))

    print(f"\n================ Mode: {divisor_mode} ================")
    for title, key in [('The Bear', 'tv:136315'), ('Cars', 'movie:920'), ('Barry Lyndon', 'movie:3175'),
                       ('The Transporter', 'movie:4108'), ('Parasite', 'movie:496243'), ('Designated Survivor', 'tv:67026')]:
        r = row_of[key]
        print(f"  {title:<22}: Tono={scores_tono[r]:+6.3f} | Comp={scores_comp[r]:+6.3f}")
        
    print("  Top 5 Esigenti:")
    for idx in np.argsort(-scores_comp)[:5]:
        print(f"    {titoli_str[idx]:<35} (comp: {scores_comp[idx]:+6.3f})")
