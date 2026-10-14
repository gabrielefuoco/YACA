"""820b-vicini.py — i vicini della bolla 820: sono altri 'canoni' o rumore?

Se la 820 e' il canone del thriller psicologico (l'utente ha ragione, i numeri lo confermano), i suoi
vicini sulla mappa devono essere **altri canoni**: i film popolari E rispettabili di altri mondi.
Se invece fossero bolle a caso, la tesi vacillerebbe.

E' l'ultimo controllo, e chiude la questione aperta dal ticket 05 di `mappa-pesata`.
"""
import json
import pathlib
import sys

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

B0 = 820
mem = np.load(K.ML / "bolle-nitrile-V8.npy")
sz = np.bincount(mem)
PQ = pathlib.Path(".cache/tmdb")
TIT = np.array([""] * len(mem), dtype=object)
VOT = np.zeros(len(mem))
ANNO = np.array([0] * len(mem))
for typ, f, col, coldata in (("movie", "movies.parquet", "title", "release_date"),
                             ("tv", "tv.parquet", "name", "first_air_date")):
    d = pd.read_parquet(PQ / f, columns=["id", col, "vote_count", coldata])
    for r in d.itertuples(index=False):
        dd = r._asdict()
        i = B.ROW_OF.get(f"{typ}:{int(dd['id'])}")
        if i is None:
            continue
        TIT[i] = str(dd.get(col) or "")
        VOT[i] = dd.get("vote_count") or 0
        a = str(dd.get(coldata) or "")[:4]
        ANNO[i] = int(a) if a.isdigit() else 0

q = np.load(K.ML / "bolle-nitrile-V8-triangolo.npz")
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(len(mem),) * 2)
Ws = (Ws + Ws.T).tocsr()
S1 = sp.csr_matrix((np.ones(len(mem), np.float32), (np.arange(len(mem)), mem)),
                   shape=(len(mem), len(sz)))
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()


def profilo(b, k=5):
    m_ = np.where(mem == b)[0]
    v = np.median([VOT[x] for x in m_]) if len(m_) else 0
    a = int(np.median([ANNO[x] for x in m_ if ANNO[x] > 0])) if len(m_) else 0
    return v, a, [TIT[x][:24] for x in m_[:k]]


print("=" * 100)
print(f"I VICINI DELLA BOLLA {B0} SULLA MAPPA")
print("=" * 100)
v0, a0, _ = profilo(B0)
print(f"  la 820: {int(sz[B0])} titoli · voti mediani {int(v0):,} · anno mediano {a0}")
riga = BB.getrow(B0)
o = np.argsort(-riga.data)[:10]
for t in o:
    j = int(riga.indices[t])
    v, a, nomi = profilo(j)
    print(f"\n  bolla {j:>4} (peso {float(riga.data[t]):8.1f}) · {int(sz[j])} titoli · "
          f"voti mediani {int(v):>7,} · anno {a}")
    print(f"     {nomi}")

# quanti dei vicini hanno una mediana di voti alta come la 820?
alte = []
for t in o:
    j = int(riga.indices[t])
    v, _, _ = profilo(j)
    alte.append(v)
print(f"\n  voti mediani dei dieci vicini: {[int(x) for x in alte]}")
print(f"  la mediana dei vicini e' {int(np.median(alte)):,} contro {int(v0):,} della 820: "
      f"{'vicini di pari peso mediatico' if np.median(alte) > v0/3 else 'vicini piu piccoli'}")

# e i termini dei vicini: sono temi o 'film famosi'?
SUM = sp.load_npz(K.ML / "05-centroidi.npz").tocsr()
META = np.load(K.ML / "05-centroidi-meta.npz")
TUTTE = np.concatenate([META["bolle_serie"], META["bolle_film"]])
pos = {int(b): k for k, b in enumerate(TUTTE)}
vocab = json.load(open(K.ML / "05-vocab.json", encoding="utf-8"))
inv = {i: t for t, i in vocab.items()}
print("\n" + "=" * 100)
print("E I TERMINI DEI VICINI — temi o 'film famosi'?")
print("=" * 100)
for t in o[:6]:
    j = int(riga.indices[t])
    k = pos.get(j)
    if k is None:
        print(f"  bolla {j}: fuori dai centroidi (sotto i 5 titoli)")
        continue
    v = SUM[k].toarray().ravel()
    tem = [inv[int(x)] for x in np.argsort(-v)[:40]
           if v[x] > 0 and inv[int(x)][:3] in ("kw:", "ge:")][:8]
    print(f"  bolla {j:>4}: {' · '.join(tem)}")
print(f"\n  e la {B0} per confronto: "
      f"{' · '.join([inv[int(x)] for x in np.argsort(-SUM[pos[B0]].toarray().ravel())[:40] if SUM[pos[B0]].toarray().ravel()[x] > 0 and inv[int(x)][:3] in ('kw:','ge:')][:8])}")
