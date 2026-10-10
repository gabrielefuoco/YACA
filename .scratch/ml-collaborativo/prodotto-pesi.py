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


print("")
print("=== RECALL@N NEL CASO PRODOTTO: dove sta il segnale ===")
NS = [10, 50, 100, 500, 2000, 10000]
def recall(X, nome):
    P_ = np.array(X, dtype=np.float64, copy=True); P_[MASCHERA] = -1e9
    R = np.empty(P_.shape, np.int32)
    for j in range(P_.shape[1]): R[np.argsort(-P_[:, j]), j] = np.arange(n)
    tot_l = 0; cnt = {k: 0 for k in NS}
    for j, (strato, sg, gd) in enumerate(TR):
        rk = R[gd, j]; tot_l += len(gd)
        for k in NS: cnt[k] += int((rk < k).sum())
    print(f"  {nome:<30} " + " · ".join(f"@{k} {100*cnt[k]/tot_l:5.1f}%" for k in NS))
    return cnt
resto = 1.0 - 0.6
M = normalizza(((resto/3)*Mk + (resto/3)*Mb + (resto/3)*Mt + 0.6*Mc).tocsr())
X = E0.copy()
for _ in range(15): X = 0.6*(M.T @ X) + 0.4*E0
recall(X, "spreading (curatela 0.6)")
recall(np.tile(votes.astype(float), (NACC, 1)).T, "popolarita'")
# il contenuto: profilo = media dei seed
prof = np.zeros((NACC, Pc2.shape[1]))
for j, (_, sg, _) in enumerate(TR): prof[j] = Pc2[sg].mean(0)
recall(Pc2 @ prof.T, "contenuto")
print("")
print("LETTURA: se il recall e' alto a N grande e basso a N piccolo, il segnale c'e' ma")
print("non sa ordinare -> va usato come generatore di candidati (pool), non come ranker.")


print("")
print("=== POOL + RANKER nel caso prodotto ===")
resto = 1.0 - 0.6
M = normalizza(((resto/3)*Mk + (resto/3)*Mb + (resto/3)*Mt + 0.6*Mc).tocsr())
X = E0.copy()
for _ in range(15): X = 0.6*(M.T @ X) + 0.4*E0
prof = np.zeros((NACC, Pc2.shape[1]))
for j, (_, sg, _) in enumerate(TR): prof[j] = Pc2[sg].mean(0)
Sc = Pc2 @ prof.T                      # contenuto: punteggio per (titolo, account)
Sc = Sc / (np.linalg.norm(Sc, axis=0, keepdims=True) + 1e-9)
def pool_ranker(N, w_pool, nome):
    # punteggio finale: rank nel pool (spreading) + contenuto, dentro il pool
    P_ = np.zeros((n, NACC), np.float64)
    for j in range(NACC):
        pool = np.argsort(-X[:, j])[:N]
        rk_pool = np.empty(N, np.float64)
        rk_pool[np.argsort(-X[pool, j])] = np.arange(N)
        P_[pool, j] = w_pool/(60.0 + rk_pool) + Sc[pool, j]
    P_[MASCHERA] = -1e9
    R = np.empty(P_.shape, np.int32)
    for j in range(P_.shape[1]): R[np.argsort(-P_[:, j]), j] = np.arange(n)
    tot = {10: 0, 20: 0}; tl = 0; st = {}
    for j, (strato, sg, gd) in enumerate(TR):
        rk = R[gd, j]; tot[10] += int((rk < 10).sum()); tot[20] += int((rk < 20).sum()); tl += len(gd)
        st.setdefault(strato, [0, 0]); st[strato][0] += int((rk < 10).sum()); st[strato][1] += len(gd)
    ss = " · ".join(f"{k}:{100*a/b:.1f}%" for k, (a, b) in sorted(st.items()))
    print(f"  {nome:<34} p3@10 {100*tot[10]/tl:5.2f}% · p2@20 {100*tot[20]/tl:5.2f}%   ({ss})")
    return tot[10]/tl
best = None
for N in (100, 500, 2000):
    for wp in (0.0, 0.05, 0.2):
        r = pool_ranker(N, wp, f"pool {N} · peso pool {wp}")
        if best is None or r > best[2]: best = (N, wp, r)
print(f"  migliore: pool {best[0]} peso {best[1]} -> {100*best[2]:.2f}%")
print("  (riferimento: spreading sola 2,26% · contenuto 1,8% · caso ~1,6%)")


print("")
print("=== L'IPOTESI: fondere un esperto CATTIVO trascina giu'. Peso del teacher a scalare ===")
resto = 1.0 - 0.6
M = normalizza(((resto/3)*Mk + (resto/3)*Mb + (resto/3)*Mt + 0.6*Mc).tocsr())
X = E0.copy()
for _ in range(15): X = 0.6*(M.T @ X) + 0.4*E0
Rs = np.empty((n, NACC), np.int32)
for j in range(NACC): Rs[np.argsort(-X[:, j]), j] = np.arange(n)
A = Mc.copy(); A.data = np.ones_like(A.data)
tot_ = A.sum(); rs_ = np.asarray(A.sum(1)).ravel(); cs_ = np.asarray(A.sum(0)).ravel()
from scipy.sparse import coo_matrix as _co
Co_ = A.tocoo()
pmi_ = np.maximum(np.log((Co_.data*tot_)/(rs_[Co_.row]*cs_[Co_.col] + 1e-9) + 1e-9) - np.log(10.0), 0.0)
Pm = _co((pmi_, (Co_.row, Co_.col)), shape=(n, n)).tocsr()
from sklearn.decomposition import TruncatedSVD as _SVD
Es = _SVD(n_components=256, random_state=0).fit_transform(Pm).astype(np.float32)
Es = Es / (np.linalg.norm(Es, axis=1, keepdims=True) + 1e-9)
Rt = np.empty((n, NACC), np.int32)
for j, (_, sg, _) in enumerate(TR):
    u = sg; prof = Es[u].mean(0)
    Rt[np.argsort(-(Es @ prof)), j] = np.arange(n)
def valuta_RRF(w_th, nome):
    P_ = (3.0/(3000+Rs.astype(float)) + w_th/(3000+Rt.astype(float)))
    P_ = np.array(P_, dtype=np.float64, copy=True); P_[MASCHERA] = -1e9
    R = np.empty(P_.shape, np.int32)
    for j in range(P_.shape[1]): R[np.argsort(-P_[:, j]), j] = np.arange(n)
    tot = {10: 0, 20: 0}; tl = 0
    for j, (strato, sg, gd) in enumerate(TR):
        rk = R[gd, j]; tot[10] += int((rk < 10).sum()); tot[20] += int((rk < 20).sum()); tl += len(gd)
    print(f"  {nome:<34} p3@10 {100*tot[10]/tl:5.2f}% · p2@20 {100*tot[20]/tl:5.2f}%")
    return tot[10]/tl
valuta_RRF(0.0, "peso teacher 0.0 (= spreading sola)")
valuta_RRF(0.1, "peso teacher 0.1")
valuta_RRF(0.5, "peso teacher 0.5")
valuta_RRF(1.0, "peso teacher 1.0")
valuta_RRF(3.0, "peso teacher 3.0")
print("")
print("CONFRONTO: sul test CURATO (dove entrambi gli esperti sono buoni) il peso ottimo era 3.0/0.5.")
print("Se qui degrada con il peso del teacher, l'ipotesi e' confermata: la fusione per ranghi")
print("presume esperti di qualita' comparabile.")
