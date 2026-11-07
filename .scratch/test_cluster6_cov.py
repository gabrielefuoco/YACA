"""test_cluster6_cov.py — Test coverage of Cluster 6 with tight_auteur_kws."""
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
c6 = base_eligible[6]

tight_auteur_kws = frozenset({
    "arthouse", "independent film", "criterion collection", "slow cinema",
    "mumblecore", "magic realism", "social commentary", "character study",
    "existentialism", "slice of life", "semi autobiographical", "surrealism",
    "woman director", "philosophical", "neo-noir", "poetry", "fictional biography",
    "meditative", "absurdist", "dark comedy"
})

matches = []
non_matches = []
for idx in c6.seeds_indices:
    r = righe_arr[idx]
    kws = get_kws(r)
    m = kws & tight_auteur_kws
    t = str(titles[r])
    if m: matches.append((t, m))
    else: non_matches.append(t)

print(f"Cluster 6 size: {len(c6.seeds_indices)}")
print(f"Matches: {len(matches)} / {len(c6.seeds_indices)} ({len(matches)/len(c6.seeds_indices)*100:.1f}%)")
print("\nMatches:")
for t, m in matches:
    print(f"  + {t}: {list(m)}")
print("\nNon-matches:")
for t in non_matches:
    print(f"  - {t}")
