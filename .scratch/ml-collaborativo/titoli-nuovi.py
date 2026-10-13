"""titoli-nuovi.py — LE KEYWORD REGGONO UN TITOLO SENZA COMPORTAMENTO?

La tesi dell'utente: «le keyword sono il meccanismo piu' utile per film e serie che non hanno
dati di comportamento, anzi in parte sono l'unico indicatore. Poi basta che si ancorano a un
cluster che ha gia' un suo storico e tutto cambia e migliora».

La mia misura precedente NON poteva vederlo: il gold di MovieLens e' fatto di film che MovieLens
conosce, quindi ogni film valutato ha comportamento. Qui si simula davvero un titolo nuovo.

Disegno: si scelgono 5.000 FILM CON comportamento e si cancella loro tutto cio' che un titolo
nuovo non ha — CF, co-visione Trakt, curatela. Restano keyword e temi (che si derivano dai
metadati: un titolo nuovo li ha). Poi si misura il recupero sui SOLI film cancellati:
  - con le keyword   -> l'aggancio funziona?
  - senza le keyword -> il nullo: resterebbero solo i temi (e per i film, niente)
Riferimento: il recupero sugli stessi utenti per i film NON cancellati (il costo di essere nuovi).
"""
import json, pathlib, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, coo_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
N_ERASE = 5000

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo, votes = z["tmdb"], z["tipo"], z["votes"]
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


# --- i 5.000 film da "far nascere" ---
Cf = np.load(ML / "cf-spazio.npz")["Cf"]
con_beh = np.where(np.linalg.norm(Cf, axis=1) > 1e-6)[0]
rng = np.random.default_rng(41)
ERASE = rng.choice(con_beh, size=N_ERASE, replace=False)
erase = np.zeros(n, bool)
erase[ERASE] = True
print(f"film con comportamento: {len(con_beh):,} · ne faccio nascere {N_ERASE:,} ({time.time()-t0:.0f}s)")

# --- componenti, con il comportamento cancellato ai nuovi ---
Cf2 = Cf.copy()
Cf2[erase] = 0.0
CF2 = topk_edges(Cf2, 15)
print(f"CF senza i nuovi: {CF2.nnz:,} archi ({time.time()-t0:.0f}s)")
CF_full = topk_edges(Cf, 15)
print(f"CF completo:      {CF_full.nnz:,} archi ({time.time()-t0:.0f}s)")

Kc = topk_edges(np.load(ML / "spazio-pulito.npz")["P"], 15)
Tm = carica("boot-T.npz")


def maschera(A, film):
    """toglie gli archi ai film indicati (un titolo nuovo non ha quegli archi)"""
    A = A.tolil()
    A[film, :] = 0
    A[:, film] = 0
    return normalizza(A.tocsr())


B_full = carica("boot-B.npz")
K_full = carica("boot-Kpari.npz")
B2 = maschera(B_full, ERASE)
K2 = maschera(K_full, ERASE)
print(f"co-visione e curatela mascherate ({time.time()-t0:.0f}s)")


def comp(*parti):
    w = 0.40 / len(parti)
    return normalizza((sum(w * p for p in parti) + 0.60 * K_full).tocsr())


def comp2(*parti):
    w = 0.40 / len(parti)
    return normalizza((sum(w * p for p in parti) + 0.60 * K2).tocsr())


ARMI = {
    "TUTTI NATIVI (riferimento)": comp(Kc, CF_full, B_full, Tm),
    "5.000 NUOVI · con keyword": comp2(Kc, CF2, B2, Tm),
    "5.000 NUOVI · SENZA keyword": comp2(CF2, B2, Tm),
}
del CF_full

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
rng2 = np.random.default_rng(9)
VER = rng2.choice(buoni, size=2000, replace=False)[1000:]
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
n_oro_nuovi = sum(int(erase[ORO[u]].sum()) for u in US)
n_oro_nativi = sum(len(ORO[u]) for u in US) - n_oro_nuovi
print(f"utenti {len(US):,} · oro: {n_oro_nuovi:,} film NUOVI · {n_oro_nativi:,} nativi")

NS = (10, 100, 500, 2000)
print("")
print("=" * 104)
print("RECUPERO SUI FILM FATTI NASCERE — l'unico aggancio sono keyword e temi")
print("=" * 104)
print(f"{'grafo':<34} " + " ".join(f"{('NUOVI @'+str(k)):>11}" for k in NS) + f" {'nativi @500':>12}")
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
        hit = 0
        for j, u in enumerate(US):
            sel = np.argpartition(-X[:, j], N)[:N]
            hit += sum(1 for x in sel if erase[x] and x in ORO[u])
        riga.append(100 * hit / max(n_oro_nuovi, 1))
    # i nativi, per riferimento
    hitn = 0
    totn = 0
    for j, u in enumerate(US):
        sel = np.argpartition(-X[:, j], 500)[:500]
        sel = sel[[not erase[x] for x in sel]]
        hitn += sum(1 for x in sel if x in ORO[u])
        totn += sum(1 for x in ORO[u] if not erase[x])
    print(f"{nome:<34} " + " ".join(f"{v:10.2f}%" for v in riga) + f" {100*hitn/max(totn,1):11.2f}%"
          + f"   ({time.time()-t0:.0f}s)")
print("")
print("  lettura: 'NUOVI @N' = quanti dei film fatti nascere vengono ritrovati fra i primi N.")
print("  La riga 'SENZA keyword' e' il nullo: senza di esse un titolo nuovo e' irraggiungibile.")
print(f"\n({time.time()-t0:.0f}s)")
