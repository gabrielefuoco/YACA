"""inspect_rrr_affinity.py — Inspect affinity of RRR in castoffcrown."""
from __future__ import annotations
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

import numpy as np
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
W = I.carica_matrice_affinita()
meta = K.metadati()
titles = meta.get("TIT")

chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")
righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)

S = I.calcola_sim_affinity(righe_arr, W)
rrr_idx = [i for i, k in enumerate(chiavi) if k == "movie:579974"][0]

sims = [(i, float(S[rrr_idx, i]), chiavi[i], str(titles[righe_arr[i]])) for i in range(len(chiavi)) if i != rrr_idx]
sims.sort(key=lambda x: -x[1])

print(f"Top 20 seeds similar to RRR in castoffcrown:")
for idx, sim, k, t in sims[:20]:
    print(f"  {sim:.4f} | {k:<15} | {t}")
