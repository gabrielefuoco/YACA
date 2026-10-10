"""recall-curve.py — DOVE ARRIVA OGNI SEGNALE. Non la precisione (il top-10) ma il RECALL a N
crescenti: il film giusto e' nel top-10? nel 50? nel 500? nel 5000?
Se il contenuto ha recall alto a N grande e precisione bassa a N piccolo, allora le keyword
descrivono bene il film ma non sanno ORDINARE: vanno usate come generatore di candidati, non come ranker."""
import json, pathlib
import numpy as np
from scipy.sparse import coo_matrix
from sklearn.decomposition import TruncatedSVD
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
# anche il recall del comportamento: usa il teacher MovieLens "vero" (il Pb non e' una similarita')
NS = [10, 50, 100, 500, 2000, 10000]
SEGNALI = {
 "contenuto (keyword, Pc)":        lambda row: Pc2 @ Pc2[row],
 "comportamento (Trakt, Pb)":      lambda row: Pb2 @ Pb2[row],
 "teacher cross-medium":           lambda row: E @ E[row],
 "fusione contenuto+comport+anno+saga": lambda row: 0.7*(Pc2 @ Pc2[row]) + 0.3*(Pb2 @ Pb2[row]) + 0.15*np.exp(-((anno-anno[row])/8.0)**2) + 0.4*((coll==coll[row])&saga),
}
# e il comportamento MovieLens puro: quante volte il bersaglio e' nel top-N della co-visione ML
print("=== RECALL@N — il bersaglio giusto e' nel top-N? (1.002 legami, protocollo a parita') ===")
print(f"{'segnale':<38} " + " ".join(f"{('N='+str(k)):>8}" for k in NS))
for nome, fn in SEGNALI.items():
    conteggi = {k: 0 for k in NS}; tot_l = 0
    for s in test:
        a = row_of.get(s["id"])
        if a is None: continue
        sc = fn(a).copy(); sc[a] = -9
        order = np.argsort(-sc)
        rank = np.empty(n, np.int32); rank[order] = np.arange(n)
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None or l["type"] == s["id"].split(":")[0]: continue
            tot_l += 1
            for k in NS:
                if rank[b] < k: conteggi[k] += 1
    print(f"{nome:<38} " + " ".join(f"{100*conteggi[k]/max(1,tot_l):7.1f}%" for k in NS))
print(f"\nlegami di test: {tot_l}")
print("\nLETTURA: se il contenuto ha recall alto a N grande e basso a N piccolo, le keyword")
print("descrivono bene il film ma non sanno ORDINARE -> vanno usate come generatore di candidati.")
