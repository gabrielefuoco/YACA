"""Sonda: i 100 vicini di alcuni titoli, con bolla e punteggi, per la lettura a occhio."""
import json
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "services" / "graph" / "data"

z = np.load(DATA / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo, year = z["tmdb"], z["tipo"], z["year"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: i for i, k in enumerate(keys)}
titoli = np.array((DATA / "titoli-canone.txt").read_text(encoding="utf-8").split("\n"), dtype=object)
meta = np.load(DATA / "metadati-canone.npz")
VOT, VAVE = meta["VOT"].astype(float), meta["VAVE"].astype(float)
BAYES = (VOT * VAVE + 300 * 6.5) / (VOT + 300)

b = json.load(open(DATA / "bolle.json", encoding="latin-1"))
bolla_di = {k: b["titoli"][k] for k in keys}

T = np.load(DATA / "bolle-eterogeneo-V10-p1.0-triangolo.npz")
N = len(keys)
S = sp.csr_matrix((T["data"], T["indices"], T["indptr"]), shape=(N, N))
S = (S + S.T).tocsr()

TITOLI = [
    ("Spider-Man (2002)", "movie:557"),
    ("Inkheart (2008)", "movie:2309"),
    ("Un ponte per Terabithia (2007)", "movie:1265"),
    ("Inception (2010)", "movie:27205"),
    ("Perfetti sconosciuti (2016)", "movie:381341"),
    ("Breaking Bad (2008)", "tv:1396"),
]
quanti = int(sys.argv[1]) if len(sys.argv) > 1 else 100

tutti = {}
for etichetta, chiave in TITOLI:
    i = row_of[chiave]
    riga = S.getrow(i)
    o = np.argsort(-riga.data)
    cols, pesi = riga.indices[o], riga.data[o]
    tutti[chiave] = set(cols[:quanti].tolist())
    bid = bolla_di[chiave]
    mm = b["bolle"][str(bid)]
    print(f"\n{'='*110}\n{etichetta} — {chiave} · riga {i} · bolla {bid} (n={mm['n']})")
    print(f"  mondo: {', '.join(mm['termini'][:6])} · es. {', '.join(mm['esempi'][:3])}")
    print(f"  grado {riga.nnz} · peso totale {riga.data.sum():.1f} · "
          f"top500 peso {pesi[:500].sum()/riga.data.sum()*100:.1f}%")
    for n in (10, 20, 50, 100):
        if n <= quanti:
            c = set(bolla_di[keys[int(x)]] for x in cols[:n])
            print(f"    top {n:3d}: {len(c):3d} bolle distinte")
    print(f"  {'#':>3} {'peso':>9} {'%max':>6} {'bolla':>5} {'n':>3} {'titolo':<52} {'anno':>4} {'vc':>6} {'va':>4} {'bay':>4}")
    for r, (c, w) in enumerate(zip(cols[:quanti], pesi[:quanti]), 1):
        j = int(c)
        bb = bolla_di[keys[j]]
        print(f"  {r:3d} {w:9.4f} {100*w/pesi[0]:5.1f}% {bb:5d} {b['bolle'][str(bb)]['n']:3d} "
              f"{titoli[j][:52]:<52} {int(year[j]) if np.isfinite(year[j]) else 0:4d} "
              f"{int(VOT[j]):6d} {VAVE[j]:4.1f} {BAYES[j]:4.2f}")

print("\n\nSOVRAPPOSIZIONE fra i top-100 (Jaccard):")
for a in range(len(TITOLI)):
    for c in range(a + 1, len(TITOLI)):
        A, B = tutti[TITOLI[a][1]], tutti[TITOLI[c][1]]
        print(f"  {TITOLI[a][0]:32s} vs {TITOLI[c][0]:32s}: {len(A&B)/len(A|B):.2f} (comuni {len(A&B)})")
