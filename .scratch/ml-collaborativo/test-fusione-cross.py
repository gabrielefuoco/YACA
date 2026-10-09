"""test-fusione-cross.py — LA DOMANDA VERA: il teacher cross-medium aiuta la FUSIONE?
Protocollo a parita': teacher costruito dalle serie DISPARI, misurato sui legami delle PARI.
Pulito per costruzione (le pari non entrano nel teacher) e con 817 legami, non 27."""
import json, pathlib, os
import numpy as np
from scipy.sparse import coo_matrix
from sklearn.decomposition import TruncatedSVD
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
G = ROOT/".scratch"/"ml-collaborativo"/"gold"
d = json.loads((G/"cross-merged.json").read_text(encoding="utf-8"))
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
Pc, Pb, tmdb, tipo, coll, year, votes = z["Pc"], z["Pb"], z["tmdb"], z["tipo"], z["coll"], z["year"], z["votes"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}; n = len(keys)
is_tv = (tipo == "tv")
def centra(P, per_medium=True):
    Q = P.astype(np.float64).copy()
    if per_medium:
        Q[~is_tv] -= P[~is_tv].mean(0); Q[is_tv] -= P[is_tv].mean(0)
    else:
        Q -= P.mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)
Pc2, Pb2 = centra(Pc), centra(Pb)
voti = votes.astype(float)
anno = year.astype(float)
saga = (coll == coll) & ~np.isnan(coll)
src = d["sources"]
train = [s for i, s in enumerate(src) if i % 2 == 0]
test  = [s for i, s in enumerate(src) if i % 2 == 1]
# teacher dalle DISPARI
r_, c_, v_ = [], [], []
for s in train:
    a = row_of.get(s["id"])
    if a is None: continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None: continue
        w = float(l.get("w", 1)); r_ += [a, b]; c_ += [b, a]; v_ += [w, w]
A = coo_matrix((v_, (r_, c_)), shape=(n, n)).tocsr(); A.sum_duplicates()
tot = A.sum(); rs = np.asarray(A.sum(1)).ravel(); cs = np.asarray(A.sum(0)).ravel()
Co = A.tocoo()
pmi = np.log((Co.data * tot) / (rs[Co.row] * cs[Co.col] + 1e-9) + 1e-9)
pmi = np.maximum(pmi - np.log(10.0), 0.0)
P = coo_matrix((pmi, (Co.row, Co.col)), shape=(n, n)).tocsr()
E = TruncatedSVD(n_components=256, random_state=0).fit_transform(P).astype(np.float32)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
print(f"teacher dalle dispari: {len(train)} serie · {A.nnz:,} archi · {E.shape}")
def sims(row, wc, wb, wy, wsg, wx, wxs):
    s = wc*(Pc2 @ Pc2[row]) + wb*(Pb2 @ Pb2[row])
    if wy: s = s + wy*np.exp(-((anno - anno[row])/8.0)**2)
    if wsg: s = s + wsg*((coll == coll[row]) & saga)
    if wx:
        e = E @ E[row]
        s = s + (wx if is_tv[row] else wxs)*e
    s[row] = -9
    return s
def misura(nome, wc, wb, wy, wsg, wx, wxs):
    tot_l = h10 = h20 = h50 = 0; tot_m = h10m = h20m = 0; tot_s = h10s = 0
    for s_ in test:
        a = row_of.get(s_["id"])
        if a is None: continue
        order = np.argsort(-sims(a, wc, wb, wy, wsg, wx, wxs))
        rank = np.empty(n, np.int32); rank[order] = np.arange(n)
        for l in s_["links"]:
            b = row_of.get(l["id"])
            if b is None: continue
            tot_l += 1; h10 += rank[b] < 10; h20 += rank[b] < 20; h50 += rank[b] < 50
            if l["type"] != s_["id"].split(":")[0]:
                tot_m += 1; h10m += rank[b] < 10; h20m += rank[b] < 20
            else:
                tot_s += 1; h10s += rank[b] < 10
    print(f"  {nome:<30} p3@10 {100*h10/max(1,tot_l):5.1f}% · p2@20 {100*h20/max(1,tot_l):5.1f}% · p1@50 {100*h50/max(1,tot_l):5.1f}%  |  cross p3@10 {100*h10m/max(1,tot_m):5.1f}% ({h10m}/{tot_m}) · p2@20 {100*h20m/max(1,tot_m):5.1f}%  |  stesso medium {100*h10s/max(1,tot_s):5.1f}% ({tot_s})")
    return h10/max(1,tot_l) + h20/max(1,tot_l)
print(f"\ntest: {len(test)} serie · {sum(len(s['links']) for s in test)} legami")
print("\n=== LA FUSIONE, senza e con il teacher (tutto su legami MAI VISTI) ===")
misura("solo contenuto", 1.0, 0.0, 0, 0, 0, 0)
misura("solo comportamento (Trakt)", 0.0, 1.0, 0, 0, 0, 0)
misura("contenuto+comport+anno+saga", 0.7, 0.3, 0.15, 0.4, 0, 0)
print("-- con il teacher, peso uniforme --")
for wx in (0.6, 1.0, 1.5):
    misura(f"fusione + teacher {wx}", 0.7, 0.3, 0.15, 0.4, wx, wx)
print("-- con il teacher, GATE per query (serie forte / film debole) --")
best = None
for wx in (1.0, 1.5, 2.5):
    for wxs in (0.0, 0.3, 0.6):
        r = misura(f"fusione + gate {wx}/{wxs}", 0.7, 0.3, 0.15, 0.4, wx, wxs)
        if best is None or r > best[2]: best = (wx, wxs, r)
print(f"\nmigliore: serie={best[0]} film={best[1]}")
