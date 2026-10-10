"""prodotto-pesi.py — il peso della curatela per il caso del PRODOTTO (non per il test curato).
La spreading e' la migliore sul prodotto: ma con che mix di archi? Riusa il setup di prodotto.py."""
import json, pathlib
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
ts = json.loads((ML/"testset-synth.json").read_text(encoding="utf-8"))
rng = np.random.default_rng(7)
TR = []
for t in ts["trials"]:
    tutti = [row_of[k] for k in list(t["seeds"]) + list(t["gold"]) if k in row_of]
    if len(tutti) < 30: continue
    idx = rng.permutation(len(tutti)); nprof = max(5, int(0.6*len(tutti)))
    TR.append((t["strato"], np.array([tutti[i] for i in idx[:nprof]]), np.array([tutti[i] for i in idx[nprof:]])))
NACC = len(TR)
E0 = np.zeros((n, NACC), np.float32)
for j, (_, sg, _) in enumerate(TR): E0[sg, j] = 1.0/len(sg)
MASCHERA = np.zeros((n, NACC), bool)
for j, (_, sg, _) in enumerate(TR): MASCHERA[sg, j] = True
MASCHERA[is_tv, :] = True
def valuta(X, nome):
    P_ = np.array(X, dtype=np.float64, copy=True); P_[MASCHERA] = -1e9
    R = np.empty(P_.shape, np.int32)
    for j in range(P_.shape[1]): R[np.argsort(-P_[:, j]), j] = np.arange(n)
    tot = {10: 0, 20: 0}; tl = 0; st = {}
    for j, (strato, sg, gd) in enumerate(TR):
        rk = R[gd, j]; tot[10] += int((rk < 10).sum()); tot[20] += int((rk < 20).sum()); tl += len(gd)
        st.setdefault(strato, [0, 0]); st[strato][0] += int((rk < 10).sum()); st[strato][1] += len(gd)
    s = " · ".join(f"{k}:{100*a/b:.1f}%" for k, (a, b) in sorted(st.items()))
    print(f"  {nome:<34} p3@10 {100*tot[10]/tl:5.2f}% · p2@20 {100*tot[20]/tl:5.2f}%   ({s})")
print("=== IL PESO DELLA CURATELA PER IL PRODOTTO (300 profili) ===")
for wc in (0.0, 0.1, 0.2, 0.4, 0.6, 0.88):
    resto = 1.0 - wc
    M = normalizza(((resto/3)*Mk + (resto/3)*Mb + (resto/3)*Mt + wc*Mc).tocsr())
    X = E0.copy()
    for _ in range(15): X = 0.6*(M.T @ X) + 0.4*E0
    valuta(X, f"curatela {wc:.2f}")
