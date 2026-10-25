"""Quanto costa (e quanto rumore porta) alzare la potatura da top-16 a top-20/25/30.

Misura, sul triangolo V10:
  · archi tenuti e costo della camminata (archi pieni / archi potati)
  · quota del peso del grafo potato che cade su archi DENTRO la stessa bolla e sulle SAGHE
    (stessa collezione TMDB); il valore del grafo pieno e' il termine di paragone
  · per i 6 titoli della sonda, precisione@k secondo la lettura di `05-lettura.py`
  · quanti archi restano per riga applicando una soglia relativa (1%/0,5%/0,1% del massimo di riga)
"""
import json
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "services" / "graph" / "data"

z = np.load(DATA / "spazi-trakt.npz", allow_pickle=True)
keys = [f"{t}:{int(i)}" for t, i in zip(z["tipo"], z["tmdb"])]
N = len(keys)
meta = np.load(DATA / "metadati-canone.npz")
COLL = meta["COLL"]
b = json.load(open(DATA / "bolle.json", encoding="latin-1"))
bid = np.array([b["titoli"][k] for k in keys])

T = np.load(DATA / "bolle-eterogeneo-V10-p1.0-triangolo.npz")
W = sp.csr_matrix((T["data"], T["indices"], T["indptr"]), shape=(N, N))  # triangolo
S = (W + W.T).tocsr()
FULL = S.nnz

# quote del grafo PIENO (sul triangolo, una volta per arco)
co = W.tocoo()
sb = bid[co.row] == bid[co.col]
sc = (COLL[co.row] == COLL[co.col]) & (COLL[co.row] > 0)
tot = W.data.sum()
print(f"grafo pieno: {FULL:,} archi, peso {tot:.1f}, grado medio {FULL/N:.1f}")
print(f"  quota peso intra-bolla {100*W.data[sb].sum()/tot:4.1f}% · saga {100*W.data[sc].sum()/tot:4.1f}%")

KS = [8, 12, 16, 20, 25, 30, 40, 48]
print(f"\n{'k':>3} {'archi':>10} {'% pieno':>7} {'costo':>6} {'intra-bolla':>11} {'saga':>6} {'peso/arco':>9}")
for k in KS:
    rows, cols, vals = [], [], []
    for i in range(N):
        lo, hi = S.indptr[i], S.indptr[i + 1]
        idx, v = S.indices[lo:hi], S.data[lo:hi]
        if len(idx) > k:
            o = np.argpartition(-v, k)[:k]
            idx, v = idx[o], v[o]
        rows.append(np.full(len(idx), i, np.int32))
        cols.append(idx.astype(np.int32))
        vals.append(v)
    D = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(N, N))
    P = (D + D.T).tocsr()
    co = P.tocoo()
    same_b = bid[co.row] == bid[co.col]
    same_c = (COLL[co.row] == COLL[co.col]) & (COLL[co.row] > 0)
    ps = float(P.data.sum())
    print(f"{k:3d} {P.nnz:10,} {100*P.nnz/FULL:6.1f}% {FULL/P.nnz:5.1f}x "
          f"{100*P.data[same_b].sum()/ps:10.1f}% {100*P.data[same_c].sum()/ps:5.1f}% "
          f"{ps/P.nnz:9.2f}")

# quanti archi per riga sopra una soglia relativa al massimo della riga
print("\nArchi per riga sopra una soglia relativa (mediana · p90 · totale):")
for th in (0.02, 0.01, 0.005, 0.001):
    per = []
    for i in range(N):
        row = S.getrow(i)
        per.append(int((row.data >= th * row.data.max()).sum()) if row.nnz else 0)
    per = np.array(per)
    print(f"  w >= {100*th:4.1f}% del max: mediana {np.median(per):3.0f} · p90 {np.percentile(per,90):4.0f} · "
          f"totale {per.sum():,}")

# precisione@k dai rank classificati in 05-lettura
sys.path.insert(0, str(Path(__file__).resolve().parent))
import contextlib, io
with contextlib.redirect_stdout(io.StringIO()):
    L = __import__("05-lettura")
print("\nPrecisione@k della lettura a occhio (giusti/k):")
for k, nome in L.NOMI.items():
    w, d = set(L.WRONG[k]), set(L.DUB[k])
    cells = []
    for K in (8, 12, 16, 20, 25, 30, 40, 48):
        good = sum(1 for x in range(1, K + 1) if x not in w and x not in d)
        cells.append(f"{K}:{good}/{K}")
    print(f"  {nome:30s} " + "  ".join(cells))

print("\nMarginale (solo i ranghi nuovi, giusti / dubbi / sbagliati):")
for nome_k, nome in L.NOMI.items():
    w, d = set(L.WRONG[nome_k]), set(L.DUB[nome_k])
    out = []
    for a, b_ in ((1, 16), (17, 20), (21, 25), (26, 30), (31, 40), (41, 48)):
        rng = range(a, b_ + 1)
        good = sum(1 for x in rng if x not in w and x not in d)
        dub = sum(1 for x in rng if x in d)
        bad = sum(1 for x in rng if x in w)
        out.append(f"{a}-{b_}: {good}/{b_-a+1}·{dub}·{bad}")
    print(f"  {nome:30s} " + " | ".join(out))
