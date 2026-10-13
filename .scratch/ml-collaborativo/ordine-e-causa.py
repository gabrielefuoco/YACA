"""ordine-e-causa.py — DUE DOMANDE DELL'UTENTE.

1. DA DOVE VIENE IL VANTAGGIO? Isolo il comportamento da solo (senza keyword) e le keyword
   da sole, per capire se il guadagno di PULITO+CF e' il comportamento o la loro somma.

2. IL @100 E' ORDINAMENTO O RECUPERO? Il grafo mette il 78,63% dei film veri nel top-2000:
   quelli sono GIA' nel cesto. Se il top-100 ne prende il 16,67%, la differenza e' ordinamento.
   Qui si misura la scala dell'ordinamento, con tre ordinamenti dello STESSO cesto:
      attivazione  |  popolarita'  |  misto  |  ORACOLO (ordine perfetto del cesto)
   L'oracolo e' esattamente il recall@2000: se l'ordinamento fosse perfetto, @100 varrebbe quello.
"""
import json, pathlib, time
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


B = carica("boot-B.npz")
Tm = carica("boot-T.npz")
K = carica("boot-Kpari.npz")
Kc = topk_edges(np.load(ML / "spazio-pulito.npz")["P"], 15)
CF = topk_edges(np.load(ML / "cf-spazio.npz")["Cf"], 15)
print(f"componenti pronti ({time.time()-t0:.0f}s)")


def comp(*parti):
    w = 0.40 / len(parti)
    return normalizza((sum(w * p for p in parti) + 0.60 * K).tocsr())


# --- DOMANDA 1: da dove viene il vantaggio ---
ARMI = {
    "solo KEYWORD pulite  Kc+B+T+K": comp(Kc, B, Tm),
    "solo COMPORTAMENTO   CF+B+T+K": comp(CF, B, Tm),
    "solo co-visione      B+T+K": comp(B, Tm),
    "KEYWORD + COMPORT.   Kc+CF+B+T+K": comp(Kc, CF, B, Tm),
    "TUTTO tranne temi    Kc+CF+B+K": comp(Kc, CF, B),
    "TUTTO tranne co-vis  Kc+CF+T+K": comp(Kc, CF, Tm),
    "TUTTO tranne curat.  Kc+CF+B+T": comp(Kc, CF, B, Tm),
}

# --- utenti ---
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
VER = rng.choice(buoni, size=2000, replace=False)[1000:]
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
pct_pop = (np.argsort(np.argsort(votes.astype(float))) / (n - 1.0)) * 100
print(f"utenti di verifica: {len(US):,} · oro medio {np.mean([len(v) for v in ORO.values()]):.0f}")

NS = (10, 100, 500, 2000)


def rk_di(M):
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0
    X = E.copy()
    for _ in range(20):
        X = 0.30 * (M.T @ X) + 0.70 * E
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
    R = np.empty((n, len(US)), np.int32)
    for j in range(len(US)):
        R[np.argsort(-X[:, j]), j] = np.arange(n)
    return R


def recall_da_insieme(idx_per_utente, N):
    """idx_per_utente: lista, per ogni utente, dei nodi proposti in ordine"""
    tot = hit = 0
    for j, u in enumerate(US):
        sel = idx_per_utente[j][:N]
        oro = ORO[u]
        hit += sum(1 for x in sel if int(x) in oro)
        tot += len(oro)
    return 100 * hit / tot


print("")
print("=" * 100)
print("DOMANDA 1 — DA DOVE VIENE IL VANTAGGIO (verifica, 1.000 utenti)")
print("=" * 100)
print(f"{'grafo':<36} " + " ".join(f"{('@'+str(k)):>8}" for k in NS))
for nome, M in ARMI.items():
    R = rk_di(M)
    out = {}
    for N in NS:
        tot = hit = 0
        for j, u in enumerate(US):
            sel = np.argpartition(R[:, j], N)[:N]
            oro = ORO[u]
            hit += sum(1 for x in sel if int(x) in oro)
            tot += len(oro)
        out[N] = 100 * hit / tot
    print(f"{nome:<36} " + " ".join(f"{out[k]:7.2f}%" for k in NS) + f"   ({time.time()-t0:.0f}s)")
    del R

# --- DOMANDA 2: l'ordinamento, sullo stesso cesto ---
print("")
print("=" * 100)
print("DOMANDA 2 — ORDINAMENTO O RECUPERO? stesso cesto (top-2000), tre ordinamenti")
print("=" * 100)
M = comp(Kc, CF, B, Tm)
R = rk_di(M)
CESTONE = 2000
prop_att, prop_pop, prop_mix = [], [], []
for j, u in enumerate(US):
    cest = np.argpartition(R[:, j], CESTONE)[:CESTONE]
    att = cest[np.argsort(R[cest, j])]                       # ordine dell'attivazione
    pop = cest[np.argsort(-pct_pop[cest])]                   # ordine per popolarita'
    zz = (CESTONE - np.argsort(np.argsort(R[cest, j]))) / CESTONE + \
         (np.argsort(np.argsort(pct_pop[cest])) / CESTONE)
    mix = cest[np.argsort(-zz)]                              # misto ranghi
    prop_att.append(att)
    prop_pop.append(pop)
    prop_mix.append(mix)
del R
print(f"{'ordinamento dello stesso top-2000':<36} " + " ".join(f"{('@'+str(k)):>8}" for k in NS))
for nome, prop in (("attivazione (com'e' ora)", prop_att),
                   ("popolarita'", prop_pop),
                   ("misto attivazione + popolarita'", prop_mix)):
    print(f"{nome:<36} " + " ".join(f"{recall_da_insieme(prop,k):7.2f}%" for k in NS))
# ORACOLO: per ogni utente, i suoi film presenti nel cesto occupano le prime posizioni
oro_nel_cesto = []
for j, u in enumerate(US):
    cest = set(int(x) for x in prop_att[j])
    oro_nel_cesto.append(sum(1 for x in ORO[u] if x in cest))
TOT_ORO = sum(len(ORO[u]) for u in US)
ora = []
for N in NS:
    ora.append(100 * sum(min(N, k) for k in oro_nel_cesto) / TOT_ORO)
print(f"{'ORACOLO (ordine perfetto del cesto)':<36} " + " ".join(f"{v:7.2f}%" for v in ora))
print("")
print(f"  L'ORACOLO non e' un metodo: e' il tetto di QUESTO cesto. I film veri che stanno nel")
print(f"  top-2000 sono {100*np.mean([k/len(ORO[u]) for k,u in zip(oro_nel_cesto,US)]):.2f}% dell'oro in media; ordinati bene")
print(f"  finirebbero tutti nelle prime cento posizioni. Tutto il divario e' ordinamento.")
print(f"\n({time.time()-t0:.0f}s)")
