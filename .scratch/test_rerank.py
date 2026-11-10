import sys
sys.path.insert(0, 'services')
import numpy as np
from graph import canon as K
from graph.runtime import Engine
sys.path.insert(0, '.scratch')
from test_axes import raw_tono, raw_complessita

e = Engine.carica_transizione()

# Let's test on warnok
keys, _, plays, eta = K.storia_trakt("warnok", ordine="recente")
semi = [{"key": str(k), "plays": float(p), "eta_giorni": float(et)} for k, p, et in zip(keys, plays, eta)]

# Baseline raccomanda (top 60)
base_recs = e.raccomanda(semi, cap=100)
base_keys = [r["key"] for r in base_recs]
base_top20 = base_keys[:20]

meta = K.metadati()
titoli_str = meta['TIT']

print(f"Base top 20 for warnok:")
for idx, k in enumerate(base_top20, 1):
    r = e.row_of[k]
    print(f"  {idx:2d}. {titoli_str[r]:<35} | tono: {raw_tono[r]:+5.2f} | comp: {raw_complessita[r]:+5.2f} | score: {base_recs[idx-1]['punteggio']:.6f}")

# Test re-ranking with different gammas for tono = -1.0, +1.0
for gamma in [0.5, 1.0, 1.5, 2.0]:
    print(f"\n================ GAMMA = {gamma} ================")
    for slider_val, slider_name in [(-1.0, "TONO -1.0 (LEGGERO)"), (+1.0, "TONO +1.0 (CUPO)"),
                                   (-1.0, "COMP -1.0 (LINEARE)"), (+1.0, "COMP +1.0 (ESIGENTE)")]:
        is_tono = "TONO" in slider_name
        axis = raw_tono if is_tono else raw_complessita
        target = slider_val
        
        # Apply re-ranking to all candidates before cutting to top 20
        # In PPR raccomanda, cand has raw scores r[x]
        re_ranked = []
        for it in base_recs:
            r = e.row_of[it["key"]]
            val = axis[r]
            dist = abs(val - target)
            penalty = np.exp(-gamma * abs(target) * dist)
            re_score = it["punteggio"] * penalty
            re_ranked.append((it["key"], re_score, it["punteggio"], val))
            
        re_ranked.sort(key=lambda x: -x[1])
        new_top20 = [x[0] for x in re_ranked[:20]]
        
        survived = set(base_top20) & set(new_top20)
        entering = [x for x in new_top20 if x not in base_top20]
        leaving = [x for x in base_top20 if x not in new_top20]
        
        print(f"\n--- {slider_name} ---")
        print(f"  Survived in top 20: {len(survived)}/20 (overlap {len(survived)/20*100:.0f}%)")
        print(f"  Leaving (3 ex): {[titoli_str[e.row_of[k]] for k in leaving[:3]]}")
        print(f"  Entering (3 ex): {[titoli_str[e.row_of[k]] for k in entering[:3]]}")
