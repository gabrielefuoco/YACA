"""ordine-1.py — LE CARATTERISTICHE PER ORDINARE (calibrazione + verifica).

Il grafo migliore (CF+B+T+K) mette il 77,23% dei film veri nel suo top-2000: il cesto e' buono.
Il problema e' l'ordine: @100 16,19% contro 57,13% di un ordine perfetto.

Qui si estrae, per ogni (utente, candidato del cesto), un vettore di caratteristiche calcolate
SENZA guardare l'oro. Poi il banco degli ordinamenti (`ordine-2.py`) lavora su questo file —
cosi' si provano decine di ordinamenti senza rifare l'attivazione.

Caratteristiche:
  att      punteggio dell'attivazione sul grafo completo (l'ordine attuale)
  att_cf   punteggio dell'attivazione sul solo componente comportamentale CF
  pop      percentile di popolarita' (vote_count TMDB)
  voto     voto medio TMDB
  cos_prof coseno con il centroide del profilo nello spazio dei METADATI
  cf_cent  coseno col centroide del profilo nello spazio del COMPORTAMENTO
  cf_voti  quanti film del profilo "votano" questo candidato (sovrapposizione di vicinato CF)
  toccata  quanti film del profilo stanno nella FOGLIA del candidato
  dim_fog  dimensione della foglia
  grado    grado nel grafo
  anno     distanza in anni dal profilo
  curati   numero di legami scritti a mano sul candidato
  mai_visto  1 se il candidato NON e' fra i vicini di alcun film del profilo (novita')
"""
import json, pathlib, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, coo_matrix

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
CESTONE = 2000

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
tmdb, tipo, votes, year = z["tmdb"], z["tipo"], z["votes"], z["year"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
_a = year.astype(float)
anno = np.where(np.isnan(_a), np.nanmedian(_a), _a)


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


CF = topk_edges(np.load(ML / "cf-spazio.npz")["Cf"], 15)
Kc = topk_edges(np.load(ML / "spazio-pulito.npz")["P"], 15)
B = carica("boot-B.npz")
Tm = carica("boot-T.npz")
K = carica("boot-Kpari.npz")
print(f"componenti pronti ({time.time()-t0:.0f}s)")


def comp(*parti):
    w = 0.40 / len(parti)
    return normalizza((sum(w * p for p in parti) + 0.60 * K).tocsr())


M = comp(Kc, CF, B, Tm)
Mcf = normalizza(CF)
del B, Tm, K

# spazio metadati (per cos_prof) e spazio comportamento (per cf_*)
Pm = np.load(ML / "spazio-pulito.npz")["P"]
q = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pmt = Pm.astype(np.float64).copy()
Pmt[~is_tv] -= Pm[~is_tv].mean(0)
Pmt[is_tv] -= Pm[is_tv].mean(0)
Pmt = Pmt / (np.linalg.norm(Pmt, axis=1, keepdims=True) + 1e-9)
Cfx = np.load(ML / "cf-spazio.npz")["Cf"]
Cfn = Cfx / (np.linalg.norm(Cfx, axis=1, keepdims=True) + 1e-9)
print(f"spazi pronti ({time.time()-t0:.0f}s)")

# foglie e grado
al = json.loads((ML / "albero.json").read_text(encoding="utf-8"))
foglia = np.full(n, -1, np.int64)
for i, f in enumerate(al["foglie"]):
    for k in f["members"]:
        r = row_of.get(k)
        if r is not None:
            foglia[r] = f["id"]
maxf = int(foglia.max()) + 1
dim_fog = np.zeros(maxf, np.int64)
for f in al["foglie"]:
    dim_fog[f["id"]] = f["size"]
dim_di = dim_fog[foglia]
grado = np.asarray((M > 0).sum(1)).ravel()
Kall = carica("boot-Kall.npz")
n_curati = np.asarray((Kall > 0).sum(1)).ravel()
del Kall
pct_pop = (np.argsort(np.argsort(votes.astype(float))) / (n - 1.0)) * 100
avg = np.zeros(n, np.float32)
for typ, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
    df = pd.read_parquet(pathlib.Path(".cache/tmdb") / f, columns=["id", "vote_average"])
    for i, v in zip(df["id"], df["vote_average"]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is not None and v == v:
            avg[r] = float(v)
print(f"struttura pronta ({time.time()-t0:.0f}s)")

# --- utenti: 1.000 calibrazione + 1.000 verifica ---
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


def prepara(utenti):
    sub = rr[rr.userId.isin(set(utenti.tolist()))]
    gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
    prof, oro = {}, {}
    r2 = np.random.default_rng(7)
    for idx, u in enumerate(utenti):
        righe = np.unique(gruppi[u])
        if len(righe) < 20:
            continue
        perm = r2.permutation(len(righe))
        t = int(0.6 * len(righe))
        prof[u] = righe[perm[:t]]
        oro[u] = set(righe[perm[t:]].tolist())
    return prof, oro


COLS = ["colpito", "split", "nodo", "pos_att", "att", "att_cf", "pop", "voto",
        "cos_prof", "cf_cent", "cf_voti", "toccata", "dim_fog", "grado", "anno", "curati"]
ACC = {c: [] for c in COLS}
for nome, utenti in (("calib", CAL), ("verif", VER)):
    PROF, ORO = prepara(utenti)
    US = np.array(list(PROF.keys()))
    E = np.zeros((n, len(US)), np.float32)
    for j, u in enumerate(US):
        E[PROF[u], j] = 1.0
    X = E.copy()
    for _ in range(20):
        X = 0.30 * (M.T @ X) + 0.70 * E
    Y = E.copy()
    for _ in range(20):
        Y = 0.30 * (Mcf.T @ Y) + 0.70 * E
    for j, u in enumerate(US):
        X[PROF[u], j] = -1e9
        Y[PROF[u], j] = -1e9
    for j, u in enumerate(US):
        cest = np.argpartition(-X[:, j], CESTONE)[:CESTONE]
        prof = PROF[u]
        cen = Pmt[prof].sum(0)
        cen = cen / (np.linalg.norm(cen) + 1e-9)
        cfc = Cfn[prof].sum(0)
        cfc = cfc / (np.linalg.norm(cfc) + 1e-9)
        occ = np.bincount(foglia[prof], minlength=maxf)
        anni = np.median(anno[prof])
        cos_p = Pmt[cest] @ cen
        cf_c = Cfn[cest] @ cfc
        cf_v = (Cfn[cest] @ Cfn[prof].T > 0.35).sum(1)
        oro = ORO[u]
        m = len(cest)
        ACC["colpito"].append(np.fromiter((1 if c in oro else 0 for c in cest), np.int8, m))
        ACC["split"].append(np.full(m, 0 if nome == "calib" else 1, np.int8))
        ACC["nodo"].append(cest.astype(np.int32))
        ACC["pos_att"].append(np.arange(m, dtype=np.int32))
        for col, arr in (("att", X[cest, j]), ("att_cf", Y[cest, j]), ("pop", pct_pop[cest]),
                         ("voto", avg[cest]), ("cos_prof", cos_p), ("cf_cent", cf_c),
                         ("cf_voti", cf_v), ("toccata", occ[foglia[cest]]), ("dim_fog", dim_di[cest]),
                         ("grado", grado[cest]), ("anno", np.abs(anno[cest] - anni)),
                         ("curati", n_curati[cest])):
            ACC[col].append(np.asarray(arr, np.float32).ravel())
    print(f"  {nome}: {len(US):,} utenti fatti ({time.time()-t0:.0f}s)", flush=True)

DF = pd.DataFrame({c: np.concatenate(ACC[c]) for c in COLS})
DF.to_parquet(ML / "ordine.parquet")
print("")
print(f"righe {len(DF):,} · colpi {int(DF.colpito.sum()):,} ({100*DF.colpito.mean():.2f}%)")
print(DF.groupby("split").colpito.agg(["size", "sum", "mean"]))
print(f"\n({time.time()-t0:.0f}s)")
