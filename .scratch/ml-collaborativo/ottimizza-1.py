"""ottimizza-1.py — HUB, PESI E k SUL GRAFO NUOVO.

Tre cose mai fatte dopo il cambio di grafo (report 55):
  1. LA CORREZIONE DELL'HUB. Il 22,9% dei film che non entra mai e' 4,12x meno popolare:
     il tetto e' la popolarita'. La forma principled e' l'esponente di correzione del grado:
         P(i -> j)  ∝  A_ij / d_j^beta
     beta=0 = quello che abbiamo oggi (riga normalizzata) · beta=1 = cammino simmetrico,
     la probabilita' di finire su un nodo non dipende piu' dal suo grado.
  2. I PESI della composizione, che sono eredita' dell'era contaminata.
  3. IL k dei k-NN, mai ritoccato dopo il report 41.

Si sceglie sulla CALIBRAZIONE e si riporta sulla VERIFICA. Due metri, per non ottimizzarne
uno distruggendo l'altro: il CATALOGO FILM (prodotto) e il METRO CURATO (giudizio esperto).
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, coo_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
GOLD = ROOT / ".scratch" / "ml-collaborativo" / "gold"
NSF = (10, 100, 500, 2000)
NSC = (10, 100, 500, 2000)
N_UTENTI = 200          # ridotto: lo sweep e sulla FRONTIERA, il prodotto serve solo come secondo asse


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


z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")

SPAZI = {"CF": ("cf-spazio.npz", "Cf"), "CFst": ("cf-studente.npz", "P"), "Kc": ("spazio-pulito.npz", "P")}
G = {nome: carica(f"boot-{c}.npz") for nome, c in (("B", "B"), ("T", "T"), ("K", "Kpari"), ("Pc", "C"))}
VET = {nome: np.load(ML / f)[chiave] for nome, (f, chiave) in SPAZI.items()}
K = G["K"]
print(f"materiale pronto ({time.time()-t0:.0f}s)")

TOPK = {}


def componenti(k):
    """i k-NN degli spazi, cachati per k: si ricostruiscono solo quando k cambia"""
    if k not in TOPK:
        TOPK[k] = {nome: topk_edges(V, k) for nome, V in VET.items()}
        print(f"  (costruiti i k-NN con k={k}: {time.time()-t0:.0f}s)", flush=True)
    return TOPK[k]

# --- i due banchi ---
links = pd.read_csv(ML / "ml-32m" / "links.csv")
m2r = {}
for mid, tid in zip(links["movieId"], links["tmdbId"]):
    if pd.isna(tid):
        continue
    r = row_of.get(f"movie:{int(tid)}")
    if r is not None:
        m2r[int(mid)] = r
rr = pd.read_parquet(ML / "ratings-puliti.parquet")
rr["row"] = rr["movieId"].map(m2r)
rr = rr.dropna(subset=["row"])
rr["row"] = rr["row"].astype(np.int64)
cnt = rr.groupby("userId").size()
buoni = cnt[cnt >= 20].index.values
SCELTI = np.random.default_rng(9).choice(buoni, size=2000, replace=False)
CAL, VER = SCELTI[:1000], SCELTI[1000:]


def prepara(utenti, quanti):
    sub = rr[rr.userId.isin(set(utenti.tolist()))]
    gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
    prof, oro = {}, {}
    r2 = np.random.default_rng(7)
    for u in utenti:
        righe = np.unique(gruppi[u])
        if len(righe) < 20:
            continue
        perm = r2.permutation(len(righe))
        t = int(0.6 * len(righe))
        prof[u] = righe[perm[:t]]
        oro[u] = set(righe[perm[t:]].tolist())
        if len(prof) >= quanti:
            break
    return prof, oro


PROF, ORO = prepara(CAL, N_UTENTI)
US = np.array(list(PROF.keys()))
print(f"calibrazione: {len(US)} utenti ({time.time()-t0:.0f}s)")

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
USC = np.unique(SOGG)
colc = {int(u): i for i, u in enumerate(USC)}
COLC = np.array([colc[int(x)] for x in SOGG])
EC = np.zeros((n, len(USC)), np.float32)
EC[USC, np.arange(len(USC))] = 1.0


def rwr(M, E, alpha=0.30, iters=20):
    X = E.copy()
    for _ in range(iters):
        X = alpha * (M.T @ X) + (1 - alpha) * E
    return X


def correggi_hub(A, beta):
    if beta <= 0:
        return A
    ind = np.asarray((A > 0).sum(0)).ravel().astype(np.float64)
    fatt = 1.0 / np.maximum(ind, 1.0) ** beta
    return normalizza(csr_matrix(A.multiply(fatt[None, :])))


def costruisci(pesi, wc, beta, k):
    tot = sum(pesi.values())
    C = componenti(k)
    M = None
    for nome, w in pesi.items():
        A = correggi_hub(C[nome] if nome in C else G[nome], beta)
        M = (A * ((1 - wc) * w / tot)) if M is None else M + A * ((1 - wc) * w / tot)
    return normalizza((M + wc * K).tocsr())


print("")
print("=" * 112)
print("SWEEP — si sceglie sulla calibrazione · catalogo FILM (prodotto) e metro curato (esperto)")
print("=" * 112)
print(f"{'configurazione':<40} {'k':>4} {'beta':>5} | " +
      " ".join(f"{('cF@'+str(x)):>8}" for x in NSF) + " | " +
      " ".join(f"{('cur@'+str(x)):>8}" for x in NSC))


def valuta_tutto(pesi, wc, beta, k, nome):
    M = costruisci(pesi, wc, beta, k)
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0
    X = rwr(M, E)
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
    R = np.empty(X.shape, np.int32)
    for j in range(X.shape[1]):
        R[np.argsort(-X[:, j]), j] = np.arange(n)
    idx_film = np.where(~is_tv)[0]
    den_f = sum(len(ORO[u]) for u in US)
    riga_f = []
    for N in NSF:
        hit = 0
        for j, u in enumerate(US):
            sub = R[idx_film, j]
            scelti = idx_film[np.argpartition(sub, N)[:N]]
            hit += sum(1 for x in scelti if int(x) in ORO[u])
        riga_f.append(100 * hit / den_f)
    XC = rwr(M, EC, alpha=0.7)
    RC = np.empty(XC.shape, np.int32)
    for j in range(XC.shape[1]):
        RC[np.argsort(-XC[:, j]), j] = np.arange(n)
    rk = RC[BERS, COLC]
    riga_c = [100 * float((rk < N).mean()) for N in NSC]
    print(f"{nome:<40} {k:>4} {beta:>5.2f} | " +
          " ".join(f"{v:7.2f}%" for v in riga_f) + " | " +
          " ".join(f"{v:7.2f}%" for v in riga_c) + f"   ({time.time()-t0:.0f}s)", flush=True)
    del E, X, R, XC, RC
    return riga_f, riga_c


import json as _j, sys as _s
CONF = _j.loads(pathlib.Path(_s.argv[1]).read_text(encoding="utf-8"))
for c in CONF:
    valuta_tutto(c["pesi"], c["wc"], c["beta"], c["k"], c["nome"])
print(f"\nFINE ({time.time()-t0:.0f}s)")
