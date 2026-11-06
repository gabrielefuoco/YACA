import sys
sys.path.extend(['services', '.scratch/v45-raccomandazioni-yaca/prototipo'])
from pathlib import Path
from collections import Counter
import json
import numpy as np
import scipy.sparse as sp

from graph import canon as K
from graph import provenance as _PV
from graph.runtime import Engine
from graph.build import data as D
from cluster import clusterizza_semi
from macro import aggrega_macro_cluster_tau, split_until_M
from tassonomia import TASSONOMIA_36, assegna_etichetta_cluster

engine = Engine.carica_transizione(pota=16)
meta = K.metadati()
u = 'castoffcrown'
k, righe, plays, eta = K.storia_trakt(u, ordine='recente')

M_tri, _ = _PV.leggi(Path("services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz"))
W = (M_tri + M_tri.T).tocsr()
del M_tri

wider_bags = {}
for r in sorted(list(set(righe))):
    s, e = W.indptr[r], W.indptr[r+1]
    cols = W.indices[s:e]
    vals = W.data[s:e]
    if len(cols) <= 100:
        wider_bags[r] = [(int(c), float(v)) for c, v in zip(cols, vals)]
    else:
        top_idx = np.argpartition(-vals, 100)[:100]
        wider_bags[r] = [(int(cols[j]), float(vals[j])) for j in top_idx]
del W

n = len(righe)
rows, cols, data = [], [], []
for i, r in enumerate(righe):
    for c, v in wider_bags[int(r)]:
        rows.append(i); cols.append(c); data.append(v)
B = sp.csr_matrix((data, (rows, cols)), shape=(n, 76497), dtype=np.float32)
norms = np.array(np.sqrt(B.multiply(B).sum(axis=1))).ravel()
norms[norms == 0] = 1.0
B_norm = sp.diags(1.0 / norms) @ B
S = (B_norm @ B_norm.T).toarray()
np.fill_diagonal(S, 1.0)
S = np.clip(S, 0.0, 1.0)

micros, _, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
unconstrained = aggrega_macro_cluster_tau(engine, righe, micros, tau=0.03)

V = D.vocab()
kw_items = [(t.split(":", 1)[1], c) for t, c in V.items() if t.startswith("kw:")]
kw_names = [x[0] for x in kw_items]
kw_cols = [x[1] for x in kw_items]
X = D.tfidf()
X_kw = X[:, kw_cols].tocsr()

def get_member_kws(r: int) -> set[str]:
    s, e = X_kw.indptr[r], X_kw.indptr[r+1]
    cols = X_kw.indices[s:e]
    return set(kw_names[c] for c in cols if kw_names[c] not in {'duringcreditsstinger', 'aftercreditsstinger'})

for M in [30, 20, 12, 8]:
    print(f"\n====================== M = {M} ======================")
    bounded = []
    for m in unconstrained:
        if len(m) <= M:
            bounded.append(m)
        else:
            pieces = split_until_M(engine, righe, m, M)
            bounded.extend(pieces)
            
    split_bounded = []
    for m in bounded:
        if len(m) < 3:
            best_idx = max(m, key=lambda idx: (plays[idx], -eta[idx]))
            med_type = "series" if k[best_idx].startswith("tv:") else "movie"
            split_bounded.append((m, med_type, True))
        else:
            media_list = ["series" if k[idx].startswith("tv:") else "movie" for idx in m]
            if len(set(media_list)) > 1:
                for med_type in ("series", "movie"):
                    sub_m = [idx for idx in m if ("series" if k[idx].startswith("tv:") else "movie") == med_type]
                    if len(sub_m) >= 2:
                        split_bounded.append((sub_m, med_type, False))
            else:
                split_bounded.append((m, media_list[0], False))
                
    for m_idx, (m, med_type, is_piccolo) in enumerate(split_bounded):
        titles = [str(meta['TIT'][righe[idx]]) for idx in m]
        has_er = any('E.R.' in t for t in titles)
        has_philly = any('Philadelphia' in t for t in titles)
        has_shameless = any('Shameless' in t for t in titles)
        if has_er or has_philly or has_shameless:
            sz = len(m)
            m_rows = [righe[idx] for idx in m]
            anime_pct = float(meta['ANIME'][m_rows].mean())
            m_sorted = sorted(m, key=lambda idx: (-plays[idx], eta[idx]))
            repr_seeds = [str(meta["TIT"][righe[idx]]) for idx in m_sorted[:3]]
            cluster_evidence = {
                "size": sz,
                "medium": med_type,
                "anime_pct": anime_pct,
                "adult_pct": float(meta['ADULTO'][m_rows].mean()),
                "member_kws": [get_member_kws(r) for r in m_rows],
                "repr_seeds": repr_seeds,
                "is_piccolo": is_piccolo,
            }
            nome_base, nome_fonte, conf, matched_entry = assegna_etichetta_cluster(cluster_evidence)
            
            semi_rac = [
                {
                    "tmdbId": int(k[idx].split(":")[1]),
                    "medium": "series" if k[idx].startswith("tv:") else "movie",
                    "tipo": "watched",
                    "peso": 1.0,
                }
                for idx in m
            ]
            racs = engine.raccomanda(semi_rac, cap=5, medium=med_type, esclusi=k)
            cands = [
                f"{meta['TIT'][engine.row_of[r['key']]]} ({int(meta['ANNO'][engine.row_of[r['key']]])})"
                for r in racs[:5]
            ]
            print(f"Piece {m_idx} (sz={sz}, med={med_type}): Label='{nome_base}' [{nome_fonte}, conf={conf:.2f}]")
            print(f"  Seeds ({len(titles)}): {titles}")
            print(f"  Candidates: {cands}")
