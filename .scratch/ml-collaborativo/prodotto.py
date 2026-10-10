"""prodotto.py — IL CASO DEL PRODOTTO: un utente con una CRONOLOGIA (non una serie singola).
300 account sintetici (MovieLens, split temporale): profilo 60% -> seed, gold 40% -> misura.
La spreading parte da TUTTI i titoli del profilo (seme uniforme), poi RRF col teacher.
Confronti: popolarita', contenuto, teacher, spreading, RRF. Stratificato fondo/resto."""
import json, pathlib
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
is_tv = (tipo == "tv"); solo_film = ~is_tv
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
M = normalizza((0.04*Mk + 0.04*Mb + 0.04*Mt + 0.88*Mc).tocsr())
A = Mc.copy(); A.data = np.ones_like(A.data)
tot = A.sum(); rs = np.asarray(A.sum(1)).ravel(); cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.maximum(np.log((Co.data*tot)/(rs[Co.row]*cs[Co.col] + 1e-9) + 1e-9) - np.log(10.0), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
E = TruncatedSVD(n_components=256, random_state=0).fit_transform(P).astype(np.float32)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
print(f"grafo pronto: {M.nnz:,} archi")
# --- i 300 account ---
ts = json.loads((ML/"testset-synth.json").read_text(encoding="utf-8"))
# SPLIT CASUALE, non temporale: quello temporale fa predire l'ERA (profilo vecchio -> gold nuovo),
# e il contenuto diventa anti-correlato (1% contro il 2% del caso). La domanda del prodotto e'
# "cosa guardo dopo", non "quale anno". Mescolo i seed+gold e rispezzo 60/40.
rng = np.random.default_rng(7)
TR = []
for t in ts["trials"]:
    tutti = [row_of[k] for k in list(t["seeds"]) + list(t["gold"]) if k in row_of]
    if len(tutti) < 30: continue
    idx = rng.permutation(len(tutti))
    nprof = max(5, int(0.6*len(tutti)))
    sg = np.array([tutti[i] for i in idx[:nprof]])
    gd = np.array([tutti[i] for i in idx[nprof:]])
    if len(gd) >= 5: TR.append((t["ctx"], t["strato"], sg, gd))
print(f"account usabili: {len(TR)} · profilo medio {np.mean([len(x[2]) for x in TR]):.0f} · gold medio {np.mean([len(x[3]) for x in TR]):.0f} (SPLIT CASUALE)")
NACC = len(TR)
E0 = np.zeros((n, NACC), np.float32)
for j, (_, _, sg, _) in enumerate(TR): E0[sg, j] = 1.0/len(sg)
def spreading(alpha=0.6, iters=15):
    X = E0.copy()
    for _ in range(iters): X = alpha * (M.T @ X) + (1 - alpha) * E0
    return X
X = spreading()
def ranghi_da(P_):
    R = np.empty(P_.shape, np.int32)
    for j in range(P_.shape[1]): R[np.argsort(-P_[:, j]), j] = np.arange(n)
    return R
# maschera: si raccomandano FILM (il gold di MovieLens e' di film) e non quelli gia' visti
MASCHERA = np.zeros((n, NACC), bool)
for j, (_, _, sg, _) in enumerate(TR): MASCHERA[sg, j] = True
MASCHERA[is_tv, :] = True
def valuta(nome, score_fn, silenzio=False):
    P_ = np.array(score_fn(), dtype=np.float64, copy=True)   # COPIA: non mascherare l'originale
    P_[MASCHERA] = -1e9
    R = ranghi_da(P_)
    NS = [10, 20, 50]; tot_h = {k: 0 for k in NS}; tot_l = 0
    per_strato = {}
    for j, (ctx, strato, sg, gd) in enumerate(TR):
        rk = R[gd, j]
        for k in NS: tot_h[k] += int((rk < k).sum())
        tot_l += len(gd)
        per_strato.setdefault(strato, [0, 0])
        per_strato[strato][0] += int((rk < 10).sum()); per_strato[strato][1] += len(gd)
    o = {k: 100*tot_h[k]/tot_l for k in NS}
    if not silenzio:
        s = " · ".join(f"{k}:{100*a/b:5.1f}%" for k, (a, b) in sorted(per_strato.items()))
        print(f"  {nome:<34} p3@10 {o[10]:5.1f}% · p2@20 {o[20]:5.1f}% · p1@50 {o[50]:5.1f}%   ({s})")
    return o
print("\n=== IL CASO DEL PRODOTTO (300 profili -> gold tenuto fuori) ===")
valuta("popolarita' (controllo)", lambda: np.tile(votes.astype(float), (NACC, 1)).T)
valuta("contenuto (somma dei profili)", lambda: Pc2 @ (Pc2[E0 > 0].T @ np.zeros(0)) if False else Pc2 @ np.array([Pc2[np.where(E0[:, j] > 0)[0]].mean(0) for j in range(NACC)]).T)
Rs = ranghi_da(X.copy())          # PRIMA: X non deve essere ancora mascherato
valuta("spreading (4 tipi di arco)", lambda: X)
Rt = np.empty((n, NACC), np.int32)
for j in range(NACC):
    u = np.where(E0[:, j] > 0)[0]
    prof = E[u].mean(0)
    Rt[np.argsort(-(E @ prof)), j] = np.arange(n)
valuta("teacher (profilo medio)", lambda: (n - Rt).astype(float))
valuta("RRF spreading + teacher", lambda: 3.0/(3000+Rs.astype(float)) + 0.5/(3000+Rt.astype(float)))
valuta("misto 0.7/0.3", lambda: (0.7*(n-Rs) + 0.3*(n-Rt)).astype(float))
valuta("Borda puro", lambda: (2*n - Rs - Rt).astype(float))
