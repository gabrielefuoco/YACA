"""test_bisection_or_exclusion.py — Test what happens when auteur excludes RRR / Roman Holiday."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

import numpy as np
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
import graph.tassonomia as T

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
W = I.carica_matrice_affinita()
meta = K.metadati()
titles = meta.get("TIT")
years = meta.get("ANNO")
extra_info = I._carica_tmdb_extra()

chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")
righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)

S = I.calcola_sim_affinity(righe_arr, W)
micros, _ = I.micro_clustering(S, min_affinity=0.02)
raw_macros = I.macro_merge(engine, righe_arr, micros, tau=0.03)

print("Macro 2 (which had RRR):")
mac2 = raw_macros[2]
tits2 = [str(titles[righe_arr[i]]) for i in mac2]
print(f"Size: {len(mac2)}, contains RRR: {'RRR' in tits2}")

# What happens if we bisect Macro 2?
c1, c2 = I.bisect_cluster(engine, righe_arr, mac2)
t1 = [str(titles[righe_arr[i]]) for i in c1]
t2 = [str(titles[righe_arr[i]]) for i in c2]
print(f"\nBisection of Macro 2:")
print(f"C1 (sz={len(c1)}): {t1}")
print(f"C2 (sz={len(c2)}): {t2}")
