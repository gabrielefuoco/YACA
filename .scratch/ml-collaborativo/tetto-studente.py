"""tetto-studente.py — (1) IL TETTO DI RAGGIUNGIBILITA'  (2) LO STUDENTE DEL TEACHER CROSS-MEDIUM.
(1) Per ogni legame di test: il bersaglio compare nel train? Con che grado? -> il tasso per fascia.
(2) Il contenuto (Pc) -> le coordinate del teacher (E), con un Ridge. Poi si misura se la versione
    APPRESA regge il confronto con quella vera: e' quello che permetterebbe di coprire il 97% del
    catalogo che non ho mai scritto."""
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
def centra(P, per_medium=True):
    Q = P.astype(np.float64).copy()
    if per_medium:
        Q[~is_tv] -= P[~is_tv].mean(0); Q[is_tv] -= P[is_tv].mean(0)
    else: Q -= P.mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
Pc2, Pb2 = centra(Pc), centra(Pb)
_a = year.astype(float)
anno = np.where(np.isnan(_a), np.nanmedian(_a), _a)      # l'anno mancante -> mediana (era NaN -> crash)
saga = (coll == coll) & ~np.isnan(coll)
src = d["sources"]
train = [s for i, s in enumerate(src) if i % 2 == 0]
test  = [s for i, s in enumerate(src) if i % 2 == 1]
# adiacenza dal TRAIN
r_, c_, v_ = [], [], []
for s in train:
    a = row_of.get(s["id"])
    if a is None: continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None: continue
        w = float(l.get("w", 1)); r_ += [a, b]; c_ += [b, a]; v_ += [w, w]
A = coo_matrix((v_, (r_, c_)), shape=(n, n)).tocsr(); A.sum_duplicates()
grado = np.asarray((A > 0).sum(1)).ravel()          # in quante serie del train compare ogni titolo
tot = A.sum(); rs = np.asarray(A.sum(1)).ravel(); cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.log((Co.data * tot) / (rs[Co.row] * cs[Co.col] + 1e-9) + 1e-9)
pmi = np.maximum(pmi - np.log(10.0), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
E = TruncatedSVD(n_components=256, random_state=0).fit_transform(P).astype(np.float32)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
print(f"train: {len(train)} serie · {A.nnz:,} archi · test: {len(test)} serie")
# ---------- (1) IL TETTO ----------
legami = [(s, l) for s in test for l in s["links"] if row_of.get(l["id"]) is not None and l["type"] != s["id"].split(":")[0]]
print(f"\n=== (1) IL TETTO DI RAGGIUNGIBILITA' — {len(legami)} legami cross-medium di test ===")
fasce = [(0,0), (1,1), (2,2), (3,5), (6,10**9)]
print(f"{'grado nel train':<18} {'legami':>7} {'quota':>7}")
for lo, hi in fasce:
    k = sum(1 for s, l in legami if lo <= grado[row_of[l['id']]] <= hi)
    et = f"{lo}" if lo == hi else (f"{lo}-{hi}" if hi < 10**9 else f"{lo}+")
    print(f"  {et:<16} {k:>7} {100*k/len(legami):>6.1f}%")
irr = sum(1 for s, l in legami if grado[row_of[l['id']]] == 0)
print(f"\nIRRAGGIUNGIBILI (grado 0: il bersaglio non compare in nessuna lista del train): {irr} ({100*irr/len(legami):.1f}%)")
print(f"RAGGIUNGIBILI: {len(legami)-irr} ({100*(len(legami)-irr)/len(legami):.1f}%)")
# ---------- (2) LO STUDENTE ----------
print(f"\n=== (2) LO STUDENTE: contenuto (Pc) -> coordinate del teacher (E) ===")
visti = grado > 0                                     # solo i titoli che il teacher conosce
X = np.hstack([Pc2, anno[:, None]/100.0])             # le feature: contenuto appreso + anno
Xs = (X - X[visti].mean(0)) / (X[visti].std(0) + 1e-9)
Y = E[visti]
print(f"addestro su {visti.sum():,} titoli conosciuti dal teacher · feature {Xs.shape[1]} · target {Y.shape[1]}")
rl = Ridge(alpha=1.0).fit(Xs[visti], Y)
E_st = np.zeros_like(E)
E_st[visti] = rl.predict(Xs[visti])                   # in-sample
pred_all = rl.predict(Xs)
pred_all = pred_all / (np.linalg.norm(pred_all, axis=1, keepdims=True) + 1e-9)
# qualita' dello studente: coseno con il teacher sui titoli che il teacher conosce
cos = (E_st[visti] * E[visti]).sum(1) / (np.linalg.norm(E_st[visti], axis=1)*np.linalg.norm(E[visti], axis=1) + 1e-9)
print(f"coseno studente/teacher (in-sample): medio {cos.mean():.3f} · mediano {np.median(cos):.3f}")
def sims(row, wc, wb, wy, wsg, wx, Es):
    s = wc*(Pc2 @ Pc2[row]) + wb*(Pb2 @ Pb2[row])
    if wy: s = s + wy*np.exp(-((anno - anno[row])/8.0)**2)
    if wsg: s = s + wsg*((coll == coll[row]) & saga)
    if wx: s = s + wx*(Es @ Es[row])
    s[row] = -9
    return s
def misura(nome, wc, wb, wy, wsg, wx, Es, solo_raggiungibili=False):
    tot_l = h10 = h20 = 0
    for s in test:
        a = row_of.get(s["id"])
        if a is None: continue
        order = np.argsort(-sims(a, wc, wb, wy, wsg, wx, Es))
        rank = np.empty(n, np.int32); rank[order] = np.arange(n)
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None or l["type"] == s["id"].split(":")[0]: continue
            if solo_raggiungibili and grado[b] == 0: continue
            tot_l += 1; h10 += rank[b] < 10; h20 += rank[b] < 20
    print(f"  {nome:<34} p3@10 {100*h10/max(1,tot_l):5.1f}% ({h10}/{tot_l}) · p2@20 {100*h20/max(1,tot_l):5.1f}%")
    return h10/max(1,tot_l)
print(f"\n--- la fusione, con il teacher VERO (il tetto pratico) ---")
misura("base (senza teacher)", 0.7, 0.3, 0.15, 0.4, 0, E)
misura("+ teacher vero 1.5", 0.7, 0.3, 0.15, 0.4, 1.5, E)
print(f"--- la fusione, con lo studente al posto del teacher (copre TUTTO il catalogo) ---")
for wx in (1.5, 2.5):
    misura(f"+ studente {wx}", 0.7, 0.3, 0.15, 0.4, wx, pred_all)
print(f"--- e sui soli legami RAGGIUNGIBILI ---")
misura("teacher vero 1.5", 0.7, 0.3, 0.15, 0.4, 1.5, E, solo_raggiungibili=True)
misura("studente 2.5", 0.7, 0.3, 0.15, 0.4, 2.5, pred_all, solo_raggiungibili=True)
