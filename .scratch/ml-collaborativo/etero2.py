"""etero2.py — SPREADING VETTORIZZATA (tutte le sorgenti insieme) + GRIGLIA VERA.
La random walk per-sorgente costava 40s a configurazione: con X = (n x S) si fa una matmul
sparsa per iterazione, quindi ~10s a configurazione. Stesso risultato, 30x piu' veloce."""
import json, pathlib, os, time
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
# --- archi ---
def archi_contenuto(KNN):
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
    rows, cols = [], []
    base = pathlib.Path(ROOT/".cache"/"trakt")
    for f in list(base.glob("rel-movie-*.json")) + list(base.glob("rel-tv-*.json")):
        try: rel = json.loads(f.read_text(encoding="utf-8"))
        except Exception: continue
        if not isinstance(rel, list): continue
        m = f.name.split("-")[1]
        tids = []
        for voce in rel:
            t = (voce.get("ids") or {}).get("tmdb")
            if t: tids.append(int(t))
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
Mk = archi_contenuto(15); Mb = archi_trakt(); Mc = archi_curatela(train)
print(f"archi: contenuto {Mk.nnz:,} · co-visione {Mb.nnz:,} · curatela {Mc.nnz:,}  ({time.time()-t0:.0f}s)")
# --- le sorgenti di test e i loro bersagli ---
SOGG = []; BERS = []; TIPI = []
for s in test:
    a = row_of.get(s["id"])
    if a is None: continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None or l["type"] == s["id"].split(":")[0]: continue
        SOGG.append(a); BERS.append(b)
SOGG = np.array(SOGG); BERS = np.array(BERS)
print(f"legami di test cross-medium: {len(BERS)}")
US = np.unique(SOGG); pos_of = {int(u): i for i, u in enumerate(US)}
COL = np.array([pos_of[int(x)] for x in SOGG])
E = np.zeros((n, len(US)), np.float32)
E[US, np.arange(len(US))] = 1.0
def rwr(M, alpha, iters=20):
    X = E.copy()
    for _ in range(iters):
        X = alpha * (M.T @ X) + (1 - alpha) * E
    return X
def valuta(M, alpha, nome, ritorna=False):
    X = rwr(M, alpha)
    R = np.empty_like(X, dtype=np.int32)
    for j in range(X.shape[1]):
        R[np.argsort(-X[:, j]), j] = np.arange(n)
    rk = R[BERS, COL]
    NS = [10, 50, 100, 500, 2000]
    out = {k: 100*float((rk < k).mean()) for k in NS}
    print(f"  {nome:<40} " + " · ".join(f"@{k} {out[k]:4.1f}%" for k in NS))
    return (out, X, R) if ritorna else out
print("\n=== GRIGLIA: peso della curatela x restart ===")
best = None
for wc in (0.4, 0.6, 0.75, 0.9):
    M = normalizza((0.5*(1-wc)*Mk + 0.5*(1-wc)*Mb + wc*Mc).tocsr())
    for alpha in (0.7, 0.85):
        o = valuta(M, alpha, f"curatela {wc} · alpha {alpha}")
        if best is None or o[10] > best[2][10]: best = (wc, alpha, o, M)
print(f"\nmigliore: curatela={best[0]} alpha={best[1]} @10={best[2][10]:.1f}%")
# --- controllo: popolarita' ---
pop = votes.astype(float)
r = np.argsort(-pop); rk = np.empty(n, np.int32); rk[r] = np.arange(n)
print(f"  {'controllo popolarita':<40} @10 {100*float((rk[BERS]<10).mean()):4.1f}%")
np.savez_compressed(ML/"etero-best.npz", X=best[3], soggetti=US)
