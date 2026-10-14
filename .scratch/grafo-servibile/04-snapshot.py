"""04-snapshot.py — TICKET 04: il grafo a tempo T_cut.

Il ticket 03 ha mascherato la propagazione dei titoli freschi e ha trovato che il segno della
perdita e' INVERTITO (la mascherata va meglio). Ma il mascheramento e' sulla propagazione: `CF`
resta costruito su cronologie COMPLETE. Qui si fa il livello 2 — **una sola ricostruzione dello
spazio del comportamento sul passato**, e la validazione degli utenti successivi alla data di taglio.

SE T_cut: il 75° percentile dei timestamp delle interazioni (una sola data per tutti, un solo build,
zero rifacimenti).

E il confronto che conta: i due livelli **concordano in direzione?** Se il livello 2 dice la stessa
cosa del livello 1 (la mascherata va meglio), allora la conclusione del ticket 03 e' confermata su
un grafo che davvero non conosce il futuro. Se dice l'opposto, il ticket 03 aveva misurato
l'effetto di una maschera, non di un grafo onesto — e va riscritto.

Uso:  python .scratch/grafo-servibile/04-snapshot.py
"""
import pathlib, sys, time
import numpy as np
import pandas as pd
import scipy.sparse as sp
from scipy.sparse.linalg import svds

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

DIM = 128
GIORNO = 86_400
NS = (10, 100, 500, 2000)
t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
voti = K.voti()
uscite = np.load(K.ML / "uscite.npz")["giorni"]
fas_film = np.full(n, -1, np.int8)
fas_film[IDX_FILM] = K.fasce(voti[IDX_FILM])
si_film = np.zeros(n)
si_film[IDX_FILM] = K.auto_informazione(voti[IDX_FILM])

# ------------------------------------------------------------------ 1. le interazioni con le DATE
CACHE = K.ML / "interazioni-con-date.parquet"
if CACHE.exists():
    RR = pd.read_parquet(CACHE)
    print(f"interazioni da cache: {len(RR):,} ({time.time()-t0:.0f}s)")
else:
    print("leggo ratings.csv (836 MB, una volta sola) ...", flush=True)
    links = pd.read_csv(K.ML / "ml-32m" / "links.csv")
    m2r = {}
    for mid, tid in zip(links["movieId"], links["tmdbId"]):
        if pd.isna(tid):
            continue
        r = row_of.get(f"movie:{int(tid)}")
        if r is not None:
            m2r[int(mid)] = r
    pezzi = []
    for ch in pd.read_csv(K.ML / "ml-32m" / "ratings.csv", usecols=["userId", "movieId", "timestamp"],
                          dtype={"userId": np.int32, "movieId": np.int32, "timestamp": np.int64},
                          chunksize=4_000_000):
        ch["row"] = ch.movieId.map(m2r)
        ch = ch.dropna(subset=["row"])
        if len(ch):
            ch["row"] = ch["row"].astype(np.int64)
            pezzi.append(ch[["userId", "row", "timestamp"]])
    RR = pd.concat(pezzi)
    RR.to_parquet(CACHE)
    print(f"  salvato: {len(RR):,} interazioni con data ({time.time()-t0:.0f}s)", flush=True)

# ------------------------------------------------------------------ 2. T_cut e lo split
buoni = RR.groupby("userId").size()
buoni = buoni[buoni >= 20].index.values
eval_u = set(np.random.default_rng(9).choice(buoni, size=2000, replace=False).tolist())
te = RR[~RR.userId.isin(eval_u)]
T_CUT = int(np.quantile(te.timestamp.values, 0.75))
print("")
print("=" * 100)
print("LA DATA DI TAGLIO")
print("=" * 100)
print(f"  interazioni di training (utenti disgiunti dai 2.000 di valutazione): {len(te):,}")
print(f"  T_cut = 75° percentile = {pd.to_datetime(T_CUT, unit='s')}")
print(f"  interazioni PRIMA di T_cut: {int((te.timestamp < T_CUT).sum()):,} "
      f"({100*(te.timestamp < T_CUT).mean():.1f}%)")

# ------------------------------------------------------------------ 3. UN SOLO rebuild
CF_CACHE = K.ML / "cf-spazio-Tcut.npz"
if CF_CACHE.exists():
    Cf = np.load(CF_CACHE)["Cf"]
    print(f"\n  CF a T_cut da cache: {Cf.shape}")
else:
    p = te[te.timestamp < T_CUT]
    u = p.userId.to_numpy(np.int64)
    f = p.row.to_numpy(np.int64)
    uu, ui = np.unique(u, return_inverse=True)
    X = sp.csr_matrix((np.ones(len(ui), np.float32), (ui, f)), shape=(len(uu), n))
    X.sum_duplicates()
    X.data[:] = 1.0
    c_i = np.asarray(X.sum(0)).ravel()
    film = np.where(c_i > 0)[0]
    print(f"  matrice utenti x film a T_cut: {X.shape} · nnz {X.nnz:,} · "
          f"film coperti {len(film):,} ({time.time()-t0:.0f}s)", flush=True)
    Xs = X[:, film].multiply((1.0 / np.log1p(np.maximum(c_i[film], 1)))[None, :]).tocsr()
    U, S, Vt = svds(Xs, k=DIM)
    Z = Vt.T / (np.linalg.norm(Vt.T, axis=1, keepdims=True) + 1e-9)
    Cf = np.zeros((n, DIM), np.float32)
    Cf[film] = Z
    np.savez_compressed(CF_CACHE, Cf=Cf, film=film)
    print(f"  CF a T_cut: {Cf.shape} · film con vettore {len(film):,} ({time.time()-t0:.0f}s)", flush=True)

Cf0 = np.load(K.ML / "cf-spazio.npz")["Cf"]
coperti = (np.linalg.norm(Cf0, axis=1) > 0) & (np.linalg.norm(Cf, axis=1) > 0)
cos = np.einsum("ij,ij->i", Cf0[coperti], Cf[coperti]) / (
    np.linalg.norm(Cf0[coperti], axis=1) * np.linalg.norm(Cf[coperti], axis=1) + 1e-9)
print(f"  confronto coi vettori completi: coseno mediano {np.median(cos):.3f} · "
      f"film coperti da entrambi {int(coperti.sum()):,}")

# ------------------------------------------------------------------ 4. la camminata con il grafo onesto
CMP = K.Componenti(n)
Cf_norm = Cf / (np.linalg.norm(Cf, axis=1, keepdims=True) + 1e-9)
CF_knn = K.topk_edges(Cf_norm, 30)
M = K.normalizza(K.correggi_hub(CF_knn, 0.25))
print(f"  grafo FILM a T_cut: {M.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)

RRm = pd.read_parquet(K.ML / "tempi-ml.parquet")
PROF, ORO, TU, TE = {}, {}, {}, {}
for u, g in RRm.groupby("userId"):
    g = g.sort_values("timestamp")
    righe = g["row"].values.astype(np.int64)
    ts = g["timestamp"].values.astype(np.int64)
    if len(righe) < 20:
        continue
    t = int(0.6 * len(righe))
    PROF[u] = righe[:t]
    ORO[u] = set(righe[t:].tolist())
    TU[u] = ts[t - 1]
    TE[u] = ts[-1]
US = np.array([u for u in PROF if TE[u] > T_CUT])       # gli utenti DOPO il taglio
print(f"  utenti con oro dopo T_cut: {len(US):,} su {len(PROF):,}")
if len(US) == 0:
    sys.exit("nessun utente dopo T_cut: la data di taglio e' oltre le loro storie")
lim = np.array([TU[u] // GIORNO - 90 for u in US])
fine = np.array([TE[u] // GIORNO for u in US])
VIVO = (uscite[:, None] <= lim[None, :]) | (uscite[:, None] < 0)
ESCL = uscite[:, None] > fine[None, :]

E = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    E[PROF[u], j] = 1.0
X = E.copy()
for _ in range(20):
    X = 0.30 * (M.T @ (VIVO * X)) + 0.70 * E
for j, u in enumerate(US):
    X[PROF[u], j] = -1e9
    X[ESCL[:, j], j] = -1e9
R = K.ranghi(X, ~is_tv)
print("")
print("=" * 100)
print("L'ESITO — il grafo ricostruito a T_cut, sugli utenti dopo il taglio")
print("=" * 100)
g = K.recall_film(R, US, PROF, ORO, IDX_FILM, NS)
K.stampa("grafo a T_cut (CF dal solo passato)", g)
rk, fb, si = [], [], []
for j, u in enumerate(US):
    gg = np.fromiter(ORO[u], np.int64, len(ORO[u]))
    rk.append(R[gg, j]); fb.append(fas_film[gg]); si.append(si_film[gg])
rk, fb, si = np.concatenate(rk), np.concatenate(fb), np.concatenate(si)
mc = K.per_fascia(rk, fb, NS)["mezzo+coda"]
ainf = K.recall_si(rk, si, 1.0, NS)
print(f"  {'mezzo+coda':<46} " + " · ".join(f"@{N} {mc[N]:6.2f}%" for N in NS))
print(f"  {'auto-informazione (γ=1)':<46} " + " · ".join(f"@{N} {ainf[N]:6.2f}%" for N in NS))

# il controllo: lo stesso grafo COMPLETO, sugli stessi utenti, con lo stesso mascheramento
Cf0_norm = Cf0 / (np.linalg.norm(Cf0, axis=1, keepdims=True) + 1e-9)
M0 = K.normalizza(K.correggi_hub(K.topk_edges(Cf0_norm, 30), 0.25))
X0 = E.copy()
for _ in range(20):
    X0 = 0.30 * (M0.T @ (VIVO * X0)) + 0.70 * E
for j, u in enumerate(US):
    X0[PROF[u], j] = -1e9
    X0[ESCL[:, j], j] = -1e9
g0 = K.recall_film(K.ranghi(X0, ~is_tv), US, PROF, ORO, IDX_FILM, NS)
K.stampa("grafo COMPLETO (conosce il futuro) + mascheramento", g0)
print("")
print(f"  {'':<46} " + " ".join(f"{'@' + str(N):>9}" for N in NS))
print(f"  {'T_cut - completo':<46} " + " ".join(f"{g[N]-g0[N]:>+9.2f}" for N in NS))
print("")
print(f"  Riferimento (ticket 03, tutti gli utenti, mascherata - non mascherata):")
print(f"    -0,02 / -0,72 / -1,64 / -1,01  (negativo = la mascherata andava MEGLIO)")
print(f"\nFINE ({time.time()-t0:.0f}s)")
