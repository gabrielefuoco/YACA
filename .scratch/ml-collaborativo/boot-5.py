"""boot-5.py — POOL + RANKING A OGNI GRANULARITA'. L'ultima obiezione.

boot-4 mostra il trade-off: pool grossi coprono (55,5% a res 0.5) ma non informano,
pool fini informano ma perdono il bersaglio (25,6%).

Qui chiudo il cerchio: pool = cluster della sorgente, ordine = spreading, per ogni
risoluzione. Se al crescere del pool il numero CONVERGE al riferimento (11,2%) senza mai
superarlo, allora non esiste una granularita' giusta: l'architettura non batte la spreading.
"""
import json, pathlib, time
import numpy as np
from scipy.sparse import csr_matrix
import igraph as ig
import leidenalg as la

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"
z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)


def carica(nome):
    q = np.load(ML / nome)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


C, B, Tm, K = carica("boot-C.npz"), carica("boot-B.npz"), carica("boot-T.npz"), carica("boot-Kpari.npz")
WT, WC = 0.25, 0.88
M_r = normalizza((1 - WC) * (1 - WT) * (0.5 * C + 0.5 * B) + (1 - WC) * WT * Tm + WC * K)
Mc = (C + B + Tm + 6.0 * K).tocsr()
Mc.sum_duplicates()
Mc = ((Mc + Mc.T) * 0.5).tocsr()
coo = Mc.tocoo()
msk = coo.row < coo.col
g = ig.Graph(n=n, edges=list(zip(coo.row[msk].tolist(), coo.col[msk].tolist())), directed=False)
g.es["weight"] = coo.data[msk].tolist()

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
US = np.unique(SOGG)
col_of = {int(u): i for i, u in enumerate(US)}
COL = np.array([col_of[int(x)] for x in SOGG])
E = np.zeros((n, len(US)), np.float32)
E[US, np.arange(len(US))] = 1.0

X = E.copy()
for _ in range(20):
    X = 0.7 * (M_r.T @ X) + 0.3 * E
R = np.empty(X.shape, dtype=np.int32)
for j in range(X.shape[1]):
    R[np.argsort(-X[:, j]), j] = np.arange(n)
del X
print(f"spreading pronto ({time.time()-t0:.0f}s)")

NS = (10, 50, 100, 500, 2000)
MOLTO = 10 ** 9
print("")
print("=" * 92)
print(f"{'arma':<40} " + " ".join(f"{('@'+str(N)):>7}" for N in NS))
print("=" * 92)
rk = R[BERS, COL]
print(f"{'A0 spreading puro (RIFERIMENTO)':<40} " + " ".join(f"{100*float((rk<N).mean()):6.1f}%" for N in NS))

# indici raggruppati per sorgente
bers_di = {}
for i, s in enumerate(SOGG):
    bers_di.setdefault(int(s), []).append(i)

for res in (0.5, 1.0, 2.0, 3.0):
    L = np.array(la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                                   resolution_parameter=res, seed=42).membership)
    mis = np.full(len(BERS), MOLTO, np.int64)
    for s, posizioni in bers_di.items():
        rank = R[:, col_of[s]]
        pool = (L == L[s])
        for pos in posizioni:
            b = BERS[pos]
            if pool[b]:
                mis[pos] = int(rank[b])
    nome = f"A7 pool=L[s] ris {res} ({len(np.bincount(L))} cluster)"
    print(f"{nome:<40} " + " ".join(f"{100*float((mis<N).mean()):6.1f}%" for N in NS))
print(f"\n({time.time()-t0:.0f}s)")
