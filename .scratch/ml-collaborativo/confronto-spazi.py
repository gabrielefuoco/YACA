"""confronto-spazi.py — IL CONTRASTIVO BATTE LE KEYWORD PULITE?

Le tre prove, sulla stessa misura di `titoli-nuovi.py` (5.000 film fatti nascere: solo keyword
e temi, nessun CF / co-visione / curatela) e sul grafo di recupero.

  E0 · SENZA keyword   Kc assente: al titolo nuovo restano solo i temi -> il nullo
  E1 · KEYWORD PULITE  Kc = SVD 128 del TF-IDF (report 49)
  E2 · CONTRASTIVO     Kc = encoder InfoNCE verso il comportamento (idea dell'utente)

Uso: python confronto-spazi.py [spazio.npz]
"""
import pathlib, sys, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, coo_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
NOME_SPAZIO = sys.argv[1] if len(sys.argv) > 1 else "spazio-contrastivo.npz"
N_ERASE = 5000

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


def maschera(A, film):
    A = A.tolil()
    A[film, :] = 0
    A[:, film] = 0
    return normalizza(A.tocsr())


# --- gli stessi 5.000 film di titoli-nuovi.py ---
Cf = np.load(ML / "cf-spazio.npz")["Cf"]
con_beh = np.where(np.linalg.norm(Cf, axis=1) > 1e-6)[0]
ERASE = np.random.default_rng(41).choice(con_beh, size=N_ERASE, replace=False)
erase = np.zeros(n, bool)
erase[ERASE] = True
Cf2 = Cf.copy()
Cf2[erase] = 0.0
CF2 = topk_edges(Cf2, 15)
B2 = maschera(carica("boot-B.npz"), ERASE)
K2 = maschera(carica("boot-Kpari.npz"), ERASE)
Tm = carica("boot-T.npz")
print(f"componenti comuni pronti ({time.time()-t0:.0f}s)")

Kc_pulite = topk_edges(np.load(ML / "spazio-pulito.npz")["P"], 15)
print(f"keyword pulite: {Kc_pulite.nnz:,} archi ({time.time()-t0:.0f}s)")
Kc_nuove = topk_edges(np.load(ML / NOME_SPAZIO)["P"], 15)
print(f"keyword «{NOME_SPAZIO}»: {Kc_nuove.nnz:,} archi ({time.time()-t0:.0f}s)")


def comp(*parti):
    w = 0.40 / len(parti)
    return normalizza((sum(w * p for p in parti) + 0.60 * K2).tocsr())


ARMI = {
    "E0 · SENZA keyword (nullo)": comp(CF2, B2, Tm),
    "E1 · KEYWORD PULITE (SVD TF-IDF)": comp(Kc_pulite, CF2, B2, Tm),
    f"E2 · {NOME_SPAZIO} + CF": comp(Kc_nuove, CF2, B2, Tm),
}
del Kc_pulite

# --- utenti di verifica ---
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
r3 = np.random.default_rng(7)
for u in VER:
    righe = np.unique(gruppi[u])
    if len(righe) < 20:
        continue
    perm = r3.permutation(len(righe))
    t = int(0.6 * len(righe))
    PROF[u] = righe[perm[:t]]
    ORO[u] = righe[perm[t:]]
US = np.array(list(PROF.keys()))
n_nuovi = sum(int(erase[ORO[u]].sum()) for u in US)
print(f"utenti {len(US):,} · gold sui film fatti nascere: {n_nuovi:,}")

NS = (10, 100, 500, 2000)
print("")
print("=" * 96)
print("RECUPERO SUI 5.000 FILM FATTI NASCERE (l'unico aggancio sono le keyword)")
print("=" * 96)
print(f"{'grafo':<38} " + " ".join(f"{('@'+str(k)):>10}" for k in NS) + f" {'nativi@500':>12}")
for nome, M in ARMI.items():
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0
    X = E.copy()
    for _ in range(20):
        X = 0.30 * (M.T @ X) + 0.70 * E
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
    riga = []
    for N in NS:
        hit = sum(1 for j, u in enumerate(US)
                  for x in np.argpartition(-X[:, j], N)[:N] if erase[x] and x in ORO[u])
        riga.append(100 * hit / max(n_nuovi, 1))
    hitn = totn = 0
    for j, u in enumerate(US):
        sel = np.argpartition(-X[:, j], 500)[:500]
        sel = sel[[not erase[x] for x in sel]]
        hitn += sum(1 for x in sel if x in ORO[u])
        totn += sum(1 for x in ORO[u] if not erase[x])
    print(f"{nome:<38} " + " ".join(f"{v:9.2f}%" for v in riga) + f" {100*hitn/max(totn,1):11.2f}%"
          + f"   ({time.time()-t0:.0f}s)", flush=True)
print("")
print("  Il riferimento da battere e' E1. E0 e' il nullo: senza keyword un titolo nuovo e' cieco.")
print(f"\n({time.time()-t0:.0f}s)")
