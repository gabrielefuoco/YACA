"""gridsearch.py — COORDINATE DESCENT sui parametri, con CALIBRAZIONE e VERIFICA su due meta' diverse.
Senza lo split, cercare i parametri sul set di misura e' overfitting. Qui: taro su una meta' delle
sorgenti di test, verifico sull'altra, e controllo che i due ottimi coincidano."""
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
CACHE = {}
def edges(kc, kt):
    key = (kc, kt)
    if key not in CACHE: CACHE[key] = (knn_edges(Pc2, kc), knn_edges(T, kt))
    return CACHE[key]
Mb = archi_trakt(); Mc = archi_curatela(train)
print(f"archi base ({time.time()-t0:.0f}s): trakt {Mb.nnz:,} · curatela {Mc.nnz:,}")
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
# CALIBRAZIONE e VERIFICA: meta' delle sorgenti ciascuna
meta = len(US)//2
CAL = np.zeros(len(US), bool); CAL[::2] = True
E0 = np.zeros((n, len(US)), np.float32); E0[US, np.arange(len(US))] = 1.0
Rt = np.empty((n, len(US)), np.int32)
for j, u in enumerate(US): Rt[np.argsort(-(E @ E[u])), j] = np.arange(n)
print(f"calibrazione: {CAL.sum()} sorgenti · verifica: {(~CAL).sum()} · legami {len(BERS)}")
def misura(R, sel):
    rk = R[BERS, COL]; m = sel[COL]
    return 100*float((rk[m] < 10).mean())
def valuta(cfg, sel):
    kc, kt, wc, alpha, krrf, ws, wt = cfg
    Mk, Mt = edges(kc, kt)
    resto = 1.0 - wc
    M = normalizza(((resto/3)*Mk + (resto/3)*Mb + (resto/3)*Mt + wc*Mc).tocsr())
    X = E0.copy()
    for _ in range(15): X = alpha*(M.T @ X) + (1-alpha)*E0
    Rs = np.empty((n, len(US)), np.int32)
    for j in range(len(US)): Rs[np.argsort(-X[:, j]), j] = np.arange(n)
    S = ws/(krrf + Rs.astype(float)) + wt/(krrf + Rt.astype(float))
    R = np.empty((n, len(US)), np.int32)
    for j in range(len(US)): R[np.argsort(-S[:, j]), j] = np.arange(n)
    return misura(R, sel)
START = (15, 15, 0.88, 0.6, 3000, 3.0, 0.5)
GRIGLIA = {0: [10, 15, 25], 1: [10, 15, 30], 2: [0.6, 0.75, 0.88, 0.95],
           3: [0.5, 0.6, 0.7, 0.8], 4: [1000, 3000, 10000],
           5: [1.5, 3.0, 6.0], 6: [0.25, 0.5, 1.0]}
NOMI = ["k contenuto", "k temi", "peso curatela", "alpha", "RRF k", "peso spreading", "peso teacher"]
cfg = list(START)
print(f"\n=== PARTENZA {START} ===")
print(f"  calibrazione {valuta(tuple(cfg), CAL):5.2f}% · verifica {valuta(tuple(cfg), ~CAL):5.2f}%")
t0 = time.time()
for giro in range(2):
    print(f"\n--- giro {giro+1} ---")
    for i in range(len(cfg)):
        best = None
        for v in GRIGLIA[i]:
            if v == cfg[i]: continue
            prova = list(cfg); prova[i] = v
            c = valuta(tuple(prova), CAL)
            if best is None or c > best[1]: best = (v, c)
        if best and best[1] > valuta(tuple(cfg), CAL):
            print(f"  {NOMI[i]:<16} {cfg[i]} -> {best[0]}   (calibrazione {best[1]:.2f}%)")
            cfg[i] = best[0]
    print(f"  giro {giro+1}: calibrazione {valuta(tuple(cfg), CAL):.2f}% · verifica {valuta(tuple(cfg), ~CAL):.2f}%")
print(f"\n=== MIGLIORE {tuple(cfg)} ===")
c_fin = valuta(tuple(cfg), CAL); v_fin = valuta(tuple(cfg), ~CAL)
c_in = valuta(START, CAL); v_in = valuta(START, ~CAL)
print(f"  partenza:   calibrazione {c_in:5.2f}% · verifica {v_in:5.2f}%")
print(f"  ottimizzato: calibrazione {c_fin:5.2f}% · verifica {v_fin:5.2f}%")
print(f"  guadagno su calibrazione {c_fin-c_in:+.2f} punti · su verifica {v_fin-v_in:+.2f} punti")
print(f"  ({time.time()-t0:.0f}s di ricerca)")
# controllo di overfitting: l'ottimo trovato sulla calibrazione e' anche l'ottimo sulla verifica?
best_v = None
for i in range(len(cfg)):
    for v in GRIGLIA[i]:
        prova = list(cfg); prova[i] = v
        s = valuta(tuple(prova), ~CAL)
        if best_v is None or s > best_v[1]: best_v = (NOMI[i], prova[i], s)
print(f"\nOVERFITTING: il parametro che la VERIFICA preferirebbe e' {best_v[0]}={best_v[1]} ({best_v[2]:.2f}%)")
print(f"             quello scelto dalla calibrazione e' {cfg[best_v[0]] if False else [cfg[i] for i,n in enumerate(NOMI) if n==best_v[0]][0]}")
