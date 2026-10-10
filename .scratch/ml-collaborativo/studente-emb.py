"""studente-emb.py — LO STUDENTE CON LE FEATURE GIUSTE: embedding delle keyword (film-emb.npz)
invece del one-hot. Stessa ricetta, stesso target (E del teacher cross-medium), stesso test."""
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
# --- le feature NUOVE: embedding delle keyword, allineate alle righe dello spazio ---
e = np.load(ML/"film-emb.npz", allow_pickle=True)
eks = [str(k) for k in e["keys"]]; ev = e["vecs"].astype(np.float32)
EMB = np.zeros((n, ev.shape[1]), np.float32); coperti = 0
for i, k in enumerate(eks):
    r = row_of.get(k)
    if r is not None: EMB[r] = ev[i]; coperti += 1
print(f"embedding keyword: {ev.shape[1]} dim · copertura {coperti:,}/{n:,} titoli ({100*coperti/n:.0f}%)")
def centra(P, per_medium=True):
    Q = P.astype(np.float64).copy()
    if per_medium: Q[~is_tv] -= P[~is_tv].mean(0); Q[is_tv] -= P[is_tv].mean(0)
    else: Q -= P.mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
Pc2, Pb2 = centra(Pc), centra(Pb)
E2 = centra(EMB)                       # anche l'embedding va centrato, stesso trattamento
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
grado = np.asarray((A > 0).sum(1)).ravel(); visti = grado > 0
tot = A.sum(); rs = np.asarray(A.sum(1)).ravel(); cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.log((Co.data * tot) / (rs[Co.row] * cs[Co.col] + 1e-9) + 1e-9)
pmi = np.maximum(pmi - np.log(10.0), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
E = TruncatedSVD(n_components=256, random_state=0).fit_transform(P).astype(np.float32)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
FEAT = {
 "F  solo embedding keyword":      E2,
 "G  embedding + anno":            np.hstack([E2, (anno/100.0)[:, None]]),
 "H  embedding + Pc + anno":       np.hstack([E2, Pc2, (anno/100.0)[:, None]]),
 "I  embedding + Pc + Pb + anno":  np.hstack([E2, Pc2, Pb2, (anno/100.0)[:, None]]),
}
def knn_pred(X, k, escludi_se=False):
    Xs = (X - X[visti].mean(0)) / (X[visti].std(0) + 1e-9)
    Xs = Xs / (np.linalg.norm(Xs, axis=1, keepdims=True) + 1e-9)
    Ev = E[visti]; out = np.zeros((len(Xs), E.shape[1]), np.float32); B = 2000
    for i in range(0, len(Xs), B):
        sim = Xs[i:i+B] @ Xs[visti].T
        if escludi_se:
            for r in range(i, min(i+B, len(Xs))):
                if r in visti: sim[r-i, np.searchsorted(np.where(visti)[0], r)] = -9
        idx = np.argpartition(-sim, k, axis=1)[:, :k]
        w = np.maximum(np.take_along_axis(sim, idx, 1), 0) ** 3
        out[i:i+B] = (w[:, :, None] * Ev[idx]).sum(1) / (w.sum(1, keepdims=True) + 1e-9)
    return out / (np.linalg.norm(out, axis=1, keepdims=True) + 1e-9)
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
print("\n=== LO STUDENTE CON LE FEATURE SEMANTICHE (ranking sui legami di test) ===")
r_, h_, t_ = ranking(E, 1.5); print(f"  {'teacher VERO':<34} tutti {100*r_:5.1f}% ({h_}/{t_})")
r_, h_, t_ = ranking(E, 1.5, True); print(f"  {'teacher VERO (raggiungibili)':<34} {100*r_:5.1f}% ({h_}/{t_})")
for nome, X in FEAT.items():
    pr = knn_pred(X, 10)
    r1, h1, t1 = ranking(pr, 2.5); r2, h2, t2 = ranking(pr, 2.5, True)
    print(f"  {nome[:34]:<34} tutti {100*r1:5.1f}% ({h1}/{t1}) · raggiungibili {100*r2:5.1f}% ({h2}/{t2})")
