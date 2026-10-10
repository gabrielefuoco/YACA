"""taratura2.py — seconda salita: k del RRF verso il limite, pesi, e il peso della curatela.
Riusa etero-final.npz per i ranghi e ricalcola solo la spreading quando cambia il mix."""
import json, pathlib, time
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
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
try:
    zt = np.load(ML/"temi-scores.npz", allow_pickle=True)
    T = np.asarray(zt["bag"], dtype=np.float64)
    if T.shape[0] != n and T.shape[1] == n: T = T.T
    Mt = knn_edges(T, 15) if T.shape[0] == n else None
except Exception: Mt = None
fin = np.load(ML/"etero-final.npz")
Rt = fin["Rt"]; BERS = fin["bersagli"]; COL = fin["col"]
US = np.unique([int(x) for x in fin["col"]])  # non serve: uso COL
ncol = Rt.shape[1]
E0 = np.zeros((n, ncol), np.float32)
# ricostruisco le sorgenti dalle colonne: ogni colonna e' una sorgente distinta
SOGG_U = None
srcs_col = []
for s in test:
    a = row_of.get(s["id"])
    if a is None: continue
    if any(l["type"] != s["id"].split(":")[0] for l in s["links"]): srcs_col.append(a)
SOGG_U = np.array(sorted(set(srcs_col)))
E0[SOGG_U, np.arange(len(SOGG_U))] = 1.0
def rwr(M, alpha, iters=15):
    X = E0.copy()
    for _ in range(iters): X = alpha * (M.T @ X) + (1 - alpha) * E0
    return X
def ranghi(X):
    R = np.empty(X.shape, np.int32)
    for j in range(X.shape[1]): R[np.argsort(-X[:, j]), j] = np.arange(n)
    return R
def misura(nome, R, silenzio=False):
    rk = R[BERS, COL]; NS = [10, 50, 100, 500, 2000]
    o = {k: 100*float((rk < k).mean()) for k in NS}
    if not silenzio:
        print(f"  {nome:<44} " + " · ".join(f"@{k} {o[k]:5.1f}%" for k in NS))
    return o
print(f"colonne: {ncol} · sorgenti ricostruite: {len(SOGG_U)}")
print("\n=== peso della curatela dentro la spreading (alpha 0.6, iters 15) ===")
best = None
for wc in (0.70, 0.80, 0.88, 0.94, 0.98):
    resto = 1.0 - wc
    mix = (0.34*resto*Mk + 0.33*resto*Mb + (0.33*resto)*Mt + wc*Mc) if Mt is not None else (0.5*resto*Mk + 0.5*resto*Mb + wc*Mc)
    Rs = ranghi(rwr(normalizza(mix.tocsr()), 0.6, 15))
    o = misura(f"curatela {wc}", Rs)
    if best is None or o[10] > best[2][10]: best = (wc, Rs, o)
print(f"migliore curatela: {best[0]} @10={best[2][10]:.1f}%")
Rs = best[1]
print("\n=== RRF: k verso il limite e pesi ===")
best_rrf = None
for k0 in (1000, 3000, 10000):
    for ws in (1.0, 1.5, 2.0, 3.0):
        for wt in (0.5, 0.7, 1.0):
            R = ranghi(ws/(k0+Rs) + wt/(k0+Rt))
            o = misura(f"k={k0} {ws}/{wt}", R, silenzio=True)
            if best_rrf is None or o[10] > best_rrf[3][10]: best_rrf = (k0, ws, wt, o, R)
print(f"  migliore: k={best_rrf[0]} w_sp={best_rrf[1]} w_th={best_rrf[2]}")
misura(f"RRF k={best_rrf[0]} {best_rrf[1]}/{best_rrf[2]}", best_rrf[4])
# Borda puro: solo ranghi, senza k
R = ranghi(-(Rs.astype(float)) - (Rt.astype(float)))
misura("Borda puro (solo ranghi)", R)
# diagnostica: da dove vengono i colpi (sorgenti di nicchia vs mainstream)
vot = np.array([votes[int(u)] for u in SOGG_U], dtype=float)
sog = np.median(vot)
Rbest = best_rrf[4]
for nome, sel in (("sorgenti nicchia", vot < sog), ("sorgenti mainstream", vot >= sog)):
    m = np.isin(COL, np.where(sel)[0])
    rk = Rbest[BERS[m], COL[m]]
    print(f"  {nome:<20} @10 {100*float((rk<10).mean()):5.1f}% · @500 {100*float((rk<500).mean()):5.1f}%  ({m.sum()} legami)")
np.savez_compressed(ML/"etero-final2.npz", Rs=Rs, Rt=Rt, bersagli=BERS, col=COL)
print("\nsalvato etero-final2.npz")
