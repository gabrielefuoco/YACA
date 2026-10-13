"""boot-2.py — IL TETTO DEL POOL, E L'ARCHITETTURA "POOL + RANKING".

Il report 42 propone: usare il cluster come POOL e ordinare dentro col miglior esperto.
Prima di provarci va misurato il tetto: se il bersaglio NON sta nel cluster della sorgente,
nessun ordinamento lo trovera' mai. Quel numero decide tutto.

  copertura(L[s])    quanti legami veri hanno il bersaglio nel cluster della sorgente
  copertura(pred[s]) idem, col cluster predetto dal contenuto
  ORACOLO            pool = i cluster dei bersagli veri -> il tetto assoluto dell'architettura

Poi le armi: pool x ordinamento (spreading).
"""
import json, pathlib, time
from collections import Counter
import numpy as np
from scipy.sparse import csr_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
G = ROOT / ".scratch" / "ml-collaborativo" / "gold"
z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")


def centra(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


Pc2 = centra(Pc)
Pcn = Pc2 / (np.linalg.norm(Pc2, axis=1, keepdims=True) + 1e-9)


def carica(nome):
    q = np.load(ML / nome)
    return csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


def normalizza(A):
    A = A.tocsr().astype(np.float64)
    s = np.asarray(A.sum(1)).ravel()
    s[s == 0] = 1
    return csr_matrix(A.multiply(1.0 / s[:, None]))


C, B, Tm, K = carica("boot-C.npz"), carica("boot-B.npz"), carica("boot-T.npz"), carica("boot-Kpari.npz")
WT, WC = 0.25, 0.88
M_r = normalizza((1 - WC) * (1 - WT) * (0.5 * C + 0.5 * B) + (1 - WC) * WT * Tm + WC * K)

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

q = np.load(ML / "boot-1.npz")
L, pred = q["L"], q["pred"]
print(f"struttura caricata: {len(np.bincount(L))} cluster ({time.time()-t0:.0f}s)")

# ---------------- IL TETTO DEL POOL ----------------
print("")
print("=" * 90)
print("COPERTURA DEL POOL — il bersaglio sta nel cluster della sorgente?")
print("=" * 90)
in_L = L[BERS] == L[SOGG]
in_pred = L[BERS] == pred[SOGG]
print(f"  nel cluster GRAFO della sorgente L[s]:     {int(in_L.sum()):>4}/{len(BERS)} = {100*in_L.mean():5.1f}%")
print(f"  nel cluster PREDETTO dal contenuto:        {int(in_pred.sum()):>4}/{len(BERS)} = {100*in_pred.mean():5.1f}%")
print(f"  in uno dei due:                            {int((in_L|in_pred).sum()):>4}/{len(BERS)} = {100*(in_L|in_pred).mean():5.1f}%")
print(f"\n  riferimento: lo spreading senza pool fa 11,2% @10.")
print(f"  Se la copertura del pool e' sotto ~11%, l'architettura pool+ranking NON PUO' vincere.")

# ---------------- ordinamento: spreading ----------------
def rwr(M, alpha=0.7, iters=20):
    X = E.copy()
    for _ in range(iters):
        X = alpha * (M.T @ X) + (1 - alpha) * E
    return X


X = rwr(M_r)
R = np.empty(X.shape, dtype=np.int32)
for j in range(X.shape[1]):
    R[np.argsort(-X[:, j]), j] = np.arange(n)
print(f"\nspreading fatto ({time.time()-t0:.0f}s)")

film_idx = np.where(~is_tv)[0]
MOLTO = 10 ** 9
CHIAVI = ("A0 spreading puro (nessun pool, riferimento)",
          "A7  pool=L[s]  + ordine spreading",
          "A8  pool=pred[s] + ordine spreading",
          "A9  pool=L[s] ∪ pred[s] + spreading",
          "A10 pool=top-2000 contenuto + spreading",
          "A11 ORACOLO · pool=cluster dei bersagli + spreading")
RIS = {k: np.full(len(BERS), MOLTO, np.int64) for k in CHIAVI}
RIS[CHIAVI[0]] = R[BERS, COL]

bers_di = {}
for i, s in enumerate(SOGG):
    bers_di.setdefault(int(s), []).append(i)
for s, posizioni in bers_di.items():
    rank = R[:, col_of[s]]
    pool7 = (L == L[s])
    pool8 = (L == pred[s])
    sim = Pcn[s] @ Pcn.T
    top10k = set(np.argsort(-sim)[:2000].tolist())
    for pos in posizioni:
        b = BERS[pos]
        if pool7[b]:
            RIS[CHIAVI[1]][pos] = int(rank[b])
        if pool8[b]:
            RIS[CHIAVI[2]][pos] = int(rank[b])
        if pool7[b] or pool8[b]:
            RIS[CHIAVI[3]][pos] = int(rank[b])
        if b in top10k:
            RIS[CHIAVI[4]][pos] = int(rank[b])
        # oracolo: il pool contiene il cluster del bersaglio
        RIS[CHIAVI[5]][pos] = int(rank[b]) if (L[b] == L[s] or L[b] == pred[s]) else MOLTO

NS = (10, 50, 100, 500, 2000)
print("")
print("=" * 90)
print(f"{'arma':<46} " + " ".join(f"{('@'+str(k)):>7}" for k in NS))
for k in CHIAVI:
    v = RIS[k]
    print(f"{k:<46} " + " ".join(f"{100*float((v<N).mean()):6.1f}%" for N in NS))

# l'oracolo VERO: pool = qualunque cluster che contenga un bersaglio vero
oracolo = np.full(len(BERS), MOLTO, np.int64)
for s, posizioni in bers_di.items():
    rank = R[:, col_of[s]]
    for pos in posizioni:
        oracolo[pos] = int(rank[BERS[pos]])
print("")
print(f"{'ORACOLO PURO (conta solo se e\' raggiungibile dalla spreading)':<46} "
      + " ".join(f"{100*float((oracolo<N).mean()):6.1f}%" for N in NS))
print(f"\n({time.time()-t0:.0f}s)")
