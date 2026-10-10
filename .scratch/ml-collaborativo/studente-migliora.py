"""studente-migliora.py — MIGLIORARE LO STUDENTE: quali feature, quale modello.
Il target e' sempre E (le coordinate del teacher cross-medium, 256 dim). Cambiano le FEATURE
(Pc = contenuto appreso, Pb = comportamento Trakt, anno) e il MODELLO (Ridge vs k-NN pesato).
Misura: coseno con il teacher sui titoli conosciuti + il ranking sui legami di test."""
import json, pathlib, os
import numpy as np
from scipy.sparse import coo_matrix
from sklearn.decomposition import TruncatedSVD
from sklearn.linear_model import Ridge
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
G = ROOT/".scratch"/"ml-collaborativo"/"gold"
d = json.loads((G/"cross-merged.json").read_text(encoding="utf-8"))
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
Pc, Pb, tmdb, tipo, coll, year = z["Pc"], z["Pb"], z["tmdb"], z["tipo"], z["coll"], z["year"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}; n = len(keys)
is_tv = (tipo == "tv")
_a = year.astype(float); anno = np.where(np.isnan(_a), np.nanmedian(_a), _a)
saga = (coll == coll) & ~np.isnan(coll)
def centra(P, per_medium=True):
    Q = P.astype(np.float64).copy()
    if per_medium: Q[~is_tv] -= P[~is_tv].mean(0); Q[is_tv] -= P[is_tv].mean(0)
    else: Q -= P.mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
Pc2, Pb2 = centra(Pc), centra(Pb)
src = d["sources"]
train = [s for i, s in enumerate(src) if i % 2 == 0]
test  = [s for i, s in enumerate(src) if i % 2 == 1]
r_, c_, v_ = [], [], []
for s in train:
    a = row_of.get(s["id"])
    if a is None: continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None: continue
        w = float(l.get("w", 1)); r_ += [a, b]; c_ += [b, a]; v_ += [w, w]
A = coo_matrix((v_, (r_, c_)), shape=(n, n)).tocsr(); A.sum_duplicates()
grado = np.asarray((A > 0).sum(1)).ravel()
tot = A.sum(); rs = np.asarray(A.sum(1)).ravel(); cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.log((Co.data * tot) / (rs[Co.row] * cs[Co.col] + 1e-9) + 1e-9)
pmi = np.maximum(pmi - np.log(10.0), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
E = TruncatedSVD(n_components=256, random_state=0).fit_transform(P).astype(np.float32)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
visti = grado > 0
FEAT = {
 "A  Pc+anno (attuale)": np.hstack([Pc2, (anno/100.0)[:, None]]),
 "B  Pc+Pb+anno":        np.hstack([Pc2, Pb2, (anno/100.0)[:, None]]),
 "C  Pb+anno":           np.hstack([Pb2, (anno/100.0)[:, None]]),
 "D  Pc+Pb":             np.hstack([Pc2, Pb2]),
 "E  Pb (solo)":         Pb2,
}
def cos_medio(Pred):
    a = Pred[visti]; b = E[visti]
    return float((a*b).sum(1).mean() / 1.0) if False else float(np.mean((a*b).sum(1) / (np.linalg.norm(a,axis=1)*np.linalg.norm(b,axis=1) + 1e-9)))
def ridge_pred(X, alpha):
    Xs = (X - X[visti].mean(0)) / (X[visti].std(0) + 1e-9)
    rl = Ridge(alpha=alpha).fit(Xs[visti], E[visti])
    pr = rl.predict(Xs)
    return pr / (np.linalg.norm(pr, axis=1, keepdims=True) + 1e-9)
def knn_pred(X, k):
    Xs = (X - X[visti].mean(0)) / (X[visti].std(0) + 1e-9)
    Xs = Xs / (np.linalg.norm(Xs, axis=1, keepdims=True) + 1e-9)
    Ev = E[visti]
    out = np.zeros((len(Xs), E.shape[1]), np.float32)
    B = 2000
    for i in range(0, len(Xs), B):
        # i vicini si cercano SOLO tra i titoli che il teacher conosce: indicizzare Ev (1.459 righe)
        # con indici dello spazio intero (66.259) era un errore di indice
        sim = Xs[i:i+B] @ Xs[visti].T
        idx = np.argpartition(-sim, k, axis=1)[:, :k]
        w = np.take_along_axis(sim, idx, 1)
        w = np.maximum(w, 0) ** 3                   # peso cubico: i vicini veri contano
        out[i:i+B] = (w[:, :, None] * Ev[idx]).sum(1) / (w.sum(1, keepdims=True) + 1e-9)
    return out / (np.linalg.norm(out, axis=1, keepdims=True) + 1e-9)
print("=== QUALITA' DELLO STUDENTE (coseno con il teacher, sui 1.459 titoli conosciuti) ===")
ris = {}
for nome, X in FEAT.items():
    for alpha in (1.0, 10.0):
        ris[f"Ridge a={alpha} | {nome}"] = ridge_pred(X, alpha)
    for k in (10, 30):
        ris[f"kNN k={k} | {nome}"] = knn_pred(X, k)
for nome, pred in ris.items():
    print(f"  {nome:<34} coseno {cos_medio(pred):.3f}")
best = sorted(ris.items(), key=lambda kv: -cos_medio(kv[1]))[:3]
print("\nmigliori 3:", [k for k, _ in best])
def sims(row, wc, wb, wy, wsg, wx, Es):
    s = wc*(Pc2 @ Pc2[row]) + wb*(Pb2 @ Pb2[row])
    if wy: s = s + wy*np.exp(-((anno - anno[row])/8.0)**2)
    if wsg: s = s + wsg*((coll == coll[row]) & saga)
    if wx: s = s + wx*(Es @ Es[row])
    s[row] = -9
    return s
def ranking(Es, wx, solo_ragg=False):
    tot_l = h10 = 0
    for s in test:
        a = row_of.get(s["id"])
        if a is None: continue
        order = np.argsort(-sims(a, 0.7, 0.3, 0.15, 0.4, wx, Es))
        rank = np.empty(n, np.int32); rank[order] = np.arange(n)
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None or l["type"] == s["id"].split(":")[0]: continue
            if solo_ragg and grado[b] == 0: continue
            tot_l += 1; h10 += rank[b] < 10
    return h10/max(1,tot_l), h10, tot_l
print("\n=== RANKING SUI LEGAMI DI TEST (tutti / solo raggiungibili) ===")
r_, h_, t_ = ranking(E, 1.5); print(f"  {'teacher VERO 1.5':<34} tutti {100*r_:5.1f}% ({h_}/{t_})")
for nome, pred in best:
    r1, h1, t1 = ranking(pred, 2.5); r2, h2, t2 = ranking(pred, 2.5, True)
    print(f"  {nome[:34]:<34} tutti {100*r1:5.1f}% ({h1}/{t1}) · raggiungibili {100*r2:5.1f}% ({h2}/{t2})")
