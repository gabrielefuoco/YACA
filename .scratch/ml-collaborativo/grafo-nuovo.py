"""grafo-nuovo.py — QUALE E' IL GRAFO MIGLIORE, con i componenti dichiarati.

Armi (tutte con gli stessi 0,40 di massa non-curatela, distribuiti, e curatela 0,60):

  ATTUALE     Pc(contaminato) + co-visione + temi + curatela     <- il riferimento di oggi
  PULITO      keyword pulite   + co-visione + temi + curatela     <- quanto vale il CONTENUTO davvero
  PULITO+CF   + comportamento esplicito (film), pubblico REALE
  PULITO+CFst + comportamento previsto (tutte le serie comprese)
  CFst solo   senza contenuto: cosa fa il solo pubblico previsto
  TUTTO       pulito + CF + CFst + co-visione + temi + curatela

Metrica: il RECUPERO e' il mestiere del grafo (report 47), quindi si guarda il recall a
profondita' (100/500/2000). Come secondaria, la testa riordinata per popolarita' (il piano).
Calibrazione e verifica SEPARATE su 1.000 + 1.000 utenti, archi costruiti sui 198.948 disgiunti.
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, coo_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo, votes = z["tmdb"], z["tipo"], z["votes"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")


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


# --- componenti ---
C_pc = carica("boot-C.npz")          # contenuto contaminato (l'attuale)
B = carica("boot-B.npz")             # co-visione Trakt
Tm = carica("boot-T.npz")            # temi (puliti)
K = carica("boot-Kpari.npz")         # curatela (solo pari)
print(f"componenti cachati ({time.time()-t0:.0f}s)")

q = np.load(ML / "spazio-pulito.npz")
Kc = topk_edges(q["P"], 15)
print(f"contenuto PULITO: {Kc.nnz:,} archi ({time.time()-t0:.0f}s)")

q = np.load(ML / "cf-spazio.npz")
CF = topk_edges(q["Cf"], 15)
print(f"comportamento CF (film): {CF.nnz:,} archi ({time.time()-t0:.0f}s)")

q = np.load(ML / "cf-studente.npz")
CFst = topk_edges(q["P"], 15)
print(f"pubblico previsto CFst (tutti): {CFst.nnz:,} archi ({time.time()-t0:.0f}s)")

# --- utenti di valutazione: 1.000 calibrazione + 1.000 verifica ---
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
rng = np.random.default_rng(9)
scelti = rng.choice(buoni, size=2000, replace=False)
CAL, VER = scelti[:1000], scelti[1000:]
print(f"calibrazione {len(CAL):,} · verifica {len(VER):,}")


def prepara(utenti):
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
    return prof, oro


PROF_C, ORO_C = prepara(CAL)
PROF_V, ORO_V = prepara(VER)
US_C, US_V = np.array(list(PROF_C.keys())), np.array(list(PROF_V.keys()))
pct_pop = (np.argsort(np.argsort(votes.astype(float))) / (n - 1.0)) * 100
print(f"valutabili: calib {len(US_C):,} · verifica {len(US_V):,} ({time.time()-t0:.0f}s)")

NS = (100, 500, 2000)


def valuta(M, PROF, ORO):
    US = np.array(list(PROF.keys()))
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0
    X = E.copy()
    for _ in range(20):
        X = 0.30 * (M.T @ X) + 0.70 * E
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
    rk = np.empty((n, len(US)), np.int32)
    for j in range(len(US)):
        rk[np.argsort(-X[:, j]), j] = np.arange(n)
    out = {}
    for N in NS:
        tot = hit = 0
        for j, u in enumerate(US):
            sel = np.argpartition(rk[:, j], N)[:N]
            oro = ORO[u]
            hit += sum(1 for x in sel if int(x) in oro)
            tot += len(oro)
        out[N] = 100 * hit / tot
    hit10 = 0
    tot10 = 0
    for j, u in enumerate(US):
        cand = np.argpartition(rk[:, j], 500)[:500]
        cand = cand[np.argsort(-pct_pop[cand])][:10]
        oro = ORO[u]
        hit10 += sum(1 for x in cand if int(x) in oro)
        tot10 += len(oro)
    out["testa pop @10"] = 100 * hit10 / tot10
    del rk
    return out


def comp(*parti):
    """massa non-curatela 0,40 divisa equamente fra le parti, curatela 0,60"""
    w = 0.40 / len(parti)
    M = sum(w * p for p in parti) + 0.60 * K
    return normalizza(M.tocsr())


ARMI = {
    "ATTUALE  Pc+B+T+K": normalizza(0.15 * C_pc + 0.15 * B + 0.10 * Tm + 0.60 * K),
    "PULITO   Kc+B+T+K": comp(Kc, B, Tm),
    "PULITO+CF  Kc+CF+B+T+K": comp(Kc, CF, B, Tm),
    "PULITO+CFst Kc+CFst+B+T+K": comp(Kc, CFst, B, Tm),
    "CFst solo  CFst+B+T+K": comp(CFst, B, Tm),
    "TUTTO  Kc+CF+CFst+B+T+K": comp(Kc, CF, CFst, B, Tm),
}
del C_pc

print("")
print("=" * 108)
print(f"{'grafo':<28} {'CALIBRAZIONE':^38} {'VERIFICA':^38}")
print(f"{'':<28} " + " ".join(f"{('@'+str(k)):>7}" for k in NS) + f" {'testa':>8} " +
      " ".join(f"{('@'+str(k)):>7}" for k in NS) + f" {'testa':>8}")
print("=" * 108)
for nome, M in ARMI.items():
    a = valuta(M, PROF_C, ORO_C)
    b = valuta(M, PROF_V, ORO_V)
    print(f"{nome:<28} " + " ".join(f"{a[k]:6.2f}%" for k in NS) + f" {a['testa pop @10']:7.2f}% " +
          " ".join(f"{b[k]:6.2f}%" for k in NS) + f" {b['testa pop @10']:7.2f}%")
    print(f"{'':<28}   ({time.time()-t0:.0f}s)")
print("")
print("  Il riferimento da battere e' la riga ATTUALE. Ma la riga PULITO e' l'unica che dice")
print("  quanto vale il CONTENUTO davvero: le altre righe non hanno nulla di contaminato.")
print(f"\n({time.time()-t0:.0f}s)")
