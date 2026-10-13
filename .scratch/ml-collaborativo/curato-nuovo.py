"""curato-nuovo.py — IL METRO CURATO, RIFATTO SUL GRAFO NUOVO.

Il buco: la sessione ha cambiato il grafo (report 48-49) ma ha rimisurato SOLO sul prodotto
(MovieLens, solo film) e su Trakt. Il metro curato — i 1.002 legami cross-medium scritti a mano,
tenuti fuori — e' l'unico giudizio ESPERTO sul ponte fra i medium, ed e' rimasto fermo al
grafo vecchio e contaminato (18,35% col RRF, 10,4% con la spreading sola).

Protocollo identico a quello storico (etero2.py): sorgenti a indice pari = curatela nel grafo,
indice dispari = legami di test, solo cross-medium, restart alpha.

Si misura la spreading sola, per confronto diretto col 10,4% di allora.
"""
import json, pathlib, time
import numpy as np
from scipy.sparse import csr_matrix, coo_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
GOLD = ROOT / ".scratch" / "ml-collaborativo" / "gold"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


def carica(nm):
    q = np.load(ML / nm)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


def topk_edges(V, k, min_sim=0.05, B=1000):
    Vn = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
    rows, cols, vals = [], [], []
    for i in range(0, n, B):
        sim = Vn[i:i + B] @ Vn.T
        for r in range(sim.shape[0]):
            sim[r, i + r] = -9
        idx = np.argpartition(-sim, k, axis=1)[:, :k]
        w = np.take_along_axis(sim, idx, 1)
        for r in range(sim.shape[0]):
            pos = w[r] >= min_sim
            rows += [i + r] * int(pos.sum())
            cols += list(idx[r][pos])
            vals += list(w[r][pos])
    A = coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr()
    return normalizza((A + A.T) * 0.5)


# --- i legami di test: sorgenti a indice DISPARI, solo cross-medium ---
d = json.loads((GOLD / "cross-merged.json").read_text(encoding="utf-8"))
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
print(f"legami di test cross-medium: {len(BERS)} da {len(US)} sorgenti ({time.time()-t0:.0f}s)")

# --- componenti ---
CF = topk_edges(np.load(ML / "cf-spazio.npz")["Cf"], 15)
CFst = topk_edges(np.load(ML / "cf-studente.npz")["P"], 15)
Kc = topk_edges(np.load(ML / "spazio-pulito.npz")["P"], 15)
B = carica("boot-B.npz")
Tm = carica("boot-T.npz")
K = carica("boot-Kpari.npz")
C_pc = carica("boot-C.npz")
print(f"componenti pronti ({time.time()-t0:.0f}s)")

NS = (10, 50, 100, 500, 2000)


def misura(M, nome, alpha=0.7):
    X = E.copy()
    for _ in range(20):
        X = alpha * (M.T @ X) + (1 - alpha) * E
    R = np.empty(X.shape, np.int32)
    for j in range(X.shape[1]):
        R[np.argsort(-X[:, j]), j] = np.arange(n)
    rk = R[BERS, COL]
    out = {N: 100 * float((rk < N).mean()) for N in NS}
    print(f"  {nome:<44} " + " · ".join(f"@{N} {out[N]:5.1f}%" for N in NS), flush=True)
    return out


def comp(*parti, wc=0.60):
    w = (1 - wc) / len(parti)
    return normalizza((sum(w * p for p in parti) + wc * K).tocsr())


print("")
print("=" * 100)
print("IL METRO CURATO (1.002 legami cross-medium tenuti fuori) SUL GRAFO NUOVO")
print("=" * 100)
print("  (il riferimento storico era: spreading sola 10,4% @10 · RRF 18,9% @10 · verifica 18,35%)")
print("")
for wc in (0.40, 0.60, 0.88):
    misura(comp(CF, Kc, B, Tm, wc=wc), f"NUOVO  CF+Kc+B+T+K  curatela {wc}")
misura(comp(CF, CFst, Kc, B, Tm, wc=0.60), "NUOVO + CFst  curatela 0.60")
misura(comp(CF, wc=0.60), "solo comportamento CF  curatela 0.60")
misura(normalizza(0.15 * C_pc + 0.15 * B + 0.10 * Tm + 0.60 * K), "VECCHIO CONTAMINATO (rif.)")
print(f"\n({time.time()-t0:.0f}s)")
