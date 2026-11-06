import sys
sys.path.extend(["services", ".scratch/v45-raccomandazioni-yaca/prototipo"])
import pickle
from collections import Counter
from pathlib import Path
from graph import canon as K
from graph.runtime import Engine
from cluster import clusterizza_semi
from macro import bounded_macros_for_profile
from dieci_storie import carica_wider_bags, calcola_sim_wider

engine = Engine.carica_transizione(pota=16)
PROFILI_10 = [
    ("sangam456", "Corto storico (10 semi)", "Campione originale"),
    ("hammers-lists", "Corto storico (11 semi)", "Campione originale"),
    ("sappss", "Medio-basso storico (25 semi)", "Campione originale"),
    ("flixinatoor99", "Medio storico (32 semi)", "Campione originale"),
    ("moppierhead", "Medio storico (38 semi)", "Campione originale"),
    ("castoffcrown", "Lungo storico (412 semi)", "Campione originale"),
    ("warnok", "Lungo storico (476 semi)", "Campione originale"),
    ("pepsipex", "Massimo storico (568 semi)", "Campione originale"),
    ("carverclan", "Ultra-corto (<10 semi, 7 semi)", "Gap Ultra-Cold Start"),
    ("1jacobjohn", "Intermedio (167 semi)", "Gap Utente Medio Attivo (100-300 semi)"),
]

storie = {}
for u, _, _ in PROFILI_10:
    k, righe, plays, eta = K.storia_trakt(u, ordine="recente")
    storie[u] = (k, righe, plays, eta)

all_righe = sorted(list({r for u in storie for r in storie[u][1]}))
wider_bags = carica_wider_bags(all_righe, Path("services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz"))

print("=== RAW BOUNDED INSPECTION ===")
for u, _, _ in PROFILI_10:
    k, righe, plays, eta = storie[u]
    S = calcola_sim_wider(righe, wider_bags)
    micros, _, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
    bounded = bounded_macros_for_profile(engine, righe, micros, M=12, tau=0.03)
    
    # Analyze raw bounded
    raw_lt3 = 0
    raw_ge3_pure = 0
    raw_ge3_mixed = 0
    mixed_details = []
    for idx, m in enumerate(bounded):
        sz = len(m)
        meds = ['series' if k[i].startswith('tv:') else 'movie' for i in m]
        ctr = Counter(meds)
        if sz < 3:
            raw_lt3 += 1
        elif len(ctr) > 1:
            raw_ge3_mixed += 1
            mixed_details.append((sz, dict(ctr)))
        else:
            raw_ge3_pure += 1
    print(f"{u:15s}: raw_total={len(bounded)} | <3: {raw_lt3} | >=3 pure: {raw_ge3_pure} | >=3 mixed: {raw_ge3_mixed} ({mixed_details})")
