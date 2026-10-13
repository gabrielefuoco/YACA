"""boot-0.py — RIPRODURRE IL RIFERIMENTO PRIMA DI MISURARE QUALSIASI COSA.

A0 (spreading sul grafo) mi ha dato 2,8% @10 dove il report 41 riporta 10,4%.
Quale composizione del grafo e' quella giusta? Provo le varianti e cerco quella che riproduce.

Componenti cachati (boot-C/B/T/Kpari.npz), tutte normalizzate per riga, curatela dal solo pari.
"""
import json, pathlib, time
import numpy as np
from scipy.sparse import csr_matrix

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


def carica(nome):
    q = np.load(ML / nome)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


C, B, Tm, K = carica("boot-C.npz"), carica("boot-B.npz"), carica("boot-T.npz"), carica("boot-Kpari.npz")
d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
test = [s for i, s in enumerate(d["sources"]) if i % 2 == 1]
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
E = np.zeros((n, len(US)), np.float32)
E[US, np.arange(len(US))] = 1.0
print(f"{len(BERS)} legami, {len(US)} sorgenti")


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


def rwr(M, alpha, iters=20):
    X = E.copy()
    for _ in range(iters):
        X = alpha * (M.T @ X) + (1 - alpha) * E
    return X


def misura(M, alpha, nome):
    X = rwr(M, alpha)
    R = np.empty(X.shape, dtype=np.int32)
    for j in range(X.shape[1]):
        R[np.argsort(-X[:, j]), j] = np.arange(n)
    rk = R[BERS, COL]
    out = {N: 100 * float((rk < N).mean()) for N in (10, 50, 100, 500, 2000)}
    print(f"  {nome:<46} " + " · ".join(f"@{N} {out[N]:4.1f}%" for N in (10, 50, 100, 500)))
    return out


print("")
print("=== varianti di composizione (stile etero2: normalizza DOPO la somma pesata) ===")
for wc in (0.4, 0.6, 0.75, 0.88):
    Mk = (1 - wc) * C + (1 - wc) * B + wc * K
    M = normalizza(Mk)
    for alpha in (0.5, 0.6, 0.7, 0.85):
        misura(M, alpha, f"curatela {wc} · contenuto+co-vis · alpha {alpha}")

print("")
print("=== con i temi dentro (stile leiden2, riscalato) ===")
for wt in (0.25, 0.5, 0.75):
    for wc in (0.4, 0.6, 0.88):
        Mk = (1 - wc) * (0.5 * C + 0.5 * B) * (1 - wt) + wt * (1 - wc) * Tm + wc * K
        M = normalizza(Mk)
        misura(M, 0.7, f"temi {wt} · curatela {wc} · alpha 0.7")

print("")
print("=== stile leiden2 puro (non rinormalizzato dopo la somma) ===")
Ml = (C + B + Tm + 6.0 * K).tocsr()
Ml.sum_duplicates()
Ml = ((Ml + Ml.T) * 0.5).tocsr()
for alpha in (0.5, 0.7, 0.85):
    misura(Ml, alpha, f"leiden2 puro · alpha {alpha}")
print(f"\n({time.time()-t0:.0f}s)")
