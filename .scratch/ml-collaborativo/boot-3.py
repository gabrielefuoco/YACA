"""boot-3.py — LA CURVA DELLA CURATELA.

Il bootstrap e' morto (boot-1, boot-2). Il meccanismo che FUNZIONA e' la spreading, che
trasferisce la struttura per camminata: serie -> pari contenutistico -> film curato.
Se e' cosi', la leva non e' un algoritmo migliore ma PIU' CURATELA. Quanto vale?

Curva: costruisco il grafo con il 25%, 50%, 75%, 100% delle sorgenti pari (la curatela
disponibile), e misuro sempre sugli stessi 1.002 legami dispari tenuti fuori.
Se la curva e' ancora in salita a 100%, ogni legame scritto in piu' vale.
"""
import json, pathlib, time
import numpy as np
from scipy.sparse import coo_matrix, csr_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"
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


def carica(nome):
    q = np.load(ML / nome)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


C, B, Tm = carica("boot-C.npz"), carica("boot-B.npz"), carica("boot-T.npz")
d = json.loads((G / "cross-merged.json").read_text(encoding="utf-8"))
src = d["sources"]
pari = [s for i, s in enumerate(src) if i % 2 == 0]
disp = [s for i, s in enumerate(src) if i % 2 == 1]
print(f"curatela disponibile: {len(pari)} sorgenti pari · test su {len(disp)} dispari")

SOGG, BERS = [], []
for s in disp:
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


def curatela(sorgenti):
    rows, cols, vals = [], [], []
    for s in sorgenti:
        a = row_of.get(s["id"])
        if a is None:
            continue
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None:
                continue
            rows += [a, b]
            cols += [b, a]
            vals += [float(l.get("w", 1))] * 2
    return normalizza(coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsr())


def rwr(M, alpha=0.7, iters=20):
    X = E.copy()
    for _ in range(iters):
        X = alpha * (M.T @ X) + (1 - alpha) * E
    return X


def misura(M, nome):
    X = rwr(M)
    R = np.empty(X.shape, dtype=np.int32)
    for j in range(X.shape[1]):
        R[np.argsort(-X[:, j]), j] = np.arange(n)
    rk = R[BERS, COL]
    out = {N: 100 * float((rk < N).mean()) for N in (10, 50, 100, 500, 2000)}
    print(f"  {nome:<42} " + " · ".join(f"@{N} {out[N]:4.1f}%" for N in (10, 50, 100, 500, 2000)))
    return out


WT, WC = 0.25, 0.88
print("")
print("=" * 92)
print("CURVA DELLA CURATELA — sempre gli stessi 1.002 legami tenuti fuori")
print("=" * 92)
rng = np.random.default_rng(7)
perm = rng.permutation(len(pari))
base = (1 - WC) * (1 - WT) * (0.5 * C + 0.5 * B) + (1 - WC) * WT * Tm
print(f"  {'NESSUN legame curato (solo contenuto+co-vis+temi)':<42} ", end="")
misura(normalizza(base), " ")
for fraz in (0.25, 0.5, 0.75, 1.0):
    k = max(1, int(fraz * len(pari)))
    sel = [pari[i] for i in perm[:k]]
    K = curatela(sel)
    nleg = sum(len(s["links"]) for s in sel)
    nodi = int((np.asarray((K > 0).sum(1)).ravel() > 0).sum())
    misura(normalizza(base + WC * K), f"{int(100*fraz)}% · {k} sorgenti · {nleg} legami · {nodi} nodi")

# e il controllo che conta: la curatela e' PARI, quindi i legami dispari hanno bersagli
# che nessuna sorgente pari ha. Il tetto e' la copertura dei bersagli.
COPPIE = set()
for s in pari:
    a = row_of.get(s["id"])
    if a is None:
        continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is not None:
            COPPIE.add(b)
rag = np.array([b in COPPIE for b in BERS])
print("")
print(f"  bersagli dei legami di test raggiungibili in ASSOLUTO (presenti in >=1 lista pari): "
      f"{int(rag.sum())}/{len(BERS)} = {100*rag.mean():.1f}%")
print(f"  (sui raggiungibili la spreading puo' fare al massimo 100%)")
print(f"\n({time.time()-t0:.0f}s)")
