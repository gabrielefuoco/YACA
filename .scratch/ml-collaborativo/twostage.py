"""twostage.py — DUE STADI: la spreading costruisce il POOL (recall), il teacher ORDINA (precisione).
E' la stessa architettura del prodotto (pool + ranker) e l'idea degli esperti: ognuno al suo meglio.
Confronti: spreading sola, teacher solo, somma pesata lineare, RRF (fusione per ranghi), pool+teacher."""
import json, pathlib, time
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
from sklearn.decomposition import TruncatedSVD
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
G = ROOT/".scratch"/"ml-collaborativo"/"gold"
d = json.loads((G/"cross-merged.json").read_text(encoding="utf-8"))
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
Pc, Pb, tmdb, tipo, votes = z["Pc"], z["Pb"], z["tmdb"], z["tipo"], z["votes"]
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
        tids = [(voce.get("ids") or {}).get("tmdb") for voce in rel]
        tids = [int(t) for t in tids if t]
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
Mk, Mb, Mc = archi_contenuto(), archi_trakt(), archi_curatela(train)
print(f"archi: contenuto {Mk.nnz:,} · co-visione {Mb.nnz:,} · curatela {Mc.nnz:,} ({time.time()-t0:.0f}s)")
# --- il teacher (SVD dell'adiacenza curata del train) ---
A = Mc.copy(); A.data = np.ones_like(A.data)
tot = A.sum(); rs = np.asarray(A.sum(1)).ravel(); cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.maximum(np.log((Co.data*tot)/(rs[Co.row]*cs[Co.col] + 1e-9) + 1e-9) - np.log(10.0), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
E = TruncatedSVD(n_components=256, random_state=0).fit_transform(P).astype(np.float32)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
print(f"teacher: SVD {E.shape}")
# --- legami di test ---
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
    rk = R[BERS, COL]
    NS = [10, 50, 100, 500, 2000]
    o = {k: 100*float((rk < k).mean()) for k in NS}
    print(f"  {nome:<36} " + " · ".join(f"@{k} {o[k]:5.1f}%" for k in NS))
    return o
print("\n=== I DUE STADI ===")
M_best = normalizza((0.05*Mk + 0.05*Mb + 0.9*Mc).tocsr())
Xs = rwr(M_best, 0.7); Rs = ranghi(Xs)
o_s = misura("spreading sola (curatela 0.9)", Rs)
# il teacher da solo
Rt = np.empty((n, len(US)), np.int32)
for j, u in enumerate(US): Rt[np.argsort(-(E @ E[u])), j] = np.arange(n)
o_t = misura("teacher solo", Rt)
# RRF: fusione per ranghi (robusta, senza pesi da tarare)
for k0 in (10, 60):
    Rr = ranghi(1.0/(k0 + Rs) + 1.0/(k0 + Rt))
    misura(f"RRF spreading+teacher (k={k0})", Rr)
# POOL + TEACHER: il pool e' il top-N della spreading, l'ordine lo da' il teacher
for N in (200, 500, 2000):
    R = np.full((n, len(US)), n, np.int32)
    for j, u in enumerate(US):
        pool = np.argsort(-Xs[:, j])[:N]
        ordine = pool[np.argsort(-(E @ E[u])[pool])]
        R[ordine, j] = np.arange(len(pool))
    misura(f"pool {N} (spreading) + teacher", R)
# e il controllo: popolarita'
r = np.argsort(-votes.astype(float)); rk = np.empty(n, np.int32); rk[r] = np.arange(n)
print(f"  {'controllo popolarita':<36} @10 {100*float((rk[BERS]<10).mean()):5.1f}%")
np.savez_compressed(ML/"etero-spreading.npz", X=Xs, soggetti=US, bersagli=BERS, col=COL)
print(f"\nsalvato: etero-spreading.npz (X {Xs.shape})")
