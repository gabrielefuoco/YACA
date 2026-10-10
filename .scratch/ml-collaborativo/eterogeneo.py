"""eterogeneo.py — GRAFO ETEROGENEO + SPREADING ACTIVATION vs SOMMA PESATA.
Tre tipi di arco: (1) contenuto = k-NN dello spazio Pc; (2) co-visione = i related di Trakt;
(3) curatela = i 3.533 legami scritti a mano (l'unico che attraversa i medium).
Spreading: random walk con restart, la dose (alpha) come manopola.
Misura: gli stessi 1.002 legami di test, protocollo a parita'. Confronto con la somma pesata (1,5%)."""
import json, pathlib, os
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix
ROOT = pathlib.Path(".").resolve(); ML = ROOT/".cache"/"movielens"
G = ROOT/".scratch"/"ml-collaborativo"/"gold"
d = json.loads((G/"cross-merged.json").read_text(encoding="utf-8"))
z = np.load(ML/"spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
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
# --- (1) CONTENUTO: k-NN dello spazio Pc ---
KNN = 15
rows, cols, vals = [], [], []
B = 4000
for i in range(0, n, B):
    sim = Pc2[i:i+B] @ Pc2.T
    for r in range(sim.shape[0]):
        sim[r, i+r] = -9
    idx = np.argpartition(-sim, KNN, axis=1)[:, :KNN]
    w = np.take_along_axis(sim, idx, 1)
    for r in range(sim.shape[0]):
        pos = w[r] > 0
        rows += [i+r]*int(pos.sum()); cols += list(idx[r][pos]); vals += list(w[r][pos])
Mk = normalizza(coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr())
print(f"(1) contenuto: {Mk.nnz:,} archi (k-NN k={KNN})")
# --- (2) CO-VISIONE: related di Trakt ---
rows, cols = [], []
for f in list(pathlib.Path(ROOT/".cache"/"trakt").glob("rel-movie-*.json")) + list(pathlib.Path(ROOT/".cache"/"trakt").glob("rel-tv-*.json")):
    try: rel = json.loads(f.read_text(encoding="utf-8"))
    except Exception: continue
    if not isinstance(rel, list): continue
    m = f.name.split("-")[1]                       # movie | tv
    # la sorgente: ricavata dal nome file (imdb) -> non l'abbiamo: uso gli id dentro le voci
    for voce in rel:
        t = (voce.get("ids") or {}).get("tmdb")
        if not t: continue
        k = f"{m}:{int(t)}"
        r = row_of.get(k)
        if r is None: continue
        for alt in rel:
            t2 = (alt.get("ids") or {}).get("tmdb")
            if not t2 or t2 == t: continue
            k2 = f"{m}:{int(t2)}"
            r2 = row_of.get(k2)
            if r2 is not None: rows.append(r); cols.append(r2)
Mb = normalizza(coo_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(n, n)).tocsr())
print(f"(2) co-visione: {Mb.nnz:,} archi (related Trakt)")
# --- (3) CURATELA ---
rows, cols, vals = [], [], []
for s in train:                    # SOLO IL TRAIN: da src sarebbe contaminazione (97,2% falso)
    a = row_of.get(s["id"])
    if a is None: continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None: continue
        rows += [a, b]; cols += [b, a]; vals += [float(l.get("w", 1))]*2
Mc = normalizza(coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr())
print(f"(3) curatela: {Mc.nnz:,} archi")
def spreading(M, e, alpha, iters=20):
    x = e.copy()
    for _ in range(iters):
        x = alpha * (M.T @ x) + (1 - alpha) * e
    return x
def misura(nome, punteggio):
    NS = [10, 50, 100, 500, 2000]
    cnt = {k: 0 for k in NS}; tot_l = 0
    for s in test:
        a = row_of.get(s["id"])
        if a is None: continue
        sc = punteggio(a).copy(); sc[a] = -9
        order = np.argsort(-sc)
        rank = np.empty(n, np.int32); rank[order] = np.arange(n)
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None or l["type"] == s["id"].split(":")[0]: continue
            tot_l += 1
            for k in NS:
                if rank[b] < k: cnt[k] += 1
    print(f"  {nome:<30} " + " · ".join(f"@{k} {100*cnt[k]/max(1,tot_l):4.1f}%" for k in NS) + f"  ({cnt[10]}/{tot_l})")
    return cnt[10]/max(1,tot_l)
print("\n=== SPREADING ACTIVATION SUL GRAFO ETEROGENEO (1.002 legami di test) ===")
e = np.zeros(n, np.float32)
def run(nome, M, alpha):
    def punteggio(a):
        e[:] = 0; e[a] = 1.0
        return spreading(M, e, alpha)
    return misura(nome, punteggio)
print("-- un solo tipo di arco (alpha 0.7) --")
run("solo contenuto", Mk, 0.7)
run("solo co-visione", Mb, 0.7)
run("solo curatela", Mc, 0.7)
print("-- eterogeneo: somma normalizzata degli archi --")
for wa in ((0.4, 0.3, 0.3), (0.25, 0.25, 0.5), (0.6, 0.2, 0.2)):
    M = normalizza((wa[0]*Mk + wa[1]*Mb + wa[2]*Mc).tocsr())
    for alpha in (0.7, 0.85):
        run(f"eterogeneo {wa} a={alpha}", M, alpha)
