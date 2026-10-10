"""seed-espanso.py — IL MECCANISMO DELLA GENERALIZZAZIONE, reso esplicito.
Il test e' gia' un cold-start: le sorgenti pari non hanno i loro archi di curatela nel grafo.
Entrano solo via contenuto e comportamento. Qui si prova a dare loro anche i VICINI come seme:
seed = sorgente + lambda_c * vicini di contenuto + lambda_b * vicini di comportamento."""
import json, pathlib
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
from sklearn.decomposition import TruncatedSVD
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
G = ROOT/".scratch"/"ml-collaborativo"/"gold"
d = json.loads((G/"cross-merged.json").read_text(encoding="utf-8"))
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}; n = len(keys)
is_tv = (tipo == "tv")
def centra(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0); Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
Pc2 = centra(Pc)
src = d["sources"]
train = [s for i, s in enumerate(src) if i % 2 == 0]
test  = [s for i, s in enumerate(src) if i % 2 == 1]
def normalizza(A):
    A = A.tocsr(); s = np.asarray(A.sum(1)).ravel(); s[s == 0] = 1
    return csr_matrix(A.multiply(1.0/s[:, None]))
def knn_edges(V, k):
    Vn = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
    rows, cols, vals = [], [], []; B = 4000
    for i in range(0, n, B):
        sim = Vn[i:i+B] @ Vn.T
        for r in range(sim.shape[0]): sim[r, i+r] = -9
        idx = np.argpartition(-sim, k, axis=1)[:, :k]
        w = np.take_along_axis(sim, idx, 1)
        for r in range(sim.shape[0]):
            pos = w[r] > 0
            rows += [i+r]*int(pos.sum()); cols += list(idx[r][pos]); vals += list(w[r][pos])
    return normalizza(coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr())
def archi_trakt():
    rows, cols = [], []; base = pathlib.Path(ROOT/".cache"/"trakt")
    for f in list(base.glob("rel-movie-*.json")) + list(base.glob("rel-tv-*.json")):
        try: rel = json.loads(f.read_text(encoding="utf-8"))
        except Exception: continue
        if not isinstance(rel, list): continue
        m = f.name.split("-")[1]
        tids = [int(t) for t in ((v.get("ids") or {}).get("tmdb") for v in rel) if t]
        for t in tids:
            r = row_of.get(f"{m}:{t}")
            if r is None: continue
            for t2 in tids:
                if t2 == t: continue
                r2 = row_of.get(f"{m}:{t2}")
                if r2 is not None: rows.append(r); cols.append(r2)
    return normalizza(coo_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(n, n)).tocsr())
def archi_curatela(sorgenti):
    rows, cols, vals = [], [], []
    for s in sorgenti:
        a = row_of.get(s["id"])
        if a is None: continue
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None: continue
            rows += [a, b]; cols += [b, a]; vals += [float(l.get("w", 1))]*2
    return normalizza(coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr())
Mk = knn_edges(Pc2, 15); Mb = archi_trakt(); Mc = archi_curatela(train)
zt = np.load(ML/"temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n: T = T.T
Mt = knn_edges(T, 15)
M = normalizza((0.04*Mk + 0.04*Mb + 0.04*Mt + 0.88*Mc).tocsr())
A = Mc.copy(); A.data = np.ones_like(A.data)
tot = A.sum(); rs = np.asarray(A.sum(1)).ravel(); cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.maximum(np.log((Co.data*tot)/(rs[Co.row]*cs[Co.col] + 1e-9) + 1e-9) - np.log(10.0), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
E = TruncatedSVD(n_components=256, random_state=0).fit_transform(P).astype(np.float32)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
SOGG = []; BERS = []
for s in test:
    a = row_of.get(s["id"])
    if a is None: continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None or l["type"] == s["id"].split(":")[0]: continue
        SOGG.append(a); BERS.append(b)
SOGG = np.array(SOGG); BERS = np.array(BERS)
US = np.unique(SOGG); pos_of = {int(u): i for i, u in enumerate(US)}
COL = np.array([pos_of[int(x)] for x in SOGG])
def ranghi(X):
    R = np.empty(X.shape, np.int32)
    for j in range(X.shape[1]): R[np.argsort(-X[:, j]), j] = np.arange(n)
    return R
Rt = np.empty((n, len(US)), np.int32)
for j, u in enumerate(US): Rt[np.argsort(-(E @ E[u])), j] = np.arange(n)
def misura(nome, R, silenzio=False):
    rk = R[BERS, COL]; NS = [10, 50, 100, 500, 2000]
    o = {k: 100*float((rk < k).mean()) for k in NS}
    if not silenzio: print(f"  {nome:<44} " + " · ".join(f"@{k} {o[k]:5.1f}%" for k in NS))
    return o
def spreading(E0, alpha=0.6, iters=15):
    X = E0.copy()
    for _ in range(iters): X = alpha * (M.T @ X) + (1 - alpha) * E0
    return X
E0 = np.zeros((n, len(US)), np.float32); E0[US, np.arange(len(US))] = 1.0
Rs0 = ranghi(spreading(E0))
print("=== SEME ESPANSO: la sorgente + i suoi vicini ===")
misura("seme singolo (riferimento)", ranghi(3.0/(3000+Rs0) + 0.5/(3000+Rt)))
Mk_csr = Mk.tocsr(); Mb_csr = Mb.tocsr()
best = None
for lc in (0.0, 0.3, 0.6):
    for lb in (0.0, 0.3, 0.6):
        if lc == 0 and lb == 0: continue
        S = E0.copy()
        for j, u in enumerate(US):
            vic_c = Mk_csr[u].toarray().ravel()
            vic_b = Mb_csr[u].toarray().ravel()
            if lc: S[:, j] += lc * vic_c / (vic_c.sum() + 1e-9)
            if lb: S[:, j] += lb * vic_b / (vic_b.sum() + 1e-9)
        Rs = ranghi(spreading(S))
        R = ranghi(3.0/(3000+Rs) + 0.5/(3000+Rt))
        o = misura(f"seme espanso cont {lc} behav {lb}", R)
        if best is None or o[10] > best[3][10]: best = (lc, lb, Rs, o)
print(f"\nmigliore: cont {best[0]} behav {best[1]} @10 {best[3][10]:.1f}% (seme singolo: 18.9%)")
