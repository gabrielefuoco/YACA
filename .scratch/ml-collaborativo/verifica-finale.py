"""verifica-finale.py — IL VINCITORE SUI 1.000 DI VERIFICA + L'AUDIT DELLE FOGLIE PULITO.

PARTE 1. La configurazione scelta nella calibrazione (CF x5, k=60, beta 0.5, curatela 0.60)
si riporta sui 1.000 utenti di VERIFICA, che non hanno partecipato a nessuna scelta.
Confronto con la base (pesi uguali, k=15, beta 0) sugli stessi utenti.

PARTE 2. L'audit delle foglie era stato fatto nello spazio `Pc` CONTAMINATO (report 46):
coerenza 0,744, "non migliorabili spezzandole". Va rifatto nello spazio dei METADATI PULITI
per sapere se le foglie sono buone di contenuto o di pubblico.
"""
import json, pathlib, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, coo_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
GOLD = ROOT / ".scratch" / "ml-collaborativo" / "gold"
NSF = (10, 100, 500, 2000)
NSC = (10, 100, 500, 2000)


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
VET = {nome: np.load(ML / f)[ch] for nome, (f, ch) in SPAZI.items()}
G = {nome: carica(f"boot-{c}.npz") for nome, c in (("B", "B"), ("T", "T"), ("K", "Kpari"))}
K = G["K"]
print(f"materiale pronto ({time.time()-t0:.0f}s)")

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
VER = np.random.default_rng(9).choice(buoni, size=2000, replace=False)[1000:]
sub = rr[rr.userId.isin(set(VER.tolist()))]
gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
PROF, ORO = {}, {}
r2 = np.random.default_rng(7)
for u in VER:
    righe = np.unique(gruppi[u])
    if len(righe) < 20:
        continue
    perm = r2.permutation(len(righe))
    t = int(0.6 * len(righe))
    PROF[u] = righe[perm[:t]]
    ORO[u] = set(righe[perm[t:]].tolist())
US = np.array(list(PROF.keys()))
E = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    E[PROF[u], j] = 1.0
print(f"verifica: {len(US):,} utenti ({time.time()-t0:.0f}s)")

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
idx_film = np.where(~is_tv)[0]
den_f = sum(len(ORO[u]) for u in US)


def correggi_hub(A, beta):
    if beta <= 0:
        return A
    ind = np.asarray((A > 0).sum(0)).ravel().astype(np.float64)
    return normalizza(csr_matrix(A.multiply((1.0 / np.maximum(ind, 1.0) ** beta)[None, :])))


def valuta(pesi, wc, beta, k, nome):
    C = {nm: topk_edges(V, k) for nm, V in VET.items()}
    print(f"  k-NN costruiti ({time.time()-t0:.0f}s)", flush=True)
    tot = sum(pesi.values())
    M = None
    for nm, w in pesi.items():
        A = correggi_hub(C[nm] if nm in C else G[nm], beta)
        M = (A * ((1 - wc) * w / tot)) if M is None else M + A * ((1 - wc) * w / tot)
    M = normalizza((M + wc * K).tocsr())
    X = E.copy()
    for _ in range(20):
        X = 0.30 * (M.T @ X) + 0.70 * E
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
    R = np.empty(X.shape, np.int32)
    for j in range(X.shape[1]):
        R[np.argsort(-X[:, j]), j] = np.arange(n)
    riga_f = []
    for N in NSF:
        hit = 0
        for j, u in enumerate(US):
            subr = R[idx_film, j]
            scelti = idx_film[np.argpartition(subr, N)[:N]]
            hit += sum(1 for x in scelti if int(x) in ORO[u])
        riga_f.append(100 * hit / den_f)
    XC = np.zeros((n, len(USC)), np.float32)
    XC = EC.copy()
    for _ in range(20):
        XC = 0.70 * (M.T @ XC) + 0.30 * EC
    RC = np.empty(XC.shape, np.int32)
    for j in range(XC.shape[1]):
        RC[np.argsort(-XC[:, j]), j] = np.arange(n)
    rk = RC[BERS, COLC]
    riga_c = [100 * float((rk < N).mean()) for N in NSC]
    print(f"  {nome:<40} " + " ".join(f"cF@{N} {v:5.2f}%" for N, v in zip(NSF, riga_f)) + " | " +
          " ".join(f"cur@{N} {v:5.2f}%" for N, v in zip(NSC, riga_c)) + f"  ({time.time()-t0:.0f}s)", flush=True)
    del C, M, X, R, XC, RC


print("")
print("=" * 112)
print("VERIFICA FINALE — 1.000 utenti che non hanno partecipato a nessuna scelta")
print("=" * 112)
valuta({"CF": 1, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, 0.60, 0.00, 15, "BASE (pesi uguali, k=15, beta 0)")
valuta({"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, 0.60, 0.50, 60, "SCELTO (CF x5, k=60, beta 0.5)")
valuta({"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, 0.80, 0.50, 30, "SCELTO per il CURATO (curatela 0.8)")

# ---------------- PARTE 2: l'audit delle foglie, spazio pulito ----------------
print("")
print("=" * 112)
print("AUDIT DELLE FOGLIE — spazio dei METADATI PULITI contro lo spazio contaminato")
print("=" * 112)
al = json.loads((ML / "albero.json").read_text(encoding="utf-8"))
foglia = np.full(n, -1, np.int64)
for i, f in enumerate(al["foglie"]):
    for k in al["members"]:
        r = row_of.get(k)
        if r is not None:
            foglia[r] = f["id"]
ids = np.array(sorted(set(foglia[foglia >= 0].tolist())))


def coerenza(V, nome):
    out = []
    for c in ids:
        m = np.where(foglia == c)[0]
        k = len(m)
        if k < 2:
            continue
        S = V[m].sum(0)
        out.append((float(S @ S) - k) / (k * (k - 1)))
    out = np.array(out)
    print(f"  {nome:<34} mediana {np.median(out):.3f} · 10°ile {np.percentile(out,10):.3f} · "
          f"sotto 0.20: {100*np.mean(out<0.20):4.1f}%")
    return out


def normalizza_righe(P):
    Q = P.astype(np.float64).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


Pc = np.load(ML / "spazi-trakt.npz", allow_pickle=True)["Pc"]
a = coerenza(normalizza_righe(Pc), "Pc (CONTAMINATO — report 46)")
b = coerenza(normalizza_righe(np.load(ML / "spazio-pulito.npz")["P"]), "METADATI PULITI")
Cf = np.load(ML / "cf-spazio.npz")["Cf"]
c = coerenza(normalizza_righe(Cf), "COMPORTAMENTO (CF)")
print("")
print(f"  correlazione fra la coerenza nei due spazi: {np.corrcoef(a, b)[0,1]:.3f}")
print(f"  foglie che passano da sopra a sotto 0,20 cambiando spazio: "
      f"{int(((a>=0.20)&(b<0.20)).sum())} · viceversa {int(((a<0.20)&(b>=0.20)).sum())}")
print(f"\n({time.time()-t0:.0f}s)")
