"""ablation.py — OGNI ELEMENTO DA SOLO, OGNI COPPIA, E I TEACHER PER TIPO.
La domanda: il guadagno dell'RRF viene da esperti DIVERSI o da due viste dello stesso segnale?
Calibrazione e verifica separate (la lezione della grid search)."""
import json, pathlib, time, itertools
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
zt = np.load(ML/"temi-scores.npz", allow_pickle=True)
T = np.asarray(zt["bag"], dtype=np.float64)
if T.shape[0] != n and T.shape[1] == n: T = T.T
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
t0 = time.time()
E_ = {"C": knn_edges(Pc2, 15), "B": archi_trakt(), "T": knn_edges(T, 15), "K": archi_curatela(train)}
print(f"archi: " + " · ".join(f"{k} {v.nnz:,}" for k, v in E_.items()) + f"  ({time.time()-t0:.0f}s)")
def teacher_da(M):
    A = M.copy(); A.data = np.ones_like(A.data)
    tot = A.sum(); rs = np.asarray(A.sum(1)).ravel(); cs = np.asarray(A.sum(0)).ravel()
    Co = A.tocoo()
    pmi = np.maximum(np.log((Co.data*tot)/(rs[Co.row]*cs[Co.col] + 1e-9) + 1e-9) - np.log(10.0), 0.0)
    P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
    E = TruncatedSVD(n_components=256, random_state=0).fit_transform(P).astype(np.float32)
    return E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
TE = {k: teacher_da(v) for k, v in E_.items()}
print(f"teacher costruiti ({time.time()-t0:.0f}s)")
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
CAL = np.zeros(len(US), bool); CAL[::2] = True
E0 = np.zeros((n, len(US)), np.float32); E0[US, np.arange(len(US))] = 1.0
def ranghi(P):
    R = np.empty(P.shape, np.int32)
    for j in range(P.shape[1]): R[np.argsort(-P[:, j]), j] = np.arange(n)
    return R
def p10(R, sel):
    m = sel[COL]; rk = R[BERS, COL]
    return 100*float((rk[m] < 10).mean()), 100*float((rk[m] < 500).mean())
def spreading(tipi, alpha=0.6):
    M = normalizza(sum(E_[t] for t in tipi).tocsr())
    X = E0.copy()
    for _ in range(15): X = alpha*(M.T @ X) + (1-alpha)*E0
    return ranghi(X)
print("")
print("=== SPREADING: singoli, coppie, tutte (calibrazione / verifica) ===")
print(f"{'combinazione':<14} {'@10 cal':>8} {'@10 ver':>8} {'@500 ver':>9}")
ris = {}
for r in (1, 2, 4):
    for combo in itertools.combinations("CBTK", r):
        R = spreading(combo)
        c, _ = p10(R, CAL); v, v5 = p10(R, ~CAL)
        ris[combo] = (c, v)
        print(f"{'+'.join(combo):<14} {c:7.1f}% {v:7.1f}% {v5:8.1f}%")
print("")
print("=== TEACHER: uno per tipo di arco (calibrazione / verifica) ===")
Rtipo = {}
for k in "CBTK":
    R = np.empty((n, len(US)), np.int32)
    for j, u in enumerate(US): R[np.argsort(-(TE[k] @ TE[k][u])), j] = np.arange(n)
    Rtipo[k] = R
    c, _ = p10(R, CAL); v, v5 = p10(R, ~CAL)
    print(f"teacher da {k:<8} {c:7.1f}% {v:7.1f}% {v5:8.1f}%")
print("")
print("=== RRF: spreading X + teacher Y (verifica) ===")
best = None
for sx in ("K", "CK", "CBTK"):
    Rs = spreading(tuple(sx))
    for tk in "CBTK":
        S = 3.0/(3000+Rs.astype(float)) + 0.5/(3000+Rtipo[tk].astype(float))
        R = ranghi(S)
        c, _ = p10(R, CAL); v, v5 = p10(R, ~CAL)
        print(f"  spreading {sx:<5} + teacher {tk}   cal {c:6.1f}% · ver {v:6.1f}% · @500 {v5:5.1f}%")
        if best is None or v > best[3]: best = (sx, tk, c, v)
print(f"\nmigliore per VERIFICA: spreading {best[0]} + teacher {best[1]} = {best[3]:.1f}%")
print(f"({time.time()-t0:.0f}s totali)")
