"""boot-4.py — LA GRANULARITA' SBAGLIATA? Il tetto del pool a ogni risoluzione.

Obiezione giusta: i risultati negativi di boot-1/2 sono a risoluzione 3.0 (74 cluster).
Magari a un'altra granularita' il pool contiene il bersaglio molto piu' spesso.

Misuro solo la COPERTURA (frazione di legami veri con il bersaglio nel pool), che e' il
tetto dell'architettura pool+ranking a qualunque N. Il riferimento da battere e' 11,2% @10
e 68,5% @2000: un pool utile deve avere copertura sopra quei valori.

I vicini di contenuto si calcolano UNA volta e si riusano per ogni risoluzione.
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import csr_matrix
import igraph as ig
import leidenalg as la

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"
z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
Q = Pc.astype(np.float64).copy()
Q[~is_tv] -= Pc[~is_tv].mean(0)
Q[is_tv] -= Pc[is_tv].mean(0)
Pcn = Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


def carica(nome):
    q = np.load(ML / nome)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


C, B, Tm, K = carica("boot-C.npz"), carica("boot-B.npz"), carica("boot-T.npz"), carica("boot-Kpari.npz")
Mc = (C + B + Tm + 6.0 * K).tocsr()
Mc.sum_duplicates()
Mc = ((Mc + Mc.T) * 0.5).tocsr()
coo = Mc.tocoo()
msk = coo.row < coo.col
g = ig.Graph(n=n, edges=list(zip(coo.row[msk].tolist(), coo.col[msk].tolist())), directed=False)
g.es["weight"] = coo.data[msk].tolist()
print(f"grafo pronto ({time.time()-t0:.0f}s)")

d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
test = [s for i, s in enumerate(d["sources"]) if i % 2 == 1]
SOGG, BERS = [], []
for s in test:
    a = row_of.get(s["id"])
    if a is None:
        continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None or l["type"] == s["id"].split(":")[0]:
            continue
        SOGG.append(a)
        BERS.append(b)
SOGG, BERS = np.array(SOGG), np.array(BERS)

# i 10 vicini di contenuto, calcolati una volta
KNN = 10
NB = np.empty((n, KNN), np.int32)
t1 = time.time()
for i in range(0, n, 500):
    sim = Pcn[i:i + 500] @ Pcn.T
    for r in range(sim.shape[0]):
        sim[r, i + r] = -9
    NB[i:i + 500] = np.argpartition(-sim, KNN, axis=1)[:, :KNN]
print(f"vicini di contenuto: {time.time()-t1:.0f}s")

print("")
print("=" * 84)
print(f"{'risoluzione':>11} {'cluster':>8} {'coper. L[s]':>12} {'coper. pred':>12} {'in uno dei due':>15}")
print("=" * 84)
for res in (0.5, 1.0, 2.0, 3.0, 5.0, 10.0):
    L = np.array(la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                                   resolution_parameter=res, seed=42).membership)
    pred = np.empty(n, np.int64)
    for u in range(0, n, 20000):
        for r in range(u, min(u + 20000, n)):
            pred[r] = Counter(L[NB[r]].tolist()).most_common(1)[0][0]
    a = 100 * float((L[BERS] == L[SOGG]).mean())
    b = 100 * float((L[BERS] == pred[SOGG]).mean())
    c = 100 * float(((L[BERS] == L[SOGG]) | (L[BERS] == pred[SOGG])).mean())
    print(f"{res:>11} {len(np.bincount(L)):>8} {a:>11.1f}% {b:>11.1f}% {c:>14.1f}%")
print("")
print("  riferimento: spreading puro 11,2% @10 · 68,5% @2000")
print(f"\n({time.time()-t0:.0f}s)")
