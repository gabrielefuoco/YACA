"""test_classic_cov_without_vr.py — Test coverage of Classici d'autore without Vacanze romane."""
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
kw_tuple = I._carica_tfidf_keywords()
kw_names, X_kw = kw_tuple if kw_tuple is not None else ([], None)

def get_kws(r_idx):
    if X_kw is None: return set()
    s, e = X_kw.indptr[r_idx], X_kw.indptr[r_idx + 1]
    return set(kw_names[c] for c in X_kw.indices[s:e] if kw_names[c] not in I.NOISE_KEYWORDS)

chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")
righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)
base_eligible = I.clusters(engine, righe_arr, W_aff=W)
c9 = base_eligible[9]

# Tight keywords for Classici d'autore:
tight_classic_kws = frozenset({
    "film noir", "neo realism", "italian neo realism", "french new wave",
    "nouvelle vague", "german expressionism", "expressionism", "new german cinema",
    "new hollywood", "pre-code", "poetic realism", "criterion collection",
    "world war ii", "french resistance", "holocaust (shoah)", "fascism",
    "road movie", "psychological drama", "existentialism"
})

matches = []
non_matches = []
for idx in c9.seeds_indices:
    r = righe_arr[idx]
    t = str(titles[r])
    if t == "Vacanze romane":
        continue
    kws = get_kws(r)
    m = kws & tight_classic_kws
    if m: matches.append((t, m))
    else: non_matches.append(t)

tot_remaining = len(c9.seeds_indices) - 1
print(f"Cluster 9 size without Vacanze romane: {tot_remaining}")
print(f"Matches: {len(matches)} / {tot_remaining} ({len(matches)/tot_remaining*100:.1f}%)")
print("\nMatches:")
for t, m in matches:
    print(f"  + {t}: {list(m)}")
print("\nNon-matches:")
for t in non_matches:
    print(f"  - {t}")
