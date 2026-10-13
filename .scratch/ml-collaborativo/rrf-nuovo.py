"""rrf-nuovo.py — IL RRF A DUE STADI SUL GRAFO NUOVO.

Il report 41 aveva trovato che la fusione per ranghi (spreading + teacher) batte ogni singolo
esperto sul metro curato: 18,9% @10 e 36,9% @100, dove il migliore singolo faceva 10,7%.
Poi il grafo e' stato rifatto (report 48-49) e il RRF non e' mai stato ritestato: lo sweep del
report 56-57 ha ottimizzato una camminata a UNO stadio, che sul curato si ferma a 11,18% @10 e
26,45% @100. Qui si rimette il RRF sul grafo nuovo, a parita' di protocollo (pari = grafo,
dispari = test, alpha 0,7 come nel protocollo storico).

Esperti: la spreading sul grafo nuovo, e il teacher = similarita' nello spazio dei metadati puliti
(e in variante lo spazio del comportamento).
"""
import json, pathlib, time
import numpy as np
import scipy.sparse as sp
from scipy.sparse.linalg import svds

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
print(f"titoli: {n:,} ({is_tv.sum():,} serie)")

d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
src = d["sources"]
test = [s for i, s in enumerate(src) if i % 2 == 1]
SOGG, BERS = [], []
for s in test:
    a = row_of.get(s["id"])
    if a is None:
        continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None or l["type"] == s["id"].split(":")[0]:
            continue
        SOGG.append(a)
        BERS.append(b)
SOGG, BERS = np.array(SOGG), np.array(BERS)
US = np.unique(SOGG)
col_of = {int(u): i for i, u in enumerate(US)}
COL = np.array([col_of[int(x)] for x in SOGG])
print(f"legami di test cross-medium: {len(BERS):,} da {len(US)} sorgenti")


def topk_edges(V, k):
    Vn = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
    r, c, v = [], [], []
    B = 2048
    for i in range(0, Vn.shape[0], B):
        sim = Vn[i:i + B] @ Vn.T
        for j in range(sim.shape[0]):
            s = sim[j]
            s[i + j] = -2
            idx = np.argpartition(-s, k)[:k]
            m = s[idx] > 0.05
            r.extend([i + j] * int(m.sum()))
            c.extend(idx[m].tolist())
            v.extend(s[idx][m].tolist())
    M = sp.csr_matrix((v, (r, c)), shape=(Vn.shape[0], Vn.shape[0]), dtype=np.float32)
    return ((M + M.T) * 0.5).tocsr()


def carica(nome):
    q = np.load(ML / nome)
    return sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


K = 60
BETA = 0.50
print(f"componenti (k={K}) ...", flush=True)
CF = topk_edges(np.load(ML / "cf-spazio.npz")["Cf"], K)
CFst = topk_edges(np.load(ML / "cf-studente.npz")["P"], K)
Kc = topk_edges(np.load(ML / "spazio-pulito.npz")["P"], K)
B = carica("boot-B.npz")
Tm = carica("boot-T.npz")
Kp = carica("boot-Kpari.npz")
print(f"  pronti ({time.time()-t0:.0f}s)", flush=True)


def correggi_hub(M, beta):
    if beta == 0:
        return M
    M = M.tocoo()
    deg = np.asarray(M.sum(1)).ravel()
    w = np.power(np.maximum(deg[M.col], 1e-6), -beta)
    return sp.csr_matrix((M.data * w, (M.row, M.col)), shape=(n, n))


def normalizza(M):
    M = M.tocsr().astype(np.float32)
    d = np.asarray(M.sum(1)).ravel()
    return sp.diags(1.0 / np.maximum(d, 1e-9)).dot(M).tocsr()


def costruisci(pesi, wc):
    tot = sum(pesi.values())
    COMP = {"CF": CF, "CFst": CFst, "Kc": Kc, "B": B, "T": Tm}
    M = None
    for nome, w in pesi.items():
        A = correggi_hub(COMP[nome], BETA)
        M = (A * ((1 - wc) * w / tot)) if M is None else M + A * ((1 - wc) * w / tot)
    return normalizza((M + wc * Kp).tocsr())


def rwr(M, E, alpha, iters=20):
    X = E.copy()
    for _ in range(iters):
        X = alpha * (M.T @ X) + (1 - alpha) * E
    return X


def ranghi(X):
    R = np.empty(X.shape, np.int32)
    for j in range(X.shape[1]):
        R[np.argsort(-X[:, j]), j] = np.arange(n)
    return R


def misura(R, nome):
    rk = R[BERS, COL]
    out = [100 * float((rk < N).mean()) for N in (10, 50, 100, 500, 2000)]
    print(f"  {nome:<46} " + " · ".join(f"@{N} {v:5.2f}%" for N, v in
                                        zip((10, 50, 100, 500, 2000), out)), flush=True)
    return out


def centra(P):
    Q = P.astype(np.float32).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


# il teacher: similarita' nello spazio dei metadati puliti
Et = centra(np.load(ML / "spazio-pulito.npz")["P"])
# variante: il teacher nel comportamento
Cf = np.load(ML / "cf-spazio.npz")["Cf"]
Cf = Cf / (np.linalg.norm(Cf, axis=1, keepdims=True) + 1e-9)

E0 = np.zeros((n, len(US)), np.float32)
E0[US, np.arange(len(US))] = 1.0

RIS = {}
for wc in (0.60, 0.88):
    M = costruisci({"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, wc)
    print("")
    print("=" * 100)
    print(f"GRAFO NUOVO (CF5 k={K} beta={BETA}) · curatela {wc}")
    print("=" * 100)
    for alpha in (0.30, 0.70):
        Xs = rwr(M, E0, alpha)
        Rs = ranghi(Xs)
        RIS[f"spread wc{wc} a{alpha}"] = misura(Rs, f"spreading sola (alpha {alpha})")

        Rt = ranghi(Et @ Et[US].T)
        RIS[f"teacher-metadati wc{wc}"] = misura(Rt, "teacher SOLO (metadati puliti)")
        Rc = ranghi(Cf @ Cf[US].T)
        RIS[f"teacher-cf wc{wc}"] = misura(Rc, "teacher SOLO (comportamento)")

        for k0 in (60, 3000):
            Rr = ranghi(3.0 / (k0 + Rs) + 0.5 / (k0 + Rt))
            RIS[f"RRF meta wc{wc} a{alpha} k{k0}"] = misura(Rr, f"RRF spreading+metadati k={k0}")
            Rr2 = ranghi(3.0 / (k0 + Rs) + 0.5 / (k0 + Rc))
            RIS[f"RRF cf wc{wc} a{alpha} k{k0}"] = misura(Rr2, f"RRF spreading+comport. k={k0}")
        # somma lineare per confronto
        Rl = ranghi(0.7 * (Xs / (Xs.max() + 1e-9)) + 0.3 * ((Et @ Et[US].T) / (Et @ Et[US].T).max()))
        RIS[f"lineare wc{wc} a{alpha}"] = misura(Rl, "somma lineare 0,7/0,3")

print("")
print("=" * 100)
print("IL CONFRONTO CHE CONTA — metro curato, @10 e @100")
print("=" * 100)
print(f"  {'riferimento storico: RRF k=3000 (report 41, grafo contaminato)':<58} @10 18,90% · @50 32,50% · @100 36,90% · @500 50,00% · @2000 67,60%")
print(f"  {'il grafo nuovo a UNO stadio (report 57)':<58} @10 11,18% · @100 26,45% · @500 50,00% · @2000 70,26%")
print("")
best = max(RIS.items(), key=lambda kv: kv[1][0])
print(f"  migliore qui: {best[0]} → @10 {best[1][0]:.2f}% · @100 {best[1][2]:.2f}%")
print(f"\n({time.time()-t0:.0f}s)")
