"""terzo-esperto.py — IL TERZO ESPERTO (i temi/OCEAN) dentro la spreading e dentro il RRF.
L'OCEAN e' la proiezione dei 70 nodi L4 su 5 assi: stessa informazione dei temi, piu' compressa.
Qui si usa il livello informativo (temi) e si misura se aggiunge qualcosa ai due esperti che vincono."""
import json, pathlib, time
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
from sklearn.decomposition import TruncatedSVD
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
G = ROOT/".scratch"/"ml-collaborativo"/"gold"
d = json.loads((G/"cross-merged.json").read_text(encoding="utf-8"))
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo, votes = z["Pc"], z["tmdb"], z["tipo"], z["votes"]
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
def archi_contenuto(KNN=15):
    rows, cols, vals = [], [], []; B = 4000
    for i in range(0, n, B):
        sim = Pc2[i:i+B] @ Pc2.T
        for r in range(sim.shape[0]): sim[r, i+r] = -9
        idx = np.argpartition(-sim, KNN, axis=1)[:, :KNN]
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
# --- IL TERZO ESPERTO: i temi (la stessa informazione dell'OCEAN, un livello piu' informativo) ---
try:
    zt = np.load(ML/"temi-scores.npz", allow_pickle=True)
    TB, TKEYS = zt["bag"], [str(x) for x in zt["keys"]]
    # TB: (n_temi x n_titoli)? o (n_titoli x n_temi)? -> normalizzo per riga e uso il coseno tra titoli
    T = np.asarray(TB, dtype=np.float64)
    print(f"temi: shape {T.shape}")
    if T.shape[0] != n and T.shape[1] == n: T = T.T
    if T.shape[0] == n:
        T = T / (np.linalg.norm(T, axis=1, keepdims=True) + 1e-9)
        KNN_T = 15
        rows, cols, vals = [], [], []; B = 4000
        for i in range(0, n, B):
            sim = T[i:i+B] @ T.T
            for r in range(sim.shape[0]): sim[r, i+r] = -9
            idx = np.argpartition(-sim, KNN_T, axis=1)[:, :KNN_T]
            w = np.take_along_axis(sim, idx, 1)
            for r in range(sim.shape[0]):
                pos = w[r] > 0
                rows += [i+r]*int(pos.sum()); cols += list(idx[r][pos]); vals += list(w[r][pos])
        Mt = normalizza(coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr())
        print(f"archi temi: {Mt.nnz:,}")
    else:
        Mt = None; print("temi: forma inattesa, salto")
except Exception as e:
    Mt = None; print(f"temi non usabili: {e}")
Mk = archi_contenuto(); Mb = archi_trakt(); Mc = archi_curatela(train)
print(f"archi: contenuto {Mk.nnz:,} · co-visione {Mb.nnz:,} · curatela {Mc.nnz:,}")
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
E0 = np.zeros((n, len(US)), np.float32); E0[US, np.arange(len(US))] = 1.0
def rwr(M, alpha, iters=20):
    X = E0.copy()
    for _ in range(iters): X = alpha * (M.T @ X) + (1 - alpha) * E0
    return X
def ranghi(X):
    R = np.empty(X.shape, np.int32)
    for j in range(X.shape[1]): R[np.argsort(-X[:, j]), j] = np.arange(n)
    return R
def misura(nome, R):
    rk = R[BERS, COL]; NS = [10, 50, 100, 500, 2000]
    o = {k: 100*float((rk < k).mean()) for k in NS}
    print(f"  {nome:<40} " + " · ".join(f"@{k} {o[k]:5.1f}%" for k in NS))
    return o
Rt = np.empty((n, len(US)), np.int32)
for j, u in enumerate(US): Rt[np.argsort(-(E @ E[u])), j] = np.arange(n)
print("\n=== IL TERZO ESPERTO ===")
misura("teacher solo (riferimento)", Rt)
config = [("2 esperti (contenuto+curatela)", 0.05*Mk + 0.05*Mb + 0.90*Mc)]
if Mt is not None:
    config += [("3 esperti (+temi)", 0.04*Mk + 0.04*Mb + 0.12*Mt + 0.80*Mc),
               ("3 esperti, temi forti", 0.04*Mk + 0.04*Mb + 0.25*Mt + 0.67*Mc)]
for nome, M in config:
    Rs = ranghi(rwr(normalizza(M.tocsr()), 0.7))
    misura(nome + " — spreading", Rs)
    for k0 in (20, 60, 100):
        misura(f"{nome} + teacher RRF k={k0}", ranghi(1.0/(k0+Rs) + 1.0/(k0+Rt)))
