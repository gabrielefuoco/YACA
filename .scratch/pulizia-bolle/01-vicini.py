"""I 100 nodi piu' vicini di Spider-Man (2002, movie:557) sul grafo dei suggerimenti.

Definizione di "vicino": il peso dell'arco nel triangolo del grafo (la stessa miscela
di componenti che la camminata usa; qui non c'e' ancora la potatura top-16, che terrebbe
solo i primi 16). Per un seme singolo l'ordine per peso e' identico a quello della riga
di transizione, perche' la normalizzazione di riga e' una costante.

Uso:  ../../offline_graph_builder/venv/Scripts/python.exe 01-vicini.py
"""
import csv
import collections
import json
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "services" / "graph" / "data"
OUT = Path(__file__).resolve().parent

# --- il canone
z = np.load(DATA / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo, year = z["tmdb"], z["tipo"], z["year"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
titoli = np.array((DATA / "titoli-canone.txt").read_text(encoding="utf-8").split("\n"), dtype=object)
meta = np.load(DATA / "metadati-canone.npz")
VOT, VAVE = meta["VOT"].astype(float), meta["VAVE"].astype(float)
BAYES = (VOT * VAVE + 300 * 6.5) / (VOT + 300)

# --- le bolle
bolle = json.load(open(DATA / "bolle.json", encoding="latin-1"))
bolla_di = {k: bolle["titoli"][k] for k in keys}

# --- il grafo (triangolo superiore) reso simmetrico
T = np.load(DATA / "bolle-eterogeneo-V10-p1.0-triangolo.npz")
N = len(keys)
S = sp.csr_matrix((T["data"], T["indices"], T["indptr"]), shape=(N, N))
S = (S + S.T).tocsr()

ROW = 50  # movie:557 Spider-Man (2002)
assert keys[ROW] == "movie:557", keys[ROW]

row = S.getrow(ROW)
order = np.argsort(-row.data)
cols, pesi = row.indices[order], row.data[order]
tot = float(pesi.sum())

righe = []
for rango, (c, w) in enumerate(zip(cols[:100], pesi[:100]), 1):
    bid = bolla_di[keys[int(c)]]
    righe.append({
        "rango": rango,
        "peso": round(float(w), 4),
        "quota_riga_%": round(100 * float(w) / tot, 3),
        "quota_del_max_%": round(100 * float(w) / float(pesi[0]), 3),
        "bolla": bid,
        "bolla_n": bolle["bolle"][str(bid)]["n"],
        "chiave": keys[int(c)],
        "titolo": titoli[int(c)],
        "anno": int(year[int(c)]) if np.isfinite(year[int(c)]) else "",
        "voti": int(VOT[int(c)]),
        "voto": round(float(VAVE[int(c)]), 1),
        "bayes": round(float(BAYES[int(c)]), 2),
    })

with open(OUT / "vicini-spiderman-100.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(righe[0]))
    w.writeheader()
    w.writerows(righe)

print(f"Spider-Man (2002) = {keys[ROW]} · riga {ROW} · grado {row.nnz} · peso totale {tot:.1f}")
print(f"bolla {bolla_di[keys[ROW]]} · {bolle['bolle'][str(bolla_di[keys[ROW]])]['termini']}\n")
print("N | bolle distinte | con >=2 membri | quota peso | ultimo peso | % del max")
for n in (4, 5, 8, 10, 16, 20, 25, 32, 40, 50, 64, 80, 100):
    c = collections.Counter(bolla_di[keys[int(x)]] for x in cols[:n])
    print(f"{n:3d} | {len(c):14d} | {sum(1 for v in c.values() if v >= 2):14d} | "
          f"{100*pesi[:n].sum()/tot:9.1f}% | {pesi[n-1]:11.4f} | {100*pesi[n-1]/pesi[0]:8.3f}%")

print("\nTop 100:")
for x in righe:
    print(f"{x['rango']:3d} | {x['peso']:9.4f} | b{x['bolla']:4d} (n={x['bolla_n']:3d}) | "
          f"{x['chiave']:12s} | {x['titolo']} ({x['anno']}) | vc={x['voti']:5d} va={x['voto']:4.1f}")
